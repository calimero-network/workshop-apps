//! Expense tracker service — submit, review, and reimburse team expenses.

use chat_types::{generate_id, ChatError};
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{LwwRegister, Mergeable, UnorderedMap};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// Status ranks for monotonic merge logic.
fn status_rank(s: &str) -> u8 {
    match s {
        "pending" => 0,
        "approved" | "rejected" => 1,
        "reimbursed" => 2,
        _ => 0,
    }
}

/// A single expense submission.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Expense {
    pub id: String,
    /// Base58-encoded public key of the submitter.
    pub author: String,
    pub description: String,
    /// Amount in the smallest currency unit (e.g. cents).
    pub amount: u64,
    pub currency: String,
    pub category: String,
    /// One of: "pending", "approved", "rejected", "reimbursed".
    pub status: String,
    pub reviewer_note: String,
    /// Milliseconds since epoch of the last edit (or original submission).
    pub submitted_at: u64,
}

impl Mergeable for Expense {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Status advances monotonically: pending → approved/rejected → reimbursed.
        // If the incoming value has a higher-ranked status, adopt it along with
        // the reviewer note that accompanied the decision.
        if status_rank(&other.status) > status_rank(&self.status) {
            self.status = other.status.clone();
            self.reviewer_note = other.reviewer_note.clone();
        }
        // For description/amount/category we use submitted_at as a logical
        // clock: the most recent edit wins.
        if other.submitted_at > self.submitted_at {
            self.description = other.description.clone();
            self.amount = other.amount;
            self.currency = other.currency.clone();
            self.category = other.category.clone();
            self.submitted_at = other.submitted_at;
        }
        Ok(())
    }
}

/// An expense category (admin-managed).
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Category {
    pub id: String,
    pub name: String,
}

