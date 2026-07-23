//! Team CRM service — shared contacts, deals, and communication history for
//! one sales team.
//!
//! - `contacts` / `deals` are `UnorderedMap`s: anyone on the team may add or
//!   edit any record (a `#[derive(Mergeable)]` struct of `LwwRegister` fields
//!   converges concurrent field edits by last-writer-wins per field).
//! - `interactions` is an `AuthoredMap`: only the team member who logged a
//!   call/email/meeting note may edit or delete it — storage rejects
//!   `update`/`remove` by anyone else, surfaced here as `Forbidden`.
//! - `interaction_ids` is a small `UnorderedSet` index: `AuthoredMap` has no
//!   enumeration method, so we keep a side-set of ids to support
//!   `list_interactions` (filtered by `contact_id`) and drop the id on delete.

use calimero_sdk::app;
use calimero_sdk::app::Mergeable;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::{AuthoredMap, LwwRegister, StoreError, UnorderedMap, UnorderedSet};
use calimero_storage::env as storage_env;
use team_crm_types::{generate_id, validate_label, Error};

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models — internal storage records (nest CRDTs, Borsh-only)
// ---------------------------------------------------------------------------

/// A contact record. Every field is individually last-writer-wins, so two
/// reps concurrently editing different fields (or the same field) of the same
/// contact converge cleanly. `#[derive(Mergeable)]` generates both the
/// field-wise merge and the required `RekeyTarget` re-keying for the nested
/// `LwwRegister`s.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Mergeable)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct ContactRecord {
    pub name: LwwRegister<String>,
    pub email: LwwRegister<String>,
    pub phone: LwwRegister<String>,
    pub company: LwwRegister<String>,
    pub created_at: LwwRegister<u64>,
}

/// A deal record. `stage` and `contract_details` are the fields expected to
/// change after creation; all fields are LWW so concurrent edits converge.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Mergeable)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct DealRecord {
    pub contact_id: LwwRegister<String>,
    pub title: LwwRegister<String>,
    pub stage: LwwRegister<String>,
    pub value: LwwRegister<u64>,
    pub contract_details: LwwRegister<String>,
    pub created_at: LwwRegister<u64>,
}

/// An interaction (call/email/meeting note) logged against a contact. Stored
/// in an `AuthoredMap`, so only its author may `edit_interaction` /
/// `delete_interaction` — storage enforces this structurally.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Mergeable)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct InteractionRecord {
    pub author: LwwRegister<String>,
    pub contact_id: LwwRegister<String>,
    pub kind: LwwRegister<String>,
    pub note: LwwRegister<String>,
    pub created_at: LwwRegister<u64>,
}

