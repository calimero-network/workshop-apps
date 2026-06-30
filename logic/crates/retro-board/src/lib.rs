//! Sprint-retro board service — one shared retrospective context.
//!
//! Three columns (`went_well` / `to_improve` / `action_items`) of cards that any
//! member can add, anyone can upvote (once per voter), and the author or the
//! facilitator can mark done / delete. The retro itself is named once by its
//! creator (the facilitator).
//!
//! Collection choices:
//! - The retro metadata is `governed` by its creator. It is a single
//!   creator-owned value, so it lives in plain scalar `LwwRegister` fields gated
//!   by a manual `created_by` check — `SharedStorage` is the documented trap for
//!   a single-creator value (writer-set machinery this spec doesn't need).
//! - Cards are a shared `UnorderedMap` rather than an `AuthoredMap`: the spec
//!   needs `toggle_done`/`delete` gated by author **or** facilitator, which the
//!   author-only `AuthoredMap` can't express. The owner gate is a two-line
//!   manual check instead. `CardEntry` nests a `LwwRegister<bool>` (`done`), so
//!   it hand-writes `Mergeable` + `RekeyTarget` (the scaffold `Item` pattern).
//! - Votes are an `UnorderedMap<String, LwwRegister<u64>>` keyed by
//!   `"{card_id}|{voter}"`, so a voter can upvote a card at most once and the map
//!   union-merges across replicas (the canonical kv-store pattern).

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::address::Id;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::rekey::{field_child_id, RekeyTarget};
use calimero_storage::collections::{LwwRegister, Mergeable, UnorderedMap};
use calimero_storage::env as storage_env;
use sprint_retro_types::{generate_id, validate_label, Error};

pub mod events;
use events::Event;

/// The three retro columns. `add_card` rejects anything else.
const COLUMNS: [&str; 3] = ["went_well", "to_improve", "action_items"];
/// Max length (Unicode scalar values) of a card's text.
const MAX_CARD_LEN: usize = 500;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// A card stored in the shared map. `author`/`column`/`text`/`created_at` are
/// set once at add time; `done` is the only mutable field, so it is a
/// `LwwRegister<bool>` (last-writer-wins on concurrent toggles). Because this
/// struct nests a CRDT and is stored as a map value, it implements `Mergeable`
/// and `RekeyTarget` by hand (see below). It is Borsh-only — callers get the
/// serde-able `Card` view instead.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct CardEntry {
    pub author: String,
    pub column: String,
    pub text: String,
    pub done: LwwRegister<bool>,
    pub created_at: u64,
}

/// Hand-written merge. The set-once fields tie-break deterministically so merge
/// is commutative even if two replicas raced the initial insert under the same
/// id; `done` delegates to its nested `LwwRegister` so the freshest toggle wins.
impl Mergeable for CardEntry {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if (other.created_at, &other.author, &other.column, &other.text)
            < (self.created_at, &self.author, &self.column, &self.text)
        {
            self.author = other.author.clone();
            self.column = other.column.clone();
            self.text = other.text.clone();
            self.created_at = other.created_at;
        }
        // `LwwRegister::merge` is infallible HLC last-writer-wins.
        self.done.merge(&other.done);
        Ok(())
    }
}

/// Deterministic re-keying for the nested `done` register (#2577): stored as a
/// map value it would be LWW'd as an opaque blob unless the register is re-keyed
/// under a field-namespaced child of the entry id, so every replica derives
/// identical ids and the register converges as a child entity.
impl RekeyTarget for CardEntry {
    fn rekey_relative_to(&mut self, parent_id: Id) {
        calimero_storage::rekey_field_if_supported!(
            &mut self.done,
            field_child_id(parent_id, "done")
        );
    }
}

/// Read-shaped card returned to callers. A named struct so the generated ABI
/// client gets typed fields.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct Card {
    pub id: String,
    pub author: String,
    pub column: String,
    pub text: String,
    pub done: bool,
    pub created_at: u64,
}

/// A single upvote, reconstructed from the `"{card_id}|{voter}"` map key.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct Vote {
    pub id: String,
    pub card_id: String,
    pub voter: String,
    pub voted_at: u64,
}

