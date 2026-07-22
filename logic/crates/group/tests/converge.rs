//! `GroupState` has no hand-written `Mergeable`/`RekeyTarget` impls — every
//! CRDT field is a framework-native collection composition:
//! `SharedStorage<LwwRegister<GroupMetadata>>`,
//! `UnorderedMap<String, LwwRegister<Expense>>`,
//! `AuthoredMap<String, LwwRegister<u64>>` (the `expense_authors` gate index),
//! `UnorderedMap<String, LwwRegister<Settlement>>`. `edit_expense` replaces
//! the whole `Expense` record in its `LwwRegister` rather than nesting a
//! per-field register inside a custom `Mergeable` struct, so there is no
//! custom re-key/merge logic here for a `tests/converge.rs` to exercise — the
//! storage layer's own tests already cover `LwwRegister`/`UnorderedMap`/
//! `AuthoredMap`/`SharedStorage` convergence.
//!
//! Mutation-level coverage (add/edit/delete, author gating on
//! `edit_expense`/`delete_expense`, creator gating on `rename_group`, and the
//! `get_balances` computation) lives in the `#[cfg(test)]` `TestHost` module
//! in `src/lib.rs`.
