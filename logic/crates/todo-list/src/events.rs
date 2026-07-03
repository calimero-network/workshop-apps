//! Events emitted by the todo-list service. Borrowed `&'a str` fields keep
//! emission allocation-free (the SDK serialises them before the borrow ends).

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new task was added to the list.
    TaskAdded { id: &'a str },
    /// A task's title was edited by its author.
    TaskEdited { id: &'a str },
    /// A task's done/open state was toggled by its author.
    TaskToggled { id: &'a str },
    /// A task was removed by its author.
    TaskRemoved { id: &'a str },
}
