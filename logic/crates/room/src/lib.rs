//! Room (per-session) service - one context per room, gated by member count.
//!
//! CANONICAL multi-service instance crate. It runs in a SUBGROUP context (one
//! per room) created with `serviceName: "room"`. At `init` it is handed the
//! DIRECTORY context id + the directory-issued room id so it can xcall back when
//! the session ends. The start gate is enforced HERE, in WASM: no domain
//! mutation is accepted until `members.len() >= min_members_to_start`.
//!
//! BUILD AGENT: reskin the domain entity (`Item` -> your game/session state) and
//! its methods, but KEEP: the `members`/`join_room` machinery, `ensure_started`
//! guarding every domain mutation, the `finished` win-lock, and the `finish`
//! xcall linkback. These are the room lifecycle; the frontend + the gate view
//! depend on `join_room` / `member_count` / `min_members`.

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::serde_json;
use calimero_sdk::types::Error as AppError;
use calimero_storage::address::Id;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::rekey::{field_child_id, RekeyTarget};
use calimero_storage::collections::{LwwRegister, Mergeable, UnorderedMap};
use calimero_storage::env as storage_env;
use ludo_lounge_types::{generate_id, validate_label, Error};

pub mod events;
use events::Event;

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct Item {
    pub label: String,
    pub value: LwwRegister<String>,
    pub created_ms: u64,
    pub author: String,
}

impl Mergeable for Item {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if (other.created_ms, &other.label) < (self.created_ms, &self.label) {
            self.label = other.label.clone();
            self.author = other.author.clone();
            self.created_ms = other.created_ms;
        }
        self.value.merge(&other.value);
        Ok(())
    }
}

