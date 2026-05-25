# Implementation Plan

App: trip-tracker
Summary: Live group expense ledger, location sharing, and shared photo feed for group travel

## Backend (logic/src/lib.rs)
- [x] Define entity: [trip] Trip (id:LwwRegister<String>, name:LwwRegister<String>, status:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Define entity: [trip] Location (id:String, author:String, description:String, posted_at:u64)
- [x] Define entity: [trip] Expense (id:String, payer:String, description:String, amount_cents:u64, participants:Vec<String>, logged_at:u64)
- [x] Define entity: [trip] Photo (id:String, author:String, url:String, uploaded_at:u64)
- [x] Implement mutate: [trip] create_trip(name: String) → app::Result<String>
- [x] Implement mutate: [trip] post_location(description: String) → app::Result<String>
- [x] Implement mutate: [trip] log_expense(description: String, amount_cents: u64, participants: Vec<String>) → app::Result<String>
- [x] Implement mutate: [trip] upload_photo(url: String) → app::Result<String>
- [x] Implement view: [trip] get_locations() → app::Result<Vec<Location>>
- [x] Implement view: [trip] get_expenses() → app::Result<Vec<Expense>>
- [x] Implement view: [trip] get_photos() → app::Result<Vec<Photo>>
- [x] Implement view: [trip] get_settlement() → app::Result<SettlementSummary>
- [x] Implement mutate: [trip] finish_trip() → app::Result<()>

## Frontend (app/)
- [ ] Screen: FeedView — Timeline of locations + photos + expense log, newest first
- [ ] Screen: LedgerView — Cost breakdown per person + settlement summary
- [ ] Screen: TripSettingsView — Trip name, member list, finish/archive button
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (traveler): post my current location and activity
- [ ] Test story (anyone on the trip): log an expense and assign it to people involved
- [ ] Test story (traveler): upload a photo to the shared trip
- [ ] Test story (anyone viewing the trip): see the running cost breakdown
- [ ] Test story (trip organizer): mark the trip as finished
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
