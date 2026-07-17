//! Incident-tracker service — a shared space for reporting incidents,
//! coordinating response, and publishing postmortems.
//!
//! - `Incident` is `shared`: any teammate may report one and any teammate may
//!   update its status/assignee, so it lives in a plain `UnorderedMap` whose
//!   value is `#[derive(Mergeable)]` (every field is an `LwwRegister`, so the
//!   derive covers merge + re-keying for us).
//! - `Comment` is append-only from the API surface (`add_comment` /
//!   `list_comments`; no edit/delete method is exposed), so it lives in a
//!   plain `UnorderedMap` too — the `author` field records who posted it.
//! - `Postmortem` is `authored`: only the commander who wrote it may publish
//!   it. The record itself lives in an `UnorderedMap` (so `list_postmortems`
//!   can iterate it — `AuthoredMap` has no `entries()`), paired with a small
//!   `postmortem_authors: AuthoredMap<String, LwwRegister<u64>>` ownership
//!   stamp that gates `publish_postmortem` to the original author, mirroring
//!   the foundation scaffold's `items` + `owners` pattern.

use calimero_sdk::app;
use calimero_sdk::app::Mergeable;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::{AuthoredMap, LwwRegister, UnorderedMap};
use calimero_storage::env as storage_env;
use incidentflow_types::{generate_id, validate_label, Error};

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// Internal, Borsh-only, CRDT-backed incident record. Every field is an
/// `LwwRegister` so `#[derive(Mergeable)]` can cover merge + re-keying.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Mergeable)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct IncidentRecord {
    pub title: LwwRegister<String>,
    pub description: LwwRegister<String>,
    pub severity: LwwRegister<String>,
    pub affected_area: LwwRegister<String>,
    pub status: LwwRegister<String>,
    pub assigned_to: LwwRegister<Option<String>>,
    pub created_by: LwwRegister<String>,
    pub created_at: LwwRegister<u64>,
    pub updated_at: LwwRegister<u64>,
}

/// Read-shaped incident returned to callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct Incident {
    pub id: String,
    pub title: String,
    pub description: String,
    pub severity: String,
    pub affected_area: String,
    pub status: String,
    pub assigned_to: Option<String>,
    pub created_by: String,
    pub created_at: u64,
    pub updated_at: u64,
}

/// Internal, Borsh-only, CRDT-backed comment record.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Mergeable)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct CommentRecord {
    pub incident_id: LwwRegister<String>,
    pub author: LwwRegister<String>,
    pub body: LwwRegister<String>,
    pub mentions: LwwRegister<Vec<String>>,
    pub created_at: LwwRegister<u64>,
}

/// Read-shaped comment returned to callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct Comment {
    pub id: String,
    pub incident_id: String,
    pub author: String,
    pub body: String,
    pub mentions: Vec<String>,
    pub created_at: u64,
}

/// Internal, Borsh-only, CRDT-backed postmortem record.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Mergeable)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct PostmortemRecord {
    pub incident_id: LwwRegister<String>,
    pub author: LwwRegister<String>,
    pub summary: LwwRegister<String>,
    pub root_cause: LwwRegister<String>,
    pub resolution_steps: LwwRegister<String>,
    pub lessons_learned: LwwRegister<String>,
    pub status: LwwRegister<String>,
    pub created_at: LwwRegister<u64>,
}

/// Read-shaped postmortem returned to callers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct Postmortem {
    pub id: String,
    pub incident_id: String,
    pub author: String,
    pub summary: String,
    pub root_cause: String,
    pub resolution_steps: String,
    pub lessons_learned: String,
    pub status: String,
    pub created_at: u64,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
pub struct IncidentTracker {
    /// Shared: anyone may report an incident and anyone may update its
    /// status/assignee.
    incidents: UnorderedMap<String, IncidentRecord>,
    /// Append-only from the API surface (no edit/delete method is exposed).
    comments: UnorderedMap<String, CommentRecord>,
    /// Postmortem content, readable by everyone.
    postmortems: UnorderedMap<String, PostmortemRecord>,
    /// Ownership stamp: `postmortem_id -> author-claim`. Gates
    /// `publish_postmortem` to the original author, structurally.
    postmortem_authors: AuthoredMap<String, LwwRegister<u64>>,
}

