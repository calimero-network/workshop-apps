# Implementation Plan

App: shared-counter
Summary: A live-updating counter that any participant can increment; everyone sees the total in real time.

## Backend (logic/src/lib.rs)
- [x] Define entity: [counter] Counter (id:LwwRegister<String>, total:Counter<u64>, last_incremented_by:LwwRegister<String>, last_increment_at:LwwRegister<u64>)
- [x] Implement mutate: [counter] increment() → app::Result<u64>
- [x] Implement mutate: [counter] reset() → app::Result<()>
- [x] Implement view: [counter] get_counter() → app::Result<Counter>

## Frontend (app/)
- [x] Screen: CounterPage — Live counter display + increment button + reset button (creator only) + last activity info
- [x] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (participant): increment the shared counter by 1 with a single tap
- [ ] Test story (anyone watching): see the current total update live on my screen
- [ ] Test story (participant): see who made the last increment and when
- [ ] Test story (counter creator): reset the counter back to zero
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
