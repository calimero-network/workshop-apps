//! Incident-tracker service — collaborative incident management.
//!
//! One shared Calimero context holds all incidents, comments, postmortems,
//! and the current on-call entry. Key patterns:
//!
//! - `incidents: UnorderedMap<String, IncidentData>` — any peer may update
//!   status/severity (all mutable fields are LwwRegister for CRDT convergence).
//! - `comments / postmortems: UnorderedMap` + paired `AuthoredMap` ownership
//!   index (same scaffold pattern as items + owners) — author-gates edit/delete.
//! - `on_call: UnorderedMap` with a single fixed key "current" — LWW by
//!   started_at, replaced on each `set_on_call` call.

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::address::Id;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::rekey::{field_child_id, RekeyTarget};
use calimero_storage::collections::{AuthoredMap, LwwRegister, Mergeable, UnorderedMap};
use calimero_storage::env as storage_env;
use incident_command_types::{generate_id, Error};

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Internal storage structs
// ---------------------------------------------------------------------------

/// Stored incident. All mutable fields are `LwwRegister` so concurrent edits
/// (status changes, severity escalations, reassignments) converge by HLC
/// last-writer-wins. `created_by` and `created_at` are set once at creation.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct IncidentData {
    pub title: LwwRegister<String>,
    pub description: LwwRegister<String>,
    pub severity: LwwRegister<String>,
    /// "open" | "acknowledged" | "resolved"
    pub status: LwwRegister<String>,
    /// Empty string = no assignee.
    pub assignee: LwwRegister<String>,
    pub created_by: String,
    pub created_at: u64,
    /// 0 = not yet resolved.
    pub resolved_at: LwwRegister<u64>,
}

impl Mergeable for IncidentData {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Immutable fields: deterministic tie-break so merge is commutative.
        if (other.created_at, &other.created_by) < (self.created_at, &self.created_by) {
            self.created_by = other.created_by.clone();
            self.created_at = other.created_at;
        }
        // Mutable fields: delegate to each LwwRegister's own merge (HLC).
        self.title.merge(&other.title);
        self.description.merge(&other.description);
        self.severity.merge(&other.severity);
        self.status.merge(&other.status);
        self.assignee.merge(&other.assignee);
        self.resolved_at.merge(&other.resolved_at);
        Ok(())
    }
}

impl RekeyTarget for IncidentData {
    fn rekey_relative_to(&mut self, parent_id: Id) {
        calimero_storage::rekey_field_if_supported!(
            &mut self.title,
            field_child_id(parent_id, "title")
        );
        calimero_storage::rekey_field_if_supported!(
            &mut self.description,
            field_child_id(parent_id, "description")
        );
        calimero_storage::rekey_field_if_supported!(
            &mut self.severity,
            field_child_id(parent_id, "severity")
        );
        calimero_storage::rekey_field_if_supported!(
            &mut self.status,
            field_child_id(parent_id, "status")
        );
        calimero_storage::rekey_field_if_supported!(
            &mut self.assignee,
            field_child_id(parent_id, "assignee")
        );
        calimero_storage::rekey_field_if_supported!(
            &mut self.resolved_at,
            field_child_id(parent_id, "resolved_at")
        );
    }
}

/// Stored comment. No nested CRDTs; the paired `comment_authors` AuthoredMap
/// gates edit/delete by non-authors. `updated_at` drives LWW merge.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct CommentData {
    pub incident_id: String,
    pub author: String,
    pub body: String,
    pub created_at: u64,
    /// Set to `created_at` on insert; updated to `now_ms` on each edit.
    pub updated_at: u64,
}

impl Mergeable for CommentData {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Most-recently-edited version wins.
        if other.updated_at > self.updated_at {
            *self = other.clone();
        }
        Ok(())
    }
}

impl RekeyTarget for CommentData {
    fn rekey_relative_to(&mut self, _parent_id: Id) {
        // No nested CRDTs; nothing to rekey.
    }
}

