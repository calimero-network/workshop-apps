#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// Pipeline stages were updated by the team lead.
    StagesUpdated {},
    /// A new lead was added to the pipeline.
    LeadAdded { id: &'a str },
    /// A lead was moved to a different stage.
    LeadMoved { id: &'a str, stage: &'a str },
    /// A lead was closed (Won or Lost).
    LeadClosed { id: &'a str, outcome: &'a str },
}
