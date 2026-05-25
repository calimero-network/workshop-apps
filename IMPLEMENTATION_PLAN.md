# Implementation Plan

App: hackathon-hub
Summary: Shared team workspace for coordinating docs, tasks, and demo plan over a hackathon weekend

## Backend (logic/src/lib.rs)
- [ ] Define entity: [hackathon-hub] Document (id:LwwRegister<String>, title:LwwRegister<String>, content:Text, created_at:LwwRegister<u64>, created_by:LwwRegister<String>)
- [ ] Define entity: [hackathon-hub] Task (id:LwwRegister<String>, title:LwwRegister<String>, assigned_to:LwwRegister<String>, status:LwwRegister<String>, author:LwwRegister<String>, created_at:LwwRegister<u64>)
- [ ] Define entity: [hackathon-hub] DemoNote (id:LwwRegister<String>, content:Text, author:LwwRegister<String>, created_at:LwwRegister<u64>)
- [ ] Implement mutate: [hackathon-hub] create_document(title: String, content: String) → app::Result<String>
- [ ] Implement mutate: [hackathon-hub] edit_document(id: String, title: String, content: String) → app::Result<()>
- [ ] Implement view: [hackathon-hub] list_documents() → app::Result<Vec<Document>>
- [ ] Implement mutate: [hackathon-hub] create_task(title: String, assigned_to: String) → app::Result<String>
- [ ] Implement mutate: [hackathon-hub] update_task_status(id: String, status: String) → app::Result<()>
- [ ] Implement view: [hackathon-hub] list_tasks() → app::Result<Vec<Task>>
- [ ] Implement mutate: [hackathon-hub] add_demo_note(content: String) → app::Result<String>
- [ ] Implement view: [hackathon-hub] list_demo_notes() → app::Result<Vec<DemoNote>>
- [ ] Implement mutate: [hackathon-hub] archive_context() → app::Result<()>

## Frontend (app/)
- [ ] Screen: DocumentsView — List of shared docs + create + edit inline
- [ ] Screen: TaskBoardView — Tasks by assignee + status + quick-mark-done
- [ ] Screen: DemoPlanView — Collaborative demo notes + add-note composer
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (organizer): create a hackathon team context and invite my teammates
- [ ] Test story (team member): add and edit shared documents (project brief, design notes, etc.)
- [ ] Test story (anyone on the team): see who's doing what task and mark tasks as done
- [ ] Test story (team member): contribute ideas and notes to a shared demo plan
- [ ] Test story (organizer): wrap up the context when the hackathon ends
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
