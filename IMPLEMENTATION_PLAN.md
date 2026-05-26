# Implementation Plan

App: whiteboard-collab
Summary: Shared endless whiteboard for real-time collaborative sketching, shapes, and pinned comments

## Backend (logic/src/lib.rs)
- [ ] Define entity: [whiteboard] Whiteboard (id:LwwRegister<String>, name:LwwRegister<String>, created_at:LwwRegister<u64>)
- [ ] Define entity: [whiteboard] Element (id:String, author:String, element_type:String, x:f64, y:f64, width:f64, height:f64, content:String, color:String, created_at:u64)
- [ ] Define entity: [whiteboard] Comment (id:String, author:String, x:f64, y:f64, text:String, created_at:u64)
- [ ] Define entity: [whiteboard] Cursor (user_id:String, x:f64, y:f64, username:String, last_moved_at:u64)
- [ ] Implement mutate: [whiteboard] create_whiteboard(name: String) → app::Result<String>
- [ ] Implement mutate: [whiteboard] add_element(element_type: String, x: f64, y: f64, width: f64, height: f64, content: String, color: String) → app::Result<String>
- [ ] Implement mutate: [whiteboard] delete_element(element_id: String) → app::Result<()>
- [ ] Implement mutate: [whiteboard] add_comment(x: f64, y: f64, text: String) → app::Result<String>
- [ ] Implement mutate: [whiteboard] delete_comment(comment_id: String) → app::Result<()>
- [ ] Implement mutate: [whiteboard] update_cursor(x: f64, y: f64) → app::Result<()>
- [ ] Implement view: [whiteboard] get_elements() → app::Result<Vec<Element>>
- [ ] Implement view: [whiteboard] get_comments() → app::Result<Vec<Comment>>
- [ ] Implement view: [whiteboard] get_cursors() → app::Result<Vec<Cursor>>

## Frontend (app/)
- [ ] Screen: WhiteboardListPage — Browse and open whiteboards, create new ones
- [ ] Screen: CanvasPage — Infinite canvas with shapes, text, live cursors, and comment markers
- [ ] Screen: CommentPanel — View and manage comments pinned to canvas locations
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (creator): start a new whiteboard and invite my team
- [ ] Test story (team member): draw shapes and add text to the canvas
- [ ] Test story (reviewer): pin a comment to a specific location on the canvas
- [ ] Test story (anyone on the whiteboard): see live cursors from my teammates as they move and draw
- [ ] Test story (creator): delete or undo shapes and text I've added
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
