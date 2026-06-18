# Implementation Plan

App: task-tracker
Summary: A shared Jira-style task board where teams create, assign, and move tasks through status columns together

## Backend (logic/src/lib.rs)
- [x] Define entity: [board] BoardSettings (id:LwwRegister<String>, name:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Define entity: [board] Task (id:String, title:String, description:String, status:String, priority:String, assignee:Option<String>, created_by:String, created_at:u64)
- [x] Define entity: [board] Comment (id:String, task_id:String, author:String, body:String, created_at:u64)
- [x] Implement mutate: [board] init_board(name: String) → app::Result<String>
- [x] Implement mutate: [board] create_task(title: String, description: String, priority: String) → app::Result<String>
- [x] Implement mutate: [board] update_task_status(task_id: String, new_status: String) → app::Result<()>
- [x] Implement mutate: [board] assign_task(task_id: String, assignee: String) → app::Result<()>
- [x] Implement view: [board] get_tasks() → app::Result<Vec<Task>>
- [x] Implement mutate: [board] add_comment(task_id: String, body: String) → app::Result<String>
- [x] Implement mutate: [board] edit_comment(comment_id: String, new_body: String) → app::Result<()>
- [x] Implement mutate: [board] delete_comment(comment_id: String) → app::Result<()>
- [x] Implement view: [board] get_comments(task_id: String) → app::Result<Vec<Comment>>

## Frontend (app/)
- [x] Screen: BoardView — Kanban-style board with three columns (To Do, In Progress, Done), task cards showing title/priority/assignee, and filter controls
- [x] Screen: TaskDetailPanel — Slide-out panel showing full task details, assignment controls, and a comment thread
- [x] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (project lead): create a new board and invite my team
- [ ] Test story (team member): create a task with a title, description, and priority
- [ ] Test story (team member): move a task between columns (To Do, In Progress, Done)
- [ ] Test story (team member): assign a task to myself or another team member
- [ ] Test story (team member): leave comments on a task and edit or delete my own comments
- [ ] Test story (anyone on the team): filter tasks by assignee, priority, or status
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