#[app::logic]
impl IncidentTracker {
    #[app::init]
    pub fn init() -> IncidentTracker {
        IncidentTracker {
            incidents: UnorderedMap::new(),
            comments: UnorderedMap::new(),
            postmortems: UnorderedMap::new(),
            postmortem_authors: AuthoredMap::new(),
        }
    }

    /// Report a new incident. Returns its generated id.
    pub fn create_incident(
        &mut self,
        title: String,
        description: String,
        severity: String,
        affected_area: String,
    ) -> app::Result<String> {
        validate_label(&title).map_err(AppError::from)?;
        validate_label(&severity).map_err(AppError::from)?;
        validate_label(&affected_area).map_err(AppError::from)?;

        let (id, now) = self.new_id("inc");
        let created_by = self.caller_b58();

        let record = IncidentRecord {
            title: LwwRegister::new(title),
            description: LwwRegister::new(description),
            severity: LwwRegister::new(severity),
            affected_area: LwwRegister::new(affected_area),
            status: LwwRegister::new("Open".to_string()),
            assigned_to: LwwRegister::new(None),
            created_by: LwwRegister::new(created_by.clone()),
            created_at: LwwRegister::new(now),
            updated_at: LwwRegister::new(now),
        };
        self.incidents
            .insert(id.clone(), record)
            .map_err(|e| AppError::msg(format!("incidents.insert: {e}")))?;

        app::emit!(Event::IncidentCreated {
            id: &id,
            created_by: &created_by,
        });
        Ok(id)
    }

