#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A trip was created and activated.
    TripCreated { id: &'a str, name: &'a str },
    /// A traveler posted their current location/activity.
    LocationPosted { id: &'a str, author: &'a str },
    /// An expense was logged by a payer.
    ExpenseLogged { id: &'a str, payer: &'a str },
    /// A photo was uploaded to the trip feed.
    PhotoUploaded { id: &'a str, author: &'a str },
    /// The trip organizer finished/locked the trip.
    TripFinished {},
}
