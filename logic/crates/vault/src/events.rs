//! Events emitted by the household vault service. Borrowed `&'a str` fields
//! keep emission allocation-free (the SDK serialises them before the borrow
//! ends).

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new login entry was added to the vault.
    EntryAdded { id: &'a str, author: &'a str },
    /// An entry was edited by its author.
    EntryUpdated { id: &'a str },
    /// An entry was deleted by its author.
    EntryDeleted { id: &'a str },
}
