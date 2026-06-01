//! todo service — shared task list with per-author task ownership.

use chat_types::ChatError;
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::AuthoredMap;
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
    pub title: String,
    pub description: String,
    pub creator: String,
    pub assigned_to: Option<String>,
    pub completed: bool,
    pub created_at: u64,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct TodoState {
    /// Per-author map of tasks. Only the task creator can edit or delete their
    /// own task entries — enforced at merge time by AuthoredMap.
    tasks: AuthoredMap<String, Task>,
}

#[app::logic]
impl TodoState {
    #[app::init]
    pub fn init() -> TodoState {
        TodoState {
            tasks: AuthoredMap::new_with_field_name("todo:tasks"),
        }
    }

    /// Create a new task. Returns the generated task ID.
    pub fn create_task(&mut self, title: String, description: String) -> app::Result<String> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;
        // Include the caller's first 8 chars for uniqueness across concurrent
        // creates at the same millisecond.
        let id = format!("task-{}-{}", now_ms, &caller[..caller.len().min(8)]);

        if title.is_empty() {
            app::bail!(ChatError::Invalid("title must not be empty".into()));
        }

        let task = Task {
            id: id.clone(),
            title: title.clone(),
            description,
            creator: caller,
            assigned_to: None,
            completed: false,
            created_at: now_ms,
        };

        self.tasks
            .insert(id.clone(), task)
            .map_err(|e| AppError::msg(format!("tasks.insert: {e}")))?;

        app::emit!(Event::TaskCreated {
            id: &id,
            title: &title,
        });
        Ok(id)
    }

    /// Mark a task as completed. Only the task creator can do this.
    pub fn complete_task(&mut self, task_id: String) -> app::Result<()> {
        let mut task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::msg(ChatError::NotFound(task_id.clone()).to_string()))?;

        task.completed = true;

        self.tasks
            .update(&task_id, task)
            .map_err(|e| AppError::msg(format!("tasks.update: {e}")))?;

        app::emit!(Event::TaskCompleted { id: &task_id });
        Ok(())
    }

    /// Reopen a completed task. Only the task creator can do this.
    pub fn reopen_task(&mut self, task_id: String) -> app::Result<()> {
        let mut task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::msg(ChatError::NotFound(task_id.clone()).to_string()))?;

        task.completed = false;

        self.tasks
            .update(&task_id, task)
            .map_err(|e| AppError::msg(format!("tasks.update: {e}")))?;

        app::emit!(Event::TaskReopened { id: &task_id });
        Ok(())
    }

    /// Edit a task's title and description. Only the task creator can do this.
    pub fn edit_task(
        &mut self,
        task_id: String,
        title: String,
        description: String,
    ) -> app::Result<()> {
        if title.is_empty() {
            app::bail!(ChatError::Invalid("title must not be empty".into()));
        }

        let mut task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::msg(ChatError::NotFound(task_id.clone()).to_string()))?;

        task.title = title;
        task.description = description;

        self.tasks
            .update(&task_id, task)
            .map_err(|e| AppError::msg(format!("tasks.update: {e}")))?;

        app::emit!(Event::TaskEdited { id: &task_id });
        Ok(())
    }

    /// Delete a task. Only the task creator can do this.
    pub fn delete_task(&mut self, task_id: String) -> app::Result<()> {
        let exists = self
            .tasks
            .contains(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.contains: {e}")))?;
        if !exists {
            app::bail!(ChatError::NotFound(task_id.clone()));
        }

        self.tasks
            .remove(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.remove: {e}")))?;

        app::emit!(Event::TaskDeleted { id: &task_id });
        Ok(())
    }

    /// Assign a task to a team member. Only the task creator can do this.
    pub fn assign_task(&mut self, task_id: String, assignee: String) -> app::Result<()> {
        if assignee.is_empty() {
            app::bail!(ChatError::Invalid("assignee must not be empty".into()));
        }

        let mut task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::msg(ChatError::NotFound(task_id.clone()).to_string()))?;

        task.assigned_to = Some(assignee.clone());

        self.tasks
            .update(&task_id, task)
            .map_err(|e| AppError::msg(format!("tasks.update: {e}")))?;

        app::emit!(Event::TaskAssigned {
            id: &task_id,
            assignee: &assignee,
        });
        Ok(())
    }

    /// List all tasks. Returns every task regardless of status.
    pub fn list_tasks(&self) -> app::Result<Vec<Task>> {
        let entries = self
            .tasks
            .entries()
            .map_err(|e| AppError::msg(format!("tasks.entries: {e}")))?;
        let mut tasks: Vec<Task> = entries.map(|(_, v)| v).collect();
        // Sort: open tasks first (completed=false < true), then by created_at ascending.
        tasks.sort_by(|a, b| {
            a.completed
                .cmp(&b.completed)
                .then(a.created_at.cmp(&b.created_at))
        });
        Ok(tasks)
    }
}
