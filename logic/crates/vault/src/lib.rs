//! Household vault service.
//!
//! A single shared vault of household logins: any member may add an entry
//! (visible to everyone), but only the member who added an entry may edit or
//! delete it. This is the canonical `AuthoredMap` shape:
//!
//! - `AuthoredMap<String, Entry>` — insert is open to anyone; `update`/`remove`
//!   are structurally gated to the original author by the storage layer.
//! - `Entry` nests a `LwwRegister<EntryData>` for the mutable body
//!   (service_name/username/secret/notes, replaced atomically as one unit on
//!   `edit_entry`) and a `LwwRegister<u64>` for `created_at` (set once, never
//!   rewritten). Both fields are already `Mergeable`, so `Entry` uses
//!   `#[derive(Mergeable)]` — no hand-written merge/rekey needed.
//! - The author's identity is never stored redundantly on the entry; it is
//!   read back via `AuthoredMap::owner_of` when building the view returned to
//!   callers.

use calimero_sdk::app;
use calimero_sdk::app::Mergeable;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::{AuthoredMap, LwwRegister};
use calimero_storage::env as storage_env;
use household_vault_types::{generate_id, validate_label, Error};

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// The mutable body of a vault entry, replaced atomically on `edit_entry`.
/// Nested inside a `LwwRegister` so concurrent edits converge last-writer-wins
/// as a whole (matches the spec: `edit_entry` replaces all four fields at
/// once). Borsh-only — `Entry`/`EntryData` are the internal storage
/// representation; callers get the serde-able `VaultEntry` view instead.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct EntryData {
    pub service_name: String,
    pub username: String,
    pub secret: String,
    pub notes: String,
}

/// A vault entry as stored. Both fields are already `Mergeable`
/// (`LwwRegister<T>` is `Mergeable` for any `T`), so `#[derive(Mergeable)]`
/// covers this struct with no hand-written merge/rekey.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Mergeable)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct Entry {
    pub data: LwwRegister<EntryData>,
    /// Set once at `add_entry` time and never rewritten.
    pub created_at: LwwRegister<u64>,
}

/// Read-shaped view returned to callers: flat fields, the author's base58
/// identity resolved from the `AuthoredMap`'s authorship stamp. A named
/// struct (not a tuple) so the generated ABI client gets typed fields.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct VaultEntry {
    pub id: String,
    pub author: String,
    pub service_name: String,
    pub username: String,
    pub secret: String,
    pub notes: String,
    pub created_at: u64,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// `#[app::state]` injects the borsh derives itself (SDK 0.11+); a manual
// derive here would collide.
#[app::state(emits = for<'a> Event<'a>)]
pub struct Vault {
    /// The shared household vault, keyed by generated entry id. `AuthoredMap`
    /// stamps the adding executor as author and rejects `update`/`remove` by
    /// anyone else, structurally enforcing "only the adder may edit/delete".
    entries: AuthoredMap<String, Entry>,
}

#[app::logic]
impl Vault {
    #[app::init]
    pub fn init() -> Vault {
        Vault {
            entries: AuthoredMap::new_with_field_name("vault:entries"),
        }
    }

    /// Add a shared login entry. Returns its generated id. The caller becomes
    /// the author; only they may later edit or delete it.
    pub fn add_entry(
        &mut self,
        service_name: String,
        username: String,
        secret: String,
        notes: String,
    ) -> app::Result<String> {
        validate_label(&service_name).map_err(AppError::from)?;

        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("entry", now_ms, &nonce);

        let entry = Entry {
            data: LwwRegister::new(EntryData {
                service_name,
                username,
                secret,
                notes,
            }),
            created_at: LwwRegister::new(now_ms),
        };
        self.entries
            .insert(id.clone(), entry)
            .map_err(|e| AppError::msg(format!("entries.insert: {e}")))?;

        let author = self.author_b58();
        app::emit!(Event::EntryAdded {
            id: &id,
            author: &author,
        });
        Ok(id)
    }

