//! Convergence + correctness for the retro-board's hand-written `Mergeable`.
//!
//! `CardEntry` nests a `LwwRegister<bool>` (`done`) and hand-writes
//! `Mergeable`/`RekeyTarget` — the #2577 case: without deterministic re-keying
//! the nested register would be last-writer-wins'd as an opaque blob. We seed
//! one card at genesis (single identity, snapshotted byte-identical into every
//! replica) so the `CardEntry` merge runs as identity-convergence, then drive
//! `toggle_done`, which `.set()`s the nested register on every replica. With the
//! re-key thunks registered the register converges as a child entity and the
//! toggle survives; without them it would be blob-LWW'd to a stale value.
//!
//! Why `toggle_done` is safe here despite being author/facilitator-gated:
//! `converge_app` only swaps the *storage* executor per replica (for delta
//! signing) — it never touches the SDK mock host, so `calimero_sdk::env::
//! executor_id()` (and the `caller()` built on it) returns ONE constant
//! (`DEFAULT_EXECUTOR_ID`) for genesis AND every replica op. The genesis
//! `add_card` therefore stamps `author` with that same constant, so the
//! per-op `caller() == author` gate passes on every replica. This is the same
//! reason a *per-voter* assertion is impossible here: every replica's
//! `upvote_card` would collapse to one caller-keyed vote. Per-voter union and
//! authorization are covered by the `TestHost` unit tests + merobox e2e.
//!
//! `#[serial]`: `converge_app` clears/repopulates the process-global merge
//! registry per run. Own integration binary so it is isolated from the in-`lib.rs`
//! `TestHost` unit tests.

use calimero_storage::testing::converge_app;
use serial_test::serial;
use sprint_retro_retro_board::RetroBoard;

#[test]
#[serial]
fn toggle_done_converges_and_card_survives() {
    // Register the nested-CRDT-value re-key thunks for `CardEntry` (its `done`
    // register). Without this the card blob is LWW'd and replicas can diverge.
    RetroBoard::__calimero_register_rekey();

    converge_app(|| {
        // Genesis seed (single identity): one card, written conflict-free and
        // snapshotted byte-identical into every replica. `done` starts false.
        let mut s = RetroBoard::init();
        let _ = s.add_card("action_items".into(), "Write the retro doc".into());
        s
    })
    .replicas(3)
    // Each replica toggles the seeded card's nested `done` register false -> true.
    // `toggle_done` touches only the `cards` map (the hand-written `Mergeable` +
    // nested register), which is the pure #2577 convergence case.
    .ops(|s| {
        if let Some(card) = s.get_cards().ok().and_then(|v| v.into_iter().next()) {
            let _ = s.toggle_done(card.id);
        }
    })
    .invariant(
        "the seeded card survives and its nested `done` register merged to true",
        |s| {
            let cards = s.get_cards().unwrap_or_default();
            cards.len() == 1 && cards[0].done
        },
    )
    .assert_all_replicas_equal();
}