/// Stored postmortem. No nested CRDTs; the paired `postmortem_authors`
/// AuthoredMap gates edits by non-authors. `updated_at` drives LWW merge.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct PostmortemData {
    pub incident_id: String,
    pub author: String,
    pub timeline: String,
    pub root_cause: String,
    pub action_items: String,
    pub created_at: u64,
    pub updated_at: u64,
}

impl Mergeable for PostmortemData {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if other.updated_at > self.updated_at {
            *self = other.clone();
        }
        Ok(())
    }
}

impl RekeyTarget for PostmortemData {
    fn rekey_relative_to(&mut self, _parent_id: Id) {}
}

/// Stored on-call entry. Single "current" key in the `on_call` UnorderedMap.
/// `started_at` drives LWW merge so the most recently set entry wins.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct OnCallData {
    pub id: String,
    pub responder: String,
    pub started_at: u64,
}

impl Mergeable for OnCallData {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if other.started_at > self.started_at {
            *self = other.clone();
        }
        Ok(())
    }
}

impl RekeyTarget for OnCallData {
    fn rekey_relative_to(&mut self, _parent_id: Id) {}
}

// ---------------------------------------------------------------------------
// View types (serde-able — returned to callers via ABI)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct Incident {
    pub id: String,
    pub title: String,
    pub description: String,
    pub severity: String,
    pub status: String,
    pub assignee: Option<String>,
    pub created_by: String,
    pub created_at: u64,
    pub resolved_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct Comment {
    pub id: String,
    pub incident_id: String,
    pub author: String,
    pub body: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct Postmortem {
    pub id: String,
    pub incident_id: String,
    pub author: String,
    pub timeline: String,
    pub root_cause: String,
    pub action_items: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct OnCallEntry {
    pub id: String,
    pub responder: String,
    pub started_at: u64,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
pub struct IncidentTracker {
    /// All incidents keyed by generated id. Any peer may update mutable fields.
    incidents: UnorderedMap<String, IncidentData>,
    /// Comments keyed by comment id.
    comments: UnorderedMap<String, CommentData>,
    /// Authorship index for comments — auto-gates edit/delete by non-authors.
    comment_authors: AuthoredMap<String, LwwRegister<u64>>,
    /// Postmortems keyed by postmortem id.
    postmortems: UnorderedMap<String, PostmortemData>,
    /// Authorship index for postmortems — auto-gates edit by non-authors.
    postmortem_authors: AuthoredMap<String, LwwRegister<u64>>,
    /// Current on-call entry stored under the fixed key "current".
    on_call: UnorderedMap<String, OnCallData>,
}

#[app::logic]
impl IncidentTracker {
    #[app::init]
    pub fn init() -> IncidentTracker {
        IncidentTracker {
            incidents: UnorderedMap::new_with_field_name("tracker:incidents"),
            comments: UnorderedMap::new_with_field_name("tracker:comments"),
            comment_authors: AuthoredMap::new_with_field_name("tracker:comment_authors"),
            postmortems: UnorderedMap::new_with_field_name("tracker:postmortems"),
            postmortem_authors: AuthoredMap::new_with_field_name("tracker:postmortem_authors"),
            on_call: UnorderedMap::new_with_field_name("tracker:on_call"),
        }
    }

    // ---- Incidents --------------------------------------------------------

    /// Declare a new incident. Returns its generated id. Status starts as "open"
    /// and the caller is recorded as creator.
    pub fn create_incident(
        &mut self,
        title: String,
        description: String,
        severity: String,
    ) -> app::Result<String> {
        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("inc", now_ms, &nonce);
        let created_by = caller_b58();

        let data = IncidentData {
            title: LwwRegister::new(title),
            description: LwwRegister::new(description),
            severity: LwwRegister::new(severity),
            status: LwwRegister::new("open".into()),
            assignee: LwwRegister::new(String::new()),
            created_by,
            created_at: now_ms,
            resolved_at: LwwRegister::new(0u64),
        };
        self.incidents
            .insert(id.clone(), data)
            .map_err(|e| AppError::msg(format!("incidents.insert: {e}")))?;

        app::emit!(Event::IncidentCreated { id: &id });
        Ok(id)
    }

    /// Acknowledge an incident — sets status to "acknowledged".
    pub fn acknowledge_incident(&mut self, incident_id: String) -> app::Result<()> {
        let mut guard = self
            .incidents
            .get_mut(&incident_id)
            .map_err(|e| AppError::msg(format!("incidents.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(incident_id.clone())))?;
        guard.status.set("acknowledged".into());
        drop(guard);

        app::emit!(Event::IncidentAcknowledged { id: &incident_id });
        Ok(())
    }

    /// Resolve an incident — sets status to "resolved" and stamps resolved_at.
    pub fn resolve_incident(&mut self, incident_id: String) -> app::Result<()> {
        let now_ms = storage_env::time_now() / 1_000_000;
        let mut guard = self
            .incidents
            .get_mut(&incident_id)
            .map_err(|e| AppError::msg(format!("incidents.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(incident_id.clone())))?;
        guard.status.set("resolved".into());
        guard.resolved_at.set(now_ms);
        drop(guard);

        app::emit!(Event::IncidentResolved { id: &incident_id });
        Ok(())
    }

    /// Change an incident's severity and/or assignee. Both fields are optional;
    /// passing `None` leaves the current value unchanged.
    pub fn update_incident(
        &mut self,
        incident_id: String,
        severity: Option<String>,
        assignee: Option<String>,
    ) -> app::Result<()> {
        let mut guard = self
            .incidents
            .get_mut(&incident_id)
            .map_err(|e| AppError::msg(format!("incidents.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(incident_id.clone())))?;
        if let Some(s) = severity {
            guard.severity.set(s);
        }
        if let Some(a) = assignee {
            guard.assignee.set(a);
        }
        drop(guard);

        app::emit!(Event::IncidentUpdated { id: &incident_id });
        Ok(())
    }

    /// List all incidents sorted by severity (critical first), then by creation time.
    pub fn list_incidents(&self) -> app::Result<Vec<Incident>> {
        let mut out: Vec<Incident> = self
            .incidents
            .entries()
            .map_err(|e| AppError::msg(format!("incidents.entries: {e}")))?
            .map(|(id, data)| incident_to_view(id, &data))
            .collect();
        out.sort_by(|a, b| {
            (severity_order(&a.severity), a.created_at)
                .cmp(&(severity_order(&b.severity), b.created_at))
        });
        Ok(out)
    }

    /// Get a single incident by id. Errors if not found.
    pub fn get_incident(&self, incident_id: String) -> app::Result<Incident> {
        let data = self
            .incidents
            .get(&incident_id)
            .map_err(|e| AppError::msg(format!("incidents.get: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(incident_id.clone())))?;
        Ok(incident_to_view(incident_id, &data))
    }

    // ---- Comments ---------------------------------------------------------

    /// Post a comment on an incident thread. Returns the new comment id.
    pub fn add_comment(&mut self, incident_id: String, body: String) -> app::Result<String> {
        // Verify the incident exists before adding a comment.
        let _ = self
            .incidents
            .get(&incident_id)
            .map_err(|e| AppError::msg(format!("incidents.get: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(incident_id.clone())))?;

        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("cmt", now_ms, &nonce);
        let author = caller_b58();

        let data = CommentData {
            incident_id: incident_id.clone(),
            author,
            body,
            created_at: now_ms,
            updated_at: now_ms,
        };
        self.comments
            .insert(id.clone(), data)
            .map_err(|e| AppError::msg(format!("comments.insert: {e}")))?;
        // Stamp the caller as author. The value is the creation timestamp;
        // the authorship stamp on the AuthoredMap entry is what gates deletion.
        self.comment_authors
            .insert(id.clone(), LwwRegister::new(now_ms))
            .map_err(|e| AppError::msg(format!("comment_authors.insert: {e}")))?;

        app::emit!(Event::CommentAdded { id: &id, incident_id: &incident_id });
        Ok(id)
    }

    /// Edit a comment's body. Only the original author may edit.
    pub fn edit_comment(&mut self, comment_id: String, body: String) -> app::Result<()> {
        // Manual author check before mutating the comment data.
        let caller = caller_b58();
        let owner = self
            .comment_authors
            .owner_of(&comment_id)
            .map_err(|e| AppError::msg(format!("comment_authors.owner_of: {e}")))?
            .map(String::from)
            .unwrap_or_default();
        if owner.is_empty() {
            app::bail!(Error::NotFound(comment_id.clone()));
        }
        if owner != caller {
            app::bail!(Error::Forbidden("only the author may edit this comment".into()));
        }

        let now_ms = storage_env::time_now() / 1_000_000;
        let mut guard = self
            .comments
            .get_mut(&comment_id)
            .map_err(|e| AppError::msg(format!("comments.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(comment_id.clone())))?;
        guard.body = body;
        guard.updated_at = now_ms;
        drop(guard);

        app::emit!(Event::CommentEdited { id: &comment_id });
        Ok(())
    }

    /// Delete a comment. Owner-gated: `AuthoredMap::remove` rejects non-authors
    /// with `ActionNotAllowed`, surfaced here as `Forbidden`.
    pub fn delete_comment(&mut self, comment_id: String) -> app::Result<()> {
        let removed = self
            .comment_authors
            .remove(&comment_id)
            .map_err(map_author_error("only the author may delete this comment"))?;
        if removed.is_none() {
            app::bail!(Error::NotFound(comment_id.clone()));
        }
        self.comments
            .remove(&comment_id)
            .map_err(|e| AppError::msg(format!("comments.remove: {e}")))?;

        app::emit!(Event::CommentDeleted { id: &comment_id });
        Ok(())
    }

    /// List all comments for an incident, ordered by creation time.
    pub fn get_comments(&self, incident_id: String) -> app::Result<Vec<Comment>> {
        let mut out: Vec<Comment> = self
            .comments
            .entries()
            .map_err(|e| AppError::msg(format!("comments.entries: {e}")))?
            .filter(|(_, data)| data.incident_id == incident_id)
            .map(|(id, data)| Comment {
                id,
                incident_id: data.incident_id.clone(),
                author: data.author.clone(),
                body: data.body.clone(),
                created_at: data.created_at,
            })
            .collect();
        out.sort_by_key(|c| c.created_at);
        Ok(out)
    }

    // ---- Postmortems ------------------------------------------------------

    /// Publish a postmortem for a resolved incident. Errors if the incident is
    /// not yet resolved. Returns the new postmortem id.
    pub fn create_postmortem(
        &mut self,
        incident_id: String,
        timeline: String,
        root_cause: String,
        action_items: String,
    ) -> app::Result<String> {
        // Only resolved incidents may have postmortems.
        let inc_data = self
            .incidents
            .get(&incident_id)
            .map_err(|e| AppError::msg(format!("incidents.get: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(incident_id.clone())))?;
        if inc_data.status.get() != "resolved" {
            app::bail!(Error::Invalid(
                "postmortem can only be created for a resolved incident".into()
            ));
        }

        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("pm", now_ms, &nonce);
        let author = caller_b58();

        let data = PostmortemData {
            incident_id: incident_id.clone(),
            author,
            timeline,
            root_cause,
            action_items,
            created_at: now_ms,
            updated_at: now_ms,
        };
        self.postmortems
            .insert(id.clone(), data)
            .map_err(|e| AppError::msg(format!("postmortems.insert: {e}")))?;
        self.postmortem_authors
            .insert(id.clone(), LwwRegister::new(now_ms))
            .map_err(|e| AppError::msg(format!("postmortem_authors.insert: {e}")))?;

        app::emit!(Event::PostmortemCreated { id: &id, incident_id: &incident_id });
        Ok(id)
    }

    /// Edit a postmortem. Only the author may edit; all fields are optional.
    pub fn edit_postmortem(
        &mut self,
        postmortem_id: String,
        timeline: Option<String>,
        root_cause: Option<String>,
        action_items: Option<String>,
    ) -> app::Result<()> {
        let caller = caller_b58();
        let owner = self
            .postmortem_authors
            .owner_of(&postmortem_id)
            .map_err(|e| AppError::msg(format!("postmortem_authors.owner_of: {e}")))?
            .map(String::from)
            .unwrap_or_default();
        if owner.is_empty() {
            app::bail!(Error::NotFound(postmortem_id.clone()));
        }
        if owner != caller {
            app::bail!(Error::Forbidden("only the author may edit this postmortem".into()));
        }

        let now_ms = storage_env::time_now() / 1_000_000;
        let mut guard = self
            .postmortems
            .get_mut(&postmortem_id)
            .map_err(|e| AppError::msg(format!("postmortems.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(postmortem_id.clone())))?;
        if let Some(t) = timeline {
            guard.timeline = t;
        }
        if let Some(r) = root_cause {
            guard.root_cause = r;
        }
        if let Some(a) = action_items {
            guard.action_items = a;
        }
        guard.updated_at = now_ms;
        drop(guard);

        app::emit!(Event::PostmortemEdited { id: &postmortem_id });
        Ok(())
    }

    /// Get the postmortem for an incident, if one exists.
    pub fn get_postmortem(&self, incident_id: String) -> app::Result<Option<Postmortem>> {
        let result = self
            .postmortems
            .entries()
            .map_err(|e| AppError::msg(format!("postmortems.entries: {e}")))?
            .find(|(_, data)| data.incident_id == incident_id);
        Ok(result.map(|(id, data)| Postmortem {
            id,
            incident_id: data.incident_id.clone(),
            author: data.author.clone(),
            timeline: data.timeline.clone(),
            root_cause: data.root_cause.clone(),
            action_items: data.action_items.clone(),
            created_at: data.created_at,
        }))
    }

    // ---- On-call ----------------------------------------------------------

    /// Set the current on-call person. Always replaces any existing entry.
    /// Returns the new on-call entry id.
    pub fn set_on_call(&mut self, responder: String) -> app::Result<String> {
        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("oc", now_ms, &nonce);

        let current_key = "current".to_string();
        // Separate existence check from mutation to avoid E0499. Using
        // `if let Some(guard) = self.on_call.get_mut(...) { } else { insert(...) }`
        // causes the borrow checker to see the guard's lifetime as spanning the
        // else branch too, making `insert` a second concurrent mutable borrow.
        // `get` returns an owned value so its borrow is released before we
        // call `get_mut` or `insert`.
        let exists = self
            .on_call
            .get(&current_key)
            .map_err(|e| AppError::msg(format!("on_call.get: {e}")))?
            .is_some();

        if exists {
            let mut guard = self
                .on_call
                .get_mut(&current_key)
                .map_err(|e| AppError::msg(format!("on_call.get_mut: {e}")))?
                .expect("existence confirmed above");
            guard.id = id.clone();
            guard.responder = responder.clone();
            guard.started_at = now_ms;
            drop(guard);
        } else {
            let entry = OnCallData {
                id: id.clone(),
                responder: responder.clone(),
                started_at: now_ms,
            };
            self.on_call
                .insert(current_key, entry)
                .map_err(|e| AppError::msg(format!("on_call.insert: {e}")))?;
        }

        app::emit!(Event::OnCallUpdated { responder: &responder });
        Ok(id)
    }

    /// Get the current on-call entry, or `None` if none has been set.
    pub fn get_on_call(&self) -> app::Result<Option<OnCallEntry>> {
        let result = self
            .on_call
            .get(&"current".to_string())
            .map_err(|e| AppError::msg(format!("on_call.get: {e}")))?;
        Ok(result.map(|data| OnCallEntry {
            id: data.id.clone(),
            responder: data.responder.clone(),
            started_at: data.started_at,
        }))
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Base58 of the current executor (the caller's public identity).
fn caller_b58() -> String {
    bs58::encode(env::executor_id()).into_string()
}

/// Numeric severity rank for dashboard sort: lower = more urgent.
fn severity_order(s: &str) -> u8 {
    match s {
        "critical" => 0,
        "high" => 1,
        "medium" => 2,
        "low" => 3,
        _ => 4,
    }
}

fn incident_to_view(id: String, data: &IncidentData) -> Incident {
    let assignee_val = data.assignee.get().clone();
    let resolved_at_val = *data.resolved_at.get();
    Incident {
        id,
        title: data.title.get().clone(),
        description: data.description.get().clone(),
        severity: data.severity.get().clone(),
        status: data.status.get().clone(),
        assignee: if assignee_val.is_empty() {
            None
        } else {
            Some(assignee_val)
        },
        created_by: data.created_by.clone(),
        created_at: data.created_at,
        resolved_at: if resolved_at_val == 0 {
            None
        } else {
            Some(resolved_at_val)
        },
    }
}

/// Translate an `AuthoredMap` access-control error into a friendly `Forbidden`.
fn map_author_error(
    msg: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(Error::Forbidden(msg.into()))
        } else {
            AppError::msg(format!("authored_map.remove: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// Tests — one TestHost roundtrip per mutation
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use calimero_sdk::testing::TestHost;

    const OTHER: [u8; 32] = [0x55u8; 32];

    // ---- Incidents ----

    #[test]
    fn create_and_get_incident() {
        let mut app = TestHost::new(IncidentTracker::init);

        let id = app
            .call(|s| {
                s.create_incident(
                    "DB down".into(),
                    "Primary DB unreachable".into(),
                    "critical".into(),
                )
            })
            .unwrap();

        let inc = app.view(|s| s.get_incident(id.clone())).unwrap();
        assert_eq!(inc.title, "DB down");
        assert_eq!(inc.severity, "critical");
        assert_eq!(inc.status, "open");
        assert!(inc.assignee.is_none());
        assert!(inc.resolved_at.is_none());
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn list_incidents_sorted_by_severity() {
        let mut app = TestHost::new(IncidentTracker::init);

        app.call(|s| s.create_incident("L".into(), "d".into(), "low".into())).unwrap();
        app.call(|s| s.create_incident("C".into(), "d".into(), "critical".into())).unwrap();
        app.call(|s| s.create_incident("H".into(), "d".into(), "high".into())).unwrap();

        let list = app.view(|s| s.list_incidents()).unwrap();
        assert_eq!(list.len(), 3);
        assert_eq!(list[0].severity, "critical");
        assert_eq!(list[1].severity, "high");
        assert_eq!(list[2].severity, "low");
    }

    #[test]
    fn get_incident_not_found_errors() {
        let mut app = TestHost::new(IncidentTracker::init);
        assert!(app.view(|s| s.get_incident("nope".into())).is_err());
    }

    #[test]
    fn acknowledge_incident() {
        let mut app = TestHost::new(IncidentTracker::init);

        let id = app
            .call(|s| s.create_incident("t".into(), "d".into(), "high".into()))
            .unwrap();
        app.call(|s| s.acknowledge_incident(id.clone())).unwrap();
        assert_eq!(
            app.view(|s| s.get_incident(id)).unwrap().status,
            "acknowledged"
        );
    }

    #[test]
    fn resolve_incident_stamps_resolved_at() {
        let mut app = TestHost::new(IncidentTracker::init);

        let id = app
            .call(|s| s.create_incident("t".into(), "d".into(), "high".into()))
            .unwrap();
        app.call(|s| s.resolve_incident(id.clone())).unwrap();
        let inc = app.view(|s| s.get_incident(id)).unwrap();
        assert_eq!(inc.status, "resolved");
        assert!(inc.resolved_at.is_some());
    }

    #[test]
    fn update_incident_severity_and_assignee() {
        let mut app = TestHost::new(IncidentTracker::init);

        let id = app
            .call(|s| s.create_incident("t".into(), "d".into(), "low".into()))
            .unwrap();
        app.call(|s| {
            s.update_incident(id.clone(), Some("critical".into()), Some("alice".into()))
        })
        .unwrap();
        let inc = app.view(|s| s.get_incident(id)).unwrap();
        assert_eq!(inc.severity, "critical");
        assert_eq!(inc.assignee, Some("alice".into()));
    }

    #[test]
    fn update_incident_partial_leaves_other_field() {
        let mut app = TestHost::new(IncidentTracker::init);

        let id = app
            .call(|s| s.create_incident("t".into(), "d".into(), "low".into()))
            .unwrap();
        // Update only severity, leave assignee untouched.
        app.call(|s| s.update_incident(id.clone(), Some("high".into()), None)).unwrap();
        let inc = app.view(|s| s.get_incident(id)).unwrap();
        assert_eq!(inc.severity, "high");
        assert!(inc.assignee.is_none());
    }

    // ---- Comments ----

    #[test]
    fn add_and_get_comments() {
        let mut app = TestHost::new(IncidentTracker::init);

        let inc_id = app
            .call(|s| s.create_incident("t".into(), "d".into(), "high".into()))
            .unwrap();
        let cmt_id = app
            .call(|s| s.add_comment(inc_id.clone(), "Investigating".into()))
            .unwrap();

        let comments = app.view(|s| s.get_comments(inc_id.clone())).unwrap();
        assert_eq!(comments.len(), 1);
        assert_eq!(comments[0].id, cmt_id);
        assert_eq!(comments[0].body, "Investigating");
        assert_eq!(comments[0].incident_id, inc_id);
    }

    #[test]
    fn add_comment_unknown_incident_errors() {
        let mut app = TestHost::new(IncidentTracker::init);
        assert!(app.call(|s| s.add_comment("nope".into(), "hi".into())).is_err());
    }

    #[test]
    fn edit_comment_by_author() {
        let mut app = TestHost::new(IncidentTracker::init);

        let inc_id = app
            .call(|s| s.create_incident("t".into(), "d".into(), "high".into()))
            .unwrap();
        let cmt_id = app.call(|s| s.add_comment(inc_id.clone(), "v1".into())).unwrap();
        app.call(|s| s.edit_comment(cmt_id.clone(), "v2".into())).unwrap();

        let comments = app.view(|s| s.get_comments(inc_id)).unwrap();
        assert_eq!(comments[0].body, "v2");
    }

    #[test]
    fn edit_comment_non_author_rejected() {
        let mut app = TestHost::new(IncidentTracker::init);

        let inc_id = app
            .call(|s| s.create_incident("t".into(), "d".into(), "high".into()))
            .unwrap();
        let cmt_id = app.call(|s| s.add_comment(inc_id, "v1".into())).unwrap();

        assert!(app
            .call_as(OTHER, |s| s.edit_comment(cmt_id, "hacked".into()))
            .is_err());
    }

    #[test]
    fn delete_comment_by_author() {
        let mut app = TestHost::new(IncidentTracker::init);

        let inc_id = app
            .call(|s| s.create_incident("t".into(), "d".into(), "high".into()))
            .unwrap();
        let cmt_id = app.call(|s| s.add_comment(inc_id.clone(), "bye".into())).unwrap();
        app.call(|s| s.delete_comment(cmt_id)).unwrap();
        assert_eq!(app.view(|s| s.get_comments(inc_id)).unwrap().len(), 0);
    }

    #[test]
    fn delete_comment_non_author_rejected() {
        let mut app = TestHost::new(IncidentTracker::init);

        let inc_id = app
            .call(|s| s.create_incident("t".into(), "d".into(), "high".into()))
            .unwrap();
        let cmt_id = app.call(|s| s.add_comment(inc_id.clone(), "bye".into())).unwrap();

        assert!(app.call_as(OTHER, |s| s.delete_comment(cmt_id.clone())).is_err());
        // Comment survives the rejected delete.
        assert_eq!(app.view(|s| s.get_comments(inc_id)).unwrap().len(), 1);
    }

    // ---- Postmortems ----

    #[test]
    fn create_postmortem_requires_resolved() {
        let mut app = TestHost::new(IncidentTracker::init);

        let inc_id = app
            .call(|s| s.create_incident("t".into(), "d".into(), "high".into()))
            .unwrap();
        // Not resolved — must fail.
        assert!(app
            .call(|s| s.create_postmortem(
                inc_id.clone(),
                "tl".into(),
                "rc".into(),
                "ai".into()
            ))
            .is_err());

        // Resolve first.
        app.call(|s| s.resolve_incident(inc_id.clone())).unwrap();
        let pm_id = app
            .call(|s| {
                s.create_postmortem(inc_id.clone(), "timeline".into(), "root cause".into(), "actions".into())
            })
            .unwrap();

        let pm = app.view(|s| s.get_postmortem(inc_id)).unwrap().unwrap();
        assert_eq!(pm.id, pm_id);
        assert_eq!(pm.root_cause, "root cause");
    }

    #[test]
    fn edit_postmortem_by_author() {
        let mut app = TestHost::new(IncidentTracker::init);

        let inc_id = app
            .call(|s| s.create_incident("t".into(), "d".into(), "high".into()))
            .unwrap();
        app.call(|s| s.resolve_incident(inc_id.clone())).unwrap();
        let pm_id = app
            .call(|s| s.create_postmortem(inc_id.clone(), "tl".into(), "rc".into(), "ai".into()))
            .unwrap();
        app.call(|s| s.edit_postmortem(pm_id, None, None, Some("new actions".into())))
            .unwrap();

        let pm = app.view(|s| s.get_postmortem(inc_id)).unwrap().unwrap();
        assert_eq!(pm.action_items, "new actions");
        assert_eq!(pm.root_cause, "rc"); // unchanged field preserved
    }

    #[test]
    fn edit_postmortem_non_author_rejected() {
        let mut app = TestHost::new(IncidentTracker::init);

        let inc_id = app
            .call(|s| s.create_incident("t".into(), "d".into(), "high".into()))
            .unwrap();
        app.call(|s| s.resolve_incident(inc_id.clone())).unwrap();
        let pm_id = app
            .call(|s| s.create_postmortem(inc_id, "tl".into(), "rc".into(), "ai".into()))
            .unwrap();

        assert!(app
            .call_as(OTHER, |s| s.edit_postmortem(pm_id, Some("hacked".into()), None, None))
            .is_err());
    }

    #[test]
    fn get_postmortem_none_when_absent() {
        let mut app = TestHost::new(IncidentTracker::init);

        let inc_id = app
            .call(|s| s.create_incident("t".into(), "d".into(), "high".into()))
            .unwrap();
        assert!(app.view(|s| s.get_postmortem(inc_id)).unwrap().is_none());
    }

    // ---- On-call ----

    #[test]
    fn set_and_get_on_call() {
        let mut app = TestHost::new(IncidentTracker::init);

        assert!(app.view(|s| s.get_on_call()).unwrap().is_none());

        app.call(|s| s.set_on_call("alice".into())).unwrap();
        let oc = app.view(|s| s.get_on_call()).unwrap().unwrap();
        assert_eq!(oc.responder, "alice");

        // Replace with a different person.
        app.call(|s| s.set_on_call("bob".into())).unwrap();
        let oc2 = app.view(|s| s.get_on_call()).unwrap().unwrap();
        assert_eq!(oc2.responder, "bob");
    }

    #[test]
    fn set_on_call_emits_event() {
        let mut app = TestHost::new(IncidentTracker::init);
        app.call(|s| s.set_on_call("alice".into())).unwrap();
        assert_eq!(app.events().len(), 1);
    }
}
