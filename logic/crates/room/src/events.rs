#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new message was posted.
    MessageSent {
        id: &'a str,
        sender: &'a str,
        timestamp_ms: u64,
    },
    /// A message was edited.
    MessageEdited { id: &'a str },
    /// A message was deleted.
    MessageDeleted { id: &'a str },
    /// Room metadata was updated.
    RoomUpdated {},
    /// Moderator set was rotated (added or removed a writer).
    ModeratorsRotated {},
}
