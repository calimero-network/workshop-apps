# Implementation Plan

App: trading-pod-forum
Summary: Private forum for a small group of traders to share positions, theses, and post-mortems.

## Backend (logic/src/lib.rs)
- [x] Define entity: [forum] Post (id:LwwRegister<String>, author:LwwRegister<String>, title:LwwRegister<String>, body:LwwRegister<String>, post_type:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Define entity: [forum] Reply (id:LwwRegister<String>, post_id:LwwRegister<String>, author:LwwRegister<String>, body:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Implement mutate: [forum] create_post(title: String, body: String, post_type: String) → app::Result<String>
- [x] Implement mutate: [forum] edit_post(id: String, new_body: String) → app::Result<()>
- [x] Implement mutate: [forum] delete_post(id: String) → app::Result<()>
- [x] Implement view: [forum] list_posts() → app::Result<Vec<Post>>
- [x] Implement mutate: [forum] reply_to_post(post_id: String, body: String) → app::Result<String>
- [x] Implement mutate: [forum] edit_reply(id: String, new_body: String) → app::Result<()>
- [x] Implement mutate: [forum] delete_reply(id: String) → app::Result<()>
- [x] Implement view: [forum] get_replies(post_id: String) → app::Result<Vec<Reply>>

## Frontend (app/)
- [x] Screen: ForumFeed — Chronological list of posts + create-post CTA
- [x] Screen: PostDetail — Full post + reply thread + reply composer
- [x] Screen: MemberList — Pod members
- [x] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (pod lead): create a private forum and invite my trusted traders
- [ ] Test story (trader): post a position thesis with entry/exit targets and rationale
- [ ] Test story (trader): edit or delete my own posts
- [ ] Test story (trader): reply to a post with commentary or counter-arguments
- [ ] Test story (trader): post a post-mortem on a closed position
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
