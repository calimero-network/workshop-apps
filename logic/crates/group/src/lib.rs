//! `group` service — one shared expense group (splitwise-clone).
//!
//! One context per group. Holds:
//! - `metadata`: creator-governed group name/id (`SharedStorage<LwwRegister<..>>`)
//! - `expenses` / `expense_authors`: expense records live in a plain, fully
//!   listable `UnorderedMap<String, LwwRegister<Expense>>` — the whole record
//!   is replaced as a unit on `edit_expense` (framework-native LWW, no
//!   hand-written `Mergeable`/`RekeyTarget` needed); a sibling `AuthoredMap`
//!   holds nothing but the authorship stamp and gates `edit_expense`/
//!   `delete_expense` to the original author (`AuthoredMap` has no full-scan
//!   API, so it cannot itself be the listable store — this is the same
//!   two-collection split the neutral scaffold's `items`/`owners`
//!   demonstrates, just extended to gate edit as well as delete)
//! - `settlements`: payment records, `UnorderedMap<String, LwwRegister<Settlement>>`.
//!   No edit/delete method is exposed in the spec, so there is nothing to
//!   author-gate — each record's `author` field (stamped at creation) is
//!   display-only.
//!
//! `get_balances` is computed on read from `expenses` + `settlements` — no
//! separate replicated balance counter is needed, so there is nothing extra
//! to keep in sync.

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_sdk::PublicKey;
use calimero_storage::collections::{AuthoredMap, LwwRegister, SharedStorage, UnorderedMap};
use calimero_storage::env as storage_env;
use splitwise_clone_types::{generate_id, validate_label, Error};
use std::collections::{BTreeMap, BTreeSet};

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// Creator-governed group metadata. Wrapped whole in an `LwwRegister` inside
/// `SharedStorage`, so it is replaced as a unit on `rename_group` — no
/// per-field merge needed.
#[derive(Debug, Clone, Default, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct GroupMetadata {
    pub id: String,
    pub name: String,
    pub created_at: u64,
}

/// An expense record. Stored as a whole unit inside `LwwRegister<Expense>` —
/// an `edit_expense` replaces the entire record, so concurrent edits (from
/// the same author, e.g. two devices) converge by the register's built-in
/// last-writer-wins; no hand-written `Mergeable`/`RekeyTarget` is needed.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct Expense {
    pub id: String,
    pub author: String,
    pub description: String,
    pub amount: i64,
    pub paid_by: String,
    pub split_between: Vec<String>,
    pub created_at: u64,
}

/// Read-shaped view of an expense returned to callers — identical shape to
/// `Expense`, kept as a separate type for symmetry with `Settlement`/
/// `SettlementView` and so the internal storage type can evolve independently
/// of the ABI-facing one.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct ExpenseView {
    pub id: String,
    pub author: String,
    pub description: String,
    pub amount: i64,
    pub paid_by: String,
    pub split_between: Vec<String>,
    pub created_at: u64,
}

/// A settlement (payment) record. No edit/delete method is exposed, so it
/// never changes after creation; stored as `LwwRegister<Settlement>` purely
/// to satisfy `UnorderedMap`'s `V: Mergeable` bound (the register is written
/// exactly once and never contended).
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct Settlement {
    pub id: String,
    pub author: String,
    pub from: String,
    pub to: String,
    pub amount: i64,
    pub created_at: u64,
}

/// Read-shaped view of a settlement returned to callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct SettlementView {
    pub id: String,
    pub author: String,
    pub from: String,
    pub to: String,
    pub amount: i64,
    pub created_at: u64,
}

/// One member's net balance: positive = owed money by the group, negative =
/// owes the group. A named struct (not a tuple) so the ABI client gets typed
/// fields — `get_balances` returns `Vec<BalanceEntry>` in place of the spec's
/// `Vec<(String, i64)>` shorthand.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct BalanceEntry {
    pub member: String,
    pub balance: i64,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
