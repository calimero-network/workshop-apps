//! Todolist service — shared task list for team collaboration.

use chat_types::generate_id;
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

/// A shared task visible to all team members.
///
/// `ownership: shared` → stored in `UnorderedMap<String, Task>`.
/// `updated_at_ms` is an internal field used for last-write-wins merge.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub completed: bool,
    pub assigned_to: Option<String>,
    pub created_by: String,
    /// Milliseconds since epoch (storage_env::time_now() / 1_000_000).
    pub created_at: u64,
    /// Internal LWW clock: the last mutation timestamp in ms.
    /// Not part of the public spec fields but required for correct merge.
    pub updated_at_ms: u64,
}

/// Last-write-wins merge for concurrent task mutations.
///
/// Immutable fields (`id`, `title`, `created_by`, `created_at`) are never
/// overwritten. Mutable fields (`completed`, `assigned_to`, `updated_at_ms`)
/// are replaced when the incoming entry is strictly newer.
impl Mergeable for Task {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if other.updated_at_ms > self.updated_at_ms {
            self.completed = other.completed;
            self.assigned_to = other.assigned_to.clone();
            self.updated_at_ms = other.updated_at_ms;
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct TodoState {
    tasks: UnorderedMap<String, Task>,
}

// ---------------------------------------------------------------------------
// Logic
// ---------------------------------------------------------------------------

#[app::logic]
impl TodoState {
    #[app::init]
    pub fn init() -> TodoState {
        TodoState {
            tasks: UnorderedMap::new_with_field_name("todolist:tasks"),
        }
    }

    // ---- Mutating methods ----

    /// Add a new task to the shared list. Returns the generated task id.
    pub fn create_task(&mut self, title: String) -> app::Result<String> {
        if title.is_empty() {
            app::bail!(AppError::msg("title must not be empty"));
        }

        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;

        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let id = generate_id("task", now_ms, &nonce);

        let task = Task {
            id: id.clone(),
            title,
            completed: false,
            assigned_to: None,
            created_by: caller,
            created_at: now_ms,
            updated_at_ms: now_ms,
        };

        self.tasks
            .insert(id.clone(), task)
            .map_err(|e| AppError::msg(format!("tasks.insert: {e}")))?;

        app::emit!(Event::TaskCreated { id: &id });
        Ok(id)
    }

    /// Toggle a task's completed state. Emits TaskToggled with the new value.
    pub fn toggle_task(&mut self, id: String) -> app::Result<()> {
        let mut task = self
            .tasks
            .get(&id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("task not found: {id}")))?;

        let now_ms = storage_env::time_now() / 1_000_000;
        task.completed = !task.completed;
        task.updated_at_ms = now_ms;
        let completed = task.completed;

        self.tasks
            .insert(id.clone(), task)
            .map_err(|e| AppError::msg(format!("tasks.insert(toggle): {e}")))?;

        app::emit!(Event::TaskToggled { id: &id, completed });
        Ok(())
    }

    /// Set or clear the assignee for a task.
    pub fn assign_task(&mut self, id: String, assignee: Option<String>) -> app::Result<()> {
        let mut task = self
            .tasks
            .get(&id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("task not found: {id}")))?;

        let now_ms = storage_env::time_now() / 1_000_000;
        task.assigned_to = assignee;
        task.updated_at_ms = now_ms;

        self.tasks
            .insert(id.clone(), task)
            .map_err(|e| AppError::msg(format!("tasks.insert(assign): {e}")))?;

        app::emit!(Event::TaskAssigned { id: &id });
        Ok(())
    }

    /// Remove a task permanently.
    pub fn delete_task(&mut self, id: String) -> app::Result<()> {
        let exists = self
            .tasks
            .contains(&id)
            .map_err(|e| AppError::msg(format!("tasks.contains: {e}")))?;
        if !exists {
            app::bail!(AppError::msg(format!("task not found: {id}")));
        }

        self.tasks
            .remove(&id)
            .map_err(|e| AppError::msg(format!("tasks.remove: {e}")))?;

        app::emit!(Event::TaskDeleted { id: &id });
        Ok(())
    }

    // ---- View methods ----

    /// Return all tasks sorted by creation time (oldest first).
    pub fn list_tasks(&self) -> app::Result<Vec<Task>> {
        let entries = self
            .tasks
            .entries()
            .map_err(|e| AppError::msg(format!("tasks.entries: {e}")))?;
        let mut tasks: Vec<Task> = entries.map(|(_, v)| v).collect();
        tasks.sort_by_key(|t| t.created_at);
        Ok(tasks)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_creates_empty_state() {
        let state = TodoState::init();
        // UnorderedMap has no len() we can call in tests without storage,
        // but construction itself must not panic.
        let _ = state;
    }
}
