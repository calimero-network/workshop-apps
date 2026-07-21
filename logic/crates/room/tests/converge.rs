//! Convergence coverage for the room (per-session) service.
//!
//! `Item` hand-writes `Mergeable`/`RekeyTarget` on its `items` map value (it
//! nests an `LwwRegister`), so this is the #2577 case: without deterministic
//! re-keying the nested register would be last-writer-wins'd as an opaque blob.
//! We register the generated re-key thunks (`__calimero_register_rekey()` - the
//! WASM-load / TestHost-bridge path) so the nested register gets a deterministic
//! id and converges as a child entity, then assert every replica lands on the
//! same Merkle root.
//!
//! Surface under test: the `items: UnorderedMap<String, Item>` field only. The
//! `members` set is per-caller-keyed (the `converge_app` caller-fan-out trap -
//! every replica shares one executor id, which would collapse distinct
//! identities into one key) and is NOT exercised here; that invariant has its
//! own `TestHost::call_as` coverage in `src/lib.rs`.
//!
//! `#[serial]`: `converge_app` clears/repopulates the process-global merge
//! registry per run (it self-serializes via an internal lock, but `#[serial]`
//! avoids the contention and matches the canonical core pattern).

use calimero_storage::testing::converge_app;
use foundation_room::Room;
use serial_test::serial;

// The room is seeded at genesis with `min_members_to_start: 1` (single
// identity, snapshotted identically into every replica), so the gate is
// already open when genesis joins and adds one item. Each replica then
// concurrently `update`s that item's nested `LwwRegister` to the same value,
// in a per-replica shuffled order. The hand-written `Item` merge +
// nested-register re-key must converge all replicas to one Merkle root, and
// the value must survive (LWW, not blob-LWW'd to a stale/empty value).
#[test]
#[serial]
fn room_item_updates_converge() {
    // Register the nested-CRDT-value re-key thunks for `Item` (its `LwwRegister`
    // field). Without this the value blob is LWW'd and replicas can diverge.
    Room::__calimero_register_rekey();

    converge_app(|| {
        // Genesis seed: runs once under the single genesis identity, opens the
        // gate (min 1), adds one item, then is snapshotted byte-identical into
        // all replicas.
        let mut r = Room::init("11111111111111111111111111111111".into(), "room-1".into(), 1);
        let _ = r.join_room();
        let _ = r.add("widget".into(), "v0".into());
        r
    })
    .replicas(3)
    // Each replica concurrently rewrites the single seeded item's value.
    // `update` touches `items` only (no `members` write), so this is the pure
    // nested-register convergence case.
    .ops(|s| {
        if let Some(view) = s.list().ok().and_then(|v| v.into_iter().next()) {
            let _ = s.update(view.id, "v1".into());
        }
    })
    .invariant("the single seeded item survives and holds the merged value", |s| {
        let items = s.list().unwrap_or_default();
        items.len() == 1 && items[0].value == "v1"
    })
    .assert_all_replicas_equal();
}
