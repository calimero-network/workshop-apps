//! Voting service — manage votes, rankings, and live results.

use chat_types::ChatError;
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{AuthoredMap, Mergeable, UnorderedMap};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

fn map_authored_error(action: &'static str)
    -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError
{
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "can only {action} your own ranking"
            )))
        } else {
            AppError::msg(format!("rankings.{action}: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// A vote with a title, options to rank, and a status ("open" | "closed").
/// Governance: only the creator can close it (enforced in application logic).
/// `Mergeable`: "closed" status is monotonic — once closed it never reopens.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Vote {
    pub id: String,
    pub title: String,
    pub options: Vec<String>,
    /// "open" or "closed"
    pub status: String,
    pub created_by: String,
    pub created_at_ms: u64,
}

impl Mergeable for Vote {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Status is monotonic: if either peer says "closed", it stays closed.
        if other.status == "closed" || self.status == "closed" {
            self.status = "closed".to_string();
        }
        Ok(())
    }
}

/// One participant's ranked ordering of the vote options.
/// Keyed in `AuthoredMap` by `"{caller_b58}-{vote_id}"` so each voter has
/// exactly one ranking per vote and only they can update it.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Ranking {
    /// Stable ID returned to the caller and used in update/event references.
    pub id: String,
    /// Base-58 public key of the voter.
    pub voter: String,
    /// The vote this ranking belongs to.
    pub vote_id: String,
    /// Options ordered best-to-worst.
    pub ranked_options: Vec<String>,
    pub submitted_at_ms: u64,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct VotingState {
    /// All votes, keyed by vote id.
    votes: UnorderedMap<String, Vote>,
    /// All rankings, keyed by "{voter_b58}-{vote_id}".
    /// AuthoredMap enforces that only the original inserter can update/remove.
    rankings: AuthoredMap<String, Ranking>,
}

#[app::logic]
impl VotingState {
    #[app::init]
    pub fn init() -> VotingState {
        VotingState {
            votes: UnorderedMap::new_with_field_name("voting:votes"),
            rankings: AuthoredMap::new_with_field_name("voting:rankings"),
        }
    }

    // -----------------------------------------------------------------------
    // Mutate: votes
    // -----------------------------------------------------------------------

    /// Create a new vote with the given title and options.
    /// Returns the new vote's id.
    pub fn create_vote(&mut self, title: String, options: Vec<String>) -> app::Result<String> {
        if title.is_empty() {
            app::bail!(ChatError::Invalid("title must not be empty".into()));
        }
        if options.is_empty() {
            app::bail!(ChatError::Invalid("options must not be empty".into()));
        }

        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;
        let id = format!("vote-{now_ms}");

        let vote = Vote {
            id: id.clone(),
            title,
            options,
            status: "open".to_string(),
            created_by: caller,
            created_at_ms: now_ms,
        };

        self.votes
            .insert(id.clone(), vote)
            .map_err(|e| AppError::msg(format!("votes.insert: {e}")))?;

        app::emit!(Event::VoteCreated { id: &id });
        Ok(id)
    }

    /// Close a vote so no further rankings can be submitted or updated.
    /// Only the original creator can close the vote.
    pub fn close_vote(&mut self, vote_id: String) -> app::Result<()> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();

        let mut vote = self
            .votes
            .get(&vote_id)
            .map_err(|e| AppError::msg(format!("votes.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("vote not found: {vote_id}")))?;

        if vote.created_by != caller {
            app::bail!(ChatError::Forbidden(
                "only the creator can close the vote".into()
            ));
        }

        if vote.status == "closed" {
            return Ok(()); // idempotent
        }

        vote.status = "closed".to_string();

        // UnorderedMap::insert upserts; the Mergeable impl will keep "closed".
        self.votes
            .insert(vote_id.clone(), vote)
            .map_err(|e| AppError::msg(format!("votes.insert: {e}")))?;

        app::emit!(Event::VoteClosed { id: &vote_id });
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Mutate: rankings
    // -----------------------------------------------------------------------

    /// Submit a ranking for an open vote.
    /// A voter may only submit one ranking per vote; use `update_ranking` to change it.
    /// Returns the new ranking's id.
    pub fn submit_ranking(
        &mut self,
        vote_id: String,
        ranked_options: Vec<String>,
    ) -> app::Result<String> {
        let vote = self
            .votes
            .get(&vote_id)
            .map_err(|e| AppError::msg(format!("votes.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("vote not found: {vote_id}")))?;

        if vote.status != "open" {
            app::bail!(ChatError::Invalid("vote is closed".into()));
        }

        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;

        // Key: one ranking per voter per vote
        let ranking_key = format!("{caller}-{vote_id}");
        let exists = self
            .rankings
            .contains(&ranking_key)
            .map_err(|e| AppError::msg(format!("rankings.contains: {e}")))?;

        if exists {
            app::bail!(ChatError::Invalid(
                "ranking already submitted; use update_ranking to change it".into()
            ));
        }

        let id = format!("ranking-{now_ms}");
        let ranking = Ranking {
            id: id.clone(),
            voter: caller,
            vote_id: vote_id.clone(),
            ranked_options,
            submitted_at_ms: now_ms,
        };

        self.rankings
            .insert(ranking_key, ranking)
            .map_err(|e| AppError::msg(format!("rankings.insert: {e}")))?;

        app::emit!(Event::RankingSubmitted {
            id: &id,
            vote_id: &vote_id,
        });
        Ok(id)
    }

    /// Update an existing ranking (identified by its id) with a new ordering.
    /// Only the original voter may update; the vote must still be open.
    pub fn update_ranking(
        &mut self,
        ranking_id: String,
        new_order: Vec<String>,
    ) -> app::Result<()> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();

        // Collect entries to free the immutable borrow before mutating.
        let entries: Vec<(String, Ranking)> = self
            .rankings
            .entries()
            .map_err(|e| AppError::msg(format!("rankings.entries: {e}")))?
            .collect();

        let (key, mut ranking) = entries
            .into_iter()
            .find(|(_, r)| r.id == ranking_id)
            .ok_or_else(|| AppError::msg(format!("ranking not found: {ranking_id}")))?;

        if ranking.voter != caller {
            app::bail!(ChatError::Forbidden(
                "only the voter can update their ranking".into()
            ));
        }

        // Check the vote is still open.
        let vote = self
            .votes
            .get(&ranking.vote_id)
            .map_err(|e| AppError::msg(format!("votes.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("vote not found: {}", ranking.vote_id)))?;

        if vote.status != "open" {
            app::bail!(ChatError::Invalid("vote is closed".into()));
        }

        ranking.ranked_options = new_order;
        ranking.submitted_at_ms = storage_env::time_now() / 1_000_000;

        self.rankings
            .update(&key, ranking)
            .map_err(map_authored_error("update"))?;

        app::emit!(Event::RankingUpdated { id: &ranking_id });
        Ok(())
    }

    // -----------------------------------------------------------------------
    // View: votes
    // -----------------------------------------------------------------------

    /// Return a single vote by id.
    pub fn get_vote(&self, vote_id: String) -> app::Result<Vote> {
        self.votes
            .get(&vote_id)
            .map_err(|e| AppError::msg(format!("votes.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("vote not found: {vote_id}")))
    }

    /// Return all votes (open and closed).
    pub fn list_votes(&self) -> app::Result<Vec<Vote>> {
        let entries = self
            .votes
            .entries()
            .map_err(|e| AppError::msg(format!("votes.entries: {e}")))?;
        Ok(entries.map(|(_, v)| v).collect())
    }

    // -----------------------------------------------------------------------
    // View: rankings
    // -----------------------------------------------------------------------

    /// Return all rankings submitted for a given vote.
    pub fn get_rankings_for_vote(&self, vote_id: String) -> app::Result<Vec<Ranking>> {
        let entries = self
            .rankings
            .entries()
            .map_err(|e| AppError::msg(format!("rankings.entries: {e}")))?;
        Ok(entries
            .filter(|(_, r)| r.vote_id == vote_id)
            .map(|(_, r)| r)
            .collect())
    }
}
