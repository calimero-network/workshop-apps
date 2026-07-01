//! Vector knowledge base service.
//!
//! Shared store for text chunks with embedding vectors. Provides cosine-similarity
//! search, tag management, and named collections. Key patterns:
//!
//! - `entries: UnorderedMap<String, KnowledgeEntryData>` — CRDT map for the
//!   entry data; tags and collection_id are `LwwRegister` fields that converge
//!   on concurrent edits. A hand-written `Mergeable` + `RekeyTarget` on
//!   `KnowledgeEntryData` handles the nested-register re-keying (#2577).
//! - `entry_owners: AuthoredMap<String, LwwRegister<u64>>` — authorship index
//!   that structurally owner-gates `update_entry_tags` and `remove_entry`.
//! - `collections: UnorderedMap<String, CollectionData>` — shared, open-access
//!   named collections; plain `Mergeable` tie-breaks concurrent creates by age.
//! - Cosine similarity search is a pure-Rust O(n) full scan on `&self`.

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::address::Id;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::rekey::{field_child_id, RekeyTarget};
use calimero_storage::collections::{AuthoredMap, LwwRegister, Mergeable, UnorderedMap};
use calimero_storage::env as storage_env;
use vector_knowledge_base_types::{generate_id, Error};

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Cosine similarity (pure computation, no host calls)
// ---------------------------------------------------------------------------

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot / (norm_a * norm_b)
}

// ---------------------------------------------------------------------------
// Internal storage structs (Borsh-only; mutable fields use LwwRegister)
// ---------------------------------------------------------------------------

/// Internal representation of a knowledge entry stored in `UnorderedMap`.
/// Immutable fields (id, author, text, embedding, dimension, created_at) are
/// plain types — they're set once and the `Mergeable` impl tie-breaks them
/// deterministically. Mutable fields (tags, collection_id) are `LwwRegister`
/// so concurrent edits converge by HLC last-writer-wins.
///
/// Does NOT derive serde — callers get the `KnowledgeEntry` view instead.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct KnowledgeEntryData {
    pub id: String,
    pub author: String,
    pub text: String,
    pub embedding: Vec<f32>,
    pub dimension: u32,
    pub tags: LwwRegister<Vec<String>>,
    pub collection_id: LwwRegister<Option<String>>,
    pub created_at: u64,
}

/// Merge concurrent inserts deterministically (keep the older entry; tie-break
/// by id). The nested `LwwRegister` fields delegate to their own HLC merge so
/// concurrent tag/collection updates converge correctly.
impl Mergeable for KnowledgeEntryData {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Deterministic tie-break for immutable fields
        if (other.created_at, &other.id) < (self.created_at, &self.id) {
            self.id = other.id.clone();
            self.author = other.author.clone();
            self.text = other.text.clone();
            self.embedding = other.embedding.clone();
            self.dimension = other.dimension;
            self.created_at = other.created_at;
        }
        // Mutable CRDT fields converge via LwwRegister HLC merge
        self.tags.merge(&other.tags);
        self.collection_id.merge(&other.collection_id);
        Ok(())
    }
}

/// Required because `KnowledgeEntryData` nests `LwwRegister` fields (#2577).
/// Without deterministic re-keying the nested registers are LWW'd as opaque
/// blobs; with it every replica derives the same child id and they converge.
impl RekeyTarget for KnowledgeEntryData {
    fn rekey_relative_to(&mut self, parent_id: Id) {
        calimero_storage::rekey_field_if_supported!(
            &mut self.tags,
            field_child_id(parent_id, "tags")
        );
        calimero_storage::rekey_field_if_supported!(
            &mut self.collection_id,
            field_child_id(parent_id, "collection_id")
        );
    }
}

/// Internal representation of a named collection.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct CollectionData {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: u64,
}

/// Concurrent creates of the same logical collection: keep the older one
/// (lower `created_at`); tie-break by id for full determinism.
impl Mergeable for CollectionData {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if (other.created_at, &other.id) < (self.created_at, &self.id) {
            *self = other.clone();
        }
        Ok(())
    }
}

