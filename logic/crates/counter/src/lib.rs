//! Counter service — shared live counter with creator-gated reset.

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{Mergeable, UnorderedMap};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

/// Fixed key for the singleton counter entry.
const SINGLETON_KEY: &str = "ctr-1";

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// The shared counter state. There is exactly one of these per context,
/// stored under the fixed key `SINGLETON_KEY` in `counter`. Anyone can
/// increment; only the original creator can reset.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Counter {
    /// Stable identifier for the counter (always `"ctr-1"`).
    pub id: String,
    /// Current accumulated total.
    pub total: u64,
    /// Base58-encoded pubkey of the participant who last incremented (or reset).
    pub last_incremented_by: String,
    /// Unix timestamp in milliseconds of the last write.
    pub last_increment_at: u64,
    /// Base58-encoded pubkey of the context creator; used to gate `reset()`.
    pub creator: String,
}

impl Mergeable for Counter {
    /// Last-write-wins by `last_increment_at`. When two peers write
    /// concurrently, the one with the later timestamp is kept.  A creator's
    /// `reset()` carries `now_ms` at the time of the reset, so it beats
    /// any increments timestamped before that moment.
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        if other.last_increment_at > self.last_increment_at {
            *self = other.clone();
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Counter state
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct CounterState {
    /// Singleton map: only one key (`SINGLETON_KEY`) is ever written.
    /// `UnorderedMap` is used so that any participant can insert/update,
    /// unlike `SharedStorage` (creator-only) or `AuthoredMap` (author-only).
    counter: UnorderedMap<String, Counter>,
}

#[app::logic]
impl CounterState {
    #[app::init]
    pub fn init() -> CounterState {
        let creator = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;

        let mut counter = UnorderedMap::new_with_field_name("counter:counter");
        let entry = Counter {
            id: SINGLETON_KEY.to_string(),
            total: 0,
            last_incremented_by: creator.clone(),
            last_increment_at: now_ms,
            creator,
        };
        // Safe: map is empty at init; insert always succeeds here.
        let _ = counter.insert(SINGLETON_KEY.to_string(), entry);

        CounterState { counter }
    }

    /// Increment the shared counter by 1. Any participant may call this.
    /// Returns the new total after incrementing.
    pub fn increment(&mut self) -> app::Result<u64> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;

        let mut entry = self.load_counter()?;
        entry.total += 1;
        entry.last_incremented_by = caller.clone();
        entry.last_increment_at = now_ms;
        let new_total = entry.total;

        self.counter
            .insert(SINGLETON_KEY.to_string(), entry)
            .map_err(|e| AppError::msg(format!("counter.insert: {e}")))?;

        app::emit!(Event::CounterIncremented {
            by: &caller,
            total: new_total,
        });
        Ok(new_total)
    }

    /// Reset the counter back to zero. Only the original creator may call this.
    pub fn reset(&mut self) -> app::Result<()> {
        let caller = bs58::encode(calimero_sdk::env::executor_id()).into_string();
        let now_ms = storage_env::time_now() / 1_000_000;

        let mut entry = self.load_counter()?;
        if caller != entry.creator {
            app::bail!("forbidden: only the creator can reset the counter");
        }

        entry.total = 0;
        entry.last_incremented_by = caller.clone();
        entry.last_increment_at = now_ms;

        self.counter
            .insert(SINGLETON_KEY.to_string(), entry)
            .map_err(|e| AppError::msg(format!("counter.insert: {e}")))?;

        app::emit!(Event::CounterReset { by: &caller });
        Ok(())
    }

    /// Return the current counter state (id, total, last_incremented_by,
    /// last_increment_at, creator).
    pub fn get_counter(&self) -> app::Result<Counter> {
        self.load_counter()
    }
}

impl CounterState {
    /// Load the singleton counter entry, failing if the state was never
    /// initialised (should never happen after a valid `init()` call).
    fn load_counter(&self) -> app::Result<Counter> {
        self.counter
            .get(&SINGLETON_KEY.to_string())
            .map_err(|e| AppError::msg(format!("counter.get: {e}")))?
            .ok_or_else(|| AppError::msg("counter not initialised"))
    }
}
