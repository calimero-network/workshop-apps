#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new project was created on this whiteboard context.
    ProjectCreated { id: &'a str, name: &'a str },
    /// A shape was added to the canvas.
    ShapeAdded { id: &'a str },
    /// A shape was updated (position, size, or color changed).
    ShapeUpdated { id: &'a str },
    /// A shape was deleted from the canvas.
    ShapeDeleted { id: &'a str },
}
