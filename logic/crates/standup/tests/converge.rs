//! Convergence coverage for the async standup board service.
//!
//! `StandupBoard` hand-writes `Mergeable` on `StandupEntry` (LWW by
//! `updated_at`) and `Comment` (deterministic tie-break). Neither struct nests
//! a CRDT, so no re-key registration is required — the `standups` and
//! `comments` `UnorderedMap` entries merge purely on the struct-level merge
//! logic.
//!
//! Surface under test: `standups: UnorderedMap<String, StandupEntry>` only.
//! The sibling `standup_authors: AuthoredMap` is `CrdtType::UserStorage` and
//! cannot be reconciled by the bare `converge_app` harness (no signing
//! identity). So we:
//!   1. Seed a standup at **genesis** — the `AuthoredMap` write happens once
//!      under the single genesis identity, then the state is snapshotted
//!      byte-identical into all replicas (no concurrent AuthoredMap merge).
//!   2. In `.ops(...)`, call `edit_standup` — which reads `owner_of` (a
//!      read-only `AuthoredMap` op, always returns the genesis identity that
//!      matches every replica's executor) and then writes only to
//!      `standups` (UnorderedMap). This is the pure `StandupEntry` Mergeable
//!      convergence case.
//!
//! `#[serial]`: `converge_app` clears/repopulates the process-global merge
//! registry per run; `#[serial]` avoids contention and matches canonical
//! core-apps pattern.

use calimero_storage::testing::converge_app;
use async_standup_standup::StandupBoard;
use serial_test::serial;

#[test]
#[serial]
fn standup_edits_converge() {
    // No nested CRDTs in StandupEntry — no __calimero_register_rekey() needed.

    converge_app(|| {
        // Genesis: post one standup under the single genesis identity so the
        // AuthoredMap entry is conflict-free and snapshotted identically into
        // every replica.
        let mut s = StandupBoard::init();
        let _ = s.post_standup(
            "Done v0".into(),
            "Blocker v0".into(),
            "Planned v0".into(),
            "2025-01-15".into(),
        );
        s
    })
    .replicas(3)
    // Each replica concurrently edits the seeded standup. `edit_standup` reads
    // `standup_authors.owner_of` (read-only) and writes only to `standups`
    // (UnorderedMap) — the pure StandupEntry Mergeable convergence case.
    .ops(|s| {
        if let Some(su) = s.get_standups().ok().and_then(|v| v.into_iter().next()) {
            let _ = s.edit_standup(
                su.id,
                "Done v1".into(),
                "Blocker v1".into(),
                "Planned v1".into(),
            );
        }
    })
    .invariant(
        "the seeded standup survives and holds the merged (latest) content",
        |s| {
            s.get_standups()
                .map(|v| v.len() == 1 && v[0].done_items == "Done v1")
                .unwrap_or(false)
        },
    )
    .assert_all_replicas_equal();
}