    /// Update an incident's status. Every status change also bumps
    /// `updated_at` so the dashboard's "most recently updated" ordering
    /// reflects it, and the frontend builds the timeline off the emitted
    /// event stream.
    pub fn update_status(&mut self, incident_id: String, status: String) -> app::Result<()> {
        validate_label(&status).map_err(AppError::from)?;
        let now = storage_env::time_now() / 1_000_000;

        let mut guard = self
            .incidents
            .get_mut(&incident_id)
            .map_err(|e| AppError::msg(format!("incidents.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(incident_id.clone())))?;
        guard.status.set(status.clone());
        guard.updated_at.set(now);
        drop(guard);

        app::emit!(Event::IncidentStatusUpdated {
            id: &incident_id,
            status: &status,
        });
        Ok(())
    }

    /// Assign an incident to a teammate.
    pub fn assign_incident(&mut self, incident_id: String, assignee: String) -> app::Result<()> {
        validate_label(&assignee).map_err(AppError::from)?;
        let now = storage_env::time_now() / 1_000_000;

        let mut guard = self
            .incidents
            .get_mut(&incident_id)
            .map_err(|e| AppError::msg(format!("incidents.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(incident_id.clone())))?;
        guard.assigned_to.set(Some(assignee.clone()));
        guard.updated_at.set(now);
        drop(guard);

        app::emit!(Event::IncidentAssigned {
            id: &incident_id,
            assignee: &assignee,
        });
        Ok(())
    }

    /// All incidents, most-recently-updated first (dashboard ordering). The
    /// caller filters for "open" client-side.
    pub fn list_incidents(&self) -> app::Result<Vec<Incident>> {
        let mut out: Vec<Incident> = self
            .incidents
            .entries()
            .map_err(|e| AppError::msg(format!("incidents.entries: {e}")))?
            .map(|(id, record)| self.to_incident_view(id, &record))
            .collect();
        out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at).then_with(|| a.id.cmp(&b.id)));
        Ok(out)
    }

    /// Post a comment on an incident. Returns its generated id.
    pub fn add_comment(
        &mut self,
        incident_id: String,
        body: String,
        mentions: Vec<String>,
    ) -> app::Result<String> {
        validate_label(&body).map_err(AppError::from)?;
        let exists = self
            .incidents
            .contains(&incident_id)
            .map_err(|e| AppError::msg(format!("incidents.contains: {e}")))?;
        if !exists {
            app::bail!(Error::NotFound(incident_id));
        }

        let (id, now) = self.new_id("cmt");
        let author = self.caller_b58();

        let record = CommentRecord {
            incident_id: LwwRegister::new(incident_id.clone()),
            author: LwwRegister::new(author.clone()),
            body: LwwRegister::new(body),
            mentions: LwwRegister::new(mentions),
            created_at: LwwRegister::new(now),
        };
        self.comments
            .insert(id.clone(), record)
            .map_err(|e| AppError::msg(format!("comments.insert: {e}")))?;

        app::emit!(Event::CommentAdded {
            id: &id,
            incident_id: &incident_id,
            author: &author,
        });
        Ok(id)
    }

    /// Comments on one incident, oldest first (a discussion thread).
    pub fn list_comments(&self, incident_id: String) -> app::Result<Vec<Comment>> {
        let mut out: Vec<Comment> = self
            .comments
            .entries()
            .map_err(|e| AppError::msg(format!("comments.entries: {e}")))?
            .filter(|(_, record)| *record.incident_id.get() == incident_id)
            .map(|(id, record)| self.to_comment_view(id, &record))
            .collect();
        out.sort_by(|a, b| a.created_at.cmp(&b.created_at).then_with(|| a.id.cmp(&b.id)));
        Ok(out)
    }

    /// Write up a postmortem draft for a (typically resolved) incident.
    /// Returns its generated id. The caller becomes its author; only they may
    /// later publish it.
    pub fn create_postmortem(
        &mut self,
        incident_id: String,
        summary: String,
        root_cause: String,
        resolution_steps: String,
        lessons_learned: String,
    ) -> app::Result<String> {
        validate_label(&summary).map_err(AppError::from)?;
        let exists = self
            .incidents
            .contains(&incident_id)
            .map_err(|e| AppError::msg(format!("incidents.contains: {e}")))?;
        if !exists {
            app::bail!(Error::NotFound(incident_id));
        }

        let (id, now) = self.new_id("pm");
        let author = self.caller_b58();

        let record = PostmortemRecord {
            incident_id: LwwRegister::new(incident_id.clone()),
            author: LwwRegister::new(author),
            summary: LwwRegister::new(summary),
            root_cause: LwwRegister::new(root_cause),
            resolution_steps: LwwRegister::new(resolution_steps),
            lessons_learned: LwwRegister::new(lessons_learned),
            status: LwwRegister::new("draft".to_string()),
            created_at: LwwRegister::new(now),
        };
        self.postmortems
            .insert(id.clone(), record)
            .map_err(|e| AppError::msg(format!("postmortems.insert: {e}")))?;
        // Ownership stamp — the adding executor becomes the only one who may
        // later publish this postmortem.
        self.postmortem_authors
            .insert(id.clone(), LwwRegister::new(now))
            .map_err(|e| AppError::msg(format!("postmortem_authors.insert: {e}")))?;

        app::emit!(Event::PostmortemCreated {
            id: &id,
            incident_id: &incident_id,
        });
        Ok(id)
    }

    /// Publish a postmortem draft. Owner-gated: only the author may publish.
    /// Once published, its content is locked — no edit method is exposed.
    pub fn publish_postmortem(&mut self, postmortem_id: String) -> app::Result<()> {
        let now = storage_env::time_now() / 1_000_000;
        // `AuthoredMap::update` is our owner-gate: it fails with
        // `ActionNotAllowed` for anyone but the author, and `NotFound` if the
        // postmortem doesn't exist.
        self.postmortem_authors
            .update(&postmortem_id, LwwRegister::new(now))
            .map_err(map_postmortem_owner_error(postmortem_id.clone()))?;

        let mut guard = self
            .postmortems
            .get_mut(&postmortem_id)
            .map_err(|e| AppError::msg(format!("postmortems.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(postmortem_id.clone())))?;
        guard.status.set("published".to_string());
        drop(guard);

        app::emit!(Event::PostmortemPublished { id: &postmortem_id });
        Ok(())
    }

    /// All postmortems (draft + published), most recent first.
    pub fn list_postmortems(&self) -> app::Result<Vec<Postmortem>> {
        let mut out: Vec<Postmortem> = self
            .postmortems
            .entries()
            .map_err(|e| AppError::msg(format!("postmortems.entries: {e}")))?
            .map(|(id, record)| self.to_postmortem_view(id, &record))
            .collect();
        out.sort_by(|a, b| b.created_at.cmp(&a.created_at).then_with(|| a.id.cmp(&b.id)));
        Ok(out)
    }
}

impl IncidentTracker {
    /// Base58 of the current executor — the public, shareable identity.
    fn caller_b58(&self) -> String {
        bs58::encode(env::executor_id()).into_string()
    }

    fn new_id(&self, prefix: &str) -> (String, u64) {
        let now = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        (generate_id(prefix, now, &nonce), now)
    }

    fn to_incident_view(&self, id: String, record: &IncidentRecord) -> Incident {
        Incident {
            id,
            title: record.title.get().clone(),
            description: record.description.get().clone(),
            severity: record.severity.get().clone(),
            affected_area: record.affected_area.get().clone(),
            status: record.status.get().clone(),
            assigned_to: record.assigned_to.get().clone(),
            created_by: record.created_by.get().clone(),
            created_at: *record.created_at.get(),
            updated_at: *record.updated_at.get(),
        }
    }

    fn to_comment_view(&self, id: String, record: &CommentRecord) -> Comment {
        Comment {
            id,
            incident_id: record.incident_id.get().clone(),
            author: record.author.get().clone(),
            body: record.body.get().clone(),
            mentions: record.mentions.get().clone(),
            created_at: *record.created_at.get(),
        }
    }

    fn to_postmortem_view(&self, id: String, record: &PostmortemRecord) -> Postmortem {
        Postmortem {
            id,
            incident_id: record.incident_id.get().clone(),
            author: record.author.get().clone(),
            summary: record.summary.get().clone(),
            root_cause: record.root_cause.get().clone(),
            resolution_steps: record.resolution_steps.get().clone(),
            lessons_learned: record.lessons_learned.get().clone(),
            status: record.status.get().clone(),
            created_at: *record.created_at.get(),
        }
    }
}

/// Translate a `postmortem_authors` access-control error into a friendly
/// `Forbidden`/`NotFound`.
fn map_postmortem_owner_error(
    id: String,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(Error::Forbidden(
                "only the postmortem's author may publish it".into(),
            ))
        } else if s.contains("NotFound") {
            AppError::from(Error::NotFound(id))
        } else {
            AppError::msg(format!("postmortem_authors.update: {s}"))
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

    fn make_incident(app: &mut TestHost<IncidentTracker>) -> String {
        app.call(|s| {
            s.create_incident(
                "Checkout down".into(),
                "500s on checkout API".into(),
                "Critical".into(),
                "Payments".into(),
            )
        })
        .unwrap()
    }

    #[test]
    fn create_incident_and_list() {
        let mut app = TestHost::new(IncidentTracker::init);

        let id = make_incident(&mut app);
        let incidents = app.view(|s| s.list_incidents()).unwrap();
        assert_eq!(incidents.len(), 1);
        assert_eq!(incidents[0].id, id);
        assert_eq!(incidents[0].title, "Checkout down");
        assert_eq!(incidents[0].status, "Open");
        assert_eq!(incidents[0].assigned_to, None);
        // `create_incident` emits exactly one event.
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn update_status_changes_status_and_ordering() {
        let mut app = TestHost::new(IncidentTracker::init);

        let id = make_incident(&mut app);
        app.call(|s| s.update_status(id.clone(), "Mitigating".into()))
            .unwrap();

        let incidents = app.view(|s| s.list_incidents()).unwrap();
        assert_eq!(incidents[0].status, "Mitigating");
    }

    #[test]
    fn update_status_unknown_id_errors() {
        let mut app = TestHost::new(IncidentTracker::init);
        assert!(app
            .call(|s| s.update_status("nope".into(), "Open".into()))
            .is_err());
    }

    #[test]
    fn assign_incident_sets_assignee() {
        let mut app = TestHost::new(IncidentTracker::init);

        let id = make_incident(&mut app);
        app.call(|s| s.assign_incident(id.clone(), "alice".into()))
            .unwrap();

        let incidents = app.view(|s| s.list_incidents()).unwrap();
        assert_eq!(incidents[0].assigned_to, Some("alice".to_string()));
    }

    #[test]
    fn add_comment_and_list_comments() {
        let mut app = TestHost::new(IncidentTracker::init);

        let id = make_incident(&mut app);
        let comment_id = app
            .call(|s| s.add_comment(id.clone(), "Rolling back deploy".into(), vec!["bob".into()]))
            .unwrap();

        let comments = app.view(|s| s.list_comments(id)).unwrap();
        assert_eq!(comments.len(), 1);
        assert_eq!(comments[0].id, comment_id);
        assert_eq!(comments[0].body, "Rolling back deploy");
        assert_eq!(comments[0].mentions, vec!["bob".to_string()]);
    }

    #[test]
    fn add_comment_unknown_incident_errors() {
        let mut app = TestHost::new(IncidentTracker::init);
        assert!(app
            .call(|s| s.add_comment("nope".into(), "hi".into(), vec![]))
            .is_err());
    }

    #[test]
    fn create_and_list_postmortem() {
        let mut app = TestHost::new(IncidentTracker::init);

        let incident_id = make_incident(&mut app);
        let pm_id = app
            .call(|s| {
                s.create_postmortem(
                    incident_id.clone(),
                    "Checkout outage 45min".into(),
                    "Bad deploy".into(),
                    "Rolled back".into(),
                    "Add canary tests".into(),
                )
            })
            .unwrap();

        let postmortems = app.view(|s| s.list_postmortems()).unwrap();
        assert_eq!(postmortems.len(), 1);
        assert_eq!(postmortems[0].id, pm_id);
        assert_eq!(postmortems[0].incident_id, incident_id);
        assert_eq!(postmortems[0].status, "draft");
    }

    #[test]
    fn author_can_publish_postmortem() {
        let mut app = TestHost::new(IncidentTracker::init);

        let incident_id = make_incident(&mut app);
        let pm_id = app
            .call(|s| {
                s.create_postmortem(
                    incident_id,
                    "summary".into(),
                    "cause".into(),
                    "steps".into(),
                    "lessons".into(),
                )
            })
            .unwrap();

        app.call(|s| s.publish_postmortem(pm_id.clone())).unwrap();
        let postmortems = app.view(|s| s.list_postmortems()).unwrap();
        assert_eq!(postmortems[0].status, "published");
    }

    #[test]
    fn non_author_cannot_publish_postmortem() {
        let mut app = TestHost::new(IncidentTracker::init);

        // Default identity creates the incident and the postmortem, so it
        // owns the postmortem.
        let incident_id = make_incident(&mut app);
        let pm_id = app
            .call(|s| {
                s.create_postmortem(
                    incident_id,
                    "summary".into(),
                    "cause".into(),
                    "steps".into(),
                    "lessons".into(),
                )
            })
            .unwrap();

        // A different executor is not the author — the ownership stamp
        // rejects the publish, surfaced as Forbidden.
        let other = [9u8; 32];
        assert!(app
            .call_as(other, |s| s.publish_postmortem(pm_id.clone()))
            .is_err());
        let postmortems = app.view(|s| s.list_postmortems()).unwrap();
        assert_eq!(postmortems[0].status, "draft");
    }

    #[test]
    fn publish_unknown_postmortem_errors() {
        let mut app = TestHost::new(IncidentTracker::init);
        assert!(app.call(|s| s.publish_postmortem("nope".into())).is_err());
    }
}
