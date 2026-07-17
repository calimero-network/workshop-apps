//! Snake-arcade room service — shared member status, timed duels, and an
//! all-time leaderboard.
//!
//! - `members: AuthoredMap<String, PlayerStatusData>` — each player owns and
//!   updates only their own status/live-score/live-length/best-score entry,
//!   keyed by their base58 executor id. Structurally prevents spoofing
//!   another player's status.
//! - `duels: UnorderedMap<String, DuelRecord>` — a duel is shared: any room
//!   member may finish it once the timer elapses, not just the initiator.
//!   `DuelRecord` derives `Mergeable` (all fields are already CRDTs, so the
//!   derive generates both `Mergeable` and the required `RekeyTarget` for its
//!   nested `LwwRegister`s — no hand-written impl needed).
//! - `duel_results: AuthoredMap<String, DuelResultData>` — one entry per
//!   participant per duel; only the submitting player may edit/remove their
//!   own result.

use calimero_sdk::app;
use calimero_sdk::app::Mergeable;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::{AuthoredMap, LwwRegister, UnorderedMap};
use calimero_storage::env as storage_env;
use snake_arcade_types::{generate_id, Error};

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// Internal `members` map value. Every field is a CRDT so `#[derive(Mergeable)]`
/// can generate both `Mergeable` and `RekeyTarget`. Only the owning player ever
/// writes their own entry (via `AuthoredMap`), so merges only happen when the
/// same player's writes race across replicas.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Mergeable)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct PlayerStatusData {
    pub status: LwwRegister<String>,
    pub live_score: LwwRegister<u32>,
    pub live_length: LwwRegister<u32>,
    pub best_score: LwwRegister<u32>,
    pub updated_at: LwwRegister<u64>,
}

/// Read-shaped view of a room member, returned to callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct PlayerStatus {
    pub player: String,
    pub status: String,
    pub live_score: u32,
    pub live_length: u32,
    pub best_score: u32,
    pub updated_at: u64,
}

/// Internal `duels` map value. Shared/CRDT: any member may transition
/// `status` from `"active"` to `"finished"`.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Mergeable)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct DuelRecord {
    pub initiator: LwwRegister<String>,
    pub status: LwwRegister<String>,
    pub duration_seconds: LwwRegister<u32>,
    pub started_at: LwwRegister<u64>,
    pub ended_at: LwwRegister<Option<u64>>,
}

/// Read-shaped view of a duel, returned to callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct Duel {
    pub id: String,
    pub initiator: String,
    pub status: String,
    pub duration_seconds: u32,
    pub started_at: u64,
    pub ended_at: Option<u64>,
}

/// Internal `duel_results` map value. Authored: only the submitting player
/// may edit/remove their own result (not exposed via any method today, but
/// structurally enforced regardless).
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Mergeable)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct DuelResultData {
    pub duel_id: LwwRegister<String>,
    pub score: LwwRegister<u32>,
    pub length: LwwRegister<u32>,
    pub created_at: LwwRegister<u64>,
}

/// Read-shaped view of a duel result, returned to callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct DuelResult {
    pub id: String,
    pub duel_id: String,
    pub author: String,
    pub score: u32,
    pub length: u32,
    pub created_at: u64,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// `#[app::state]` injects the borsh derives itself (SDK 0.11+); a manual
// derive here would collide.
#[app::state(emits = for<'a> Event<'a>)]
pub struct RoomState {
    /// One entry per player, keyed by their base58 executor id. `AuthoredMap`
    /// structurally prevents a player from writing anyone else's status.
    members: AuthoredMap<String, PlayerStatusData>,
    /// All duels ever started, keyed by generated id. `UnorderedMap`: any
    /// room member may finish an in-progress duel once its timer elapses.
    duels: UnorderedMap<String, DuelRecord>,
    /// All duel results ever submitted, keyed by generated id. `AuthoredMap`:
    /// only the submitting player owns their own result entry.
    duel_results: AuthoredMap<String, DuelResultData>,
}

#[app::logic]
impl RoomState {
    #[app::init]
    pub fn init() -> RoomState {
        RoomState {
            members: AuthoredMap::new_with_field_name("room:members"),
            duels: UnorderedMap::new_with_field_name("room:duels"),
            duel_results: AuthoredMap::new_with_field_name("room:duel_results"),
        }
    }

    // ---- Member status ----

