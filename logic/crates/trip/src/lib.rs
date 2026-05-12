//! Trip service — shared expenses, balances, and settlement.

use std::collections::{BTreeSet, HashMap};

use chat_types::{generate_id, ChatError};
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_sdk::PublicKey;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{
    AuthoredMap, LwwRegister, Mergeable, SharedStorage, UnorderedMap,
};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// Governed trip metadata — only the creator (initial writer) may mutate this.
#[derive(Debug, Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct TripMetadata {
    pub id: String,
    pub name: String,
    pub currency: String,
    pub created_at: u64,
}

/// A shared expense paid by one participant and split among several.
/// Ownership is `authored` — only the creator may edit or delete.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Expense {
    pub id: String,
    pub payer: String,
    pub amount: f64,
    pub description: String,
    pub split_among: Vec<String>,
    pub created_at: u64,
}

/// A settlement payment from one participant to another.
/// Ownership is `shared` — any participant may record a payment.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Payment {
    pub id: String,
    pub from: String,
    pub to: String,
    pub amount: f64,
    pub created_at: u64,
}

impl Mergeable for Payment {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Payments are append-only; on concurrent insert of the same id keep the
        // earlier timestamp so the record is deterministic across replicas.
        if other.created_at < self.created_at {
            *self = other.clone();
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn executor_pubkey() -> PublicKey {
    calimero_sdk::env::executor_id().into()
}

fn executor_b58() -> String {
    bs58::encode(calimero_sdk::env::executor_id()).into_string()
}

/// Map `SharedStorage` errors: `ActionNotAllowed` → `Forbidden`.
fn map_shared_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "{action}: caller is not the trip creator"
            )))
        } else {
            AppError::msg(format!("metadata.{action}: {s}"))
        }
    }
}

