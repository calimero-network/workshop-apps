//! Incident manager service — shared incident tracker, timeline, postmortems,
//! and on-call schedule for the team.

use std::collections::BTreeSet;

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_sdk::PublicKey;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{AuthoredMap, LwwRegister, Mergeable, SharedStorage, UnorderedMap};
use calimero_storage::env as storage_env;
use chat_types::ChatError;

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// Severity rank for sorting: P1 (most severe) → P4 (least severe).
fn severity_rank(s: &str) -> u8 {
    match s {
        "P1" => 0,
        "P2" => 1,
        "P3" => 2,
        "P4" => 3,
        _ => 4,
    }
}

/// Status rank for CRDT merge: resolved > acknowledged > open.
fn status_rank(s: &str) -> u8 {
    match s {
        "open" => 0,
        "acknowledged" => 1,
        "resolved" => 2,
        _ => 0,
    }
}

/// An active or resolved incident reported by a team member.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Incident {
    pub id: String,
    pub title: String,
    pub description: String,
    /// Severity level: "P1" | "P2" | "P3" | "P4"
    pub severity: String,
    /// Status: "open" | "acknowledged" | "resolved"
    pub status: String,
    /// Base58 public key of the reporting member.
    pub reported_by: String,
    /// Base58 public key of the current incident commander (set on acknowledge).
    pub commander: Option<String>,
    /// Root cause tag set when resolving.
    pub root_cause: Option<String>,
    /// Creation timestamp in nanoseconds (storage_env::time_now()).
    pub created_at: u64,
    /// Resolution timestamp in nanoseconds; None while open/acknowledged.
    pub resolved_at: Option<u64>,
}

impl Mergeable for Incident {
    /// CRDT merge: status advances monotonically; optional fields set once stay set.
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Status: take the most advanced (open < acknowledged < resolved).
        let self_rank = status_rank(&self.status);
        let other_rank = status_rank(&other.status);
        if other_rank > self_rank {
            self.status = other.status.clone();
        }
        // Commander: set by the first acknowledgement; don't overwrite once set.
        if self.commander.is_none() && other.commander.is_some() {
            self.commander = other.commander.clone();
        }
        // Root cause: set at resolution; don't overwrite once set.
        if self.root_cause.is_none() && other.root_cause.is_some() {
            self.root_cause = other.root_cause.clone();
        }
        // Resolved at: set at resolution; don't overwrite once set.
        if self.resolved_at.is_none() && other.resolved_at.is_some() {
            self.resolved_at = other.resolved_at;
        }
        Ok(())
    }
}

/// A single entry in the incident timeline (status update, escalation, etc.).
/// Entries are authored; only the posting member owns their entries.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct TimelineEntry {
    pub id: String,
    pub incident_id: String,
    /// Base58 public key of the author.
    pub author: String,
    pub body: String,
    /// Entry kind: "status_update" | "escalation" | "comment" etc.
    pub entry_type: String,
    /// Creation timestamp in nanoseconds.
    pub created_at: u64,
}

impl Mergeable for TimelineEntry {
    /// Timeline entries are immutable after posting; no merge needed.
    fn merge(&mut self, _other: &Self) -> Result<(), MergeError> {
        Ok(())
    }
}

/// A collaborative postmortem for a resolved incident.
/// Keyed by `incident_id` in the postmortems map.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Postmortem {
    pub id: String,
    pub incident_id: String,
    pub summary: String,
    pub root_cause: String,
    pub action_items: String,
    /// Base58 public key of the last editor.
    pub last_edited_by: String,
    /// Creation timestamp in nanoseconds.
    pub created_at: u64,
}

impl Mergeable for Postmortem {
    /// Collaborative editing: take whichever version has the most total content.
    /// This is commutative and ensures concurrent edits converge deterministically.
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        let self_total = self.summary.len() + self.root_cause.len() + self.action_items.len();
        let other_total = other.summary.len() + other.root_cause.len() + other.action_items.len();
        if other_total > self_total {
            self.summary = other.summary.clone();
            self.root_cause = other.root_cause.clone();
            self.action_items = other.action_items.clone();
            self.last_edited_by = other.last_edited_by.clone();
        }
        Ok(())
    }
}

