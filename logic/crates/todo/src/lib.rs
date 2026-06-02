//! todo service — shared task list.
//!
//! Tasks are stored as `UnorderedMap<String, LwwRegister<Task>>`. Wrapping the
//! value in `LwwRegister` makes it a registered CRDT: the storage layer keeps a
//! source-preserved logical timestamp and merges deterministically, so the
//! context state root converges identically on every peer.
//!
//! A bare `UnorderedMap<String, Task>` does not compile (the value must be
//! `Mergeable`); `AuthoredMap<String, Task>` compiles but never converges (the
//! value is stored as an opaque blob stamped with a per-node timestamp, so the
//! peers' state roots stay different forever). Creator-gated mutations
//! (edit/delete) are enforced in application logic by comparing `task.creator`
//! to the caller's base58-encoded executor_id.

use chat_types::ChatError;
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::{LwwRegister, UnorderedMap};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

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
    pub updated_at: u64,
}

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct TodoState {
    tasks: UnorderedMap<String, LwwRegister<Task>>,
}

#[app::logic]
impl TodoState {
    #[app::init]
    pub fn init() -> TodoState {
        TodoState {
            tasks: UnorderedMap::new_with_field_name("todo:tasks"),
        }
    }

    pub fn create_task(&mut self, title: String, description: String) -> app::Result<String> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;
        let id = format!("task-{}-{}", now_ms, &caller.chars().take(8).collect::<String>());

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
            updated_at: now_ms,
        };

        self.tasks
            .insert(id.clone(), LwwRegister::new(task))
            .map_err(|e| AppError::msg(format!("tasks.insert: {e}")))?;

        app::emit!(Event::TaskCreated { id: &id, title: &title });
        Ok(id)
    }

    fn load(&self, task_id: &str) -> app::Result<Task> {
        let reg = self
            .tasks
            .get(&task_id.to_string())
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::msg(ChatError::NotFound(task_id.to_string()).to_string()))?;
        Ok((*reg).clone())
    }

    fn store(&mut self, task_id: String, task: Task) -> app::Result<()> {
        self.tasks
            .insert(task_id, LwwRegister::new(task))
            .map_err(|e| AppError::msg(format!("tasks.insert: {e}")))?;
        Ok(())
    }

    pub fn complete_task(&mut self, task_id: String) -> app::Result<()> {
        let mut task = self.load(&task_id)?;
        task.completed = true;
        task.updated_at = storage_env::time_now() / 1_000_000;
        self.store(task_id.clone(), task)?;
        app::emit!(Event::TaskCompleted { id: &task_id });
        Ok(())
    }

    pub fn reopen_task(&mut self, task_id: String) -> app::Result<()> {
        let mut task = self.load(&task_id)?;
        task.completed = false;
        task.updated_at = storage_env::time_now() / 1_000_000;
        self.store(task_id.clone(), task)?;
        app::emit!(Event::TaskReopened { id: &task_id });
        Ok(())
    }

    pub fn edit_task(
        &mut self,
        task_id: String,
        title: String,
        description: String,
    ) -> app::Result<()> {
        if title.is_empty() {
            app::bail!(ChatError::Invalid("title must not be empty".into()));
        }
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let mut task = self.load(&task_id)?;
        if task.creator != caller {
            app::bail!(ChatError::Forbidden("can only edit your own tasks".into()));
        }
        task.title = title;
        task.description = description;
        task.updated_at = storage_env::time_now() / 1_000_000;
        self.store(task_id.clone(), task)?;
        app::emit!(Event::TaskEdited { id: &task_id });
        Ok(())
    }

    pub fn delete_task(&mut self, task_id: String) -> app::Result<()> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let task = self.load(&task_id)?;
        if task.creator != caller {
            app::bail!(ChatError::Forbidden("can only delete your own tasks".into()));
        }
        self.tasks
            .remove(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.remove: {e}")))?;
        app::emit!(Event::TaskDeleted { id: &task_id });
        Ok(())
    }

    pub fn assign_task(&mut self, task_id: String, assignee: String) -> app::Result<()> {
        if assignee.is_empty() {
            app::bail!(ChatError::Invalid("assignee must not be empty".into()));
        }
        let mut task = self.load(&task_id)?;
        task.assigned_to = Some(assignee.clone());
        task.updated_at = storage_env::time_now() / 1_000_000;
        self.store(task_id.clone(), task)?;
        app::emit!(Event::TaskAssigned { id: &task_id, assignee: &assignee });
        Ok(())
    }

    pub fn list_tasks(&self) -> app::Result<Vec<Task>> {
        let entries = self
            .tasks
            .entries()
            .map_err(|e| AppError::msg(format!("tasks.entries: {e}")))?;
        let mut tasks: Vec<Task> = entries.map(|(_, v)| (*v).clone()).collect();
        tasks.sort_by(|a, b| {
            a.completed.cmp(&b.completed).then(a.created_at.cmp(&b.created_at))
        });
        Ok(tasks)
    }
}
