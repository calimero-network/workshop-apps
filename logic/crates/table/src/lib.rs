//! D&D table service — characters, game session, dice rolls, and shared game log.
//!
//! # Architecture
//! - `session`    : DM-governed (`SharedStorage`) — only the DM (context creator) can write.
//! - `characters` : Shared (`UnorderedMap`) — anyone can create; DM can adjust HP.
//! - `log`        : Authored (`AuthoredMap`) — each event is owned by its poster.

use std::collections::BTreeSet;

use chat_types::{generate_id, ChatError};
use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_sdk::PublicKey;
use calimero_storage::collections::crdt_meta::MergeError;
use calimero_storage::collections::{
    AuthoredMap, LwwRegister, Mergeable, SharedStorage, UnorderedMap,
};
use calimero_storage::env as storage_env;

pub mod events;
use events::Event;

/// Maximum length (Unicode scalar values) for log content.
const MAX_CONTENT_LEN: usize = 2000;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// A player character. Stored in an `UnorderedMap` so the DM can also write
/// (e.g. adjust HP). `updated_at` drives last-write-wins merging.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Character {
    pub id: String,
    /// Base58-encoded pubkey of the player who created this character.
    pub author: String,
    pub name: String,
    pub class: String,
    pub strength: u8,
    pub dexterity: u8,
    pub constitution: u8,
    pub intelligence: u8,
    pub wisdom: u8,
    pub charisma: u8,
    pub hp_current: u32,
    pub hp_max: u32,
    pub created_at: u64,
    /// Updated on every HP change; used for LWW conflict resolution.
    pub updated_at: u64,
}

impl Mergeable for Character {
    fn merge(&mut self, other: &Self) -> Result<(), MergeError> {
        // Last writer wins, determined by most-recent update timestamp.
        if other.updated_at > self.updated_at {
            *self = other.clone();
        }
        Ok(())
    }
}

/// Mutable game session metadata. Only the DM (creator) can write this via
/// `SharedStorage`. `Default` is required by `LwwRegister` inner type.
#[derive(Debug, Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct GameSession {
    pub id: String,
    /// Base58-encoded pubkey of the DM.
    pub dm_id: String,
    pub name: String,
    /// "lobby" | "exploring" | "combat" | "resting"
    pub game_state: String,
    pub current_dc: Option<u32>,
    pub current_turn_player: Option<String>,
    /// Ordered list of player IDs (b58 pubkeys) for combat initiative.
    pub turn_order: Vec<String>,
    /// Index into `turn_order` for the current turn.
    pub turn_index: u32,
    pub created_at: u64,
}

/// A single entry in the shared game log (chat message, roll result, system
/// event, etc.). `authored` ownership — each entry is locked to its poster.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct TableEvent {
    pub id: String,
    /// Base58-encoded pubkey of the poster.
    pub author: String,
    /// "message" | "roll" | "npc_roll" | "hp_change" | "system"
    pub event_type: String,
    /// Milliseconds since epoch.
    pub timestamp: u64,
    pub content: String,
    pub ability: Option<String>,
    pub d20_roll: Option<u32>,
    pub modifier: Option<i32>,
    pub total: Option<u32>,
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

/// D&D 5e floor ability modifier: floor((score − 10) / 2).
/// Arithmetic right-shift gives correct floor for negative values.
fn ability_modifier(score: u8) -> i32 {
    (score as i32 - 10) >> 1
}

/// Roll one d20 (result 1–20) using Calimero's on-chain RNG.
fn roll_d20() -> u32 {
    let mut buf = [0u8; 1];
    calimero_sdk::env::random_bytes(&mut buf);
    (buf[0] % 20 + 1) as u32
}

/// Map `ActionNotAllowed` storage errors to a `Forbidden` domain error.
fn map_shared_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "{action}: only the DM can perform this action"
            )))
        } else {
            AppError::msg(format!("{action}: {s}"))
        }
    }
}

