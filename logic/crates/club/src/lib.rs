//! Club service — single shared workout club with workouts, cheers, and group settings.

use std::collections::BTreeSet;

use chat_types::ChatError;
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

const MAX_NAME_LEN: usize = 64;
const MAX_ACTIVITY_LEN: usize = 128;
const MAX_NOTE_LEN: usize = 512;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// Governed club metadata — only the creator (initial writer set) may mutate.
#[derive(Debug, Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct ClubSettings {
    pub id: String,
    pub name: String,
    pub weekly_goal: u32,
    pub created_at: u64,
}

/// A workout entry logged by a club member.
/// `cheer_count` is computed dynamically in `get_workouts` — stored as 0.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Workout {
    pub id: String,
    pub author: String,
    pub activity: String,
    pub duration_minutes: u32,
    pub note: String,
    pub cheer_count: u32,
    pub created_at: u64,
}

impl Mergeable for Workout {
    /// Deterministic tiebreak for concurrent same-author edits:
    /// prefer the version with lexicographically greater (activity, note).
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if (&other.activity, &other.note) > (&self.activity, &self.note) {
            self.activity = other.activity.clone();
            self.duration_minutes = other.duration_minutes;
            self.note = other.note.clone();
        }
        Ok(())
    }
}

/// A cheer cast by a member for a workout.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Cheer {
    pub id: String,
    pub author: String,
    pub workout_id: String,
    pub created_at: u64,
}

impl Mergeable for Cheer {
    /// Cheers are immutable once cast; no merge needed.
    fn merge(&mut self, _other: &Self) -> Result<(), MergeError> {
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn executor_b58() -> String {
    bs58::encode(calimero_sdk::env::executor_id()).into_string()
}

fn executor_pubkey() -> PublicKey {
    calimero_sdk::env::executor_id().into()
}

/// Map AuthoredMap `ActionNotAllowed` → `Forbidden` so the frontend gets a
/// friendly error instead of a raw storage error.
fn map_authored_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "can only {action} your own workouts"
            )))
        } else {
            AppError::msg(format!("{action}: {s}"))
        }
    }
}

/// Map SharedStorage `ActionNotAllowed` → `Forbidden`.
fn map_shared_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "{action}: only the club creator can change settings"
            )))
        } else {
            AppError::msg(format!("settings.{action}: {s}"))
        }
    }
}

/// Generate a unique prefixed ID using the current timestamp (ms) and 4 random bytes.
fn gen_id(prefix: &str) -> String {
    let now_ms = storage_env::time_now() / 1_000_000;
    let mut nonce = [0u8; 4];
    calimero_sdk::env::random_bytes(&mut nonce);
    let hex: String = nonce.iter().fold(String::with_capacity(8), |mut acc, b| {
        acc.push_str(&format!("{:02x}", b));
        acc
    });
    format!("{prefix}-{now_ms}-{hex}")
}

// ---------------------------------------------------------------------------
// Club state
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
pub struct ClubState {
    /// Governed settings — writer set is seeded with the creator at init time.
    settings: SharedStorage<LwwRegister<ClubSettings>>,
    /// Per-author workout entries — only the author may edit or delete.
    workouts: AuthoredMap<String, Workout>,
    /// Per-author cheers — one insert per caller per workout is enforced by
    /// the caller; any member may cheer any workout.
    cheers: AuthoredMap<String, Cheer>,
}

#[app::logic]
impl ClubState {
    /// Seed the SharedStorage writer set with the context creator and
    /// initialise all collections. `init_club` must be called next to
    /// supply the club name and weekly goal.
    #[app::init]
    pub fn init() -> ClubState {
        let creator: PublicKey = executor_pubkey();
        let mut writers = BTreeSet::new();
        let _ = writers.insert(creator);
        let mut settings =
            SharedStorage::new_with_field_name("club:settings", writers, false);
        // Insert a placeholder so `settings.get()` never fails before
        // `init_club` is called.
        let _ = settings.insert(LwwRegister::new(ClubSettings::default()));
        ClubState {
            settings,
            workouts: AuthoredMap::new_with_field_name("club:workouts"),
            cheers: AuthoredMap::new_with_field_name("club:cheers"),
        }
    }

    /// Initialise the club with a name and weekly workout goal.
    /// Must be called once by the creator immediately after context creation.
    /// Returns the generated club ID.
    pub fn init_club(&mut self, name: String, weekly_goal: u32) -> app::Result<String> {
        let existing = self.read_settings()?;
        if !existing.id.is_empty() {
            app::bail!(ChatError::Invalid("club already initialized".into()));
        }
        if name.is_empty() {
            app::bail!(ChatError::Invalid("club name must not be empty".into()));
        }
        let truncated_name: String = name.chars().take(MAX_NAME_LEN).collect();
        let club_id = gen_id("club");
        let now_ms = storage_env::time_now() / 1_000_000;
        let new_settings = ClubSettings {
            id: club_id.clone(),
            name: truncated_name,
            weekly_goal,
            created_at: now_ms,
        };
        self.write_settings("init_club", new_settings)?;
        app::emit!(Event::ClubInitialized { id: &club_id });
        Ok(club_id)
    }

    /// Update the weekly workout goal. Caller must be the club creator.
    pub fn set_weekly_goal(&mut self, goal: u32) -> app::Result<()> {
        let mut settings = self.read_settings()?;
        settings.weekly_goal = goal;
        self.write_settings("set_weekly_goal", settings)?;
        app::emit!(Event::WeeklyGoalUpdated { goal });
        Ok(())
    }