/// The retro metadata, assembled from the governed scalar registers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct RetroSession {
    pub id: String,
    pub name: String,
    pub created_by: String,
    pub created_at: u64,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// `#[app::state]` injects the borsh derives itself; a manual derive would collide.
#[app::state(emits = for<'a> Event<'a>)]
pub struct RetroBoard {
    /// Retro id, set once by `create_retro`.
    retro_id: LwwRegister<String>,
    /// Retro display name.
    retro_name: LwwRegister<String>,
    /// Base58 of the facilitator (creator). Empty until `create_retro` is called.
    created_by: LwwRegister<String>,
    /// Creation time (ms).
    created_at: LwwRegister<u64>,
    /// All cards across the three columns, keyed by generated id.
    cards: UnorderedMap<String, CardEntry>,
    /// Upvotes keyed by `"{card_id}|{voter}"`, value = vote time (ms).
    votes: UnorderedMap<String, LwwRegister<u64>>,
}

#[app::logic]
impl RetroBoard {
    #[app::init]
    pub fn init() -> RetroBoard {
        RetroBoard {
            retro_id: LwwRegister::new(String::new()),
            retro_name: LwwRegister::new(String::new()),
            created_by: LwwRegister::new(String::new()),
            created_at: LwwRegister::new(0),
            cards: UnorderedMap::new_with_field_name("retro:cards"),
            votes: UnorderedMap::new_with_field_name("retro:votes"),
        }
    }

    /// Create and name the retro. The caller becomes the facilitator. Created
    /// once; later calls are rejected.
    pub fn create_retro(&mut self, name: String) -> app::Result<String> {
        validate_label(&name).map_err(AppError::from)?;
        if !self.created_by.get().is_empty() {
            app::bail!(Error::Forbidden("retro already created".into()));
        }
        let now = now_ms();
        let id = generate_id("retro", now, &nonce());
        self.retro_id.set(id.clone());
        self.retro_name.set(name);
        self.created_by.set(caller());
        self.created_at.set(now);
        Ok(id)
    }

    /// Add a card to a column. The caller becomes the card's author. Returns the
    /// generated card id.
    pub fn add_card(&mut self, column: String, text: String) -> app::Result<String> {
        validate_column(&column)?;
        validate_text(&text)?;

        let now = now_ms();
        let id = generate_id("card", now, &nonce());
        let card = CardEntry {
            author: caller(),
            column: column.clone(),
            text,
            done: LwwRegister::new(false),
            created_at: now,
        };
        self.cards
            .insert(id.clone(), card)
            .map_err(|e| AppError::msg(format!("cards.insert: {e}")))?;

        app::emit!(Event::CardAdded {
            id: &id,
            column: &column,
        });
        Ok(id)
    }

    /// Upvote a card. A voter may upvote a given card at most once. Returns the
    /// vote id.
    pub fn upvote_card(&mut self, card_id: String) -> app::Result<String> {
        let exists = self
            .cards
            .contains(&card_id)
            .map_err(|e| AppError::msg(format!("cards.contains: {e}")))?;
        if !exists {
            app::bail!(Error::NotFound(card_id));
        }

        let voter = caller();
        let vote_id = format!("{card_id}|{voter}");
        let voted = self
            .votes
            .contains(&vote_id)
            .map_err(|e| AppError::msg(format!("votes.contains: {e}")))?;
        if voted {
            app::bail!(Error::Invalid("you already upvoted this card".into()));
        }
        self.votes
            .insert(vote_id.clone(), LwwRegister::new(now_ms()))
            .map_err(|e| AppError::msg(format!("votes.insert: {e}")))?;

        app::emit!(Event::CardVoted {
            card_id: &card_id,
            voter: &voter,
        });
        Ok(vote_id)
    }

    /// Toggle a card's done state. Gated to the author or the facilitator.
    pub fn toggle_done(&mut self, card_id: String) -> app::Result<()> {
        let caller = caller();
        let facilitator = self.created_by.get().clone();

        let mut guard = self
            .cards
            .get_mut(&card_id)
            .map_err(|e| AppError::msg(format!("cards.get_mut: {e}")))?
            .ok_or_else(|| AppError::from(Error::NotFound(card_id.clone())))?;
        if caller != guard.author && caller != facilitator {
            app::bail!(Error::Forbidden(
                "only the author or facilitator may toggle this card".into()
            ));
        }
        let done = !*guard.done.get();
        guard.done.set(done);
        drop(guard);

        app::emit!(Event::CardToggled {
            id: &card_id,
            done,
        });
        Ok(())
    }

