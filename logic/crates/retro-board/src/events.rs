//! Events emitted by the retro-board service. Borrowed `&'a str` fields keep
//! emission allocation-free (the SDK serialises them before the borrow ends).

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new card was added to a column.
    CardAdded { id: &'a str, column: &'a str },
    /// A card was upvoted by a member.
    CardVoted { card_id: &'a str, voter: &'a str },
    /// A card's done state was toggled.
    CardToggled { id: &'a str, done: bool },
    /// A card was deleted.
    CardDeleted { id: &'a str },
}
