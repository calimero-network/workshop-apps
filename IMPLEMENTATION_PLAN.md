# Implementation Plan

App: infinite-whiteboard
Summary: Shared infinite canvas for sketching shapes, text, and collaborative feedback

## Backend (logic/src/lib.rs)
- [x] Define entity: [whiteboard] Shape (id:LwwRegister<String>, author:LwwRegister<String>, shape_type:LwwRegister<String>, x:LwwRegister<f64>, y:LwwRegister<f64>, width:LwwRegister<f64>, height:LwwRegister<f64>, color:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Define entity: [whiteboard] TextElement (id:LwwRegister<String>, author:LwwRegister<String>, content:LwwRegister<String>, x:LwwRegister<f64>, y:LwwRegister<f64>, font_size:LwwRegister<u32>, color:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Define entity: [whiteboard] Comment (id:LwwRegister<String>, author:LwwRegister<String>, target_id:LwwRegister<String>, body:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Define entity: [whiteboard] Cursor (user_id:LwwRegister<String>, x:LwwRegister<f64>, y:LwwRegister<f64>, last_updated_at:LwwRegister<u64>)
- [x] Implement mutate: [whiteboard] add_shape(shape_type: String, x: f64, y: f64, width: f64, height: f64, color: String) → app::Result<String>
- [x] Implement mutate: [whiteboard] update_shape_position(shape_id: String, x: f64, y: f64) → app::Result<()>
- [x] Implement mutate: [whiteboard] delete_shape(shape_id: String) → app::Result<()>
- [x] Implement mutate: [whiteboard] add_text(content: String, x: f64, y: f64, font_size: u32, color: String) → app::Result<String>
- [x] Implement mutate: [whiteboard] update_text(text_id: String, content: String) → app::Result<()>
- [x] Implement mutate: [whiteboard] delete_text(text_id: String) → app::Result<()>
- [x] Implement mutate: [whiteboard] add_comment(target_id: String, body: String) → app::Result<String>
- [x] Implement mutate: [whiteboard] delete_comment(comment_id: String) → app::Result<()>
- [x] Implement view: [whiteboard] get_comments_for_target(target_id: String) → app::Result<Vec<Comment>>
- [x] Implement mutate: [whiteboard] update_cursor(x: f64, y: f64) → app::Result<()>
- [x] Implement view: [whiteboard] get_all_cursors() → app::Result<Vec<Cursor>>
- [x] Implement view: [whiteboard] get_all_shapes() → app::Result<Vec<Shape>>
- [x] Implement view: [whiteboard] get_all_text() → app::Result<Vec<TextElement>>
- [x] Implement mutate: [whiteboard] clear_canvas() → app::Result<()>

## Frontend (app/)
- [ ] Screen: CanvasView — Infinite whiteboard with live shapes, text, cursors, and comment popups
- [ ] Screen: ToolbarView — Shape/text creation, color picker, clear canvas, and invite teammates
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (designer): draw shapes (rectangles, circles, lines) on the canvas and move them around
- [ ] Test story (anyone on the canvas): add text labels and edit them
- [ ] Test story (collaborator): drop comments on specific shapes or areas
- [ ] Test story (team member): see everyone's cursors and what they're drawing in real-time
- [ ] Test story (host): clear the canvas or archive it
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
