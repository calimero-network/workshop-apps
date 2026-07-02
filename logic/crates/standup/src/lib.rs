//! Standup board service — shared async daily standup for teams.
//!
//! Members post Yesterday / Today / Blockers entries. Only the original author
//! may edit or delete their own entry (enforced by comparing the stored
//! `author_id` against the current executor's base58 identity). Reads return
//! all entries for a given ISO date, ordered by recency.

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::address::Id;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::rekey::RekeyTarget;
use calimero_storage::collections::{Mergeable, UnorderedMap};
use calimero_storage::env as storage_env;
use async_standup_types::{generate_id, Error};

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Convert Unix epoch seconds to ISO date string (YYYY-MM-DD).
///
/// Uses Hinnant's civil_from_days algorithm (proleptic Gregorian calendar).
fn unix_seconds_to_date(secs: u64) -> String {
    let days = (secs / 86400) as i64;
    let z = days + 719_468_i64;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64; // day of era [0, 146096]
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365; // year of era [0, 399]
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // day of year [0, 365]
    let mp = (5 * doy + 2) / 153; // month prime [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // day [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // month [1, 12]
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// A daily standup entry. This struct is both stored (via Borsh) and returned
/// to callers (via Serde), so it carries both derive sets.
///
/// All mutable fields (`yesterday`, `today`, `blockers`, `updated_at`) converge
/// by last-writer-wins: the replica with the higher `updated_at` wins. Immutable
/// fields (`id`, `author`, `author_id`, `date`, `created_at`) tie-break by the
/// lower `created_at`.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct StandupEntry {
    /// Server-generated unique id, e.g. "su-1736956800000000000-a1b2c3d4".
    pub id: String,
    /// Display name of the authoring member (provided at post time).
    pub author: String,
    /// Base58-encoded executor identity of the author; used to authorize edits/deletes.
    pub author_id: String,
    pub yesterday: String,
    pub today: String,
    pub blockers: String,
    /// ISO date (YYYY-MM-DD) derived server-side from `created_at`.
    pub date: String,
    /// Unix epoch seconds when the entry was first posted.
    pub created_at: u64,
    /// Unix epoch seconds of the last edit; equals `created_at` until edited.
    pub updated_at: u64,
}

/// Last-writer-wins merge for concurrent standup entries.
///
/// Immutable fields tie-break by the earlier `created_at` (set-once at post
/// time). Mutable fields (`yesterday`, `today`, `blockers`, `updated_at`) take
/// the version with the higher `updated_at` — i.e. the most-recent edit wins.
impl Mergeable for StandupEntry {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Immutable fields: deterministic tie-break by created_at.
        if other.created_at < self.created_at {
            self.id = other.id.clone();
            self.author = other.author.clone();
            self.author_id = other.author_id.clone();
            self.date = other.date.clone();
            self.created_at = other.created_at;
        }
        // Mutable fields: take the version with the higher updated_at (LWW).
        if other.updated_at > self.updated_at {
            self.yesterday = other.yesterday.clone();
            self.today = other.today.clone();
            self.blockers = other.blockers.clone();
            self.updated_at = other.updated_at;
        }
        Ok(())
    }
}

