#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new post was created in the forum.
    PostCreated { id: &'a str },
    /// A post's body was edited.
    PostEdited { id: &'a str },
    /// A post was deleted.
    PostDeleted { id: &'a str },
    /// A reply was created under a post.
    ReplyCreated { id: &'a str, post_id: &'a str },
    /// A reply's body was edited.
    ReplyEdited { id: &'a str },
    /// A reply was deleted.
    ReplyDeleted { id: &'a str },
}
