#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new task was added to the list.
    TaskAdded { id: &'a str },
    /// A task's description was edited.
    TaskEdited { id: &'a str },
    /// A task's done state was toggled.
    TaskToggled { id: &'a str },
    /// A task was deleted from the list.
    TaskDeleted { id: &'a str },
}
