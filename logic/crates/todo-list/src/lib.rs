//! Team todo-list service.
//!
//! A single shared context where teammates add, edit, toggle, and remove tasks.
//! Tasks are author-owned: only the member who created a task may edit, toggle,
//! or delete it. `AuthoredMap` enforces this at the storage layer — non-author
//! mutations are rejected with `ActionNotAllowed`.
//!
//! Patterns demonstrated:
//! - `#[app::state]` / `#[app::logic]` / `#[app::init]`
//! - `AuthoredMap` for per-author ownership
//! - `app::emit!`, named-struct returns, base58 executor identity

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{AuthoredMap, Mergeable};
use calimero_storage::env as storage_env;
use team_todos_types::{generate_id, validate_label, Error};

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

/// A todo task.
///
/// Stored as a value in `AuthoredMap` — only the executor who inserted it may
/// later update or remove it. All fields are serialisable with both Borsh
/// (storage/replication) and serde (ABI output to callers).
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Task {
    pub id: String,
    /// Base58-encoded public key of the member who created this task.
    pub author: String,
    pub title: String,
    pub done: bool,
    /// Creation timestamp (nanoseconds since epoch, from `calimero_storage::env::time_now()`).
    pub created_at: u64,
    /// Last-mutation timestamp — used for deterministic last-writer-wins merge.
    pub updated_at: u64,
}

/// `AuthoredMap` requires its value type to implement `Mergeable` even when only
/// one author ever writes the entry. Since tasks are author-gated, concurrent
/// edits from different authors cannot happen in practice; we still need a
/// deterministic merge for replication. Strategy: last `updated_at` wins for
/// mutable fields; immutable fields use a deterministic tie-break.
impl Mergeable for Task {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Mutable fields: take the replica with the most recent mutation.
        if other.updated_at > self.updated_at {
            self.title = other.title.clone();
            self.done = other.done;
            self.updated_at = other.updated_at;
        }
        // Set-once fields: deterministic tie-break so merge is commutative.
        if (other.created_at, &other.author) < (self.created_at, &self.author) {
            self.created_at = other.created_at;
            self.author = other.author.clone();
            self.id = other.id.clone();
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// `#[app::state]` injects the Borsh derives itself (SDK 0.11+).
#[app::state(emits = for<'a> Event<'a>)]
pub struct TodoList {
    /// All tasks keyed by generated id. `AuthoredMap` ensures that `update` and
    /// `remove` are only accepted from the executor who called `insert`.
    tasks: AuthoredMap<String, Task>,
}

#[app::logic]
impl TodoList {
    #[app::init]
    pub fn init() -> TodoList {
        TodoList {
            tasks: AuthoredMap::new_with_field_name("todo:tasks"),
        }
    }

    /// Add a new task. Returns its generated id.
    /// The caller becomes the author and is the only one who may later
    /// edit, toggle, or remove it.
    pub fn add_task(&mut self, title: String) -> app::Result<String> {
        validate_label(&title).map_err(AppError::from)?;

        let now = storage_env::time_now();
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("task", now, &nonce);
        let author = bs58::encode(env::executor_id()).into_string();

        let task = Task {
            id: id.clone(),
            author,
            title,
            done: false,
            created_at: now,
            updated_at: now,
        };
        self.tasks
            .insert(id.clone(), task)
            .map_err(|e| AppError::msg(format!("tasks.insert: {e}")))?;

        app::emit!(Event::TaskAdded { id: &id });
        Ok(id)
    }

    /// Edit the title of a task. Author-gated: only the task creator may call this.
    pub fn edit_task(&mut self, id: String, new_title: String) -> app::Result<()> {
        validate_label(&new_title).map_err(AppError::from)?;

        let current = self
            .tasks
            .get(&id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(id.clone())))?;

        let updated = Task { title: new_title, updated_at: storage_env::time_now(), ..current };

        self.tasks
            .update(&id, updated)
            .map_err(map_authored_error("edit"))?;

        app::emit!(Event::TaskEdited { id: &id });
        Ok(())
    }

    /// Toggle the done/open state of a task. Author-gated.
    pub fn toggle_task(&mut self, id: String) -> app::Result<()> {
        let current = self
            .tasks
            .get(&id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(id.clone())))?;

        let updated = Task { done: !current.done, updated_at: storage_env::time_now(), ..current };

        self.tasks
            .update(&id, updated)
            .map_err(map_authored_error("toggle"))?;

        app::emit!(Event::TaskToggled { id: &id });
        Ok(())
    }

    /// Remove a task. Author-gated: only the task creator may call this.
    pub fn remove_task(&mut self, id: String) -> app::Result<()> {
        let removed = self
            .tasks
            .remove(&id)
            .map_err(map_authored_error("delete"))?;

        if removed.is_none() {
            app::bail!(Error::NotFound(id));
        }

        app::emit!(Event::TaskRemoved { id: &id });
        Ok(())
    }

