# Implementation Plan

App: governance-board
Summary: Decentralized governance with topic spaces, proposals, comments, and live voting

## Backend (logic/src/lib.rs)
- [ ] Define entity: [governance-directory] TopicSpaceSummary (id:immutable (map key, set once at registration), name:LwwRegister<String>, created_by:immutable (set once at creation), context_id:immutable (set once at creation), member_count:PnCounter (increment on join, decrement on leave; tolerates concurrent membership changes and converges to the true net count), created_at:immutable (set once at creation))
- [ ] Define entity: [governance-topic] TopicMetadata (topic_id:immutable (set once at init), name:LwwRegister<String>, directory_context_id:LwwRegister<Option<String>>, created_at:immutable (set once at init))
- [ ] Define entity: [governance-topic] Proposal (id:immutable (map key), author:immutable (set at post time, used for delete authorization), title:immutable (no edit after posting), description:immutable (no edit after posting), status:LwwRegister<String> (enum-like: "active" | "archived" — only moderators flip to "archived"), created_at:immutable (set at post time))
- [ ] Define entity: [governance-topic] Comment (id:immutable (map key), author:immutable (set at post time), proposal_id:immutable (set at post time), body:immutable (no edit after posting), created_at:immutable (set at post time))
- [ ] Define entity: [governance-topic] Vote (author:immutable (inner map key, identifies the voter), proposal_id:immutable (outer map key), direction:LwwRegister<String> (enum-like: "up" | "down" — re-voting overwrites the same author key, never adds a second; clearing removes the inner entry), cast_at:LwwRegister<u64> (updated on each re-vote))
- [ ] Define entity: [governance-topic] Moderator (user_id:immutable (map key), appointed_by:immutable (set when the moderator entry is created), appointed_at:LwwRegister<u64>)
- [ ] Implement mutate: [governance-directory] register_topic_space(name: String, context_id: String) → app::Result<TopicSpaceSummary>
- [ ] Implement view: [governance-directory] get_all_topics() → app::Result<Vec<TopicSpaceSummary>>
- [ ] Implement mutate: [governance-directory] update_member_count(topic_id: String, delta: i64) → app::Result<()>
- [ ] Implement mutate: [governance-topic] post_proposal(title: String, description: String) → app::Result<String>
- [ ] Implement mutate: [governance-topic] delete_proposal(proposal_id: String) → app::Result<()>
- [ ] Implement view: [governance-topic] get_proposals(include_archived: bool) → app::Result<Vec<Proposal>>
- [ ] Implement mutate: [governance-topic] post_comment(proposal_id: String, body: String) → app::Result<String>
- [ ] Implement view: [governance-topic] get_comments(proposal_id: String) → app::Result<Vec<Comment>>
- [ ] Implement mutate: [governance-topic] cast_vote(proposal_id: String, direction: String) → app::Result<()>
- [ ] Implement mutate: [governance-topic] clear_vote(proposal_id: String) → app::Result<()>
- [ ] Implement view: [governance-topic] get_vote_summary(proposal_id: String) → app::Result<VoteSummary>
- [ ] Implement view: [governance-topic] get_votes_for_proposal(proposal_id: String) → app::Result<Vec<Vote>>
- [ ] Implement mutate: [governance-topic] archive_proposal(proposal_id: String) → app::Result<()>
- [ ] Implement mutate: [governance-topic] add_moderator(user_id: String) → app::Result<()>
- [ ] Implement mutate: [governance-topic] remove_moderator(user_id: String) → app::Result<()>
- [ ] Implement view: [governance-topic] get_moderators() → app::Result<Vec<Moderator>>
- [ ] Implement view: [governance-topic] is_moderator(user_id: String) → app::Result<bool>

## Frontend (app/)
- [ ] Screen: LandingPage — Directory of all topic spaces (from get_all_topics) with names, live member counts (PnCounter-backed), a create-new-space form that calls register_topic_space, and per-space invite links
- [ ] Screen: TopicSpaceView — Proposal feed (get_proposals) with active/archived tabs, create-proposal CTA bound to post_proposal, per-proposal vote summary chips from get_vote_summary, author-only delete and moderator-only archive controls (gated via is_moderator), and a moderator settings panel (add_moderator/remove_moderator, listing get_moderators) shown only when is_moderator returns true for the current user
- [ ] Screen: ProposalDetailView — Single proposal with author identity, full description, live comment thread (get_comments / post_comment), and live up/down vote controls bound to cast_vote, clear_vote, and get_vote_summary showing up, down, net totals plus the viewer's own current vote (my_vote, may be null when not yet voted)
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (member): browse all active topic spaces and join ones that interest me
- [ ] Test story (topic creator): start a new topic space (e.g. 'Treasury') and invite specific members via a link
- [ ] Test story (member in a topic space): post a new proposal with a title and description
- [ ] Test story (proposal author): delete my own proposal (but not edit it after posting)
- [ ] Test story (member): comment on proposals and see others' comments live
- [ ] Test story (member): cast one up or down vote on each proposal and see the running vote total update live
- [ ] Test story (moderator): archive a proposal (hide it from the active list but keep it in history)
- [ ] Test story (moderator): add or remove other moderators in my topic space
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
