#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new memory note was added.
    MemoryAdded { id: &'a str },
    /// A memory note was updated.
    MemoryUpdated { id: &'a str },
    /// A memory note was deleted.
    MemoryDeleted { id: &'a str },
}
