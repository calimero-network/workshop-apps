# Implementation Plan

App: habit-streak-board
Summary: Track daily habits together with friends, build streaks, and cheer each other on

## Backend (logic/src/lib.rs)
- [x] Define entity: [streak_board] Habit (id:String, author:String, title:String, current_streak:u32, longest_streak:u32, last_check_in_date:String, created_at:u64)
- [x] Define entity: [streak_board] CheckIn (id:String, author:String, habit_id:String, date:String, timestamp:u64)
- [x] Define entity: [streak_board] Cheer (id:String, author:String, habit_id:String, message:String, created_at:u64)
- [x] Implement mutate: [streak_board] create_habit(title: String) → app::Result<String>
- [x] Implement view: [streak_board] list_habits() → app::Result<Vec<Habit>>
- [x] Implement mutate: [streak_board] check_in(habit_id: String, date: String) → app::Result<String>
- [x] Implement view: [streak_board] get_check_ins(habit_id: String) → app::Result<Vec<CheckIn>>
- [x] Implement mutate: [streak_board] send_cheer(habit_id: String, message: String) → app::Result<String>
- [x] Implement view: [streak_board] get_cheers(habit_id: String) → app::Result<Vec<Cheer>>
- [x] Implement view: [streak_board] get_leaderboard() → app::Result<Vec<Habit>>

## Frontend (app/)
- [x] Screen: BoardPage — Grid of all members' habits with streak counts, check-in buttons for your own habits, and cheer buttons for friends' habits
- [x] Screen: LeaderboardPage — Ranked list of longest active streaks across all members
- [x] Apply designTheme tokens

## Verification
- [x] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (organizer): create a habit board and invite my friends
- [ ] Test story (member): add habits I want to track
- [ ] Test story (member): check off my habits each day
- [ ] Test story (member): send a cheer to a friend's streak
- [ ] Test story (anyone in the group): see a leaderboard of the longest active streaks
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
