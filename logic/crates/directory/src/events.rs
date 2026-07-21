//! Events emitted by the directory (lobby) service.

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A room was created and registered in the lobby.
    RoomCreated { room_id: &'a str, owner: &'a str },
    /// A room's context id was linked back after its context was created.
    RoomLinked { room_id: &'a str },
    /// A room reported it finished (via xcall from the room context).
    RoomFinished { room_id: &'a str },
    /// A win was recorded on the group leaderboard for this player.
    WinRecorded { winner: &'a str },
}
