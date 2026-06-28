# Implementation Plan

App: governance-board
Summary: Multi-topic governance with proposals, comments, and transparent per-voter tallies

## Backend (logic/src/lib.rs)
- [ ] Define entity: [governance] Topic (id:immutable, name:LwwRegister<String>, created_by:immutable, created_at:immutable)
- [ ] Define entity: [governance] Proposal (id:immutable, topic_id:immutable, author:immutable, title:immutable, description:immutable, created_at:immutable)
- [ ] Define entity: [governance] Comment (id:immutable, proposal_id:immutable, author:immutable, body:immutable, created_at:immutable)
- [ ] Define entity: [governance] Vote (proposal_id:immutable, voter:immutable, direction:LwwRegister<String>, voted_at:LwwRegister<u64>)
- [ ] Implement mutate: [governance] create_topic(name: String) → app::Result<String>
- [ ] Implement view: [governance] list_topics() → app::Result<Vec<Topic>>
- [ ] Implement mutate: [governance] post_proposal(topic_id: String, title: String, description: String) → app::Result<String>
- [ ] Implement view: [governance] list_proposals(topic_id: String) → app::Result<Vec<Proposal>>
- [ ] Implement view: [governance] list_proposal_summaries(topic_id: String) → app::Result<Vec<ProposalSummary>>
- [ ] Implement mutate: [governance] post_comment(proposal_id: String, body: String) → app::Result<String>
- [ ] Implement view: [governance] list_comments(proposal_id: String) → app::Result<Vec<Comment>>
- [ ] Implement mutate: [governance] cast_vote(proposal_id: String, direction: String) → app::Result<()>
- [ ] Implement mutate: [governance] remove_vote(proposal_id: String) → app::Result<()>
- [ ] Implement view: [governance] list_votes(proposal_id: String) → app::Result<Vec<Vote>>
- [ ] Implement view: [governance] get_vote_tally(proposal_id: String) → app::Result<VoteTally>

## Frontend (app/)
- [ ] Screen: TopicList — Sidebar of all topics (from list_topics) plus a create-topic button; selecting a topic drives the feed
- [ ] Screen: ProposalFeed — Live feed of proposals in the selected topic from list_proposal_summaries, sorted by recency, each row showing author, title, net vote count, and comment count; subscribes to ProposalPosted/CommentPosted/VoteCast/VoteChanged/VoteRemoved for live refresh
- [ ] Screen: ProposalDetail — Single proposal with full description, comment thread (list_comments + post_comment), live vote breakdown of voter names and directions (list_votes), net tally (get_vote_tally), and cast/change/remove vote controls; updates live via vote and comment events
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (board member): create a new topic space and invite other members
- [ ] Test story (member): post a proposal with a title and description in a topic
- [ ] Test story (member): comment on a proposal to ask questions or share my opinion
- [ ] Test story (member): cast an up-vote or down-vote on a proposal
- [ ] Test story (anyone viewing a proposal): see the full vote breakdown — who voted up and who voted down — plus the live running tally
- [ ] Test story (anyone viewing the board): see all active proposals in a live feed with author name, title, vote tally, and comment count
- [ ] Test story (member): change my vote or remove it entirely
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
