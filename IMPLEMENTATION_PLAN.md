# Implementation Plan

App: team-todos
Summary: A shared task list where every team member can add, check off, and manage tasks together in real time

## Backend (logic/src/lib.rs)
- [ ] Define entity: [todos] Task (id:LwwRegister<String>, title:LwwRegister<String>, completed:LwwRegister<bool>, created_by:LwwRegister<String>, created_at:LwwRegister<u64>)
- [ ] Implement mutate: [todos] add_task(title: String) → app::Result<String>
- [ ] Implement mutate: [todos] toggle_task(task_id: String) → app::Result<()>
- [ ] Implement mutate: [todos] edit_task(task_id: String, new_title: String) → app::Result<()>
- [ ] Implement mutate: [todos] delete_task(task_id: String) → app::Result<()>
- [ ] Implement view: [todos] list_tasks() → app::Result<Vec<Task>>
- [ ] Implement mutate: [todos] clear_completed() → app::Result<u32>

## Frontend (app/)
- [ ] Screen: TaskBoardPage — Live task list split into open and completed sections, with add-task input, inline editing, check-off toggles, and a clear-completed button
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (team member): add a new task to our shared list
- [ ] Test story (team member): check off a task when it's done
- [ ] Test story (team member): edit or remove any task
- [ ] Test story (team lead): see all tasks at a glance — grouped by open and completed
- [ ] Test story (team lead): clear all completed tasks at once
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
