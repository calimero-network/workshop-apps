//! `group` service — a shared group expense tracker with flexible splitting,
//! settle-up, and a live spending dashboard. One context per group.
//!
//! Entities:
//! - `GroupInfo` (governed by the creator): the group's name, wrapped in
//!   `SharedStorage<LwwRegister<GroupInfo>>` with the creator as the sole
//!   initial (and only) writer — `rename_group` is structurally gated by the
//!   writer-set check `SharedStorage::insert` runs internally.
//! - `MemberProfile` (authored): one entry per member, keyed by an id derived
//!   from the caller's identity, so `set_display_name` is idempotent — the
//!   first call joins, later calls update the caller's own display name
//!   (`AuthoredMap` structurally forbids editing someone else's profile).
//! - `Expense` (authored): who paid, how it's split (`"equal"` among
//!   `participants` or `"single"` fully `owed_by` one member), owner-gated
//!   edit/delete.
//! - `Settlement` (authored): an immutable append-only repayment record.
//!
//! `MemberProfile` and `Expense` each nest a `LwwRegister` for their one
//! mutable field, so both hand-write `Mergeable` + `RekeyTarget` (the `Item`
//! pattern from the neutral scaffold). `Settlement` is fully immutable — no
//! nested CRDT — so its `RekeyTarget` impl is a no-op (still required: it's a
//! supertrait of `Mergeable`).

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_sdk::PublicKey;
use calimero_storage::address::Id;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::rekey::{field_child_id, RekeyTarget};
use calimero_storage::collections::{AuthoredMap, LwwRegister, Mergeable, SharedStorage};
use calimero_storage::env as storage_env;
use split_circle_types::{generate_id, validate_label, Error};
use std::collections::{BTreeMap, BTreeSet};

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// The group's governed metadata (single record per context). `id` and
/// `created_at` are set once at init and never change; `name` is the mutable
/// field, replaced wholesale on `rename_group`. Wrapped in
/// `LwwRegister<GroupInfo>` inside `SharedStorage`, so it needs `Default`
/// (never actually read before `init` populates it) but not `Mergeable` —
/// the outer `LwwRegister` treats the whole struct as one opaque value.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct GroupInfo {
    pub id: String,
    pub name: String,
    pub created_at: u64,
}

impl Default for GroupInfo {
    fn default() -> Self {
        GroupInfo {
            id: String::new(),
            name: String::new(),
            created_at: 0,
        }
    }
}

/// A group member. `display_name` is the mutable, LWW field; `id`, `author`,
/// and `joined_at` are set once when the member first joins.
// Nests a `LwwRegister`, which is Borsh-only (no serde impl in
// calimero_storage), so callers get the serde-able `MemberView` instead.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct MemberProfile {
    pub id: String,
    pub author: String,
    pub display_name: LwwRegister<String>,
    pub joined_at: u64,
}

impl Mergeable for MemberProfile {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Deterministic tie-break for the set-once fields, in case two
        // replicas raced the initial join (should never happen in practice —
        // the id is derived from the author's identity).
        if (other.joined_at, &other.id) < (self.joined_at, &self.id) {
            self.id = other.id.clone();
            self.author = other.author.clone();
            self.joined_at = other.joined_at;
        }
        self.display_name.merge(&other.display_name);
        Ok(())
    }
}

impl RekeyTarget for MemberProfile {
    fn rekey_relative_to(&mut self, parent_id: Id) {
        calimero_storage::rekey_field_if_supported!(
            &mut self.display_name,
            field_child_id(parent_id, "display_name")
        );
    }
}

/// Read-shaped view of a member, returned to callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct MemberView {
    pub id: String,
    pub author: String,
    pub display_name: String,
    pub joined_at: u64,
}

/// An expense. `description` and `amount` are mutable (LWW); everything else
/// is set once at creation. `split_type` is `"equal"` (split `amount` evenly
/// among `participants`) or `"single"` (fully `owed_by` one member).
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct Expense {
    pub id: String,
    pub author: String,
    pub description: LwwRegister<String>,
    pub amount: LwwRegister<u64>,
    pub paid_by: String,
    pub split_type: String,
    pub participants: Vec<String>,
    pub owed_by: String,
    pub created_at: u64,
}