/// No nested CRDTs in `CollectionData` — re-keying is a no-op.
impl RekeyTarget for CollectionData {
    fn rekey_relative_to(&mut self, _parent_id: Id) {}
}

// ---------------------------------------------------------------------------
// API-visible types (serde — returned to callers / ABI clients)
// ---------------------------------------------------------------------------

/// A knowledge entry as returned to callers via ABI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct KnowledgeEntry {
    pub id: String,
    pub author: String,
    pub text: String,
    pub embedding: Vec<f32>,
    pub dimension: u32,
    pub tags: Vec<String>,
    pub collection_id: Option<String>,
    pub created_at: u64,
}

/// A named collection as returned to callers via ABI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: u64,
}

/// A single result from `search_similar`, ranked by cosine similarity score.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct SearchResult {
    pub entry_id: String,
    pub score: f32,
    pub text: String,
    pub tags: Vec<String>,
    pub author: String,
}

/// Aggregate statistics for the knowledge store.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct StoreStats {
    pub total_entries: u64,
    pub total_collections: u64,
    pub dimension: u32,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// `#[app::state]` injects the borsh derives (SDK 0.11+); manual derives collide.
#[app::state(emits = for<'a> Event<'a>)]
pub struct VectorStore {
    /// Knowledge entries keyed by generated entry id.
    entries: UnorderedMap<String, KnowledgeEntryData>,
    /// Authorship index: entry_id → creator stamp. Author-gates `update_entry_tags`
    /// and `remove_entry` — only the creator (or the converge-seeded identity) may
    /// mutate or delete their own entries.
    entry_owners: AuthoredMap<String, LwwRegister<u64>>,
    /// Named collections keyed by generated collection id.
    collections: UnorderedMap<String, CollectionData>,
}

#[app::logic]
impl VectorStore {
    #[app::init]
    pub fn init() -> VectorStore {
        VectorStore {
            entries: UnorderedMap::new_with_field_name("vs:entries"),
            entry_owners: AuthoredMap::new_with_field_name("vs:entry_owners"),
            collections: UnorderedMap::new_with_field_name("vs:collections"),
        }
    }

    /// Add a knowledge entry. Returns the generated entry id.
    /// Rejects empty text or empty embedding.
    pub fn add_entry(
        &mut self,
        text: String,
        embedding: Vec<f32>,
        tags: Vec<String>,
        collection_id: Option<String>,
    ) -> app::Result<String> {
        if text.trim().is_empty() {
            return Err(AppError::from(Error::Invalid("text must not be empty".into())));
        }
        if embedding.is_empty() {
            return Err(AppError::from(Error::Invalid(
                "embedding must not be empty".into(),
            )));
        }

        // Validate referenced collection exists
        if let Some(ref cid) = collection_id {
            let exists = self
                .collections
                .contains(cid)
                .map_err(|e| AppError::msg(format!("collections.contains: {e}")))?;
            if !exists {
                return Err(AppError::from(Error::NotFound(format!("collection {cid}"))));
            }
        }

        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("entry", now_ms, &nonce);

        let author = bs58::encode(env::executor_id()).into_string();
        let dimension = embedding.len() as u32;

        let data = KnowledgeEntryData {
            id: id.clone(),
            author: author.clone(),
            text,
            embedding,
            dimension,
            tags: LwwRegister::new(tags),
            collection_id: LwwRegister::new(collection_id),
            created_at: now_ms,
        };

        self.entries
            .insert(id.clone(), data)
            .map_err(|e| AppError::msg(format!("entries.insert: {e}")))?;
        // Stamp the adding executor as owner. Value is unused — the AuthoredMap
        // authorship stamp is what gates update and delete.
        self.entry_owners
            .insert(id.clone(), LwwRegister::new(now_ms))
            .map_err(|e| AppError::msg(format!("entry_owners.insert: {e}")))?;

        app::emit!(Event::EntryAdded {
            id: &id,
            author: &author,
        });
        Ok(id)
    }

