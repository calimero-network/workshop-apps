//! Events emitted by the shared travel-journal service. Borrowed `&'a str`
//! fields keep emission allocation-free (the SDK serialises them before the
//! borrow ends).

#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A traveler stamped an activity at the current stop.
    StampAdded {
        activity_id: &'a str,
        stop: &'a str,
        category: &'a str,
    },
    /// A stamp was removed by the traveler who added it.
    StampRemoved { stamp_id: &'a str },
    /// A postcard was generated for a day.
    PostcardCreated { day_number: u32, stop: &'a str },
}
