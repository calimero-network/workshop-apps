# Implementation Plan

App: team-todo
Summary: Shared task list where teams collaborate on what needs doing

## Backend (logic/src/lib.rs)
- [x] Define entity: [todo] Task (id:LwwRegister<String>, title:LwwRegister<String>, description:LwwRegister<String>, creator:LwwRegister<String>, assigned_to:LwwRegister<Option<String>>, completed:LwwRegister<bool>, created_at:LwwRegister<u64>)
- [x] Implement mutate: [todo] create_task(title: String, description: String) → app::Result<String>
- [x] Implement mutate: [todo] complete_task(task_id: String) → app::Result<()>
- [x] Implement mutate: [todo] reopen_task(task_id: String) → app::Result<()>
- [x] Implement mutate: [todo] edit_task(task_id: String, title: String, description: String) → app::Result<()>
- [x] Implement mutate: [todo] delete_task(task_id: String) → app::Result<()>
- [x] Implement mutate: [todo] assign_task(task_id: String, assignee: String) → app::Result<()>
- [x] Implement view: [todo] list_tasks() → app::Result<Vec<Task>>

## Frontend (app/)
- [x] Screen: TodoListView — List of all tasks grouped by status (open/completed) + task creator + task add form
- [x] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [x] Test story (team member): add a new task to the list
- [x] Test story (team member): mark a task as complete
- [x] Test story (anyone on the team): see all current tasks and their status at a glance
- [x] Test story (task creator): edit or delete my own task
- [x] Test story (team lead): assign a task to a specific teammate
- [x] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
