//! Events emitted by the `group` service. Borrowed `&'a str` fields keep
//! emission allocation-free (the SDK serialises them before the borrow ends).

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new expense was added to the group.
    ExpenseAdded {
        id: &'a str,
        paid_by: &'a str,
        amount: i64,
    },
    /// An expense's description/amount was edited by its author.
    ExpenseEdited { id: &'a str },
    /// An expense was deleted by its author.
    ExpenseDeleted { id: &'a str },
    /// A settlement (payment) was recorded between two members.
    SettlementRecorded {
        id: &'a str,
        from: &'a str,
        to: &'a str,
        amount: i64,
    },
    /// The group was renamed by its creator.
    GroupRenamed { name: &'a str },
}
