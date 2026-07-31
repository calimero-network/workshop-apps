//! Events emitted by the group expense-tracking service. Borrowed `&'a str`
//! fields keep emission allocation-free (the SDK serialises them before the
//! borrow ends).

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A member joined the group (their first `set_display_name` call).
    MemberJoined { id: &'a str, display_name: &'a str },
    /// An expense was added.
    ExpenseAdded { id: &'a str, amount: u64, paid_by: &'a str },
    /// An expense's description/amount was edited.
    ExpenseEdited { id: &'a str },
    /// An expense was deleted.
    ExpenseDeleted { id: &'a str },
    /// A settlement (repayment) between two members was recorded.
    SettlementRecorded { id: &'a str, from: &'a str, to: &'a str, amount: u64 },
    /// The group was renamed by its creator.
    GroupRenamed { new_name: &'a str },
}