    /// Search entries by cosine similarity to the query vector.
    /// Returns up to `top_k` results ordered by descending score.
    /// Optionally restricts the search to a single collection.
    pub fn search_similar(
        &self,
        query_vector: Vec<f32>,
        top_k: u32,
        collection_id: Option<String>,
    ) -> app::Result<Vec<SearchResult>> {
        if query_vector.is_empty() {
            return Err(AppError::from(Error::Invalid(
                "query_vector must not be empty".into(),
            )));
        }

        let col_filter = collection_id.as_deref();

        let mut scored: Vec<(f32, SearchResult)> = self
            .entries
            .entries()
            .map_err(|e| AppError::msg(format!("entries.entries: {e}")))?
            .filter_map(|(_k, data)| {
                if let Some(cid) = col_filter {
                    if data.collection_id.get().as_deref() != Some(cid) {
                        return None;
                    }
                }
                let score = cosine_similarity(&query_vector, &data.embedding);
                Some((
                    score,
                    SearchResult {
                        entry_id: data.id.clone(),
                        score,
                        text: data.text.clone(),
                        tags: data.tags.get().clone(),
                        author: data.author.clone(),
                    },
                ))
            })
            .collect();

        // Sort descending by score; treat NaN as equal (shouldn't occur in practice)
        scored.sort_by(|a, b| {
            b.0.partial_cmp(&a.0)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        scored.truncate(top_k as usize);

        Ok(scored.into_iter().map(|(_, r)| r).collect())
    }

    /// List entries, optionally filtered by collection, with offset/limit pagination.
    pub fn list_entries(
        &self,
        collection_id: Option<String>,
        offset: u32,
        limit: u32,
    ) -> app::Result<Vec<KnowledgeEntry>> {
        let col_filter = collection_id.as_deref();

        let mut all: Vec<KnowledgeEntry> = self
            .entries
            .entries()
            .map_err(|e| AppError::msg(format!("entries.entries: {e}")))?
            .filter_map(|(_k, data)| {
                if let Some(cid) = col_filter {
                    if data.collection_id.get().as_deref() != Some(cid) {
                        return None;
                    }
                }
                Some(entry_to_view(data))
            })
            .collect();

        all.sort_by(|a, b| (a.created_at, &a.id).cmp(&(b.created_at, &b.id)));
        Ok(all
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
            .collect())
    }

    /// Update an entry's tags. Author-gated: only the original creator may update.
    pub fn update_entry_tags(
        &mut self,
        entry_id: String,
        tags: Vec<String>,
    ) -> app::Result<()> {
        self.assert_author(&entry_id)?;

        let mut guard = self
            .entries
            .get_mut(&entry_id)
            .map_err(|e| AppError::msg(format!("entries.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(entry_id.clone())))?;
        guard.tags.set(tags);
        drop(guard);

        app::emit!(Event::EntryTagsUpdated { id: &entry_id });
        Ok(())
    }

    /// Remove an entry. Author-gated via `AuthoredMap::remove`.
    /// Non-authors receive `Forbidden`.
    pub fn remove_entry(&mut self, entry_id: String) -> app::Result<()> {
        let removed = self
            .entry_owners
            .remove(&entry_id)
            .map_err(map_auth_error("remove entry"))?;
        if removed.is_none() {
            return Err(AppError::from(Error::NotFound(entry_id)));
        }
        self.entries
            .remove(&entry_id)
            .map_err(|e| AppError::msg(format!("entries.remove: {e}")))?;

        app::emit!(Event::EntryRemoved { id: &entry_id });
        Ok(())
    }

    /// Create a named collection. Any member may create. Returns the generated id.
    pub fn create_collection(
        &mut self,
        name: String,
        description: String,
    ) -> app::Result<String> {
        if name.trim().is_empty() {
            return Err(AppError::from(Error::Invalid(
                "collection name must not be empty".into(),
            )));
        }

        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("col", now_ms, &nonce);

        let col = CollectionData {
            id: id.clone(),
            name: name.clone(),
            description,
            created_at: now_ms,
        };
        self.collections
            .insert(id.clone(), col)
            .map_err(|e| AppError::msg(format!("collections.insert: {e}")))?;

        app::emit!(Event::CollectionCreated {
            id: &id,
            name: &name,
        });
        Ok(id)
    }

    /// List all named collections sorted by creation time.
    pub fn list_collections(&self) -> app::Result<Vec<Collection>> {
        let mut out: Vec<Collection> = self
            .collections
            .entries()
            .map_err(|e| AppError::msg(format!("collections.entries: {e}")))?
            .map(|(_k, data)| Collection {
                id: data.id.clone(),
                name: data.name.clone(),
                description: data.description.clone(),
                created_at: data.created_at,
            })
            .collect();
        out.sort_by(|a, b| (a.created_at, &a.id).cmp(&(b.created_at, &b.id)));
        Ok(out)
    }

    /// Delete a named collection. Any member may delete.
    pub fn delete_collection(&mut self, collection_id: String) -> app::Result<()> {
        let removed = self
            .collections
            .remove(&collection_id)
            .map_err(|e| AppError::msg(format!("collections.remove: {e}")))?;
        if removed.is_none() {
            return Err(AppError::from(Error::NotFound(collection_id)));
        }
        app::emit!(Event::CollectionDeleted { id: &collection_id });
        Ok(())
    }

    /// Aggregate statistics: entry count, collection count, embedding dimension.
    pub fn get_store_stats(&self) -> app::Result<StoreStats> {
        let total_entries = self
            .entries
            .len()
            .map_err(|e| AppError::msg(format!("entries.len: {e}")))? as u64;
        let total_collections = self
            .collections
            .len()
            .map_err(|e| AppError::msg(format!("collections.len: {e}")))? as u64;
        // Dimension is taken from the first entry in the store; 0 if empty.
        let dimension = self
            .entries
            .entries()
            .map_err(|e| AppError::msg(format!("entries.entries(stats): {e}")))?
            .next()
            .map(|(_, d)| d.dimension)
            .unwrap_or(0);
        Ok(StoreStats {
            total_entries,
            total_collections,
            dimension,
        })
    }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

impl VectorStore {
    /// Verify the current executor is the author of the given entry.
    /// Returns `Forbidden` if not, `NotFound` if the entry id is unknown.
    fn assert_author(&self, entry_id: &str) -> app::Result<()> {
        let caller_b58 = bs58::encode(env::executor_id()).into_string();
        let owner_b58 = self
            .entry_owners
            .owner_of(&entry_id.to_owned())
            .map_err(|e| AppError::msg(format!("entry_owners.owner_of: {e}")))?
            .map(String::from)
            .ok_or_else(|| AppError::from(Error::NotFound(entry_id.to_string())))?;
        if caller_b58 != owner_b58 {
            return Err(AppError::from(Error::Forbidden(
                "only the author may update this entry".into(),
            )));
        }
        Ok(())
    }
}

/// Map an `AuthoredMap` error to a domain error.
/// `ActionNotAllowed` → `Forbidden`; anything else → opaque internal error.
fn map_auth_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(Error::Forbidden(format!("only the author may {action}")))
        } else {
            AppError::msg(format!("{action}: {s}"))
        }
    }
}

/// Convert internal `KnowledgeEntryData` to the API-visible `KnowledgeEntry`.
fn entry_to_view(data: KnowledgeEntryData) -> KnowledgeEntry {
    KnowledgeEntry {
        id: data.id,
        author: data.author,
        text: data.text,
        embedding: data.embedding,
        dimension: data.dimension,
        tags: data.tags.get().clone(),
        collection_id: data.collection_id.get().clone(),
        created_at: data.created_at,
    }
}

// ---------------------------------------------------------------------------
// Tests — one TestHost roundtrip per mutation, call_as for auth paths
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use calimero_sdk::testing::TestHost;

    fn emb(n: usize, val: f32) -> Vec<f32> {
        vec![val; n]
    }

    // ---- add_entry ----

    #[test]
    fn add_entry_roundtrip() {
        let mut app = TestHost::new(VectorStore::init);
        let id = app
            .call(|s| s.add_entry("hello world".into(), emb(4, 0.5), vec!["ml".into()], None))
            .unwrap();

        let entries = app.view(|s| s.list_entries(None, 0, 10)).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, id);
        assert_eq!(entries[0].text, "hello world");
        assert_eq!(entries[0].dimension, 4);
        assert_eq!(entries[0].tags, vec!["ml".to_string()]);
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn add_entry_empty_text_fails() {
        let mut app = TestHost::new(VectorStore::init);
        assert!(app
            .call(|s| s.add_entry("   ".into(), emb(4, 0.5), vec![], None))
            .is_err());
    }

    #[test]
    fn add_entry_empty_embedding_fails() {
        let mut app = TestHost::new(VectorStore::init);
        assert!(app
            .call(|s| s.add_entry("text".into(), vec![], vec![], None))
            .is_err());
    }

    #[test]
    fn add_entry_unknown_collection_fails() {
        let mut app = TestHost::new(VectorStore::init);
        assert!(app
            .call(|s| {
                s.add_entry(
                    "text".into(),
                    emb(4, 0.5),
                    vec![],
                    Some("no-such-col".into()),
                )
            })
            .is_err());
    }

    // ---- search_similar ----

    #[test]
    fn search_returns_ranked_results() {
        let mut app = TestHost::new(VectorStore::init);
        // "close": embedding aligned with query → score ≈ 1.0
        app.call(|s| s.add_entry("close".into(), vec![1.0, 0.0, 0.0, 0.0], vec![], None))
            .unwrap();
        // "ortho": orthogonal to query → score = 0.0
        app.call(|s| s.add_entry("ortho".into(), vec![0.0, 1.0, 0.0, 0.0], vec![], None))
            .unwrap();

        let results = app
            .view(|s| s.search_similar(vec![1.0, 0.0, 0.0, 0.0], 5, None))
            .unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].text, "close");
        assert!(results[0].score > 0.99);
        assert!(results[1].score < 0.01);
    }

