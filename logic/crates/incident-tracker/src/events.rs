//! Events emitted by the incident-tracker service. Borrowed `&'a str` fields
//! keep emission allocation-free (the SDK serialises them before the borrow
//! ends). Frontend views subscribe to these to build the incident timeline
//! and refresh the dashboard/comment thread within the 5s acceptance window.

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new incident was reported.
    IncidentCreated { id: &'a str, created_by: &'a str },
    /// An incident's status changed (timeline entry).
    IncidentStatusUpdated { id: &'a str, status: &'a str },
    /// An incident was assigned to a teammate (timeline entry).
    IncidentAssigned { id: &'a str, assignee: &'a str },
    /// A comment was posted on an incident.
    CommentAdded { id: &'a str, incident_id: &'a str, author: &'a str },
    /// A postmortem draft was created for an incident.
    PostmortemCreated { id: &'a str, incident_id: &'a str },
    /// A postmortem was published and locked from further edits.
    PostmortemPublished { id: &'a str },
}
