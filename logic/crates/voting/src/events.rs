#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// The poll was created by the organizer.
    PollCreated { id: &'a str },
    /// A new option was added to the poll.
    OptionAdded { id: &'a str },
    /// An option was removed from the poll.
    OptionRemoved { id: &'a str },
    /// A voter submitted (or resubmitted) their ranking.
    RankingSubmitted { id: &'a str },
    /// The poll was closed by the organizer; no further rankings accepted.
    PollClosed {},
}
