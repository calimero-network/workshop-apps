//! Design-review service — a shared space holding mockups and the feedback
//! pins teammates drop on them.
//!
//! - `Mockup` is a plain, immutable-after-upload record (there is no
//!   "update mockup" method, only new uploads) so it's wrapped whole in a
//!   `LwwRegister` inside a shared `UnorderedMap` — anyone may upload a new
//!   version.
//! - `Pin` data lives in a plain `UnorderedMap` (so it can be listed/filtered
//!   with `.entries()` — `AuthoredMap` deliberately has no `entries()`, only
//!   keyed access), with a companion `pin_owners: AuthoredMap<String,
//!   LwwRegister<u64>>` authorship stamp gating `edit_pin`/`remove_pin` to the
//!   pin's author, exactly like the foundation scaffold's `items`/`owners`
//!   split — just extended to gate BOTH edit and delete, not delete alone.
//!   `Pin.text` is nested in a `LwwRegister` so concurrent edits from the
//!   same author's different replicas still converge (`Pin` hand-writes
//!   `Mergeable` + `RekeyTarget`, mirroring the scaffold's `Item`).
//! - `resolved` is tracked in a SEPARATE plain shared map, not inside `Pin`:
//!   the spec requires ANY teammate (not just the author) to resolve a pin,
//!   which the author-gated `pin_owners` cannot allow, so resolving needs its
//!   own open collection.

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
use pinpoint_feedback_types::{generate_id, Error};

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// A mockup version. `image` is the blob id (as returned by the frontend's
/// raw-bytes upload, see `app/src/api/blob.ts`) kept as an opaque `String` —
/// matching the spec's own method signature (`upload_mockup(.., image:
/// String, ..)`). Every field is set once at `upload_mockup` time — there is
/// no update method, only new uploads — so the whole record is wrapped in one
/// `LwwRegister` rather than field-by-field CRDTs. No nested CRDT, so
/// `Mockup` carries both Borsh (storage) and Serde (ABI) derives directly.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Mockup {
    pub id: String,
    pub title: String,
    pub image: String,
    pub version: u32,
    pub created_at: u64,
}

/// A feedback pin dropped at an exact spot on a mockup. `mockup_id`/`x`/`y`/
/// `created_at` are set once at `add_pin` and never change; `text` is a
/// `LwwRegister` because it's mutated in place by `edit_pin`. Because this
/// struct **nests a CRDT** and is stored as an `UnorderedMap` value, it
/// implements `Mergeable` by hand AND `RekeyTarget` (see below). Authorship
/// (who may edit/remove it) is tracked separately in `pin_owners`, not on
/// this struct — see the module doc.
// Borsh-only: nests a `LwwRegister`, which has no serde impl in
// calimero_storage. Callers get the serde-able `PinView` instead.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct Pin {
    pub mockup_id: String,
    pub x: f32,
    pub y: f32,
    /// The pin's comment text. LWW on concurrent author edits.
    pub text: LwwRegister<String>,
    pub created_at: u64,
}

/// Hand-written merge. The set-once fields tie-break deterministically (only
/// relevant in the freak case of a raced initial insert); `text` delegates to
/// the nested `LwwRegister` so the freshest edit wins.
impl Mergeable for Pin {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if other.created_at < self.created_at {
            self.mockup_id = other.mockup_id.clone();
            self.x = other.x;
            self.y = other.y;
            self.created_at = other.created_at;
        }
        // `LwwRegister::merge` returns `()` (infallible HLC last-writer-wins),
        // so wrap it back into the fallible `Mergeable::merge` signature.
        self.text.merge(&other.text);
        Ok(())
    }
}

/// Deterministic re-keying for a hand-written CRDT-value struct (#2577). `Pin`
/// nests a `LwwRegister`; without re-keying it under a field-namespaced child
/// of the entry id, the nested register would be LWW'd as an opaque blob
/// instead of converging as its own child entity.
impl RekeyTarget for Pin {
    fn rekey_relative_to(&mut self, parent_id: Id) {
        calimero_storage::rekey_field_if_supported!(
            &mut self.text,
            field_child_id(parent_id, "text")
        );
    }
}