impl Mergeable for Category {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Keep non-empty name; last-writer-wins if both have names.
        if !other.name.is_empty() {
            self.name = other.name.clone();
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
pub struct ExpenseState {
    /// Base58-encoded pubkey of the context creator (ops role seed).
    creator: LwwRegister<String>,
    expenses: UnorderedMap<String, Expense>,
    categories: UnorderedMap<String, Category>,
}

// ---------------------------------------------------------------------------
// Logic
// ---------------------------------------------------------------------------

#[app::logic]
impl ExpenseState {
    #[app::init]
    pub fn init() -> ExpenseState {
        let creator = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        ExpenseState {
            creator: LwwRegister::new(creator),
            expenses: UnorderedMap::new_with_field_name("expenses:expenses"),
            categories: UnorderedMap::new_with_field_name("expenses:categories"),
        }
    }

    // ---- Internal helpers ----

    fn caller_b58() -> String {
        bs58::encode(calimero_sdk::env::executor_id()).into_string()
    }

    fn require_ops(&self) -> app::Result<()> {
        let caller = Self::caller_b58();
        if self.creator.get().as_str() != caller.as_str() {
            app::bail!(ChatError::Forbidden(
                "only ops team members can perform this action".into()
            ));
        }
        Ok(())
    }

    fn generate_expense_id() -> String {
        let now = storage_env::time_now();
        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        generate_id("exp", now, &nonce)
    }

    fn generate_category_id() -> String {
        let now = storage_env::time_now();
        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        generate_id("cat", now, &nonce)
    }

    // ---- Expense mutations ----

    /// Submit a new expense. Returns the generated expense id.
    pub fn submit_expense(
        &mut self,
        description: String,
        amount: u64,
        currency: String,
        category: String,
    ) -> app::Result<String> {
        if description.is_empty() {
            app::bail!(ChatError::Invalid("description is required".into()));
        }
        if currency.is_empty() {
            app::bail!(ChatError::Invalid("currency is required".into()));
        }
        if category.is_empty() {
            app::bail!(ChatError::Invalid("category is required".into()));
        }

        let author = Self::caller_b58();
        let now_ms = storage_env::time_now() / 1_000_000;
        let id = Self::generate_expense_id();

        let expense = Expense {
            id: id.clone(),
            author,
            description,
            amount,
            currency,
            category,
            status: "pending".into(),
            reviewer_note: String::new(),
            submitted_at: now_ms,
        };

        self.expenses
            .insert(id.clone(), expense)
            .map_err(|e| AppError::msg(format!("expenses.insert: {e}")))?;

        app::emit!(Event::ExpenseSubmitted { id: &id });
        Ok(id)
    }

    /// Edit a pending expense. Only the original author may edit, and only
    /// while the expense is still in "pending" status.
    pub fn edit_expense(
        &mut self,
        expense_id: String,
        description: String,
        amount: u64,
        currency: String,
        category: String,
    ) -> app::Result<()> {
        if description.is_empty() {
            app::bail!(ChatError::Invalid("description is required".into()));
        }

        let caller = Self::caller_b58();

        let existing = self
            .expenses
            .get(&expense_id)
            .map_err(|e| AppError::msg(format!("expenses.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("expense not found: {expense_id}")))?
            .clone();

        if existing.author != caller {
            app::bail!(ChatError::Forbidden(
                "only the author can edit their expense".into()
            ));
        }
        if existing.status != "pending" {
            app::bail!(ChatError::Invalid(
                "can only edit expenses in 'pending' status".into()
            ));
        }

        // Build updated record. Use a fresh submitted_at so the Mergeable
        // clock picks this version over the original.
        let updated = Expense {
            id: existing.id.clone(),
            author: existing.author.clone(),
            description,
            amount,
            currency,
            category,
            status: existing.status.clone(),
            reviewer_note: existing.reviewer_note.clone(),
            submitted_at: storage_env::time_now() / 1_000_000,
        };

        // UnorderedMap insert on an existing key calls Mergeable::merge.
        // Our merge picks the higher submitted_at, so the updated record wins.
        self.expenses
            .insert(expense_id.clone(), updated)
            .map_err(|e| AppError::msg(format!("expenses.insert (edit): {e}")))?;

        app::emit!(Event::ExpenseEdited { id: &expense_id });
        Ok(())
    }

    /// Approve a pending expense. Ops only.
    pub fn approve_expense(&mut self, expense_id: String, note: String) -> app::Result<()> {
        self.require_ops()?;

        let existing = self
            .expenses
            .get(&expense_id)
            .map_err(|e| AppError::msg(format!("expenses.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("expense not found: {expense_id}")))?
            .clone();

        if existing.status != "pending" {
            app::bail!(ChatError::Invalid(
                "can only approve expenses in 'pending' status".into()
            ));
        }

        let updated = Expense {
            status: "approved".into(),
            reviewer_note: note,
            ..existing
        };

        self.expenses
            .insert(expense_id.clone(), updated)
            .map_err(|e| AppError::msg(format!("expenses.insert (approve): {e}")))?;

        app::emit!(Event::ExpenseApproved { id: &expense_id });
        Ok(())
    }

    /// Reject a pending expense. Ops only.
    pub fn reject_expense(&mut self, expense_id: String, note: String) -> app::Result<()> {
        self.require_ops()?;

        let existing = self
            .expenses
            .get(&expense_id)
            .map_err(|e| AppError::msg(format!("expenses.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("expense not found: {expense_id}")))?
            .clone();

        if existing.status != "pending" {
            app::bail!(ChatError::Invalid(
                "can only reject expenses in 'pending' status".into()
            ));
        }

        let updated = Expense {
            status: "rejected".into(),
            reviewer_note: note,
            ..existing
        };

        self.expenses
            .insert(expense_id.clone(), updated)
            .map_err(|e| AppError::msg(format!("expenses.insert (reject): {e}")))?;

        app::emit!(Event::ExpenseRejected { id: &expense_id });
        Ok(())
    }

    /// Mark an approved expense as reimbursed. Ops only.
    pub fn mark_reimbursed(&mut self, expense_id: String) -> app::Result<()> {
        self.require_ops()?;

        let existing = self
            .expenses
            .get(&expense_id)
            .map_err(|e| AppError::msg(format!("expenses.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("expense not found: {expense_id}")))?
            .clone();

        if existing.status != "approved" {
            app::bail!(ChatError::Invalid(
                "can only reimburse expenses in 'approved' status".into()
            ));
        }

        let updated = Expense {
            status: "reimbursed".into(),
            ..existing
        };

        self.expenses
            .insert(expense_id.clone(), updated)
            .map_err(|e| AppError::msg(format!("expenses.insert (reimburse): {e}")))?;

        app::emit!(Event::ExpenseReimbursed { id: &expense_id });
        Ok(())
    }

    // ---- Expense views ----

    /// Return all expenses submitted by the calling member, newest first.
    pub fn list_my_expenses(&self) -> app::Result<Vec<Expense>> {
        let caller = Self::caller_b58();
        let entries = self
            .expenses
            .entries()
            .map_err(|e| AppError::msg(format!("expenses.entries: {e}")))?;

        let mut result: Vec<Expense> = entries
            .filter(|(_, v)| v.author == caller)
            .map(|(_, v)| v)
            .collect();
        result.sort_by(|a, b| b.submitted_at.cmp(&a.submitted_at));
        Ok(result)
    }

    /// Return all expenses with status "pending", newest first.
    pub fn list_pending_expenses(&self) -> app::Result<Vec<Expense>> {
        let entries = self
            .expenses
            .entries()
            .map_err(|e| AppError::msg(format!("expenses.entries: {e}")))?;

        let mut result: Vec<Expense> = entries
            .filter(|(_, v)| v.status == "pending")
            .map(|(_, v)| v)
            .collect();
        result.sort_by(|a, b| b.submitted_at.cmp(&a.submitted_at));
        Ok(result)
    }

    /// Return all expenses regardless of status, newest first.
    pub fn list_all_expenses(&self) -> app::Result<Vec<Expense>> {
        let entries = self
            .expenses
            .entries()
            .map_err(|e| AppError::msg(format!("expenses.entries: {e}")))?;

        let mut result: Vec<Expense> = entries.map(|(_, v)| v).collect();
        result.sort_by(|a, b| b.submitted_at.cmp(&a.submitted_at));
        Ok(result)
    }

    // ---- Category mutations ----

    /// Add an expense category. Ops only.
    pub fn add_category(&mut self, name: String) -> app::Result<String> {
        self.require_ops()?;

        if name.is_empty() {
            app::bail!(ChatError::Invalid("category name is required".into()));
        }

        let id = Self::generate_category_id();

        let category = Category {
            id: id.clone(),
            name,
        };

        self.categories
            .insert(id.clone(), category)
            .map_err(|e| AppError::msg(format!("categories.insert: {e}")))?;

        app::emit!(Event::CategoryAdded { id: &id });
        Ok(id)
    }

    // ---- Category views ----

    /// Return all available expense categories.
    pub fn list_categories(&self) -> app::Result<Vec<Category>> {
        let entries = self
            .categories
            .entries()
            .map_err(|e| AppError::msg(format!("categories.entries: {e}")))?;
        Ok(entries.map(|(_, v)| v).collect())
    }
}
