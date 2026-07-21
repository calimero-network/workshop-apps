//! Events emitted by the room (per-match) service.

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A player took a seat (the gate counts these).
    MemberJoined { member: &'a str, count: u32 },
    /// The match reached its 4-seat threshold and started.
    RoomStarted { count: u32 },
    /// The seated player whose turn it is rolled the dice.
    DiceRolled { seat: u32, value: u32 },
    /// A token moved to a new position (steps along its private path).
    TokenMoved { seat: u32, token_index: u32, steps: u32 },
    /// An opponent's token was captured on a non-safe square and sent home.
    TokenCaptured { seat: u32, token_index: u32 },
    /// The seated player rolled a six and gets another roll (turn unchanged).
    ExtraTurn { seat: u32 },
    /// Turn passed to the next seat.
    TurnAdvanced { seat: u32 },
    /// The match finished; state is locked and the winner is recorded.
    MatchFinished { winner: &'a str },
}