    /// Edit an entry's service name / username / secret / notes as one unit.
    /// Author-gated: `AuthoredMap::update` returns `ActionNotAllowed` for
    /// non-authors, surfaced here as `Forbidden`.
    pub fn edit_entry(
        &mut self,
        id: String,
        service_name: String,
        username: String,
        secret: String,
        notes: String,
    ) -> app::Result<()> {
        validate_label(&service_name).map_err(AppError::from)?;

        let mut entry = self
            .entries
            .get(&id)
            .map_err(|e| AppError::msg(format!("entries.get: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(id.clone())))?;
        entry.data.set(EntryData {
            service_name,
            username,
            secret,
            notes,
        });
        self.entries
            .update(&id, entry)
            .map_err(map_author_error("edit"))?;

        app::emit!(Event::EntryUpdated { id: &id });
        Ok(())
    }

    /// Delete an entry. Author-gated: `AuthoredMap::remove` returns
    /// `ActionNotAllowed` for non-authors, surfaced here as `Forbidden`.
    pub fn delete_entry(&mut self, id: String) -> app::Result<()> {
        let removed = self
            .entries
            .remove(&id)
            .map_err(map_author_error("delete"))?;
        if removed.is_none() {
            app::bail!(Error::NotFound(id));
        }

        app::emit!(Event::EntryDeleted { id: &id });
        Ok(())
    }

    /// List every entry currently in the vault, sorted by creation time then
    /// id for a stable order (`AuthoredMap` iteration order is hash-based).
    pub fn list_entries(&self) -> app::Result<Vec<VaultEntry>> {
        let mut out: Vec<VaultEntry> = self
            .entries
            .entries()
            .map_err(|e| AppError::msg(format!("entries.entries: {e}")))?
            .map(|(id, entry)| self.to_view(id, &entry))
            .collect::<app::Result<_>>()?;
        out.sort_by(|a, b| (a.created_at, &a.id).cmp(&(b.created_at, &b.id)));
        Ok(out)
    }
}

impl Vault {
    /// Base58 of the current executor — the public, shareable author identity.
    fn author_b58(&self) -> String {
        bs58::encode(env::executor_id()).into_string()
    }

    fn to_view(&self, id: String, entry: &Entry) -> app::Result<VaultEntry> {
        // `owner_of` yields a `PublicKey`; `String::from(PublicKey)` is its
        // canonical base58 encoding (see calimero_primitives::identity).
        let author = self
            .entries
            .owner_of(&id)
            .map_err(|e| AppError::msg(format!("entries.owner_of: {e}")))?
            .map(String::from)
            .unwrap_or_default();
        let data = entry.data.get();
        Ok(VaultEntry {
            id,
            author,
            service_name: data.service_name.clone(),
            username: data.username.clone(),
            secret: data.secret.clone(),
            notes: data.notes.clone(),
            created_at: *entry.created_at.get(),
        })
    }
}

/// Translate an `AuthoredMap` access-control error into a friendly
/// `Forbidden`.
fn map_author_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(Error::Forbidden(format!(
                "can only {action} entries you added"
            )))
        } else {
            AppError::msg(format!("entries.{action}: {s}"))
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
    fn add_and_list_entries() {
        let mut app = TestHost::new(Vault::init);

        let id = app
            .call(|s| {
                s.add_entry(
                    "Netflix".into(),
                    "family@home.com".into(),
                    "s3cr3t!".into(),
                    "shared account".into(),
                )
            })
            .unwrap();

        let entries = app.view(|s| s.list_entries()).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, id);
        assert_eq!(entries[0].service_name, "Netflix");
        assert_eq!(entries[0].username, "family@home.com");
        assert_eq!(entries[0].secret, "s3cr3t!");
        assert_eq!(entries[0].notes, "shared account");
        assert!(!entries[0].author.is_empty());
        // `add_entry` emits exactly one event.
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn edit_entry_replaces_fields() {
        let mut app = TestHost::new(Vault::init);

        let id = app
            .call(|s| {
                s.add_entry(
                    "Netflix".into(),
                    "family@home.com".into(),
                    "s3cr3t!".into(),
                    "shared account".into(),
                )
            })
            .unwrap();

        app.call(|s| {
            s.edit_entry(
                id.clone(),
                "Netflix".into(),
                "family@home.com".into(),
                "newPass1!".into(),
                "updated Oct".into(),
            )
        })
        .unwrap();

        let entries = app.view(|s| s.list_entries()).unwrap();
        assert_eq!(entries[0].secret, "newPass1!");
        assert_eq!(entries[0].notes, "updated Oct");
    }

    #[test]
    fn edit_unknown_id_errors() {
        let mut app = TestHost::new(Vault::init);
        assert!(app
            .call(|s| s.edit_entry(
                "nope".into(),
                "Netflix".into(),
                "u".into(),
                "p".into(),
                "n".into(),
            ))
            .is_err());
    }

    #[test]
    fn author_can_delete() {
        let mut app = TestHost::new(Vault::init);

        let id = app
            .call(|s| s.add_entry("Netflix".into(), "u".into(), "p".into(), "n".into()))
            .unwrap();
        app.call(|s| s.delete_entry(id.clone())).unwrap();
        assert!(app.view(|s| s.list_entries()).unwrap().is_empty());
    }

    #[test]
    fn non_author_cannot_edit_or_delete() {
        let mut app = TestHost::new(Vault::init);

        // Default identity adds the entry, so it is the author.
        let id = app
            .call(|s| s.add_entry("Netflix".into(), "u".into(), "p".into(), "n".into()))
            .unwrap();

        // A different executor is not the author — AuthoredMap rejects both
        // edit and delete, surfaced as Forbidden.
        let other = [7u8; 32];
        assert!(app
            .call_as(other, |s| s.edit_entry(
                id.clone(),
                "Netflix".into(),
                "u".into(),
                "changed".into(),
                "n".into(),
            ))
            .is_err());
        assert!(app.call_as(other, |s| s.delete_entry(id.clone())).is_err());

        // The entry survives untouched.
        let entries = app.view(|s| s.list_entries()).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].secret, "p");
    }
}
