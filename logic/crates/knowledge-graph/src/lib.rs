//! Knowledge-graph service — documents, tags, and cross-reference links.

use chat_types::ChatError;
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{AuthoredMap, Mergeable, UnorderedMap};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Document {
    pub id: String,
    pub title: String,
    pub content: String,
    pub author: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Tag {
    pub id: String,
    pub document_id: String,
    pub label: String,
    pub added_by: String,
}

impl Mergeable for Tag {
    fn merge(&mut self, _other: &Self) -> Result<(), MergeError> {
        // Tags are immutable after creation; keep self on concurrent conflict.
        Ok(())
    }
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Link {
    pub id: String,
    pub source_doc_id: String,
    pub source_text: String,
    pub target_doc_id: String,
    pub target_text: String,
    pub author: String,
    pub created_at: u64,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn map_authored_error(action: &'static str) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!("can only {action} your own entry")))
        } else {
            AppError::msg(format!("{action}: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct KnowledgeGraphState {
    documents: AuthoredMap<String, Document>,
    tags: UnorderedMap<String, Tag>,
    links: AuthoredMap<String, Link>,
}

#[app::logic]
impl KnowledgeGraphState {
    #[app::init]
    pub fn init() -> KnowledgeGraphState {
        KnowledgeGraphState {
            documents: AuthoredMap::new_with_field_name("kg:documents"),
            tags: UnorderedMap::new_with_field_name("kg:tags"),
            links: AuthoredMap::new_with_field_name("kg:links"),
        }
    }

    /// Generate a deterministic ID from the transaction's timestamp (nanoseconds,
    /// captured at submission time — identical on every replica during replay)
    /// plus the first 8 chars of the caller's base-58 pubkey (unique per caller).
    /// No shared mutable counter is needed, so state always converges.
    fn next_id(&self, prefix: &str) -> String {
        let now_ns = storage_env::time_now();
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let caller_prefix = caller.chars().take(8).collect::<String>();
        format!("{prefix}-{now_ns}-{caller_prefix}")
    }

    // ---- Mutating methods ----

    pub fn create_document(&mut self, title: String, content: String) -> app::Result<String> {
        let author = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;
        let id = self.next_id("doc");
        let doc = Document {
            id: id.clone(),
            title,
            content,
            author,
            created_at: now_ms,
        };
        self.documents
            .insert(id.clone(), doc)
            .map_err(|e| AppError::msg(format!("documents.insert: {e}")))?;
        app::emit!(Event::DocumentCreated { id: &id });
        Ok(id)
    }

    pub fn edit_document(
        &mut self,
        document_id: String,
        new_title: String,
        new_content: String,
    ) -> app::Result<()> {
        let existing = self
            .documents
            .get(&document_id)
            .map_err(|e| AppError::msg(format!("documents.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("not found: {document_id}")))?;
        let updated = Document {
            id: document_id.clone(),
            title: new_title,
            content: new_content,
            author: existing.author.clone(),
            created_at: existing.created_at,
        };
        self.documents
            .update(&document_id, updated)
            .map_err(map_authored_error("edit_document"))?;
        app::emit!(Event::DocumentEdited { id: &document_id });
        Ok(())
    }

    pub fn add_tag(&mut self, document_id: String, label: String) -> app::Result<String> {
        let added_by = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let id = self.next_id("tag");
        let tag = Tag {
            id: id.clone(),
            document_id: document_id.clone(),
            label,
            added_by,
        };
        self.tags
            .insert(id.clone(), tag)
            .map_err(|e| AppError::msg(format!("tags.insert: {e}")))?;
        app::emit!(Event::TagAdded { id: &id, document_id: &document_id });
        Ok(id)
    }

    pub fn remove_tag(&mut self, tag_id: String) -> app::Result<()> {
        let exists = self
            .tags
            .contains(&tag_id)
            .map_err(|e| AppError::msg(format!("tags.contains: {e}")))?;
        if !exists {
            app::bail!(ChatError::NotFound(tag_id));
        }
        self.tags
            .remove(&tag_id)
            .map_err(|e| AppError::msg(format!("tags.remove: {e}")))?;
        app::emit!(Event::TagRemoved { id: &tag_id });
        Ok(())
    }

    pub fn create_link(
        &mut self,
        source_doc_id: String,
        source_text: String,
        target_doc_id: String,
        target_text: String,
    ) -> app::Result<String> {
        let author = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;
        let id = self.next_id("link");
        let link = Link {
            id: id.clone(),
            source_doc_id: source_doc_id.clone(),
            source_text,
            target_doc_id: target_doc_id.clone(),
            target_text,
            author,
            created_at: now_ms,
        };
        self.links
            .insert(id.clone(), link)
            .map_err(|e| AppError::msg(format!("links.insert: {e}")))?;
        app::emit!(Event::LinkCreated {
            id: &id,
            source_doc_id: &source_doc_id,
            target_doc_id: &target_doc_id,
        });
        Ok(id)
    }

    pub fn delete_link(&mut self, link_id: String) -> app::Result<()> {
        let exists = self
            .links
            .contains(&link_id)
            .map_err(|e| AppError::msg(format!("links.contains: {e}")))?;
        if !exists {
            app::bail!(ChatError::NotFound(link_id));
        }
        self.links
            .remove(&link_id)
            .map_err(map_authored_error("delete_link"))?;
        app::emit!(Event::LinkDeleted { id: &link_id });
        Ok(())
    }

    // ---- View methods ----

    pub fn list_documents(&self) -> app::Result<Vec<Document>> {
        let entries = self
            .documents
            .entries()
            .map_err(|e| AppError::msg(format!("documents.entries: {e}")))?;
        let mut docs: Vec<Document> = entries.map(|(_, v)| v).collect();
        docs.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        Ok(docs)
    }

    pub fn list_tags_by_document(&self, document_id: String) -> app::Result<Vec<Tag>> {
        let entries = self
            .tags
            .entries()
            .map_err(|e| AppError::msg(format!("tags.entries: {e}")))?;
        Ok(entries
            .filter(|(_, t)| t.document_id == document_id)
            .map(|(_, t)| t)
            .collect())
    }

    pub fn list_documents_by_tag(&self, label: String) -> app::Result<Vec<Document>> {
        let tag_entries = self
            .tags
            .entries()
            .map_err(|e| AppError::msg(format!("tags.entries: {e}")))?;
        let doc_ids: std::collections::HashSet<String> = tag_entries
            .filter(|(_, t)| t.label == label)
            .map(|(_, t)| t.document_id)
            .collect();

        let doc_entries = self
            .documents
            .entries()
            .map_err(|e| AppError::msg(format!("documents.entries: {e}")))?;
        let mut docs: Vec<Document> = doc_entries
            .filter(|(id, _)| doc_ids.contains(id.as_str()))
            .map(|(_, d)| d)
            .collect();
        docs.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        Ok(docs)
    }

    pub fn list_links(&self) -> app::Result<Vec<Link>> {
        let entries = self
            .links
            .entries()
            .map_err(|e| AppError::msg(format!("links.entries: {e}")))?;
        let mut links: Vec<Link> = entries.map(|(_, v)| v).collect();
        links.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        Ok(links)
    }
}
