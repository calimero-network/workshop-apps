//! Convergence coverage for the vector-store service.
//!
//! `VectorStore` hand-writes `Mergeable`/`RekeyTarget` on `KnowledgeEntryData`
//! (its `LwwRegister<Vec<String>>` tags field and `LwwRegister<Option<String>>`
//! collection_id field are nested CRDTs). Without deterministic re-keying those
//! registers would be LWW'd as opaque blobs; with the re-key thunks every
//! replica derives the same child ids and they converge.
//!
//! Surface under test: the `entries: UnorderedMap<String, KnowledgeEntryData>`
//! field only. The sibling `entry_owners: AuthoredMap` is seeded once at genesis
//! (single identity, snapshotted byte-identical into every replica — no
//! concurrent AuthoredMap merge) and then only read by `update_entry_tags`'s
//! authorship check. The ops themselves write only to `entries` (tags LwwRegister),
//! which is the pure nested-register #2577 convergence case.
//!
//! `#[serial]`: `converge_app` clears/repopulates the process-global merge
//! registry per run. Own integration binary so it is isolated from the in-lib.rs
//! TestHost unit tests.

use calimero_storage::testing::converge_app;
use serial_test::serial;
use vector_knowledge_base_vector_store::VectorStore;

#[test]
#[serial]
fn entry_tags_converge() {
    // Register the nested-CRDT re-key thunks for KnowledgeEntryData (tags and
    // collection_id LwwRegisters). Without this the registers are LWW'd as
    // opaque blobs and replicas can diverge.
    VectorStore::__calimero_register_rekey();

    converge_app(|| {
        // Genesis seed: one entry is added under the single genesis identity so
        // that entry_owners (AuthoredMap) is written conflict-free and
        // snapshotted identically into every replica.
        let mut s = VectorStore::init();
        let _ = s.add_entry(
            "seed entry".into(),
            vec![1.0_f32, 0.0, 0.0, 0.0],
            vec!["original".into()],
            None,
        );
        s
    })
    .replicas(3)
    // Each replica concurrently updates the seeded entry's tags. update_entry_tags
    // reads entry_owners (no merge — genesis-seeded, identical on all replicas)
    // and writes only to entries (tags LwwRegister). The genesis identity is the
    // same for all replicas in converge_app, so the authorship check passes.
    .ops(|s| {
        if let Some(entry) = s
            .list_entries(None, 0, 1)
            .ok()
            .and_then(|v| v.into_iter().next())
        {
            let _ = s.update_entry_tags(entry.id, vec!["converged".into()]);
        }
    })
    .invariant(
        "the seeded entry survives and its tags hold the merged value",
        |s| {
            s.list_entries(None, 0, 10)
                .map(|entries| {
                    entries.len() == 1 && entries[0].tags == vec!["converged".to_string()]
                })
                .unwrap_or(false)
        },
    )
    .assert_all_replicas_equal();
}
