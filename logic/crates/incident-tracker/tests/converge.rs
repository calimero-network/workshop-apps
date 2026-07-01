//! Convergence coverage for the incident-tracker service.
//!
//! `IncidentTracker` hand-writes `Mergeable`/`RekeyTarget` on `IncidentData`,
//! which nests six `LwwRegister` fields. Without deterministic re-keying, each
//! nested register would be LWW'd as an opaque blob and replicas could diverge.
//! We call `__calimero_register_rekey()` to install the re-key thunks, then
//! assert that concurrent severity updates converge to one Merkle root.
//!
//! Surface under test: `incidents: UnorderedMap<String, IncidentData>` only.
//! `comment_authors` and `postmortem_authors` are `AuthoredMap` — the bare
//! harness has no signing identity and cannot reconcile their signed-delta path,
//! so we never touch them in `.ops()`. They start empty and remain empty on all
//! replicas (seeded identically at genesis), so they don't affect convergence.
//!
//! `#[serial]`: `converge_app` mutates a process-global merge registry per run.

use calimero_storage::testing::converge_app;
use incident_command_incident_tracker::IncidentTracker;
use serial_test::serial;

#[test]
#[serial]
fn incident_severity_updates_converge() {
    // Register re-key thunks for IncidentData's nested LwwRegister fields.
    IncidentTracker::__calimero_register_rekey();

    converge_app(|| {
        // Genesis seed: one incident created under the single genesis identity,
        // snapshotted byte-identical into every replica. No AuthoredMap writes
        // happen in ops, so the genesis AuthoredMaps stay conflict-free.
        let mut s = IncidentTracker::init();
        let _ = s.create_incident("seed incident".into(), "desc".into(), "low".into());
        s
    })
    .replicas(3)
    // Each replica concurrently escalates the seeded incident's severity.
    // `update_incident` only touches `incidents` (no AuthoredMap write).
    .ops(|s| {
        if let Some(inc) = s.list_incidents().ok().and_then(|v| v.into_iter().next()) {
            let _ = s.update_incident(inc.id, Some("critical".into()), None);
        }
    })
    .invariant(
        "seeded incident survives and severity converges to critical",
        |s| {
            s.list_incidents()
                .map(|v| v.len() == 1 && v[0].severity == "critical")
                .unwrap_or(false)
        },
    )
    .assert_all_replicas_equal();
}
