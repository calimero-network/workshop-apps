//! Convergence coverage for the reisetagebuch service.
//!
//! `Reisetagebuch` hand-writes `Mergeable`/`RekeyTarget` on `Postcard` (a
//! plain `UnorderedMap` value): a deterministic tie-break with no nested CRDT
//! field, so `RekeyTarget` is a no-op. This test proves concurrent inserts
//! from independent replicas converge to the same set on every node.
//!
//! Surface under test: the `postcards: UnorderedMap<String, Postcard>` field
//! only. The sibling `stamps: AuthoredMap` merges on the *signed* delta path
//! (`Interface::apply_action`) — the bare `converge_app` harness has no
//! signing identity and cannot reconcile authored deltas (see
//! `core/crates/storage/src/testing.rs` Limitations). `stamps`/`stamp_ids`
//! authorization and enumeration are covered by the in-`lib.rs` `TestHost`
//! tests instead; concurrent ops here touch only `postcards`, which is
//! plain-CRDT and safe for the bare harness.
//!
//! `#[serial]`: `converge_app` clears/repopulates the process-global merge
//! registry per run. Own integration binary so it is isolated from the
//! in-`lib.rs` `TestHost` unit tests.

use calimero_storage::testing::converge_app;
use serial_test::serial;
use tagebuch_thailand_reisetagebuch::Reisetagebuch;

// Each of the 3 replicas concurrently creates its own postcard (distinct
// generated ids). `UnorderedMap`'s union merge must land every replica on the
// same 3-entry set.
#[test]
#[serial]
fn postcards_converge() {
    converge_app(|| Reisetagebuch::init("Mia".into(), "Jonas".into(), "2024-08-08".into()))
        .replicas(3)
        .ops(|s| {
            let _ = s.create_postcard(
                1,
                "Bangkok".into(),
                "day one".into(),
                "blob-1".into(),
                2,
                3,
            );
        })
        .invariant(
            "every concurrently created postcard survives the merge",
            |s| s.list_postcards().map(|p| p.len() == 3).unwrap_or(false),
        )
        .assert_all_replicas_equal();
}
