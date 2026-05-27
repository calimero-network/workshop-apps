# Implementation Plan

App: collab-whiteboard
Summary: Real-time collaborative canvas where teams sketch shapes and design components together

## Backend (logic/src/lib.rs)
- [x] Define entity: [whiteboard] Project (id:LwwRegister<String>, name:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Define entity: [whiteboard] Shape (id:String, author:String, shape_type:String, x:f64, y:f64, width:f64, height:f64, color:String, created_at:u64)
- [x] Implement mutate: [whiteboard] create_project(name: String) → app::Result<String>
- [x] Implement mutate: [whiteboard] add_shape(shape_type: String, x: f64, y: f64, width: f64, height: f64, color: String) → app::Result<String>
- [x] Implement mutate: [whiteboard] update_shape(id: String, x: f64, y: f64, width: f64, height: f64, color: String) → app::Result<()>
- [x] Implement mutate: [whiteboard] delete_shape(id: String) → app::Result<()>
- [x] Implement view: [whiteboard] list_shapes() → app::Result<Vec<Shape>>

## Frontend (app/)
- [ ] Screen: ProjectsListView — List of projects the user is part of; create and invite UI
- [ ] Screen: WhiteboardView — Live canvas with all shapes; toolbar to add shapes; click to edit properties
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (designer): create a new project and invite my team
- [ ] Test story (team member): add a rectangle, circle, or text shape to the canvas with a color and size
- [ ] Test story (anyone on the canvas): see every shape everyone adds or edits in real time
- [ ] Test story (team member): move, resize, and change the color of shapes I add
- [ ] Test story (team member): delete shapes I no longer need
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
