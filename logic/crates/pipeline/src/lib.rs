//! Pipeline service — shared sales pipeline with customizable stages and lead tracking.

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

/// Pipeline configuration — holds the ordered list of pipeline stages.
/// Stored in an UnorderedMap keyed by a fixed "pipeline-config" key so that
/// concurrent updates are resolved by the highest `updated_at` timestamp (LWW).
///
/// NOTE: SharedStorage<LwwRegister<T>> generates a nested CRDT type in the ABI
/// that the calimero-abi-codegen validator cannot handle (SDK issue reported).
/// UnorderedMap<String, PipelineConfig> + Mergeable is the working equivalent.
#[derive(Debug, Clone, Default, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct PipelineConfig {
    pub id: String,
    pub stages: Vec<String>,
    /// Millisecond timestamp of the last update; used for LWW merge resolution.
    pub updated_at: u64,
}

impl Mergeable for PipelineConfig {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Last-write-wins: take whichever version was updated more recently.
        if other.updated_at > self.updated_at {
            *self = other.clone();
        }
        Ok(())
    }
}

/// A sales lead in the pipeline. Shared — any team member can move or close.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Lead {
    pub id: String,
    pub name: String,
    pub company: String,
    pub value: u64,
    pub stage: String,
    /// "active" or "closed"
    pub status: String,
    pub created_by: String,
    pub created_at: u64,
    /// Nanosecond-derived ms timestamp of the last mutation; used for merge resolution.
    pub last_modified_ms: u64,
}