pub struct GroupState {
    /// Creator-governed group name/id. Only the creator (the sole initial
    /// writer) may `rename_group`.
    metadata: SharedStorage<LwwRegister<GroupMetadata>>,
    /// The expenses themselves — plain map, fully listable. Each value is
    /// the whole `Expense` record wrapped in an `LwwRegister`, so
    /// `edit_expense` just replaces it wholesale.
    expenses: UnorderedMap<String, LwwRegister<Expense>>,
    /// Ownership index: `expense_id -> author-claim`. Holds no real data
    /// (the payload is unused); `AuthoredMap::update`/`remove` reject any
    /// caller but the original author, which is what gates `edit_expense`/
    /// `delete_expense` without a manual key comparison.
    expense_authors: AuthoredMap<String, LwwRegister<u64>>,
    /// Settlements, keyed by generated id. Append-only (no edit/delete
    /// method in the spec), so a plain map is sufficient.
    settlements: UnorderedMap<String, LwwRegister<Settlement>>,
}

#[app::logic]
impl GroupState {
    #[app::init]
    pub fn init(name: String) -> GroupState {
        let now = storage_env::time_now();
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("group", now, &nonce);

        let creator: PublicKey = env::executor_id().into();
        let mut writers = BTreeSet::new();
        let _ = writers.insert(creator);
        let mut metadata = SharedStorage::new(writers, false);
        let _ = metadata.insert(LwwRegister::new(GroupMetadata {
            id,
            name,
            created_at: now,
        }));

        GroupState {
            metadata,
            expenses: UnorderedMap::new(),
            expense_authors: AuthoredMap::new(),
            settlements: UnorderedMap::new(),
        }
    }

    /// Add an expense. The caller becomes its author; only they may later
    /// `edit_expense`/`delete_expense` it.
    pub fn add_expense(
        &mut self,
        description: String,
        amount: i64,
        paid_by: String,
        split_between: Vec<String>,
    ) -> app::Result<String> {
        validate_label(&description).map_err(AppError::from)?;
        if amount <= 0 {
            app::bail!(Error::Invalid("amount must be positive".into()));
        }
        if paid_by.trim().is_empty() {
            app::bail!(Error::Invalid("paid_by must not be empty".into()));
        }
        if split_between.is_empty() {
            app::bail!(Error::Invalid("split_between must not be empty".into()));
        }

        let now = storage_env::time_now();
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("exp", now, &nonce);
        let author = self.owner_b58();

        let expense = Expense {
            id: id.clone(),
            author,
            description,
            amount,
            paid_by: paid_by.clone(),
            split_between,
            created_at: now,
        };
        self.expenses
            .insert(id.clone(), LwwRegister::new(expense))
            .map_err(|e| AppError::msg(format!("expenses.insert: {e}")))?;
        // Stamp the adding executor as the author in the gate index.
        self.expense_authors
            .insert(id.clone(), LwwRegister::new(now))
            .map_err(|e| AppError::msg(format!("expense_authors.insert: {e}")))?;

        app::emit!(Event::ExpenseAdded {
            id: &id,
            paid_by: &paid_by,
            amount,
        });
        Ok(id)
    }

