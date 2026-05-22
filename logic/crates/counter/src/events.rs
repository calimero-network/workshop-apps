#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// The counter was incremented by a participant.
    CounterIncremented { by: &'a str, total: u64 },
    /// The counter was reset to zero by the creator.
    CounterReset { by: &'a str },
}
