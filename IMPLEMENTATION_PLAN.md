# Implementation Plan

App: two-person-chat
Summary: Real-time one-on-one messaging between two users

## Backend (logic/src/lib.rs)
- [ ] Define entity: [chat] Message (id:LwwRegister<String>, author:LwwRegister<String>, body:LwwRegister<String>, created_at:LwwRegister<u64>, edited_at:LwwRegister<Option<u64>>)
- [ ] Define entity: [chat] TypingState (user:LwwRegister<String>, is_typing:LwwRegister<bool>, last_activity:LwwRegister<u64>)
- [ ] Implement mutate: [chat] send_message(body: String) → app::Result<String>
- [ ] Implement mutate: [chat] edit_message(id: String, new_body: String) → app::Result<()>
- [ ] Implement mutate: [chat] delete_message(id: String) → app::Result<()>
- [ ] Implement view: [chat] get_messages() → app::Result<Vec<Message>>
- [ ] Implement mutate: [chat] set_typing(is_typing: bool) → app::Result<()>
- [ ] Implement view: [chat] get_typing_state() → app::Result<Vec<TypingState>>

## Frontend (app/)
- [ ] Screen: ChatView — Message history with inline edit/delete + typing indicator + message composer
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (sender): send a message to the other person
- [ ] Test story (recipient): see all messages in chronological order
- [ ] Test story (sender): edit or delete my own messages
- [ ] Test story (either person): see when the other person is typing
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
