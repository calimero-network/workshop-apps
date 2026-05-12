# Implementation Plan

App: trip-splitter
Summary: Track shared expenses during a trip and settle up fairly with your group

## Backend (logic/src/lib.rs)
- [x] Define at least one entity with CRDT fields
- [x] Implement at least one API method

## Frontend (app/)
- [x] Screen: TripSetupPage — Create trip, name it, set currency, invite friends
- [x] Screen: ExpenseListPage — Log expenses, edit/delete own, see all entries
- [x] Screen: SettlementPage — Live balances + record payments
- [x] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (trip organizer): create a new trip and invite my travel buddies
- [ ] Test story (traveler): log an expense I just paid (e.g., 'I paid $120 for dinner — split 4 ways')
- [ ] Test story (participant): see live balances showing who owes whom at any moment
- [ ] Test story (participant): record a payment I just sent to someone (e.g., 'I paid Alice $30')
- [ ] Test story (participant): edit or delete an expense I logged
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
