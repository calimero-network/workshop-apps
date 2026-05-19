#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new message was sent.
    MessageSent { id: &'a str, author: &'a str },
    /// A message was edited.
    MessageEdited { id: &'a str },
    /// A message was deleted.
    MessageDeleted { id: &'a str },
}