impl Mergeable for Expense {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if (other.created_at, &other.id) < (self.created_at, &self.id) {
            self.id = other.id.clone();
            self.author = other.author.clone();
            self.paid_by = other.paid_by.clone();
            self.split_type = other.split_type.clone();
            self.participants = other.participants.clone();
            self.owed_by = other.owed_by.clone();
            self.created_at = other.created_at;
        }
        self.description.merge(&other.description);
        self.amount.merge(&other.amount);
        Ok(())
    }
}

impl RekeyTarget for Expense {
    fn rekey_relative_to(&mut self, parent_id: Id) {
        calimero_storage::rekey_field_if_supported!(
            &mut self.description,
            field_child_id(parent_id, "description")
        );
        calimero_storage::rekey_field_if_supported!(
            &mut self.amount,
            field_child_id(parent_id, "amount")
        );
    }
}

/// Read-shaped view of an expense, returned to callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct ExpenseView {
    pub id: String,
    pub author: String,
    pub description: String,
    pub amount: u64,
    pub paid_by: String,
    pub split_type: String,
    pub participants: Vec<String>,
    pub owed_by: String,
    pub created_at: u64,
}

/// An immutable repayment record. No nested CRDT, so `description`/`amount`
/// style LWW fields aren't needed — it can derive both Borsh and serde and be
/// returned directly (no separate view type).
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Settlement {
    pub id: String,
    pub author: String,
    pub from: String,
    pub to: String,
    pub amount: u64,
    pub created_at: u64,
}

impl Mergeable for Settlement {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Fully immutable — this only guards the vanishingly unlikely case of
        // two authors colliding on a generated id.
        if (other.created_at, &other.id) < (self.created_at, &self.id) {
            *self = other.clone();
        }
        Ok(())
    }
}

impl RekeyTarget for Settlement {
    fn rekey_relative_to(&mut self, _parent_id: Id) {
        // No nested CRDT fields to re-key.
    }
}

/// One member's net balance: positive means the group owes them money,
/// negative means they owe the group.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct Balance {
    pub member_id: String,
    pub net: i64,
}

/// One member's gross spend, before settlements.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct MemberSpend {
    pub member_id: String,
    pub total_paid: u64,
    pub total_owed: u64,
}

/// The group's spending dashboard.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct Summary {
    pub total_spent: u64,
    pub members: Vec<MemberSpend>,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
pub struct GroupState {
    /// Group name, governed: only the creator (the sole writer set at init)
    /// may change it.
    info: SharedStorage<LwwRegister<GroupInfo>>,
    /// Members, keyed by an id derived from their identity. Self-owned via
    /// `AuthoredMap` — a member can only ever edit their own profile.
    members: AuthoredMap<String, MemberProfile>,
    /// Expenses, keyed by generated id. Owner-gated edit/delete.
    expenses: AuthoredMap<String, Expense>,
    /// Settlements, keyed by generated id. Append-only (no update/delete
    /// method is exposed).
    settlements: AuthoredMap<String, Settlement>,
}

#[app::logic]
impl GroupState {
    #[app::init]
    pub fn init(name: String) -> GroupState {
        let creator: PublicKey = env::executor_id().into();
        let mut writers = BTreeSet::new();
        let _ = writers.insert(creator);

        let now = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("group", now, &nonce);

        let mut info = SharedStorage::new_with_field_name("group:info", writers, false);
        let _ = info.insert(LwwRegister::new(GroupInfo {
            id,
            name,
            created_at: now,
        }));

        GroupState {
            info,
            members: AuthoredMap::new_with_field_name("group:members"),
            expenses: AuthoredMap::new_with_field_name("group:expenses"),
            settlements: AuthoredMap::new_with_field_name("group:settlements"),
        }
    }

    // ---- Members ----