impl RekeyTarget for Item {
    fn rekey_relative_to(&mut self, parent_id: Id) {
        calimero_storage::rekey_field_if_supported!(
            &mut self.value,
            field_child_id(parent_id, "value")
        );
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct ItemView {
    pub id: String,
    pub label: String,
    pub value: String,
    pub created_ms: u64,
    pub author: String,
}

#[app::state(emits = for<'a> Event<'a>)]
pub struct Room {
    /// The directory context id, base58, handed in at init - the xcall target.
    directory_context_id: LwwRegister<String>,
    /// The directory-issued room id, echoed back on finish for an O(1) lookup.
    room_id: LwwRegister<String>,
    /// The start gate threshold. 0 or 1 means "no gate".
    min_members: LwwRegister<u32>,
    /// Members that called join_room, keyed by base58 executor id (set
    /// semantics via the map key; the value is a join timestamp).
    members: UnorderedMap<String, LwwRegister<u64>>,
    /// Win-lock: once set, all domain mutations are rejected.
    finished: LwwRegister<bool>,
    /// Reskinnable domain state.
    items: UnorderedMap<String, Item>,
}

#[app::logic]
impl Room {
    #[app::init]
    pub fn init(directory_context_id: String, room_id: String, min_members_to_start: u32) -> Room {
        Room {
            directory_context_id: LwwRegister::new(directory_context_id),
            room_id: LwwRegister::new(room_id),
            min_members: LwwRegister::new(min_members_to_start),
            members: UnorderedMap::new_with_field_name("room:members"),
            finished: LwwRegister::new(false),
            items: UnorderedMap::new_with_field_name("room:items"),
        }
    }

    /// Register the caller as a member. Idempotent (keyed by executor id).
    /// Emits RoomStarted the first time the threshold is met.
    pub fn join_room(&mut self) -> app::Result<u32> {
        let me = self.caller_b58();
        let was = self.member_count()?;
        if self
            .members
            .get(&me)
            .map_err(|e| AppError::msg(format!("members.get: {e}")))?
            .is_none()
        {
            self.members
                .insert(me.clone(), LwwRegister::new(storage_env::time_now()))
                .map_err(|e| AppError::msg(format!("members.insert: {e}")))?;
        }
        let count = self.member_count()?;
        app::emit!(Event::MemberJoined { member: &me, count });
        let min = *self.min_members.get();
        if was < min && count >= min {
            app::emit!(Event::RoomStarted { count });
        }
        Ok(count)
    }

    pub fn member_count(&self) -> app::Result<u32> {
        Ok(self
            .members
            .len()
            .map_err(|e| AppError::msg(format!("members.len: {e}")))? as u32)
    }

    pub fn min_members(&self) -> app::Result<u32> {
        Ok(*self.min_members.get())
    }

    pub fn is_started(&self) -> app::Result<bool> {
        Ok(self.member_count()? >= *self.min_members.get())
    }

    // ---- domain (reskin per spec) - every mutation gated by ensure_started ----

    pub fn add(&mut self, label: String, value: String) -> app::Result<String> {
        self.ensure_started()?;
        validate_label(&label).map_err(AppError::from)?;
        let now = storage_env::time_now();
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("item", now, &nonce);
        let author = self.caller_b58();
        self.items
            .insert(id.clone(), Item { label, value: LwwRegister::new(value), created_ms: now, author: author.clone() })
            .map_err(|e| AppError::msg(format!("items.insert: {e}")))?;
        app::emit!(Event::ItemAdded { id: &id, owner: &author });
        Ok(id)
    }

    /// Update an item's value (LWW). Gated like every other domain mutation.
    pub fn update(&mut self, id: String, value: String) -> app::Result<()> {
        self.ensure_started()?;
        let mut guard = self
            .items
            .get_mut(&id)
            .map_err(|e| AppError::msg(format!("items.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(id.clone())))?;
        guard.value.set(value);
        drop(guard);
        app::emit!(Event::ItemUpdated { id: &id });
        Ok(())
    }

    /// Delete an item. Gated like every other domain mutation. Errors if the
    /// id is unknown, matching the base service's `NotFound`.
    pub fn delete(&mut self, id: String) -> app::Result<()> {
        self.ensure_started()?;
        let removed = self
            .items
            .remove(&id)
            .map_err(|e| AppError::msg(format!("items.remove: {e}")))?;
        if removed.is_none() {
            app::bail!(Error::NotFound(id));
        }
        app::emit!(Event::ItemDeleted { id: &id });
        Ok(())
    }

    pub fn list(&self) -> app::Result<Vec<ItemView>> {
        let mut out: Vec<ItemView> = self
            .items
            .entries()
            .map_err(|e| AppError::msg(format!("items.entries: {e}")))?
            .map(|(id, item)| ItemView {
                id,
                label: item.label.clone(),
                value: item.value.get().clone(),
                created_ms: item.created_ms,
                author: item.author.clone(),
            })
            .collect();
        out.sort_by(|a, b| (a.created_ms, &a.id).cmp(&(b.created_ms, &b.id)));
        Ok(out)
    }

    /// Terminal event: lock the room and xcall the directory. Gated so it can
    /// only fire once the room actually started.
    pub fn finish(&mut self, winner: String) -> app::Result<()> {
        // ensure_started already rejects a finished room, so no separate
        // finished check is needed here.
        self.ensure_started()?;
        self.finished.set(true);
        app::emit!(Event::RoomFinished { winner: &winner });
        self.notify_directory(&winner);
        Ok(())
    }
}

impl Room {
    fn caller_b58(&self) -> String {
        bs58::encode(env::executor_id()).into_string()
    }

    /// The START GATE. Every domain mutation calls this first.
    fn ensure_started(&self) -> app::Result<()> {
        if *self.finished.get() {
            app::bail!(Error::Invalid("room is finished".into()));
        }
        let count = self.member_count()?;
        let min = *self.min_members.get();
        if count < min {
            app::bail!(Error::Invalid(format!("waiting for players ({count}/{min})")));
        }
        Ok(())
    }

    /// Fire-and-forget xcall to the directory's `on_room_finished`. Mirrors the
    /// battleships game -> lobby linkback: decode the stored directory context
    /// id to [u8;32], serialize the params, xcall.
    fn notify_directory(&self, winner: &str) {
        let dir = self.directory_context_id.get().clone();
        let room_id = self.room_id.get().clone();
        if let Ok(bytes) = bs58::decode(&dir).into_vec() {
            if let Ok(ctx) = <[u8; 32]>::try_from(bytes.as_slice()) {
                let params = serde_json::json!({ "room_id": room_id, "winner": winner });
                if let Ok(payload) = serde_json::to_vec(&params) {
                    // `env::xcall` panics under the native TestHost harness (it only
                    // dispatches on wasm32); the gate test below drives `finish()`
                    // natively, so the real host call is wasm32-only here.
                    #[cfg(target_arch = "wasm32")]
                    env::xcall(&ctx, "on_room_finished", &payload);
                    #[cfg(not(target_arch = "wasm32"))]
                    let _ = (ctx, payload);
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// The START-GATE invariant test (REQUIRED). Drives joins under distinct
// executor identities via TestHost::call_as and asserts the gate flips exactly
// at the threshold. Per-caller membership is tested HERE, never in converge_app.
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use calimero_sdk::testing::TestHost;
    use super::*;

    fn new_room(min: u32) -> TestHost<Room> {
        TestHost::new(move || Room::init("11111111111111111111111111111111".into(), "room-1".into(), min))
    }

    #[test]
    fn gate_blocks_below_threshold_and_opens_at_it() {
        let mut app = new_room(2);
        let a = [1u8; 32];
        let b = [2u8; 32];

        // One member: below the gate -> domain mutation rejected.
        assert_eq!(app.call_as(a, |s| s.join_room()).unwrap(), 1);
        assert!(!app.view(|s| s.is_started()).unwrap());
        assert!(app.call_as(a, |s| s.add("x".into(), "1".into())).is_err());
        assert!(app.call_as(a, |s| s.delete("nope".into())).is_err());

        // Second member: gate opens -> mutation succeeds.
        assert_eq!(app.call_as(b, |s| s.join_room()).unwrap(), 2);
        assert!(app.view(|s| s.is_started()).unwrap());
        let id = app.call_as(a, |s| s.add("x".into(), "1".into())).unwrap();
        assert!(app.call_as(a, |s| s.delete(id)).is_ok());
    }

    #[test]
    fn delete_unknown_id_errors_after_gate_opens() {
        let mut app = new_room(1);
        let a = [1u8; 32];
        app.call_as(a, |s| s.join_room()).unwrap();
        assert!(app.call_as(a, |s| s.delete("nope".into())).is_err());
    }

    #[test]
    fn join_room_is_idempotent_per_identity() {
        let mut app = new_room(2);
        let a = [1u8; 32];
        assert_eq!(app.call_as(a, |s| s.join_room()).unwrap(), 1);
        assert_eq!(app.call_as(a, |s| s.join_room()).unwrap(), 1);
        assert_eq!(app.view(|s| s.member_count()).unwrap(), 1);
    }

    #[test]
    fn finish_locks_the_room() {
        let mut app = new_room(1);
        let a = [1u8; 32];
        app.call_as(a, |s| s.join_room()).unwrap();
        app.call_as(a, |s| s.add("x".into(), "1".into())).unwrap();
        app.call_as(a, |s| s.finish("a".into())).unwrap();
        // Win-lock: further mutations rejected.
        assert!(app.call_as(a, |s| s.add("y".into(), "2".into())).is_err());
    }

    #[test]
    fn no_gate_when_min_is_one() {
        let mut app = new_room(1);
        let a = [1u8; 32];
        app.call_as(a, |s| s.join_room()).unwrap();
        assert!(app.call_as(a, |s| s.add("x".into(), "1".into())).is_ok());
    }
}
