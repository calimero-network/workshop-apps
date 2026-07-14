//! Events emitted by the issue-tracker service. Borrowed `&'a str` fields keep
//! emission allocation-free (the SDK serialises them before the borrow ends).

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new category was created.
    CategoryCreated { id: &'a str, name: &'a str },
    /// A new task was created and assigned.
    TaskCreated {
        id: &'a str,
        title: &'a str,
        assignee: &'a str,
    },
    /// A task's assignee changed.
    TaskAssigned { id: &'a str, assignee: &'a str },
    /// A task's priority changed.
    TaskPriorityChanged { id: &'a str, priority: &'a str },
    /// A task was moved into a different category.
    TaskMoved { id: &'a str, category_id: &'a str },
    /// A task was marked complete.
    TaskCompleted { id: &'a str },
    /// A task was archived (hidden from the active board).
    TaskArchived { id: &'a str },
    /// A comment (optionally with a PR link) was added to a task.
    CommentAdded { id: &'a str, task_id: &'a str },
    /// A comment was edited by its author.
    CommentEdited { id: &'a str },
    /// A comment was deleted by its author.
    CommentDeleted { id: &'a str },
}
