//! Todolist service — shared task list with creation, assignment, and status tracking.

use chat_types::ChatError;
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{AuthoredMap, Mergeable};
use calimero_storage::collections::StoreError;
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

const MAX_TITLE_LEN: usize = 256;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub author: String,
    pub assigned_to: Option<String>,
    pub completed: bool,
    pub created_at: u64,
}

impl Mergeable for Task {
    /// Deterministic tiebreak merge for `AuthoredMap<String, Task>`.
    /// `AuthoredMap` enforces single-author ownership at the storage layer;
    /// this value-level merge is a safe fallback for concurrent edits by the
    /// same author on different devices:
    /// - `completed` is monotonic (once true, stays true).
    /// - `title` and `assigned_to` use lexicographic last-write-wins as a
    ///   deterministic tiebreak so the merge is commutative and associative.
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // completed is monotonic — once marked done, never reverts via merge.
        if other.completed {
            self.completed = true;
        }
        // Tiebreak: keep the lexicographically larger title so the merge is
        // commutative (both peers reach the same result regardless of order).
        if !other.title.is_empty() && other.title > self.title {
            self.title = other.title.clone();
        }
        // last-non-None-wins for assignee.
        if other.assigned_to.is_some() && other.assigned_to > self.assigned_to {
            self.assigned_to = other.assigned_to.clone();
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

fn map_authored_error(action: &'static str) -> impl FnOnce(StoreError) -> AppError {
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
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
pub struct TodoListState {
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

    /// Create a new task. Returns the new task's id.
    pub fn create_task(&mut self, title: String) -> app::Result<String> {
        if title.is_empty() {
            app::bail!(ChatError::Invalid("title must not be empty".into()));
        }
        let truncated: String = title.chars().take(MAX_TITLE_LEN).collect();
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;
        let id = format!("task-{now_ms}");
        let task = Task {
            id: id.clone(),
            title: truncated,
            author: caller,
            assigned_to: None,
            completed: false,
            created_at: now_ms,
        };
        self.tasks
            .insert(id.clone(), task)
            .map_err(|e| AppError::msg(format!("tasks.insert: {e}")))?;
        app::emit!(Event::TaskCreated { id: &id });
        Ok(id)
    }

    /// Return all tasks (open and completed).
    pub fn list_tasks(&self) -> app::Result<Vec<Task>> {
        let entries = self
            .tasks
            .entries()
            .map_err(|e| AppError::msg(format!("tasks.entries: {e}")))?;
        Ok(entries.map(|(_, v)| v).collect())
    }

    /// Mark a task as completed. Only the task's author may do this.
    pub fn mark_complete(&mut self, task_id: String) -> app::Result<()> {
        let mut task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::msg(ChatError::NotFound(task_id.clone()).to_string()))?
            .clone();
        task.completed = true;
        self.tasks
            .update(&task_id, task)
            .map_err(map_authored_error("mark_complete"))?;
        app::emit!(Event::TaskCompleted { id: &task_id });
        Ok(())
    }

    /// Mark a task as incomplete. Only the task's author may do this.
    pub fn mark_incomplete(&mut self, task_id: String) -> app::Result<()> {
        let mut task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::msg(ChatError::NotFound(task_id.clone()).to_string()))?
            .clone();
        task.completed = false;
        self.tasks
            .update(&task_id, task)
            .map_err(map_authored_error("mark_incomplete"))?;
        app::emit!(Event::TaskIncompleted { id: &task_id });
        Ok(())
    }

    /// Edit a task's title. Only the task's author may do this.
    pub fn edit_task(&mut self, task_id: String, new_title: String) -> app::Result<()> {
        if new_title.is_empty() {
            app::bail!(ChatError::Invalid("title must not be empty".into()));
        }
        let mut task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::msg(ChatError::NotFound(task_id.clone()).to_string()))?
            .clone();
        task.title = new_title.chars().take(MAX_TITLE_LEN).collect();
        self.tasks
            .update(&task_id, task)
            .map_err(map_authored_error("edit"))?;
        app::emit!(Event::TaskEdited { id: &task_id });
        Ok(())
    }

    /// Delete a task. Only the task's author may do this.
    pub fn delete_task(&mut self, task_id: String) -> app::Result<()> {
        let exists = self
            .tasks
            .contains(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.contains: {e}")))?;
        if !exists {
            app::bail!(ChatError::NotFound(task_id));
        }
        self.tasks
            .remove(&task_id)
            .map_err(map_authored_error("delete"))?;
        app::emit!(Event::TaskDeleted { id: &task_id });
        Ok(())
    }

    /// Assign a task to a team member. Only the task's author may do this.
    pub fn assign_task(&mut self, task_id: String, assignee: String) -> app::Result<()> {
        let mut task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::msg(ChatError::NotFound(task_id.clone()).to_string()))?
            .clone();
        task.assigned_to = Some(assignee.clone());
        self.tasks
            .update(&task_id, task)
            .map_err(map_authored_error("assign"))?;
        app::emit!(Event::TaskAssigned {
            id: &task_id,
            assignee: &assignee,
        });
        Ok(())
    }
}
