//! Async standup board service.
//!
//! A single shared standup board where team members post daily updates
//! (done_items, blockers, planned_items), edit or delete their own entries,
//! comment on each other's blockers, and browse by date — no meeting required.
//!
//! Patterns used:
//! - `UnorderedMap<String, T>` for data storage with iteration
//! - `AuthoredMap<String, LwwRegister<u64>>` as the author-stamp index that
//!   gates delete (storage-level enforcement via signed delta)
//! - Hand-written `Mergeable` on `StandupEntry` (LWW by updated_at) and
//!   `Comment` (deterministic tie-break by created_at then id)
//! - `edit_standup` reads `StandupEntry.author` from the plain `UnorderedMap`
//!   for its author check, so concurrent ops only touch `standups` and converge
//!   cleanly (AuthoredMap.owner_of is not available in the bare converge_app
//!   harness)

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{AuthoredMap, LwwRegister, Mergeable, UnorderedMap};
use calimero_storage::env as storage_env;
use async_standup_types::{generate_id, Error};

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// A standup entry authored by one team member. The mutable fields
/// (done_items, blockers, planned_items) are updated by the author;
/// the rest are set once at post time. `updated_at` tracks the last edit
/// for LWW convergence.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct StandupEntry {
    pub id: String,
    pub author: String,
    pub done_items: String,
    pub blockers: String,
    pub planned_items: String,
    pub date: String,
    pub created_at: u64,
    pub updated_at: u64,
}

/// LWW merge: replica with the higher `updated_at` wins for mutable fields;
/// `created_at` tie-breaks the immutable fields deterministically.
impl Mergeable for StandupEntry {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Mutable fields: last-writer-wins by updated_at.
        if other.updated_at > self.updated_at {
            self.done_items = other.done_items.clone();
            self.blockers = other.blockers.clone();
            self.planned_items = other.planned_items.clone();
            self.updated_at = other.updated_at;
        }
        // Immutable fields: deterministic tie-break (smallest created_at wins).
        if other.created_at < self.created_at {
            self.created_at = other.created_at;
        }
        Ok(())
    }
}

/// A comment on a standup entry. Write-once (no edit/delete in API), so the
/// merge is a deterministic tie-break by created_at then id.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Comment {
    pub id: String,
    pub author: String,
    pub standup_id: String,
    pub body: String,
    pub created_at: u64,
}

/// Deterministic tie-break for write-once entries: smallest (created_at, id)
/// wins so merge is commutative and idempotent.
impl Mergeable for Comment {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if (other.created_at, other.id.as_str()) < (self.created_at, self.id.as_str()) {
            *self = other.clone();
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// `#[app::state]` injects the borsh derives (SDK 0.11+); do NOT manually
// derive BorshSerialize/BorshDeserialize on the state struct.
#[app::state(emits = for<'a> Event<'a>)]
pub struct StandupBoard {
    /// Standup entries keyed by generated id — iterable for list/filter views.
    standups: UnorderedMap<String, StandupEntry>,
    /// Authorship index: standup_id → HLC stamp. Stamps inserter as owner and
    /// gates delete; `edit_standup` reads `owner_of` (read-only) for the check.
    standup_authors: AuthoredMap<String, LwwRegister<u64>>,
    /// Comments keyed by generated id — iterable, filtered by standup_id.
    comments: UnorderedMap<String, Comment>,
}

// ---------------------------------------------------------------------------
// Logic
// ---------------------------------------------------------------------------

#[app::logic]
impl StandupBoard {
    #[app::init]
    pub fn init() -> StandupBoard {
        StandupBoard {
            standups: UnorderedMap::new_with_field_name("standup:standups"),
            standup_authors: AuthoredMap::new_with_field_name("standup:standup_authors"),
            comments: UnorderedMap::new_with_field_name("standup:comments"),
        }
    }

