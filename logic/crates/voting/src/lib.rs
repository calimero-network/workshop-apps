//! Voting service — single ranked-choice poll with live tally.

use std::collections::BTreeSet;

use chat_types::{generate_id, ChatError};
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_sdk::PublicKey;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{AuthoredMap, LwwRegister, Mergeable, SharedStorage};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// Poll — governed by the creator via SharedStorage. Only the creator can
/// change the title or close the poll.
#[derive(Debug, Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Poll {
    pub id: String,
    pub title: String,
    /// "pending" before create_poll is called; "open" while accepting votes;
    /// "closed" after the organizer closes.
    pub status: String,
    /// Unix timestamp in milliseconds at creation.
    pub created_at: u64,
}

/// A single option that group members can suggest.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct PollOption {
    pub id: String,
    pub label: String,
    /// Base58-encoded pubkey of the member who suggested this option.
    pub author: String,
    /// Unix timestamp in milliseconds at creation.
    pub created_at: u64,
}

impl Mergeable for PollOption {
    /// Required by SDK 0.11+ for AuthoredMap<String, PollOption>.
    /// Later-created entry wins on a concurrent-insert tiebreak.
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if other.created_at > self.created_at {
            *self = other.clone();
        }
        Ok(())
    }
}

/// A voter's complete ranked ordering of the poll options. One per voter;
/// keyed in AuthoredMap by the voter's base58 pubkey so resubmission
/// replaces the previous entry via `update`.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Ranking {
    pub id: String,
    /// Base58-encoded pubkey of the voter.
    pub author: String,
    /// Comma-separated option IDs from most to least preferred.
    pub ordered_option_ids: String,
    /// Unix timestamp in milliseconds of this submission.
    pub submitted_at: u64,
}

impl Mergeable for Ranking {
    /// Latest submission wins (voter may resubmit while poll is open).
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if other.submitted_at > self.submitted_at {
            *self = other.clone();
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn executor_pubkey() -> PublicKey {
    calimero_sdk::env::executor_id().into()
}

/// Map AuthoredMap storage errors to domain errors. `ActionNotAllowed` means
/// the caller is not the original author of the entry.
fn map_authored_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "can only {action} your own entries"
            )))
        } else {
            AppError::msg(format!("{action}: {s}"))
        }
    }
}