    #[test]
    fn search_respects_top_k() {
        let mut app = TestHost::new(VectorStore::init);
        for i in 0..5 {
            app.call(|s| s.add_entry(format!("e{i}"), emb(2, i as f32), vec![], None))
                .unwrap();
        }
        let results = app.view(|s| s.search_similar(emb(2, 1.0), 2, None)).unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn search_empty_query_fails() {
        let mut app = TestHost::new(VectorStore::init);
        assert!(app.view(|s| s.search_similar(vec![], 5, None)).is_err());
    }

    // ---- update_entry_tags ----

    #[test]
    fn author_can_update_tags() {
        let mut app = TestHost::new(VectorStore::init);
        let id = app
            .call(|s| s.add_entry("text".into(), emb(3, 0.1), vec!["old".into()], None))
            .unwrap();
        app.call(|s| s.update_entry_tags(id.clone(), vec!["new".into(), "tag".into()]))
            .unwrap();

        let entries = app.view(|s| s.list_entries(None, 0, 10)).unwrap();
        assert_eq!(entries[0].tags, vec!["new".to_string(), "tag".to_string()]);
    }

    #[test]
    fn non_author_cannot_update_tags() {
        let mut app = TestHost::new(VectorStore::init);
        let id = app
            .call(|s| s.add_entry("text".into(), emb(3, 0.1), vec![], None))
            .unwrap();
        let other = [9u8; 32];
        assert!(app
            .call_as(other, |s| s.update_entry_tags(id.clone(), vec!["hacked".into()]))
            .is_err());
    }

    // ---- remove_entry ----

    #[test]
    fn author_can_remove_entry() {
        let mut app = TestHost::new(VectorStore::init);
        let id = app
            .call(|s| s.add_entry("text".into(), emb(3, 0.1), vec![], None))
            .unwrap();
        app.call(|s| s.remove_entry(id)).unwrap();
        assert_eq!(
            app.view(|s| s.list_entries(None, 0, 10)).unwrap().len(),
            0
        );
    }

    #[test]
    fn non_author_cannot_remove_entry() {
        let mut app = TestHost::new(VectorStore::init);
        let id = app
            .call(|s| s.add_entry("text".into(), emb(3, 0.1), vec![], None))
            .unwrap();
        let other = [9u8; 32];
        assert!(app.call_as(other, |s| s.remove_entry(id.clone())).is_err());
        assert_eq!(
            app.view(|s| s.list_entries(None, 0, 10)).unwrap().len(),
            1
        );
    }

    #[test]
    fn remove_unknown_entry_fails() {
        let mut app = TestHost::new(VectorStore::init);
        assert!(app.call(|s| s.remove_entry("no-such-entry".into())).is_err());
    }

    // ---- collections ----

    #[test]
    fn create_and_list_collections() {
        let mut app = TestHost::new(VectorStore::init);
        let id = app
            .call(|s| s.create_collection("NLP".into(), "Natural language processing".into()))
            .unwrap();
        let cols = app.view(|s| s.list_collections()).unwrap();
        assert_eq!(cols.len(), 1);
        assert_eq!(cols[0].id, id);
        assert_eq!(cols[0].name, "NLP");
    }

    #[test]
    fn create_collection_empty_name_fails() {
        let mut app = TestHost::new(VectorStore::init);
        assert!(app
            .call(|s| s.create_collection("   ".into(), "desc".into()))
            .is_err());
    }

    #[test]
    fn delete_collection() {
        let mut app = TestHost::new(VectorStore::init);
        let id = app
            .call(|s| s.create_collection("Test".into(), "desc".into()))
            .unwrap();
        app.call(|s| s.delete_collection(id)).unwrap();
        assert_eq!(app.view(|s| s.list_collections()).unwrap().len(), 0);
    }

    #[test]
    fn delete_unknown_collection_fails() {
        let mut app = TestHost::new(VectorStore::init);
        assert!(app
            .call(|s| s.delete_collection("no-such-col".into()))
            .is_err());
    }

    // ---- list_entries ----

    #[test]
    fn list_entries_filters_by_collection() {
        let mut app = TestHost::new(VectorStore::init);
        let col = app
            .call(|s| s.create_collection("ML".into(), "desc".into()))
            .unwrap();
        app.call(|s| {
            s.add_entry("in col".into(), emb(3, 0.5), vec![], Some(col.clone()))
        })
        .unwrap();
        app.call(|s| s.add_entry("no col".into(), emb(3, 0.5), vec![], None))
            .unwrap();

        let filtered = app
            .view(|s| s.list_entries(Some(col.clone()), 0, 10))
            .unwrap();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].text, "in col");

