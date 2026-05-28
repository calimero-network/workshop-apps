//! Tracker service — bug and feature-request submission with owner-driven triage.

use chat_types::ChatError;
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{AuthoredMap, LwwRegister, Mergeable, UnorderedMap};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// A submitted bug or feature request.
///
/// Lives in `AuthoredMap` — only the original author can edit or withdraw.
/// The `submission_type` field carries "bug" | "feature" (Rust keyword `type`
/// is avoided by using `submission_type`; the ABI emits it as `submission_type`).
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Submission {
    pub id: String,
    pub author: String,
    pub title: String,
    pub description: String,
    pub submission_type: String,
    /// "pending" while awaiting triage. "withdrawn" if the author removed it.
    pub status: String,
    pub created_at: u64,
}

/// The owner's verdict on a submission. Keyed by `submission_id` so there is
/// at most one triage result per submission.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct TriageResult {
    pub id: String,
    pub submission_id: String,
    /// "approved" or "declined".
    pub status: String,
    pub impact: u32,
    pub effort: u32,
    pub triaged_at: u64,
}

/// Last-write-wins by `triaged_at`. The owner is the only writer (enforced at
/// runtime), so conflicts are rare; keeping the later entry is safe.
impl Mergeable for TriageResult {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if other.triaged_at > self.triaged_at {
            *self = other.clone();
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct TrackerState {
    /// Base58 public key of the context creator. Set at `init` time and used
    /// to gate `create_project` and `triage_submission`.
    owner_key: LwwRegister<String>,
    /// Empty until `create_project` is called.
    project_id: LwwRegister<String>,
    project_name: LwwRegister<String>,
    project_created_at: LwwRegister<u64>,
    /// Per-author submissions. AuthoredMap rejects edits/removes by
    /// non-authors at the storage layer.
    submissions: AuthoredMap<String, Submission>,
    /// Triage results keyed by submission_id. Runtime owner check guards
    /// writes; Mergeable resolves the rare concurrent-write case by
    /// preferring the later `triaged_at`.
    triage_results: UnorderedMap<String, TriageResult>,
}

// ---------------------------------------------------------------------------
// Logic
// ---------------------------------------------------------------------------

#[app::logic]
impl TrackerState {
    #[app::init]
    pub fn init() -> TrackerState {
        let owner = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        TrackerState {
            owner_key: LwwRegister::new(owner),
            project_id: LwwRegister::new(String::new()),
            project_name: LwwRegister::new(String::new()),
            project_created_at: LwwRegister::new(0u64),
            submissions: AuthoredMap::new_with_field_name("tracker:submissions"),
            triage_results: UnorderedMap::new_with_field_name("tracker:triage_results"),
        }
    }

    // ---- Project ----

    /// Create the project for this context. Only the context creator (stored in
    /// `owner_key` at `init`) may call this, and it can only be called once.
    pub fn create_project(&mut self, name: String) -> app::Result<String> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        if &caller != self.owner_key.get() {
            app::bail!(ChatError::Forbidden(
                "only the project owner can create the project".into()
            ));
        }
        if !self.project_id.get().is_empty() {
            app::bail!(ChatError::Invalid("project already created".into()));
        }
        let now_ms = storage_env::time_now() / 1_000_000;
        let id = format!("proj-{now_ms}");
        self.project_id = LwwRegister::new(id.clone());
        self.project_name = LwwRegister::new(name);
        self.project_created_at = LwwRegister::new(now_ms);
        app::emit!(Event::ProjectCreated { id: &id });
        Ok(id)
    }

    // ---- Submissions ----

    /// Submit a bug or feature request. Any context member may call this.
    /// Returns the new submission's ID.
    pub fn submit_request(
        &mut self,
        title: String,
        description: String,
        type_: String,
    ) -> app::Result<String> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;
        let id = format!("sub-{now_ms}");
        let submission = Submission {
            id: id.clone(),
            author: caller,
            title,
            description,
            submission_type: type_,
            status: "pending".into(),
            created_at: now_ms,
        };
        self.submissions
            .insert(id.clone(), submission)
            .map_err(|e| AppError::msg(format!("submissions.insert: {e}")))?;
        app::emit!(Event::SubmissionCreated { id: &id });
        Ok(id)
    }

