#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new task was created.
    TaskCreated { id: &'a str, title: &'a str },
    /// A task was marked as completed.
    TaskCompleted { id: &'a str },
    /// A task's title or description was edited.
    TaskEdited { id: &'a str, title: &'a str },
    /// A task was deleted.
    TaskDeleted { id: &'a str },
    /// A task was assigned to a member.
    TaskAssigned { id: &'a str, assignee: &'a str },
}