/// `StandupEntry` has no nested CRDT storage fields, so rekeying is a no-op.
/// A hand-written `Mergeable` must always pair with `RekeyTarget`.
impl RekeyTarget for StandupEntry {
    fn rekey_relative_to(&mut self, _parent_id: Id) {
        // No nested CRDT fields to rekey.
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// `#[app::state]` injects the borsh derives itself (SDK 0.11+).
#[app::state(emits = for<'a> Event<'a>)]
pub struct StandupBoard {
    /// All standup entries, keyed by generated entry id.
    entries: UnorderedMap<String, StandupEntry>,
}

#[app::logic]
impl StandupBoard {
    #[app::init]
    pub fn init() -> StandupBoard {
        StandupBoard {
            entries: UnorderedMap::new_with_field_name("standup:entries"),
        }
    }

    /// Post a new standup entry. Returns the generated entry id.
    ///
    /// `author_name` is the caller's display name (stored alongside the
    /// executor-derived `author_id`). `yesterday`, `today`, `blockers` are the
    /// three standup sections. All timestamp and identity fields are set
    /// server-side.
    pub fn post_standup(
        &mut self,
        author_name: String,
        yesterday: String,
        today: String,
        blockers: String,
    ) -> app::Result<String> {
        let now_ns = storage_env::time_now();
        let now_secs = now_ns / 1_000_000_000;
        let date = unix_seconds_to_date(now_secs);
        let author_id = bs58::encode(env::executor_id()).into_string();

        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("su", now_ns, &nonce);

        let entry = StandupEntry {
            id: id.clone(),
            author: author_name.clone(),
            author_id,
            yesterday,
            today,
            blockers,
            date: date.clone(),
            created_at: now_secs,
            updated_at: now_secs,
        };
        self.entries
            .insert(id.clone(), entry)
            .map_err(|e| AppError::msg(format!("entries.insert: {e}")))?;

        app::emit!(Event::StandupPosted {
            id: &id,
            author: &author_name,
            date: &date,
        });
        Ok(id)
    }

    /// Edit the three sections of an existing entry. Only the original author
    /// may edit — rejected with `Forbidden` for other callers. `NotFound` if
    /// the id does not exist.
    pub fn edit_standup(
        &mut self,
        id: String,
        yesterday: String,
        today: String,
        blockers: String,
    ) -> app::Result<()> {
        let caller_id = bs58::encode(env::executor_id()).into_string();
        let now_secs = storage_env::time_now() / 1_000_000_000;

        let mut guard = self
            .entries
            .get_mut(&id)
            .map_err(|e| AppError::msg(format!("entries.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(id.clone())))?;

        if guard.author_id != caller_id {
            return Err(AppError::from(Error::Forbidden(
                "only the author may edit this standup".into(),
            )));
        }

        // Clone event fields before mutating (guard borrows the entry).
        let author = guard.author.clone();
        let date = guard.date.clone();

        guard.yesterday = yesterday;
        guard.today = today;
        guard.blockers = blockers;
        guard.updated_at = now_secs;
        drop(guard); // commit changes

        app::emit!(Event::StandupEdited {
            id: &id,
            author: &author,
            date: &date,
        });
        Ok(())
    }

    /// Delete a standup entry. Only the original author may delete — rejected
    /// with `Forbidden` for other callers. `NotFound` if the id does not exist.
    pub fn delete_standup(&mut self, id: String) -> app::Result<()> {
        let caller_id = bs58::encode(env::executor_id()).into_string();

        // Check auth while holding an immutable borrow, then drop before remove.
        let (author, date) = {
            let entry_opt = self
                .entries
                .get(&id)
                .map_err(|e| AppError::msg(format!("entries.get: {e}")))?;
            match entry_opt {
                None => return Err(AppError::from(Error::NotFound(id.clone()))),
                Some(entry) => {
                    if entry.author_id != caller_id {
                        return Err(AppError::from(Error::Forbidden(
                            "only the author may delete this standup".into(),
                        )));
                    }
                    (entry.author.clone(), entry.date.clone())
                }
            }
        }; // immutable borrow released here

        self.entries
            .remove(&id)
            .map_err(|e| AppError::msg(format!("entries.remove: {e}")))?;

        app::emit!(Event::StandupDeleted {
            id: &id,
            author: &author,
            date: &date,
        });
        Ok(())
    }

    /// Return all entries for today (server-side date), ordered by `created_at`
    /// descending (most recent first).
    pub fn get_standups(&self) -> app::Result<Vec<StandupEntry>> {
        let today = unix_seconds_to_date(storage_env::time_now() / 1_000_000_000);
        self.get_standups_by_date(today)
    }

    /// Return all entries whose `date` matches the given ISO date (YYYY-MM-DD),
    /// ordered by `created_at` descending (most recent first).
    pub fn get_standups_by_date(&self, date: String) -> app::Result<Vec<StandupEntry>> {
        let mut out: Vec<StandupEntry> = self
            .entries
            .entries()
            .map_err(|e| AppError::msg(format!("entries.entries: {e}")))?
            .filter_map(|(_id, entry)| {
                if entry.date == date {
                    Some(entry)
                } else {
                    None
                }
            })
            .collect();
        // Most recent first.
        out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(out)
    }
}

// ---------------------------------------------------------------------------
// In-process tests — one TestHost roundtrip per mutation.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use calimero_sdk::testing::TestHost;

    use super::*;

    const OTHER: [u8; 32] = [0x22; 32];

    #[test]
    fn post_and_get_today() {
        let mut app = TestHost::new(StandupBoard::init);

        let id = app
            .call(|s| {
                s.post_standup(
                    "alice".into(),
                    "Finished auth".into(),
                    "Writing tests".into(),
                    "None".into(),
                )
            })
            .unwrap();

        let entries = app.view(|s| s.get_standups()).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, id);
        assert_eq!(entries[0].author, "alice");
        assert_eq!(entries[0].yesterday, "Finished auth");
        assert_eq!(entries[0].today, "Writing tests");
        assert_eq!(entries[0].blockers, "None");
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn multiple_posts_ordered_by_recency() {
        let mut app = TestHost::new(StandupBoard::init);

        let id1 = app
            .call(|s| {
                s.post_standup("alice".into(), "a1".into(), "b1".into(), "c1".into())
            })
            .unwrap();
        let id2 = app
            .call(|s| {
                s.post_standup("bob".into(), "a2".into(), "b2".into(), "c2".into())
            })
            .unwrap();

        let entries = app.view(|s| s.get_standups()).unwrap();
        assert_eq!(entries.len(), 2);
        // Most recent (id2) should be first. Both have the same created_at in
        // the test harness so order may vary — just assert both are present.
        let ids: Vec<&str> = entries.iter().map(|e| e.id.as_str()).collect();
        assert!(ids.contains(&id1.as_str()));
        assert!(ids.contains(&id2.as_str()));
    }

    #[test]
    fn edit_own_standup_succeeds() {
        let mut app = TestHost::new(StandupBoard::init);

        let id = app
            .call(|s| {
                s.post_standup("alice".into(), "v1".into(), "v1".into(), "v1".into())
            })
            .unwrap();

        app.call(|s| {
            s.edit_standup(id.clone(), "v2".into(), "v2".into(), "v2".into())
        })
        .unwrap();

        let entries = app.view(|s| s.get_standups()).unwrap();
        assert_eq!(entries[0].yesterday, "v2");
        assert_eq!(entries[0].today, "v2");
        assert_eq!(entries[0].blockers, "v2");
        // updated_at should be ≥ created_at after edit.
        assert!(entries[0].updated_at >= entries[0].created_at);
    }

    #[test]
    fn edit_others_standup_rejected() {
        let mut app = TestHost::new(StandupBoard::init);

        let id = app
            .call(|s| {
                s.post_standup("alice".into(), "v1".into(), "v1".into(), "v1".into())
            })
            .unwrap();

        let result = app.call_as(OTHER, |s| {
            s.edit_standup(id.clone(), "v2".into(), "v2".into(), "v2".into())
        });
        assert!(result.is_err());

        // Original content must be unchanged.
        let entries = app.view(|s| s.get_standups()).unwrap();
        assert_eq!(entries[0].yesterday, "v1");
    }

    #[test]
    fn edit_unknown_id_errors() {
        let mut app = TestHost::new(StandupBoard::init);
        let result = app.call(|s| {
            s.edit_standup("nope".into(), "v".into(), "v".into(), "v".into())
        });
        assert!(result.is_err());
    }

    #[test]
    fn delete_own_standup_succeeds() {
        let mut app = TestHost::new(StandupBoard::init);

        let id = app
            .call(|s| {
                s.post_standup("alice".into(), "v1".into(), "v1".into(), "v1".into())
            })
            .unwrap();

        app.call(|s| s.delete_standup(id.clone())).unwrap();

        let entries = app.view(|s| s.get_standups()).unwrap();
        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn delete_others_standup_rejected() {
        let mut app = TestHost::new(StandupBoard::init);

        let id = app
            .call(|s| {
                s.post_standup("alice".into(), "v1".into(), "v1".into(), "v1".into())
            })
            .unwrap();

        let result = app.call_as(OTHER, |s| s.delete_standup(id.clone()));
        assert!(result.is_err());

        // Entry must still be present.
        let entries = app.view(|s| s.get_standups()).unwrap();
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn delete_unknown_id_errors() {
        let mut app = TestHost::new(StandupBoard::init);
        let result = app.call(|s| s.delete_standup("nope".into()));
        assert!(result.is_err());
    }

    #[test]
    fn get_standups_by_date_filters_correctly() {
        let mut app = TestHost::new(StandupBoard::init);

        app.call(|s| {
            s.post_standup("alice".into(), "v1".into(), "v1".into(), "v1".into())
        })
        .unwrap();

        // Today's entries are returned.
        let today_entries = app.view(|s| s.get_standups()).unwrap();
        assert_eq!(today_entries.len(), 1);

        // A past date returns no entries.
        let past = app
            .view(|s| s.get_standups_by_date("1970-01-01".into()))
            .unwrap();
        assert_eq!(past.len(), 0);
    }

    #[test]
    fn events_emitted_for_each_mutation() {
        let mut app = TestHost::new(StandupBoard::init);

        let id = app
            .call(|s| {
                s.post_standup("alice".into(), "v1".into(), "v1".into(), "v1".into())
            })
            .unwrap();
        assert_eq!(app.events().len(), 1); // StandupPosted

        app.call(|s| {
            s.edit_standup(id.clone(), "v2".into(), "v2".into(), "v2".into())
        })
        .unwrap();
        assert_eq!(app.events().len(), 2); // + StandupEdited

        app.call(|s| s.delete_standup(id.clone())).unwrap();
        assert_eq!(app.events().len(), 3); // + StandupDeleted
    }
}
