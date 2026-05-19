//! Chat service — one-on-one real-time messaging between two friends.

use chat_types::{generate_id, ChatError};
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::AuthoredMap;
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

/// Maximum message body length in bytes.
const MAX_MESSAGE_LEN: usize = 4096;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Message {
    pub id: String,
    pub author: String,
    pub body: String,
    pub created_at: u64,
    pub edited_at: Option<u64>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn executor_b58() -> String {
    bs58::encode(calimero_sdk::env::executor_id()).into_string()
}

/// Translate AuthoredMap `ActionNotAllowed` into a `Forbidden` domain error.
fn map_authored_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "can only {action} your own messages"
            )))
        } else {
            AppError::msg(format!("messages.{action}: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// Chat state
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct ChatState {
    /// Per-author message store: storage rejects edits/removes by non-authors.
    messages: AuthoredMap<String, Message>,
}

#[app::logic]
impl ChatState {
    #[app::init]
    pub fn init() -> ChatState {
        ChatState {
            messages: AuthoredMap::new_with_field_name("chat:messages"),
        }
    }

    // ---- Mutating methods ----

    /// Send a new message. Returns the new message's id.
    pub fn send_message(&mut self, body: String) -> app::Result<String> {
        if body.is_empty() {
            app::bail!(ChatError::Invalid("empty message".into()));
        }
        if body.len() > MAX_MESSAGE_LEN {
            app::bail!(ChatError::MessageTooLong);
        }

        let author = executor_b58();
        let now_ns = storage_env::time_now();
        let now_ms = now_ns / 1_000_000;

        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let id = generate_id("msg", now_ms, &nonce);

        let msg = Message {
            id: id.clone(),
            author: author.clone(),
            body,
            created_at: now_ms,
            edited_at: None,
        };

        self.messages
            .insert(id.clone(), msg)
            .map_err(|e| AppError::msg(format!("messages.insert: {e}")))?;

        app::emit!(Event::MessageSent {
            id: &id,
            author: &author,
        });

        Ok(id)
    }

    /// Edit the body of a message the caller originally sent.
    /// Returns `Forbidden` if the caller is not the original author.
    pub fn edit_message(&mut self, id: String, new_body: String) -> app::Result<()> {
        if new_body.is_empty() {
            app::bail!(ChatError::Invalid("empty message".into()));
        }
        if new_body.len() > MAX_MESSAGE_LEN {
            app::bail!(ChatError::MessageTooLong);
        }

        let mut msg = self
            .messages
            .get(&id)
            .map_err(|e| AppError::msg(format!("messages.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(id.clone())))?;

        msg.body = new_body;
        msg.edited_at = Some(storage_env::time_now() / 1_000_000);

        self.messages
            .update(&id, msg)
            .map_err(map_authored_error("edit"))?;

        app::emit!(Event::MessageEdited { id: &id });
        Ok(())
    }

    /// Delete a message the caller originally sent.
    /// Returns `Forbidden` if the caller is not the original author.
    pub fn delete_message(&mut self, id: String) -> app::Result<()> {
        let removed = self
            .messages
            .remove(&id)
            .map_err(map_authored_error("delete"))?;
        if removed.is_none() {
            app::bail!(ChatError::NotFound(id));
        }

        app::emit!(Event::MessageDeleted { id: &id });
        Ok(())
    }

    // ---- View methods ----

    /// Return all messages in chronological order (by created_at, then id).
    pub fn list_messages(&self) -> app::Result<Vec<Message>> {
        let mut out: Vec<Message> = self
            .messages
            .entries()
            .map_err(|e| AppError::msg(format!("messages.entries: {e}")))?
            .map(|(_, v)| v)
            .collect();
        out.sort_by(|a, b| (a.created_at, &a.id).cmp(&(b.created_at, &b.id)));
        Ok(out)
    }
}
