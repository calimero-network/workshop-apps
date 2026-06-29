//! Events emitted by the kudos-board service.

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new kudos was posted.
    KudosPosted { id: &'a str },
    /// A kudos was deleted by its author.
    KudosDeleted { id: &'a str },
}
