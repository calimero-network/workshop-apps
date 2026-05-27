#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new memory was posted to the timeline.
    MemoryPosted { id: &'a str },
    /// A memory's body was edited.
    MemoryEdited { id: &'a str },
    /// A memory was deleted.
    MemoryDeleted { id: &'a str },
    /// A reaction was added to a memory.
    ReactionAdded { id: &'a str, memory_id: &'a str },
    /// A reaction was removed from a memory.
    ReactionRemoved { id: &'a str },
    /// A comment was posted on a memory.
    CommentPosted { id: &'a str, memory_id: &'a str },
}
