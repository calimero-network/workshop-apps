//! Knowledge-graph service — documents, tags, and cross-reference links.
//!
//! # Why UnorderedMap instead of AuthoredMap for documents/links
//!
//! AuthoredMap with generated string keys (non-pubkey) and struct values fails
//! to converge across nodes: the storage-layer author enforcement rejects the
//! CRDT sync merge on remote nodes (SDK issue #3). The fix is UnorderedMap +
//! Mergeable + manual caller == doc.author checks in mutating methods.

use chat_types::{generate_id, ChatError};
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{Mergeable, UnorderedMap};
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
    /// Millisecond timestamp of the last edit; equals created_at on first insert.
    /// Used by Mergeable to pick the latest version on concurrent edit conflict.
    pub updated_at: u64,
}

impl Mergeable for Document {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Last-write-wins by updated_at — whichever edit happened later wins.
        // created_at is immutable; keep the minimum to preserve the original.
        if other.updated_at > self.updated_at {
            self.title = other.title.clone();
            self.content = other.content.clone();
            self.updated_at = other.updated_at;
        }
        if other.created_at < self.created_at {
            self.created_at = other.created_at;
        }
        Ok(())
    }
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

impl Mergeable for Link {
    fn merge(&mut self, _other: &Self) -> Result<(), MergeError> {
        // Links are immutable after creation; keep self on concurrent conflict.
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct KnowledgeGraphState {
    documents: UnorderedMap<String, Document>,
    tags: UnorderedMap<String, Tag>,
    links: UnorderedMap<String, Link>,
}

#[app::logic]
impl KnowledgeGraphState {
    #[app::init]
    pub fn init() -> KnowledgeGraphState {
        KnowledgeGraphState {
            documents: UnorderedMap::new_with_field_name("kg:documents"),
            tags: UnorderedMap::new_with_field_name("kg:tags"),
            links: UnorderedMap::new_with_field_name("kg:links"),
        }
    }

    /// Generate a deterministic unique ID using the SDK-recommended pattern:
    /// tx-embedded timestamp (deterministic on all replicas during replay)
    /// combined with WASM-host VRF bytes (also deterministic per tx).
    fn make_id(prefix: &str) -> String {
        let now = storage_env::time_now();
        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        generate_id(prefix, now, &nonce)
    }

    // ---- Mutating methods ----

    pub fn create_document(&mut self, title: String, content: String) -> app::Result<String> {
        let author = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;
        let id = Self::make_id("doc");
        let doc = Document {
            id: id.clone(),
            title,
            content,
            author,
            created_at: now_ms,
            updated_at: now_ms,
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

        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        if existing.author != caller {
            return Err(AppError::from(ChatError::Forbidden(
                "can only edit your own document".into(),
            )));
        }

        let now_ms = storage_env::time_now() / 1_000_000;
        let updated = Document {
            id: document_id.clone(),
            title: new_title,
            content: new_content,
            author: existing.author.clone(),
            created_at: existing.created_at,
            // Bump updated_at so Mergeable LWW picks this version on conflict.
            updated_at: now_ms,
        };

        // Direct insert triggers Mergeable::merge when the key already exists.
        // updated_at is higher than the stored value, so the LWW Mergeable picks
        // this version. Avoids a tombstone that could shadow concurrent replicas.
        self.documents
            .insert(document_id.clone(), updated)
            .map_err(|e| AppError::msg(format!("documents.insert: {e}")))?;

        app::emit!(Event::DocumentEdited { id: &document_id });
        Ok(())
    }

    pub fn add_tag(&mut self, document_id: String, label: String) -> app::Result<String> {
        let added_by = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let id = Self::make_id("tag");
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
        let id = Self::make_id("link");
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
        let link = self
            .links
            .get(&link_id)
            .map_err(|e| AppError::msg(format!("links.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(link_id.clone())))?;

        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        if link.author != caller {
            return Err(AppError::from(ChatError::Forbidden(
                "can only delete your own link".into(),
            )));
        }

        self.links
            .remove(&link_id)
            .map_err(|e| AppError::msg(format!("links.remove: {e}")))?;
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