/// A single slot in the on-call rotation schedule.
/// The full schedule is a `Vec<OnCallSlot>` governed by SharedStorage.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct OnCallSlot {
    pub id: String,
    pub member_name: String,
    /// Identifier (e.g. pubkey or user ID) of the on-call member.
    pub member_id: String,
    /// Slot start time in milliseconds since epoch.
    pub start_time: u64,
    /// Slot end time in milliseconds since epoch.
    pub end_time: u64,
    /// Display order in the rotation (lower = earlier).
    pub order: u32,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Return the executor's pubkey as a base58 string.
fn executor_b58() -> String {
    bs58::encode(calimero_sdk::env::executor_id()).into_string()
}

/// Return the executor's pubkey as a calimero `PublicKey` (for writer sets).
fn executor_pubkey() -> PublicKey {
    calimero_sdk::env::executor_id().into()
}

/// Generate a short unique ID: `{prefix}-{4 random hex bytes}`.
fn gen_id(prefix: &str) -> String {
    let mut nonce = [0u8; 4];
    calimero_sdk::env::random_bytes(&mut nonce);
    let hex: String = nonce.iter().fold(String::with_capacity(8), |mut acc, b| {
        acc.push_str(&format!("{:02x}", b));
        acc
    });
    format!("{prefix}-{hex}")
}