/// Map `AuthoredMap` errors: `ActionNotAllowed` → `Forbidden`.
fn map_authored_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "can only {action} your own expenses"
            )))
        } else {
            AppError::msg(format!("expenses.{action}: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// Trip state
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct TripState {
    /// Governed trip metadata; writer set = [creator].
    metadata: SharedStorage<LwwRegister<TripMetadata>>,
    /// Per-expense authorship — storage rejects edits/deletes by non-authors.
    expenses: AuthoredMap<String, Expense>,
    /// Shared payment log — any participant may append.
    payments: UnorderedMap<String, Payment>,
}

#[app::logic]
impl TripState {
    #[app::init]
    pub fn init() -> TripState {
        let creator = executor_pubkey();
        let mut writers = BTreeSet::new();
        let _ = writers.insert(creator);
        let metadata = SharedStorage::new_with_field_name("trip:metadata", writers, false);

        TripState {
            metadata,
            expenses: AuthoredMap::new_with_field_name("trip:expenses"),
            payments: UnorderedMap::new_with_field_name("trip:payments"),
        }
    }

    // ---- Trip setup ----

    /// Name and configure the trip. Must be called by the context creator.
    pub fn create_trip(&mut self, name: String, currency: String) -> app::Result<String> {
        if name.is_empty() || name.len() > 128 {
            app::bail!(ChatError::Invalid(
                "trip name must be 1-128 characters".into()
            ));
        }
        if currency.is_empty() || currency.len() > 8 {
            app::bail!(ChatError::Invalid(
                "currency code must be 1-8 characters".into()
            ));
        }

        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let trip_id = generate_id("trip", now_ms, &nonce);

        let meta = TripMetadata {
            id: trip_id.clone(),
            name: name.clone(),
            currency,
            created_at: now_ms,
        };

        self.metadata
            .insert(LwwRegister::new(meta))
            .map_err(map_shared_error("create_trip"))?;

        app::emit!(Event::TripCreated {
            id: &trip_id,
            name: &name,
        });
        Ok(trip_id)
    }

    // ---- Expenses ----

    /// Log an expense paid by the caller and split among the given participants.
    /// The caller's base58 public key is recorded as `payer`.
    pub fn add_expense(
        &mut self,
        amount: f64,
        description: String,
        split_among: Vec<String>,
    ) -> app::Result<String> {
        if amount <= 0.0 {
            app::bail!(ChatError::Invalid("amount must be positive".into()));
        }
        if description.is_empty() {
            app::bail!(ChatError::Invalid(
                "description must not be empty".into()
            ));
        }
        if split_among.is_empty() {
            app::bail!(ChatError::Invalid(
                "split_among must contain at least one participant".into()
            ));
        }

        let payer = executor_b58();
        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let exp_id = generate_id("exp", now_ms, &nonce);

        let expense = Expense {
            id: exp_id.clone(),
            payer: payer.clone(),
            amount,
            description,
            split_among,
            created_at: now_ms,
        };

        self.expenses
            .insert(exp_id.clone(), expense)
            .map_err(|e| AppError::msg(format!("expenses.insert: {e}")))?;

        app::emit!(Event::ExpenseAdded {
            id: &exp_id,
            payer: &payer,
        });
        Ok(exp_id)
    }

    /// Return all expenses sorted chronologically by (created_at, id).
    pub fn list_expenses(&self) -> app::Result<Vec<Expense>> {
        let mut out: Vec<Expense> = self
            .expenses
            .entries()
            .map_err(|e| AppError::msg(format!("expenses.entries: {e}")))?
            .map(|(_, v)| v)
            .collect();
        out.sort_by(|a, b| (a.created_at, &a.id).cmp(&(b.created_at, &b.id)));
        Ok(out)
    }

    /// Edit an expense. Only the original author may do this.
    pub fn edit_expense(
        &mut self,
        id: String,
        new_amount: f64,
        new_description: String,
    ) -> app::Result<()> {
        if new_amount <= 0.0 {
            app::bail!(ChatError::Invalid("amount must be positive".into()));
        }
        if new_description.is_empty() {
            app::bail!(ChatError::Invalid(
                "description must not be empty".into()
            ));
        }

        let mut expense = self
            .expenses
            .get(&id)
            .map_err(|e| AppError::msg(format!("expenses.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(id.clone())))?;

        expense.amount = new_amount;
        expense.description = new_description;

        // AuthoredMap::update returns ActionNotAllowed when executor != author.
        self.expenses
            .update(&id, expense)
            .map_err(map_authored_error("edit"))?;

        app::emit!(Event::ExpenseEdited { id: &id });
        Ok(())
    }

    /// Delete an expense. Only the original author may do this.
    pub fn delete_expense(&mut self, id: String) -> app::Result<()> {
        // AuthoredMap::remove returns ActionNotAllowed when executor != author,
        // and Ok(None) when the entry is already gone.
        let removed = self
            .expenses
            .remove(&id)
            .map_err(map_authored_error("delete"))?;
        if removed.is_none() {
            app::bail!(ChatError::NotFound(id));
        }

        app::emit!(Event::ExpenseDeleted { id: &id });
        Ok(())
    }

    // ---- Balances ----

    /// Compute net balances for every participant seen in expenses or payments.
    /// Positive value = others owe that participant.
    /// Negative value = that participant owes others.
    pub fn get_balances(&self) -> app::Result<HashMap<String, f64>> {
        let mut balances: HashMap<String, f64> = HashMap::new();

        // ── Expenses ──────────────────────────────────────────────────────────
        let expenses: Vec<Expense> = self
            .expenses
            .entries()
            .map_err(|e| AppError::msg(format!("expenses.entries: {e}")))?
            .map(|(_, v)| v)
            .collect();

        for expense in &expenses {
            let n = expense.split_among.len() as f64;
            if n == 0.0 {
                continue;
            }
            let share = expense.amount / n;
            // Payer advanced every other participant's share.
            // Their net credit = total − their own share.
            *balances.entry(expense.payer.clone()).or_insert(0.0) +=
                expense.amount - share;
            // Each non-payer participant owes their share.
            for person in &expense.split_among {
                if person != &expense.payer {
                    *balances.entry(person.clone()).or_insert(0.0) -= share;
                }
            }
        }

        // ── Payments ──────────────────────────────────────────────────────────
        let payments: Vec<Payment> = self
            .payments
            .entries()
            .map_err(|e| AppError::msg(format!("payments.entries: {e}")))?
            .map(|(_, v)| v)
            .collect();

        for payment in &payments {
            // `from` has paid off some debt → their balance improves.
            *balances.entry(payment.from.clone()).or_insert(0.0) += payment.amount;
            // `to` received payment → their receivable decreases.
            *balances.entry(payment.to.clone()).or_insert(0.0) -= payment.amount;
        }

        Ok(balances)
    }

    // ---- Payments ----

    /// Record a settlement payment from one participant to another.
    pub fn record_payment(
        &mut self,
        from: String,
        to: String,
        amount: f64,
    ) -> app::Result<String> {
        if amount <= 0.0 {
            app::bail!(ChatError::Invalid("amount must be positive".into()));
        }
        if from == to {
            app::bail!(ChatError::Invalid(
                "from and to must be different participants".into()
            ));
        }

        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let pay_id = generate_id("pay", now_ms, &nonce);

        let payment = Payment {
            id: pay_id.clone(),
            from: from.clone(),
            to: to.clone(),
            amount,
            created_at: now_ms,
        };

        self.payments
            .insert(pay_id.clone(), payment)
            .map_err(|e| AppError::msg(format!("payments.insert: {e}")))?;

        app::emit!(Event::PaymentRecorded {
            id: &pay_id,
            from: &from,
            to: &to,
        });
        Ok(pay_id)
    }
}
