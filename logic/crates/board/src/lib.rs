//! Board service — shared Jira-style task board with tasks and comments.

use std::collections::BTreeSet;

use chat_types::{generate_id, ChatError};
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_sdk::PublicKey;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{
    AuthoredMap, LwwRegister, Mergeable, SharedStorage, UnorderedMap,
};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_STATUSES: &[&str] = &["todo", "in_progress", "done"];

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// Governed board metadata — only the creator (writer set) can change the name.
#[derive(Debug, Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct BoardSettings {
    pub id: String,
    pub name: String,
    pub created_at: u64,
}

/// A shared task that any team member can update.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    /// One of: "todo", "in_progress", "done"
    pub status: String,
    /// One of: "low", "medium", "high"
    pub priority: String,
    pub assignee: Option<String>,
    pub created_by: String,
    pub created_at: u64,
    /// Monotonically updated on each mutation; used for LWW merge.
    pub updated_at: u64,
}

impl Mergeable for Task {
    /// Last-writer-wins based on `updated_at` timestamp.
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if other.updated_at > self.updated_at {
            *self = other.clone();
        }
        Ok(())
    }
}

/// An authored comment — only the author can edit or delete.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Comment {
    pub id: String,
    pub task_id: String,
    pub author: String,
    pub body: String,
    pub created_at: u64,
}

impl Mergeable for Comment {
    /// For authored entries the author is the sole writer; tiebreak on body length.
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if other.body.len() > self.body.len() {
            self.body = other.body.clone();
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn executor_pubkey() -> PublicKey {
    calimero_sdk::env::executor_id().into()
}

fn executor_b58() -> String {
    bs58::encode(calimero_sdk::env::executor_id()).into_string()
}

/// Map SharedStorage `ActionNotAllowed` to a domain `Forbidden` error.
fn map_shared_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "{action}: caller is not the board creator"
            )))
        } else {
            AppError::msg(format!("settings.{action}: {s}"))
        }
    }
}

/// Map AuthoredMap `ActionNotAllowed` to a domain `Forbidden` error.
fn map_authored_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "can only {action} your own comments"
            )))
        } else {
            AppError::msg(format!("comments.{action}: {s}"))
        }
    }
}

fn generate_task_id(now_ms: u64) -> String {
    let mut nonce = [0u8; 4];
    calimero_sdk::env::random_bytes(&mut nonce);
    generate_id("task", now_ms, &nonce)
}

fn generate_comment_id(now_ms: u64) -> String {
    let mut nonce = [0u8; 4];
    calimero_sdk::env::random_bytes(&mut nonce);
    generate_id("cmt", now_ms, &nonce)
}

fn generate_board_id(now_ms: u64) -> String {
    let mut nonce = [0u8; 4];
    calimero_sdk::env::random_bytes(&mut nonce);
    generate_id("board", now_ms, &nonce)
}

// ---------------------------------------------------------------------------
// Board state
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
pub struct BoardState {
    /// Governed board metadata: writer set = [creator].
    settings: SharedStorage<LwwRegister<BoardSettings>>,
    /// Shared tasks: any member can create, update status, or assign.
    tasks: UnorderedMap<String, Task>,
    /// Authored comments: only the comment author can edit/delete.
    comments: AuthoredMap<String, Comment>,
}

#[app::logic]
impl BoardState {
    /// Called by the Calimero runtime when the context is first created.
    /// Seeds the SharedStorage writer set with the creator's public key and
    /// immediately initializes the board settings with the provided `name`,
    /// combining what was previously a two-step `init` + `init_board` flow.
    #[app::init]
    pub fn init(name: String) -> BoardState {
        let creator = executor_pubkey();
        let mut writers = BTreeSet::new();
        let _ = writers.insert(creator);

        let mut state = BoardState {
            settings: SharedStorage::new_with_field_name("board:settings", writers, false),
            tasks: UnorderedMap::new_with_field_name("board:tasks"),
            comments: AuthoredMap::new_with_field_name("board:comments"),
        };

        if !name.is_empty() {
            let now_ms = storage_env::time_now() / 1_000_000;
            let board_id = generate_board_id(now_ms);
            let board_settings = BoardSettings {
                id: board_id.clone(),
                name: name.clone(),
                created_at: now_ms,
            };
            let _ = state.settings.insert(LwwRegister::new(board_settings));
            app::emit!(Event::BoardInitialized {
                id: &board_id,
                name: &name,
            });
        }

        state
    }

    // -------------------------------------------------------------------------
    // Board management
    // -------------------------------------------------------------------------

    /// Initialize the board with a name. Returns the generated board ID.
    /// Caller must be the context creator (the SharedStorage writer).
    pub fn init_board(&mut self, name: String) -> app::Result<String> {
        if name.is_empty() {
            app::bail!(ChatError::Invalid("board name cannot be empty".into()));
        }

        let now_ms = storage_env::time_now() / 1_000_000;
        let board_id = generate_board_id(now_ms);

        let board_settings = BoardSettings {
            id: board_id.clone(),
            name: name.clone(),
            created_at: now_ms,
        };

        self.settings
            .insert(LwwRegister::new(board_settings))
            .map_err(map_shared_error("init_board"))?;

        app::emit!(Event::BoardInitialized {
            id: &board_id,
            name: &name,
        });

        Ok(board_id)
    }

    // -------------------------------------------------------------------------
    // Task management
    // -------------------------------------------------------------------------

