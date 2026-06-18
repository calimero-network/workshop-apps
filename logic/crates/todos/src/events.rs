#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new task was added to the list.
    TaskAdded { id: &'a str },
    /// A task's done/open status was toggled.
    TaskToggled { id: &'a str },
    /// A task's description was edited.
    TaskEdited { id: &'a str },
    /// A task was removed from the list.
    TaskDeleted { id: &'a str },
}