    /// List all tasks, sorted by creation time (oldest first).
    pub fn get_tasks(&self) -> app::Result<Vec<Task>> {
        let mut tasks: Vec<Task> = self
            .tasks
            .entries()
            .map_err(|e| AppError::msg(format!("tasks.entries: {e}")))?
            .map(|(_id, task)| task)
            .collect();
        tasks.sort_by_key(|t| t.created_at);
        Ok(tasks)
    }
}

/// Map an `AuthoredMap` access-control error to a domain `Forbidden`.
///
/// The storage layer surfaces owner-gate violations as "Action not allowed"
/// (with spaces). We match on that substring to produce a friendly `Forbidden`
/// error; everything else is a genuine storage error and is left as-is.
fn map_authored_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("Action not allowed") || s.contains("not entry owner") {
            AppError::from(Error::Forbidden(format!(
                "can only {action} your own tasks"
            )))
        } else {
            AppError::msg(format!("tasks.{action}: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// In-process tests — one TestHost roundtrip per mutation.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use calimero_sdk::testing::TestHost;

    use super::*;

    /// A distinct executor identity used to verify author-gating.
    const OTHER: [u8; 32] = [0x99; 32];

    #[test]
    fn add_task_then_get_tasks() {
        let mut app = TestHost::new(TodoList::init);

        let id = app.call(|s| s.add_task("Write Q3 report".into())).unwrap();
        let tasks = app.view(|s| s.get_tasks()).unwrap();

        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].id, id);
        assert_eq!(tasks[0].title, "Write Q3 report");
        assert!(!tasks[0].done);
        // add_task emits exactly one event.
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn edit_task_changes_title() {
        let mut app = TestHost::new(TodoList::init);

        let id = app.call(|s| s.add_task("Original title".into())).unwrap();
        app.call(|s| s.edit_task(id.clone(), "Updated title".into())).unwrap();

        let tasks = app.view(|s| s.get_tasks()).unwrap();
        assert_eq!(tasks[0].title, "Updated title");
    }

    #[test]
    fn toggle_task_flips_done_state() {
        let mut app = TestHost::new(TodoList::init);

        let id = app.call(|s| s.add_task("A task".into())).unwrap();
        assert!(!app.view(|s| s.get_tasks()).unwrap()[0].done);

        app.call(|s| s.toggle_task(id.clone())).unwrap();
        assert!(app.view(|s| s.get_tasks()).unwrap()[0].done);

        // Toggle again — should go back to open.
        app.call(|s| s.toggle_task(id.clone())).unwrap();
        assert!(!app.view(|s| s.get_tasks()).unwrap()[0].done);
    }

    #[test]
    fn remove_task_deletes_it() {
        let mut app = TestHost::new(TodoList::init);

        let id = app.call(|s| s.add_task("To remove".into())).unwrap();
        app.call(|s| s.remove_task(id)).unwrap();

        assert!(app.view(|s| s.get_tasks()).unwrap().is_empty());
    }

    #[test]
    fn edit_unknown_task_errors() {
        let mut app = TestHost::new(TodoList::init);
        assert!(app.call(|s| s.edit_task("nope".into(), "title".into())).is_err());
    }

    #[test]
    fn toggle_unknown_task_errors() {
        let mut app = TestHost::new(TodoList::init);
        assert!(app.call(|s| s.toggle_task("nope".into())).is_err());
    }

    #[test]
    fn remove_unknown_task_errors() {
        let mut app = TestHost::new(TodoList::init);
        assert!(app.call(|s| s.remove_task("nope".into())).is_err());
    }

    #[test]
    fn non_author_cannot_edit() {
        let mut app = TestHost::new(TodoList::init);
        let id = app.call(|s| s.add_task("My task".into())).unwrap();

        // A different executor must be rejected.
        assert!(app
            .call_as(OTHER, |s| s.edit_task(id, "hacked".into()))
            .is_err());
    }

    #[test]
    fn non_author_cannot_toggle() {
        let mut app = TestHost::new(TodoList::init);
        let id = app.call(|s| s.add_task("My task".into())).unwrap();

        assert!(app.call_as(OTHER, |s| s.toggle_task(id)).is_err());
    }

    #[test]
    fn non_author_cannot_remove() {
        let mut app = TestHost::new(TodoList::init);
        let id = app.call(|s| s.add_task("My task".into())).unwrap();

        assert!(app.call_as(OTHER, |s| s.remove_task(id.clone())).is_err());
        // Task must still exist after the rejected remove.
        assert_eq!(app.view(|s| s.get_tasks()).unwrap().len(), 1);
    }

    #[test]
    fn get_tasks_sorts_by_creation_time() {
        let mut app = TestHost::new(TodoList::init);

        // Two tasks added sequentially; they should be ordered oldest-first.
        let _id1 = app.call(|s| s.add_task("First".into())).unwrap();
        let _id2 = app.call(|s| s.add_task("Second".into())).unwrap();

        let tasks = app.view(|s| s.get_tasks()).unwrap();
        assert_eq!(tasks.len(), 2);
        assert!(tasks[0].created_at <= tasks[1].created_at);
        assert_eq!(tasks[0].title, "First");
        assert_eq!(tasks[1].title, "Second");
    }
}