    /// Update the caller's own live status/score/length. Bumps `best_score`
    /// if this score beats the player's previous best. Inserts a new entry
    /// on the player's first call, otherwise updates in place (author-gated
    /// by `AuthoredMap`, so no one else can spoof this player's status).
    pub fn update_status(&mut self, status: String, score: u32, length: u32) -> app::Result<()> {
        let player = self.caller_b58();
        let now = storage_env::time_now() / 1_000_000;

        if let Some(mut data) = self
            .members
            .get(&player)
            .map_err(|e| AppError::msg(format!("members.get: {e}")))?
        {
            data.status.set(status);
            data.live_score.set(score);
            data.live_length.set(length);
            if score > *data.best_score.get() {
                data.best_score.set(score);
            }
            data.updated_at.set(now);
            self.members
                .update(&player, data)
                .map_err(map_member_error())?;
        } else {
            let data = PlayerStatusData {
                status: LwwRegister::new(status),
                live_score: LwwRegister::new(score),
                live_length: LwwRegister::new(length),
                best_score: LwwRegister::new(score),
                updated_at: LwwRegister::new(now),
            };
            self.members
                .insert(player.clone(), data)
                .map_err(|e| AppError::msg(format!("members.insert: {e}")))?;
        }

        app::emit!(Event::MemberStatusUpdated { player: &player });
        Ok(())
    }

    /// List every room member's live status/score/length/best score.
    pub fn list_members(&self) -> app::Result<Vec<PlayerStatus>> {
        let mut out: Vec<PlayerStatus> = self
            .members
            .entries()
            .map_err(|e| AppError::msg(format!("members.entries: {e}")))?
            .map(|(player, data)| self.to_player_view(player, &data))
            .collect();
        out.sort_by(|a, b| a.player.cmp(&b.player));
        Ok(out)
    }

    /// All-time leaderboard: every player's best-ever score, highest first.
    pub fn get_leaderboard(&self) -> app::Result<Vec<PlayerStatus>> {
        let mut out: Vec<PlayerStatus> = self
            .members
            .entries()
            .map_err(|e| AppError::msg(format!("members.entries: {e}")))?
            .map(|(player, data)| self.to_player_view(player, &data))
            .collect();
        out.sort_by(|a, b| b.best_score.cmp(&a.best_score).then_with(|| a.player.cmp(&b.player)));
        Ok(out)
    }

    // ---- Duels ----

    /// Start a new timed duel. Rejected while another duel is still active.
    pub fn start_duel(&mut self, duration_seconds: u32) -> app::Result<String> {
        let already_active = self
            .duels
            .entries()
            .map_err(|e| AppError::msg(format!("duels.entries: {e}")))?
            .any(|(_, record)| record.status.get() == "active");
        if already_active {
            app::bail!(Error::Invalid(
                "a duel is already in progress".into()
            ));
        }

        let now = storage_env::time_now();
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("duel", now, &nonce);
        let now_ms = now / 1_000_000;
        let initiator = self.caller_b58();

        let record = DuelRecord {
            initiator: LwwRegister::new(initiator.clone()),
            status: LwwRegister::new("active".to_string()),
            duration_seconds: LwwRegister::new(duration_seconds),
            started_at: LwwRegister::new(now_ms),
            ended_at: LwwRegister::new(None),
        };
        self.duels
            .insert(id.clone(), record)
            .map_err(|e| AppError::msg(format!("duels.insert: {e}")))?;

        app::emit!(Event::DuelStarted {
            id: &id,
            initiator: &initiator,
        });
        Ok(id)
    }

    /// Record the caller's result for a duel, and bump their all-time best
    /// score if this duel score beats it (leaderboard update).
    pub fn submit_duel_result(&mut self, duel_id: String, score: u32, length: u32) -> app::Result<String> {
        if self
            .duels
            .get(&duel_id)
            .map_err(|e| AppError::msg(format!("duels.get: {e}")))?
            .is_none()
        {
            app::bail!(Error::NotFound(duel_id));
        }

        let now = storage_env::time_now();
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("result", now, &nonce);
        let now_ms = now / 1_000_000;
        let author = self.caller_b58();

        let data = DuelResultData {
            duel_id: LwwRegister::new(duel_id.clone()),
            score: LwwRegister::new(score),
            length: LwwRegister::new(length),
            created_at: LwwRegister::new(now_ms),
        };
        self.duel_results
            .insert(id.clone(), data)
            .map_err(|e| AppError::msg(format!("duel_results.insert: {e}")))?;

        self.bump_best_score(score, length, now_ms)?;

        app::emit!(Event::DuelResultSubmitted {
            id: &id,
            duel_id: &duel_id,
            author: &author,
        });
        Ok(id)
    }