    /// Return current club settings (name, weekly goal, etc.).
    pub fn get_club_settings(&self) -> app::Result<ClubSettings> {
        self.read_settings()
    }

    /// Log a new workout entry. Returns the generated workout ID.
    pub fn log_workout(
        &mut self,
        activity: String,
        duration_minutes: u32,
        note: String,
    ) -> app::Result<String> {
        if activity.is_empty() {
            app::bail!(ChatError::Invalid("activity must not be empty".into()));
        }
        let activity: String = activity.chars().take(MAX_ACTIVITY_LEN).collect();
        let note: String = note.chars().take(MAX_NOTE_LEN).collect();
        let author = executor_b58();
        let workout_id = gen_id("wk");
        let now_ms = storage_env::time_now() / 1_000_000;
        let workout = Workout {
            id: workout_id.clone(),
            author: author.clone(),
            activity,
            duration_minutes,
            note,
            cheer_count: 0,
            created_at: now_ms,
        };
        self.workouts
            .insert(workout_id.clone(), workout)
            .map_err(|e| AppError::msg(format!("workouts.insert: {e}")))?;
        app::emit!(Event::WorkoutLogged {
            id: &workout_id,
            author: &author,
        });
        Ok(workout_id)
    }

    /// Edit an existing workout. Only the original author may edit.
    pub fn edit_workout(
        &mut self,
        id: String,
        activity: String,
        duration_minutes: u32,
        note: String,
    ) -> app::Result<()> {
        if activity.is_empty() {
            app::bail!(ChatError::Invalid("activity must not be empty".into()));
        }
        let mut workout = self
            .workouts
            .get(&id)
            .map_err(|e| AppError::msg(format!("workouts.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(id.clone())))?;
        workout.activity = activity.chars().take(MAX_ACTIVITY_LEN).collect();
        workout.duration_minutes = duration_minutes;
        workout.note = note.chars().take(MAX_NOTE_LEN).collect();
        self.workouts
            .update(&id, workout)
            .map_err(map_authored_error("edit"))?;
        app::emit!(Event::WorkoutEdited { id: &id });
        Ok(())
    }

    /// Delete a workout. Only the original author may delete.
    pub fn delete_workout(&mut self, id: String) -> app::Result<()> {
        let removed = self
            .workouts
            .remove(&id)
            .map_err(map_authored_error("delete"))?;
        if removed.is_none() {
            app::bail!(ChatError::NotFound(id));
        }
        app::emit!(Event::WorkoutDeleted { id: &id });
        Ok(())
    }

    /// Return all workouts sorted by most-recent first.
    /// `cheer_count` is computed from the cheers collection on each call.
    pub fn get_workouts(&self) -> app::Result<Vec<Workout>> {
        let mut workouts: Vec<Workout> = self
            .workouts
            .entries()
            .map_err(|e| AppError::msg(format!("workouts.entries: {e}")))?
            .map(|(_, v)| v)
            .collect();

        // Tally cheers per workout_id.
        let cheer_entries: Vec<Cheer> = self
            .cheers
            .entries()
            .map_err(|e| AppError::msg(format!("cheers.entries: {e}")))?
            .map(|(_, c)| c)
            .collect();

        let mut counts: std::collections::BTreeMap<String, u32> =
            std::collections::BTreeMap::new();
        for cheer in &cheer_entries {
            *counts.entry(cheer.workout_id.clone()).or_insert(0) += 1;
        }

        for w in &mut workouts {
            w.cheer_count = *counts.get(&w.id).unwrap_or(&0);
        }

        // Most-recent first.
        workouts.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(workouts)
    }

    /// Add a cheer to a workout. Returns the generated cheer ID.
    pub fn add_cheer(&mut self, workout_id: String) -> app::Result<String> {
        // Verify the target workout exists.
        let workout_exists = self
            .workouts
            .contains(&workout_id)
            .map_err(|e| AppError::msg(format!("workouts.contains: {e}")))?;
        if !workout_exists {
            app::bail!(ChatError::NotFound(workout_id));
        }

        let author = executor_b58();
        let cheer_id = gen_id("ch");
        let now_ms = storage_env::time_now() / 1_000_000;

        let cheer = Cheer {
            id: cheer_id.clone(),
            author,
            workout_id: workout_id.clone(),
            created_at: now_ms,
        };
        self.cheers
            .insert(cheer_id.clone(), cheer)
            .map_err(|e| AppError::msg(format!("cheers.insert: {e}")))?;

        app::emit!(Event::CheerAdded {
            id: &cheer_id,
            workout_id: &workout_id,
        });
        Ok(cheer_id)
    }

    /// Return all cheers for a given workout, sorted oldest-first.
    pub fn get_cheers(&self, workout_id: String) -> app::Result<Vec<Cheer>> {
        let mut cheers: Vec<Cheer> = self
            .cheers
            .entries()
            .map_err(|e| AppError::msg(format!("cheers.entries: {e}")))?
            .map(|(_, c)| c)
            .filter(|c| c.workout_id == workout_id)
            .collect();
        cheers.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        Ok(cheers)
    }
}

impl ClubState {
    fn read_settings(&self) -> app::Result<ClubSettings> {
        Ok(self
            .settings
            .get()
            .map_err(|e| AppError::msg(format!("settings.get: {e}")))?
            .get()
            .clone())
    }

    fn write_settings(&mut self, action: &'static str, settings: ClubSettings) -> app::Result<()> {
        self.settings
            .insert(LwwRegister::new(settings))
            .map_err(map_shared_error(action))?;
        Ok(())
    }
}