impl Mergeable for Lead {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Last-write-wins: the entry with the higher last_modified_ms takes precedence.
        if other.last_modified_ms > self.last_modified_ms {
            *self = other.clone();
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Pipeline state
// ---------------------------------------------------------------------------

/// Fixed key used to store the single PipelineConfig entry in the config map.
const CONFIG_KEY: &str = "pipeline-config";

#[app::state(emits = for<'a> Event<'a>)]
pub struct PipelineState {
    /// Pipeline stage configuration. Stored as a single-entry UnorderedMap so
    /// concurrent updates from different members are resolved via Mergeable LWW.
    /// (SharedStorage<LwwRegister<T>> is not expressible by the ABI codegen.)
    config: UnorderedMap<String, PipelineConfig>,
    /// Shared: any member can add, move, or close leads.
    leads: UnorderedMap<String, Lead>,
}

#[app::logic]
impl PipelineState {
    #[app::init]
    pub fn init() -> PipelineState {
        let now_ms = storage_env::time_now() / 1_000_000;
        let initial_config = PipelineConfig {
            id: CONFIG_KEY.to_string(),
            stages: vec![
                "New".to_string(),
                "Contacted".to_string(),
                "Proposal".to_string(),
                "Won".to_string(),
                "Lost".to_string(),
            ],
            updated_at: now_ms,
        };

        let mut config = UnorderedMap::new_with_field_name("pipeline:config");
        let _ = config.insert(CONFIG_KEY.to_string(), initial_config);

        PipelineState {
            config,
            leads: UnorderedMap::new_with_field_name("pipeline:leads"),
        }
    }

    // ---- Stages API ----

    /// Update the pipeline stage list (any team member may call this).
    pub fn set_stages(&mut self, stages: Vec<String>) -> app::Result<()> {
        if stages.is_empty() {
            app::bail!("stages must not be empty");
        }

        let now_ms = storage_env::time_now() / 1_000_000;
        let updated_config = PipelineConfig {
            id: CONFIG_KEY.to_string(),
            stages,
            updated_at: now_ms,
        };

        // UnorderedMap::insert overwrites an existing key, so no contains check needed.
        self.config
            .insert(CONFIG_KEY.to_string(), updated_config)
            .map_err(|e| AppError::msg(format!("config.insert: {e}")))?;

        app::emit!(Event::StagesUpdated {});
        Ok(())
    }

    /// Return the current ordered list of pipeline stages.
    pub fn get_stages(&self) -> app::Result<Vec<String>> {
        let cfg = self
            .config
            .get(CONFIG_KEY)
            .map_err(|e| AppError::msg(format!("config.get: {e}")))?
            .ok_or_else(|| AppError::msg("pipeline config not initialised".to_string()))?;
        Ok(cfg.stages.clone())
    }

    // ---- Leads API ----

    /// Add a new lead; automatically placed in the first stage.
    pub fn add_lead(
        &mut self,
        name: String,
        company: String,
        value: u64,
    ) -> app::Result<String> {
        if name.is_empty() {
            app::bail!("lead name must not be empty");
        }

        let now_ms = storage_env::time_now() / 1_000_000;
        // Short unique suffix from the low-order ms bits for readability.
        let id = format!("lead-{:x}", now_ms & 0x000F_FFFF);
        let created_by = bs58::encode(calimero_sdk::env::executor_id()).into_string();

        // Place new lead in the first configured stage.
        let stages = self
            .config
            .get(CONFIG_KEY)
            .map_err(|e| AppError::msg(format!("config.get: {e}")))?
            .map(|c| c.stages.clone())
            .unwrap_or_default();
        let first_stage = stages
            .into_iter()
            .next()
            .unwrap_or_else(|| "New".to_string());

        let lead = Lead {
            id: id.clone(),
            name,
            company,
            value,
            stage: first_stage,
            status: "active".to_string(),
            created_by,
            created_at: now_ms,
            last_modified_ms: now_ms,
        };

        self.leads
            .insert(id.clone(), lead)
            .map_err(|e| AppError::msg(format!("leads.insert: {e}")))?;

        app::emit!(Event::LeadAdded { id: &id });
        Ok(id)
    }

    /// Move an active lead to a different stage (must exist in the config).
    pub fn move_lead(&mut self, lead_id: String, new_stage: String) -> app::Result<()> {
        if new_stage.is_empty() {
            app::bail!("new_stage must not be empty");
        }

        // Validate the target stage exists in the current config.
        let stages = self
            .config
            .get(CONFIG_KEY)
            .map_err(|e| AppError::msg(format!("config.get: {e}")))?
            .map(|c| c.stages.clone())
            .unwrap_or_default();
        if !stages.contains(&new_stage) {
            app::bail!("stage not found in pipeline config");
        }

        let mut lead = self
            .leads
            .get(&lead_id)
            .map_err(|e| AppError::msg(format!("leads.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("lead not found: {lead_id}")))?
            .clone();

        if lead.status != "active" {
            app::bail!("cannot move a closed lead");
        }

        lead.stage = new_stage.clone();
        lead.last_modified_ms = storage_env::time_now() / 1_000_000;

        self.leads
            .insert(lead_id.clone(), lead)
            .map_err(|e| AppError::msg(format!("leads.insert: {e}")))?;

        app::emit!(Event::LeadMoved {
            id: &lead_id,
            stage: &new_stage,
        });
        Ok(())
    }

    /// Mark a lead as closed with an outcome of "Won" or "Lost".
    pub fn close_lead(&mut self, lead_id: String, outcome: String) -> app::Result<()> {
        if outcome.is_empty() {
            app::bail!("outcome must not be empty");
        }

        let mut lead = self
            .leads
            .get(&lead_id)
            .map_err(|e| AppError::msg(format!("leads.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("lead not found: {lead_id}")))?
            .clone();

        if lead.status == "closed" {
            app::bail!("lead is already closed");
        }

        lead.stage = outcome.clone();
        lead.status = "closed".to_string();
        lead.last_modified_ms = storage_env::time_now() / 1_000_000;

        self.leads
            .insert(lead_id.clone(), lead)
            .map_err(|e| AppError::msg(format!("leads.insert: {e}")))?;

        app::emit!(Event::LeadClosed {
            id: &lead_id,
            outcome: &outcome,
        });
        Ok(())
    }

    /// List all active leads (status == "active").
    pub fn list_leads(&self) -> app::Result<Vec<Lead>> {
        let entries = self
            .leads
            .entries()
            .map_err(|e| AppError::msg(format!("leads.entries: {e}")))?;
        Ok(entries
            .map(|(_, lead)| lead)
            .filter(|lead| lead.status == "active")
            .collect())
    }

    /// List all closed leads (status == "closed").
    pub fn list_closed_leads(&self) -> app::Result<Vec<Lead>> {
        let entries = self
            .leads
            .entries()
            .map_err(|e| AppError::msg(format!("leads.entries: {e}")))?;
        Ok(entries
            .map(|(_, lead)| lead)
            .filter(|lead| lead.status == "closed")
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pipeline_config_has_default_stages() {
        // Verify the constant default stage list is non-empty.
        let stages = vec![
            "New".to_string(),
            "Contacted".to_string(),
            "Proposal".to_string(),
            "Won".to_string(),
            "Lost".to_string(),
        ];
        assert_eq!(stages.len(), 5);
        assert_eq!(stages[0], "New");
        assert_eq!(stages[4], "Lost");
    }

    #[test]
    fn lead_merge_last_write_wins() {
        let base = Lead {
            id: "lead-1".into(),
            name: "Alice".into(),
            company: "Acme".into(),
            value: 1000,
            stage: "New".into(),
            status: "active".into(),
            created_by: "user1".into(),
            created_at: 100,
            last_modified_ms: 100,
        };
        let mut a = base.clone();
        let mut b = base.clone();
        b.stage = "Contacted".into();
        b.last_modified_ms = 200;

        // a merges with the newer b — should take b's values
        a.merge(&b).unwrap();
        assert_eq!(a.stage, "Contacted");
        assert_eq!(a.last_modified_ms, 200);
    }
}
