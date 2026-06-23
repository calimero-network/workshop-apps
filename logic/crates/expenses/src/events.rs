#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new expense was submitted.
    ExpenseSubmitted { id: &'a str },
    /// An expense was edited by its author.
    ExpenseEdited { id: &'a str },
    /// An expense was approved by ops.
    ExpenseApproved { id: &'a str },
    /// An expense was rejected by ops.
    ExpenseRejected { id: &'a str },
    /// An expense was marked as reimbursed by ops.
    ExpenseReimbursed { id: &'a str },
    /// A new expense category was added.
    CategoryAdded { id: &'a str },
}
