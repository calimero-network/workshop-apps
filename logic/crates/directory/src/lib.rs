//! Directory (lobby) service - the namespace-level registry of rooms.
//!
//! This is the CANONICAL multi-service directory crate: it holds workspace-level
//! state (the list of rooms + their status) in ONE auto-join context in the
//! namespace root group. Each room is a SEPARATE context running the sibling
//! `room` service (see crates/room); a room links back here via `env::xcall`.
//!
//! BUILD AGENT: reskin `RoomSummary`'s domain fields (a "room" may be a match,
//! table, channel, board) but KEEP `context_id`, `status`, the `create_room` ->
//! `set_room_context_id` flow, and the `on_room_finished` xcall target - the
//! frontend and the room crate depend on this shape.

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::address::Id;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::rekey::{field_child_id, RekeyTarget};
use calimero_storage::collections::{LwwRegister, Mergeable, UnorderedMap};
use calimero_storage::env as storage_env;
use ludo_lounge_types::{generate_id, validate_label, Error};

pub mod events;
use events::Event;

/// Room lifecycle status. Status only advances (Pending -> Active -> Finished).
#[derive(Debug, Clone, Copy, PartialEq, Eq, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub enum RoomStatus {
    Pending,
    Active,
    Finished,
}

fn rank(s: RoomStatus) -> u8 {
    match s {
        RoomStatus::Pending => 0,
        RoomStatus::Active => 1,
        RoomStatus::Finished => 2,
    }
}

/// One room's directory entry. Nests a `LwwRegister` (the room's mutable
/// context id + status), so it hand-writes `Mergeable` + `RekeyTarget`.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct RoomSummary {
    pub name: String,
    pub owner: String,
    pub created_ms: u64,
    /// Mutable body: `(status, context_id)`. LWW on concurrent updates, with a
    /// status-rank tie-break in `merge` so a stale Pending can never clobber a
    /// live Active/Finished.
    pub state: LwwRegister<RoomState>,
}

#[derive(Debug, Clone, PartialEq, Eq, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct RoomState {
    pub status: RoomStatus,
    pub context_id: Option<String>,
}

impl Mergeable for RoomSummary {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if (other.created_ms, &other.name) < (self.created_ms, &self.name) {
            self.name = other.name.clone();
            self.owner = other.owner.clone();
            self.created_ms = other.created_ms;
        }
        // Register LWW picks a winner; if the loser had a higher status rank,
        // promote (status only advances - a Finished must survive a raced write).
        let mine = self.state.get().clone();
        let theirs = other.state.get().clone();
        self.state.merge(&other.state);
        let winner = self.state.get().clone();
        let best_status = [mine.status, theirs.status, winner.status]
            .into_iter()
            .max_by_key(|s| rank(*s))
            .unwrap();
        // context_id is taken separately as the max across all three candidates
        // (None < Some, ties broken lexicographically) rather than inherited
        // wholesale from whichever state carries the winning status - a raced
        // Finished that hasn't seen the link yet must not erase a context_id
        // another replica already knows. `max` over `Option<String>` is a plain
        // join (commutative, associative, idempotent), so this stays convergent.
        let best_context_id = [&mine.context_id, &theirs.context_id, &winner.context_id]
            .into_iter()
            .cloned()
            .max()
            .unwrap();
        if best_status != winner.status || best_context_id != winner.context_id {
            self.state.set(RoomState { status: best_status, context_id: best_context_id });
        }
        Ok(())
    }
}

