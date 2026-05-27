//! Memorial service — shared timeline of memories, reactions, and comments.

use chat_types::{generate_id, ChatError};
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

/// A file or media attachment on a memory (photo, audio clip, etc.).
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Attachment {
    /// URL or CID pointing to the attachment.
    pub url: String,
    /// MIME type or short kind label, e.g. "image", "audio".
    pub kind: String,
}

/// A story or memory shared on the memorial timeline.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Memory {
    pub id: String,
    pub author: String,
    pub body: String,
    pub attachments: Vec<Attachment>,
    /// Milliseconds since Unix epoch.
    pub created_at: u64,
}

/// An emoji reaction on a memory.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Reaction {
    pub id: String,
    pub memory_id: String,
    pub author: String,
    pub emoji: String,
    /// Milliseconds since Unix epoch.
    pub created_at: u64,
}

/// A text comment on a memory.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Comment {
    pub id: String,
    pub memory_id: String,
    pub author: String,
    pub body: String,
    /// Milliseconds since Unix epoch.
    pub created_at: u64,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Return the caller's public key as a base58 string.
fn caller_b58() -> String {
    bs58::encode(calimero_sdk::env::executor_id()).into_string()
}

/// Map `AuthoredMap` storage errors to domain errors so the frontend receives
/// `Forbidden` instead of a raw `ActionNotAllowed` string.
fn map_authored_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "can only {action} your own entry"
            )))
        } else {
            AppError::msg(format!("{action}: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct MemorialState {
    /// All memories; keyed by memory id. AuthoredMap enforces author-only edits/deletes.
    memories: AuthoredMap<String, Memory>,
    /// All reactions; keyed by reaction id.
    reactions: AuthoredMap<String, Reaction>,
    /// All comments; keyed by comment id.
    comments: AuthoredMap<String, Comment>,
}

#[app::logic]
impl MemorialState {
    #[app::init]
    pub fn init() -> MemorialState {
        MemorialState {
            memories: AuthoredMap::new_with_field_name("memorial:memories"),
            reactions: AuthoredMap::new_with_field_name("memorial:reactions"),
            comments: AuthoredMap::new_with_field_name("memorial:comments"),
        }
    }

    // ---- Memory ----

    /// Post a new memory to the timeline. Returns the new memory id.
    pub fn post_memory(
        &mut self,
        body: String,
        attachments: Vec<Attachment>,
    ) -> app::Result<String> {
        let author = caller_b58();
        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let id = generate_id("mem", now_ms, &nonce);

        let memory = Memory {
            id: id.clone(),
            author,
            body,
            attachments,
            created_at: now_ms,
        };

        self.memories
            .insert(id.clone(), memory)
            .map_err(|e| AppError::msg(format!("memories.insert: {e}")))?;

        app::emit!(Event::MemoryPosted { id: &id });
        Ok(id)
    }

    /// Edit the body of an existing memory. Only the original author may edit.
    pub fn edit_memory(&mut self, id: String, body: String) -> app::Result<()> {
        let mut memory = self
            .memories
            .get(&id)
            .map_err(|e| AppError::msg(format!("memories.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(id.clone())))?;

        memory.body = body;

        self.memories
            .update(&id, memory)
            .map_err(map_authored_error("edit_memory"))?;

        app::emit!(Event::MemoryEdited { id: &id });
        Ok(())
    }

    /// Delete a memory. Only the original author may delete.
    pub fn delete_memory(&mut self, id: String) -> app::Result<()> {
        let removed = self
            .memories
            .remove(&id)
            .map_err(map_authored_error("delete_memory"))?;

        if removed.is_none() {
            app::bail!(ChatError::NotFound(id));
        }

        app::emit!(Event::MemoryDeleted { id: &id });
        Ok(())
    }

    /// Return all memories in reverse-chronological order (newest first).
    pub fn get_memories(&self) -> app::Result<Vec<Memory>> {
        let mut out: Vec<Memory> = self
            .memories
            .entries()
            .map_err(|e| AppError::msg(format!("memories.entries: {e}")))?
            .map(|(_, v)| v)
            .collect();
        // Reverse-chronological: sort descending by created_at, then by id for stability.
        out.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(b.id.cmp(&a.id)));
        Ok(out)
    }

    // ---- Reaction ----

    /// Add an emoji reaction to a memory. Returns the new reaction id.
    pub fn add_reaction(&mut self, memory_id: String, emoji: String) -> app::Result<String> {
        let author = caller_b58();
        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let id = generate_id("react", now_ms, &nonce);

        let reaction = Reaction {
            id: id.clone(),
            memory_id: memory_id.clone(),
            author,
            emoji,
            created_at: now_ms,
        };

        self.reactions
            .insert(id.clone(), reaction)
            .map_err(|e| AppError::msg(format!("reactions.insert: {e}")))?;

        app::emit!(Event::ReactionAdded {
            id: &id,
            memory_id: &memory_id,
        });
        Ok(id)
    }

    /// Remove a reaction. Only the original author may remove.
    pub fn remove_reaction(&mut self, id: String) -> app::Result<()> {
        let removed = self
            .reactions
            .remove(&id)
            .map_err(map_authored_error("remove_reaction"))?;

        if removed.is_none() {
            app::bail!(ChatError::NotFound(id));
        }

        app::emit!(Event::ReactionRemoved { id: &id });
        Ok(())
    }

    /// Return all reactions for a given memory.
    pub fn get_reactions(&self, memory_id: String) -> app::Result<Vec<Reaction>> {
        let out: Vec<Reaction> = self
            .reactions
            .entries()
            .map_err(|e| AppError::msg(format!("reactions.entries: {e}")))?
            .map(|(_, v)| v)
            .filter(|r| r.memory_id == memory_id)
            .collect();
        Ok(out)
    }

    // ---- Comment ----

    /// Post a comment on a memory. Returns the new comment id.
    pub fn post_comment(&mut self, memory_id: String, body: String) -> app::Result<String> {
        let author = caller_b58();
        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let id = generate_id("comment", now_ms, &nonce);

        let comment = Comment {
            id: id.clone(),
            memory_id: memory_id.clone(),
            author,
            body,
            created_at: now_ms,
        };

        self.comments
            .insert(id.clone(), comment)
            .map_err(|e| AppError::msg(format!("comments.insert: {e}")))?;

        app::emit!(Event::CommentPosted {
            id: &id,
            memory_id: &memory_id,
        });
        Ok(id)
    }

    /// Return all comments for a given memory, oldest first.
    pub fn get_comments(&self, memory_id: String) -> app::Result<Vec<Comment>> {
        let mut out: Vec<Comment> = self
            .comments
            .entries()
            .map_err(|e| AppError::msg(format!("comments.entries: {e}")))?
            .map(|(_, v)| v)
            .filter(|c| c.memory_id == memory_id)
            .collect();
        out.sort_by(|a, b| a.created_at.cmp(&b.created_at).then(a.id.cmp(&b.id)));
        Ok(out)
    }
}
