//! Trip service — locations, expenses, photos, and settlement ledger.

use chat_types::ChatError;
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_sdk::PublicKey;
use calimero_storage::collections::{AuthoredMap, LwwRegister, SharedStorage};
use calimero_storage::env as storage_env;
use std::collections::{BTreeSet, HashMap};

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Entity types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct TripMeta {
    pub id: String,
    pub name: String,
    /// "pending" | "active" | "finished"
    pub status: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Location {
    pub id: String,
    pub author: String,
    pub description: String,
    pub posted_at: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Expense {
    pub id: String,
    pub payer: String,
    pub description: String,
    pub amount_cents: u64,
    pub participants: Vec<String>,
    pub logged_at: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Photo {
    pub id: String,
    pub author: String,
    pub url: String,
    pub uploaded_at: u64,
}

// ---------------------------------------------------------------------------
// Settlement types (named structs — no tuples in ABI return types)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct PersonAmount {
    pub member: String,
    pub amount_cents: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Balance {
    pub debtor: String,
    pub creditor: String,
    pub amount_cents: u64,
}

/// Full settlement view: what each person spent, what they owe, and the
/// minimum set of transfers to settle up.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct SettlementSummary {
    /// Total amount each person actually paid out.
    pub spent: Vec<PersonAmount>,
    /// Total share each person owes across all expenses.
    pub owed: Vec<PersonAmount>,
    /// Minimum transfers to settle all debts.
    pub balances: Vec<Balance>,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct TripState {
    /// Governed metadata (only the creator/organizer can mutate).
    metadata: SharedStorage<LwwRegister<TripMeta>>,
    /// Per-author location posts; each entry owned by its poster.
    locations: AuthoredMap<String, Location>,
    /// Per-author expense records; each entry owned by the logger.
    expenses: AuthoredMap<String, Expense>,
    /// Per-author photos; each entry owned by the uploader.
    photos: AuthoredMap<String, Photo>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Map SharedStorage ActionNotAllowed → domain Forbidden error.
fn map_shared_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "{action}: caller is not the trip organizer"
            )))
        } else {
            AppError::msg(format!("metadata.{action}: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// Logic
// ---------------------------------------------------------------------------

#[app::logic]
impl TripState {
    #[app::init]
    pub fn init() -> TripState {
        let creator: PublicKey = calimero_sdk::env::executor_id().into();
        let mut writers = BTreeSet::new();
        let _ = writers.insert(creator);
        // false = writer set can be rotated later (e.g. to hand off organizer role)
        let mut metadata =
            SharedStorage::new_with_field_name("trip:metadata", writers, false);
        // Insert a placeholder so reads before create_trip don't panic.
        let _ = metadata.insert(LwwRegister::new(TripMeta {
            id: String::new(),
            name: String::new(),
            status: "pending".into(),
            created_at: 0,
        }));
        TripState {
            metadata,
            locations: AuthoredMap::new_with_field_name("trip:locations"),
            expenses: AuthoredMap::new_with_field_name("trip:expenses"),
            photos: AuthoredMap::new_with_field_name("trip:photos"),
        }
    }

    // ---- Internal guard ----

    fn check_active(&self) -> app::Result<()> {
        let reg = self
            .metadata
            .get()
            .map_err(|e| AppError::msg(format!("metadata.get: {e}")))?;
        let status = &reg.get().status;
        if status == "finished" {
            app::bail!(ChatError::Invalid(
                "trip is finished; no further changes are allowed".into()
            ));
        }
        if status != "active" {
            app::bail!(ChatError::Invalid(
                "trip has not been created yet; call create_trip first".into()
            ));
        }
        Ok(())
    }

    // ---- Trip management ----

    /// Initialise (or rename) the trip. Only the organizer (context creator)
    /// can call this. Returns the trip id.
    pub fn create_trip(&mut self, name: String) -> app::Result<String> {
        if name.is_empty() {
            app::bail!(ChatError::Invalid("trip name must not be empty".into()));
        }
        let name: String = name.chars().take(100).collect();
        let now_ms = storage_env::time_now() / 1_000_000;
        let id = format!("trip-{}", now_ms);
        let meta = TripMeta {
            id: id.clone(),
            name: name.clone(),
            status: "active".into(),
            created_at: now_ms,
        };
        self.metadata
            .insert(LwwRegister::new(meta))
            .map_err(map_shared_error("create_trip"))?;
        app::emit!(Event::TripCreated { id: &id, name: &name });
        Ok(id)
    }

    /// Lock the trip. Only the organizer can call this. After this, no new
    /// locations, expenses, or photos may be added.
    pub fn finish_trip(&mut self) -> app::Result<()> {
        let mut meta = self
            .metadata
            .get()
            .map_err(|e| AppError::msg(format!("metadata.get: {e}")))?
            .get()
            .clone();
        if meta.status == "finished" {
            app::bail!(ChatError::Invalid("trip is already finished".into()));
        }
        meta.status = "finished".into();
        self.metadata
            .insert(LwwRegister::new(meta))
            .map_err(map_shared_error("finish_trip"))?;
        app::emit!(Event::TripFinished {});
        Ok(())
    }

    // ---- Locations ----

    /// Post the caller's current location/activity. Requires trip to be active.
    pub fn post_location(&mut self, description: String) -> app::Result<String> {
        self.check_active()?;
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;
        let suffix: String = caller.chars().take(8).collect();
        let id = format!("loc-{}-{}", now_ms, suffix);
        let loc = Location {
            id: id.clone(),
            author: caller.clone(),
            description,
            posted_at: now_ms,
        };
        self.locations
            .insert(id.clone(), loc)
            .map_err(|e| AppError::msg(format!("locations.insert: {e}")))?;
        app::emit!(Event::LocationPosted { id: &id, author: &caller });
        Ok(id)
    }

    /// Return all posted locations.
    pub fn get_locations(&self) -> app::Result<Vec<Location>> {
        let entries = self
            .locations
            .entries()
            .map_err(|e| AppError::msg(format!("locations.entries: {e}")))?;
        Ok(entries.map(|(_, v)| v).collect())
    }

    // ---- Expenses ----

    /// Log an expense. The caller is recorded as the payer. Requires active trip.
    pub fn log_expense(
        &mut self,
        description: String,
        amount_cents: u64,
        participants: Vec<String>,
    ) -> app::Result<String> {
        self.check_active()?;
        if participants.is_empty() {
            app::bail!(ChatError::Invalid(
                "participants list must not be empty".into()
            ));
        }
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;
        let suffix: String = caller.chars().take(8).collect();
        let id = format!("exp-{}-{}", now_ms, suffix);
        let expense = Expense {
            id: id.clone(),
            payer: caller.clone(),
            description,
            amount_cents,
            participants,
            logged_at: now_ms,
        };
        self.expenses
            .insert(id.clone(), expense)
            .map_err(|e| AppError::msg(format!("expenses.insert: {e}")))?;
        app::emit!(Event::ExpenseLogged { id: &id, payer: &caller });
        Ok(id)
    }

    /// Return all logged expenses.
    pub fn get_expenses(&self) -> app::Result<Vec<Expense>> {
        let entries = self
            .expenses
            .entries()
            .map_err(|e| AppError::msg(format!("expenses.entries: {e}")))?;
        Ok(entries.map(|(_, v)| v).collect())
    }

    // ---- Photos ----

    /// Upload a photo URL to the trip feed. Requires active trip.
    pub fn upload_photo(&mut self, url: String) -> app::Result<String> {
        self.check_active()?;
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;
        let suffix: String = caller.chars().take(8).collect();
        let id = format!("photo-{}-{}", now_ms, suffix);
        let photo = Photo {
            id: id.clone(),
            author: caller.clone(),
            url,
            uploaded_at: now_ms,
        };
        self.photos
            .insert(id.clone(), photo)
            .map_err(|e| AppError::msg(format!("photos.insert: {e}")))?;
        app::emit!(Event::PhotoUploaded { id: &id, author: &caller });
        Ok(id)
    }

    /// Return all uploaded photos.
    pub fn get_photos(&self) -> app::Result<Vec<Photo>> {
        let entries = self
            .photos
            .entries()
            .map_err(|e| AppError::msg(format!("photos.entries: {e}")))?;
        Ok(entries.map(|(_, v)| v).collect())
    }

    // ---- Settlement ----

    /// Compute the running cost breakdown: total paid per person, total owed
    /// per person (their share), and the minimum set of transfers to settle.
    pub fn get_settlement(&self) -> app::Result<SettlementSummary> {
        let expenses = self.get_expenses()?;

        let mut paid: HashMap<String, u64> = HashMap::new();
        let mut owed: HashMap<String, u64> = HashMap::new();

        for exp in &expenses {
            *paid.entry(exp.payer.clone()).or_insert(0) += exp.amount_cents;
            if !exp.participants.is_empty() {
                let share = exp.amount_cents / exp.participants.len() as u64;
                for p in &exp.participants {
                    *owed.entry(p.clone()).or_insert(0) += share;
                }
            }
        }

        // Collect all members referenced in either map.
        let mut all_members: BTreeSet<String> = BTreeSet::new();
        for k in paid.keys() {
            all_members.insert(k.clone());
        }
        for k in owed.keys() {
            all_members.insert(k.clone());
        }

        let spent_vec: Vec<PersonAmount> = all_members
            .iter()
            .map(|m| PersonAmount {
                member: m.clone(),
                amount_cents: *paid.get(m).unwrap_or(&0),
            })
            .collect();

        let owed_vec: Vec<PersonAmount> = all_members
            .iter()
            .map(|m| PersonAmount {
                member: m.clone(),
                amount_cents: *owed.get(m).unwrap_or(&0),
            })
            .collect();

        // Net balance: positive = creditor (is owed), negative = debtor (owes).
        let mut creditors: Vec<(String, i64)> = Vec::new();
        let mut debtors: Vec<(String, i64)> = Vec::new();
        for m in &all_members {
            let p = *paid.get(m).unwrap_or(&0) as i64;
            let o = *owed.get(m).unwrap_or(&0) as i64;
            let net = p - o;
            if net > 0 {
                creditors.push((m.clone(), net));
            } else if net < 0 {
                debtors.push((m.clone(), -net));
            }
        }

        // Greedy minimum-transfers settlement.
        let mut balances: Vec<Balance> = Vec::new();
        let mut ci = 0usize;
        let mut di = 0usize;
        while ci < creditors.len() && di < debtors.len() {
            let amount = creditors[ci].1.min(debtors[di].1);
            balances.push(Balance {
                debtor: debtors[di].0.clone(),
                creditor: creditors[ci].0.clone(),
                amount_cents: amount as u64,
            });
            creditors[ci].1 -= amount;
            debtors[di].1 -= amount;
            if creditors[ci].1 == 0 {
                ci += 1;
            }
            if debtors[di].1 == 0 {
                di += 1;
            }
        }

        Ok(SettlementSummary {
            spent: spent_vec,
            owed: owed_vec,
            balances,
        })
    }
}
