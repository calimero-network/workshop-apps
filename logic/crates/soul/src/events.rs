#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new memory item was added.
    MemoryAdded { id: &'a str },
    /// An existing memory item was updated.
    MemoryUpdated { id: &'a str },
    /// A memory item was deleted.
    MemoryDeleted { id: &'a str },
}
