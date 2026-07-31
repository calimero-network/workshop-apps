//! Reisetagebuch - shared travel journal for two.
//!
//! One context per trip. Two entities:
//! - `Stamp` (authored): a timestamped record of an activity a traveler
//!   ticked off at the current stop. Only the stamping traveler may remove
//!   their own stamp (`AuthoredMap` structurally enforces this).
//! - `Postcard` (shared): an end-of-day summary either traveler can generate;
//!   anyone may create one, so it lives in a plain `UnorderedMap`.
//!
//! `AuthoredMap` has no bulk-enumeration method in this SDK (insert / update /
//! remove / get / contains / owner_of only - no `entries()`), so `stamp_ids`
//! (an `UnorderedSet`) is a companion index that makes `list_stamps` possible.
//! Both entity types are set-once at creation (no per-field update method), so
//! their hand-written `Mergeable` just tie-breaks deterministically on a
//! concurrent same-id race; neither nests a CRDT, so `RekeyTarget` is a no-op.

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::address::Id;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::rekey::RekeyTarget;
use calimero_storage::collections::{AuthoredMap, LwwRegister, Mergeable, UnorderedMap, UnorderedSet};
use calimero_storage::env as storage_env;
use tagebuch_thailand_types::{generate_id, Error};

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// A stamped activity. Set once at creation - no field is ever updated after
/// `add_stamp`, so the hand-written `Mergeable` only needs to tie-break a
/// same-id race deterministically (astronomically unlikely given the
/// timestamp+nonce id, but required for a total `Mergeable` impl).
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Stamp {
    pub id: String,
    pub activity_id: String,
    pub stop: String,
    pub category: String,
    pub stamped_at: u64,
    pub author: String,
}

impl Mergeable for Stamp {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if (other.stamped_at, &other.id) < (self.stamped_at, &self.id) {
            *self = other.clone();
        }
        Ok(())
    }
}

impl RekeyTarget for Stamp {
    fn rekey_relative_to(&mut self, _parent_id: Id) {
        // No nested CRDT fields - nothing to re-key.
    }
}

/// A generated end-of-day postcard. Set once at creation - `create_postcard`
/// is the only write path, so merge mirrors `Stamp`'s deterministic tie-break.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Postcard {
    pub id: String,
    pub day_number: u32,
    pub stop: String,
    pub day_line: String,
    pub image_blob_id: String,
    pub stamp_count: u32,
    pub photo_count: u32,
    pub created_at: u64,
}

impl Mergeable for Postcard {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if (other.created_at, &other.id) < (self.created_at, &self.id) {
            *self = other.clone();
        }
        Ok(())
    }
}

