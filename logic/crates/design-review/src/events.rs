//! Events emitted by the design-review service. Borrowed `&'a str` fields keep
//! emission allocation-free (the SDK serialises them before the borrow ends).

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new mockup version was uploaded.
    MockupUploaded { id: &'a str, title: &'a str },
    /// A teammate dropped a new feedback pin on a mockup.
    PinAdded { id: &'a str, mockup_id: &'a str, x: f32, y: f32 },
    /// A pin's comment text was edited by its author.
    PinEdited { id: &'a str, text: &'a str },
    /// A pin was removed by its author.
    PinRemoved { id: &'a str },
    /// A pin was marked resolved (by any teammate).
    PinResolved { id: &'a str },
}