    /// Mark a duel finished once its timer elapses. Any room member may call
    /// this (shared, not owner-gated) — idempotent if already finished.
    pub fn finish_duel(&mut self, duel_id: String) -> app::Result<()> {
        let mut guard = self
            .duels
            .get_mut(&duel_id)
            .map_err(|e| AppError::msg(format!("duels.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(duel_id.clone())))?;

        if guard.status.get() == "finished" {
            return Ok(());
        }

        let now_ms = storage_env::time_now() / 1_000_000;
        guard.status.set("finished".to_string());
        guard.ended_at.set(Some(now_ms));
        drop(guard);

        app::emit!(Event::DuelFinished { id: &duel_id });
        Ok(())
    }

    /// All duels ever started, most recently started first.
    pub fn get_duels(&self) -> app::Result<Vec<Duel>> {
        let mut out: Vec<Duel> = self
            .duels
            .entries()
            .map_err(|e| AppError::msg(format!("duels.entries: {e}")))?
            .map(|(id, record)| self.to_duel_view(id, &record))
            .collect();
        out.sort_by(|a, b| b.started_at.cmp(&a.started_at).then_with(|| a.id.cmp(&b.id)));
        Ok(out)
    }

    /// Every participant's result for one duel.
    pub fn get_duel_results(&self, duel_id: String) -> app::Result<Vec<DuelResult>> {
        let mut out: Vec<DuelResult> = self
            .duel_results
            .entries()
            .map_err(|e| AppError::msg(format!("duel_results.entries: {e}")))?
            .filter(|(_, data)| data.duel_id.get() == &duel_id)
            .map(|(id, data)| self.to_result_view(id, &data))
            .collect::<app::Result<_>>()?;
        out.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.id.cmp(&b.id)));
        Ok(out)
    }
}

impl RoomState {
    /// Base58 of the current executor — the public, shareable player identity.
    fn caller_b58(&self) -> String {
        bs58::encode(env::executor_id()).into_string()
    }

    /// Bump the caller's all-time best score (leaderboard) after a duel
    /// result, creating their member entry (idle, since they aren't in an
    /// active local game right now) if this is their first appearance.
    fn bump_best_score(&mut self, score: u32, length: u32, now_ms: u64) -> app::Result<()> {
        let player = self.caller_b58();
        if let Some(mut data) = self
            .members
            .get(&player)
            .map_err(|e| AppError::msg(format!("members.get: {e}")))?
        {
            if score > *data.best_score.get() {
                data.best_score.set(score);
                data.updated_at.set(now_ms);
                self.members
                    .update(&player, data)
                    .map_err(map_member_error())?;
            }
        } else {
            let data = PlayerStatusData {
                status: LwwRegister::new("idle".to_string()),
                live_score: LwwRegister::new(score),
                live_length: LwwRegister::new(length),
                best_score: LwwRegister::new(score),
                updated_at: LwwRegister::new(now_ms),
            };
            self.members
                .insert(player, data)
                .map_err(|e| AppError::msg(format!("members.insert: {e}")))?;
        }
        Ok(())
    }

    fn to_player_view(&self, player: String, data: &PlayerStatusData) -> PlayerStatus {
        PlayerStatus {
            player,
            status: data.status.get().clone(),
            live_score: *data.live_score.get(),
            live_length: *data.live_length.get(),
            best_score: *data.best_score.get(),
            updated_at: *data.updated_at.get(),
        }
    }

    fn to_duel_view(&self, id: String, record: &DuelRecord) -> Duel {
        Duel {
            id,
            initiator: record.initiator.get().clone(),
            status: record.status.get().clone(),
            duration_seconds: *record.duration_seconds.get(),
            started_at: *record.started_at.get(),
            ended_at: *record.ended_at.get(),
        }
    }