    /// Delete a card. Gated to the author or the facilitator.
    pub fn delete_card(&mut self, card_id: String) -> app::Result<()> {
        let caller = caller();
        let facilitator = self.created_by.get().clone();

        let author = {
            let card = self
                .cards
                .get(&card_id)
                .map_err(|e| AppError::msg(format!("cards.get: {e}")))?
                .ok_or_else(|| AppError::from(Error::NotFound(card_id.clone())))?;
            card.author.clone()
        };
        if caller != author && caller != facilitator {
            app::bail!(Error::Forbidden(
                "only the author or facilitator may delete this card".into()
            ));
        }
        self.cards
            .remove(&card_id)
            .map_err(|e| AppError::msg(format!("cards.remove: {e}")))?;

        app::emit!(Event::CardDeleted { id: &card_id });
        Ok(())
    }

    /// All cards, sorted by creation time then id for a stable order.
    pub fn get_cards(&self) -> app::Result<Vec<Card>> {
        let mut out: Vec<Card> = self
            .cards
            .entries()
            .map_err(|e| AppError::msg(format!("cards.entries: {e}")))?
            .map(|(id, card)| Card {
                id,
                author: card.author.clone(),
                column: card.column.clone(),
                text: card.text.clone(),
                done: *card.done.get(),
                created_at: card.created_at,
            })
            .collect();
        out.sort_by(|a, b| (a.created_at, &a.id).cmp(&(b.created_at, &b.id)));
        Ok(out)
    }

    /// All upvotes for one card, sorted by vote time then id.
    pub fn get_votes(&self, card_id: String) -> app::Result<Vec<Vote>> {
        let mut out: Vec<Vote> = self
            .votes
            .entries()
            .map_err(|e| AppError::msg(format!("votes.entries: {e}")))?
            .filter_map(|(key, ts)| {
                let (cid, voter) = key.split_once('|')?;
                if cid != card_id {
                    return None;
                }
                Some(Vote {
                    id: key.clone(),
                    card_id: cid.to_string(),
                    voter: voter.to_string(),
                    voted_at: *ts.get(),
                })
            })
            .collect();
        out.sort_by(|a, b| (a.voted_at, &a.id).cmp(&(b.voted_at, &b.id)));
        Ok(out)
    }

    /// The retro metadata.
    pub fn get_retro(&self) -> app::Result<RetroSession> {
        Ok(RetroSession {
            id: self.retro_id.get().clone(),
            name: self.retro_name.get().clone(),
            created_by: self.created_by.get().clone(),
            created_at: *self.created_at.get(),
        })
    }
}

// ---------------------------------------------------------------------------
// Free helpers
// ---------------------------------------------------------------------------

/// Base58 of the current executor — the public, shareable member identity.
fn caller() -> String {
    bs58::encode(env::executor_id()).into_string()
}

/// `time_now()` is nanoseconds; the frontend compares to `Date.now()` (ms).
fn now_ms() -> u64 {
    storage_env::time_now() / 1_000_000
}

/// 4 random bytes for id generation.
fn nonce() -> [u8; 4] {
    let mut n = [0u8; 4];
    env::random_bytes(&mut n);
    n
}

fn validate_column(column: &str) -> app::Result<()> {
    if COLUMNS.contains(&column) {
        Ok(())
    } else {
        Err(AppError::from(Error::Invalid(format!(
            "unknown column '{column}'; expected went_well, to_improve, or action_items"
        ))))
    }
}

