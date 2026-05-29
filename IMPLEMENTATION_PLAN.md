# Implementation Plan

App: knowledge-graph
Summary: Collaborative knowledge graph where teams link documents and ideas through tags and cross-references

## Backend (logic/src/lib.rs)
- [x] Define entity: [knowledge-graph] Document (id:LwwRegister<String>, title:LwwRegister<String>, content:LwwRegister<String>, author:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Define entity: [knowledge-graph] Tag (id:LwwRegister<String>, document_id:LwwRegister<String>, label:LwwRegister<String>, added_by:LwwRegister<String>)
- [x] Define entity: [knowledge-graph] Link (id:LwwRegister<String>, source_doc_id:LwwRegister<String>, source_text:LwwRegister<String>, target_doc_id:LwwRegister<String>, target_text:LwwRegister<String>, author:LwwRegister<String>, created_at:LwwRegister<u64>)
- [x] Implement mutate: [knowledge-graph] create_document(title: String, content: String) → app::Result<String>
- [x] Implement mutate: [knowledge-graph] add_tag(document_id: String, label: String) → app::Result<String>
- [x] Implement mutate: [knowledge-graph] remove_tag(tag_id: String) → app::Result<()>
- [x] Implement mutate: [knowledge-graph] create_link(source_doc_id: String, source_text: String, target_doc_id: String, target_text: String) → app::Result<String>
- [x] Implement mutate: [knowledge-graph] delete_link(link_id: String) → app::Result<()>
- [x] Implement view: [knowledge-graph] list_documents() → app::Result<Vec<Document>>
- [x] Implement view: [knowledge-graph] list_tags_by_document(document_id: String) → app::Result<Vec<Tag>>
- [x] Implement view: [knowledge-graph] list_documents_by_tag(label: String) → app::Result<Vec<Document>>
- [x] Implement view: [knowledge-graph] list_links() → app::Result<Vec<Link>>
- [x] Implement mutate: [knowledge-graph] edit_document(document_id: String, new_title: String, new_content: String) → app::Result<()>

## Frontend (app/)
- [x] Screen: DocumentListView — Sidebar of all documents with tags + create-doc
- [x] Screen: DocumentDetailView — Document content + tag editor + text selection to link
- [x] Screen: GraphVisualizationView — Force-directed graph of documents and links
- [x] Screen: TagFilterView — Filter documents by selected tag
- [x] Apply designTheme tokens

## Verification
- [ ] cargo build --target wasm32-unknown-unknown succeeds
- [ ] tsc --noEmit passes
- [ ] Test story (team member): upload or create a document and tag it with keywords
- [ ] Test story (team member): link a paragraph in one document to a paragraph in another
- [ ] Test story (team member): see all documents tagged with a specific keyword
- [ ] Test story (team member): view the graph visually with documents as nodes and links as edges
- [ ] Test story (team member): edit or add tags to my own documents
- [ ] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
