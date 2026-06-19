# Implementation Plan

App: team-todos
Summary: A shared to-do list where every team member can add, complete, and manage tasks together in real time

## Backend (logic/src/lib.rs)
- [ ] Define entity: [todos] Task (id:LwwRegister<String>, title:LwwRegister<String>, author:LwwRegister<String>, completed:LwwRegister<bool>, created_at:LwwRegister<u64>)
- [ ] Implement mutate: [todos] add_task(title: String) → app::Result<String>
- [ ] Implement mutate: [todos] toggle_task(task_id: String) → app::Result<()>
- [ ] Implement mutate: [todos] edit_task(task_id: String, new_title: String) → app::Result<()>
- [ ] Implement mutate: [todos] delete_task(task_id: String) → app::Result<()>
- [ ] Implement mutate: [todos] clear_completed() → app::Result<u32>
- [ ] Implement view: [todos] list_tasks() → app::Result<Vec<Task>>

## Frontend (app/)
- [ ] Screen: TaskListPage — Shared task list grouped into pending and completed sections, with add-task input, toggle/edit/delete controls, and a clear-completed button for the team lead
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (team member): add a task to the shared list
- [ ] Test story (team member): mark any task as complete or reopen it
- [ ] Test story (team member): edit or remove tasks I created
- [ ] Test story (team lead): clear all completed tasks at once
- [ ] Test story (anyone on the team): see all tasks grouped by status
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