fn validate_text(text: &str) -> app::Result<()> {
    let len = text.trim().chars().count();
    if len == 0 {
        return Err(AppError::from(Error::Invalid(
            "card text must not be empty".into(),
        )));
    }
    if len > MAX_CARD_LEN {
        return Err(AppError::from(Error::Invalid(format!(
            "card text must be at most {MAX_CARD_LEN} characters"
        ))));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// In-process tests — one TestHost roundtrip per mutation.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use calimero_sdk::testing::TestHost;

    const FACILITATOR: [u8; 32] = [1u8; 32];
    const MEMBER: [u8; 32] = [2u8; 32];
    const STRANGER: [u8; 32] = [3u8; 32];

    #[test]
    fn create_retro_roundtrips_and_is_once() {
        let mut app = TestHost::new(RetroBoard::init);

        let id = app
            .call(|s| s.create_retro("Sprint 42 Retro".into()))
            .unwrap();
        let session = app.view(|s| s.get_retro()).unwrap();
        assert_eq!(session.id, id);
        assert_eq!(session.name, "Sprint 42 Retro");
        assert!(!session.created_by.is_empty());

        // Creating again is rejected (governed: created once).
        assert!(app.call(|s| s.create_retro("Another".into())).is_err());
    }

    #[test]
    fn add_card_roundtrips_and_emits() {
        let mut app = TestHost::new(RetroBoard::init);

        let id = app
            .call(|s| s.add_card("went_well".into(), "Shipped on time".into()))
            .unwrap();
        let cards = app.view(|s| s.get_cards()).unwrap();
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].id, id);
        assert_eq!(cards[0].column, "went_well");
        assert_eq!(cards[0].text, "Shipped on time");
        assert!(!cards[0].done);
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn add_card_rejects_bad_column_and_empty_text() {
        let mut app = TestHost::new(RetroBoard::init);
        assert!(app.call(|s| s.add_card("nope".into(), "x".into())).is_err());
        assert!(app
            .call(|s| s.add_card("went_well".into(), "   ".into()))
            .is_err());
    }

    #[test]
    fn upvote_counts_once_per_voter() {
        let mut app = TestHost::new(RetroBoard::init);
        let card = app
            .call(|s| s.add_card("to_improve".into(), "Flaky CI".into()))
            .unwrap();

        // Two distinct voters → two votes.
        app.call_as(MEMBER, |s| s.upvote_card(card.clone())).unwrap();
        app.call_as(STRANGER, |s| s.upvote_card(card.clone()))
            .unwrap();
        assert_eq!(app.view(|s| s.get_votes(card.clone())).unwrap().len(), 2);

        // The same voter upvoting again is rejected, count unchanged.
        assert!(app.call_as(MEMBER, |s| s.upvote_card(card.clone())).is_err());
        assert_eq!(app.view(|s| s.get_votes(card)).unwrap().len(), 2);
    }

    #[test]
    fn upvote_unknown_card_errors() {
        let mut app = TestHost::new(RetroBoard::init);
        assert!(app.call(|s| s.upvote_card("card-missing".into())).is_err());
    }

    #[test]
    fn toggle_done_by_author_then_facilitator() {
        let mut app = TestHost::new(RetroBoard::init);
        app.call_as(FACILITATOR, |s| s.create_retro("Retro".into()))
            .unwrap();
        let card = app
            .call_as(MEMBER, |s| s.add_card("action_items".into(), "Write docs".into()))
            .unwrap();

        // The author marks it done.
        app.call_as(MEMBER, |s| s.toggle_done(card.clone())).unwrap();
        assert!(app.view(|s| s.get_cards()).unwrap()[0].done);

        // The facilitator can toggle a card they didn't author.
        app.call_as(FACILITATOR, |s| s.toggle_done(card.clone()))
            .unwrap();
        assert!(!app.view(|s| s.get_cards()).unwrap()[0].done);

        // A stranger (neither author nor facilitator) is rejected.
        assert!(app.call_as(STRANGER, |s| s.toggle_done(card)).is_err());
    }

    #[test]
    fn delete_card_gated_to_author_or_facilitator() {
        let mut app = TestHost::new(RetroBoard::init);
        app.call_as(FACILITATOR, |s| s.create_retro("Retro".into()))
            .unwrap();
        let card = app
            .call_as(MEMBER, |s| s.add_card("went_well".into(), "Nice".into()))
            .unwrap();

        // A stranger cannot delete it.
        assert!(app.call_as(STRANGER, |s| s.delete_card(card.clone())).is_err());
        assert_eq!(app.view(|s| s.get_cards()).unwrap().len(), 1);

        // The facilitator can delete a member's card.
        app.call_as(FACILITATOR, |s| s.delete_card(card)).unwrap();
        assert_eq!(app.view(|s| s.get_cards()).unwrap().len(), 0);
    }
}
