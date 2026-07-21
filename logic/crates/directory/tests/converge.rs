//! Convergence coverage for the directory (lobby) service.
//!
//! `RoomSummary` hand-writes `Mergeable`/`RekeyTarget` on its `rooms` map value
//! (it nests an `LwwRegister`), so this is the #2577 case: without deterministic
//! re-keying the nested register would be last-writer-wins'd as an opaque blob.
//! We register the generated re-key thunks (`__calimero_register_rekey()` - the
//! WASM-load / TestHost-bridge path) so the nested register gets a deterministic
//! id and converges as a child entity, then assert every replica lands on the
//! same Merkle root.
//!
//! `#[serial]`: `converge_app` clears/repopulates the process-global merge
//! registry per run (it self-serializes via an internal lock, but `#[serial]`
//! avoids the contention and matches the canonical core pattern).

use calimero_storage::testing::converge_app;
use foundation_directory::Directory;
use serial_test::serial;

// One room is seeded at genesis (single identity, snapshotted identically into
// every replica), so every replica starts from the same room id. Each replica
// then concurrently links that room to the same context id, in a per-replica
// shuffled order. The hand-written `RoomSummary` merge + nested-register
// re-key must converge all replicas to one Merkle root, and the linked state
// must survive (LWW, not blob-LWW'd to a stale/empty value).
#[test]
#[serial]
fn room_links_converge() {
    // Register the nested-CRDT-value re-key thunks for `RoomSummary` (its
    // `LwwRegister` field). Without this the value blob is LWW'd and replicas
    // can diverge.
    Directory::__calimero_register_rekey();

    converge_app(|| {
        // Genesis seed: runs once under the single genesis identity, then
        // snapshotted byte-identical into all replicas.
        let mut d = Directory::init();
        let _ = d.create_room("Table 1".into());
        d
    })
    .replicas(3)
    // Each replica concurrently links the single seeded room to the same
    // context id. `set_room_context_id` touches `rooms` only.
    .ops(|s| {
        if let Some(view) = s.get_rooms().ok().and_then(|v| v.into_iter().next()) {
            let _ = s.set_room_context_id(view.id, "ctx-1".into());
        }
    })
    .invariant("the single seeded room survives, linked and active", |s| {
        let rooms = s.get_rooms().unwrap_or_default();
        rooms.len() == 1
            && rooms[0].context_id.as_deref() == Some("ctx-1")
            && rooms[0].status == foundation_directory::RoomStatus::Active
    })
    .assert_all_replicas_equal();
}
