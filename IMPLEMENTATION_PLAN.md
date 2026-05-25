# Implementation Plan

App: soul
Summary: Personal knowledge vault with optional sharing — store notes about yourself and collaborate on shared contexts.

## Backend (logic/src/lib.rs)
- [x] Define entity: [soul] MemoryItem (id:LwwRegister<String>, text:LwwRegister<String>, tags:LwwRegister<Vec<String>>, author:LwwRegister<String>, created_at:LwwRegister<u64>, updated_at:LwwRegister<u64>)
- [x] Implement mutate: [soul] add_memory(text: String, tags: Vec<String>) → app::Result<String>
- [x] Implement mutate: [soul] update_memory(id: String, text: String, tags: Vec<String>) → app::Result<()>
- [x] Implement mutate: [soul] delete_memory(id: String) → app::Result<()>
- [x] Implement view: [soul] list_memories() → app::Result<Vec<MemoryItem>>
- [x] Implement view: [soul] query_by_tags(tags: Vec<String>) → app::Result<Vec<MemoryItem>>

## Frontend (app/)
- [ ] Screen: SoulView — Personal Soul context — list of your own notes, create new, edit/delete, filter by tag, manage your preferences
- [ ] Screen: SharedContextView — List of shared knowledge contexts with member count, create new shared context, view/add/edit/delete notes within one, filter by tags, invite others
- [ ] Screen: ContextListView — Sidebar showing your Soul + all shared contexts you're a member of, quick switch between them
- [ ] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (me): jot down notes about my preferences, work facts, or life context into my personal Soul
- [ ] Test story (a team member): add notes tagged with decisions, learnings, or context to a shared knowledge context
- [ ] Test story (anyone): search and filter notes by tags (e.g. `topic:rust`, `person:alice`, `kind:decision`)
- [ ] Test story (the note author): edit or delete my own notes
- [ ] Test story (a context owner): invite others into a shared knowledge context
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
