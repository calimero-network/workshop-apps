//! Events emitted by the team CRM service. Borrowed `&'a str` fields keep
//! emission allocation-free (the SDK serialises them before the borrow ends).

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new contact was added to the shared address book.
    ContactAdded { id: &'a str, name: &'a str },
    /// A new deal was created against a contact.
    DealCreated {
        id: &'a str,
        contact_id: &'a str,
        title: &'a str,
    },
    /// A deal moved to a new pipeline stage.
    DealStageUpdated { id: &'a str, stage: &'a str },
    /// Contract/payment details were attached to a (typically won) deal.
    ContractDetailsSet { id: &'a str },
    /// A call/email/meeting note was logged against a contact.
    InteractionLogged {
        id: &'a str,
        contact_id: &'a str,
        author: &'a str,
    },
    /// An interaction's note was edited by its author.
    InteractionEdited { id: &'a str },
    /// An interaction was deleted by its author.
    InteractionDeleted { id: &'a str },
}