/// Map `ActionNotAllowed` authored-map errors to a `Forbidden` domain error.
fn map_authored_error(
    action: &'static str,
) -> impl FnOnce(calimero_storage::collections::StoreError) -> AppError {
    move |e| {
        let s = e.to_string();
        if s.contains("ActionNotAllowed") {
            AppError::from(ChatError::Forbidden(format!(
                "{action}: not your entry"
            )))
        } else {
            AppError::msg(format!("{action}: {s}"))
        }
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
pub struct TableState {
    /// DM-governed session (only the context creator can write).
    session: SharedStorage<LwwRegister<GameSession>>,
    /// All player characters. DM can adjust HP; players own their own entries
    /// at creation time but HP edits are made via `UnorderedMap::insert`
    /// (LWW by `updated_at`).
    characters: UnorderedMap<String, Character>,
    /// Shared game log: chat messages, roll results, system events.
    log: AuthoredMap<String, TableEvent>,
}

#[app::logic]
impl TableState {
    /// Called once when the context is created. The context creator becomes
    /// the DM — they are the sole writer of the `SharedStorage` session.
    #[app::init]
    pub fn init() -> TableState {
        let creator = executor_pubkey();
        let dm_id = executor_b58();
        let mut writers = BTreeSet::new();
        let _ = writers.insert(creator);

        let now_ms = storage_env::time_now() / 1_000_000;
        let placeholder = GameSession {
            id: format!("game-{}", now_ms),
            dm_id,
            name: String::new(),
            game_state: "lobby".to_string(),
            current_dc: None,
            current_turn_player: None,
            turn_order: Vec::new(),
            turn_index: 0,
            created_at: now_ms,
        };

        let mut session =
            SharedStorage::new_with_field_name("table:session", writers, false);
        let _ = session.insert(LwwRegister::new(placeholder));

        TableState {
            session,
            characters: UnorderedMap::new_with_field_name("table:characters"),
            log: AuthoredMap::new_with_field_name("table:log"),
        }
    }

    // ---- Character API ----

    /// Create a character for the calling player. Each player may have one
    /// character per context. HP max is derived from constitution.
    pub fn create_character(
        &mut self,
        name: String,
        class: String,
        str: u8,
        dex: u8,
        con: u8,
        int: u8,
        wis: u8,
        cha: u8,
    ) -> app::Result<String> {
        let caller = executor_b58();
        let now = storage_env::time_now();
        let now_ms = now / 1_000_000;

        // One character per player — scan for existing.
        let already_exists = self
            .characters
            .entries()
            .map_err(|e| AppError::msg(format!("characters.entries: {e}")))?
            .any(|(_, c)| c.author == caller);
        if already_exists {
            app::bail!(ChatError::Invalid(
                "you already have a character at this table".into()
            ));
        }

        // D&D 5e: HP max = 10 (base d10) + constitution modifier.
        let con_mod = ability_modifier(con);
        let hp_max = (10_i32 + con_mod).max(1) as u32;

        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let char_id = generate_id("char", now, &nonce);

        let character = Character {
            id: char_id.clone(),
            author: caller,
            name: name.clone(),
            class,
            strength: str,
            dexterity: dex,
            constitution: con,
            intelligence: int,
            wisdom: wis,
            charisma: cha,
            hp_current: hp_max,
            hp_max,
            created_at: now_ms,
            updated_at: now_ms,
        };

        self.characters
            .insert(char_id.clone(), character)
            .map_err(|e| AppError::msg(format!("characters.insert: {e}")))?;

        app::emit!(Event::CharacterCreated {
            id: &char_id,
            name: &name,
        });
        Ok(char_id)
    }

    /// Return the calling player's character, if they have one.
    pub fn get_my_character(&self) -> app::Result<Character> {
        let caller = executor_b58();
        self.characters
            .entries()
            .map_err(|e| AppError::msg(format!("characters.entries: {e}")))?
            .find(|(_, c)| c.author == caller)
            .map(|(_, c)| c)
            .ok_or_else(|| AppError::from(ChatError::NotFound("no character for caller".into())))
    }

    /// Return all characters at the table.
    pub fn get_all_characters(&self) -> app::Result<Vec<Character>> {
        let chars: Vec<Character> = self
            .characters
            .entries()
            .map_err(|e| AppError::msg(format!("characters.entries: {e}")))?
            .map(|(_, c)| c)
            .collect();
        Ok(chars)
    }

    // ---- Game session API ----

    /// Configure the game name and mark the session as active. DM only.
    /// Returns the game ID.
    pub fn create_game(&mut self, name: String) -> app::Result<String> {
        self.require_dm()?;
        let now_ms = storage_env::time_now() / 1_000_000;
        let mut session = self.read_session()?;
        let game_id = format!("game-{}", now_ms);
        session.id = game_id.clone();
        session.name = name.clone();
        session.created_at = now_ms;
        if session.game_state == "lobby" {
            session.game_state = "exploring".to_string();
        }
        self.write_session("create_game", session)?;
        app::emit!(Event::GameCreated {
            id: &game_id,
            name: &name,
        });
        Ok(game_id)
    }

    /// Post a system log entry acknowledging a player invitation. DM only.
    /// (Actual Calimero context invitation is handled by the admin API.)
    pub fn invite_player(&mut self, player_id: String) -> app::Result<()> {
        self.require_dm()?;
        let caller = executor_b58();
        let now = storage_env::time_now();
        let now_ms = now / 1_000_000;
        let content = format!("{} was invited to join the table", player_id);
        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let evt_id = generate_id("evt", now, &nonce);
        let entry = TableEvent {
            id: evt_id.clone(),
            author: caller,
            event_type: "system".to_string(),
            timestamp: now_ms,
            content,
            ability: None,
            d20_roll: None,
            modifier: None,
            total: None,
        };
        self.log
            .insert(evt_id, entry)
            .map_err(map_authored_error("invite_player"))?;
        app::emit!(Event::MessagePosted {});
        Ok(())
    }

    /// Return the current game session info.
    pub fn get_game_info(&self) -> app::Result<GameSession> {
        self.read_session()
    }

    /// Change the game state (e.g. "exploring", "combat", "resting"). DM only.
    pub fn set_game_state(&mut self, state: String) -> app::Result<()> {
        self.require_dm()?;
        let mut session = self.read_session()?;
        session.game_state = state.clone();
        self.write_session("set_game_state", session)?;
        app::emit!(Event::GameStateChanged { state: &state });
        Ok(())
    }

    /// Set the difficulty class for the current challenge. DM only.
    pub fn set_difficulty(&mut self, dc: u32) -> app::Result<()> {
        self.require_dm()?;
        let mut session = self.read_session()?;
        session.current_dc = Some(dc);
        self.write_session("set_difficulty", session)?;
        app::emit!(Event::DifficultySet { dc });
        Ok(())
    }

    /// Set the initiative / turn order for combat. DM only.
    /// The first player in the list takes the first turn.
    pub fn set_turn_order(&mut self, players: Vec<String>) -> app::Result<()> {
        self.require_dm()?;
        let mut session = self.read_session()?;
        session.current_turn_player = players.first().cloned();
        session.turn_order = players;
        session.turn_index = 0;
        self.write_session("set_turn_order", session)?;
        Ok(())
    }

    /// Advance to the next turn in the initiative order. DM only.
    pub fn advance_turn(&mut self) -> app::Result<()> {
        self.require_dm()?;
        let mut session = self.read_session()?;
        if session.turn_order.is_empty() {
            app::bail!(ChatError::Invalid("no turn order set".into()));
        }
        let len = session.turn_order.len() as u32;
        session.turn_index = (session.turn_index + 1) % len;
        session.current_turn_player =
            session.turn_order.get(session.turn_index as usize).cloned();
        let player_snapshot = session
            .current_turn_player
            .clone()
            .unwrap_or_default();
        self.write_session("advance_turn", session)?;
        app::emit!(Event::TurnAdvanced {
            player: &player_snapshot,
        });
        Ok(())
    }

    // ---- Chat / log API ----

    /// Post a chat message to the shared game log.
    pub fn post_message(&mut self, text: String) -> app::Result<String> {
        if text.is_empty() {
            app::bail!(ChatError::Invalid("empty message".into()));
        }
        let truncated: String = text.chars().take(MAX_CONTENT_LEN).collect();
        let caller = executor_b58();
        let now = storage_env::time_now();
        let now_ms = now / 1_000_000;
        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let evt_id = generate_id("evt", now, &nonce);
        let entry = TableEvent {
            id: evt_id.clone(),
            author: caller,
            event_type: "message".to_string(),
            timestamp: now_ms,
            content: truncated,
            ability: None,
            d20_roll: None,
            modifier: None,
            total: None,
        };
        self.log
            .insert(evt_id.clone(), entry)
            .map_err(map_authored_error("post_message"))?;
        app::emit!(Event::MessagePosted {});
        Ok(evt_id)
    }

    // ---- Dice roll API ----

    /// Roll a d20 for a player's ability check and record the result. DM only.
    /// `player_id` is the player's base58 pubkey.
    pub fn roll_for_player(
        &mut self,
        player_id: String,
        ability: String,
        reason: String,
    ) -> app::Result<String> {
        self.require_dm()?;
        let caller = executor_b58();
        let now = storage_env::time_now();
        let now_ms = now / 1_000_000;

        // Find the player's character by author pubkey.
        let character = self
            .characters
            .entries()
            .map_err(|e| AppError::msg(format!("characters.entries: {e}")))?
            .find(|(_, c)| c.author == player_id)
            .map(|(_, c)| c)
            .ok_or_else(|| {
                AppError::from(ChatError::NotFound(format!(
                    "no character for player {player_id}"
                )))
            })?;

        let score = match ability.to_lowercase().as_str() {
            "strength" | "str" => character.strength,
            "dexterity" | "dex" => character.dexterity,
            "constitution" | "con" => character.constitution,
            "intelligence" | "int" => character.intelligence,
            "wisdom" | "wis" => character.wisdom,
            "charisma" | "cha" => character.charisma,
            _ => app::bail!(ChatError::Invalid(format!("unknown ability: {ability}"))),
        };

        let modifier = ability_modifier(score);
        let roll = roll_d20();
        let total = (roll as i32 + modifier).max(1) as u32;
        let content = format!(
            "{} — {} check for {}: d20({}) + mod({}) = {}",
            character.name, ability, reason, roll, modifier, total
        );

        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let evt_id = generate_id("evt", now, &nonce);
        let entry = TableEvent {
            id: evt_id.clone(),
            author: caller,
            event_type: "roll".to_string(),
            timestamp: now_ms,
            content,
            ability: Some(ability),
            d20_roll: Some(roll),
            modifier: Some(modifier),
            total: Some(total),
        };
        self.log
            .insert(evt_id.clone(), entry)
            .map_err(map_authored_error("roll_for_player"))?;
        app::emit!(Event::RollMade {
            id: &evt_id,
            total,
        });
        Ok(evt_id)
    }

    /// Roll a d20 for an NPC or monster with a fixed modifier. DM only.
    pub fn roll_npc(
        &mut self,
        npc_name: String,
        modifier: i32,
        reason: String,
    ) -> app::Result<String> {
        self.require_dm()?;
        let caller = executor_b58();
        let now = storage_env::time_now();
        let now_ms = now / 1_000_000;

        let roll = roll_d20();
        let total = (roll as i32 + modifier).max(1) as u32;
        let content = format!(
            "{} — {}: d20({}) + mod({}) = {}",
            npc_name, reason, roll, modifier, total
        );

        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let evt_id = generate_id("evt", now, &nonce);
        let entry = TableEvent {
            id: evt_id.clone(),
            author: caller,
            event_type: "npc_roll".to_string(),
            timestamp: now_ms,
            content,
            ability: None,
            d20_roll: Some(roll),
            modifier: Some(modifier),
            total: Some(total),
        };
        self.log
            .insert(evt_id.clone(), entry)
            .map_err(map_authored_error("roll_npc"))?;
        app::emit!(Event::RollMade {
            id: &evt_id,
            total,
        });
        Ok(evt_id)
    }

    // ---- HP management ----

    /// Adjust a character's `hp_current` by `delta` (positive = heal,
    /// negative = damage). Clamped to [0, hp_max]. DM only.
    pub fn adjust_hp(&mut self, character_id: String, delta: i32) -> app::Result<()> {
        self.require_dm()?;

        let mut character = self
            .characters
            .get(&character_id)
            .map_err(|e| AppError::msg(format!("characters.get: {e}")))?
            .ok_or_else(|| AppError::from(ChatError::NotFound(character_id.clone())))?;

        let new_hp = (character.hp_current as i32 + delta)
            .max(0)
            .min(character.hp_max as i32) as u32;
        character.hp_current = new_hp;
        character.updated_at = storage_env::time_now() / 1_000_000;

        // UnorderedMap::insert on an existing key triggers Mergeable::merge;
        // since updated_at is newer, the new value wins.
        self.characters
            .insert(character_id.clone(), character)
            .map_err(|e| AppError::msg(format!("characters.insert(hp): {e}")))?;

        // Post an HP change entry to the game log (DM is the author).
        let now = storage_env::time_now();
        let now_ms = now / 1_000_000;
        let caller = executor_b58();
        let content = format!(
            "HP adjusted by {} → {} HP remaining",
            delta, new_hp
        );
        let mut nonce = [0u8; 4];
        calimero_sdk::env::random_bytes(&mut nonce);
        let evt_id = generate_id("evt", now, &nonce);
        let log_entry = TableEvent {
            id: evt_id.clone(),
            author: caller,
            event_type: "hp_change".to_string(),
            timestamp: now_ms,
            content,
            ability: None,
            d20_roll: None,
            modifier: Some(delta),
            total: Some(new_hp),
        };
        let _ = self.log.insert(evt_id, log_entry);

        app::emit!(Event::HPAdjusted {
            character_id: &character_id,
            hp: new_hp,
        });
        Ok(())
    }

    // ---- Game log ----

    /// Return all game log entries sorted chronologically by timestamp.
    pub fn get_game_log(&self) -> app::Result<Vec<TableEvent>> {
        let mut events: Vec<TableEvent> = self
            .log
            .entries()
            .map_err(|e| AppError::msg(format!("log.entries: {e}")))?
            .map(|(_, v)| v)
            .collect();
        // Sort by (timestamp_ms, id) for a stable chronological order.
        events.sort_by(|a, b| (a.timestamp, &a.id).cmp(&(b.timestamp, &b.id)));
        Ok(events)
    }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

impl TableState {
    fn read_session(&self) -> app::Result<GameSession> {
        Ok(self
            .session
            .get()
            .map_err(|e| AppError::msg(format!("session.get: {e}")))?
            .get()
            .clone())
    }

    fn write_session(&mut self, action: &'static str, session: GameSession) -> app::Result<()> {
        self.session
            .insert(LwwRegister::new(session))
            .map_err(map_shared_error(action))?;
        Ok(())
    }

    /// Return `Forbidden` if the caller is not the DM (session writer set).
    fn require_dm(&self) -> app::Result<()> {
        let caller_pk = executor_pubkey();
        if !self.session.writers().contains(&caller_pk) {
            app::bail!(ChatError::Forbidden(
                "only the DM can perform this action".into()
            ));
        }
        Ok(())
    }
}

