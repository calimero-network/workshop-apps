# Implementation Plan

App: living-memorial
Summary: A shared space where friends and family preserve and celebrate memories of someone who has passed

## Backend (logic/src/lib.rs)
- [x] Define entity: [memorial] Memory (id:LwwRegister<String>, author:LwwRegister<String>, body:LwwRegister<String>, attachments:LwwRegister<Vec<Attachment>>, created_at:LwwRegister<u64>)
- [x] Define entity: [memorial] Reaction (id:LwwRegister<String>, memory_id:LwwRegister<String>, author:LwwRegister<String>, emoji:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Define entity: [memorial] Comment (id:LwwRegister<String>, memory_id:LwwRegister<String>, author:LwwRegister<String>, body:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Implement mutate: [memorial] post_memory(body: String, attachments: Vec<Attachment>) → app::Result<String>
- [x] Implement mutate: [memorial] edit_memory(id: String, body: String) → app::Result<()>
- [x] Implement mutate: [memorial] delete_memory(id: String) → app::Result<()>
- [x] Implement view: [memorial] get_memories() → app::Result<Vec<Memory>>
- [x] Implement mutate: [memorial] add_reaction(memory_id: String, emoji: String) → app::Result<String>
- [x] Implement mutate: [memorial] remove_reaction(id: String) → app::Result<()>
- [x] Implement mutate: [memorial] post_comment(memory_id: String, body: String) → app::Result<String>
- [x] Implement view: [memorial] get_comments(memory_id: String) → app::Result<Vec<Comment>>
- [x] Implement view: [memorial] get_reactions(memory_id: String) → app::Result<Vec<Reaction>>

## Frontend (app/)
- [ ] Screen: MemorialTimeline — Reverse-chronological feed of memories with photos, audio, reactions, and comments
- [ ] Screen: MemoryDetail — Full memory view with attachments, all reactions, and comment thread
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (family member): share a story or memory about the person
- [ ] Test story (contributor): add a photo or voice memo alongside my story
- [ ] Test story (founder): invite specific friends and family to contribute
- [ ] Test story (visitor): read all the stories, photos, and memos in one place
- [ ] Test story (contributor): see others' memories and react or comment on them
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
