#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// The trip was named and configured.
    TripCreated { id: &'a str, name: &'a str },
    /// A new shared expense was logged.
    ExpenseAdded { id: &'a str, payer: &'a str },
    /// An expense was edited by its author.
    ExpenseEdited { id: &'a str },
    /// An expense was deleted by its author.
    ExpenseDeleted { id: &'a str },
    /// A settlement payment was recorded.
    PaymentRecorded { id: &'a str, from: &'a str, to: &'a str },
}