/// Read-shaped pin returned to callers: the generated id, the resolved flag
/// (tracked separately — see `pin_resolved` on state), and the base58 author
/// key. A named struct (not a tuple) so the generated ABI client gets typed
/// fields.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct PinView {
    pub id: String,
    pub mockup_id: String,
    pub author: String,
    pub x: f32,
    pub y: f32,
    pub text: String,
    pub resolved: bool,
    pub created_at: u64,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// `#[app::state]` injects the borsh derives itself (SDK 0.11+); a manual derive
// here would collide.
#[app::state(emits = for<'a> Event<'a>)]
pub struct DesignReview {
    /// Mockup versions, keyed by generated id. The spec ties no writer-set /
    /// admin-rotation API to this entity (`upload_mockup` is the only
    /// mutation, and there's no "who may upload" acceptance criterion), so a
    /// plain shared map is the simplest collection that satisfies every
    /// requirement — reaching for `SharedStorage` here would add a writer set
    /// and identity plumbing nothing in the spec exercises.
    mockups: UnorderedMap<String, LwwRegister<Mockup>>,
    /// Feedback pins, keyed by generated id. A plain shared map so `list_pins`
    /// can filter with `.entries()` (`AuthoredMap` has no `entries()` — only
    /// keyed access). Authorship is enforced separately via `pin_owners`.
    pins: UnorderedMap<String, Pin>,
    /// Authorship stamp per pin id. `AuthoredMap` records the adding executor
    /// as owner; `edit_pin`/`remove_pin` gate through `pin_owners.update`/
    /// `.remove` (both owner-only) before touching `pins`.
    pin_owners: AuthoredMap<String, LwwRegister<u64>>,
    /// Resolved flag per pin id, deliberately OUTSIDE `pin_owners`: ANY
    /// teammate (not just the author) may resolve a pin, which the
    /// author-gated map cannot allow — so resolving lives in its own open map.
    pin_resolved: UnorderedMap<String, LwwRegister<bool>>,
}

#[app::logic]
impl DesignReview {
    #[app::init]
    pub fn init() -> DesignReview {
        DesignReview {
            mockups: UnorderedMap::new_with_field_name("design_review:mockups"),
            pins: UnorderedMap::new_with_field_name("design_review:pins"),
            pin_owners: AuthoredMap::new_with_field_name("design_review:pin_owners"),
            pin_resolved: UnorderedMap::new_with_field_name("design_review:pin_resolved"),
        }
    }

    // ---- Mockups ----

    /// Upload a new mockup version. `image` is the blob id returned by the
    /// frontend's raw-bytes upload (already replicated by the frontend's
    /// upload/announce flow) — the backend just records the metadata.
    pub fn upload_mockup(&mut self, title: String, image: String, version: u32) -> app::Result<String> {
        if title.trim().is_empty() {
            app::bail!(Error::Invalid("title must not be empty".into()));
        }

        let now = storage_env::time_now();
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("mockup", now, &nonce);

        let mockup = Mockup {
            id: id.clone(),
            title: title.clone(),
            image,
            version,
            created_at: now / 1_000_000,
        };
        self.mockups
            .insert(id.clone(), LwwRegister::new(mockup))
            .map_err(|e| AppError::msg(format!("mockups.insert: {e}")))?;

        app::emit!(Event::MockupUploaded { id: &id, title: &title });
        Ok(id)
    }

    /// List all mockups, oldest to newest (`UnorderedMap` iteration order is
    /// unspecified).
    pub fn list_mockups(&self) -> app::Result<Vec<Mockup>> {
        let mut out: Vec<Mockup> = self
            .mockups
            .entries()
            .map_err(|e| AppError::msg(format!("mockups.entries: {e}")))?
            .map(|(_, reg)| reg.get().clone())
            .collect();
        out.sort_by(|a, b| (a.created_at, &a.id).cmp(&(b.created_at, &b.id)));
        Ok(out)
    }

    // ---- Pins ----

