//! Lobby service — room directory and membership tracking.

use chat_types::{ChatError, PublicKey};
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{AuthoredMap, LwwRegister, Mergeable, UnorderedMap};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

const MAX_NAME_LEN: usize = 20;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct RoomSummary {
    pub room_id: String,
    pub name: String,
    pub created_by: String,
    pub context_id: Option<String>,
    pub member_count: u64,
    pub created_ms: u64,
}

impl Mergeable for RoomSummary {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if self.context_id.is_none() && other.context_id.is_some() {
            self.context_id = other.context_id.clone();
        }
        if other.member_count > self.member_count {
            self.member_count = other.member_count;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct RoomActivity {
    pub room_id: String,
    pub room_name: String,
    pub last_message_ms: u64,
    pub message_count: u64,
}

impl Mergeable for RoomActivity {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Keep the most recent activity.
        if other.last_message_ms > self.last_message_ms {
            *self = other.clone();
        }
        Ok(())
    }
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct PresenceEntry {
    pub member: String,
    pub last_seen_ms: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct NameEntry {
    pub member: String,
    pub name: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn from_executor_id() -> Result<PublicKey, ChatError> {
    PublicKey::from_raw_bytes(&calimero_sdk::env::executor_id())
}

// ---------------------------------------------------------------------------
// Lobby state
// ---------------------------------------------------------------------------

// `#[app::state]` injects the borsh derives + `#[borsh(crate = ...)]` itself
// (SDK 0.11+); a manual derive here would collide.
#[app::state(emits = for<'a> Event<'a>)]
pub struct LobbyState {
    created_ms: LwwRegister<u64>,
    rooms: UnorderedMap<String, RoomSummary>,
    activity: UnorderedMap<String, RoomActivity>,
    /// Per-author presence: only the entry's own author can update or remove
    /// their `last_seen_ms`. Spoofing is rejected at merge time by `AuthoredMap`.
    /// Values are wrapped in `LwwRegister` so the entry type is `Mergeable`
    /// (required by `#[app::state]` in SDK 0.11+).
    presence: AuthoredMap<String, LwwRegister<u64>>,
    /// Per-author display name: each member owns and edits only their own
    /// entry. Truncated to `MAX_NAME_LEN` Unicode scalars at write time.
    names: AuthoredMap<String, LwwRegister<String>>,
}

#[app::logic]
impl LobbyState {
    #[app::init]
    pub fn init() -> LobbyState {
        LobbyState {
            created_ms: LwwRegister::new(storage_env::time_now()),
            rooms: UnorderedMap::new_with_field_name("lobby:rooms"),
            activity: UnorderedMap::new_with_field_name("lobby:activity"),
            presence: AuthoredMap::new_with_field_name("lobby:presence"),
            names: AuthoredMap::new_with_field_name("lobby:names"),
        }
    }

    // ---- Lobby API ----

    /// Atomically register a new room. The client creates the room context
    /// first (via admin createContext), then calls this with the resulting
    /// context_id. This avoids the propagation race where a separate
    /// `create_room` then `set_room_context_id` would expose a window with
    /// `context_id == null` to remote peers.
    ///
    /// Idempotent on collision: if `room_id` already exists with the same
    /// `name`, `created_by`, and `context_id`, returns the existing summary.
    pub fn register_room(
        &mut self,
        room_id: String,
        name: String,
        context_id: String,
        member_count: u64,
    ) -> app::Result<RoomSummary> {
        let caller = from_executor_id().map_err(|e| AppError::msg(e.to_string()))?;
        let caller_b58 = caller.to_base58();

        if name.is_empty() || name.len() > 64 {
            app::bail!(ChatError::Invalid(
                "room name must be 1-64 characters".into()
            ));
        }
        if !room_id.starts_with("room-") || room_id.len() < 16 || room_id.len() > 64 {
            app::bail!(ChatError::Invalid(
                "room_id must match room-{timestamp}-{nonce}".into()
            ));
        }
        if context_id.is_empty() {
            app::bail!(ChatError::Invalid("context_id must not be empty".into()));
        }

        if let Some(existing) = self
            .rooms
            .get(&room_id)
            .map_err(|e| AppError::msg(format!("rooms.get: {e}")))?
        {
            if existing.name == name
                && existing.created_by == caller_b58
                && existing.context_id.as_deref() == Some(context_id.as_str())
            {
                // `get` now hands back a `ValueRef` guard; clone out an owned copy.
                return Ok(existing.clone());
            }
            app::bail!(ChatError::RoomAlreadyExists);
        }

        let summary = RoomSummary {
            room_id: room_id.clone(),
            name: name.clone(),
            created_by: caller_b58,
            context_id: Some(context_id),
            // Initial member count supplied by the creator (creator + invited
            // members). The directory tracks this at creation; live join/leave
            // counts aren't reported back, so treat it as the starting size.
            member_count,
            created_ms: storage_env::time_now(),
        };

        self.rooms
            .insert(room_id.clone(), summary.clone())
            .map_err(|e| AppError::msg(format!("rooms.insert: {e}")))?;

        app::emit!(Event::RoomCreated {
            id: &room_id,
            name: &name,
        });
        app::emit!(Event::RoomListUpdated {});
        Ok(summary)
    }

    pub fn get_rooms(&self) -> app::Result<Vec<RoomSummary>> {
        let entries = self
            .rooms
            .entries()
            .map_err(|e| AppError::msg(format!("rooms.entries: {e}")))?;
        Ok(entries.map(|(_, v)| v).collect())
    }

    pub fn get_room(&self, room_id: String) -> app::Result<Option<RoomSummary>> {
        Ok(self
            .rooms
            .get(&room_id)
            .map_err(|e| AppError::msg(format!("rooms.get: {e}")))?
            .map(|v| v.clone()))
    }

    pub fn delete_room(&mut self, room_id: String) -> app::Result<()> {
        let exists = self
            .rooms
            .contains(&room_id)
            .map_err(|e| AppError::msg(format!("rooms.contains: {e}")))?;
        if !exists {
            app::bail!(ChatError::NotFound(room_id));
        }

        self.rooms
            .remove(&room_id)
            .map_err(|e| AppError::msg(format!("rooms.remove: {e}")))?;
        let _ = self.activity.remove(&room_id);

        app::emit!(Event::RoomDeleted { id: &room_id });
        app::emit!(Event::RoomListUpdated {});
        Ok(())
    }

    pub fn get_activity(&self) -> app::Result<Vec<RoomActivity>> {
        let entries = self
            .activity
            .entries()
            .map_err(|e| AppError::msg(format!("activity.entries: {e}")))?;
        Ok(entries.map(|(_, v)| v).collect())
    }

    /// Called via xcall from the room service when a message is sent.
    pub fn on_room_message(
        &mut self,
        room_id: String,
        room_name: String,
        message_count: u64,
        timestamp_ms: u64,
    ) -> app::Result<()> {
        let activity = RoomActivity {
            room_id: room_id.clone(),
            room_name,
            last_message_ms: timestamp_ms,
            message_count,
        };
        self.activity
            .insert(room_id, activity)
            .map_err(|e| AppError::msg(format!("activity.insert: {e}")))?;

        app::emit!(Event::RoomListUpdated {});
        Ok(())
    }

    // ---- Presence ----

    /// Record that the caller is currently online. First call inserts;
    /// subsequent calls update the caller's own entry. AuthoredMap rejects
    /// updates by anyone other than the original author at merge time, so a
    /// peer cannot spoof anyone else's last_seen.
    ///
    /// `storage_env::time_now()` returns nanoseconds since epoch; we convert
    /// to ms so the value lines up with `Date.now()` on the frontend.
    /// Heartbeat emits no event — at 15s cadence it would spam the bus.
    pub fn heartbeat(&mut self) -> app::Result<()> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;
        let exists = self
            .presence
            .contains(&caller)
            .map_err(|e| AppError::msg(format!("presence.contains: {e}")))?;
        if exists {
            self.presence
                .update(&caller, LwwRegister::new(now_ms))
                .map_err(|e| AppError::msg(format!("presence.update: {e}")))?;
        } else {
            self.presence
                .insert(caller, LwwRegister::new(now_ms))
                .map_err(|e| AppError::msg(format!("presence.insert: {e}")))?;
        }
        Ok(())
    }

    /// Return one PresenceEntry per member who has ever heartbeated. Clients
    /// filter by recency (typically `now - last_seen_ms <= 35_000`) to derive
    /// the online set.
    pub fn list_presence(&self) -> app::Result<Vec<PresenceEntry>> {
        let entries = self
            .presence
            .entries()
            .map_err(|e| AppError::msg(format!("presence.entries: {e}")))?;
        Ok(entries
            .map(|(member, last_seen)| PresenceEntry {
                member,
                last_seen_ms: last_seen.into_inner(),
            })
            .collect())
    }

    // ---- Display names ----

    /// Set the caller's display name. Truncated to `MAX_NAME_LEN` Unicode
    /// scalar values (`chars().take(...)`) so multi-byte codepoints are not
    /// split in the middle. AuthoredMap enforces author-only edits.
    pub fn set_name(&mut self, name: String) -> app::Result<()> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let truncated: String = name.chars().take(MAX_NAME_LEN).collect();
        let exists = self
            .names
            .contains(&caller)
            .map_err(|e| AppError::msg(format!("names.contains: {e}")))?;
        if exists {
            self.names
                .update(&caller, LwwRegister::new(truncated))
                .map_err(|e| AppError::msg(format!("names.update: {e}")))?;
        } else {
            self.names
                .insert(caller.clone(), LwwRegister::new(truncated))
                .map_err(|e| AppError::msg(format!("names.insert: {e}")))?;
        }
        app::emit!(Event::NameChanged { id: &caller });
        Ok(())
    }

    /// Return one NameEntry per member who has set a display name.
    pub fn list_names(&self) -> app::Result<Vec<NameEntry>> {
        let entries = self
            .names
            .entries()
            .map_err(|e| AppError::msg(format!("names.entries: {e}")))?;
        Ok(entries
            .map(|(member, name)| NameEntry {
                member,
                name: name.into_inner(),
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_populates_created_ms() {
        let state = LobbyState::init();
        assert!(*state.created_ms.get() > 0);
    }
}