        let all = app.view(|s| s.list_entries(None, 0, 10)).unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn list_entries_pagination() {
        let mut app = TestHost::new(VectorStore::init);
        for i in 0..5 {
            app.call(|s| {
                s.add_entry(format!("entry {i}"), emb(2, i as f32), vec![], None)
            })
            .unwrap();
        }
        let page = app.view(|s| s.list_entries(None, 2, 2)).unwrap();
        assert_eq!(page.len(), 2);
    }

    // ---- get_store_stats ----

    #[test]
    fn get_store_stats_correct() {
        let mut app = TestHost::new(VectorStore::init);
        app.call(|s| s.add_entry("text".into(), emb(8, 0.1), vec![], None))
            .unwrap();
        app.call(|s| s.create_collection("C".into(), "desc".into()))
            .unwrap();

        let stats = app.view(|s| s.get_store_stats()).unwrap();
        assert_eq!(stats.total_entries, 1);
        assert_eq!(stats.total_collections, 1);
        assert_eq!(stats.dimension, 8);
    }

    #[test]
    fn get_store_stats_empty_store() {
        let mut app = TestHost::new(VectorStore::init);
        let stats = app.view(|s| s.get_store_stats()).unwrap();
        assert_eq!(stats.total_entries, 0);
        assert_eq!(stats.total_collections, 0);
        assert_eq!(stats.dimension, 0);
    }
}