impl RekeyTarget for RoomSummary {
    fn rekey_relative_to(&mut self, parent_id: Id) {
        calimero_storage::rekey_field_if_supported!(
            &mut self.state,
            field_child_id(parent_id, "state")
        );
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct RoomSummaryView {
    pub id: String,
    pub name: String,
    pub owner: String,
    pub created_ms: u64,
    pub status: RoomStatus,
    pub context_id: Option<String>,
}

#[app::state(emits = for<'a> Event<'a>)]
pub struct Directory {
    rooms: UnorderedMap<String, RoomSummary>,
}

#[app::logic]
impl Directory {
    #[app::init]
    pub fn init() -> Directory {
        Directory {
            rooms: UnorderedMap::new_with_field_name("directory:rooms"),
        }
    }

    /// Register a new room. Returns its generated id. The room's own context is
    /// created by the frontend, then linked with `set_room_context_id`.
    pub fn create_room(&mut self, name: String) -> app::Result<String> {
        validate_label(&name).map_err(AppError::from)?;
        let now = storage_env::time_now();
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("room", now, &nonce);
        let owner = self.owner_b58();
        self.rooms
            .insert(
                id.clone(),
                RoomSummary {
                    name,
                    owner: owner.clone(),
                    created_ms: now,
                    state: LwwRegister::new(RoomState { status: RoomStatus::Pending, context_id: None }),
                },
            )
            .map_err(|e| AppError::msg(format!("rooms.insert: {e}")))?;
        app::emit!(Event::RoomCreated { room_id: &id, owner: &owner });
        Ok(id)
    }

    /// Link a room to the context that was created for it, promoting it Active.
    /// Idempotent: re-linking the same id is a no-op-safe LWW write. Owner-gated:
    /// only the creator links (once, right after create), so gating on
    /// `RoomSummary.owner` closes the re-link vector without touching the flat
    /// any-member model that governs domain mutations.
    pub fn set_room_context_id(&mut self, room_id: String, context_id: String) -> app::Result<()> {
        let caller = self.owner_b58();
        let mut guard = self
            .rooms
            .get_mut(&room_id)
            .map_err(|e| AppError::msg(format!("rooms.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(room_id.clone())))?;
        if guard.owner != caller {
            app::bail!(Error::Forbidden("only the room owner may link its context".into()));
        }
        let mut st = guard.state.get().clone();
        st.context_id = Some(context_id);
        if rank(st.status) < rank(RoomStatus::Active) {
            st.status = RoomStatus::Active;
        }
        guard.state.set(st);
        drop(guard);
        app::emit!(Event::RoomLinked { room_id: &room_id });
        Ok(())
    }

    /// xcall TARGET: the room context calls this when the session ends.
    /// Idempotent - a duplicate delivery just re-sets Finished.
    pub fn on_room_finished(&mut self, room_id: String, _winner: String) -> app::Result<()> {
        if let Some(mut guard) = self
            .rooms
            .get_mut(&room_id)
            .map_err(|e| AppError::msg(format!("rooms.get_mut: {e}")))?
        {
            let mut st = guard.state.get().clone();
            st.status = RoomStatus::Finished;
            guard.state.set(st);
            drop(guard);
            app::emit!(Event::RoomFinished { room_id: &room_id });
        }
        Ok(())
    }

    pub fn get_rooms(&self) -> app::Result<Vec<RoomSummaryView>> {
        let mut out: Vec<RoomSummaryView> = self
            .rooms
            .entries()
            .map_err(|e| AppError::msg(format!("rooms.entries: {e}")))?
            .map(|(id, r)| {
                let st = r.state.get().clone();
                RoomSummaryView {
                    id,
                    name: r.name.clone(),
                    owner: r.owner.clone(),
                    created_ms: r.created_ms,
                    status: st.status,
                    context_id: st.context_id,
                }
            })
            .collect();
        out.sort_by(|a, b| (b.created_ms, &b.id).cmp(&(a.created_ms, &a.id)));
        Ok(out)
    }
}

impl Directory {
    fn owner_b58(&self) -> String {
        bs58::encode(env::executor_id()).into_string()
    }
}

#[cfg(test)]
mod tests {
    use calimero_sdk::testing::TestHost;
    use super::*;

    #[test]
    fn create_link_and_list() {
        let mut app = TestHost::new(Directory::init);
        let id = app.call(|s| s.create_room("Table 1".into())).unwrap();
        app.call(|s| s.set_room_context_id(id.clone(), "ctx-1".into())).unwrap();
        let rooms = app.view(|s| s.get_rooms()).unwrap();
        assert_eq!(rooms.len(), 1);
        assert_eq!(rooms[0].status, RoomStatus::Active);
        assert_eq!(rooms[0].context_id.as_deref(), Some("ctx-1"));
    }

    // Only the room's creator may link its context - a non-owner re-link (the
    // hijack vector) must be rejected, while the owner's link succeeds.
    #[test]
    fn set_room_context_id_is_owner_gated() {
        let mut app = TestHost::new(Directory::init);
        let owner = [1u8; 32];
        let other = [2u8; 32];
        let id = app.call_as(owner, |s| s.create_room("Table 1".into())).unwrap();
        assert!(app
            .call_as(other, |s| s.set_room_context_id(id.clone(), "ctx-evil".into()))
            .is_err());
        assert!(app
            .call_as(owner, |s| s.set_room_context_id(id.clone(), "ctx-1".into()))
            .is_ok());
        let rooms = app.view(|s| s.get_rooms()).unwrap();
        assert_eq!(rooms[0].context_id.as_deref(), Some("ctx-1"));
    }

    #[test]
    fn on_room_finished_sets_finished_and_is_idempotent() {
        let mut app = TestHost::new(Directory::init);
        let id = app.call(|s| s.create_room("Table 1".into())).unwrap();
        app.call(|s| s.on_room_finished(id.clone(), "winner".into())).unwrap();
        app.call(|s| s.on_room_finished(id.clone(), "winner".into())).unwrap();
        let rooms = app.view(|s| s.get_rooms()).unwrap();
        assert_eq!(rooms[0].status, RoomStatus::Finished);
    }

    // Direct `merge()` unit test: a Finished status must outrank a concurrent
    // Active write even when the Active side carries a strictly later LWW
    // timestamp - the rank promotion in `Mergeable for RoomSummary` exists
    // exactly to stop the raw register LWW from silently regressing a
    // finished room back to Active.
    #[test]
    fn merge_finished_survives_later_stamped_active() {
        use calimero_storage::logical_clock::{HybridTimestamp, Timestamp, ID, NTP64};
        use std::num::NonZeroU128;

        let earlier = HybridTimestamp::zero();
        let later = HybridTimestamp::new(Timestamp::new(
            NTP64(1),
            ID::from(NonZeroU128::new(1).unwrap()),
        ));

        let mut finished = RoomSummary {
            name: "Table 1".into(),
            owner: "alice".into(),
            created_ms: 0,
            state: LwwRegister::new_with_metadata(
                RoomState { status: RoomStatus::Finished, context_id: Some("ctx-1".into()) },
                earlier,
                [1u8; 32],
            ),
        };
        let active_later = RoomSummary {
            name: "Table 1".into(),
            owner: "alice".into(),
            created_ms: 0,
            state: LwwRegister::new_with_metadata(
                RoomState { status: RoomStatus::Active, context_id: Some("ctx-1".into()) },
                later,
                [2u8; 32],
            ),
        };

        finished.merge(&active_later).unwrap();
        assert_eq!(finished.state.get().status, RoomStatus::Finished);
        assert_eq!(finished.state.get().context_id.as_deref(), Some("ctx-1"));
    }

    // The raced-finish case the reviewer flagged: a replica calls
    // `on_room_finished` before it has ever seen the link (context_id still
    // None), concurrently with a replica that already linked the room. The
    // Finished status wins (higher rank), but the context_id must NOT be
    // erased just because the winning-status side happened to be None.
    #[test]
    fn merge_preserves_context_id_across_a_raced_finish() {
        use calimero_storage::logical_clock::{HybridTimestamp, Timestamp, ID, NTP64};
        use std::num::NonZeroU128;

        let earlier = HybridTimestamp::zero();
        let later = HybridTimestamp::new(Timestamp::new(
            NTP64(1),
            ID::from(NonZeroU128::new(1).unwrap()),
        ));

        let mut linked = RoomSummary {
            name: "Table 1".into(),
            owner: "alice".into(),
            created_ms: 0,
            state: LwwRegister::new_with_metadata(
                RoomState { status: RoomStatus::Active, context_id: Some("ctx-1".into()) },
                earlier,
                [1u8; 32],
            ),
        };
        let finished_unlinked = RoomSummary {
            name: "Table 1".into(),
            owner: "alice".into(),
            created_ms: 0,
            state: LwwRegister::new_with_metadata(
                RoomState { status: RoomStatus::Finished, context_id: None },
                later,
                [2u8; 32],
            ),
        };

        linked.merge(&finished_unlinked).unwrap();
        assert_eq!(linked.state.get().status, RoomStatus::Finished);
        assert_eq!(linked.state.get().context_id.as_deref(), Some("ctx-1"));
    }
}
