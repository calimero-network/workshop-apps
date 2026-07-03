//! No convergence tests for the todo-list service.
//!
//! `Task` is stored in `AuthoredMap<String, Task>` — a plain struct with no
//! nested CRDTs and no hand-written `Mergeable`. The storage layer owns the
//! authorship merge semantics; `converge_app` cannot reconcile the signed-delta
//! path used by `AuthoredMap` (it has no signing identity). Convergence is
//! verified end-to-end by the merobox smoke tests instead.
//!
//! Authorization (non-author rejection) is covered by the `TestHost` unit tests
//! in `src/lib.rs`.
