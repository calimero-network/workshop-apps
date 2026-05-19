# Implementation Plan

App: team-todo
Summary: Shared team task list where everyone adds, completes, and tracks work together

## Backend (logic/src/lib.rs)
- [x] Define entity: [todo] Task (id:LwwRegister<String>, title:LwwRegister<String>, description:LwwRegister<String>, completed:LwwRegister<bool>, created_by:LwwRegister<String>, created_at:LwwRegister<u64>, completed_at:LwwRegister<Option<u64>>)
- [x] Implement mutate: [todo] create_task(title: String, description: String) → app::Result<String>
- [x] Implement mutate: [todo] complete_task(task_id: String) → app::Result<()>
- [x] Implement mutate: [todo] uncomplete_task(task_id: String) → app::Result<()>
- [x] Implement mutate: [todo] edit_task(task_id: String, new_title: String, new_description: String) → app::Result<()>
- [x] Implement mutate: [todo] delete_task(task_id: String) → app::Result<()>
- [x] Implement view: [todo] list_tasks() → app::Result<Vec<Task>>

## Frontend (app/)
- [x] Screen: TaskListPage — All tasks with filters for done/pending + add task form + edit/delete controls per task
- [x] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [x] Test story (team member): add a task to the shared list
- [x] Test story (team member): mark my task as done
- [x] Test story (anyone on the team): see all tasks in one place
- [x] Test story (team member): edit a task I created
- [x] Test story (team member): delete a task I created by mistake
- [x] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
