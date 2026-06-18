# Implementation Plan

App: team-todos
Summary: A shared todo list where teammates add, complete, and manage tasks together in real time

## Backend (logic/src/lib.rs)
- [x] Define entity: [todos] Task (id:String, author:String, description:String, done:bool, created_at:u64)
- [x] Implement mutate: [todos] add_task(description: String) → app::Result<String>
- [x] Implement mutate: [todos] toggle_task(task_id: String) → app::Result<()>
- [x] Implement mutate: [todos] edit_task(task_id: String, new_description: String) → app::Result<()>
- [x] Implement mutate: [todos] delete_task(task_id: String) → app::Result<()>
- [x] Implement view: [todos] list_tasks() → app::Result<Vec<Task>>

## Frontend (app/)
- [ ] Screen: TaskListPage — Shared task list with add-task input, toggleable checkboxes, edit/delete controls, grouped by open vs. done
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (team lead): create a new list and invite my teammates
- [ ] Test story (team member): add a task with a short description
- [ ] Test story (team member): mark a task as done or reopen it
- [ ] Test story (task creator): edit or delete tasks I added
- [ ] Test story (anyone on the team): see all tasks at a glance — open ones first, done ones below
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
