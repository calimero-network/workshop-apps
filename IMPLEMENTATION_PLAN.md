# Implementation Plan

App: project-tracker
Summary: Centralized bug and feature request submission with owner-driven triage and priority ranking

## Backend (logic/src/lib.rs)
- [x] Define entity: [tracker] Project (id:LwwRegister<String>, name:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Define entity: [tracker] Submission (id:String, author:String, title:String, description:String, type:String, status:String, created_at:u64)
- [x] Define entity: [tracker] TriageResult (id:LwwRegister<String>, submission_id:LwwRegister<String>, status:LwwRegister<String>, impact:LwwRegister<u32>, effort:LwwRegister<u32>, triaged_at:LwwRegister<u64>)
- [x] Implement mutate: [tracker] create_project(name: String) → app::Result<String>
- [x] Implement mutate: [tracker] submit_request(title: String, description: String, type_: String) → app::Result<String>
- [x] Implement mutate: [tracker] edit_submission(submission_id: String, title: String, description: String) → app::Result<()>
- [x] Implement mutate: [tracker] withdraw_submission(submission_id: String) → app::Result<()>
- [x] Implement mutate: [tracker] triage_submission(submission_id: String, status: String, impact: u32, effort: u32) → app::Result<String>
- [x] Implement view: [tracker] list_submissions() → app::Result<Vec<Submission>>
- [x] Implement view: [tracker] list_approved_tasks() → app::Result<Vec<TriageResult>>

## Frontend (app/)
- [x] Screen: ProjectListView — List of projects the user is part of + create project CTA
- [x] Screen: SubmissionQueueView — Owner's pending submissions awaiting triage + triage form
- [x] Screen: TaskBoardView — Approved tasks ranked by impact/effort + submission form
- [x] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (project owner): create a new project namespace and invite my team
- [ ] Test story (team member): submit a bug or feature request with a title and description
- [ ] Test story (project owner): review submissions and mark each as approved or declined with impact and effort scores
- [ ] Test story (any team member): see the approved task list sorted by highest impact and lowest effort
- [ ] Test story (team member): edit or withdraw my own submissions before they're triaged
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
