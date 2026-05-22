//! Todos service — shared task list with assignments and completion tracking.

use chat_types::ChatError;
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::{AuthoredMap, StoreError};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

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
    pub is_complete: bool,
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

    /// Create a new task. Returns the generated task id.
    pub fn create_task(&mut self, title: String, description: String) -> app::Result<String> {
        if title.is_empty() {
            app::bail!(ChatError::Invalid("title must not be empty".into()));
        }
        let author = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;
        let id = format!("task-{now_ms}");
        let task = Task {
            id: id.clone(),
            title,
            description,
            author,
            assigned_to: None,
            is_complete: false,
            created_at: now_ms,
        };
        self.tasks
            .insert(id.clone(), task)
            .map_err(|e| AppError::msg(format!("tasks.insert: {e}")))?;
        app::emit!(Event::TaskCreated { id: &id });
        Ok(id)
    }

    /// Assign a task to a team member (only the task's author may reassign).
    pub fn assign_task(&mut self, task_id: String, assignee: String) -> app::Result<()> {
        let mut task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::msg(ChatError::NotFound(task_id.clone()).to_string()))?;
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

    /// Mark a task as complete (only the task's author may do this).
    pub fn complete_task(&mut self, task_id: String) -> app::Result<()> {
        let mut task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::msg(ChatError::NotFound(task_id.clone()).to_string()))?;
        task.is_complete = true;
        self.tasks
            .update(&task_id, task)
            .map_err(map_authored_error("complete"))?;
        app::emit!(Event::TaskCompleted { id: &task_id });
        Ok(())
    }

    /// Edit a task's title and description (only the task's author may edit).
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
            .map_err(map_authored_error("edit"))?;
        app::emit!(Event::TaskEdited { id: &task_id });
        Ok(())
    }

    /// Delete a task (only the task's author may delete).
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

    /// Return all tasks. Clients may group by assignee / is_complete locally.
    pub fn list_tasks(&self) -> app::Result<Vec<Task>> {
        let entries = self
            .tasks
            .entries()
            .map_err(|e| AppError::msg(format!("tasks.entries: {e}")))?;
        Ok(entries.map(|(_, v)| v).collect())
    }
}
