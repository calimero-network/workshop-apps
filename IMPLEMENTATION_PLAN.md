# Implementation Plan

App: team-todos
Summary: Shared task list where the team tracks who's doing what and celebrates completions together

## Backend (logic/src/lib.rs)
- [ ] Define entity: [todos] Task (id:LwwRegister<String>, title:LwwRegister<String>, description:LwwRegister<String>, author:LwwRegister<String>, assigned_to:LwwRegister<Option<String>>, is_complete:LwwRegister<bool>, created_at:LwwRegister<u64>)
- [ ] Implement mutate: [todos] create_task(title: String, description: String) → app::Result<String>
- [ ] Implement mutate: [todos] assign_task(task_id: String, assignee: String) → app::Result<()>
- [ ] Implement mutate: [todos] complete_task(task_id: String) → app::Result<()>
- [ ] Implement mutate: [todos] edit_task(task_id: String, title: String, description: String) → app::Result<()>
- [ ] Implement mutate: [todos] delete_task(task_id: String) → app::Result<()>
- [ ] Implement view: [todos] list_tasks() → app::Result<Vec<Task>>

## Frontend (app/)
- [ ] Screen: TodoListPage — Pending tasks grouped by assignee + completed section + create-task form
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (team member): add a task to our shared list
- [ ] Test story (team member): mark a task complete
- [ ] Test story (team member): assign a task to someone on the team
- [ ] Test story (anyone on the team): see all tasks at a glance — what's done, what's pending, and who's working on what
- [ ] Test story (task creator): edit or delete my own tasks
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
