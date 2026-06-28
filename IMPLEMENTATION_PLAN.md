# Implementation Plan

App: team-kudos
Summary: Live team appreciation board where members post and see kudos in real time

## Backend (logic/src/lib.rs)
- [ ] Define entity: [kudos] KudosNote (id:LwwRegister<String>, author:LwwRegister<String>, message:LwwRegister<String>, colleague:LwwRegister<String>, created_at:LwwRegister<u64>)
- [ ] Implement mutate: [kudos] post_kudos(colleague: String, message: String) → app::Result<String>
- [ ] Implement view: [kudos] get_kudos_feed() → app::Result<Vec<KudosNote>>
- [ ] Implement mutate: [kudos] delete_kudos(id: String) → app::Result<()>

## Frontend (app/)
- [ ] Screen: KudosFeedPage — Live feed of kudos sorted by recency + compose button + delete action per note
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (team member): post a quick kudos note naming a colleague
- [ ] Test story (anyone on the team): see all recent kudos with who posted it and when
- [ ] Test story (kudos poster): delete my own note if I made a typo or change my mind
- [ ] Test story (team lead): see the kudos feed continuously updated as notes come in
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
