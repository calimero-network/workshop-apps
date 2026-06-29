//! Kudos-board service — shared feed where team members post and view appreciation notes.
//!
//! Each kudos is authored: only the poster can delete their own note.
//! `AuthoredMap` enforces this structurally — no manual ownership check needed.

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{AuthoredMap, Mergeable};
use calimero_storage::env as storage_env;
use team_kudos_types::{generate_id, Error};

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

/// A single appreciation note. All fields are set at post time and never change,
/// so we store a plain struct — no nested CRDT needed with `AuthoredMap`.
///
/// Both Borsh (for CRDT storage/replication) and Serde (for ABI return types)
/// are derived: all fields are plain scalars so both compose cleanly.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Kudos {
    pub id: String,
    pub author: String,
    pub recipient: String,
    pub message: String,
    /// Milliseconds since Unix epoch (storage_env::time_now() / 1_000_000).
    pub created_at: u64,
}

// AuthoredMap requires V: Mergeable at the type level. Kudos are immutable
// after creation, so merge keeps whichever replica has the higher created_at
// timestamp. In practice AuthoredMap never calls this at runtime.
// ponytail: formal bound only — merge is unreachable in the normal AuthoredMap flow.
impl Mergeable for Kudos {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if other.created_at > self.created_at {
            *self = other.clone();
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
pub struct KudosBoardState {
    /// Author-gated map: only the posting member may delete their entry.
    kudos: AuthoredMap<String, Kudos>,
}

#[app::logic]
impl KudosBoardState {
    #[app::init]
    pub fn init() -> KudosBoardState {
        KudosBoardState {
            kudos: AuthoredMap::new_with_field_name("kudos-board:kudos"),
        }
    }

    /// Post an appreciation note. Returns the new kudos id.
    pub fn post_kudos(&mut self, recipient: String, message: String) -> app::Result<String> {
        let now_ns = storage_env::time_now();
        let now_ms = now_ns / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("kudos", now_ns, &nonce);
        let author = bs58::encode(env::executor_id()).into_string();

        let entry = Kudos {
            id: id.clone(),
            author,
            recipient,
            message,
            created_at: now_ms,
        };
        self.kudos
            .insert(id.clone(), entry)
            .map_err(|e| AppError::msg(format!("kudos.insert: {e}")))?;

        app::emit!(Event::KudosPosted { id: &id });
        Ok(id)
    }

    /// Return all kudos, newest first.
    pub fn get_feed(&self) -> app::Result<Vec<Kudos>> {
        let mut feed: Vec<Kudos> = self
            .kudos
            .entries()
            .map_err(|e| AppError::msg(format!("kudos.entries: {e}")))?
            .map(|(_, k)| k)
            .collect();
        // Newest first; tie-break by id for a stable, deterministic order.
        feed.sort_by(|a, b| b.created_at.cmp(&a.created_at).then_with(|| b.id.cmp(&a.id)));
        Ok(feed)
    }

    /// Delete a kudos. Author-gated: `AuthoredMap::remove` rejects non-authors.
    pub fn delete_kudos(&mut self, id: String) -> app::Result<()> {
        let removed = self
            .kudos
            .remove(&id)
            .map_err(map_author_error())?;
        if removed.is_none() {
            app::bail!(Error::NotFound(id));
        }
        app::emit!(Event::KudosDeleted { id: &id });
        Ok(())
    }
}

/// Translate `AuthoredMap`'s access-control error into a friendly `Forbidden`.
fn map_author_error() -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(Error::Forbidden("only the author may delete their kudos".into()))
        } else {
            AppError::msg(format!("kudos.remove: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// In-process tests — one TestHost roundtrip per mutation.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use calimero_sdk::testing::TestHost;

    use super::*;

    #[test]
    fn post_and_get_feed() {
        let mut app = TestHost::new(KudosBoardState::init);

        let id = app
            .call(|s| s.post_kudos("Sarah".into(), "Crushed the Q4 planning!".into()))
            .unwrap();
        let feed = app.view(|s| s.get_feed()).unwrap();
        assert_eq!(feed.len(), 1);
        assert_eq!(feed[0].id, id);
        assert_eq!(feed[0].recipient, "Sarah");
        assert_eq!(feed[0].message, "Crushed the Q4 planning!");
        // post_kudos emits exactly one KudosPosted event.
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn feed_is_newest_first() {
        let mut app = TestHost::new(KudosBoardState::init);

        let id1 = app
            .call(|s| s.post_kudos("Alice".into(), "First".into()))
            .unwrap();
        let id2 = app
            .call(|s| s.post_kudos("Bob".into(), "Second".into()))
            .unwrap();
        let feed = app.view(|s| s.get_feed()).unwrap();
        assert_eq!(feed.len(), 2);
        // Newest post (id2) must appear before the older one (id1).
        assert!(feed.iter().position(|k| k.id == id2) < feed.iter().position(|k| k.id == id1));
    }

    #[test]
    fn owner_can_delete() {
        let mut app = TestHost::new(KudosBoardState::init);

        let id = app
            .call(|s| s.post_kudos("Sarah".into(), "Great work!".into()))
            .unwrap();
        app.call(|s| s.delete_kudos(id.clone())).unwrap();
        assert_eq!(app.view(|s| s.get_feed()).unwrap().len(), 0);
    }

    #[test]
    fn non_owner_cannot_delete() {
        let mut app = TestHost::new(KudosBoardState::init);

        let id = app
            .call(|s| s.post_kudos("Sarah".into(), "Great work!".into()))
            .unwrap();

        // A different executor must be rejected — AuthoredMap enforces authorship.
        let other = [9u8; 32];
        assert!(app
            .call_as(other, |s| s.delete_kudos(id.clone()))
            .is_err());
        // The kudos must survive the rejected delete.
        assert_eq!(app.view(|s| s.get_feed()).unwrap().len(), 1);
    }

    #[test]
    fn delete_unknown_id_errors() {
        let mut app = TestHost::new(KudosBoardState::init);
        assert!(app.call(|s| s.delete_kudos("nope".into())).is_err());
    }
}
