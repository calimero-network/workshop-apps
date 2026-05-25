//! Portfolio service — founder updates, metrics, comments, and subscriptions.

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::AuthoredMap;
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Entity structs
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Update {
    pub id: String,
    pub company_name: String,
    pub author: String,
    pub body: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Metric {
    pub id: String,
    pub company_name: String,
    pub metric_name: String,
    pub value: String,
    pub author: String,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Comment {
    pub id: String,
    pub update_id: String,
    pub author: String,
    pub body: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Subscription {
    pub id: String,
    pub subscriber: String,
    pub company_name: String,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct PortfolioState {
    updates: AuthoredMap<String, Update>,
    metrics: AuthoredMap<String, Metric>,
    comments: AuthoredMap<String, Comment>,
    subscriptions: AuthoredMap<String, Subscription>,
}

#[app::logic]
impl PortfolioState {
    #[app::init]
    pub fn init() -> PortfolioState {
        PortfolioState {
            updates: AuthoredMap::new_with_field_name("portfolio:updates"),
            metrics: AuthoredMap::new_with_field_name("portfolio:metrics"),
            comments: AuthoredMap::new_with_field_name("portfolio:comments"),
            subscriptions: AuthoredMap::new_with_field_name("portfolio:subscriptions"),
        }
    }

    // ---- Updates ----

    /// Post a founder update. Returns the new update id.
    pub fn post_update(
        &mut self,
        company_name: String,
        body: String,
    ) -> app::Result<String> {
        let author = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ns = storage_env::time_now();
        let id = format!("upd-{:x}", now_ns);
        let update = Update {
            id: id.clone(),
            company_name,
            author,
            body,
            created_at: now_ns / 1_000_000,
        };
        self.updates
            .insert(id.clone(), update)
            .map_err(|e| AppError::msg(format!("updates.insert: {e}")))?;
        app::emit!(Event::UpdatePosted { id: &id });
        Ok(id)
    }

    /// Return all updates, newest first.
    pub fn get_updates(&self) -> app::Result<Vec<Update>> {
        let entries = self
            .updates
            .entries()
            .map_err(|e| AppError::msg(format!("updates.entries: {e}")))?;
        let mut updates: Vec<Update> = entries.map(|(_, v)| v).collect();
        updates.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(updates)
    }

    // ---- Metrics ----

    /// Log a metric value for a company. Returns the new metric id.
    pub fn log_metric(
        &mut self,
        company_name: String,
        metric_name: String,
        value: String,
    ) -> app::Result<String> {
        let author = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ns = storage_env::time_now();
        let timestamp_ms = now_ns / 1_000_000;
        let id = format!("met-{:x}", now_ns);
        let metric = Metric {
            id: id.clone(),
            company_name,
            metric_name,
            value,
            author,
            timestamp_ms,
        };
        self.metrics
            .insert(id.clone(), metric)
            .map_err(|e| AppError::msg(format!("metrics.insert: {e}")))?;
        app::emit!(Event::MetricLogged { id: &id });
        Ok(id)
    }

    /// Return the latest metric entry per (company_name, metric_name) pair.
    pub fn get_latest_metrics(&self) -> app::Result<Vec<Metric>> {
        let entries = self
            .metrics
            .entries()
            .map_err(|e| AppError::msg(format!("metrics.entries: {e}")))?;
        let mut latest: std::collections::BTreeMap<String, Metric> =
            std::collections::BTreeMap::new();
        for (_, metric) in entries {
            let key = format!("{}:{}", metric.company_name, metric.metric_name);
            let entry = latest.entry(key).or_insert_with(|| metric.clone());
            if metric.timestamp_ms > entry.timestamp_ms {
                *entry = metric;
            }
        }
        Ok(latest.into_values().collect())
    }

    // ---- Comments ----

    /// Post a comment on an update. Returns the new comment id.
    pub fn post_comment(
        &mut self,
        update_id: String,
        body: String,
    ) -> app::Result<String> {
        let author = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ns = storage_env::time_now();
        let id = format!("cmt-{:x}", now_ns);
        let comment = Comment {
            id: id.clone(),
            update_id,
            author,
            body,
            created_at: now_ns / 1_000_000,
        };
        self.comments
            .insert(id.clone(), comment)
            .map_err(|e| AppError::msg(format!("comments.insert: {e}")))?;
        app::emit!(Event::CommentPosted { id: &id });
        Ok(id)
    }

    /// Return all comments for a given update, oldest first.
    pub fn get_comments(&self, update_id: String) -> app::Result<Vec<Comment>> {
        let entries = self
            .comments
            .entries()
            .map_err(|e| AppError::msg(format!("comments.entries: {e}")))?;
        let mut comments: Vec<Comment> = entries
            .map(|(_, v)| v)
            .filter(|c| c.update_id == update_id)
            .collect();
        comments.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        Ok(comments)
    }

    // ---- Subscriptions ----

    /// Follow a company. Returns the new subscription id.
    pub fn follow_company(&mut self, company_name: String) -> app::Result<String> {
        let subscriber = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ns = storage_env::time_now();
        let id = format!("sub-{:x}", now_ns);
        let subscription = Subscription {
            id: id.clone(),
            subscriber,
            company_name,
        };
        self.subscriptions
            .insert(id.clone(), subscription)
            .map_err(|e| AppError::msg(format!("subscriptions.insert: {e}")))?;
        app::emit!(Event::CompanyFollowed { id: &id });
        Ok(id)
    }

    /// Return all subscriptions.
    pub fn get_subscriptions(&self) -> app::Result<Vec<Subscription>> {
        let entries = self
            .subscriptions
            .entries()
            .map_err(|e| AppError::msg(format!("subscriptions.entries: {e}")))?;
        Ok(entries.map(|(_, v)| v).collect())
    }
}
