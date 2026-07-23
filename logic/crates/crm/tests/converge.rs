//! Convergence coverage for the team CRM service's shared pipeline.
//!
//! `DealRecord` (and `ContactRecord`/`InteractionRecord`) nest `LwwRegister`
//! fields and derive `Mergeable` via `#[derive(Mergeable)]`. That derive also
//! generates the `RekeyTarget` re-keying required for a struct that nests a
//! CRDT and is stored as a map value (the #2577 case) — without it, the
//! nested register would be last-writer-wins'd as an opaque blob instead of
//! converging as a child entity. We register the generated re-key thunks
//! (`__calimero_register_rekey()`) and assert every replica lands on the same
//! Merkle root after concurrently moving one deal through pipeline stages —
//! directly exercising the "pipeline view always reflects the current stage,
//! live" acceptance criterion.
//!
//! Surface under test: the `deals: UnorderedMap<String, DealRecord>` field
//! only. The sibling `contacts: UnorderedMap` is seeded once at genesis
//! (single identity, snapshotted identically into every replica) and never
//! touched by the concurrent ops, and `interactions`/`interaction_ids`
//! (`AuthoredMap`/`UnorderedSet`) aren't touched at all — the bare
//! `converge_app` harness has no signing identity and cannot reconcile the
//! signed-delta path `AuthoredMap` merges on.
//!
//! `#[serial]`: `converge_app` clears/repopulates the process-global merge
//! registry per run. Own integration binary so it is isolated from the
//! in-`lib.rs` `TestHost` unit tests.

use calimero_storage::testing::converge_app;
use serial_test::serial;
use team_crm_crm::CrmState;

// One contact and one deal are seeded at genesis (under the genesis identity,
// before any concurrent op), so every replica starts from the identical
// seeded state. Each replica then concurrently moves that deal to the same
// new stage, in a per-replica shuffled order. The derived `DealRecord` merge
// + nested-register re-key must converge all replicas to one Merkle root,
// and the stage must survive (LWW, not blob-LWW'd to a stale/empty value).
#[test]
#[serial]
fn deal_stage_updates_converge() {
    // Register the nested-CRDT-value re-key thunks for `DealRecord` (its
    // `LwwRegister` fields). Without this the value blob is LWW'd and
    // replicas can diverge.
    CrmState::__calimero_register_rekey();

    converge_app(|| {
        // Genesis seed: runs once under the single genesis identity, so no
        // concurrent merge is involved in creating the contact or the deal.
        let mut s = CrmState::init();
        let contact_id = s
            .add_contact(
                "Jane Doe".into(),
                "jane@acme.com".into(),
                "555-0101".into(),
                "Acme Co".into(),
            )
            .unwrap();
        let _ = s.create_deal(contact_id, "Acme renewal".into(), 5000).unwrap();
        s
    })
    .replicas(3)
    // Each replica concurrently rewrites the single seeded deal's stage.
    // `update_deal_stage` touches `deals` only (no `contacts`/`interactions`
    // write), so this is the pure nested-register convergence case.
    .ops(|s| {
        if let Some(deal) = s.list_deals().ok().and_then(|v| v.into_iter().next()) {
            let _ = s.update_deal_stage(deal.id, "Proposal".into());
        }
    })
    .invariant("the single seeded deal survives and holds the merged stage", |s| {
        let deals = s.list_deals().unwrap_or_default();
        deals.len() == 1 && deals[0].stage == "Proposal"
    })
    .assert_all_replicas_equal();
}
