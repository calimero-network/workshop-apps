//! Events emitted by the async standup board service.
//! Borrowed `&'a str` fields keep emission allocation-free.

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new standup was posted.
    StandupPosted { id: &'a str, author: &'a str },
    /// A standup's mutable fields were updated by the author.
    StandupEdited { id: &'a str },
    /// A standup was deleted by its author.
    StandupDeleted { id: &'a str },
    /// A comment was added to a standup.
    CommentAdded { id: &'a str, standup_id: &'a str },
}
