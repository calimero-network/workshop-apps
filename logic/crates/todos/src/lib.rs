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
}

impl Mergeable for Task {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // description: keep the longer one (proxy for "most recently edited")
        if other.description.len() > self.description.len() {
            self.description = other.description.clone();
        }
        // done: no shared timestamp — last-write-wins via storage; take other's
        // value when they differ so concurrent toggles resolve deterministically.
        if self.done != other.done {
            self.done = other.done;
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

        let updated = Task {
            done: !task.done,
            ..task
        };

        self.tasks
            .update(&task_id, updated)
            .map_err(|e| AppError::msg(format!("tasks.update: {e}")))?;

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

        self.tasks
            .update(&task_id, updated)
            .map_err(|e| AppError::msg(format!("tasks.update: {e}")))?;

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
        };
        let b = Task {
            id: "t1".into(),
            author: "alice".into(),
            description: "much longer description".into(),
            done: false,
            created_at: 1,
        };
        a.merge(&b).unwrap();
        assert_eq!(a.description, "much longer description");
    }

    #[test]
    fn task_merge_done_takes_other() {
        let mut a = Task {
            id: "t1".into(),
            author: "alice".into(),
            description: "task".into(),
            done: false,
            created_at: 1,
        };
        let b = Task {
            id: "t1".into(),
            author: "alice".into(),
            description: "task".into(),
            done: true,
            created_at: 1,
        };
        a.merge(&b).unwrap();
        assert!(a.done);
    }
}
