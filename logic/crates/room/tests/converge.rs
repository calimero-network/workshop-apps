//! Convergence coverage for the snake-arcade room service.
//!
//! `DuelRecord` (the `duels: UnorderedMap<String, DuelRecord>` value) is a
//! struct of `LwwRegister` fields with `#[derive(Mergeable)]` — the derive
//! generates both `Mergeable` and the required `RekeyTarget`, so its nested
//! registers need the same deterministic re-key wiring as a hand-written
//! nested-CRDT value (the #2577 case): without it a nested register would be
//! last-writer-wins'd as an opaque blob. We register the generated re-key
//! thunks (`__calimero_register_rekey()`) so each nested register gets a
//! deterministic id and converges as a child entity, then assert every
//! replica lands on the same Merkle root.
//!
//! Surface under test: the `duels: UnorderedMap<String, DuelRecord>` field
//! only. The sibling `members`/`duel_results` `AuthoredMap`s merge on the
//! *signed* delta path (`Interface::apply_action`) — the bare `converge_app`
//! harness has no signing identity and cannot reconcile those deltas (see
//! `core/crates/storage/src/testing.rs` Limitations). `start_duel` never
//! touches either `AuthoredMap`, so genesis seeding needs no extra care here;
//! we just seed one active duel and then drive concurrent `finish_duel`
//! calls, which touch `duels` exclusively.
//!
//! `#[serial]`: `converge_app` clears/repopulates the process-global merge
//! registry per run (it self-serializes via an internal lock, but `#[serial]`
//! avoids the contention and matches the canonical core pattern —
//! `apps/team-metrics-custom/tests/converge.rs`). Own integration binary so it
//! is isolated from the in-`lib.rs` `TestHost` unit tests.

use calimero_storage::testing::converge_app;
use serial_test::serial;
use snake_arcade_room::RoomState;

// One duel is seeded at genesis (under the genesis identity, before any
// concurrent op), so every replica starts from the identical seeded state.
// Each replica then concurrently `finish_duel`s that same duel, in a
// per-replica shuffled order. The derived `Mergeable`/`RekeyTarget` on
// `DuelRecord` must converge all replicas to one Merkle root, and the
// "finished" transition + `ended_at` timestamp must survive (LWW, not
// blob-LWW'd back to "active").
#[test]
#[serial]
fn duel_finish_converges() {
    // Register the nested-CRDT-value re-key thunks for `DuelRecord` (its
    // `LwwRegister` fields). Without this the value blob is LWW'd and
    // replicas can diverge.
    RoomState::__calimero_register_rekey();

    converge_app(|| {
        // Genesis seed: runs once under the single genesis identity. `start_duel`
        // only touches `duels` (no `members`/`duel_results` write), so this is
        // snapshotted byte-identical into every replica with no concurrent
        // AuthoredMap merge involved.
        let mut s = RoomState::init();
        let _ = s.start_duel(60);
        s
    })
    .replicas(3)
    // Each replica concurrently finishes the single seeded duel. `finish_duel`
    // touches `duels` only, so this is the pure nested-register convergence case.
    .ops(|s| {
        if let Some(duel) = s.get_duels().ok().and_then(|v| v.into_iter().next()) {
            let _ = s.finish_duel(duel.id);
        }
    })
    .invariant(
        "the single seeded duel survives and is finished with an end timestamp",
        |s| {
            let duels = s.get_duels().unwrap_or_default();
            duels.len() == 1 && duels[0].status == "finished" && duels[0].ended_at.is_some()
        },
    )
    .assert_all_replicas_equal();
}
