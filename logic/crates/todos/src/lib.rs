//! Todos service — shared task list with assignments and completion tracking.

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
    pub author: String,
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
pub struct TodosState {
    tasks: AuthoredMap<String, Task>,
}

#[app::logic]
impl TodosState {
    #[app::init]
    pub fn init() -> TodosState {
        TodosState {
            tasks: AuthoredMap::new_with_field_name("todos:tasks"),
        }
    }

    // ---- API methods ----

    /// Create a new task. Returns the generated task id.
    pub fn create_task(&mut self, title: String, description: String) -> app::Result<String> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;
        let id = format!("task-{now_ms}");

        let task = Task {
            id: id.clone(),
            title: title.clone(),
            description,
            author: caller,
            assigned_to: None,
            completed: false,
            created_at: now_ms,
        };

        self.tasks
            .insert(id.clone(), task)
            .map_err(|e| AppError::msg(format!("tasks.insert: {e}")))?;

        app::emit!(Event::TaskCreated { id: &id, title: &title });
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

    /// Mark the caller's task as completed. Only the task author may complete it.
    pub fn mark_complete(&mut self, task_id: String) -> app::Result<()> {
        let mut task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("task not found: {task_id}")))?;

        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        if task.author != caller {
            app::bail!(ChatError::Forbidden(
                "only the task author can mark it complete".into()
            ));
        }

        task.completed = true;

        self.tasks
            .update(&task_id, task)
            .map_err(|e| AppError::msg(format!("tasks.update: {e}")))?;

        app::emit!(Event::TaskCompleted { id: &task_id });
        Ok(())
    }

    /// Edit the title and description of a task. Only the task author may edit.
    pub fn edit_task(
        &mut self,
        task_id: String,
        title: String,
        description: String,
    ) -> app::Result<()> {
        let mut task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("task not found: {task_id}")))?;

        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        if task.author != caller {
            app::bail!(ChatError::Forbidden(
                "only the task author can edit it".into()
            ));
        }

        task.title = title.clone();
        task.description = description;

        self.tasks
            .update(&task_id, task)
            .map_err(|e| AppError::msg(format!("tasks.update: {e}")))?;

        app::emit!(Event::TaskEdited { id: &task_id, title: &title });
        Ok(())
    }

    /// Delete a task. Only the task author may delete it.
    pub fn delete_task(&mut self, task_id: String) -> app::Result<()> {
        let task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("task not found: {task_id}")))?;

        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        if task.author != caller {
            app::bail!(ChatError::Forbidden(
                "only the task author can delete it".into()
            ));
        }

        self.tasks
            .remove(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.remove: {e}")))?;

        app::emit!(Event::TaskDeleted { id: &task_id });
        Ok(())
    }

    /// Assign a task to a member (identified by their public key or display name).
    /// AuthoredMap enforces that only the task's original author's update propagates.
    pub fn assign_task(&mut self, task_id: String, assignee: String) -> app::Result<()> {
        let mut task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("task not found: {task_id}")))?;

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
}
