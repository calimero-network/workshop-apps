//! Room service — per-room message history with private drafts.

use std::collections::BTreeSet;

use chat_types::{generate_id, ChatError, PublicKey as ChatPublicKey};
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
    pub sender: String,
    pub body: String,
    pub timestamp_ms: u64,
    pub edited: bool,
}

impl Mergeable for Message {
    /// Required so `AuthoredMap<String, Message>` is `Mergeable` (SDK 0.11+).
    /// Author-based conflict handling lives in `AuthoredMap` itself, so this
    /// value-level merge is a deterministic last-writer-wins tiebreak that is
    /// not reached on the normal write path: an edited copy supersedes the
    /// original; ties break on `body` to keep the merge commutative.
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if (other.edited, &other.body) > (self.edited, &self.body) {
            self.body = other.body.clone();
            self.edited = other.edited;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct RoomInfo {
    pub room_id: String,
    pub name: String,
    pub message_count: u64,
    pub created_ms: u64,
}

/// Mutable room metadata, governed by `SharedStorage`. Renames and any
/// future settings flow through `insert` and require the executor to be
/// in the writer set. Initial writer set = [creator]; admin can rotate
/// to add or remove moderators.
#[derive(Debug, Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct RoomMetadata {
    pub room_id: String,
    pub name: String,
    pub lobby_context_id: Option<String>,
    pub created_ms: u64,
    pub created_by: String,
}

/// Private draft storage — per-member, never replicated.
#[derive(BorshSerialize, BorshDeserialize, Debug)]
#[borsh(crate = "calimero_sdk::borsh")]
#[calimero_sdk::app::private]
pub struct PrivateDrafts {
    pub drafts: UnorderedMap<String, String>,
}

impl Default for PrivateDrafts {
    fn default() -> PrivateDrafts {
        PrivateDrafts {
            drafts: UnorderedMap::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn from_executor_id() -> Result<ChatPublicKey, ChatError> {
    ChatPublicKey::from_raw_bytes(&calimero_sdk::env::executor_id())
}

fn executor_pubkey() -> PublicKey {
    calimero_sdk::env::executor_id().into()
}

/// Decode a base58-encoded chat-domain key into a calimero PublicKey.
fn decode_pubkey(b58: &str) -> app::Result<PublicKey> {
    let chat_pk = ChatPublicKey::from_base58(b58)
        .map_err(|e| AppError::from(ChatError::Invalid(e.to_string())))?;
    Ok(chat_pk.0.into())
}

/// Translate AuthoredMap storage errors into chat-domain errors so the
/// frontend gets `Forbidden` instead of a raw `ActionNotAllowed`.
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

/// Translate SharedStorage errors. `ActionNotAllowed` covers both
/// "executor isn't a writer" and "writer set is frozen".
fn map_shared_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "{action}: caller is not a room moderator"
            )))
        } else {
            AppError::msg(format!("metadata.{action}: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// Room state
// ---------------------------------------------------------------------------

// `#[app::state]` injects the borsh derives + `#[borsh(crate = ...)]` itself
// (SDK 0.11+); a manual derive here would collide.
#[app::state(emits = for<'a> Event<'a>)]
pub struct RoomState {
    // Group-governed metadata: writer set acts as the moderator list.
    // Initial writers = [creator]; rotate to grant/revoke moderator rights.
    metadata: SharedStorage<LwwRegister<RoomMetadata>>,
    // Per-message authorship: storage rejects edits/removes by non-authors.
    // Iteration order is unspecified — callers must sort by (timestamp_ms, id)
    // to render chronologically.
    messages: AuthoredMap<String, Message>,
}

#[app::logic]
impl RoomState {
    #[app::init]
    pub fn init(room_id: String, name: String, lobby_context_id: Option<String>) -> RoomState {
        let creator = executor_pubkey();
        let mut writers = BTreeSet::new();
        let _ = writers.insert(creator);

        let mut metadata =
            SharedStorage::new_with_field_name("room:metadata", writers, false);

        let initial = RoomMetadata {
            room_id,
            name,
            lobby_context_id,
            created_ms: storage_env::time_now(),
            created_by: ChatPublicKey::from_raw_bytes(&calimero_sdk::env::executor_id())
                .map(|pk| pk.to_base58())
                .unwrap_or_default(),
        };
        // Safe: the executor is the sole initial writer, so insert succeeds.
        let _ = metadata.insert(LwwRegister::new(initial));

        RoomState {
            metadata,
            messages: AuthoredMap::new_with_field_name("room:messages"),
        }
    }

    // ---- Room API ----

    pub fn send_message(&mut self, body: String) -> app::Result<String> {
        let caller = from_executor_id().map_err(|e| AppError::msg(e.to_string()))?;
        let sender = caller.to_base58();

        if body.is_empty() {
            app::bail!(ChatError::Invalid("empty message".into()));
        }
        if body.len() > MAX_MESSAGE_LEN {
            app::bail!(ChatError::MessageTooLong);
        }

        let now = storage_env::time_now();
        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let msg_id = generate_id("msg", now, &nonce);

        let msg = Message {
            id: msg_id.clone(),
            sender: sender.clone(),
            body,
            timestamp_ms: now,
            edited: false,
        };

        self.messages
            .insert(msg_id.clone(), msg)
            .map_err(|e| AppError::msg(format!("messages.insert: {e}")))?;

        app::emit!(Event::MessageSent {
            id: &msg_id,
            sender: &sender,
            timestamp_ms: now,
        });

        // xcall to lobby to update activity
        self.notify_lobby_activity();

        Ok(msg_id)
    }

    pub fn edit_message(&mut self, message_id: String, new_body: String) -> app::Result<()> {
        if new_body.is_empty() {
            app::bail!(ChatError::Invalid("empty message".into()));
        }
        if new_body.len() > MAX_MESSAGE_LEN {
            app::bail!(ChatError::MessageTooLong);
        }

        let mut msg = self
            .messages
            .get(&message_id)
            .map_err(|e| AppError::msg(format!("messages.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(message_id.clone())))?;

        msg.body = new_body;
        msg.edited = true;

        // AuthoredMap::update returns ActionNotAllowed if executor != owner.
        // Surface that as a friendlier Forbidden error.
        self.messages
            .update(&message_id, msg)
            .map_err(map_authored_error("edit"))?;

        app::emit!(Event::MessageEdited { id: &message_id });
        Ok(())
    }

    pub fn delete_message(&mut self, message_id: String) -> app::Result<()> {
        // AuthoredMap::remove rejects non-owners with ActionNotAllowed and
        // returns Ok(None) if the message is already gone.
        let removed = self
            .messages
            .remove(&message_id)
            .map_err(map_authored_error("delete"))?;
        if removed.is_none() {
            app::bail!(ChatError::NotFound(message_id));
        }

        app::emit!(Event::MessageDeleted { id: &message_id });
        Ok(())
    }

    pub fn get_messages(&self, offset: usize, limit: usize) -> app::Result<Vec<Message>> {
        let mut sorted = self.collect_sorted_messages()?;
        let start = offset.min(sorted.len());
        let end = (start + limit).min(sorted.len());
        Ok(sorted.drain(start..end).collect())
    }

    pub fn get_recent_messages(&self, count: usize) -> app::Result<Vec<Message>> {
        let mut sorted = self.collect_sorted_messages()?;
        let start = sorted.len().saturating_sub(count);
        Ok(sorted.drain(start..).collect())
    }

    pub fn get_room_info(&self) -> app::Result<RoomInfo> {
        let meta = self.read_metadata()?;
        Ok(RoomInfo {
            room_id: meta.room_id,
            name: meta.name,
            message_count: self.message_len()?,
            created_ms: meta.created_ms,
        })
    }

    pub fn get_message_count(&self) -> app::Result<u64> {
        self.message_len()
    }

    // ---- Moderation (gated by SharedStorage writer set) ----

    /// Rename the room. Caller must be in the writer set.
    pub fn rename_room(&mut self, new_name: String) -> app::Result<()> {
        if new_name.is_empty() || new_name.len() > 64 {
            app::bail!(ChatError::Invalid(
                "room name must be 1-64 characters".into()
            ));
        }
        let mut meta = self.read_metadata()?;
        meta.name = new_name;
        self.write_metadata("rename", meta)?;
        app::emit!(Event::RoomUpdated {});
        Ok(())
    }

    /// Promote a member to moderator. Caller must be a current writer; the
    /// new moderator gains the ability to rename the room and rotate writers.
    pub fn add_moderator(&mut self, public_key: String) -> app::Result<()> {
        let new_pk = decode_pubkey(&public_key)?;
        let mut next: BTreeSet<PublicKey> = self.metadata.writers().iter().copied().collect();
        let _ = next.insert(new_pk);
        self.metadata
            .rotate_writers(next)
            .map_err(map_shared_error("add_moderator"))?;
        app::emit!(Event::ModeratorsRotated {});
        Ok(())
    }

    /// Demote a moderator. Caller must be a current writer. Cannot remove
    /// the last writer (SharedStorage rejects empty writer sets).
    pub fn remove_moderator(&mut self, public_key: String) -> app::Result<()> {
        let target = decode_pubkey(&public_key)?;
        let mut next: BTreeSet<PublicKey> = self.metadata.writers().iter().copied().collect();
        let _ = next.remove(&target);
        self.metadata
            .rotate_writers(next)
            .map_err(map_shared_error("remove_moderator"))?;
        app::emit!(Event::ModeratorsRotated {});
        Ok(())
    }

    /// Delete this room. Caller must be in the writer set (creator or any
    /// promoted moderator). Removes the directory entry from the lobby
    /// via xcall; the underlying room context is cleaned up by the admin
    /// API outside this method.
    pub fn delete_room(&mut self) -> app::Result<()> {
        let executor = executor_pubkey();
        if !self.metadata.writers().contains(&executor) {
            app::bail!(ChatError::Forbidden(
                "delete_room: caller is not a room moderator".into()
            ));
        }

        let meta = self.read_metadata()?;
        let room_id = meta.room_id.clone();

        // Notify the lobby to remove this room from its directory.
        if let Some(lobby_ctx) = meta.lobby_context_id.as_ref() {
            if let Ok(lobby_bytes) = bs58::decode(lobby_ctx).into_vec() {
                if let Ok(ctx_arr) = <[u8; 32]>::try_from(lobby_bytes.as_slice()) {
                    let params = calimero_sdk::serde_json::json!({
                        "room_id": room_id,
                    });
                    if let Ok(payload) = calimero_sdk::serde_json::to_vec(&params) {
                        calimero_sdk::env::xcall(&ctx_arr, "delete_room", &payload);
                    }
                }
            }
        }

        app::emit!(Event::RoomUpdated {});
        Ok(())
    }

    /// List current moderators (the writer set) as base58-encoded keys.
    pub fn list_moderators(&self) -> app::Result<Vec<String>> {
        Ok(self
            .metadata
            .writers()
            .iter()
            .map(|pk| ChatPublicKey(*<PublicKey as AsRef<[u8; 32]>>::as_ref(pk)).to_base58())
            .collect())
    }

    // ---- Private drafts (per-member, never replicated) ----

    pub fn save_draft(&self, key: String, content: String) -> app::Result<()> {
        let mut drafts = PrivateDrafts::private_load_or_default()?;
        let mut d = drafts.as_mut();
        d.drafts.insert(key, content)?;
        Ok(())
    }

    pub fn get_draft(&self, key: String) -> app::Result<Option<String>> {
        let drafts = PrivateDrafts::private_load_or_default()?;
        // `get` now hands back a `ValueRef` guard; clone out an owned copy.
        Ok(drafts.drafts.get(&key)?.map(|v| v.clone()))
    }

    pub fn delete_draft(&self, key: String) -> app::Result<()> {
        let mut drafts = PrivateDrafts::private_load_or_default()?;
        let mut d = drafts.as_mut();
        d.drafts.remove(&key)?;
        Ok(())
    }
}

impl RoomState {
    fn message_len(&self) -> app::Result<u64> {
        self.messages
            .len()
            .map(|n| n as u64)
            .map_err(|e| AppError::msg(format!("messages.len: {e}")))
    }

    /// AuthoredMap iteration is hash-ordered. Sort by (timestamp_ms, id) so
    /// renderers see a stable chronological order. Cost: O(N log N) in WASM,
    /// dominated by N storage reads in `entries()`.
    fn collect_sorted_messages(&self) -> app::Result<Vec<Message>> {
        let mut out: Vec<Message> = self
            .messages
            .entries()
            .map_err(|e| AppError::msg(format!("messages.entries: {e}")))?
            .map(|(_, v)| v)
            .collect();
        out.sort_by(|a, b| (a.timestamp_ms, &a.id).cmp(&(b.timestamp_ms, &b.id)));
        Ok(out)
    }

    fn read_metadata(&self) -> app::Result<RoomMetadata> {
        Ok(self
            .metadata
            .get()
            .map_err(|e| AppError::msg(format!("metadata.get: {e}")))?
            .get()
            .clone())
    }

    /// Replace the inner metadata; SharedStorage rejects non-writers with
    /// `ActionNotAllowed`, surfaced here as `ChatError::Forbidden`.
    fn write_metadata(&mut self, action: &'static str, meta: RoomMetadata) -> app::Result<()> {
        self.metadata
            .insert(LwwRegister::new(meta))
            .map_err(map_shared_error(action))?;
        Ok(())
    }

    /// Notify the lobby service about message activity via xcall.
    fn notify_lobby_activity(&self) {
        let Ok(meta) = self.read_metadata() else { return };
        let Some(lobby_ctx) = meta.lobby_context_id.as_ref() else { return };
        let Ok(lobby_bytes) = bs58::decode(lobby_ctx).into_vec() else { return };
        let Ok(ctx_arr) = <[u8; 32]>::try_from(lobby_bytes.as_slice()) else { return };
        let count = self.message_len().unwrap_or(0);
        let params = calimero_sdk::serde_json::json!({
            "room_id": meta.room_id,
            "room_name": meta.name,
            "message_count": count,
            "timestamp_ms": storage_env::time_now(),
        });
        if let Ok(payload) = calimero_sdk::serde_json::to_vec(&params) {
            calimero_sdk::env::xcall(&ctx_arr, "on_room_message", &payload);
        }
    }
}

// Note: `init` now reads `env::executor_id()` to seed the SharedStorage
// writer set with the creator. That host call is wasm32-only, so the
// previous host-side unit tests no longer apply. End-to-end coverage
// lives in `e2e/workflow-chat-e2e.yml` (merobox).
