//! Events emitted by the standup board service.
//! Borrowed `&'a str` fields keep emission allocation-free.

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new standup entry was posted.
    StandupPosted { id: &'a str, author: &'a str, date: &'a str },
    /// An existing standup entry was edited.
    StandupEdited { id: &'a str, author: &'a str, date: &'a str },
    /// A standup entry was deleted.
    StandupDeleted { id: &'a str, author: &'a str, date: &'a str },
}