/// Map SharedStorage write errors to domain errors.
fn map_shared_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "{action}: caller is not the organizer"
            )))
        } else {
            AppError::msg(format!("poll.{action}: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// `#[app::state]` injects borsh derives + `#[borsh(crate = ...)]`; do NOT
// add them manually — that would cause a duplicate-derive compile error.
#[app::state(emits = for<'a> Event<'a>)]
pub struct VotingState {
    /// Governed poll metadata — only the creator (initial writer) can mutate.
    poll: SharedStorage<LwwRegister<Poll>>,
    /// Per-author options: storage rejects removals by non-authors.
    options: AuthoredMap<String, PollOption>,
    /// Per-voter rankings keyed by voter pubkey (b58). Each voter has exactly
    /// one entry; resubmission calls `update` to replace it.
    rankings: AuthoredMap<String, Ranking>,
}

#[app::logic]
impl VotingState {
    #[app::init]
    pub fn init() -> VotingState {
        let creator = executor_pubkey();
        let mut writers = BTreeSet::new();
        let _ = writers.insert(creator);

        // Seed SharedStorage with a "pending" placeholder so `get()` is
        // always valid; `create_poll` replaces it with the real data.
        let placeholder = Poll {
            id: String::new(),
            title: String::new(),
            status: "pending".into(),
            created_at: 0,
        };
        let mut poll = SharedStorage::new_with_field_name("voting:poll", writers, false);
        let _ = poll.insert(LwwRegister::new(placeholder));

        VotingState {
            poll,
            options: AuthoredMap::new_with_field_name("voting:options"),
            rankings: AuthoredMap::new_with_field_name("voting:rankings"),
        }
    }

    // ---- Poll lifecycle ----

    /// Create the poll. Only the context creator (sole initial writer) can
    /// call this. Returns the new poll ID.
    pub fn create_poll(&mut self, title: String) -> app::Result<String> {
        let executor = executor_pubkey();
        if !self.poll.writers().contains(&executor) {
            app::bail!(ChatError::Forbidden(
                "create_poll: caller is not the organizer".into()
            ));
        }

        let meta = self.read_poll()?;
        if !meta.id.is_empty() {
            app::bail!(ChatError::Invalid("poll already created".into()));
        }
        if title.is_empty() {
            app::bail!(ChatError::Invalid("title must not be empty".into()));
        }

        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let poll_id = generate_id("poll", now_ms, &nonce);

        let updated = Poll {
            id: poll_id.clone(),
            title: title.chars().take(256).collect(),
            status: "open".into(),
            created_at: now_ms,
        };
        self.write_poll("create_poll", updated)?;
        app::emit!(Event::PollCreated { id: &poll_id });
        Ok(poll_id)
    }

    /// Add a vote option. Poll must be open. Returns the new option ID.
    pub fn add_option(&mut self, label: String) -> app::Result<String> {
        let meta = self.read_poll()?;
        if meta.status != "open" {
            app::bail!(ChatError::Invalid("poll is not open".into()));
        }
        if label.is_empty() {
            app::bail!(ChatError::Invalid("label must not be empty".into()));
        }

        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let opt_id = generate_id("opt", now_ms, &nonce);

        let option = PollOption {
            id: opt_id.clone(),
            label,
            author: caller,
            created_at: now_ms,
        };
        self.options
            .insert(opt_id.clone(), option)
            .map_err(|e| AppError::msg(format!("options.insert: {e}")))?;

        app::emit!(Event::OptionAdded { id: &opt_id });
        Ok(opt_id)
    }

    /// Remove an option. Only the original suggester can remove their own
    /// option — enforced by AuthoredMap at the storage layer.
    pub fn remove_option(&mut self, option_id: String) -> app::Result<()> {
        let exists = self
            .options
            .contains(&option_id)
            .map_err(|e| AppError::msg(format!("options.contains: {e}")))?;
        if !exists {
            app::bail!(ChatError::NotFound(option_id));
        }

        self.options
            .remove(&option_id)
            .map_err(map_authored_error("remove_option"))?;

        app::emit!(Event::OptionRemoved { id: &option_id });
        Ok(())
    }

    /// Submit or resubmit a ranking. Poll must be open. Each voter has
    /// exactly one ranking; calling this again replaces the previous one.
    /// Returns the ranking ID (stable across resubmissions).
    pub fn submit_ranking(&mut self, ordered_option_ids: Vec<String>) -> app::Result<String> {
        let meta = self.read_poll()?;
        if meta.status != "open" {
            app::bail!(ChatError::Invalid("poll is closed".into()));
        }
        if ordered_option_ids.is_empty() {
            app::bail!(ChatError::Invalid(
                "ranking must include at least one option".into()
            ));
        }

        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;

        // Determine whether this is a first submission or a resubmission,
        // and preserve the ranking ID across resubmissions.
        let existing = self
            .rankings
            .get(&caller)
            .map_err(|e| AppError::msg(format!("rankings.get: {e}")))?;

        let (rank_id, is_update) = match existing {
            Some(r) => (r.id.clone(), true),
            None => {
                let mut nonce = [0u8; 4];
                calimero_sdk::env::random_bytes(&mut nonce);
                (generate_id("rank", now_ms, &nonce), false)
            }
        };

        let ranking = Ranking {
            id: rank_id.clone(),
            author: caller.clone(),
            ordered_option_ids: ordered_option_ids.join(","),
            submitted_at: now_ms,
        };

        if is_update {
            self.rankings
                .update(&caller, ranking)
                .map_err(|e| AppError::msg(format!("rankings.update: {e}")))?;
        } else {
            self.rankings
                .insert(caller, ranking)
                .map_err(|e| AppError::msg(format!("rankings.insert: {e}")))?;
        }

        app::emit!(Event::RankingSubmitted { id: &rank_id });
        Ok(rank_id)
    }

    // ---- View methods ----

    /// Return the current poll state.
    pub fn get_poll(&self) -> app::Result<Poll> {
        self.read_poll()
    }

    /// Return all current options (order unspecified; sort by created_at on
    /// the frontend if deterministic display order is needed).
    pub fn get_options(&self) -> app::Result<Vec<PollOption>> {
        let entries = self
            .options
            .entries()
            .map_err(|e| AppError::msg(format!("options.entries: {e}")))?;
        Ok(entries.map(|(_, v)| v).collect())
    }

    /// Return all submitted rankings (one per voter).
    pub fn get_rankings(&self) -> app::Result<Vec<Ranking>> {
        let entries = self
            .rankings
            .entries()
            .map_err(|e| AppError::msg(format!("rankings.entries: {e}")))?;
        Ok(entries.map(|(_, v)| v).collect())
    }

    // ---- Close ----

    /// Close the poll. Only the organizer can call this. After closing,
    /// no further rankings can be submitted.
    pub fn close_poll(&mut self) -> app::Result<()> {
        let executor = executor_pubkey();
        if !self.poll.writers().contains(&executor) {
            app::bail!(ChatError::Forbidden(
                "close_poll: caller is not the organizer".into()
            ));
        }

        let mut meta = self.read_poll()?;
        if meta.status != "open" {
            app::bail!(ChatError::Invalid("poll is not open".into()));
        }
        meta.status = "closed".into();
        self.write_poll("close_poll", meta)?;
        app::emit!(Event::PollClosed {});
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

impl VotingState {
    fn read_poll(&self) -> app::Result<Poll> {
        Ok(self
            .poll
            .get()
            .map_err(|e| AppError::msg(format!("poll.get: {e}")))?
            .get()
            .clone())
    }

    fn write_poll(&mut self, action: &'static str, poll: Poll) -> app::Result<()> {
        self.poll
            .insert(LwwRegister::new(poll))
            .map_err(map_shared_error(action))?;
        Ok(())
    }
}
