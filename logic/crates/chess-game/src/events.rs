//! Events emitted by the chess-game service. Borrowed `&'a str` fields keep
//! emission allocation-free (the SDK serialises them before the borrow ends).

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new game was created; the creator is white, the invited opponent is black.
    GameCreated {
        id: &'a str,
        white_player: &'a str,
        black_player: &'a str,
    },
    /// A move was submitted and is now permanent.
    MoveSubmitted { id: &'a str, player: &'a str, san: &'a str },
    /// The game ended (checkmate, stalemate, resignation, or draw).
    GameEnded { status: &'a str, result: &'a str },
}
