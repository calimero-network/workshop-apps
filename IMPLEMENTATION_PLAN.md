# Implementation Plan

App: incident-command
Summary: PagerDuty-style incident management where teams report, triage, resolve incidents together and write collaborative postmortems

## Backend (logic/src/lib.rs)
- [x] Define entity: [incident_manager] Incident (id:LwwRegister<String>, title:LwwRegister<String>, description:LwwRegister<String>, severity:LwwRegister<String>, status:LwwRegister<String>, reported_by:LwwRegister<String>, commander:LwwRegister<Option<String>>, root_cause:LwwRegister<Option<String>>, created_at:LwwRegister<u64>, resolved_at:LwwRegister<Option<u64>>)
- [x] Define entity: [incident_manager] TimelineEntry (id:String, incident_id:String, author:String, body:String, entry_type:String, created_at:u64)
- [x] Define entity: [incident_manager] Postmortem (id:LwwRegister<String>, incident_id:LwwRegister<String>, summary:LwwRegister<String>, root_cause:LwwRegister<String>, action_items:LwwRegister<String>, last_edited_by:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Define entity: [incident_manager] OnCallSlot (id:LwwRegister<String>, member_name:LwwRegister<String>, member_id:LwwRegister<String>, start_time:LwwRegister<u64>, end_time:LwwRegister<u64>, order:LwwRegister<u32>)
- [x] Implement mutate: [incident_manager] report_incident(title: String, description: String, severity: String) → app::Result<String>
- [x] Implement mutate: [incident_manager] acknowledge_incident(incident_id: String) → app::Result<()>
- [x] Implement mutate: [incident_manager] escalate_incident(incident_id: String, next_responder_id: String) → app::Result<String>
- [x] Implement mutate: [incident_manager] resolve_incident(incident_id: String, root_cause: String) → app::Result<()>
- [x] Implement mutate: [incident_manager] post_timeline_entry(incident_id: String, body: String, entry_type: String) → app::Result<String>
- [x] Implement view: [incident_manager] get_timeline(incident_id: String) → app::Result<Vec<TimelineEntry>>
- [x] Implement view: [incident_manager] list_incidents(status_filter: Option<String>) → app::Result<Vec<Incident>>
- [x] Implement view: [incident_manager] get_incident(incident_id: String) → app::Result<Incident>
- [x] Implement mutate: [incident_manager] create_postmortem(incident_id: String, summary: String, root_cause: String, action_items: String) → app::Result<String>
- [x] Implement mutate: [incident_manager] update_postmortem(postmortem_id: String, summary: String, root_cause: String, action_items: String) → app::Result<()>
- [x] Implement view: [incident_manager] get_postmortem(incident_id: String) → app::Result<Option<Postmortem>>
- [x] Implement mutate: [incident_manager] set_oncall_slot(member_name: String, member_id: String, start_time: u64, end_time: u64, order: u32) → app::Result<String>
- [x] Implement mutate: [incident_manager] remove_oncall_slot(slot_id: String) → app::Result<()>
- [x] Implement view: [incident_manager] get_oncall_schedule() → app::Result<Vec<OnCallSlot>>

## Frontend (app/)
- [x] Screen: IncidentDashboard — Live list of all open/acknowledged incidents sorted by severity, with a big 'Report Incident' button and current on-call badge
- [x] Screen: IncidentDetailPage — Full incident view with status controls (acknowledge / escalate / resolve), live timeline feed, and link to postmortem
- [x] Screen: PostmortemEditor — Collaborative editor for summary, root cause, and action items tied to a resolved incident
- [x] Screen: OnCallSchedule — Visual rotation schedule showing who's on call now and upcoming slots, editable by team lead
- [x] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (on-call responder): report a new incident with a severity level and description
- [ ] Test story (team member): acknowledge an open incident
- [ ] Test story (incident commander): post timeline updates during an incident
- [ ] Test story (team member): escalate an unacknowledged incident to the next on-call responder
- [ ] Test story (incident commander): resolve an incident and tag a root cause
- [ ] Test story (team member): write and collaboratively edit a postmortem after an incident is resolved
- [ ] Test story (team lead): set and update the on-call rotation schedule
- [ ] Test story (anyone on the team): see a dashboard of all open incidents sorted by severity
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
