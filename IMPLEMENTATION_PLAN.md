# Implementation Plan

App: deal-flow
Summary: A simple, shared sales pipeline for small teams to track leads through customizable stages

## Backend (logic/src/lib.rs)
- [x] Define entity: [pipeline] PipelineConfig (id:LwwRegister<String>, stages:LwwRegister<Vec<String>>)
- [x] Define entity: [pipeline] Lead (id:String, name:String, company:String, value:u64, stage:String, status:String, created_by:String, created_at:u64)
- [x] Implement mutate: [pipeline] set_stages(stages: Vec<String>) → app::Result<()>
- [x] Implement view: [pipeline] get_stages() → app::Result<Vec<String>>
- [x] Implement mutate: [pipeline] add_lead(name: String, company: String, value: u64) → app::Result<String>
- [x] Implement mutate: [pipeline] move_lead(lead_id: String, new_stage: String) → app::Result<()>
- [x] Implement mutate: [pipeline] close_lead(lead_id: String, outcome: String) → app::Result<()>
- [x] Implement view: [pipeline] list_leads() → app::Result<Vec<Lead>>
- [x] Implement view: [pipeline] list_closed_leads() → app::Result<Vec<Lead>>

## Frontend (app/)
- [ ] Screen: PipelineBoard — Kanban-style board with leads as cards grouped into stage columns, showing deal values and drag-to-move
- [ ] Screen: ClosedDeals — Summary list of Won and Lost deals with totals and outcome filters
- [ ] Apply designTheme tokens

## Verification
- [x] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (team lead): set up custom pipeline stages like New, Contacted, Proposal, Won, and Lost
- [ ] Test story (sales rep): add a new lead with a name, company, and estimated deal value
- [ ] Test story (sales rep): move a lead from one stage to the next
- [ ] Test story (anyone on the team): see the full pipeline at a glance with leads grouped by stage and value totals per stage
- [ ] Test story (team lead): mark a lead as Won or Lost and see a summary of closed deals
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
