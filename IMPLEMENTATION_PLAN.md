# Implementation Plan

App: soul
Summary: Personal vault + shared team knowledge. Notes with tags, invitation-based sharing.

## Backend (logic/src/lib.rs)
- [x] Define entity: [soul] MemoryItem (id:LwwRegister<String>, text:LwwRegister<String>, tags:LwwRegister<Vec<String>>, author:LwwRegister<String>, created_at:LwwRegister<u64>, updated_at:LwwRegister<u64>)
- [x] Implement mutate: [soul] add_memory(text: String, tags: Vec<String>) → app::Result<String>
- [x] Implement mutate: [soul] update_memory(id: String, text: String, tags: Vec<String>) → app::Result<()>
- [x] Implement mutate: [soul] delete_memory(id: String) → app::Result<()>
- [x] Implement view: [soul] list_memories() → app::Result<Vec<MemoryItem>>
- [x] Implement view: [soul] query_by_tags(tags: Vec<String>) → app::Result<Vec<MemoryItem>>

## Frontend (app/)
- [ ] Screen: ContextSidebar — List of personal vault + all shared contexts; quick switch between them
- [ ] Screen: VaultView — Personal notes with add/edit/delete and tag filtering
- [ ] Screen: SharedContextView — Team notes with authorship, add/edit/delete (own only), tag filtering, and invite UI
- [ ] Screen: NotesListWithSearch — Display memories with author, timestamp, and tag pills; search/filter by tags
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (user): create a personal vault context where only I can see my notes
- [ ] Test story (vault owner): add, edit, and delete my own notes with freeform tags
- [ ] Test story (team member): create a shared knowledge context and invite specific people
- [ ] Test story (shared context member): read all notes posted by my teammates and search them by tags
- [ ] Test story (shared context member): add my own notes to the shared context with tags
- [ ] Test story (note author): edit or delete my own notes in a shared context
- [ ] Test story (anyone in a context): see a quick list of all my contexts (personal + shared) and switch between them
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
