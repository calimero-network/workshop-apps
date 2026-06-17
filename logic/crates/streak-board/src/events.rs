#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new habit was created by a member.
    HabitCreated { id: &'a str },
    /// A member checked in on a habit, incrementing their streak.
    CheckedIn { id: &'a str, habit_id: &'a str },
    /// A member sent a cheer to another member's habit streak.
    CheerSent { id: &'a str, habit_id: &'a str },
}
