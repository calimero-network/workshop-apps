//! Events emitted by the shared snake-arcade room. Borrowed `&'a str` fields
//! keep emission allocation-free (the SDK serialises them before the borrow
//! ends).

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A member's status/live score/live length changed.
    MemberStatusUpdated { player: &'a str },
    /// A new timed duel started.
    DuelStarted { id: &'a str, initiator: &'a str },
    /// A participant submitted their result for a duel.
    DuelResultSubmitted { id: &'a str, duel_id: &'a str, author: &'a str },
    /// A duel's timer elapsed and it was marked finished.
    DuelFinished { id: &'a str },
}
