//! Todos service — shared task list for the team.

use chat_types::ChatError;
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{Mergeable, UnorderedMap};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Task {
    pub id: String,
    pub author: String,
    pub description: String,
    pub done: bool,
    pub created_at: u64,
    /// Monotonic ms timestamp of the last toggle; used for LWW merge of `done`.
    /// Starts at 0 (task not yet toggled). Never exposed as a spec field but
    /// included in serialization so peers can resolve concurrent toggles correctly.
    pub toggled_at_ms: u64,
}

impl Mergeable for Task {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // description: LWW — keep the version with the higher creation time
        // (edits bump created_at is not ideal; use description length as tiebreak).
        // If both were edited concurrently, longer description wins.
        if other.description.len() > self.description.len() {
            self.description = other.description.clone();
        }
        // done: strict LWW via toggled_at_ms — the toggle with the highest
        // timestamp wins. This is monotonic: once node A's toggle is the latest,
        // merging any older state from node B cannot revert it.
        if other.toggled_at_ms > self.toggled_at_ms {
            self.done = other.done;
            self.toggled_at_ms = other.toggled_at_ms;
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
pub struct TodosState {
    tasks: UnorderedMap<String, Task>,
}

#[app::logic]
impl TodosState {
    #[app::init]
    pub fn init() -> TodosState {
        TodosState {
            tasks: UnorderedMap::new_with_field_name("todos:tasks"),
        }
    }

    // ---- Mutating methods ----

    /// Add a new task. Returns the generated task id.
    pub fn add_task(&mut self, description: String) -> app::Result<String> {
        if description.trim().is_empty() {
            app::bail!(ChatError::Invalid("description must not be empty".into()));
        }

        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;
        let id = format!("task-{}", now_ms);

        let task = Task {
            id: id.clone(),
            author: caller,
            description,
            done: false,
            created_at: now_ms,
            toggled_at_ms: 0,
        };

        self.tasks
            .insert(id.clone(), task)
            .map_err(|e| AppError::msg(format!("tasks.insert: {e}")))?;

        app::emit!(Event::TaskAdded { id: &id });
        Ok(id)
    }

    /// Toggle a task's done/open status. Any team member may call this.
    pub fn toggle_task(&mut self, task_id: String) -> app::Result<()> {
        let task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .map(|v| v.clone())
            .ok_or_else(|| AppError::msg(ChatError::NotFound(task_id.clone()).to_string()))?;

        let now_ms = storage_env::time_now() / 1_000_000;
        let updated = Task {
            done: !task.done,
            toggled_at_ms: now_ms,
            ..task
        };

        // UnorderedMap has no `update` — remove then re-insert is the upsert pattern.
        self.tasks
            .remove(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.remove(toggle): {e}")))?;
        self.tasks
            .insert(task_id.clone(), updated)
            .map_err(|e| AppError::msg(format!("tasks.insert(toggle): {e}")))?;

        app::emit!(Event::TaskToggled { id: &task_id });
        Ok(())
    }

    /// Edit a task's description. Only the task's original author may do this.
    pub fn edit_task(&mut self, task_id: String, new_description: String) -> app::Result<()> {
        if new_description.trim().is_empty() {
            app::bail!(ChatError::Invalid("description must not be empty".into()));
        }

        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();

        let task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .map(|v| v.clone())
            .ok_or_else(|| AppError::msg(ChatError::NotFound(task_id.clone()).to_string()))?;

        if task.author != caller {
            app::bail!(ChatError::Forbidden(
                "only the task author may edit this task".into()
            ));
        }

        let updated = Task {
            description: new_description,
            ..task
        };

        // UnorderedMap has no `update` — remove then re-insert is the upsert pattern.
        self.tasks
            .remove(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.remove(edit): {e}")))?;
        self.tasks
            .insert(task_id.clone(), updated)
            .map_err(|e| AppError::msg(format!("tasks.insert(edit): {e}")))?;

        app::emit!(Event::TaskEdited { id: &task_id });
        Ok(())
    }

    /// Delete a task. Only the task's original author may do this.
    pub fn delete_task(&mut self, task_id: String) -> app::Result<()> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();

        let task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .map(|v| v.clone())
            .ok_or_else(|| AppError::msg(ChatError::NotFound(task_id.clone()).to_string()))?;

        if task.author != caller {
            app::bail!(ChatError::Forbidden(
                "only the task author may delete this task".into()
            ));
        }

        self.tasks
            .remove(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.remove: {e}")))?;

        app::emit!(Event::TaskDeleted { id: &task_id });
        Ok(())
    }

    // ---- View methods ----

    /// Return all tasks: open ones first (by created_at asc), done ones below.
    pub fn list_tasks(&self) -> app::Result<Vec<Task>> {
        let entries = self
            .tasks
            .entries()
            .map_err(|e| AppError::msg(format!("tasks.entries: {e}")))?;

        let mut tasks: Vec<Task> = entries.map(|(_, v)| v).collect();

        // Group: open first, done below; within each group sort by created_at ascending.
        tasks.sort_by(|a, b| {
            a.done
                .cmp(&b.done)
                .then_with(|| a.created_at.cmp(&b.created_at))
        });

        Ok(tasks)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn task_merge_keeps_longer_description() {
        let mut a = Task {
            id: "t1".into(),
            author: "alice".into(),
            description: "short".into(),
            done: false,
            created_at: 1,
            toggled_at_ms: 0,
        };
        let b = Task {
            id: "t1".into(),
            author: "alice".into(),
            description: "much longer description".into(),
            done: false,
            created_at: 1,
            toggled_at_ms: 0,
        };
        a.merge(&b).unwrap();
        assert_eq!(a.description, "much longer description");
    }

    #[test]
    fn task_merge_done_lww_higher_timestamp_wins() {
        // Toggle on node-1 (higher timestamp) must survive merge from node-2 (lower ts).
        let mut a = Task {
            id: "t1".into(),
            author: "alice".into(),
            description: "task".into(),
            done: false,
            created_at: 1,
            toggled_at_ms: 0,
        };
        let b = Task {
            id: "t1".into(),
            author: "alice".into(),
            description: "task".into(),
            done: true,
            created_at: 1,
            toggled_at_ms: 1000,
        };
        // Merge: b has higher toggled_at_ms → a should adopt done=true.
        a.merge(&b).unwrap();
        assert!(a.done);
        assert_eq!(a.toggled_at_ms, 1000);
    }

    #[test]
    fn task_merge_done_older_toggle_cannot_revert() {
        // Node-1 toggled at t=1000 (done=true); node-2 still at t=0 (done=false).
        // Merging node-2's stale state into node-1 must NOT revert done.
        let mut a = Task {
            id: "t1".into(),
            author: "alice".into(),
            description: "task".into(),
            done: true,
            created_at: 1,
            toggled_at_ms: 1000,
        };
        let b = Task {
            id: "t1".into(),
            author: "alice".into(),
            description: "task".into(),
            done: false,
            created_at: 1,
            toggled_at_ms: 0,
        };
        a.merge(&b).unwrap();
        assert!(a.done, "stale merge must not revert the toggle");
        assert_eq!(a.toggled_at_ms, 1000);
    }
}
