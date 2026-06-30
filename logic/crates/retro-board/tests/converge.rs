//! Convergence + correctness for the retro-board's hand-written `Mergeable`.
//!
//! `CardEntry` nests a `LwwRegister<bool>` (`done`) and hand-writes
//! `Mergeable`/`RekeyTarget` — the #2577 case: without deterministic re-keying
//! the nested register would be last-writer-wins'd as an opaque blob. We seed
//! one card at genesis (single identity, snapshotted byte-identical into every
//! replica) so the `CardEntry` merge runs as identity-convergence and its nested
//! register must re-key to the same id on every replica, then drive the
//! **ungated** `upvote_card` op: each replica votes under its own executor id, so
//! the votes map (`UnorderedMap<String, LwwRegister<u64>>`) union-merges to one
//! vote per replica.
//!
//! `toggle_done`/`delete_card` are author/facilitator-gated (an authorization,
//! not a merge), and the bare harness applies each replica's ops under a
//! distinct non-genesis executor — so the gate would reject them. Authorization
//! is covered by the `TestHost` unit tests + merobox e2e, never here.
//!
//! `#[serial]`: `converge_app` clears/repopulates the process-global merge
//! registry per run. Own integration binary so it is isolated from the in-`lib.rs`
//! `TestHost` unit tests.

use calimero_storage::testing::converge_app;
use serial_test::serial;
use sprint_retro_retro_board::RetroBoard;

#[test]
#[serial]
fn votes_union_and_card_survives() {
    // Register the nested-CRDT-value re-key thunks for `CardEntry` (its `done`
    // register). Without this the card blob is LWW'd and replicas can diverge.
    RetroBoard::__calimero_register_rekey();

    converge_app(|| {
        // Genesis seed (single identity): one card, written conflict-free and
        // snapshotted byte-identical into every replica.
        let mut s = RetroBoard::init();
        let _ = s.add_card("action_items".into(), "Write the retro doc".into());
        s
    })
    .replicas(3)
    // Each replica upvotes the seeded card once under its own executor id, so the
    // three votes carry distinct `card_id|voter` keys and must all survive.
    .ops(|s| {
        if let Some(card) = s.get_cards().ok().and_then(|v| v.into_iter().next()) {
            let _ = s.upvote_card(card.id);
        }
    })
    .invariant(
        "the seeded card survives and every replica's vote is unioned",
        |s| {
            let cards = s.get_cards().unwrap_or_default();
            cards.len() == 1
                && s.get_votes(cards[0].id.clone())
                    .map(|v| v.len() == 3)
                    .unwrap_or(false)
        },
    )
    .assert_all_replicas_equal();
}