    /// Creates the caller's `MemberProfile` on first call (join), or updates
    /// `display_name` on later calls. Returns the member id.
    pub fn set_display_name(&mut self, display_name: String) -> app::Result<String> {
        validate_label(&display_name).map_err(AppError::from)?;

        let author = self.caller_b58();
        let member_id = format!("member-{author}");

        if let Some(mut profile) = self
            .members
            .get(&member_id)
            .map_err(|e| AppError::msg(format!("members.get: {e}")))?
        {
            profile.display_name.set(display_name);
            self.members
                .update(&member_id, profile)
                .map_err(map_authored_error("members", "update"))?;
        } else {
            let now = storage_env::time_now() / 1_000_000;
            let profile = MemberProfile {
                id: member_id.clone(),
                author,
                display_name: LwwRegister::new(display_name.clone()),
                joined_at: now,
            };
            self.members
                .insert(member_id.clone(), profile)
                .map_err(|e| AppError::msg(format!("members.insert: {e}")))?;
            app::emit!(Event::MemberJoined {
                id: &member_id,
                display_name: &display_name,
            });
        }
        Ok(member_id)
    }

    /// List all members, sorted by join time then id for a stable order.
    pub fn list_members(&self) -> app::Result<Vec<MemberView>> {
        let mut out: Vec<MemberView> = self
            .members
            .entries()
            .map_err(|e| AppError::msg(format!("members.entries: {e}")))?
            .map(|(_, m)| MemberView {
                id: m.id,
                author: m.author,
                display_name: m.display_name.get().clone(),
                joined_at: m.joined_at,
            })
            .collect();
        out.sort_by(|a, b| (a.joined_at, &a.id).cmp(&(b.joined_at, &b.id)));
        Ok(out)
    }

    // ---- Expenses ----

    /// Adds an expense. `split_type` must be `"equal"` (non-empty
    /// `participants`) or `"single"` (`owed_by` a known member). Returns the
    /// new expense id.
    pub fn add_expense(
        &mut self,
        description: String,
        amount: u64,
        paid_by: String,
        split_type: String,
        participants: Vec<String>,
        owed_by: String,
    ) -> app::Result<String> {
        validate_label(&description).map_err(AppError::from)?;
        match split_type.as_str() {
            "equal" => {
                if participants.is_empty() {
                    app::bail!(Error::Invalid(
                        "an equal split requires at least one participant".into()
                    ));
                }
            }
            "single" => {
                if !self.member_exists(&owed_by)? {
                    app::bail!(Error::Invalid("owed_by must be a known member".into()));
                }
            }
            _ => app::bail!(Error::Invalid(
                "split_type must be \"equal\" or \"single\"".into()
            )),
        }

        let now = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("exp", now, &nonce);
        let author = self.caller_b58();

        let expense = Expense {
            id: id.clone(),
            author,
            description: LwwRegister::new(description),
            amount: LwwRegister::new(amount),
            paid_by: paid_by.clone(),
            split_type,
            participants,
            owed_by,
            created_at: now,
        };
        self.expenses
            .insert(id.clone(), expense)
            .map_err(|e| AppError::msg(format!("expenses.insert: {e}")))?;

        app::emit!(Event::ExpenseAdded {
            id: &id,
            amount,
            paid_by: &paid_by,
        });
        Ok(id)
    }