    /// Drop a pin at an exact spot on a mockup, with a comment. The caller
    /// becomes the pin's author; only they may later edit or remove it.
    pub fn add_pin(&mut self, mockup_id: String, x: f32, y: f32, text: String) -> app::Result<String> {
        let exists = self
            .mockups
            .contains(&mockup_id)
            .map_err(|e| AppError::msg(format!("mockups.contains: {e}")))?;
        if !exists {
            app::bail!(Error::NotFound(mockup_id));
        }

        let now = storage_env::time_now();
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("pin", now, &nonce);

        let pin = Pin {
            mockup_id: mockup_id.clone(),
            x,
            y,
            text: LwwRegister::new(text),
            created_at: now / 1_000_000,
        };
        self.pins
            .insert(id.clone(), pin)
            .map_err(|e| AppError::msg(format!("pins.insert: {e}")))?;
        // Stamp the adding executor as author; gates edit_pin/remove_pin.
        self.pin_owners
            .insert(id.clone(), LwwRegister::new(now))
            .map_err(|e| AppError::msg(format!("pin_owners.insert: {e}")))?;

        app::emit!(Event::PinAdded { id: &id, mockup_id: &mockup_id, x, y });
        Ok(id)
    }

    /// Edit a pin's comment text. Author-gated by comparing the caller against
    /// `pin_owners.owner_of` (the CRDT-verified authorship stamp `add_pin`
    /// wrote) — a read-only check, so unlike `remove_pin` this never writes
    /// `pin_owners` itself; only the pin's `text` register changes.
    pub fn edit_pin(&mut self, pin_id: String, text: String) -> app::Result<()> {
        let owner = self
            .pin_owners
            .owner_of(&pin_id)
            .map_err(|e| AppError::msg(format!("pin_owners.owner_of: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(pin_id.clone())))?;
        let caller: calimero_sdk::PublicKey = env::executor_id().into();
        if owner != caller {
            app::bail!(Error::Forbidden("can only edit your own pins".into()));
        }

        let mut guard = self
            .pins
            .get_mut(&pin_id)
            .map_err(|e| AppError::msg(format!("pins.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(pin_id.clone())))?;
        guard.text.set(text.clone());
        drop(guard);

        app::emit!(Event::PinEdited { id: &pin_id, text: &text });
        Ok(())
    }

    /// Remove a pin. Author-gated: `pin_owners.remove` returns
    /// `ActionNotAllowed` for non-authors, surfaced here as `Forbidden`.
    pub fn remove_pin(&mut self, pin_id: String) -> app::Result<()> {
        let removed = self
            .pin_owners
            .remove(&pin_id)
            .map_err(map_owner_error("delete"))?;
        if removed.is_none() {
            app::bail!(Error::NotFound(pin_id));
        }
        self.pins
            .remove(&pin_id)
            .map_err(|e| AppError::msg(format!("pins.remove: {e}")))?;
        // Best-effort cleanup of the resolved-status side table; a failure
        // here would just leave an orphaned flag for a now-deleted pin id.
        let _ = self.pin_resolved.remove(&pin_id);

        app::emit!(Event::PinRemoved { id: &pin_id });
        Ok(())
    }

    /// Mark a pin resolved. Open to ANY teammate (not just the author) — the
    /// resolved flag lives in `pin_resolved`, a plain shared map, precisely so
    /// this is not author-gated. Resolving one pin never touches any other
    /// pin's entry.
    pub fn resolve_pin(&mut self, pin_id: String) -> app::Result<()> {
        let exists = self
            .pins
            .contains(&pin_id)
            .map_err(|e| AppError::msg(format!("pins.contains: {e}")))?;
        if !exists {
            app::bail!(Error::NotFound(pin_id));
        }

        let mut guard = self
            .pin_resolved
            .entry(pin_id.clone())
            .map_err(|e| AppError::msg(format!("pin_resolved.entry: {e}")))?
            .or_insert(LwwRegister::new(false))
            .map_err(|e| AppError::msg(format!("pin_resolved.or_insert: {e}")))?;
        guard.set(true);
        drop(guard);

        app::emit!(Event::PinResolved { id: &pin_id });
        Ok(())
    }

    /// List all pins on a mockup, oldest to newest — every pin always carries
    /// its creation timestamp so the order is stable and meaningful.
    pub fn list_pins(&self, mockup_id: String) -> app::Result<Vec<PinView>> {
        let mut out: Vec<PinView> = self
            .pins
            .entries()
            .map_err(|e| AppError::msg(format!("pins.entries: {e}")))?
            .filter(|(_, pin)| pin.mockup_id == mockup_id)
            .map(|(id, pin)| self.to_pin_view(id, &pin))
            .collect::<app::Result<_>>()?;
        out.sort_by(|a, b| (a.created_at, &a.id).cmp(&(b.created_at, &b.id)));
        Ok(out)
    }
}

impl DesignReview {
    fn to_pin_view(&self, id: String, pin: &Pin) -> app::Result<PinView> {
        // `owner_of` yields a `PublicKey`; `String::from(PublicKey)` is its
        // canonical base58 encoding.
        let author = self
            .pin_owners
            .owner_of(&id)
            .map_err(|e| AppError::msg(format!("pin_owners.owner_of: {e}")))?
            .map(String::from)
            .unwrap_or_default();
        let resolved = self
            .pin_resolved
            .get(&id)
            .map_err(|e| AppError::msg(format!("pin_resolved.get: {e}")))?
            .map(|reg| *reg.get())
            .unwrap_or(false);
        Ok(PinView {
            id,
            mockup_id: pin.mockup_id.clone(),
            author,
            x: pin.x,
            y: pin.y,
            text: pin.text.get().clone(),
            resolved,
            created_at: pin.created_at,
        })
    }
}

/// Translate an `AuthoredMap` access-control error into a friendly `Forbidden`.
fn map_owner_error(action: &'static str) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(Error::Forbidden(format!("can only {action} your own pins")))
        } else {
            AppError::msg(format!("pin_owners.{action}: {s}"))
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

    const OTHER: [u8; 32] = [0x22; 32];

    #[test]
    fn upload_mockup_then_list() {
        let mut app = TestHost::new(DesignReview::init);

        let id = app
            .call(|s| s.upload_mockup("Homepage v3".into(), "blob-9f2a".into(), 3))
            .unwrap();
        let mockups = app.view(|s| s.list_mockups()).unwrap();
        assert_eq!(mockups.len(), 1);
        assert_eq!(mockups[0].id, id);
        assert_eq!(mockups[0].title, "Homepage v3");
        assert_eq!(mockups[0].image, "blob-9f2a");
        assert_eq!(mockups[0].version, 3);
        // `upload_mockup` emits exactly one event.
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn upload_mockup_rejects_empty_title() {
        let mut app = TestHost::new(DesignReview::init);
        assert!(app.call(|s| s.upload_mockup("   ".into(), "blob-1".into(), 1)).is_err());
    }

    #[test]
    fn add_pin_requires_known_mockup() {
        let mut app = TestHost::new(DesignReview::init);
        assert!(app.call(|s| s.add_pin("nope".into(), 0.1, 0.2, "hi".into())).is_err());
    }

    #[test]
    fn add_pin_then_list_at_position() {
        let mut app = TestHost::new(DesignReview::init);

        let mockup_id = app
            .call(|s| s.upload_mockup("Homepage v3".into(), "blob-9f2a".into(), 3))
            .unwrap();
        let pin_id = app
            .call(|s| s.add_pin(mockup_id.clone(), 0.42, 0.71, "Button feels too small here".into()))
            .unwrap();

        let pins = app.view(|s| s.list_pins(mockup_id)).unwrap();
        assert_eq!(pins.len(), 1);
        assert_eq!(pins[0].id, pin_id);
        assert_eq!(pins[0].x, 0.42);
        assert_eq!(pins[0].y, 0.71);
        assert_eq!(pins[0].text, "Button feels too small here");
        assert!(!pins[0].resolved);
        assert!(!pins[0].author.is_empty());
    }

    #[test]
    fn pins_are_scoped_to_their_mockup() {
        let mut app = TestHost::new(DesignReview::init);

        let mockup_a = app.call(|s| s.upload_mockup("A".into(), "blob-a".into(), 1)).unwrap();
        let mockup_b = app.call(|s| s.upload_mockup("B".into(), "blob-b".into(), 1)).unwrap();
        app.call(|s| s.add_pin(mockup_a.clone(), 0.1, 0.1, "on A".into())).unwrap();
        app.call(|s| s.add_pin(mockup_b.clone(), 0.2, 0.2, "on B".into())).unwrap();

        assert_eq!(app.view(|s| s.list_pins(mockup_a)).unwrap().len(), 1);
        assert_eq!(app.view(|s| s.list_pins(mockup_b)).unwrap().len(), 1);
    }

    #[test]
    fn author_can_edit_own_pin() {
        let mut app = TestHost::new(DesignReview::init);

        let mockup_id = app.call(|s| s.upload_mockup("A".into(), "blob-a".into(), 1)).unwrap();
        let pin_id = app.call(|s| s.add_pin(mockup_id.clone(), 0.1, 0.1, "v1".into())).unwrap();
        app.call(|s| s.edit_pin(pin_id.clone(), "v2".into())).unwrap();

        let pins = app.view(|s| s.list_pins(mockup_id)).unwrap();
        assert_eq!(pins[0].text, "v2");
    }

    #[test]
    fn non_author_cannot_edit_pin() {
        let mut app = TestHost::new(DesignReview::init);

        let mockup_id = app.call(|s| s.upload_mockup("A".into(), "blob-a".into(), 1)).unwrap();
        let pin_id = app.call(|s| s.add_pin(mockup_id.clone(), 0.1, 0.1, "v1".into())).unwrap();

        let denied = app.call_as(OTHER, |s| s.edit_pin(pin_id.clone(), "hijacked".into()));
        assert!(denied.is_err());
        assert_eq!(app.view(|s| s.list_pins(mockup_id)).unwrap()[0].text, "v1");
    }

    #[test]
    fn author_can_remove_own_pin() {
        let mut app = TestHost::new(DesignReview::init);

        let mockup_id = app.call(|s| s.upload_mockup("A".into(), "blob-a".into(), 1)).unwrap();
        let pin_id = app.call(|s| s.add_pin(mockup_id.clone(), 0.1, 0.1, "v1".into())).unwrap();
        app.call(|s| s.remove_pin(pin_id)).unwrap();

        assert!(app.view(|s| s.list_pins(mockup_id)).unwrap().is_empty());
    }

    #[test]
    fn non_author_cannot_remove_pin() {
        let mut app = TestHost::new(DesignReview::init);

        let mockup_id = app.call(|s| s.upload_mockup("A".into(), "blob-a".into(), 1)).unwrap();
        let pin_id = app.call(|s| s.add_pin(mockup_id.clone(), 0.1, 0.1, "v1".into())).unwrap();

        let denied = app.call_as(OTHER, |s| s.remove_pin(pin_id));
        assert!(denied.is_err());
        assert_eq!(app.view(|s| s.list_pins(mockup_id)).unwrap().len(), 1);
    }

    #[test]
    fn any_teammate_can_resolve_a_pin() {
        let mut app = TestHost::new(DesignReview::init);

        let mockup_id = app.call(|s| s.upload_mockup("A".into(), "blob-a".into(), 1)).unwrap();
        let pin_id = app.call(|s| s.add_pin(mockup_id.clone(), 0.1, 0.1, "v1".into())).unwrap();

        // A different identity than the author resolves it — must be allowed.
        app.call_as(OTHER, |s| s.resolve_pin(pin_id)).unwrap();

        assert!(app.view(|s| s.list_pins(mockup_id)).unwrap()[0].resolved);
    }

    #[test]
    fn resolving_one_pin_leaves_others_untouched() {
        let mut app = TestHost::new(DesignReview::init);

        let mockup_id = app.call(|s| s.upload_mockup("A".into(), "blob-a".into(), 1)).unwrap();
        let pin_a = app.call(|s| s.add_pin(mockup_id.clone(), 0.1, 0.1, "a".into())).unwrap();
        let _pin_b = app.call(|s| s.add_pin(mockup_id.clone(), 0.2, 0.2, "b".into())).unwrap();

        app.call(|s| s.resolve_pin(pin_a.clone())).unwrap();

        let pins = app.view(|s| s.list_pins(mockup_id)).unwrap();
        let a = pins.iter().find(|p| p.id == pin_a).unwrap();
        let b = pins.iter().find(|p| p.id != pin_a).unwrap();
        assert!(a.resolved);
        assert!(!b.resolved);
    }

    #[test]
    fn resolve_pin_unknown_id_errors() {
        let mut app = TestHost::new(DesignReview::init);
        assert!(app.call(|s| s.resolve_pin("nope".into())).is_err());
    }

    #[test]
    fn edit_pin_unknown_id_errors() {
        let mut app = TestHost::new(DesignReview::init);
        assert!(app.call(|s| s.edit_pin("nope".into(), "x".into())).is_err());
    }
}
