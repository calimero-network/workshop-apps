# Implementation Plan

App: team-todos
Summary: A shared todo list where teammates add, complete, and manage tasks together in real time

## Backend (logic/src/lib.rs)
- [x] Define entity: [todolist] Task (id:String, author:String, description:String, done:bool, created_at:u64)
- [x] Implement mutate: [todolist] add_task(description: String) → app::Result<String>
- [x] Implement mutate: [todolist] edit_task(task_id: String, new_description: String) → app::Result<()>
- [x] Implement mutate: [todolist] toggle_task_done(task_id: String) → app::Result<()>
- [x] Implement mutate: [todolist] delete_task(task_id: String) → app::Result<()>
- [x] Implement view: [todolist] list_tasks() → app::Result<Vec<Task>>

## Frontend (app/)
- [x] Screen: TaskListPage — Live task list with add-task input, toggle done, edit/delete controls, grouped by open vs. completed
- [x] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (team lead): create a new todo list and invite my teammates
- [ ] Test story (team member): add tasks to the list with a short description
- [ ] Test story (team member): mark any task as done
- [ ] Test story (team member): edit or delete tasks I created
- [ ] Test story (anyone on the team): see all tasks — open and done — in one view
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