    /// Edit an expense's description/amount (LWW). Author-gated via the
    /// `expense_authors` index — only the expense's author may edit it.
    pub fn edit_expense(
        &mut self,
        id: String,
        description: String,
        amount: i64,
    ) -> app::Result<()> {
        validate_label(&description).map_err(AppError::from)?;
        if amount <= 0 {
            app::bail!(Error::Invalid("amount must be positive".into()));
        }

        let now = storage_env::time_now();
        self.expense_authors
            .update(&id, LwwRegister::new(now))
            .map_err(map_authored_error("expenses", "edit"))?;

        let mut guard = self
            .expenses
            .get_mut(&id)
            .map_err(|e| AppError::msg(format!("expenses.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(id.clone())))?;
        // Whole-record replace: clone the current value, edit the two
        // fields, then `set` it back — the register's HLC stamp (not a
        // per-field one) is what concurrent edits resolve on.
        let mut updated = guard.get().clone();
        updated.description = description;
        updated.amount = amount;
        guard.set(updated);
        drop(guard);

        app::emit!(Event::ExpenseEdited { id: &id });
        Ok(())
    }

    /// Delete an expense. Author-gated via the `expense_authors` index —
    /// only the expense's author may delete it.
    pub fn delete_expense(&mut self, id: String) -> app::Result<()> {
        let removed = self
            .expense_authors
            .remove(&id)
            .map_err(map_authored_error("expenses", "delete"))?;
        if removed.is_none() {
            app::bail!(Error::NotFound(id));
        }
        self.expenses
            .remove(&id)
            .map_err(|e| AppError::msg(format!("expenses.remove: {e}")))?;

        app::emit!(Event::ExpenseDeleted { id: &id });
        Ok(())
    }

    /// List all expenses, sorted by creation time then id for a stable order.
    pub fn list_expenses(&self) -> app::Result<Vec<ExpenseView>> {
        let mut out: Vec<ExpenseView> = self
            .expenses
            .entries()
            .map_err(|e| AppError::msg(format!("expenses.entries: {e}")))?
            .map(|(_, reg)| to_expense_view(reg.get()))
            .collect();
        out.sort_by(|a, b| (a.created_at, &a.id).cmp(&(b.created_at, &b.id)));
        Ok(out)
    }

    /// Record that `from` paid `to` some `amount`, settling part (or all) of
    /// a debt. The caller becomes the settlement's author.
    pub fn record_settlement(
        &mut self,
        from: String,
        to: String,
        amount: i64,
    ) -> app::Result<String> {
        if from.trim().is_empty() || to.trim().is_empty() {
            app::bail!(Error::Invalid("from/to must not be empty".into()));
        }
        if from == to {
            app::bail!(Error::Invalid("from and to must differ".into()));
        }
        if amount <= 0 {
            app::bail!(Error::Invalid("amount must be positive".into()));
        }

        let now = storage_env::time_now();
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("stl", now, &nonce);
        let author = self.owner_b58();

        let settlement = Settlement {
            id: id.clone(),
            author,
            from: from.clone(),
            to: to.clone(),
            amount,
            created_at: now,
        };
        self.settlements
            .insert(id.clone(), LwwRegister::new(settlement))
            .map_err(|e| AppError::msg(format!("settlements.insert: {e}")))?;

        app::emit!(Event::SettlementRecorded {
            id: &id,
            from: &from,
            to: &to,
            amount,
        });
        Ok(id)
    }

    /// List all settlements, sorted by creation time then id for a stable
    /// order.
    pub fn list_settlements(&self) -> app::Result<Vec<SettlementView>> {
        let mut out: Vec<SettlementView> = self
            .settlements
            .entries()
            .map_err(|e| AppError::msg(format!("settlements.entries: {e}")))?
            .map(|(_, reg)| to_settlement_view(reg.get()))
            .collect();
        out.sort_by(|a, b| (a.created_at, &a.id).cmp(&(b.created_at, &b.id)));
        Ok(out)
    }

    /// Net balance per member: sum of expense shares (paid_by credited the
    /// full amount, each split member debited their equal share) minus
    /// settlements (from credited, to debited). Positive = owed money;
    /// negative = owes money. Computed on read — no separate replicated
    /// counter to keep in sync.
    pub fn get_balances(&self) -> app::Result<Vec<BalanceEntry>> {
        let mut balances: BTreeMap<String, i64> = BTreeMap::new();

        for (_, reg) in self
            .expenses
            .entries()
            .map_err(|e| AppError::msg(format!("expenses.entries: {e}")))?
        {
            let expense = reg.get();
            let amount = expense.amount;
            let n = expense.split_between.len() as i64;
            let base = amount / n;
            let remainder = amount % n;
            for (i, member) in expense.split_between.iter().enumerate() {
                // Distribute the integer-division remainder one cent at a
                // time to the first `remainder` members, so debits sum to
                // exactly `amount` (no lost cents).
                let share = if (i as i64) < remainder { base + 1 } else { base };
                *balances.entry(member.clone()).or_insert(0) -= share;
            }
            *balances.entry(expense.paid_by.clone()).or_insert(0) += amount;
        }

        for (_, reg) in self
            .settlements
            .entries()
            .map_err(|e| AppError::msg(format!("settlements.entries: {e}")))?
        {
            let settlement = reg.get();
            *balances.entry(settlement.from.clone()).or_insert(0) += settlement.amount;
            *balances.entry(settlement.to.clone()).or_insert(0) -= settlement.amount;
        }

        Ok(balances
            .into_iter()
            .map(|(member, balance)| BalanceEntry { member, balance })
            .collect())
    }

    /// Rename the group. Creator-governed: only a writer (the creator, unless
    /// the writer set is later rotated) may rename.
    pub fn rename_group(&mut self, new_name: String) -> app::Result<()> {
        validate_label(&new_name).map_err(AppError::from)?;

        let mut meta = self
            .metadata
            .get()
            .map_err(|e| AppError::msg(format!("metadata.get: {e}")))?
            .get()
            .clone();
        meta.name = new_name.clone();
        self.metadata
            .insert(LwwRegister::new(meta))
            .map_err(map_shared_error("rename_group"))?;

        app::emit!(Event::GroupRenamed { name: &new_name });
        Ok(())
    }
}

impl GroupState {
    /// Base58 of the current executor — the public, shareable author identity.
    fn owner_b58(&self) -> String {
        bs58::encode(env::executor_id()).into_string()
    }

    /// Test-only accessor for the governed group name (not part of the app
    /// ABI — there is no `get_group`/`get_metadata` method in the spec).
    #[cfg(test)]
    fn group_name(&self) -> String {
        self.metadata.get().unwrap().get().name.clone()
    }
}

fn to_expense_view(expense: &Expense) -> ExpenseView {
    ExpenseView {
        id: expense.id.clone(),
        author: expense.author.clone(),
        description: expense.description.clone(),
        amount: expense.amount,
        paid_by: expense.paid_by.clone(),
        split_between: expense.split_between.clone(),
        created_at: expense.created_at,
    }
}

fn to_settlement_view(settlement: &Settlement) -> SettlementView {
    SettlementView {
        id: settlement.id.clone(),
        author: settlement.author.clone(),
        from: settlement.from.clone(),
        to: settlement.to.clone(),
        amount: settlement.amount,
        created_at: settlement.created_at,
    }
}

/// Translate an `AuthoredMap` access-control error into a friendly `Forbidden`.
fn map_authored_error(
    collection: &'static str,
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(Error::Forbidden(format!(
                "can only {action} your own {collection}"
            )))
        } else {
            AppError::msg(format!("{collection}_authors.{action}: {s}"))
        }
    }
}

/// Translate a `SharedStorage` access-control error into a friendly `Forbidden`.
fn map_shared_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(Error::Forbidden(format!(
                "{action}: caller is not a group owner"
            )))
        } else {
            AppError::msg(format!("metadata.{action}: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// In-process tests — one TestHost roundtrip per mutation.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use calimero_sdk::testing::TestHost;

    use super::*;

    const OTHER: [u8; 32] = [0x22; 32];

    fn init_group() -> TestHost<GroupState> {
        TestHost::new(|| GroupState::init("Bali trip".into()))
    }

    #[test]
    fn add_expense_and_list() {
        let mut app = init_group();

        let id = app
            .call(|s| {
                s.add_expense(
                    "Dinner".into(),
                    6000,
                    "alice".into(),
                    vec!["alice".into(), "bob".into()],
                )
            })
            .unwrap();

        let views = app.view(|s| s.list_expenses()).unwrap();
        assert_eq!(views.len(), 1);
        assert_eq!(views[0].id, id);
        assert_eq!(views[0].description, "Dinner");
        assert_eq!(views[0].amount, 6000);
        assert_eq!(views[0].paid_by, "alice");
        // `add_expense` emits exactly one event.
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn add_expense_rejects_empty_split() {
        let mut app = init_group();
        assert!(app
            .call(|s| s.add_expense("Dinner".into(), 6000, "alice".into(), vec![]))
            .is_err());
    }

    #[test]
    fn edit_expense_changes_description_and_amount() {
        let mut app = init_group();

        let id = app
            .call(|s| {
                s.add_expense(
                    "Dinner".into(),
                    6000,
                    "alice".into(),
                    vec!["alice".into(), "bob".into()],
                )
            })
            .unwrap();
        app.call(|s| s.edit_expense(id.clone(), "Dinner + tip".into(), 6500))
            .unwrap();

        let views = app.view(|s| s.list_expenses()).unwrap();
        assert_eq!(views[0].description, "Dinner + tip");
        assert_eq!(views[0].amount, 6500);
    }

    #[test]
    fn edit_expense_unknown_id_errors() {
        let mut app = init_group();
        assert!(app
            .call(|s| s.edit_expense("nope".into(), "x".into(), 100))
            .is_err());
    }

    #[test]
    fn non_author_cannot_edit_or_delete_expense() {
        let mut app = init_group();

        let id = app
            .call(|s| {
                s.add_expense(
                    "Dinner".into(),
                    6000,
                    "alice".into(),
                    vec!["alice".into(), "bob".into()],
                )
            })
            .unwrap();

        assert!(app
            .call_as(OTHER, |s| s.edit_expense(id.clone(), "hacked".into(), 1))
            .is_err());
        assert!(app.call_as(OTHER, |s| s.delete_expense(id.clone())).is_err());
        // The expense survives both rejected mutations.
        assert_eq!(app.view(|s| s.list_expenses()).unwrap().len(), 1);
    }

    #[test]
    fn author_can_delete_expense() {
        let mut app = init_group();

        let id = app
            .call(|s| {
                s.add_expense(
                    "Dinner".into(),
                    6000,
                    "alice".into(),
                    vec!["alice".into(), "bob".into()],
                )
            })
            .unwrap();
        app.call(|s| s.delete_expense(id)).unwrap();

        assert_eq!(app.view(|s| s.list_expenses()).unwrap().len(), 0);
    }

    #[test]
    fn record_and_list_settlements() {
        let mut app = init_group();

        let id = app
            .call(|s| s.record_settlement("bob".into(), "alice".into(), 2000))
            .unwrap();

        let views = app.view(|s| s.list_settlements()).unwrap();
        assert_eq!(views.len(), 1);
        assert_eq!(views[0].id, id);
        assert_eq!(views[0].from, "bob");
        assert_eq!(views[0].to, "alice");
        assert_eq!(views[0].amount, 2000);
    }

    #[test]
    fn record_settlement_rejects_same_from_and_to() {
        let mut app = init_group();
        assert!(app
            .call(|s| s.record_settlement("bob".into(), "bob".into(), 100))
            .is_err());
    }

    #[test]
    fn balances_reflect_expenses_and_settlements() {
        let mut app = init_group();

        // 100 split three ways: 34/33/33. alice paid, so she's credited 100
        // and debited her own share.
        app.call(|s| {
            s.add_expense(
                "Dinner".into(),
                100,
                "alice".into(),
                vec!["alice".into(), "bob".into(), "carol".into()],
            )
        })
        .unwrap();

        let balances = app.view(|s| s.get_balances()).unwrap();
        let get = |m: &str| balances.iter().find(|b| b.member == m).unwrap().balance;
        assert_eq!(get("alice"), 66);
        assert_eq!(get("bob"), -33);
        assert_eq!(get("carol"), -33);
        // Zero-sum: shares split exactly, no lost cents.
        assert_eq!(balances.iter().map(|b| b.balance).sum::<i64>(), 0);

        // bob pays alice back 33 — settles his debt exactly.
        app.call(|s| s.record_settlement("bob".into(), "alice".into(), 33))
            .unwrap();

        let balances = app.view(|s| s.get_balances()).unwrap();
        let get = |m: &str| balances.iter().find(|b| b.member == m).unwrap().balance;
        assert_eq!(get("alice"), 33);
        assert_eq!(get("bob"), 0);
        assert_eq!(get("carol"), -33);
    }

    #[test]
    fn creator_can_rename_group() {
        let mut app = init_group();

        assert_eq!(app.view(|s| s.group_name()), "Bali trip");
        app.call(|s| s.rename_group("Flatmates".into())).unwrap();
        assert_eq!(app.view(|s| s.group_name()), "Flatmates");
        // `rename_group` emits exactly one event.
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn non_creator_cannot_rename_group() {
        let mut app = init_group();
        assert!(app
            .call_as(OTHER, |s| s.rename_group("Hacked".into()))
            .is_err());
        assert_eq!(app.view(|s| s.group_name()), "Bali trip");
    }
}
