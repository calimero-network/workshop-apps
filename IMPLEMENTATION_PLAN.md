# Implementation Plan

App: team-todo-list
Summary: Shared task list where team members add, assign, and track progress together

## Backend (logic/src/lib.rs)
- [x] Define entity: [todolist] Task (id:LwwRegister<String>, title:LwwRegister<String>, author:LwwRegister<String>, assigned_to:LwwRegister<Option<String>>, completed:LwwRegister<bool>, created_at:LwwRegister<u64>)
- [x] Implement mutate: [todolist] create_task(title: String) → app::Result<String>
- [x] Implement view: [todolist] list_tasks() → app::Result<Vec<Task>>
- [x] Implement mutate: [todolist] mark_complete(task_id: String) → app::Result<()>
- [x] Implement mutate: [todolist] mark_incomplete(task_id: String) → app::Result<()>
- [x] Implement mutate: [todolist] edit_task(task_id: String, new_title: String) → app::Result<()>
- [x] Implement mutate: [todolist] delete_task(task_id: String) → app::Result<()>
- [x] Implement mutate: [todolist] assign_task(task_id: String, assignee: String) → app::Result<()>

## Frontend (app/)
- [ ] Screen: TodoListView — Open tasks + completed tasks sections + add-task composer + assign modal
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (team member): add a new task to the list
- [ ] Test story (team member): mark a task complete
- [ ] Test story (anyone on the team): see all open and completed tasks at a glance
- [ ] Test story (team member): edit or delete a task I created
- [ ] Test story (team lead): assign a task to a specific person
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
