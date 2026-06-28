# Implementation Plan

App: governance-board
Summary: Collaborative proposal voting with topic spaces, live vote tallies, and member discussion

## Backend (logic/src/lib.rs)
- [ ] Define entity: [governance] TopicSpace (id:LwwRegister<String>, name:LwwRegister<String>, description:LwwRegister<String>, created_by:LwwRegister<String>, created_at:LwwRegister<u64>)
- [ ] Define entity: [governance] Proposal (id:String, space_id:String, author:String, title:String, description:String, created_at:u64)
- [ ] Define entity: [governance] Comment (id:String, proposal_id:String, author:String, body:String, created_at:u64)
- [ ] Define entity: [governance] Vote (id:String, proposal_id:String, voter:String, direction:String, cast_at:u64)
- [ ] Implement mutate: [governance] create_space(name: String, description: String) → app::Result<String>
- [ ] Implement view: [governance] list_spaces() → app::Result<Vec<TopicSpace>>
- [ ] Implement mutate: [governance] post_proposal(space_id: String, title: String, description: String) → app::Result<String>
- [ ] Implement view: [governance] get_proposals(space_id: String) → app::Result<Vec<Proposal>>
- [ ] Implement mutate: [governance] post_comment(proposal_id: String, body: String) → app::Result<String>
- [ ] Implement view: [governance] get_comments(proposal_id: String) → app::Result<Vec<Comment>>
- [ ] Implement mutate: [governance] cast_vote(proposal_id: String, direction: String) → app::Result<String>
- [ ] Implement view: [governance] get_votes(proposal_id: String) → app::Result<Vec<Vote>>

## Frontend (app/)
- [ ] Screen: SpacesListView — All topic spaces with create + invite
- [ ] Screen: ProposalFeedView — Proposals sorted by date or score, with vote tallies
- [ ] Screen: ProposalDetailView — Full proposal + comments + voting interface
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (board member): create a new topic space and invite other members
- [ ] Test story (member): post a proposal with a title and description
- [ ] Test story (member): comment on a proposal to discuss it
- [ ] Test story (member): upvote or downvote a proposal and change my vote
- [ ] Test story (anyone in a space): see all proposals in a feed with author, description, and current vote counts
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
