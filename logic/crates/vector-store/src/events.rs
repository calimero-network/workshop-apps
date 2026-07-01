//! Events emitted by the vector-store service. Borrowed `&'a str` fields keep
//! emission allocation-free (the SDK serialises them before the borrow ends).

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new knowledge entry was added to the store.
    EntryAdded { id: &'a str, author: &'a str },
    /// An entry was removed from the store.
    EntryRemoved { id: &'a str },
    /// An entry's tags were updated.
    EntryTagsUpdated { id: &'a str },
    /// A named collection was created.
    CollectionCreated { id: &'a str, name: &'a str },
    /// A named collection was deleted.
    CollectionDeleted { id: &'a str },
    /// A similarity search was performed (emitted by mutate wrapper if needed).
    SearchPerformed { result_count: u32 },
}
