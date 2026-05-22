#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new room was created in the lobby.
    RoomCreated { id: &'a str, name: &'a str },
    /// A room was deleted from the lobby.
    RoomDeleted { id: &'a str },
    /// The room list changed (created, deleted, or updated).
    RoomListUpdated {},
    /// A member set or changed their display name.
    NameChanged { id: &'a str },
}
