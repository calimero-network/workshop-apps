//! Convergence coverage for the standup board service.
//!
//! `StandupBoard` hand-writes `Mergeable` on `StandupEntry` (its
//! `UnorderedMap` value), so this exercises concurrent edits converging via the
//! last-`updated_at`-wins strategy. There are no nested CRDT fields, so no
//! `__calimero_register_rekey()` call is needed.
//!
//! `#[serial]`: `converge_app` clears/repopulates the process-global merge
//! registry per run.

use async_standup_standup::StandupBoard;
use calimero_storage::testing::converge_app;
use serial_test::serial;

#[test]
#[serial]
fn standup_edits_converge() {
    converge_app(|| {
        // Genesis seed: one entry posted under the single genesis identity.
        // All replicas start from this identical state.
        let mut s = StandupBoard::init();
        let _ = s.post_standup(
            "alice".into(),
            "genesis work".into(),
            "today work".into(),
            "none".into(),
        );
        s
    })
    .replicas(3)
    // Each replica concurrently edits the seeded entry to the same new content.
    // The hand-written Mergeable must converge all replicas to one Merkle root.
    .ops(|s| {
        if let Some(entry) = s.get_standups().ok().and_then(|v| v.into_iter().next()) {
            let _ = s.edit_standup(
                entry.id,
                "updated work".into(),
                "updated today".into(),
                "none".into(),
            );
        }
    })
    .invariant(
        "seeded entry survives and holds the merged (updated) content",
        |s| {
            s.get_standups()
                .map(|v| v.len() == 1 && v[0].yesterday == "updated work")
                .unwrap_or(false)
        },
    )
    .assert_all_replicas_equal();
}
