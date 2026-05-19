# Implementation Plan

App: one-on-one-chat
Summary: Real-time messaging between two friends with full history

## Backend (logic/src/lib.rs)
- [x] Define entity: [chat] Message (id:LwwRegister<String>, author:LwwRegister<String>, body:LwwRegister<String>, created_at:LwwRegister<u64>, edited_at:LwwRegister<Option<u64>>)
- [x] Implement mutate: [chat] send_message(body: String) → app::Result<String>
- [x] Implement view: [chat] list_messages() → app::Result<Vec<Message>>
- [x] Implement mutate: [chat] edit_message(id: String, new_body: String) → app::Result<()>
- [x] Implement mutate: [chat] delete_message(id: String) → app::Result<()>

## Frontend (app/)
- [x] Screen: ChatView — Message list in chronological order + compose box + edit/delete controls
- [x] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [x] Test story (sender): send a message to my friend
- [x] Test story (recipient): see new messages arrive live
- [x] Test story (either user): see our full message history whenever I open the chat
- [x] Test story (sender): edit or delete my own messages
- [x] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