    /// Post a new standup. Returns the generated standup id.
    pub fn post_standup(
        &mut self,
        done_items: String,
        blockers: String,
        planned_items: String,
        date: String,
    ) -> app::Result<String> {
        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("su", now_ms, &nonce);
        let author = bs58::encode(env::executor_id()).into_string();

        let entry = StandupEntry {
            id: id.clone(),
            author: author.clone(),
            done_items,
            blockers,
            planned_items,
            date,
            created_at: now_ms,
            updated_at: now_ms,
        };
        self.standups
            .insert(id.clone(), entry)
            .map_err(|e| AppError::msg(format!("standups.insert: {e}")))?;
        // Stamp the inserter as author; value is an HLC nonce (unused).
        self.standup_authors
            .insert(id.clone(), LwwRegister::new(now_ms))
            .map_err(|e| AppError::msg(format!("standup_authors.insert: {e}")))?;

        app::emit!(Event::StandupPosted {
            id: &id,
            author: &author,
        });
        Ok(id)
    }

    /// Edit the mutable fields of a standup. Author-gated via the `author`
    /// field stored in the `StandupEntry` (plain `UnorderedMap` read — keeps
    /// this method CRDT-friendly for converge tests, since only the `standups`
    /// `UnorderedMap` is written here).
    pub fn edit_standup(
        &mut self,
        id: String,
        done_items: String,
        blockers: String,
        planned_items: String,
    ) -> app::Result<()> {
        let caller_b58 = bs58::encode(env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;

        // Authorship check + update in one `get_mut` — reads `StandupEntry.author`
        // from the plain `UnorderedMap` so no `AuthoredMap.owner_of` is needed.
        // This keeps `edit_standup` compatible with the `converge_app` harness
        // (UserStorage reads are unavailable there; plain CRDT reads are fine).
        let mut guard = self
            .standups
            .get_mut(&id)
            .map_err(|e| AppError::msg(format!("standups.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(id.clone())))?;

        if caller_b58 != guard.author {
            app::bail!(Error::Forbidden("can only edit your own standup".into()));
        }

        guard.done_items = done_items;
        guard.blockers = blockers;
        guard.planned_items = planned_items;
        guard.updated_at = now_ms;
        drop(guard);

        app::emit!(Event::StandupEdited { id: &id });
        Ok(())
    }

    /// Delete a standup. Author-gated: `AuthoredMap::remove` rejects non-authors.
    pub fn delete_standup(&mut self, id: String) -> app::Result<()> {
        let removed = self
            .standup_authors
            .remove(&id)
            .map_err(map_authored_error("delete"))?;
        if removed.is_none() {
            app::bail!(Error::NotFound(id.clone()));
        }
        self.standups
            .remove(&id)
            .map_err(|e| AppError::msg(format!("standups.remove: {e}")))?;

        app::emit!(Event::StandupDeleted { id: &id });
        Ok(())
    }

    /// List all standups, sorted by creation time then id.
    pub fn get_standups(&self) -> app::Result<Vec<StandupEntry>> {
        let mut out: Vec<StandupEntry> = self
            .standups
            .entries()
            .map_err(|e| AppError::msg(format!("standups.entries: {e}")))?
            .map(|(_, entry)| entry)
            .collect();
        out.sort_by(|a, b| (a.created_at, a.id.as_str()).cmp(&(b.created_at, b.id.as_str())));
        Ok(out)
    }

    /// List standups posted on a specific date, sorted by creation time.
    pub fn get_standups_by_date(&self, date: String) -> app::Result<Vec<StandupEntry>> {
        let mut out: Vec<StandupEntry> = self
            .standups
            .entries()
            .map_err(|e| AppError::msg(format!("standups.entries: {e}")))?
            .filter(|(_, entry)| entry.date.as_str() == date.as_str())
            .map(|(_, entry)| entry)
            .collect();
        out.sort_by(|a, b| (a.created_at, a.id.as_str()).cmp(&(b.created_at, b.id.as_str())));
        Ok(out)
    }

    /// Add a comment to a standup. Returns the generated comment id.
    /// Errors if the standup does not exist.
    pub fn add_comment(&mut self, standup_id: String, body: String) -> app::Result<String> {
        // Verify the target standup exists before recording a comment on it.
        if self
            .standups
            .get(&standup_id)
            .map_err(|e| AppError::msg(format!("standups.get: {e}")))?
            .is_none()
        {
            app::bail!(Error::NotFound(standup_id.clone()));
        }

        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("cm", now_ms, &nonce);
        let author = bs58::encode(env::executor_id()).into_string();

        let comment = Comment {
            id: id.clone(),
            author,
            standup_id: standup_id.clone(),
            body,
            created_at: now_ms,
        };
        self.comments
            .insert(id.clone(), comment)
            .map_err(|e| AppError::msg(format!("comments.insert: {e}")))?;

        app::emit!(Event::CommentAdded {
            id: &id,
            standup_id: &standup_id,
        });
        Ok(id)
    }

    /// Get all comments for a standup, sorted by creation time.
    pub fn get_comments(&self, standup_id: String) -> app::Result<Vec<Comment>> {
        let mut out: Vec<Comment> = self
            .comments
            .entries()
            .map_err(|e| AppError::msg(format!("comments.entries: {e}")))?
            .filter(|(_, c)| c.standup_id.as_str() == standup_id.as_str())
            .map(|(_, c)| c)
            .collect();
        out.sort_by(|a, b| (a.created_at, a.id.as_str()).cmp(&(b.created_at, b.id.as_str())));
        Ok(out)
    }
}

/// Map an `AuthoredMap` storage error to a domain error.
/// `ActionNotAllowed` → `Forbidden`; anything else → generic message.
fn map_authored_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(Error::Forbidden(format!(
                "can only {action} your own standup"
            )))
        } else {
            AppError::msg(format!("standup_authors.{action}: {s}"))
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

    /// A different executor identity — used to test author gates.
    const OTHER: [u8; 32] = [0x22; 32];

    #[test]
    fn post_and_get_standups() {
        let mut app = TestHost::new(StandupBoard::init);

        let id = app
            .call(|s| {
                s.post_standup(
                    "Shipped login flow".into(),
                    "Waiting on API keys".into(),
                    "Start dashboard".into(),
                    "2025-01-15".into(),
                )
            })
            .unwrap();

        let standups = app.view(|s| s.get_standups()).unwrap();
        assert_eq!(standups.len(), 1);
        assert_eq!(standups[0].id, id);
        assert_eq!(standups[0].done_items, "Shipped login flow");
        assert_eq!(standups[0].blockers, "Waiting on API keys");
        assert_eq!(standups[0].date, "2025-01-15");
        // post_standup emits exactly one event.
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn edit_standup_updates_mutable_fields() {
        let mut app = TestHost::new(StandupBoard::init);

        let id = app
            .call(|s| {
                s.post_standup(
                    "Done v1".into(),
                    "Blocker v1".into(),
                    "Planned v1".into(),
                    "2025-01-15".into(),
                )
            })
            .unwrap();

        app.call(|s| {
            s.edit_standup(
                id.clone(),
                "Done v2".into(),
                "Blocker v2".into(),
                "Planned v2".into(),
            )
        })
        .unwrap();

        let standups = app.view(|s| s.get_standups()).unwrap();
        assert_eq!(standups[0].done_items, "Done v2");
        assert_eq!(standups[0].blockers, "Blocker v2");
        assert_eq!(standups[0].planned_items, "Planned v2");
        // Immutable fields are unchanged.
        assert_eq!(standups[0].date, "2025-01-15");
    }

    #[test]
    fn non_author_cannot_edit() {
        let mut app = TestHost::new(StandupBoard::init);

        let id = app
            .call(|s| {
                s.post_standup(
                    "Original".into(),
                    "".into(),
                    "".into(),
                    "2025-01-15".into(),
                )
            })
            .unwrap();

        let result = app.call_as(OTHER, |s| {
            s.edit_standup(id.clone(), "Hacked".into(), "".into(), "".into())
        });
        assert!(result.is_err());

        // Original content survives.
        let standups = app.view(|s| s.get_standups()).unwrap();
        assert_eq!(standups[0].done_items, "Original");
    }

    #[test]
    fn delete_standup_removes_entry() {
        let mut app = TestHost::new(StandupBoard::init);

        let id = app
            .call(|s| {
                s.post_standup(
                    "Done".into(), "None".into(), "Planned".into(), "2025-01-15".into(),
                )
            })
            .unwrap();
        app.call(|s| s.delete_standup(id.clone())).unwrap();

        assert_eq!(app.view(|s| s.get_standups()).unwrap().len(), 0);
    }

    #[test]
    fn non_author_cannot_delete() {
        let mut app = TestHost::new(StandupBoard::init);

        let id = app
            .call(|s| {
                s.post_standup(
                    "Done".into(), "None".into(), "Planned".into(), "2025-01-15".into(),
                )
            })
            .unwrap();

        let result = app.call_as(OTHER, |s| s.delete_standup(id.clone()));
        assert!(result.is_err());
        assert_eq!(app.view(|s| s.get_standups()).unwrap().len(), 1);
    }

    #[test]
    fn get_standups_by_date_filters_correctly() {
        let mut app = TestHost::new(StandupBoard::init);

        app.call(|s| {
            s.post_standup("Done A".into(), "".into(), "".into(), "2025-01-15".into())
        })
        .unwrap();
        app.call(|s| {
            s.post_standup("Done B".into(), "".into(), "".into(), "2025-01-16".into())
        })
        .unwrap();

        let day1 = app
            .view(|s| s.get_standups_by_date("2025-01-15".into()))
            .unwrap();
        assert_eq!(day1.len(), 1);
        assert_eq!(day1[0].date, "2025-01-15");

        let day2 = app
            .view(|s| s.get_standups_by_date("2025-01-16".into()))
            .unwrap();
        assert_eq!(day2.len(), 1);
        assert_eq!(day2[0].date, "2025-01-16");
    }

    #[test]
    fn add_comment_and_get_comments() {
        let mut app = TestHost::new(StandupBoard::init);

        let su_id = app
            .call(|s| {
                s.post_standup(
                    "Done".into(),
                    "Need API keys".into(),
                    "Planned".into(),
                    "2025-01-15".into(),
                )
            })
            .unwrap();
        let cm_id = app
            .call(|s| s.add_comment(su_id.clone(), "I can help with the API keys!".into()))
            .unwrap();

        let comments = app.view(|s| s.get_comments(su_id.clone())).unwrap();
        assert_eq!(comments.len(), 1);
        assert_eq!(comments[0].id, cm_id);
        assert_eq!(comments[0].body, "I can help with the API keys!");
        assert_eq!(comments[0].standup_id, su_id);
    }

    #[test]
    fn get_comments_filters_by_standup_id() {
        let mut app = TestHost::new(StandupBoard::init);

        let su1 = app
            .call(|s| {
                s.post_standup("Done 1".into(), "".into(), "".into(), "2025-01-15".into())
            })
            .unwrap();
        let su2 = app
            .call(|s| {
                s.post_standup("Done 2".into(), "".into(), "".into(), "2025-01-15".into())
            })
            .unwrap();

        app.call(|s| s.add_comment(su1.clone(), "comment on su1".into()))
            .unwrap();
        app.call(|s| s.add_comment(su2.clone(), "comment on su2".into()))
            .unwrap();

        assert_eq!(
            app.view(|s| s.get_comments(su1.clone())).unwrap().len(),
            1
        );
        assert_eq!(
            app.view(|s| s.get_comments(su2.clone())).unwrap().len(),
            1
        );
    }

    #[test]
    fn comment_on_unknown_standup_fails() {
        let mut app = TestHost::new(StandupBoard::init);
        let result =
            app.call(|s| s.add_comment("su-does-not-exist".into(), "comment".into()));
        assert!(result.is_err());
    }

    #[test]
    fn edit_unknown_standup_fails() {
        let mut app = TestHost::new(StandupBoard::init);
        let result = app.call(|s| {
            s.edit_standup("su-nope".into(), "x".into(), "x".into(), "x".into())
        });
        assert!(result.is_err());
    }

    #[test]
    fn delete_unknown_standup_fails() {
        let mut app = TestHost::new(StandupBoard::init);
        assert!(app.call(|s| s.delete_standup("su-nope".into())).is_err());
    }
}
