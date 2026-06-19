# Implementation Plan

App: ranked-vote
Summary: Group decision-making through ranked-choice voting where everyone ranks options and sees results together

## Backend (logic/src/lib.rs)
- [ ] Define entity: [voting] Poll (id:LwwRegister<String>, title:LwwRegister<String>, status:LwwRegister<String>, created_at:LwwRegister<u64>)
- [ ] Define entity: [voting] PollOption (id:String, label:String, author:String, created_at:u64)
- [ ] Define entity: [voting] Ranking (id:String, author:String, ordered_option_ids:String, submitted_at:u64)
- [ ] Implement mutate: [voting] create_poll(title: String) → app::Result<String>
- [ ] Implement mutate: [voting] add_option(label: String) → app::Result<String>
- [ ] Implement mutate: [voting] remove_option(option_id: String) → app::Result<()>
- [ ] Implement mutate: [voting] submit_ranking(ordered_option_ids: Vec<String>) → app::Result<String>
- [ ] Implement view: [voting] get_poll() → app::Result<Poll>
- [ ] Implement view: [voting] get_options() → app::Result<Vec<PollOption>>
- [ ] Implement view: [voting] get_rankings() → app::Result<Vec<Ranking>>
- [ ] Implement mutate: [voting] close_poll() → app::Result<()>

## Frontend (app/)
- [ ] Screen: PollSetupPage — Create poll title, add/remove options, invite group members
- [ ] Screen: VotingPage — Drag-and-drop ranking of all options with submit button
- [ ] Screen: ResultsPage — Live aggregated standings showing each option's average rank and first-place votes
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (organizer): create a new poll with a question and invite my group
- [ ] Test story (group member): suggest additional options before voting starts
- [ ] Test story (voter): rank all the options from most to least preferred and change my mind before the poll closes
- [ ] Test story (anyone in the group): see a live tally of how the rankings are shaping up
- [ ] Test story (organizer): close the poll and lock in the final winner
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
