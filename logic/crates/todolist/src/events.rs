#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new task was created.
    TaskCreated { id: &'a str },
    /// A task was marked complete.
    TaskCompleted { id: &'a str },
    /// A task was marked incomplete.
    TaskIncompleted { id: &'a str },
    /// A task's title was edited.
    TaskEdited { id: &'a str },
    /// A task was deleted.
    TaskDeleted { id: &'a str },
    /// A task was assigned to a member.
    TaskAssigned { id: &'a str, assignee: &'a str },
}