impl RekeyTarget for Postcard {
    fn rekey_relative_to(&mut self, _parent_id: Id) {
        // No nested CRDT fields - nothing to re-key.
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
pub struct Reisetagebuch {
    /// Trip config, seeded once at `init` and never mutated by an API method.
    traveler_one_name: LwwRegister<String>,
    traveler_two_name: LwwRegister<String>,
    start_date: LwwRegister<String>,
    /// The stamps, keyed by generated id. Author-gated: only the stamping
    /// traveler may remove their own stamp.
    stamps: AuthoredMap<String, Stamp>,
    /// Companion enumeration index for `stamps` (see module docs - AuthoredMap
    /// has no `entries()`).
    stamp_ids: UnorderedSet<String>,
    /// The generated postcards. Anyone may create one, so a plain shared map.
    postcards: UnorderedMap<String, Postcard>,
}

#[app::logic]
impl Reisetagebuch {
    #[app::init]
    pub fn init(
        traveler_one_name: String,
        traveler_two_name: String,
        start_date: String,
    ) -> Reisetagebuch {
        Reisetagebuch {
            traveler_one_name: LwwRegister::new(traveler_one_name),
            traveler_two_name: LwwRegister::new(traveler_two_name),
            start_date: LwwRegister::new(start_date),
            stamps: AuthoredMap::new_with_field_name("reisetagebuch:stamps"),
            stamp_ids: UnorderedSet::new_with_field_name("reisetagebuch:stamp_ids"),
            postcards: UnorderedMap::new_with_field_name("reisetagebuch:postcards"),
        }
    }

    /// Stamp an activity at the current stop. Returns the generated stamp id.
    /// The caller becomes the stamp's author; only they may later remove it.
    pub fn add_stamp(
        &mut self,
        activity_id: String,
        stop: String,
        category: String,
    ) -> app::Result<String> {
        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("stamp", now_ms, &nonce);
        let author = bs58::encode(env::executor_id()).into_string();

        let stamp = Stamp {
            id: id.clone(),
            activity_id: activity_id.clone(),
            stop: stop.clone(),
            category: category.clone(),
            stamped_at: now_ms,
            author,
        };
        self.stamps
            .insert(id.clone(), stamp)
            .map_err(|e| AppError::msg(format!("stamps.insert: {e}")))?;
        self.stamp_ids
            .insert(id.clone())
            .map_err(|e| AppError::msg(format!("stamp_ids.insert: {e}")))?;

        app::emit!(Event::StampAdded {
            activity_id: &activity_id,
            stop: &stop,
            category: &category,
        });
        Ok(id)
    }

    /// Remove a stamp. Author-gated: `AuthoredMap::remove` returns
    /// `ActionNotAllowed` for a non-author, surfaced here as `Forbidden`.
    pub fn remove_stamp(&mut self, stamp_id: String) -> app::Result<()> {
        let removed = self.stamps.remove(&stamp_id).map_err(map_stamp_error())?;
        if removed.is_none() {
            app::bail!(Error::NotFound(stamp_id));
        }
        // Best-effort: drop the id from the enumeration index too, so
        // `list_stamps` doesn't return a ghost entry.
        self.stamp_ids
            .remove(&stamp_id)
            .map_err(|e| AppError::msg(format!("stamp_ids.remove: {e}")))?;

        app::emit!(Event::StampRemoved {
            stamp_id: &stamp_id,
        });
        Ok(())
    }

    /// List every stamp, oldest first (stable order - `AuthoredMap`/
    /// `UnorderedSet` iteration order is unspecified).
    pub fn list_stamps(&self) -> app::Result<Vec<Stamp>> {
        let mut out = Vec::new();
        let ids = self
            .stamp_ids
            .iter()
            .map_err(|e| AppError::msg(format!("stamp_ids.iter: {e}")))?;
        for id in ids {
            if let Some(stamp) = self
                .stamps
                .get(&id)
                .map_err(|e| AppError::msg(format!("stamps.get: {e}")))?
            {
                out.push(stamp);
            }
        }
        out.sort_by(|a, b| (a.stamped_at, &a.id).cmp(&(b.stamped_at, &b.id)));
        Ok(out)
    }

    /// Generate an end-of-day postcard. Anyone may create one.
    pub fn create_postcard(
        &mut self,
        day_number: u32,
        stop: String,
        day_line: String,
        image_blob_id: String,
        stamp_count: u32,
        photo_count: u32,
    ) -> app::Result<String> {
        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("postcard", now_ms, &nonce);

        let postcard = Postcard {
            id: id.clone(),
            day_number,
            stop: stop.clone(),
            day_line,
            image_blob_id,
            stamp_count,
            photo_count,
            created_at: now_ms,
        };
        self.postcards
            .insert(id.clone(), postcard)
            .map_err(|e| AppError::msg(format!("postcards.insert: {e}")))?;

        app::emit!(Event::PostcardCreated {
            day_number,
            stop: &stop,
        });
        Ok(id)
    }

    /// List every postcard, newest first - a stable order (ties broken by id)
    /// so both travelers see the identical gallery order.
    pub fn list_postcards(&self) -> app::Result<Vec<Postcard>> {
        let mut out: Vec<Postcard> = self
            .postcards
            .entries()
            .map_err(|e| AppError::msg(format!("postcards.entries: {e}")))?
            .map(|(_, p)| p)
            .collect();
        out.sort_by(|a, b| (b.created_at, &b.id).cmp(&(a.created_at, &a.id)));
        Ok(out)
    }
}

/// Translate an `AuthoredMap` access-control error into a friendly `Forbidden`.
fn map_stamp_error() -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(Error::Forbidden(
                "only the traveler who added this stamp may remove it".into(),
            ))
        } else {
            AppError::msg(format!("stamps.remove: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// In-process tests - one TestHost roundtrip per mutation.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use calimero_sdk::testing::TestHost;

    use super::*;

    fn init_app() -> TestHost<Reisetagebuch> {
        TestHost::new(|| {
            Reisetagebuch::init("Mia".into(), "Jonas".into(), "2024-08-08".into())
        })
    }

    #[test]
    fn add_stamp_then_list_roundtrip() {
        let mut app = init_app();

        let id = app
            .call(|s| s.add_stamp("wat-arun".into(), "Bangkok".into(), "Sehen".into()))
            .unwrap();
        let stamps = app.view(|s| s.list_stamps()).unwrap();
        assert_eq!(stamps.len(), 1);
        assert_eq!(stamps[0].id, id);
        assert_eq!(stamps[0].activity_id, "wat-arun");
        assert_eq!(stamps[0].stop, "Bangkok");
        assert_eq!(stamps[0].category, "Sehen");
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn author_can_remove_own_stamp() {
        let mut app = init_app();

        let id = app
            .call(|s| s.add_stamp("wat-arun".into(), "Bangkok".into(), "Sehen".into()))
            .unwrap();
        app.call(|s| s.remove_stamp(id.clone())).unwrap();
        assert!(app.view(|s| s.list_stamps()).unwrap().is_empty());
    }

    #[test]
    fn non_author_cannot_remove_stamp() {
        let mut app = init_app();

        // Default identity adds the stamp, so it owns it.
        let id = app
            .call(|s| s.add_stamp("wat-arun".into(), "Bangkok".into(), "Sehen".into()))
            .unwrap();

        // A different executor is not the author - AuthoredMap rejects the
        // removal, surfaced as Forbidden.
        let other = [7u8; 32];
        assert!(app.call_as(other, |s| s.remove_stamp(id.clone())).is_err());
        assert_eq!(app.view(|s| s.list_stamps()).unwrap().len(), 1);
    }

    #[test]
    fn remove_unknown_stamp_errors() {
        let mut app = init_app();
        assert!(app.call(|s| s.remove_stamp("nope".into())).is_err());
    }

    #[test]
    fn create_postcard_then_list_roundtrip() {
        let mut app = init_app();

        let id = app
            .call(|s| {
                s.create_postcard(
                    3,
                    "Koh Samui".into(),
                    "Ein Tag voller Strand und Sonnenuntergaenge".into(),
                    "blob-7c1d".into(),
                    4,
                    5,
                )
            })
            .unwrap();
        let postcards = app.view(|s| s.list_postcards()).unwrap();
        assert_eq!(postcards.len(), 1);
        assert_eq!(postcards[0].id, id);
        assert_eq!(postcards[0].day_number, 3);
        assert_eq!(postcards[0].stop, "Koh Samui");
        assert_eq!(postcards[0].stamp_count, 4);
        assert_eq!(postcards[0].photo_count, 5);
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn list_postcards_contains_every_generated_postcard() {
        let mut app = init_app();

        let id1 = app
            .call(|s| s.create_postcard(1, "Bangkok".into(), "day one".into(), "blob-1".into(), 2, 3))
            .unwrap();
        let id2 = app
            .call(|s| s.create_postcard(2, "Chiang Mai".into(), "day two".into(), "blob-2".into(), 1, 1))
            .unwrap();

        let postcards = app.view(|s| s.list_postcards()).unwrap();
        assert_eq!(postcards.len(), 2);
        let ids: Vec<&str> = postcards.iter().map(|p| p.id.as_str()).collect();
        assert!(ids.contains(&id1.as_str()));
        assert!(ids.contains(&id2.as_str()));

        // Deterministic order: calling twice yields the identical order, so
        // both travelers always see the same gallery.
        let postcards_again = app.view(|s| s.list_postcards()).unwrap();
        let ids_again: Vec<&str> = postcards_again.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, ids_again);
    }
}
