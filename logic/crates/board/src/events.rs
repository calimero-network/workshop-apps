#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// The board was initialized with a name.
    BoardInitialized { id: &'a str, name: &'a str },
    /// A new task was created.
    TaskCreated { id: &'a str, title: &'a str },
    /// A task's status column changed.
    TaskStatusUpdated { id: &'a str, status: &'a str },
    /// A task was assigned to a member.
    TaskAssigned { id: &'a str, assignee: &'a str },
    /// A comment was posted on a task.
    CommentAdded { id: &'a str, task_id: &'a str },
    /// A comment body was updated.
    CommentEdited { id: &'a str },
    /// A comment was deleted.
    CommentDeleted { id: &'a str },
}
