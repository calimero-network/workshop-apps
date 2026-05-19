# Implementation Plan

App: group-vote
Summary: Collaborative ranked voting where participants vote and see live results together

## Backend (logic/src/lib.rs)
- [x] Define entity: [voting] Vote (id:LwwRegister<String>, title:LwwRegister<String>, options:UnorderedMap<u32, String>, status:LwwRegister<String>, created_by:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Define entity: [voting] Ranking (id:LwwRegister<String>, voter:LwwRegister<String>, vote_id:LwwRegister<String>, ranked_options:RwWiseList<String>, submitted_at:LwwRegister<u64>)
- [x] Implement mutate: [voting] create_vote(title: String, options: Vec<String>) → app::Result<String>
- [x] Implement mutate: [voting] submit_ranking(vote_id: String, ranked_options: Vec<String>) → app::Result<String>
- [x] Implement mutate: [voting] update_ranking(ranking_id: String, new_order: Vec<String>) → app::Result<()>
- [x] Implement view: [voting] get_vote(vote_id: String) → app::Result<Vote>
- [x] Implement view: [voting] list_votes() → app::Result<Vec<Vote>>
- [x] Implement view: [voting] get_rankings_for_vote(vote_id: String) → app::Result<Vec<Ranking>>
- [x] Implement mutate: [voting] close_vote(vote_id: String) → app::Result<()>

## Frontend (app/)
- [x] Screen: VoteListView — All votes the user can see—open and closed, with create button
- [x] Screen: VoteDetailView — Drag-to-rank interface + live results display + close button for organizer
- [x] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [x] Test story (organizer): start a new vote and add options for everyone to rank
- [x] Test story (voter): rank the options from best to worst
- [x] Test story (participant): see the live results and how the group is ranking the options
- [x] Test story (voter): change my ranking before the vote closes
- [x] Test story (organizer): close the vote when we're ready to decide
- [x] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
