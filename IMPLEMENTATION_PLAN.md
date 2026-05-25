# Implementation Plan

App: team-todos
Summary: Shared task list where teams track who is doing what and celebrate progress together

## Backend (logic/src/lib.rs)
- [x] Define entity: [todos] Task (id:LwwRegister<String>, title:LwwRegister<String>, description:LwwRegister<String>, author:LwwRegister<String>, assigned_to:LwwRegister<Option<String>>, completed:LwwRegister<bool>, created_at:LwwRegister<u64>)
- [x] Implement mutate: [todos] create_task(title: String, description: String) → app::Result<String>
- [x] Implement view: [todos] list_tasks() → app::Result<Vec<Task>>
- [x] Implement mutate: [todos] mark_complete(task_id: String) → app::Result<()>
- [x] Implement mutate: [todos] edit_task(task_id: String, title: String, description: String) → app::Result<()>
- [x] Implement mutate: [todos] delete_task(task_id: String) → app::Result<()>
- [x] Implement mutate: [todos] assign_task(task_id: String, assignee: String) → app::Result<()>

## Frontend (app/)
- [ ] Screen: TaskListView — Open and completed task sections with create, edit, assign, and complete actions
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (team member): add a new task with a title and description
- [ ] Test story (team member): mark my own tasks as done
- [ ] Test story (anyone on the team): see all open and completed tasks in one place
- [ ] Test story (team member): edit or delete tasks I created
- [ ] Test story (team lead): assign tasks to specific people
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
