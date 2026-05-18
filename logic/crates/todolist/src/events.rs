#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new task was added to the shared list.
    TaskCreated { id: &'a str },
    /// A task's completed flag was toggled.
    TaskToggled { id: &'a str, completed: bool },
    /// A task's assignee was set or cleared.
    TaskAssigned { id: &'a str },
    /// A task was removed from the list.
    TaskDeleted { id: &'a str },
}
