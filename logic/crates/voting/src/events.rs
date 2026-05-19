#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new vote was created.
    VoteCreated { id: &'a str },
    /// A voter submitted their ranking.
    RankingSubmitted { id: &'a str, vote_id: &'a str },
    /// A voter updated their existing ranking.
    RankingUpdated { id: &'a str },
    /// The organizer closed the vote.
    VoteClosed { id: &'a str },
}
