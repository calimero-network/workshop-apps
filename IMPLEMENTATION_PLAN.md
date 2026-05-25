# Implementation Plan

App: portfolio-sync
Summary: Shared live feed where founders post updates and fund managers + investors watch and collaborate in real-time

## Backend (logic/src/lib.rs)
- [x] Define entity: [portfolio] Update (id:LwwRegister<String>, company_name:LwwRegister<String>, author:LwwRegister<String>, body:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Define entity: [portfolio] Metric (id:LwwRegister<String>, company_name:LwwRegister<String>, metric_name:LwwRegister<String>, value:LwwRegister<String>, author:LwwRegister<String>, timestamp_ms:LwwRegister<u64>)
- [x] Define entity: [portfolio] Comment (id:LwwRegister<String>, update_id:LwwRegister<String>, author:LwwRegister<String>, body:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Define entity: [portfolio] Subscription (id:LwwRegister<String>, subscriber:LwwRegister<String>, company_name:LwwRegister<String>)
- [x] Implement mutate: [portfolio] post_update(company_name: String, body: String) → app::Result<String>
- [x] Implement mutate: [portfolio] log_metric(company_name: String, metric_name: String, value: String) → app::Result<String>
- [x] Implement view: [portfolio] get_updates() → app::Result<Vec<Update>>
- [x] Implement view: [portfolio] get_latest_metrics() → app::Result<Vec<Metric>>
- [x] Implement mutate: [portfolio] post_comment(update_id: String, body: String) → app::Result<String>
- [x] Implement view: [portfolio] get_comments(update_id: String) → app::Result<Vec<Comment>>
- [x] Implement mutate: [portfolio] follow_company(company_name: String) → app::Result<String>
- [x] Implement view: [portfolio] get_subscriptions() → app::Result<Vec<Subscription>>

## Frontend (app/)
- [ ] Screen: UpdateFeed — Live chronological feed of founder updates with metrics, comment threads, and follow filters
- [ ] Screen: MetricsDashboard — Grid or table view of latest metrics from all portfolio companies, sortable and filterable
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (founder): post a monthly progress update once and have it instantly visible to my fund manager and investors
- [ ] Test story (fund manager): see all founder updates in one live feed as they come in
- [ ] Test story (fund manager): see key metrics (burn rate, runway, MRR, user count) from all my portfolio companies on one dashboard
- [ ] Test story (investor/LP): follow specific companies I care about and see their updates in real-time
- [ ] Test story (fund manager): comment on a founder's update and have a conversation right there
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
