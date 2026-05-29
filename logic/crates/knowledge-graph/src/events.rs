#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new document was created.
    DocumentCreated { id: &'a str },
    /// A document's title or content was edited.
    DocumentEdited { id: &'a str },
    /// A tag was added to a document.
    TagAdded { id: &'a str, document_id: &'a str },
    /// A tag was removed from a document.
    TagRemoved { id: &'a str },
    /// A link between two document passages was created.
    LinkCreated { id: &'a str, source_doc_id: &'a str, target_doc_id: &'a str },
    /// A link was deleted.
    LinkDeleted { id: &'a str },
}
