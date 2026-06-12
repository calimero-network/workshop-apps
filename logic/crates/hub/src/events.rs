#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new community was registered in the hub.
    CommunityRegistered { id: &'a str, name: &'a str },
    /// A community's stats (member_count) were updated.
    CommunityStatsUpdated { id: &'a str },
    /// A community was deleted from the hub.
    CommunityDeleted { id: &'a str },
}
