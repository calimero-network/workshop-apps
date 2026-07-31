//! Convergence coverage for `Pin`'s hand-written `Mergeable`/`RekeyTarget`.
//!
//! `Pin` nests a `LwwRegister` for `text`, so this is the #2577 case: without
//! deterministic re-keying the nested register would be last-writer-wins'd as
//! an opaque blob. We register the re-key thunk for `Pin`
//! (`register_rekey_cascade::<Pin>()`) so the nested register gets a
//! deterministic id and converges as a child entity, then assert every
//! replica lands on the same Merkle root and the merged text survives.
//!
//! This drives convergence on a MINIMAL wrapper around
//! `UnorderedMap<String, Pin>` — deliberately NOT through `DesignReview`'s
//! `edit_pin` method / `converge_app`. `edit_pin` is author-gated: it compares
//! `pin_owners.owner_of(..)` (stamped via `calimero_storage`'s per-replica
//! executor identity, which `converge_app` DOES vary per replica via
//! `env_for`/`executor_for`) against `calimero_sdk::env::executor_id()` (the
//! SDK's own native mock-host identity, a SEPARATE thread-local that
//! `converge_app` never touches — it stays at the mock host's fixed default
//! for the whole run, for every replica). Those two identity sources can
//! never be made equal from within this harness (there's no public hook to
//! align them, and the genesis/replica executor ids are hardcoded by the
//! harness itself), so any op driving `edit_pin` would be rejected
//! deterministically on every replica, regardless of seed — proving nothing
//! about the CRDT merge itself. (Filed as a `calimero-storage`
//! testing-harness gap via `report_sdk_issue`.)
//!
//! Authorization itself (only the author may edit/remove a pin) is already
//! covered by the `TestHost` unit tests in `src/lib.rs`
//! (`author_can_edit_own_pin` / `non_author_cannot_edit_pin`), which run
//! through the SDK's `TestHost` bridge that keeps both identity sources in
//! sync — unlike the bare `converge_app`/`converge_with` harness.
//!
//! `#[serial]`: the harness clears/repopulates the process-global merge
//! registry per run (self-serializing internally, but `#[serial]` avoids lock
//! contention and matches the canonical core pattern). Own integration binary
//! so it is isolated from the in-`lib.rs` `TestHost` unit tests.

use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_storage::address::Id;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::rekey::{field_child_id, register_rekey_cascade, RekeyTarget};
use calimero_storage::collections::{LwwRegister, Mergeable, UnorderedMap};
use calimero_storage::testing::converge_with;
use pinpoint_feedback_design_review::Pin;
use serial_test::serial;

/// Isolates exactly the field under test — no authorship layer, so the merge
/// this test exercises is precisely `Pin`'s hand-written `Mergeable` +
/// `RekeyTarget`, nothing else.
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
struct PinsOnly {
    pins: UnorderedMap<String, Pin>,
}

impl Mergeable for PinsOnly {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        self.pins.merge(&other.pins)
    }
}

// `Mergeable` requires `RekeyTarget` as a supertrait. `PinsOnly` is a plain
// top-level wrapper (not `#[app::state]`, which would generate this), so it
// needs the impl by hand — re-key the `pins` field under a namespaced child
// of the type's own id, mirroring the `NestedMaps`/`AppWithNestedMap` shape
// in calimero-storage's own merge_integration tests.
impl RekeyTarget for PinsOnly {
    fn rekey_relative_to(&mut self, parent_id: Id) {
        calimero_storage::rekey_field_if_supported!(
            &mut self.pins,
            field_child_id(parent_id, "pins")
        );
    }
}

// A single pin is seeded at genesis. Every replica then concurrently
// overwrites its `text` register; the hand-written `Pin` merge + nested-
// register re-key must converge all replicas to one Merkle root, and the
// edited text must survive (LWW, not blob-LWW'd to a stale/empty value).
#[test]
#[serial]
fn pin_edits_converge() {
    // Register the nested-CRDT-value re-key thunk for `Pin` (its
    // `LwwRegister` `text` field). Without this the value blob is LWW'd and
    // replicas can diverge. `UnorderedMap` self-registers in its own
    // constructor, so only the custom nested type needs this explicit call.
    register_rekey_cascade::<Pin>();

    converge_with(|| {
        let mut s = PinsOnly {
            pins: UnorderedMap::new_with_field_name("design_review:pins"),
        };
        let pin = Pin {
            mockup_id: "mockup-1".into(),
            x: 0.1,
            y: 0.2,
            text: LwwRegister::new("v0".into()),
            created_at: 0,
        };
        s.pins.insert("pin-1".into(), pin).expect("seed pin");
        s
    })
    .replicas(3)
    // Each replica concurrently rewrites the single seeded pin's text.
    .ops(|s| {
        if let Ok(Some(mut guard)) = s.pins.get_mut("pin-1") {
            guard.text.set("v1".into());
        }
    })
    .invariant("the single seeded pin survives and holds the merged text", |s| {
        s.pins
            .get("pin-1")
            .ok()
            .flatten()
            .map(|p| p.text.get().as_str() == "v1")
            .unwrap_or(false)
    })
    .assert_all_replicas_equal();
}