// ---------------------------------------------------------------------------
// Read-shaped views — serde-able, returned to callers
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct Contact {
    pub id: String,
    pub name: String,
    pub email: String,
    pub phone: String,
    pub company: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct Deal {
    pub id: String,
    pub contact_id: String,
    pub title: String,
    pub stage: String,
    pub value: u64,
    pub contract_details: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct Interaction {
    pub id: String,
    pub author: String,
    pub contact_id: String,
    pub kind: String,
    pub note: String,
    pub created_at: u64,
}

/// Default stage assigned to every newly created deal.
const INITIAL_STAGE: &str = "Lead";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
pub struct CrmState {
    /// Shared contact book. Anyone may add or edit a contact.
    contacts: UnorderedMap<String, ContactRecord>,
    /// Shared pipeline. Anyone may create a deal or move it between stages.
    deals: UnorderedMap<String, DealRecord>,
    /// Per-author communication history. Only the logging member may edit or
    /// delete their own entries.
    interactions: AuthoredMap<String, InteractionRecord>,
    /// Enumeration index for `interactions` (`AuthoredMap` has no `entries()`).
    interaction_ids: UnorderedSet<String>,
}

#[app::logic]
impl CrmState {
    #[app::init]
    pub fn init() -> CrmState {
        CrmState {
            contacts: UnorderedMap::new_with_field_name("crm:contacts"),
            deals: UnorderedMap::new_with_field_name("crm:deals"),
            interactions: AuthoredMap::new_with_field_name("crm:interactions"),
            interaction_ids: UnorderedSet::new_with_field_name("crm:interaction_ids"),
        }
    }

    // ---- Contacts ----

    pub fn add_contact(
        &mut self,
        name: String,
        email: String,
        phone: String,
        company: String,
    ) -> app::Result<String> {
        validate_label(&name).map_err(AppError::from)?;

        let now = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("contact", now, &nonce);

        let record = ContactRecord {
            name: LwwRegister::new(name.clone()),
            email: LwwRegister::new(email),
            phone: LwwRegister::new(phone),
            company: LwwRegister::new(company),
            created_at: LwwRegister::new(now),
        };
        self.contacts
            .insert(id.clone(), record)
            .map_err(|e| AppError::msg(format!("contacts.insert: {e}")))?;

        app::emit!(Event::ContactAdded { id: &id, name: &name });
        Ok(id)
    }

    /// List all contacts, sorted by creation time then id for a stable order
    /// (`UnorderedMap` iteration order is unspecified).
    pub fn list_contacts(&self) -> app::Result<Vec<Contact>> {
        let mut out: Vec<Contact> = self
            .contacts
            .entries()
            .map_err(|e| AppError::msg(format!("contacts.entries: {e}")))?
            .map(|(id, rec)| Contact {
                id,
                name: rec.name.get().clone(),
                email: rec.email.get().clone(),
                phone: rec.phone.get().clone(),
                company: rec.company.get().clone(),
                created_at: *rec.created_at.get(),
            })
            .collect();
        out.sort_by(|a, b| (a.created_at, &a.id).cmp(&(b.created_at, &b.id)));
        Ok(out)
    }

    // ---- Deals ----

    /// Create a deal against an existing contact. Starts at the `Lead` stage
    /// with empty contract details.
    pub fn create_deal(&mut self, contact_id: String, title: String, value: u64) -> app::Result<String> {
        validate_label(&title).map_err(AppError::from)?;
        let known = self
            .contacts
            .contains(&contact_id)
            .map_err(|e| AppError::msg(format!("contacts.contains: {e}")))?;
        if !known {
            app::bail!(Error::NotFound(contact_id));
        }

        let now = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("deal", now, &nonce);

        let record = DealRecord {
            contact_id: LwwRegister::new(contact_id.clone()),
            title: LwwRegister::new(title.clone()),
            stage: LwwRegister::new(INITIAL_STAGE.to_string()),
            value: LwwRegister::new(value),
            contract_details: LwwRegister::new(String::new()),
            created_at: LwwRegister::new(now),
        };
        self.deals
            .insert(id.clone(), record)
            .map_err(|e| AppError::msg(format!("deals.insert: {e}")))?;

        app::emit!(Event::DealCreated {
            id: &id,
            contact_id: &contact_id,
            title: &title,
        });
        Ok(id)
    }

    /// Move a deal to a new pipeline stage (LWW — concurrent stage changes
    /// converge to the last writer).
    pub fn update_deal_stage(&mut self, deal_id: String, stage: String) -> app::Result<()> {
        validate_label(&stage).map_err(AppError::from)?;

        let mut guard = self
            .deals
            .get_mut(&deal_id)
            .map_err(|e| AppError::msg(format!("deals.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(deal_id.clone())))?;
        guard.stage.set(stage.clone());
        drop(guard);

        app::emit!(Event::DealStageUpdated {
            id: &deal_id,
            stage: &stage,
        });
        Ok(())
    }

    /// Attach contract/payment details to a deal (LWW).
    pub fn set_contract_details(&mut self, deal_id: String, details: String) -> app::Result<()> {
        let mut guard = self
            .deals
            .get_mut(&deal_id)
            .map_err(|e| AppError::msg(format!("deals.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(deal_id.clone())))?;
        guard.contract_details.set(details);
        drop(guard);

        app::emit!(Event::ContractDetailsSet { id: &deal_id });
        Ok(())
    }

    /// List all deals, sorted by creation time then id for a stable order.
    /// The frontend groups these by `stage` for the pipeline view.
    pub fn list_deals(&self) -> app::Result<Vec<Deal>> {
        let mut out: Vec<Deal> = self
            .deals
            .entries()
            .map_err(|e| AppError::msg(format!("deals.entries: {e}")))?
            .map(|(id, rec)| Deal {
                id,
                contact_id: rec.contact_id.get().clone(),
                title: rec.title.get().clone(),
                stage: rec.stage.get().clone(),
                value: *rec.value.get(),
                contract_details: rec.contract_details.get().clone(),
                created_at: *rec.created_at.get(),
            })
            .collect();
        out.sort_by(|a, b| (a.created_at, &a.id).cmp(&(b.created_at, &b.id)));
        Ok(out)
    }

    // ---- Interactions ----

    /// Log a call/email/meeting note against a contact. The caller becomes
    /// the author; only they may later edit or delete it.
    pub fn log_interaction(&mut self, contact_id: String, kind: String, note: String) -> app::Result<String> {
        validate_label(&kind).map_err(AppError::from)?;
        let known = self
            .contacts
            .contains(&contact_id)
            .map_err(|e| AppError::msg(format!("contacts.contains: {e}")))?;
        if !known {
            app::bail!(Error::NotFound(contact_id));
        }

        let now = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("interaction", now, &nonce);
        let author = self.owner_b58();

        let record = InteractionRecord {
            author: LwwRegister::new(author.clone()),
            contact_id: LwwRegister::new(contact_id.clone()),
            kind: LwwRegister::new(kind),
            note: LwwRegister::new(note),
            created_at: LwwRegister::new(now),
        };
        self.interactions
            .insert(id.clone(), record)
            .map_err(|e| AppError::msg(format!("interactions.insert: {e}")))?;
        self.interaction_ids
            .insert(id.clone())
            .map_err(|e| AppError::msg(format!("interaction_ids.insert: {e}")))?;

        app::emit!(Event::InteractionLogged {
            id: &id,
            contact_id: &contact_id,
            author: &author,
        });
        Ok(id)
    }

    /// Edit an interaction's note. Author-only: `AuthoredMap::update` rejects
    /// anyone else with `ActionNotAllowed`, surfaced here as `Forbidden`.
    pub fn edit_interaction(&mut self, id: String, note: String) -> app::Result<()> {
        let existing = self
            .interactions
            .get(&id)
            .map_err(|e| AppError::msg(format!("interactions.get: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(id.clone())))?;

        let mut updated = existing;
        updated.note.set(note);
        self.interactions
            .update(&id, updated)
            .map_err(map_interaction_error("edit"))?;

        app::emit!(Event::InteractionEdited { id: &id });
        Ok(())
    }

    /// Delete an interaction. Author-only: `AuthoredMap::remove` rejects
    /// anyone else with `ActionNotAllowed`, surfaced here as `Forbidden`.
    pub fn delete_interaction(&mut self, id: String) -> app::Result<()> {
        let removed = self
            .interactions
            .remove(&id)
            .map_err(map_interaction_error("delete"))?;
        if removed.is_none() {
            app::bail!(Error::NotFound(id));
        }
        self.interaction_ids
            .remove(&id)
            .map_err(|e| AppError::msg(format!("interaction_ids.remove: {e}")))?;

        app::emit!(Event::InteractionDeleted { id: &id });
        Ok(())
    }

    /// List every interaction logged against one contact, sorted by creation
    /// time then id. `AuthoredMap` has no enumeration method, so this walks
    /// the `interaction_ids` index and filters by `contact_id`.
    pub fn list_interactions(&self, contact_id: String) -> app::Result<Vec<Interaction>> {
        let ids: Vec<String> = self
            .interaction_ids
            .iter()
            .map_err(|e| AppError::msg(format!("interaction_ids.iter: {e}")))?
            .collect();

        let mut out = Vec::new();
        for id in ids {
            let Some(rec) = self
                .interactions
                .get(&id)
                .map_err(|e| AppError::msg(format!("interactions.get: {e}")))?
            else {
                continue;
            };
            if *rec.contact_id.get() == contact_id {
                out.push(Interaction {
                    id,
                    author: rec.author.get().clone(),
                    contact_id: rec.contact_id.get().clone(),
                    kind: rec.kind.get().clone(),
                    note: rec.note.get().clone(),
                    created_at: *rec.created_at.get(),
                });
            }
        }
        out.sort_by(|a, b| (a.created_at, &a.id).cmp(&(b.created_at, &b.id)));
        Ok(out)
    }
}

impl CrmState {
    /// Base58 of the current executor — the public, shareable author identity.
    fn owner_b58(&self) -> String {
        bs58::encode(env::executor_id()).into_string()
    }
}

/// Translate an `AuthoredMap` access-control error into a friendly `Forbidden`.
fn map_interaction_error(action: &'static str) -> impl FnOnce(StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(Error::Forbidden(format!(
                "can only {action} interactions you logged"
            )))
        } else {
            AppError::msg(format!("interactions.{action}: {s}"))
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

    fn add_sample_contact(app: &mut TestHost<CrmState>) -> String {
        app.call(|s| s.add_contact("Jane Doe".into(), "jane@acme.com".into(), "555-0101".into(), "Acme Co".into()))
            .unwrap()
    }

    #[test]
    fn add_contact_then_list_roundtrip() {
        let mut app = TestHost::new(CrmState::init);

        let id = add_sample_contact(&mut app);
        let contacts = app.view(|s| s.list_contacts()).unwrap();
        assert_eq!(contacts.len(), 1);
        assert_eq!(contacts[0].id, id);
        assert_eq!(contacts[0].name, "Jane Doe");
        assert_eq!(contacts[0].company, "Acme Co");
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn create_deal_starts_at_lead_stage() {
        let mut app = TestHost::new(CrmState::init);
        let contact_id = add_sample_contact(&mut app);

        let deal_id = app
            .call(|s| s.create_deal(contact_id.clone(), "Acme renewal".into(), 5000))
            .unwrap();

        let deals = app.view(|s| s.list_deals()).unwrap();
        assert_eq!(deals.len(), 1);
        assert_eq!(deals[0].id, deal_id);
        assert_eq!(deals[0].contact_id, contact_id);
        assert_eq!(deals[0].stage, "Lead");
        assert_eq!(deals[0].value, 5000);
        assert_eq!(deals[0].contract_details, "");
    }

    #[test]
    fn create_deal_unknown_contact_errors() {
        let mut app = TestHost::new(CrmState::init);
        assert!(app
            .call(|s| s.create_deal("nope".into(), "Acme renewal".into(), 5000))
            .is_err());
    }

    #[test]
    fn update_deal_stage_changes_stage() {
        let mut app = TestHost::new(CrmState::init);
        let contact_id = add_sample_contact(&mut app);
        let deal_id = app
            .call(|s| s.create_deal(contact_id, "Acme renewal".into(), 5000))
            .unwrap();

        app.call(|s| s.update_deal_stage(deal_id.clone(), "Proposal".into())).unwrap();

        let deals = app.view(|s| s.list_deals()).unwrap();
        assert_eq!(deals[0].stage, "Proposal");
    }

    #[test]
    fn update_deal_stage_unknown_id_errors() {
        let mut app = TestHost::new(CrmState::init);
        assert!(app.call(|s| s.update_deal_stage("nope".into(), "Proposal".into())).is_err());
    }

    #[test]
    fn set_contract_details_roundtrip() {
        let mut app = TestHost::new(CrmState::init);
        let contact_id = add_sample_contact(&mut app);
        let deal_id = app
            .call(|s| s.create_deal(contact_id, "Acme renewal".into(), 5000))
            .unwrap();

        app.call(|s| s.set_contract_details(deal_id.clone(), "Signed 12-mo contract, NET 30".into()))
            .unwrap();

        let deals = app.view(|s| s.list_deals()).unwrap();
        assert_eq!(deals[0].contract_details, "Signed 12-mo contract, NET 30");
    }

    #[test]
    fn log_interaction_then_list_by_contact() {
        let mut app = TestHost::new(CrmState::init);
        let contact_id = add_sample_contact(&mut app);

        let interaction_id = app
            .call(|s| s.log_interaction(contact_id.clone(), "call".into(), "Discussed renewal terms".into()))
            .unwrap();

        let interactions = app.view(|s| s.list_interactions(contact_id)).unwrap();
        assert_eq!(interactions.len(), 1);
        assert_eq!(interactions[0].id, interaction_id);
        assert_eq!(interactions[0].kind, "call");
        assert_eq!(interactions[0].note, "Discussed renewal terms");
    }

    #[test]
    fn log_interaction_unknown_contact_errors() {
        let mut app = TestHost::new(CrmState::init);
        assert!(app
            .call(|s| s.log_interaction("nope".into(), "call".into(), "note".into()))
            .is_err());
    }

    #[test]
    fn author_can_edit_own_interaction() {
        let mut app = TestHost::new(CrmState::init);
        let contact_id = add_sample_contact(&mut app);
        let interaction_id = app
            .call(|s| s.log_interaction(contact_id.clone(), "call".into(), "v1".into()))
            .unwrap();

        app.call(|s| s.edit_interaction(interaction_id.clone(), "v2".into())).unwrap();

        let interactions = app.view(|s| s.list_interactions(contact_id)).unwrap();
        assert_eq!(interactions[0].note, "v2");
    }

    #[test]
    fn non_author_cannot_edit_interaction() {
        let mut app = TestHost::new(CrmState::init);
        let contact_id = add_sample_contact(&mut app);
        let interaction_id = app
            .call(|s| s.log_interaction(contact_id, "call".into(), "v1".into()))
            .unwrap();

        let other = [7u8; 32];
        let denied = app.call_as(other, |s| s.edit_interaction(interaction_id, "v2".into()));
        assert!(denied.is_err());
    }

    #[test]
    fn author_can_delete_own_interaction() {
        let mut app = TestHost::new(CrmState::init);
        let contact_id = add_sample_contact(&mut app);
        let interaction_id = app
            .call(|s| s.log_interaction(contact_id.clone(), "call".into(), "v1".into()))
            .unwrap();

        app.call(|s| s.delete_interaction(interaction_id)).unwrap();
        assert_eq!(app.view(|s| s.list_interactions(contact_id)).unwrap().len(), 0);
    }

    #[test]
    fn non_author_cannot_delete_interaction() {
        let mut app = TestHost::new(CrmState::init);
        let contact_id = add_sample_contact(&mut app);
        let interaction_id = app
            .call(|s| s.log_interaction(contact_id.clone(), "call".into(), "v1".into()))
            .unwrap();

        let other = [7u8; 32];
        let denied = app.call_as(other, |s| s.delete_interaction(interaction_id));
        assert!(denied.is_err());
        // The interaction survives the rejected delete.
        assert_eq!(app.view(|s| s.list_interactions(contact_id)).unwrap().len(), 1);
    }
}
