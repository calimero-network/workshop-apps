// No convergence tests for kudos-board:
//
// The crate uses `AuthoredMap` exclusively (no hand-written `Mergeable`).
// `converge_app` requires a bare CRDT state with no `UserStorage` fields —
// `AuthoredMap` is `CrdtType::UserStorage` and cannot be reconciled by the
// harness (it has no signing identity). Convergence for authored entries is
// enforced structurally by the SDK; correctness is covered by the TestHost
// roundtrips in src/lib.rs.
