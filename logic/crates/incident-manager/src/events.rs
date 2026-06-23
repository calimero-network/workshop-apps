#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new incident was reported.
    IncidentReported { id: &'a str, severity: &'a str },
    /// An incident was acknowledged (commander assigned).
    IncidentAcknowledged { id: &'a str },
    /// An incident was escalated to a new responder.
    IncidentEscalated { id: &'a str, entry_id: &'a str },
    /// An incident was resolved with a root cause.
    IncidentResolved { id: &'a str },
    /// A timeline entry was posted on an incident.
    TimelineEntryPosted { id: &'a str, incident_id: &'a str },
    /// A postmortem was created for a resolved incident.
    PostmortemCreated { id: &'a str, incident_id: &'a str },
    /// A postmortem was updated.
    PostmortemUpdated { id: &'a str },
    /// An on-call schedule slot was added or updated.
    OnCallSlotSet { id: &'a str },
    /// An on-call schedule slot was removed.
    OnCallSlotRemoved { id: &'a str },
}
