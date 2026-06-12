//! Hub service — community directory for the decentra-forum.

use chat_types::ChatError;
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{Mergeable, UnorderedMap};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct CommunitySummary {
    pub id: String,
    pub name: String,
    pub topic: String,
    pub context_id: Option<String>,
    pub created_by: String,
    pub member_count: u64,
    pub created_at: u64,
}

impl Mergeable for CommunitySummary {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Last-non-empty-wins for context_id (atomic create+register fix-up)
        if self.context_id.is_none() && other.context_id.is_some() {
            self.context_id = other.context_id.clone();
        }
        // Monotonic for member_count
        if other.member_count > self.member_count {
            self.member_count = other.member_count;
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Hub state
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
pub struct HubState {
    communities: UnorderedMap<String, CommunitySummary>,
}

#[app::logic]
impl HubState {
    #[app::init]
    pub fn init() -> HubState {
        HubState {
            communities: UnorderedMap::new_with_field_name("hub:communities"),
        }
    }

    // ---- Hub API ----

    /// Register a new community in the hub directory. The client creates the
    /// community context first (via admin createContext), then calls this with
    /// the resulting context_id.
    pub fn register_community(
        &mut self,
        community_id: String,
        name: String,
        topic: String,
        context_id: String,
    ) -> app::Result<CommunitySummary> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();

        if name.is_empty() || name.chars().count() > 64 {
            app::bail!(ChatError::Invalid(
                "community name must be 1-64 characters".into()
            ));
        }
        if topic.chars().count() > 256 {
            app::bail!(ChatError::Invalid(
                "topic must be at most 256 characters".into()
            ));
        }
        if community_id.is_empty() {
            app::bail!(ChatError::Invalid(
                "community_id must not be empty".into()
            ));
        }
        if context_id.is_empty() {
            app::bail!(ChatError::Invalid("context_id must not be empty".into()));
        }

        // Idempotent: if the same community already exists with matching data, return it.
        if let Some(existing) = self
            .communities
            .get(&community_id)
            .map_err(|e| AppError::msg(format!("communities.get: {e}")))?
        {
            if existing.name == name
                && existing.created_by == caller
                && existing.context_id.as_deref() == Some(context_id.as_str())
            {
                return Ok(existing.clone());
            }
            app::bail!(ChatError::Invalid(
                "community with this id already exists".into()
            ));
        }

        let now_ms = storage_env::time_now() / 1_000_000;

        let summary = CommunitySummary {
            id: community_id.clone(),
            name: name.clone(),
            topic,
            context_id: Some(context_id),
            created_by: caller,
            member_count: 0,
            created_at: now_ms,
        };

        self.communities
            .insert(community_id.clone(), summary.clone())
            .map_err(|e| AppError::msg(format!("communities.insert: {e}")))?;

        app::emit!(Event::CommunityRegistered {
            id: &community_id,
            name: &name,
        });
        Ok(summary)
    }

    /// List all communities in the hub.
    pub fn get_communities(&self) -> app::Result<Vec<CommunitySummary>> {
        let entries = self
            .communities
            .entries()
            .map_err(|e| AppError::msg(format!("communities.entries: {e}")))?;
        Ok(entries.map(|(_, v)| v).collect())
    }

    /// Update a community's member count (called from the community service or admin).
    pub fn update_community_stats(
        &mut self,
        community_id: String,
        member_count: u64,
    ) -> app::Result<()> {
        let mut summary = self
            .communities
            .get(&community_id)
            .map_err(|e| AppError::msg(format!("communities.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(community_id.clone())))?
            .clone();

        summary.member_count = member_count;

        self.communities
            .insert(community_id.clone(), summary)
            .map_err(|e| AppError::msg(format!("communities.insert: {e}")))?;

        app::emit!(Event::CommunityStatsUpdated { id: &community_id });
        Ok(())
    }

    /// Remove a community from the hub directory.
    pub fn delete_community(&mut self, community_id: String) -> app::Result<()> {
        let exists = self
            .communities
            .contains(&community_id)
            .map_err(|e| AppError::msg(format!("communities.contains: {e}")))?;
        if !exists {
            app::bail!(ChatError::NotFound(community_id));
        }

        self.communities
            .remove(&community_id)
            .map_err(|e| AppError::msg(format!("communities.remove: {e}")))?;

        app::emit!(Event::CommunityDeleted { id: &community_id });
        Ok(())
    }
}