/// Map SharedStorage write errors to a Forbidden AppError.
fn map_shared_err(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "{action}: caller is not authorized (not the team lead)"
            )))
        } else {
            AppError::msg(format!("{action}: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/// `#[app::state]` injects borsh derives; do not add them manually.
#[app::state(emits = for<'a> Event<'a>)]
pub struct IncidentManagerState {
    /// All incidents keyed by incident ID.
    incidents: UnorderedMap<String, Incident>,
    /// Timeline entries keyed by entry ID; authored so only the poster can delete.
    timeline: AuthoredMap<String, TimelineEntry>,
    /// Postmortems keyed by `incident_id` (one postmortem per incident).
    postmortems: UnorderedMap<String, Postmortem>,
    /// On-call schedule governed by SharedStorage; only the team lead (creator)
    /// can modify. Wraps the whole schedule as a single governed value.
    oncall_schedule: SharedStorage<LwwRegister<Vec<OnCallSlot>>>,
}

// ---------------------------------------------------------------------------
// Logic
// ---------------------------------------------------------------------------

#[app::logic]
impl IncidentManagerState {
    #[app::init]
    pub fn init() -> IncidentManagerState {
        // The context creator becomes the sole initial writer of the on-call
        // schedule. This maps to "team lead" in the spec.
        let creator: PublicKey = executor_pubkey();
        let mut writers = BTreeSet::new();
        let _ = writers.insert(creator);
        let mut oncall_schedule =
            SharedStorage::new_with_field_name("incident_manager:oncall", writers, false);
        // Seed with an empty schedule so `get()` never returns None.
        let _ = oncall_schedule.insert(LwwRegister::new(Vec::<OnCallSlot>::new()));

        IncidentManagerState {
            incidents: UnorderedMap::new_with_field_name("incident_manager:incidents"),
            timeline: AuthoredMap::new_with_field_name("incident_manager:timeline"),
            postmortems: UnorderedMap::new_with_field_name("incident_manager:postmortems"),
            oncall_schedule,
        }
    }

    // ---- Incidents ----

    /// Report a new incident. Returns the generated incident ID.
    pub fn report_incident(
        &mut self,
        title: String,
        description: String,
        severity: String,
    ) -> app::Result<String> {
        if title.is_empty() {
            app::bail!(ChatError::Invalid("title must not be empty".into()));
        }
        match severity.as_str() {
            "P1" | "P2" | "P3" | "P4" => {}
            _ => app::bail!(ChatError::Invalid(
                "severity must be one of P1, P2, P3, P4".into()
            )),
        }

        let caller = executor_b58();
        let id = gen_id("inc");
        let now = storage_env::time_now();

        let incident = Incident {
            id: id.clone(),
            title,
            description,
            severity: severity.clone(),
            status: "open".into(),
            reported_by: caller,
            commander: None,
            root_cause: None,
            created_at: now,
            resolved_at: None,
        };

        self.incidents
            .insert(id.clone(), incident)
            .map_err(|e| AppError::msg(format!("incidents.insert: {e}")))?;

        app::emit!(Event::IncidentReported {
            id: &id,
            severity: &severity,
        });
        Ok(id)
    }

    /// Acknowledge an open incident. The caller becomes the incident commander.
    pub fn acknowledge_incident(&mut self, incident_id: String) -> app::Result<()> {
        let caller = executor_b58();

        let mut incident = self
            .incidents
            .get(&incident_id)
            .map_err(|e| AppError::msg(format!("incidents.get: {e}")))?
            .map(|v| v.clone())
            .ok_or_else(|| AppError::from(ChatError::NotFound(incident_id.clone())))?;

        if incident.status != "open" {
            app::bail!(ChatError::Invalid(format!(
                "incident {} cannot be acknowledged (status: {})",
                incident_id, incident.status
            )));
        }

        incident.status = "acknowledged".into();
        incident.commander = Some(caller);

        // Use insert so the Mergeable::merge handles concurrent acknowledges.
        self.incidents
            .insert(incident_id.clone(), incident)
            .map_err(|e| AppError::msg(format!("incidents.insert: {e}")))?;

        app::emit!(Event::IncidentAcknowledged { id: &incident_id });
        Ok(())
    }

    /// Escalate an open incident to the next on-call responder.
    /// Creates a timeline entry and updates the incident commander.
    /// Returns the ID of the created timeline entry.
    pub fn escalate_incident(
        &mut self,
        incident_id: String,
        next_responder_id: String,
    ) -> app::Result<String> {
        let caller = executor_b58();

        let mut incident = self
            .incidents
            .get(&incident_id)
            .map_err(|e| AppError::msg(format!("incidents.get: {e}")))?
            .map(|v| v.clone())
            .ok_or_else(|| AppError::from(ChatError::NotFound(incident_id.clone())))?;

        if incident.status == "resolved" {
            app::bail!(ChatError::Invalid(format!(
                "incident {} is resolved and cannot be escalated",
                incident_id
            )));
        }
        if incident.status != "open" {
            app::bail!(ChatError::Invalid(format!(
                "only open incidents can be escalated (status: {})",
                incident.status
            )));
        }

        // Record the next responder as commander.
        incident.commander = Some(next_responder_id.clone());

        self.incidents
            .insert(incident_id.clone(), incident)
            .map_err(|e| AppError::msg(format!("incidents.insert: {e}")))?;

        // Log the escalation as a timeline entry.
        let entry_id = gen_id("tle");
        let now = storage_env::time_now();
        let body = format!(
            "Escalated to {} by {}",
            next_responder_id, caller
        );
        let entry = TimelineEntry {
            id: entry_id.clone(),
            incident_id: incident_id.clone(),
            author: caller,
            body,
            entry_type: "escalation".into(),
            created_at: now,
        };

        self.timeline
            .insert(entry_id.clone(), entry)
            .map_err(|e| AppError::msg(format!("timeline.insert: {e}")))?;

        app::emit!(Event::IncidentEscalated {
            id: &incident_id,
            entry_id: &entry_id,
        });
        Ok(entry_id)
    }

    /// Resolve an incident and tag it with a root cause.
    pub fn resolve_incident(
        &mut self,
        incident_id: String,
        root_cause: String,
    ) -> app::Result<()> {
        let mut incident = self
            .incidents
            .get(&incident_id)
            .map_err(|e| AppError::msg(format!("incidents.get: {e}")))?
            .map(|v| v.clone())
            .ok_or_else(|| AppError::from(ChatError::NotFound(incident_id.clone())))?;

        if incident.status == "resolved" {
            app::bail!(ChatError::Invalid(format!(
                "incident {} is already resolved",
                incident_id
            )));
        }

        incident.status = "resolved".into();
        incident.root_cause = Some(root_cause);
        incident.resolved_at = Some(storage_env::time_now());

        self.incidents
            .insert(incident_id.clone(), incident)
            .map_err(|e| AppError::msg(format!("incidents.insert: {e}")))?;

        app::emit!(Event::IncidentResolved { id: &incident_id });
        Ok(())
    }

    // ---- Timeline ----

    /// Post a timeline entry on an incident. Returns the entry ID.
    pub fn post_timeline_entry(
        &mut self,
        incident_id: String,
        body: String,
        entry_type: String,
    ) -> app::Result<String> {
        if body.is_empty() {
            app::bail!(ChatError::Invalid("body must not be empty".into()));
        }

        // Verify the incident exists.
        let incident_exists = self
            .incidents
            .contains(&incident_id)
            .map_err(|e| AppError::msg(format!("incidents.contains: {e}")))?;
        if !incident_exists {
            app::bail!(ChatError::NotFound(incident_id));
        }

        let caller = executor_b58();
        let entry_id = gen_id("tle");
        let now = storage_env::time_now();

        let entry = TimelineEntry {
            id: entry_id.clone(),
            incident_id: incident_id.clone(),
            author: caller,
            body,
            entry_type,
            created_at: now,
        };

        self.timeline
            .insert(entry_id.clone(), entry)
            .map_err(|e| AppError::msg(format!("timeline.insert: {e}")))?;

        app::emit!(Event::TimelineEntryPosted {
            id: &entry_id,
            incident_id: &incident_id,
        });
        Ok(entry_id)
    }

    /// Return all timeline entries for an incident, sorted chronologically.
    pub fn get_timeline(&self, incident_id: String) -> app::Result<Vec<TimelineEntry>> {
        let mut entries: Vec<TimelineEntry> = self
            .timeline
            .entries()
            .map_err(|e| AppError::msg(format!("timeline.entries: {e}")))?
            .filter(|(_, e)| e.incident_id == incident_id)
            .map(|(_, e)| e)
            .collect();

        entries.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        Ok(entries)
    }

    // ---- Incident views ----

    /// List incidents, optionally filtered by status ("open", "acknowledged",
    /// "resolved"). When no filter is given, all incidents are returned.
    /// Results are sorted by severity (P1 first, P4 last).
    pub fn list_incidents(
        &self,
        status_filter: Option<String>,
    ) -> app::Result<Vec<Incident>> {
        let all: Vec<Incident> = self
            .incidents
            .entries()
            .map_err(|e| AppError::msg(format!("incidents.entries: {e}")))?
            .map(|(_, v)| v)
            .collect();

        let mut filtered: Vec<Incident> = match &status_filter {
            Some(s) => all.into_iter().filter(|i| &i.status == s).collect(),
            None => all,
        };

        // Sort P1 → P4; ties broken by creation time (newest first).
        filtered.sort_by(|a, b| {
            severity_rank(&a.severity)
                .cmp(&severity_rank(&b.severity))
                .then(b.created_at.cmp(&a.created_at))
        });
        Ok(filtered)
    }

    /// Retrieve a single incident by ID.
    pub fn get_incident(&self, incident_id: String) -> app::Result<Incident> {
        self.incidents
            .get(&incident_id)
            .map_err(|e| AppError::msg(format!("incidents.get: {e}")))?
            .map(|v| v.clone())
            .ok_or_else(|| AppError::from(ChatError::NotFound(incident_id)))
    }

    // ---- Postmortems ----

    /// Create a postmortem for a resolved incident. Returns the postmortem ID.
    pub fn create_postmortem(
        &mut self,
        incident_id: String,
        summary: String,
        root_cause: String,
        action_items: String,
    ) -> app::Result<String> {
        // Verify incident exists and is resolved.
        let incident = self
            .incidents
            .get(&incident_id)
            .map_err(|e| AppError::msg(format!("incidents.get: {e}")))?
            .map(|v| v.clone())
            .ok_or_else(|| AppError::from(ChatError::NotFound(incident_id.clone())))?;

        if incident.status != "resolved" {
            app::bail!(ChatError::Invalid(
                "postmortems can only be created for resolved incidents".into()
            ));
        }

        // One postmortem per incident (keyed by incident_id in the map).
        let already_exists = self
            .postmortems
            .contains(&incident_id)
            .map_err(|e| AppError::msg(format!("postmortems.contains: {e}")))?;
        if already_exists {
            app::bail!(ChatError::Invalid(format!(
                "a postmortem already exists for incident {}",
                incident_id
            )));
        }

        let caller = executor_b58();
        let pm_id = gen_id("pm");
        let now = storage_env::time_now();

        let pm = Postmortem {
            id: pm_id.clone(),
            incident_id: incident_id.clone(),
            summary,
            root_cause,
            action_items,
            last_edited_by: caller,
            created_at: now,
        };

        // Keyed by incident_id so get_postmortem(incident_id) is O(1).
        self.postmortems
            .insert(incident_id.clone(), pm)
            .map_err(|e| AppError::msg(format!("postmortems.insert: {e}")))?;

        app::emit!(Event::PostmortemCreated {
            id: &pm_id,
            incident_id: &incident_id,
        });
        Ok(pm_id)
    }

    /// Update an existing postmortem's text fields.
    /// Finds the postmortem by its ID (scanning once) and updates in place.
    pub fn update_postmortem(
        &mut self,
        postmortem_id: String,
        summary: String,
        root_cause: String,
        action_items: String,
    ) -> app::Result<()> {
        let caller = executor_b58();

        // Scan to find which incident_id key owns this postmortem_id.
        let entries: Vec<(String, Postmortem)> = self
            .postmortems
            .entries()
            .map_err(|e| AppError::msg(format!("postmortems.entries: {e}")))?
            .collect();

        let (incident_key, mut pm) = entries
            .into_iter()
            .find(|(_, pm)| pm.id == postmortem_id)
            .ok_or_else(|| AppError::from(ChatError::NotFound(postmortem_id.clone())))?;

        pm.summary = summary;
        pm.root_cause = root_cause;
        pm.action_items = action_items;
        pm.last_edited_by = caller;

        // insert merges via Mergeable; "more content wins" merge will accept
        // the updated version as long as total length >= the stored version.
        // For a clean overwrite, remove first then re-insert.
        self.postmortems
            .remove(&incident_key)
            .map_err(|e| AppError::msg(format!("postmortems.remove: {e}")))?;
        self.postmortems
            .insert(incident_key, pm)
            .map_err(|e| AppError::msg(format!("postmortems.insert: {e}")))?;

        app::emit!(Event::PostmortemUpdated { id: &postmortem_id });
        Ok(())
    }

    /// Return the postmortem for an incident, or None if not yet written.
    pub fn get_postmortem(&self, incident_id: String) -> app::Result<Option<Postmortem>> {
        Ok(self
            .postmortems
            .get(&incident_id)
            .map_err(|e| AppError::msg(format!("postmortems.get: {e}")))?
            .map(|v| v.clone()))
    }

    // ---- On-call schedule ----

    /// Add a new on-call slot to the schedule. Only the context creator (team
    /// lead) can call this. Returns the generated slot ID.
    pub fn set_oncall_slot(
        &mut self,
        member_name: String,
        member_id: String,
        start_time: u64,
        end_time: u64,
        order: u32,
    ) -> app::Result<String> {
        if member_name.is_empty() {
            app::bail!(ChatError::Invalid("member_name must not be empty".into()));
        }
        if end_time <= start_time {
            app::bail!(ChatError::Invalid(
                "end_time must be after start_time".into()
            ));
        }

        let slot_id = gen_id("oc");

        let mut schedule = self
            .oncall_schedule
            .get()
            .map_err(|e| AppError::msg(format!("oncall_schedule.get: {e}")))?
            .get()
            .clone();

        let new_slot = OnCallSlot {
            id: slot_id.clone(),
            member_name,
            member_id,
            start_time,
            end_time,
            order,
        };

        schedule.push(new_slot);
        // Keep the display order stable.
        schedule.sort_by(|a, b| a.order.cmp(&b.order).then(a.start_time.cmp(&b.start_time)));

        self.oncall_schedule
            .insert(LwwRegister::new(schedule))
            .map_err(map_shared_err("set_oncall_slot"))?;

        app::emit!(Event::OnCallSlotSet { id: &slot_id });
        Ok(slot_id)
    }

    /// Remove an on-call slot by ID. Only the team lead can call this.
    pub fn remove_oncall_slot(&mut self, slot_id: String) -> app::Result<()> {
        let mut schedule = self
            .oncall_schedule
            .get()
            .map_err(|e| AppError::msg(format!("oncall_schedule.get: {e}")))?
            .get()
            .clone();

        let original_len = schedule.len();
        schedule.retain(|s| s.id != slot_id);

        if schedule.len() == original_len {
            app::bail!(ChatError::NotFound(slot_id.clone()));
        }

        self.oncall_schedule
            .insert(LwwRegister::new(schedule))
            .map_err(map_shared_err("remove_oncall_slot"))?;

        app::emit!(Event::OnCallSlotRemoved { id: &slot_id });
        Ok(())
    }

    /// Return the full on-call schedule sorted by order then start_time.
    pub fn get_oncall_schedule(&self) -> app::Result<Vec<OnCallSlot>> {
        Ok(self
            .oncall_schedule
            .get()
            .map_err(|e| AppError::msg(format!("oncall_schedule.get: {e}")))?
            .get()
            .clone())
    }
}