    /// Create a new task in the "todo" column. Returns the new task ID.
    pub fn create_task(
        &mut self,
        title: String,
        description: String,
        priority: String,
    ) -> app::Result<String> {
        if title.is_empty() {
            app::bail!(ChatError::Invalid("task title cannot be empty".into()));
        }
        if !["low", "medium", "high"].contains(&priority.as_str()) {
            app::bail!(ChatError::Invalid(
                "priority must be one of: low, medium, high".into()
            ));
        }

        let caller = executor_b58();
        let now_ms = storage_env::time_now() / 1_000_000;
        let task_id = generate_task_id(now_ms);

        let task = Task {
            id: task_id.clone(),
            title: title.clone(),
            description,
            status: "todo".to_string(),
            priority,
            assignee: None,
            created_by: caller,
            created_at: now_ms,
            updated_at: now_ms,
        };

        self.tasks
            .insert(task_id.clone(), task)
            .map_err(|e| AppError::msg(format!("tasks.insert: {e}")))?;

        app::emit!(Event::TaskCreated {
            id: &task_id,
            title: &title,
        });

        Ok(task_id)
    }

    /// Move a task to a different status column.
    pub fn update_task_status(
        &mut self,
        task_id: String,
        new_status: String,
    ) -> app::Result<()> {
        if !VALID_STATUSES.contains(&new_status.as_str()) {
            app::bail!(ChatError::Invalid(
                "status must be one of: todo, in_progress, done".into()
            ));
        }

        let mut task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(task_id.clone())))?
            .clone();

        task.status = new_status.clone();
        task.updated_at = storage_env::time_now() / 1_000_000;

        self.tasks
            .insert(task_id.clone(), task)
            .map_err(|e| AppError::msg(format!("tasks.insert: {e}")))?;

        app::emit!(Event::TaskStatusUpdated {
            id: &task_id,
            status: &new_status,
        });

        Ok(())
    }

    /// Assign a task to a team member (any member can assign/reassign).
    pub fn assign_task(&mut self, task_id: String, assignee: String) -> app::Result<()> {
        let mut task = self
            .tasks
            .get(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(task_id.clone())))?
            .clone();

        task.assignee = Some(assignee.clone());
        task.updated_at = storage_env::time_now() / 1_000_000;

        self.tasks
            .insert(task_id.clone(), task)
            .map_err(|e| AppError::msg(format!("tasks.insert: {e}")))?;

        app::emit!(Event::TaskAssigned {
            id: &task_id,
            assignee: &assignee,
        });

        Ok(())
    }

    /// Return all tasks. Clients filter by assignee, priority, or status on the frontend.
    pub fn get_tasks(&self) -> app::Result<Vec<Task>> {
        let entries = self
            .tasks
            .entries()
            .map_err(|e| AppError::msg(format!("tasks.entries: {e}")))?;
        let mut tasks: Vec<Task> = entries.map(|(_, v)| v).collect();
        // Sort by creation time for a stable default order.
        tasks.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        Ok(tasks)
    }

    // -------------------------------------------------------------------------
    // Comment management
    // -------------------------------------------------------------------------

    /// Add a comment to a task. Returns the new comment ID.
    pub fn add_comment(&mut self, task_id: String, body: String) -> app::Result<String> {
        if body.is_empty() {
            app::bail!(ChatError::Invalid("comment body cannot be empty".into()));
        }
        // Ensure the task exists.
        let task_exists = self
            .tasks
            .contains(&task_id)
            .map_err(|e| AppError::msg(format!("tasks.contains: {e}")))?;
        if !task_exists {
            app::bail!(ChatError::NotFound(task_id));
        }

        let author = executor_b58();
        let now_ms = storage_env::time_now() / 1_000_000;
        let comment_id = generate_comment_id(now_ms);

        let comment = Comment {
            id: comment_id.clone(),
            task_id: task_id.clone(),
            author,
            body,
            created_at: now_ms,
        };

        self.comments
            .insert(comment_id.clone(), comment)
            .map_err(|e| AppError::msg(format!("comments.insert: {e}")))?;

        app::emit!(Event::CommentAdded {
            id: &comment_id,
            task_id: &task_id,
        });

        Ok(comment_id)
    }

    /// Edit the body of an existing comment. Only the original author may do this.
    pub fn edit_comment(&mut self, comment_id: String, new_body: String) -> app::Result<()> {
        if new_body.is_empty() {
            app::bail!(ChatError::Invalid("comment body cannot be empty".into()));
        }

        let mut comment = self
            .comments
            .get(&comment_id)
            .map_err(|e| AppError::msg(format!("comments.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(comment_id.clone())))?
            .clone();

        comment.body = new_body;

        // AuthoredMap::update rejects non-authors with ActionNotAllowed.
        self.comments
            .update(&comment_id, comment)
            .map_err(map_authored_error("edit"))?;

        app::emit!(Event::CommentEdited { id: &comment_id });

        Ok(())
    }

    /// Delete a comment. Only the original author may do this.
    pub fn delete_comment(&mut self, comment_id: String) -> app::Result<()> {
        let removed = self
            .comments
            .remove(&comment_id)
            .map_err(map_authored_error("delete"))?;

        if removed.is_none() {
            app::bail!(ChatError::NotFound(comment_id));
        }

        app::emit!(Event::CommentDeleted { id: &comment_id });

        Ok(())
    }

    /// Return all comments for a given task, sorted by creation time.
    pub fn get_comments(&self, task_id: String) -> app::Result<Vec<Comment>> {
        let entries = self
            .comments
            .entries()
            .map_err(|e| AppError::msg(format!("comments.entries: {e}")))?;

        let mut comments: Vec<Comment> = entries
            .map(|(_, v)| v)
            .filter(|c| c.task_id == task_id)
            .collect();

        comments.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        Ok(comments)
    }
}
