//! Events emitted by the room (per-session) service.

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A member joined the room (the gate counts these).
    MemberJoined { member: &'a str, count: u32 },
    /// The room reached its member threshold and started.
    RoomStarted { count: u32 },
    /// A domain item was recorded (reskin per spec).
    ItemAdded { id: &'a str, owner: &'a str },
    /// A domain item's value changed (reskin per spec).
    ItemUpdated { id: &'a str },
    /// A domain item was deleted (reskin per spec).
    ItemDeleted { id: &'a str },
    /// The room finished; state is locked.
    RoomFinished { winner: &'a str },
}
