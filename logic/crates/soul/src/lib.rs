//! Soul service — authored memory notes with tags for personal and shared contexts.

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::AuthoredMap;
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct MemoryItem {
    pub id: String,
    pub text: String,
    pub tags: Vec<String>,
    pub author: String,
    pub created_at: u64,
    pub updated_at: u64,
}

// ---------------------------------------------------------------------------
// Soul state
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct SoulState {
    /// Per-author memory notes; `AuthoredMap` enforces that only the original
    /// author can edit or remove their own entries at merge time.
    memories: AuthoredMap<String, MemoryItem>,
}

#[app::logic]
impl SoulState {
    #[app::init]
    pub fn init() -> SoulState {
        SoulState {
            memories: AuthoredMap::new_with_field_name("soul:memories"),
        }
    }

    // ---- Mutates ----

    /// Create a new memory note with the given text and tags.
    /// Returns the generated note ID.
    pub fn add_memory(&mut self, text: String, tags: Vec<String>) -> app::Result<String> {
        let author = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        // Use nanosecond timestamp for unique IDs, ms for stored timestamps.
        let ts_ns = storage_env::time_now();
        let now_ms = ts_ns / 1_000_000;
        let id = format!("mem-{ts_ns}");

        let item = MemoryItem {
            id: id.clone(),
            text,
            tags,
            author,
            created_at: now_ms,
            updated_at: now_ms,
        };

        self.memories
            .insert(id.clone(), item)
            .map_err(|e| AppError::msg(format!("memories.insert: {e}")))?;

        app::emit!(Event::MemoryAdded { id: &id });
        Ok(id)
    }

    /// Update the text and tags of an existing memory note.
    /// Only the original author may call this; the storage layer enforces it.
    pub fn update_memory(
        &mut self,
        id: String,
        text: String,
        tags: Vec<String>,
    ) -> app::Result<()> {
        let existing = self
            .memories
            .get(&id)
            .map_err(|e| AppError::msg(format!("memories.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("not found: {id}")))?;

        let now_ms = storage_env::time_now() / 1_000_000;
        let updated = MemoryItem {
            id: existing.id,
            text,
            tags,
            author: existing.author,
            created_at: existing.created_at,
            updated_at: now_ms,
        };

        self.memories
            .update(&id, updated)
            .map_err(|e| AppError::msg(format!("memories.update: {e}")))?;

        app::emit!(Event::MemoryUpdated { id: &id });
        Ok(())
    }

    /// Delete a memory note by ID.
    /// Only the original author may call this; the storage layer enforces it.
    pub fn delete_memory(&mut self, id: String) -> app::Result<()> {
        let exists = self
            .memories
            .contains(&id)
            .map_err(|e| AppError::msg(format!("memories.contains: {e}")))?;
        if !exists {
            return Err(AppError::msg(format!("not found: {id}")));
        }

        self.memories
            .remove(&id)
            .map_err(|e| AppError::msg(format!("memories.remove: {e}")))?;

        app::emit!(Event::MemoryDeleted { id: &id });
        Ok(())
    }

    // ---- Views ----

    /// Return all memory notes in this context.
    pub fn list_memories(&self) -> app::Result<Vec<MemoryItem>> {
        let entries = self
            .memories
            .entries()
            .map_err(|e| AppError::msg(format!("memories.entries: {e}")))?;
        Ok(entries.map(|(_, v)| v).collect())
    }

    /// Return all memory notes that contain ALL of the requested tags.
    /// An empty `tags` argument returns all notes (same as `list_memories`).
    pub fn query_by_tags(&self, tags: Vec<String>) -> app::Result<Vec<MemoryItem>> {
        if tags.is_empty() {
            return self.list_memories();
        }
        let entries = self
            .memories
            .entries()
            .map_err(|e| AppError::msg(format!("memories.entries: {e}")))?;
        let results = entries
            .map(|(_, v)| v)
            .filter(|item| tags.iter().all(|t| item.tags.contains(t)))
            .collect();
        Ok(results)
    }
}
