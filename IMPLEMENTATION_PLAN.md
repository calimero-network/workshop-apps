# Implementation Plan

App: team-todo
Summary: Shared task list where teams collaborate on work and track progress together

## Backend (logic/src/lib.rs)
- [x] Define entity: [todolist] Task (id:LwwRegister<String>, title:LwwRegister<String>, completed:LwwRegister<bool>, assigned_to:LwwRegister<Option<String>>, created_by:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Implement mutate: [todolist] create_task(title: String) → app::Result<String>
- [x] Implement mutate: [todolist] toggle_task(id: String) → app::Result<()>
- [x] Implement mutate: [todolist] assign_task(id: String, assignee: Option<String>) → app::Result<()>
- [x] Implement mutate: [todolist] delete_task(id: String) → app::Result<()>
- [x] Implement view: [todolist] list_tasks() → app::Result<Vec<Task>>

## Frontend (app/)
- [x] Screen: TodoListPage — Task list showing active and completed tasks with inline actions (check, assign, delete)
- [x] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (team member): add a task to the shared list
- [ ] Test story (team member): check off a task when I finish it
- [ ] Test story (team member): assign a task to myself or a teammate
- [ ] Test story (team member): remove a task that's no longer needed
- [ ] Test story (team member): see all current tasks organized by status
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
