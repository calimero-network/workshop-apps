# Implementation Plan

App: decentra-forum
Summary: A Reddit-like decentralized forum where communities post, discuss, and vote together — with founder and moderator controls to keep things civil

## Backend (logic/src/lib.rs)
- [x] Define entity: [hub] CommunitySummary (id:String, name:String, topic:String, context_id:Option<String>, created_by:String, member_count:u64, created_at:u64)
- [x] Define entity: [community] CommunityMeta (id:LwwRegister<String>, name:LwwRegister<String>, topic:LwwRegister<String>, lobby_context_id:LwwRegister<Option<String>>)
- [x] Define entity: [community] Moderator (id:String, member_id:String, appointed_at:u64)
- [x] Define entity: [community] Post (id:String, author:String, title:String, body:String, vote_score:i64, comment_count:u64, created_at:u64)
- [x] Define entity: [community] Comment (id:String, post_id:String, parent_comment_id:Option<String>, author:String, body:String, vote_score:i64, created_at:u64)
- [x] Define entity: [community] Vote (id:String, target_id:String, target_type:String, author:String, value:i8)
- [x] Implement mutate: [hub] register_community(community_id: String, name: String, topic: String, context_id: String) → app::Result<CommunitySummary>
- [x] Implement view: [hub] get_communities() → app::Result<Vec<CommunitySummary>>
- [x] Implement mutate: [hub] update_community_stats(community_id: String, member_count: u64) → app::Result<()>
- [x] Implement mutate: [hub] delete_community(community_id: String) → app::Result<()>
- [x] Implement mutate: [community] create_post(title: String, body: String) → app::Result<String>
- [x] Implement view: [community] get_posts() → app::Result<Vec<Post>>
- [x] Implement mutate: [community] edit_post(post_id: String, new_title: String, new_body: String) → app::Result<()>
- [x] Implement mutate: [community] delete_post(post_id: String) → app::Result<()>
- [x] Implement mutate: [community] create_comment(post_id: String, body: String, parent_comment_id: Option<String>) → app::Result<String>
- [x] Implement view: [community] get_comments(post_id: String) → app::Result<Vec<Comment>>
- [x] Implement mutate: [community] edit_comment(comment_id: String, new_body: String) → app::Result<()>
- [x] Implement mutate: [community] delete_comment(comment_id: String) → app::Result<()>
- [x] Implement mutate: [community] cast_vote(target_id: String, target_type: String, value: i8) → app::Result<()>
- [x] Implement mutate: [community] appoint_moderator(member_id: String) → app::Result<String>
- [x] Implement mutate: [community] revoke_moderator(moderator_id: String) → app::Result<()>
- [x] Implement view: [community] get_moderators() → app::Result<Vec<Moderator>>
- [x] Implement mutate: [community] moderate_remove_post(post_id: String) → app::Result<()>
- [x] Implement mutate: [community] moderate_remove_comment(comment_id: String) → app::Result<()>
- [x] Implement mutate: [community] rename_community(new_name: String, new_topic: String) → app::Result<()>

## Frontend (app/)
- [x] Screen: HubView — Browse all communities — names, topics, member counts, and a create-community button
- [x] Screen: CommunityFeedView — Scrollable post feed sorted by votes or recency, with a new-post composer and moderation controls for founders/mods
- [x] Screen: PostDetailView — Full post with threaded comments, voting buttons, edit/delete for your own content, and remove buttons for moderators
- [x] Screen: CommunitySettingsView — Rename community, manage moderators — only visible to the community founder
- [x] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (community founder): create a new community with a name and topic
- [ ] Test story (member): submit a post with a title and body to a community
- [ ] Test story (member): comment on any post
- [ ] Test story (member): upvote or downvote posts and comments
- [ ] Test story (member): edit or delete my own posts and comments
- [ ] Test story (community founder): appoint trusted members as moderators
- [ ] Test story (community founder or moderator): remove any post or comment that breaks the rules
- [ ] Test story (anyone in the hub): browse all available communities and see which are active
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
