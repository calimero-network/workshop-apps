//! Todolist service — shared team task list with per-author ownership.

use chat_types::{generate_id, ChatError};
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{AuthoredMap, Mergeable};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

/// Maximum task description length in Unicode scalar values.
const MAX_DESC_LEN: usize = 512;

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
    /// Deterministic tiebreak for concurrent writes by the same author.
    /// Prefers `done = true` (completion is monotonic). On equal done,
    /// prefers the lexicographically greater description as a stable tiebreak.
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if (other.done, &other.description) > (self.done, &self.description) {
            self.description = other.description.clone();
            self.done = other.done;
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Translate AuthoredMap storage errors into domain errors so the frontend
/// gets `Forbidden` instead of a raw `ActionNotAllowed`.
fn map_authored_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "can only {action} your own tasks"
            )))
        } else {
            AppError::msg(format!("tasks.{action}: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// Todolist state
// ---------------------------------------------------------------------------

// `#[app::state]` injects the borsh derives + `#[borsh(crate = ...)]` itself
// (SDK 0.11+); a manual derive here would collide.
#[app::state(emits = for<'a> Event<'a>)]
pub struct TodoListState {
    /// Per-task authorship: storage rejects edits/removes by non-authors.
    /// Iteration order is unspecified — callers sort by (created_at, id)
    /// to render in insertion order.
    tasks: AuthoredMap<String, Task>,
}

#[app::logic]
impl TodoListState {
    #[app::init]
    pub fn init() -> TodoListState {
        TodoListState {
            tasks: AuthoredMap::new_with_field_name("todolist:tasks"),
        }
    }

    // ---- Todolist API ----

    /// Add a new task to the list. Returns the generated task ID.
    pub fn add_task(&mut self, description: String) -> app::Result<String> {
        if description.is_empty() {
            app::bail!(ChatError::Invalid("description must not be empty".into()));
        }

        let truncated: String = description.chars().take(MAX_DESC_LEN).collect();
        let author = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now = storage_env::time_now();

        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let task_id = generate_id("task", now / 1_000_000, &nonce);

        let task = Task {
            id: task_id.clone(),
            author,
            description: truncated,
            done: false,
            created_at: now / 1_000_000,
        };

        self.tasks
            .insert(task_id.clone(), task)
            .map_err(|e| AppError::msg(format!("tasks.insert: {e}")))?;

        app::emit!(Event::TaskAdded { id: &task_id });
        Ok(task_id)
    }

    /// Edit the description of a task. Only the task's author may edit.
    pub fn edit_task(&mut self, task_id: String, new_description: String) -> app::Result<()> {
        if new_description.is_empty() {
            app::bail!(ChatError::Invalid("description must not be empty".into()));
        }

        let truncated: String = new_description.chars().take(MAX_DESC_LEN).collect();

        let mut task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(task_id.clone())))?;

        task.description = truncated;

        self.tasks
            .update(&task_id, task)
            .map_err(map_authored_error("edit"))?;

        app::emit!(Event::TaskEdited { id: &task_id });
        Ok(())
    }

    /// Toggle the done state of a task. Only the task's author may toggle.
    pub fn toggle_task_done(&mut self, task_id: String) -> app::Result<()> {
        let mut task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(task_id.clone())))?;

        task.done = !task.done;

        self.tasks
            .update(&task_id, task)
            .map_err(map_authored_error("toggle"))?;

        app::emit!(Event::TaskToggled { id: &task_id });
        Ok(())
    }

    /// Delete a task. Only the task's author may delete.
    pub fn delete_task(&mut self, task_id: String) -> app::Result<()> {
        let removed = self
            .tasks
            .remove(&task_id)
            .map_err(map_authored_error("delete"))?;

        if removed.is_none() {
            app::bail!(ChatError::NotFound(task_id));
        }

        app::emit!(Event::TaskDeleted { id: &task_id });
        Ok(())
    }

    /// Return all tasks sorted by (created_at, id) — open tasks first, then
    /// completed ones within each group. Callers may re-sort client-side.
    pub fn list_tasks(&self) -> app::Result<Vec<Task>> {
        let mut tasks: Vec<Task> = self
            .tasks
            .entries()
            .map_err(|e| AppError::msg(format!("tasks.entries: {e}")))?
            .map(|(_, v)| v)
            .collect();

        // Sort open tasks before done, then by creation time, then by id for
        // a stable deterministic order across all peers.
        tasks.sort_by(|a, b| {
            a.done
                .cmp(&b.done)
                .then_with(|| a.created_at.cmp(&b.created_at))
                .then_with(|| a.id.cmp(&b.id))
        });

        Ok(tasks)
    }
}
