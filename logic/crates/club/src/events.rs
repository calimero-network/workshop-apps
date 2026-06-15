#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// The club was initialized with a name and weekly goal.
    ClubInitialized { id: &'a str },
    /// The club's weekly workout goal was updated.
    WeeklyGoalUpdated { goal: u32 },
    /// A new workout was logged by a member.
    WorkoutLogged { id: &'a str, author: &'a str },
    /// A workout entry was edited by its author.
    WorkoutEdited { id: &'a str },
    /// A workout entry was deleted by its author.
    WorkoutDeleted { id: &'a str },
    /// A cheer was added to a workout.
    CheerAdded { id: &'a str, workout_id: &'a str },
}
