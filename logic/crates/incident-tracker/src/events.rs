//! Events emitted by the incident-tracker service.

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new incident was declared.
    IncidentCreated { id: &'a str },
    /// An incident was acknowledged by a responder.
    IncidentAcknowledged { id: &'a str },
    /// An incident was resolved.
    IncidentResolved { id: &'a str },
    /// An incident's severity or assignee was updated.
    IncidentUpdated { id: &'a str },
    /// A comment was posted on an incident thread.
    CommentAdded { id: &'a str, incident_id: &'a str },
    /// A comment was edited by its author.
    CommentEdited { id: &'a str },
    /// A comment was deleted by its author.
    CommentDeleted { id: &'a str },
    /// A postmortem was published for a resolved incident.
    PostmortemCreated { id: &'a str, incident_id: &'a str },
    /// A postmortem was edited by its author.
    PostmortemEdited { id: &'a str },
    /// The on-call person was updated.
    OnCallUpdated { responder: &'a str },
}