    fn to_result_view(&self, id: String, data: &DuelResultData) -> app::Result<DuelResult> {
        let author = self
            .duel_results
            .owner_of(&id)
            .map_err(|e| AppError::msg(format!("duel_results.owner_of: {e}")))?
            .map(String::from)
            .unwrap_or_default();
        Ok(DuelResult {
            id,
            duel_id: data.duel_id.get().clone(),
            author,
            score: *data.score.get(),
            length: *data.length.get(),
            created_at: *data.created_at.get(),
        })
    }
}

/// Translate an `AuthoredMap` access-control error on `members` into a
/// friendly `Forbidden`. Should not be reachable through the public API today
/// (every write targets the caller's own key), but kept for defense in depth.
fn map_member_error() -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(Error::Forbidden(
                "only a player may update their own status".into(),
            ))
        } else {
            AppError::msg(format!("members.update: {s}"))
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

    const ALICE: [u8; 32] = [1u8; 32];
    const BOB: [u8; 32] = [2u8; 32];

    #[test]
    fn update_status_then_list_members() {
        let mut app = TestHost::new(RoomState::init);

        app.call(|s| s.update_status("playing".into(), 40, 6)).unwrap();
        let members = app.view(|s| s.list_members()).unwrap();
        assert_eq!(members.len(), 1);
        assert_eq!(members[0].status, "playing");
        assert_eq!(members[0].live_score, 40);
        assert_eq!(members[0].live_length, 6);
        assert_eq!(members[0].best_score, 40);
        // update_status emits exactly one event per call.
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn best_score_never_regresses() {
        let mut app = TestHost::new(RoomState::init);

        app.call(|s| s.update_status("playing".into(), 40, 6)).unwrap();
        app.call(|s| s.update_status("playing".into(), 20, 4)).unwrap();
        let members = app.view(|s| s.list_members()).unwrap();
        assert_eq!(members[0].live_score, 20);
        assert_eq!(members[0].best_score, 40);

        app.call(|s| s.update_status("idle".into(), 55, 9)).unwrap();
        let members = app.view(|s| s.list_members()).unwrap();
        assert_eq!(members[0].status, "idle");
        assert_eq!(members[0].best_score, 55);
    }

    #[test]
    fn distinct_players_get_distinct_entries() {
        let mut app = TestHost::new(RoomState::init);

        app.call_as(ALICE, |s| s.update_status("playing".into(), 10, 3))
            .unwrap();
        app.call_as(BOB, |s| s.update_status("playing".into(), 15, 4))
            .unwrap();

        let members = app.view(|s| s.list_members()).unwrap();
        assert_eq!(members.len(), 2);
    }

    #[test]
    fn start_duel_then_get_duels() {
        let mut app = TestHost::new(RoomState::init);

        let id = app.call(|s| s.start_duel(60)).unwrap();
        let duels = app.view(|s| s.get_duels()).unwrap();
        assert_eq!(duels.len(), 1);
        assert_eq!(duels[0].id, id);
        assert_eq!(duels[0].status, "active");
        assert_eq!(duels[0].duration_seconds, 60);
        assert!(duels[0].ended_at.is_none());
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn cannot_start_duel_while_one_active() {
        let mut app = TestHost::new(RoomState::init);

        app.call(|s| s.start_duel(60)).unwrap();
        assert!(app.call(|s| s.start_duel(30)).is_err());
    }

    #[test]
    fn finish_duel_sets_status_and_ended_at() {
        let mut app = TestHost::new(RoomState::init);

        let id = app.call(|s| s.start_duel(60)).unwrap();
        app.call(|s| s.finish_duel(id.clone())).unwrap();

        let duels = app.view(|s| s.get_duels()).unwrap();
        assert_eq!(duels[0].status, "finished");
        assert!(duels[0].ended_at.is_some());

        // Finishing an already-finished duel is a no-op, not an error.
        app.call(|s| s.finish_duel(id)).unwrap();
    }

    #[test]
    fn finish_unknown_duel_errors() {
        let mut app = TestHost::new(RoomState::init);
        assert!(app.call(|s| s.finish_duel("nope".into())).is_err());
    }

    #[test]
    fn submit_duel_result_and_get_results() {
        let mut app = TestHost::new(RoomState::init);

        let duel_id = app.call(|s| s.start_duel(60)).unwrap();
        app.call_as(ALICE, |s| s.submit_duel_result(duel_id.clone(), 55, 8))
            .unwrap();
        app.call_as(BOB, |s| s.submit_duel_result(duel_id.clone(), 48, 7))
            .unwrap();
        app.call(|s| s.finish_duel(duel_id.clone())).unwrap();

        let results = app.view(|s| s.get_duel_results(duel_id)).unwrap();
        assert_eq!(results.len(), 2);
        // Highest score first — the winner.
        assert_eq!(results[0].score, 55);
        assert_eq!(results[1].score, 48);
    }

    #[test]
    fn submit_result_for_unknown_duel_errors() {
        let mut app = TestHost::new(RoomState::init);
        assert!(app
            .call(|s| s.submit_duel_result("nope".into(), 10, 2))
            .is_err());
    }

    #[test]
    fn duel_result_bumps_leaderboard_best_score() {
        let mut app = TestHost::new(RoomState::init);

        let duel_id = app.call(|s| s.start_duel(60)).unwrap();
        app.call_as(ALICE, |s| s.submit_duel_result(duel_id.clone(), 90, 12))
            .unwrap();
        app.call_as(BOB, |s| s.submit_duel_result(duel_id, 30, 5))
            .unwrap();

        let board = app.view(|s| s.get_leaderboard()).unwrap();
        assert_eq!(board.len(), 2);
        assert_eq!(board[0].best_score, 90);
        assert_eq!(board[1].best_score, 30);
    }
}