    /// Edits an expense's description/amount. Owner-gated: only the member
    /// who added it may edit.
    pub fn edit_expense(&mut self, id: String, description: String, amount: u64) -> app::Result<()> {
        validate_label(&description).map_err(AppError::from)?;
        let mut expense = self
            .expenses
            .get(&id)
            .map_err(|e| AppError::msg(format!("expenses.get: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(id.clone())))?;
        expense.description.set(description);
        expense.amount.set(amount);
        self.expenses
            .update(&id, expense)
            .map_err(map_authored_error("expenses", "edit"))?;

        app::emit!(Event::ExpenseEdited { id: &id });
        Ok(())
    }

    /// Deletes an expense. Owner-gated: only the member who added it may
    /// delete it.
    pub fn delete_expense(&mut self, id: String) -> app::Result<()> {
        let removed = self
            .expenses
            .remove(&id)
            .map_err(map_authored_error("expenses", "delete"))?;
        if removed.is_none() {
            app::bail!(Error::NotFound(id));
        }

        app::emit!(Event::ExpenseDeleted { id: &id });
        Ok(())
    }

    /// List all expenses, sorted by creation time then id for a stable order.
    pub fn list_expenses(&self) -> app::Result<Vec<ExpenseView>> {
        let mut out: Vec<ExpenseView> = self
            .expenses
            .entries()
            .map_err(|e| AppError::msg(format!("expenses.entries: {e}")))?
            .map(|(_, e)| ExpenseView {
                id: e.id,
                author: e.author,
                description: e.description.get().clone(),
                amount: *e.amount.get(),
                paid_by: e.paid_by,
                split_type: e.split_type,
                participants: e.participants,
                owed_by: e.owed_by,
                created_at: e.created_at,
            })
            .collect();
        out.sort_by(|a, b| (a.created_at, &a.id).cmp(&(b.created_at, &b.id)));
        Ok(out)
    }

    // ---- Settlements ----

    /// Records a repayment. `from` and `to` must be distinct known members
    /// and `amount` must be greater than zero. Returns the new settlement id.
    pub fn record_settlement(&mut self, from: String, to: String, amount: u64) -> app::Result<String> {
        if from == to {
            app::bail!(Error::Invalid("from and to must be distinct members".into()));
        }
        if amount == 0 {
            app::bail!(Error::Invalid("amount must be greater than zero".into()));
        }
        if !self.member_exists(&from)? {
            app::bail!(Error::Invalid(format!("unknown member: {from}")));
        }
        if !self.member_exists(&to)? {
            app::bail!(Error::Invalid(format!("unknown member: {to}")));
        }

        let now = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("settle", now, &nonce);
        let author = self.caller_b58();

        let settlement = Settlement {
            id: id.clone(),
            author,
            from: from.clone(),
            to: to.clone(),
            amount,
            created_at: now,
        };
        self.settlements
            .insert(id.clone(), settlement)
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
    pub fn list_settlements(&self) -> app::Result<Vec<Settlement>> {
        let mut out = self.all_settlements()?;
        out.sort_by(|a, b| (a.created_at, &a.id).cmp(&(b.created_at, &b.id)));
        Ok(out)
    }

    // ---- Dashboard ----

    /// Net balance per member = total paid (as payer) minus total owed (as a
    /// participant/debtor), adjusted by settlements. Positive means the
    /// member is owed money; negative means they owe.
    pub fn get_balances(&self) -> app::Result<Vec<Balance>> {
        let expenses = self.all_expenses()?;
        let settlements = self.all_settlements()?;
        let mut net: BTreeMap<String, i64> = BTreeMap::new();

        for expense in &expenses {
            *net.entry(expense.paid_by.clone()).or_insert(0) += *expense.amount.get() as i64;
            for (member, share) in self.expense_shares(expense) {
                *net.entry(member).or_insert(0) -= share as i64;
            }
        }
        for settlement in &settlements {
            *net.entry(settlement.from.clone()).or_insert(0) += settlement.amount as i64;
            *net.entry(settlement.to.clone()).or_insert(0) -= settlement.amount as i64;
        }

        let mut member_ids: BTreeSet<String> = self
            .members
            .entries()
            .map_err(|e| AppError::msg(format!("members.entries: {e}")))?
            .map(|(id, _)| id)
            .collect();
        member_ids.extend(net.keys().cloned());

        Ok(member_ids
            .into_iter()
            .map(|member_id| {
                let value = *net.get(&member_id).unwrap_or(&0);
                Balance { member_id, net: value }
            })
            .collect())
    }

    /// Returns the group's total spend and each member's total paid / total
    /// owed (gross, not netted against settlements — see `get_balances` for
    /// the net view).
    pub fn get_summary(&self) -> app::Result<Summary> {
        let expenses = self.all_expenses()?;
        let mut total_spent: u64 = 0;
        let mut paid: BTreeMap<String, u64> = BTreeMap::new();
        let mut owed: BTreeMap<String, u64> = BTreeMap::new();

        for expense in &expenses {
            let amount = *expense.amount.get();
            total_spent += amount;
            *paid.entry(expense.paid_by.clone()).or_insert(0) += amount;
            for (member, share) in self.expense_shares(expense) {
                *owed.entry(member).or_insert(0) += share;
            }
        }

        let mut member_ids: BTreeSet<String> = self
            .members
            .entries()
            .map_err(|e| AppError::msg(format!("members.entries: {e}")))?
            .map(|(id, _)| id)
            .collect();
        member_ids.extend(paid.keys().cloned());
        member_ids.extend(owed.keys().cloned());

        let members = member_ids
            .into_iter()
            .map(|member_id| MemberSpend {
                total_paid: *paid.get(&member_id).unwrap_or(&0),
                total_owed: *owed.get(&member_id).unwrap_or(&0),
                member_id,
            })
            .collect();

        Ok(Summary { total_spent, members })
    }

    // ---- Group governance ----

    /// Renames the group. Restricted to the group creator: `SharedStorage`
    /// structurally rejects the write for any other identity.
    pub fn rename_group(&mut self, new_name: String) -> app::Result<()> {
        validate_label(&new_name).map_err(AppError::from)?;
        let mut info = self
            .info
            .get()
            .map_err(|e| AppError::msg(format!("info.get: {e}")))?
            .get()
            .clone();
        info.name = new_name.clone();
        self.info
            .insert(LwwRegister::new(info))
            .map_err(map_governance_error())?;

        app::emit!(Event::GroupRenamed { new_name: &new_name });
        Ok(())
    }
}

impl GroupState {
    /// Base58 of the current executor.
    fn caller_b58(&self) -> String {
        bs58::encode(env::executor_id()).into_string()
    }

    /// Whether `member_id` has a `MemberProfile` entry.
    fn member_exists(&self, member_id: &String) -> app::Result<bool> {
        self.members
            .contains(member_id)
            .map_err(|e| AppError::msg(format!("members.contains: {e}")))
    }

    fn all_expenses(&self) -> app::Result<Vec<Expense>> {
        Ok(self
            .expenses
            .entries()
            .map_err(|e| AppError::msg(format!("expenses.entries: {e}")))?
            .map(|(_, v)| v)
            .collect())
    }

    fn all_settlements(&self) -> app::Result<Vec<Settlement>> {
        Ok(self
            .settlements
            .entries()
            .map_err(|e| AppError::msg(format!("settlements.entries: {e}")))?
            .map(|(_, v)| v)
            .collect())
    }

    /// The (member, share) pairs an expense's amount is split into.
    fn expense_shares(&self, expense: &Expense) -> Vec<(String, u64)> {
        match expense.split_type.as_str() {
            "equal" => {
                let n = expense.participants.len() as u64;
                if n == 0 {
                    return Vec::new();
                }
                let share = *expense.amount.get() / n;
                expense
                    .participants
                    .iter()
                    .map(|p| (p.clone(), share))
                    .collect()
            }
            "single" => vec![(expense.owed_by.clone(), *expense.amount.get())],
            _ => Vec::new(),
        }
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
            AppError::msg(format!("{collection}.{action}: {s}"))
        }
    }
}

/// Translate a `SharedStorage` write-guard error into a friendly `Forbidden`.
fn map_governance_error() -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(Error::Forbidden(
                "only the group creator may rename the group".into(),
            ))
        } else {
            AppError::msg(format!("info.insert: {s}"))
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

    const MEMBER_B: [u8; 32] = [7u8; 32];

    #[test]
    fn join_creates_member_and_lists() {
        let mut app = TestHost::new(|| GroupState::init("Goa Trip".into()));

        let id = app.call(|s| s.set_display_name("Priya".into())).unwrap();
        let members = app.view(|s| s.list_members()).unwrap();
        assert_eq!(members.len(), 1);
        assert_eq!(members[0].id, id);
        assert_eq!(members[0].display_name, "Priya");
        // Only the join emits an event.
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn rejoin_updates_display_name_without_duplicate() {
        let mut app = TestHost::new(|| GroupState::init("Goa Trip".into()));

        let id1 = app.call(|s| s.set_display_name("Priya".into())).unwrap();
        let id2 = app.call(|s| s.set_display_name("Priya K".into())).unwrap();
        assert_eq!(id1, id2);

        let members = app.view(|s| s.list_members()).unwrap();
        assert_eq!(members.len(), 1);
        assert_eq!(members[0].display_name, "Priya K");
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn add_expense_equal_split_and_list() {
        let mut app = TestHost::new(|| GroupState::init("Goa Trip".into()));

        let a = app.call(|s| s.set_display_name("Priya".into())).unwrap();
        let b = app
            .call_as(MEMBER_B, |s| s.set_display_name("Chen".into()))
            .unwrap();

        let expense_id = app
            .call(|s| {
                s.add_expense(
                    "Dinner".into(),
                    1200,
                    a.clone(),
                    "equal".into(),
                    vec![a.clone(), b.clone()],
                    "".into(),
                )
            })
            .unwrap();

        let expenses = app.view(|s| s.list_expenses()).unwrap();
        assert_eq!(expenses.len(), 1);
        assert_eq!(expenses[0].id, expense_id);
        assert_eq!(expenses[0].amount, 1200);
        assert_eq!(expenses[0].participants, vec![a.clone(), b.clone()]);
    }

    #[test]
    fn add_expense_single_split_requires_known_member() {
        let mut app = TestHost::new(|| GroupState::init("Goa Trip".into()));
        let a = app.call(|s| s.set_display_name("Priya".into())).unwrap();

        assert!(app
            .call(|s| {
                s.add_expense(
                    "Taxi".into(),
                    500,
                    a.clone(),
                    "single".into(),
                    vec![],
                    "member-unknown".into(),
                )
            })
            .is_err());

        let id = app
            .call(|s| {
                s.add_expense(
                    "Taxi".into(),
                    500,
                    a.clone(),
                    "single".into(),
                    vec![],
                    a.clone(),
                )
            })
            .unwrap();
        let expenses = app.view(|s| s.list_expenses()).unwrap();
        assert_eq!(expenses.len(), 1);
        assert_eq!(expenses[0].id, id);
    }

    #[test]
    fn add_expense_rejects_bad_split_type_and_empty_participants() {
        let mut app = TestHost::new(|| GroupState::init("Goa Trip".into()));
        let a = app.call(|s| s.set_display_name("Priya".into())).unwrap();

        assert!(app
            .call(|s| s.add_expense("X".into(), 100, a.clone(), "half".into(), vec![], "".into()))
            .is_err());
        assert!(app
            .call(|s| s.add_expense("X".into(), 100, a.clone(), "equal".into(), vec![], "".into()))
            .is_err());
    }

    #[test]
    fn edit_expense_by_author_succeeds_and_non_author_rejected() {
        let mut app = TestHost::new(|| GroupState::init("Goa Trip".into()));
        let a = app.call(|s| s.set_display_name("Priya".into())).unwrap();
        let id = app
            .call(|s| {
                s.add_expense(
                    "Dinner".into(),
                    1200,
                    a.clone(),
                    "equal".into(),
                    vec![a.clone()],
                    "".into(),
                )
            })
            .unwrap();

        app.call(|s| s.edit_expense(id.clone(), "Dinner + drinks".into(), 1500))
            .unwrap();
        let view = app.view(|s| s.list_expenses()).unwrap();
        assert_eq!(view[0].description, "Dinner + drinks");
        assert_eq!(view[0].amount, 1500);

        // A different executor did not author this expense.
        assert!(app
            .call_as(MEMBER_B, |s| s.edit_expense(id.clone(), "Hacked".into(), 1))
            .is_err());
    }

    #[test]
    fn delete_expense_by_author_succeeds_and_non_author_rejected() {
        let mut app = TestHost::new(|| GroupState::init("Goa Trip".into()));
        let a = app.call(|s| s.set_display_name("Priya".into())).unwrap();
        let id = app
            .call(|s| {
                s.add_expense(
                    "Dinner".into(),
                    1200,
                    a.clone(),
                    "equal".into(),
                    vec![a.clone()],
                    "".into(),
                )
            })
            .unwrap();

        assert!(app
            .call_as(MEMBER_B, |s| s.delete_expense(id.clone()))
            .is_err());
        app.call(|s| s.delete_expense(id.clone())).unwrap();
        assert_eq!(app.view(|s| s.list_expenses()).unwrap().len(), 0);
    }

    #[test]
    fn record_settlement_validates_and_lists() {
        let mut app = TestHost::new(|| GroupState::init("Goa Trip".into()));
        let a = app.call(|s| s.set_display_name("Priya".into())).unwrap();
        let b = app
            .call_as(MEMBER_B, |s| s.set_display_name("Chen".into()))
            .unwrap();

        assert!(app
            .call(|s| s.record_settlement(a.clone(), a.clone(), 100))
            .is_err());
        assert!(app
            .call(|s| s.record_settlement(a.clone(), b.clone(), 0))
            .is_err());
        assert!(app
            .call(|s| s.record_settlement(a.clone(), "member-ghost".into(), 100))
            .is_err());

        let id = app
            .call(|s| s.record_settlement(b.clone(), a.clone(), 600))
            .unwrap();
        let settlements = app.view(|s| s.list_settlements()).unwrap();
        assert_eq!(settlements.len(), 1);
        assert_eq!(settlements[0].id, id);
        assert_eq!(settlements[0].amount, 600);
    }

    #[test]
    fn balances_and_summary_reflect_expenses_and_settlements() {
        let mut app = TestHost::new(|| GroupState::init("Goa Trip".into()));
        let a = app.call(|s| s.set_display_name("Priya".into())).unwrap();
        let b = app
            .call_as(MEMBER_B, |s| s.set_display_name("Chen".into()))
            .unwrap();

        // Priya pays 1200, split equally between Priya and Chen (600 each).
        app.call(|s| {
            s.add_expense(
                "Dinner".into(),
                1200,
                a.clone(),
                "equal".into(),
                vec![a.clone(), b.clone()],
                "".into(),
            )
        })
        .unwrap();

        let summary = app.view(|s| s.get_summary()).unwrap();
        assert_eq!(summary.total_spent, 1200);
        let a_spend = summary.members.iter().find(|m| m.member_id == a).unwrap();
        assert_eq!(a_spend.total_paid, 1200);
        assert_eq!(a_spend.total_owed, 600);
        let b_spend = summary.members.iter().find(|m| m.member_id == b).unwrap();
        assert_eq!(b_spend.total_paid, 0);
        assert_eq!(b_spend.total_owed, 600);

        let balances = app.view(|s| s.get_balances()).unwrap();
        let a_bal = balances.iter().find(|x| x.member_id == a).unwrap().net;
        let b_bal = balances.iter().find(|x| x.member_id == b).unwrap().net;
        assert_eq!(a_bal, 600);
        assert_eq!(b_bal, -600);

        // Chen settles up with Priya.
        app.call(|s| s.record_settlement(b.clone(), a.clone(), 600))
            .unwrap();
        let balances = app.view(|s| s.get_balances()).unwrap();
        let a_bal = balances.iter().find(|x| x.member_id == a).unwrap().net;
        let b_bal = balances.iter().find(|x| x.member_id == b).unwrap().net;
        assert_eq!(a_bal, 0);
        assert_eq!(b_bal, 0);
    }

    #[test]
    fn rename_group_restricted_to_creator() {
        let mut app = TestHost::new(|| GroupState::init("Goa Trip".into()));

        // Default TestHost identity is the creator that seeded the writer set.
        app.call(|s| s.rename_group("Goa Trip 2024".into())).unwrap();

        // A different executor is not a writer — rejected.
        assert!(app
            .call_as(MEMBER_B, |s| s.rename_group("Hacked".into()))
            .is_err());
    }
}
