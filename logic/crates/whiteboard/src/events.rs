#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new shape was added to the canvas.
    ShapeAdded { id: &'a str },
    /// A shape's position was updated.
    ShapePositionUpdated { id: &'a str },
    /// A shape was deleted from the canvas.
    ShapeDeleted { id: &'a str },
    /// A new text element was added to the canvas.
    TextAdded { id: &'a str },
    /// A text element's content was updated.
    TextUpdated { id: &'a str },
    /// A text element was deleted from the canvas.
    TextDeleted { id: &'a str },
    /// A comment was posted on a shape or area.
    CommentAdded { id: &'a str },
    /// A comment was deleted.
    CommentDeleted { id: &'a str },
    /// A collaborator moved their cursor.
    CursorUpdated {},
    /// The canvas was cleared by the host.
    CanvasCleared {},
}