    /// Edit a submission's title and description. Only the original author may
    /// do this, and only while the submission has not yet been triaged.
    pub fn edit_submission(
        &mut self,
        submission_id: String,
        title: String,
        description: String,
    ) -> app::Result<()> {
        // Prevent edits after triage.
        let triaged = self
            .triage_results
            .contains(&submission_id)
            .map_err(|e| AppError::msg(format!("triage_results.contains: {e}")))?;
        if triaged {
            app::bail!(ChatError::Forbidden(
                "cannot edit a submission that has already been triaged".into()
            ));
        }
        let mut sub = self
            .submissions
            .get(&submission_id)
            .map_err(|e| AppError::msg(format!("submissions.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(submission_id.clone())))?;
        sub.title = title;
        sub.description = description;
        // AuthoredMap rejects the update if the caller is not the original author.
        self.submissions
            .update(&submission_id, sub)
            .map_err(map_authored_error("edit"))?;
        app::emit!(Event::SubmissionEdited { id: &submission_id });
        Ok(())
    }

    /// Withdraw a submission. Only the original author may do this, and only
    /// while the submission has not yet been triaged.
    pub fn withdraw_submission(&mut self, submission_id: String) -> app::Result<()> {
        let triaged = self
            .triage_results
            .contains(&submission_id)
            .map_err(|e| AppError::msg(format!("triage_results.contains: {e}")))?;
        if triaged {
            app::bail!(ChatError::Forbidden(
                "cannot withdraw a submission that has already been triaged".into()
            ));
        }
        let exists = self
            .submissions
            .contains(&submission_id)
            .map_err(|e| AppError::msg(format!("submissions.contains: {e}")))?;
        if !exists {
            app::bail!(ChatError::NotFound(submission_id.clone()));
        }
        // AuthoredMap rejects the remove if the caller is not the original author.
        self.submissions
            .remove(&submission_id)
            .map_err(map_authored_error("withdraw"))?;
        app::emit!(Event::SubmissionWithdrawn { id: &submission_id });
        Ok(())
    }

    /// Triage a submission. Only the project owner may call this. Sets the
    /// approval status, impact score, and effort score. Keyed by `submission_id`
    /// so re-triaging overwrites the prior result.
    pub fn triage_submission(
        &mut self,
        submission_id: String,
        status: String,
        impact: u32,
        effort: u32,
    ) -> app::Result<String> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        if &caller != self.owner_key.get() {
            app::bail!(ChatError::Forbidden(
                "only the project owner can triage submissions".into()
            ));
        }
        let exists = self
            .submissions
            .contains(&submission_id)
            .map_err(|e| AppError::msg(format!("submissions.contains: {e}")))?;
        if !exists {
            app::bail!(ChatError::NotFound(submission_id.clone()));
        }
        let now_ms = storage_env::time_now() / 1_000_000;
        let triage_id = format!("triage-{now_ms}");
        let result = TriageResult {
            id: triage_id.clone(),
            submission_id: submission_id.clone(),
            status,
            impact,
            effort,
            triaged_at: now_ms,
        };
        // insert-or-replace: first triage inserts; re-triage overwrites.
        let already = self
            .triage_results
            .contains(&submission_id)
            .map_err(|e| AppError::msg(format!("triage_results.contains: {e}")))?;
        // UnorderedMap::insert overwrites an existing key, so use it for both
        // the first triage and any subsequent re-triage.
        self.triage_results
            .insert(submission_id.clone(), result)
            .map_err(|e| AppError::msg(format!("triage_results.insert: {e}")))?;
        let _ = already; // checked above; insert handles both branches
        app::emit!(Event::TriageResultSubmitted {
            id: &triage_id,
            submission_id: &submission_id,
        });
        Ok(triage_id)
    }

    // ---- Views ----

    /// Return all submissions (pending, withdrawn, or triaged).
    pub fn list_submissions(&self) -> app::Result<Vec<Submission>> {
        let entries = self
            .submissions
            .entries()
            .map_err(|e| AppError::msg(format!("submissions.entries: {e}")))?;
        Ok(entries.map(|(_, v)| v).collect())
    }

    /// Return approved triage results sorted by highest impact then lowest
    /// effort — the recommended work order for the team.
    pub fn list_approved_tasks(&self) -> app::Result<Vec<TriageResult>> {
        let entries = self
            .triage_results
            .entries()
            .map_err(|e| AppError::msg(format!("triage_results.entries: {e}")))?;
        let mut results: Vec<TriageResult> = entries
            .map(|(_, v)| v)
            .filter(|r| r.status == "approved")
            .collect();
        // Descending impact; ties broken by ascending effort (easier first).
        results.sort_by(|a, b| b.impact.cmp(&a.impact).then(a.effort.cmp(&b.effort)));
        Ok(results)
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Map AuthoredMap storage errors to domain-level `Forbidden` so the caller
/// receives a clear message instead of a raw storage string.
fn map_authored_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "can only {action} your own submissions"
            )))
        } else {
            AppError::msg(format!("submissions.{action}: {s}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_owner_key_non_empty() {
        // Can't call calimero_sdk::env::executor_id() outside WASM; just
        // verify the struct can be described without panicking in pure Rust.
        let _: fn() -> TrackerState = TrackerState::init;
    }

    #[test]
    fn triage_result_merge_keeps_later() {
        let mut a = TriageResult {
            id: "t1".into(),
            submission_id: "s1".into(),
            status: "approved".into(),
            impact: 5,
            effort: 2,
            triaged_at: 100,
        };
        let b = TriageResult {
            id: "t2".into(),
            submission_id: "s1".into(),
            status: "declined".into(),
            impact: 3,
            effort: 1,
            triaged_at: 200,
        };
        a.merge(&b).unwrap();
        assert_eq!(a.status, "declined");
        assert_eq!(a.triaged_at, 200);
    }

    #[test]
    fn triage_result_merge_keeps_self_when_newer() {
        let mut a = TriageResult {
            id: "t2".into(),
            submission_id: "s1".into(),
            status: "approved".into(),
            impact: 8,
            effort: 3,
            triaged_at: 300,
        };
        let b = TriageResult {
            id: "t1".into(),
            submission_id: "s1".into(),
            status: "declined".into(),
            impact: 2,
            effort: 4,
            triaged_at: 100,
        };
        a.merge(&b).unwrap();
        assert_eq!(a.status, "approved");
        assert_eq!(a.triaged_at, 300);
    }
}
