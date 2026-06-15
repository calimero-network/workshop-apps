# Implementation Plan

App: workout-accountability-club
Summary: A shared space where friends log workouts, cheer each other on, and hit weekly goals together

## Backend (logic/src/lib.rs)
- [ ] Define entity: [club] ClubSettings (id:LwwRegister<String>, name:LwwRegister<String>, weekly_goal:LwwRegister<u32>, created_at:LwwRegister<u64>)
- [ ] Define entity: [club] Workout (id:String, author:String, activity:String, duration_minutes:u32, note:String, cheer_count:u32, created_at:u64)
- [ ] Define entity: [club] Cheer (id:String, author:String, workout_id:String, created_at:u64)
- [ ] Implement mutate: [club] init_club(name: String, weekly_goal: u32) → app::Result<String>
- [ ] Implement mutate: [club] set_weekly_goal(goal: u32) → app::Result<()>
- [ ] Implement view: [club] get_club_settings() → app::Result<ClubSettings>
- [ ] Implement mutate: [club] log_workout(activity: String, duration_minutes: u32, note: String) → app::Result<String>
- [ ] Implement mutate: [club] edit_workout(id: String, activity: String, duration_minutes: u32, note: String) → app::Result<()>
- [ ] Implement mutate: [club] delete_workout(id: String) → app::Result<()>
- [ ] Implement view: [club] get_workouts() → app::Result<Vec<Workout>>
- [ ] Implement mutate: [club] add_cheer(workout_id: String) → app::Result<String>
- [ ] Implement view: [club] get_cheers(workout_id: String) → app::Result<Vec<Cheer>>

## Frontend (app/)
- [ ] Screen: ActivityFeed — Live feed of all members' workouts with cheer buttons, weekly goal progress bar, and log-workout CTA
- [ ] Screen: ClubSettingsPage — Club name, weekly goal setting (creator only), and member list
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (club creator): start a new workout club and invite my friends
- [ ] Test story (club member): log my workouts with what I did and how long
- [ ] Test story (club member): edit or delete my own workout entries
- [ ] Test story (club member): cheer on a friend's workout
- [ ] Test story (anyone in the club): see a live feed of everyone's recent workouts and cheers
- [ ] Test story (club creator): set a weekly workout goal for the group
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
