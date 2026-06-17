//! Streak-board service — shared habit tracking with streaks and cheers.
//!
//! SDK workaround: AuthoredMap<K, V> requires V: Mergeable even for per-author
//! entries. Wrap every value in LwwRegister<T> to satisfy the bound.

use chat_types::ChatError;
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::{AuthoredMap, LwwRegister, StoreError};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

const MAX_TITLE_LEN: usize = 100;
const MAX_MESSAGE_LEN: usize = 280;

// ---------------------------------------------------------------------------
// Domain error mapper for authored operations
// ---------------------------------------------------------------------------

fn map_authored_error(action: &'static str) -> impl FnOnce(StoreError) -> AppError {
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

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Habit {
    pub id: String,
    pub author: String,
    pub title: String,
    pub current_streak: u32,
    pub longest_streak: u32,
    pub last_check_in_date: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct CheckIn {
    pub id: String,
    pub author: String,
    pub habit_id: String,
    pub date: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Cheer {
    pub id: String,
    pub author: String,
    pub habit_id: String,
    pub message: String,
    pub created_at: u64,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// AuthoredMap<K, V> requires V: Mergeable (SDK 0.11.0-rc.4), so all values
// are wrapped in LwwRegister<T> which satisfies that bound.
#[app::state(emits = for<'a> Event<'a>)]
pub struct StreakBoardState {
    habits: AuthoredMap<String, LwwRegister<Habit>>,
    check_ins: AuthoredMap<String, LwwRegister<CheckIn>>,
    cheers: AuthoredMap<String, LwwRegister<Cheer>>,
}

#[app::logic]
impl StreakBoardState {
    #[app::init]
    pub fn init() -> StreakBoardState {
        StreakBoardState {
            habits: AuthoredMap::new_with_field_name("board:habits"),
            check_ins: AuthoredMap::new_with_field_name("board:check_ins"),
            cheers: AuthoredMap::new_with_field_name("board:cheers"),
        }
    }

    // ---- Habits ----

    /// Create a new habit for the caller. Returns the generated habit id.
    pub fn create_habit(&mut self, title: String) -> app::Result<String> {
        if title.is_empty() {
            app::bail!(ChatError::Invalid("title must not be empty".into()));
        }
        let title: String = title.chars().take(MAX_TITLE_LEN).collect();
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;
        let id = format!("habit-{}-{}", now_ms, &caller[..8]);

        let habit = Habit {
            id: id.clone(),
            author: caller,
            title,
            current_streak: 0,
            longest_streak: 0,
            last_check_in_date: String::new(),
            created_at: now_ms,
        };

        self.habits
            .insert(id.clone(), LwwRegister::new(habit))
            .map_err(|e| AppError::msg(format!("habits.insert: {e}")))?;

        app::emit!(Event::HabitCreated { id: &id });
        Ok(id)
    }

    /// List all habits on the board.
    pub fn list_habits(&self) -> app::Result<Vec<Habit>> {
        let entries = self
            .habits
            .entries()
            .map_err(|e| AppError::msg(format!("habits.entries: {e}")))?;
        Ok(entries.map(|(_, v)| v.into_inner()).collect())
    }

    // ---- Check-ins ----

    /// Record that the caller completed their habit on `date` (YYYY-MM-DD).
    /// Only the habit's author may check in. Duplicate check-ins for the same
    /// date are rejected. Increments the streak on success.
    pub fn check_in(&mut self, habit_id: String, date: String) -> app::Result<String> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();

        // Look up the habit and verify ownership.
        let habit: Habit = self
            .habits
            .get(&habit_id)
            .map_err(|e| AppError::msg(format!("habits.get: {e}")))?
            .ok_or_else(|| AppError::msg(format!("habit not found: {}", habit_id)))?
            .clone()
            .into_inner();

        if habit.author != caller {
            app::bail!(ChatError::Forbidden(
                "can only check in your own habits".into()
            ));
        }

        // Reject duplicate: same author + habit + date.
        let all_check_ins: Vec<CheckIn> = self
            .check_ins
            .entries()
            .map_err(|e| AppError::msg(format!("check_ins.entries: {e}")))?
            .map(|(_, v)| v.into_inner())
            .collect();

        for ci in &all_check_ins {
            if ci.author == caller && ci.habit_id == habit_id && ci.date == date {
                app::bail!(ChatError::Invalid(
                    "already checked in for this date".into()
                ));
            }
        }

        let now_ms = storage_env::time_now() / 1_000_000;
        let id = format!("checkin-{}-{}", now_ms, &caller[..8]);

        // Update streak on the habit.
        let mut updated = habit;
        updated.current_streak += 1;
        if updated.current_streak > updated.longest_streak {
            updated.longest_streak = updated.current_streak;
        }
        updated.last_check_in_date = date.clone();

        self.habits
            .update(&habit_id, LwwRegister::new(updated))
            .map_err(map_authored_error("habits.update"))?;

        // Record the check-in.
        let record = CheckIn {
            id: id.clone(),
            author: caller,
            habit_id: habit_id.clone(),
            date,
            timestamp: now_ms,
        };

        self.check_ins
            .insert(id.clone(), LwwRegister::new(record))
            .map_err(|e| AppError::msg(format!("check_ins.insert: {e}")))?;

        app::emit!(Event::CheckedIn {
            id: &id,
            habit_id: &habit_id,
        });
        Ok(id)
    }

    /// Return all check-ins for a given habit.
    pub fn get_check_ins(&self, habit_id: String) -> app::Result<Vec<CheckIn>> {
        let entries = self
            .check_ins
            .entries()
            .map_err(|e| AppError::msg(format!("check_ins.entries: {e}")))?;
        Ok(entries
            .map(|(_, v)| v.into_inner())
            .filter(|ci| ci.habit_id == habit_id)
            .collect())
    }

    // ---- Cheers ----

    /// Send a cheer message to a habit. Anyone in the group may cheer any habit.
    pub fn send_cheer(&mut self, habit_id: String, message: String) -> app::Result<String> {
        // Verify habit exists.
        let exists = self
            .habits
            .contains(&habit_id)
            .map_err(|e| AppError::msg(format!("habits.contains: {e}")))?;
        if !exists {
            app::bail!(ChatError::NotFound(format!(
                "habit not found: {}",
                habit_id
            )));
        }

        if message.is_empty() {
            app::bail!(ChatError::Invalid("message must not be empty".into()));
        }
        let message: String = message.chars().take(MAX_MESSAGE_LEN).collect();

        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;
        let id = format!("cheer-{}-{}", now_ms, &caller[..8]);

        let cheer = Cheer {
            id: id.clone(),
            author: caller,
            habit_id: habit_id.clone(),
            message,
            created_at: now_ms,
        };

        self.cheers
            .insert(id.clone(), LwwRegister::new(cheer))
            .map_err(|e| AppError::msg(format!("cheers.insert: {e}")))?;

        app::emit!(Event::CheerSent {
            id: &id,
            habit_id: &habit_id,
        });
        Ok(id)
    }

    /// Return all cheers for a given habit.
    pub fn get_cheers(&self, habit_id: String) -> app::Result<Vec<Cheer>> {
        let entries = self
            .cheers
            .entries()
            .map_err(|e| AppError::msg(format!("cheers.entries: {e}")))?;
        Ok(entries
            .map(|(_, v)| v.into_inner())
            .filter(|c| c.habit_id == habit_id)
            .collect())
    }

    // ---- Leaderboard ----

    /// Return all habits sorted by `current_streak` descending.
    pub fn get_leaderboard(&self) -> app::Result<Vec<Habit>> {
        let entries = self
            .habits
            .entries()
            .map_err(|e| AppError::msg(format!("habits.entries: {e}")))?;
        let mut habits: Vec<Habit> = entries.map(|(_, v)| v.into_inner()).collect();
        habits.sort_by(|a, b| b.current_streak.cmp(&a.current_streak));
        Ok(habits)
    }
}
