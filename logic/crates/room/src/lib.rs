//! Room (per-match) service - one context per Ludo match, gated by exactly 4
//! seated players.
//!
//! CANONICAL multi-service instance crate. It runs in a SUBGROUP context (one
//! per match) created with `serviceName: "room"`. At `init` it is handed the
//! DIRECTORY context id + the directory-issued match id so it can xcall back
//! when the match ends. The start gate is enforced HERE, in WASM: no domain
//! mutation (roll/move) is accepted until exactly `min_members_to_start`
//! players have joined.
//!
//! Game model: 4 seats (0-3), assigned by join order (earliest `join_room`
//! timestamp wins seat 0, etc - deterministic across replicas because it's a
//! pure function of the CRDT-merged `members` map, so no separate seat field
//! is needed). Each seat has 4 tokens. A token's position is a single
//! `steps` counter: 0 = at home (not yet on the board), 1..=51 = on the
//! shared 52-square ring (mapped to an absolute square via the seat's start
//! offset), 52..=57 = the seat's private home stretch, 57 = home/finished.
//! Landing on an opponent's token on a non-safe shared square sends it back
//! home (steps = 0). Rolling a six grants an extra roll (turn does not
//! advance); once all 4 of a seat's tokens are home, the match finishes and
//! the directory is notified via `env::xcall`.

use calimero_sdk::app;
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::serde_json;
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::{LwwRegister, UnorderedMap};
use calimero_storage::env as storage_env;
use ludo_lounge_types::Error;

pub mod events;
use events::Event;

/// Total steps a token must take to reach home: 51 shared-ring squares
/// (steps 1..=51) + 6 private home-stretch squares (steps 52..=57).
const FINISHED: u32 = 57;
/// Length of the shared ring all 4 seats travel around.
const RING_LEN: u32 = 52;
/// Squares nobody can be captured on: each seat's own start square, plus the
/// 4 classic "star" squares, as absolute ring positions.
const SAFE_SQUARES: [u32; 8] = [0, 8, 13, 21, 26, 34, 39, 47];

fn start_square(seat: u32) -> u32 {
    (seat * (RING_LEN / 4)) % RING_LEN
}

/// Map a token's private `steps` to an absolute ring square. `None` once the
/// token has turned into its private home stretch (steps > 51) - no captures
/// there, and `None` while still at home (steps == 0).
fn abs_square(seat: u32, steps: u32) -> Option<u32> {
    if (1..=51).contains(&steps) {
        Some((start_square(seat) + steps - 1) % RING_LEN)
    } else {
        None
    }
}

fn is_safe(square: u32) -> bool {
    SAFE_SQUARES.contains(&square)
}

fn token_key(seat: u32, token_index: u32) -> String {
    format!("{seat}:{token_index}")
}

/// Read-shaped view of one token.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct TokenView {
    pub seat: u32,
    pub token_index: u32,
    pub steps: u32,
}

/// Read-shaped view of the whole board.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct BoardView {
    /// Seated players, base58, in seat order (fills up as they join).
    pub seats: Vec<String>,
    pub turn_seat: u32,
    pub pending_dice: u32,
    pub finished: bool,
    /// Base58 of the winner, empty until `finished`.
    pub winner: String,
    pub tokens: Vec<TokenView>,
}

#[app::state(emits = for<'a> Event<'a>)]
pub struct Room {
    /// The directory context id, base58, handed in at init - the xcall target.
    directory_context_id: LwwRegister<String>,
    /// The directory-issued match id, echoed back on finish for an O(1) lookup.
    room_id: LwwRegister<String>,
    /// The start gate threshold (also the seat cap - Ludo needs exactly 4).
    min_members: LwwRegister<u32>,
    /// Players that called join_room, keyed by base58 executor id; the value
    /// is the join timestamp, which deterministically orders seats 0..3.
    members: UnorderedMap<String, LwwRegister<u64>>,
    /// Win-lock: once set, all domain mutations are rejected.
    finished: LwwRegister<bool>,
    /// Base58 of the winning seat's player, set once at finish.
    winner: LwwRegister<String>,
    /// Seat (0-3) whose turn it currently is.
    turn_seat: LwwRegister<u32>,
    /// The current turn's rolled dice; 0 = nothing pending (must roll before
    /// moving).
    pending_dice: LwwRegister<u8>,
    /// Token positions, keyed by `"{seat}:{token_index}"` -> steps (0..=57).
    /// Missing entries default to 0 (still at home).
    tokens: UnorderedMap<String, LwwRegister<u8>>,
}

#[app::logic]
impl Room {
    #[app::init]
    pub fn init(directory_context_id: String, room_id: String, min_members_to_start: u32) -> Room {
        Room {
            directory_context_id: LwwRegister::new(directory_context_id),
            room_id: LwwRegister::new(room_id),
            min_members: LwwRegister::new(min_members_to_start),
            members: UnorderedMap::new_with_field_name("room:members"),
            finished: LwwRegister::new(false),
            winner: LwwRegister::new(String::new()),
            turn_seat: LwwRegister::new(0),
            pending_dice: LwwRegister::new(0),
            tokens: UnorderedMap::new_with_field_name("room:tokens"),
        }
    }

    /// Seat the caller. Idempotent (keyed by executor id). Rejects a 5th
    /// joiner once the seat cap is reached. Emits RoomStarted the first time
    /// the threshold is met.
    pub fn join_room(&mut self) -> app::Result<u32> {
        let me = self.caller_b58();
        let already = self
            .members
            .contains(&me)
            .map_err(|e| AppError::msg(format!("members.contains: {e}")))?;
        let was = self.member_count()?;
        let min = *self.min_members.get();
        if !already && was >= min {
            app::bail!(Error::Invalid("match is full".into()));
        }
        if !already {
            self.members
                .insert(me.clone(), LwwRegister::new(storage_env::time_now()))
                .map_err(|e| AppError::msg(format!("members.insert: {e}")))?;
        }
        let count = self.member_count()?;
        app::emit!(Event::MemberJoined { member: &me, count });
        if was < min && count >= min {
            app::emit!(Event::RoomStarted { count });
        }
        Ok(count)
    }

    pub fn member_count(&self) -> app::Result<u32> {
        Ok(self
            .members
            .len()
            .map_err(|e| AppError::msg(format!("members.len: {e}")))? as u32)
    }

    pub fn min_members(&self) -> app::Result<u32> {
        Ok(*self.min_members.get())
    }

    pub fn is_started(&self) -> app::Result<bool> {
        Ok(self.member_count()? >= *self.min_members.get())
    }

    /// Roll the dice for the seat whose turn it is. Errors if it isn't the
    /// caller's turn or a roll is already pending (must move first). If the
    /// roll leaves no legal move (all tokens home and no six, or every
    /// on-board token would overshoot home), the turn passes automatically.
    pub fn roll_dice(&mut self) -> app::Result<u32> {
        self.ensure_started()?;
        let seat = self.caller_seat_or_forbidden()?;
        let turn = *self.turn_seat.get();
        if seat != turn {
            app::bail!(Error::Forbidden("not your turn".into()));
        }
        if *self.pending_dice.get() != 0 {
            app::bail!(Error::Invalid("already rolled - move a token first".into()));
        }

        let mut nonce = [0u8; 1];
        env::random_bytes(&mut nonce);
        let value = (nonce[0] % 6) + 1;
        self.pending_dice.set(value);
        app::emit!(Event::DiceRolled { seat, value: value as u32 });

        if !self.has_valid_move(seat, value)? {
            self.pending_dice.set(0);
            let next = (turn + 1) % 4;
            self.turn_seat.set(next);
            app::emit!(Event::TurnAdvanced { seat: next });
        }
        Ok(value as u32)
    }

    /// Move one of the caller's tokens by the pending dice roll. Handles
    /// entering the board on a six, captures on non-safe shared squares, the
    /// win check (all 4 tokens home), and the six-grants-another-roll rule.
    pub fn move_token(&mut self, token_index: u32) -> app::Result<()> {
        self.ensure_started()?;
        if token_index > 3 {
            app::bail!(Error::Invalid("token_index must be 0..=3".into()));
        }
        let seat = self.caller_seat_or_forbidden()?;
        let turn = *self.turn_seat.get();
        if seat != turn {
            app::bail!(Error::Forbidden("not your turn".into()));
        }
        let dice = *self.pending_dice.get();
        if dice == 0 {
            app::bail!(Error::Invalid("roll the dice first".into()));
        }

        let key = token_key(seat, token_index);
        let steps = self.token_steps(&key)?;
        let new_steps: u8 = if steps == 0 {
            if dice != 6 {
                app::bail!(Error::Invalid("need a six to leave home".into()));
            }
            1
        } else {
            let sum = steps as u32 + dice as u32;
            if sum > FINISHED {
                app::bail!(Error::Invalid("that move overshoots home".into()));
            }
            sum as u8
        };

        // Capture: landing on a non-safe shared square sends any opponent
        // token there back home.
        if let Some(sq) = abs_square(seat, new_steps as u32) {
            if !is_safe(sq) {
                for other_seat in 0..4u32 {
                    if other_seat == seat {
                        continue;
                    }
                    for other_idx in 0..4u32 {
                        let okey = token_key(other_seat, other_idx);
                        let osteps = self.token_steps(&okey)?;
                        if abs_square(other_seat, osteps as u32) == Some(sq) {
                            self.set_token_steps(&okey, 0)?;
                            app::emit!(Event::TokenCaptured { seat: other_seat, token_index: other_idx });
                        }
                    }
                }
            }
        }

        self.set_token_steps(&key, new_steps)?;
        app::emit!(Event::TokenMoved { seat, token_index, steps: new_steps as u32 });

        let mut all_home = true;
        for t in 0..4u32 {
            if self.token_steps(&token_key(seat, t))? != FINISHED as u8 {
                all_home = false;
                break;
            }
        }

        if all_home {
            let winner = self.caller_b58();
            self.finished.set(true);
            self.winner.set(winner.clone());
            self.pending_dice.set(0);
            app::emit!(Event::MatchFinished { winner: &winner });
            self.notify_directory(&winner);
        } else if dice == 6 {
            self.pending_dice.set(0);
            app::emit!(Event::ExtraTurn { seat });
        } else {
            self.pending_dice.set(0);
            let next = (turn + 1) % 4;
            self.turn_seat.set(next);
            app::emit!(Event::TurnAdvanced { seat: next });
        }
        Ok(())
    }

    /// Full board snapshot for the frontend.
    pub fn get_board(&self) -> app::Result<BoardView> {
        let seats = self.seat_order()?;
        let mut tokens = Vec::with_capacity(16);
        for seat in 0..4u32 {
            for t in 0..4u32 {
                let steps = self.token_steps(&token_key(seat, t))?;
                tokens.push(TokenView { seat, token_index: t, steps: steps as u32 });
            }
        }
        Ok(BoardView {
            seats,
            turn_seat: *self.turn_seat.get(),
            pending_dice: *self.pending_dice.get() as u32,
            finished: *self.finished.get(),
            winner: self.winner.get().clone(),
            tokens,
        })
    }
}

impl Room {
    fn caller_b58(&self) -> String {
        bs58::encode(env::executor_id()).into_string()
    }

    /// Seats in join order (earliest timestamp first, id tie-break) - a pure
    /// function of the CRDT-merged `members` map, so identical across
    /// replicas without a separate seat-assignment field.
    fn seat_order(&self) -> app::Result<Vec<String>> {
        let mut entries: Vec<(String, u64)> = self
            .members
            .entries()
            .map_err(|e| AppError::msg(format!("members.entries: {e}")))?
            .map(|(k, v)| (k, *v.get()))
            .collect();
        entries.sort_by(|a, b| (a.1, &a.0).cmp(&(b.1, &b.0)));
        Ok(entries.into_iter().map(|(k, _)| k).collect())
    }

    fn caller_seat_or_forbidden(&self) -> app::Result<u32> {
        let me = self.caller_b58();
        self.seat_order()?
            .iter()
            .position(|p| p == &me)
            .map(|i| i as u32)
            .ok_or_else(|| AppError::from(Error::Forbidden("not a seated player".into())))
    }

    fn token_steps(&self, key: &str) -> app::Result<u8> {
        Ok(self
            .tokens
            .get(key)
            .map_err(|e| AppError::msg(format!("tokens.get: {e}")))?
            .map(|r| *r.get())
            .unwrap_or(0))
    }

    fn set_token_steps(&mut self, key: &str, steps: u8) -> app::Result<()> {
        // The `?` must not live inside the `if let` scrutinee: its `ControlFlow`
        // desugaring temporary would keep `self.tokens` mutably borrowed for the
        // whole `if`/`else`, conflicting with the `insert` call in the `else`
        // branch (E0499). Binding the result first ends that borrow immediately.
        let existing = self
            .tokens
            .get_mut(key)
            .map_err(|e| AppError::msg(format!("tokens.get_mut: {e}")))?;
        if let Some(mut guard) = existing {
            guard.set(steps);
        } else {
            self.tokens
                .insert(key.to_string(), LwwRegister::new(steps))
                .map_err(|e| AppError::msg(format!("tokens.insert: {e}")))?;
        }
        Ok(())
    }

    fn has_valid_move(&self, seat: u32, dice: u8) -> app::Result<bool> {
        for t in 0..4u32 {
            let steps = self.token_steps(&token_key(seat, t))?;
            if steps == 0 {
                if dice == 6 {
                    return Ok(true);
                }
            } else if steps as u32 + dice as u32 <= FINISHED {
                return Ok(true);
            }
        }
        Ok(false)
    }

    /// The START GATE. Every domain mutation calls this first.
    fn ensure_started(&self) -> app::Result<()> {
        if *self.finished.get() {
            app::bail!(Error::Invalid("match is finished".into()));
        }
        let count = self.member_count()?;
        let min = *self.min_members.get();
        if count < min {
            app::bail!(Error::Invalid(format!("waiting for players ({count}/{min})")));
        }
        Ok(())
    }

    /// Fire-and-forget xcall to the directory's `on_room_finished`.
    fn notify_directory(&self, winner: &str) {
        let dir = self.directory_context_id.get().clone();
        let room_id = self.room_id.get().clone();
        if let Ok(bytes) = bs58::decode(&dir).into_vec() {
            if let Ok(ctx) = <[u8; 32]>::try_from(bytes.as_slice()) {
                let params = serde_json::json!({ "room_id": room_id, "winner": winner });
                if let Ok(payload) = serde_json::to_vec(&params) {
                    // `env::xcall` panics under the native TestHost harness (it
                    // only dispatches on wasm32); the tests below drive
                    // `move_token` natively, so the real host call is
                    // wasm32-only here.
                    #[cfg(target_arch = "wasm32")]
                    env::xcall(&ctx, "on_room_finished", &payload);
                    #[cfg(not(target_arch = "wasm32"))]
                    let _ = (ctx, payload);
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests. The start-gate + turn-order invariants are per-caller (base58
// executor id), so they're driven with `TestHost::call_as` here, never in
// `converge_app` (every replica there shares one executor id). Dice-dependent
// paths (six-extra-turn, capture, win) are exercised by writing `pending_dice`
// / token `steps` directly via the private fields - the test module is a
// descendant of this one, so it has access - rather than depending on the
// real `env::random_bytes` outcome, which cargo test cannot pin.
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;
    use calimero_sdk::testing::TestHost;

    fn started_room() -> (TestHost<Room>, [[u8; 32]; 4]) {
        let ids = [[1u8; 32], [2u8; 32], [3u8; 32], [4u8; 32]];
        let mut app = TestHost::new(|| Room::init("11111111111111111111111111111111".into(), "room-1".into(), 4));
        for id in ids {
            app.call_as(id, |s| s.join_room()).unwrap();
        }
        (app, ids)
    }

    fn seat_id(app: &mut TestHost<Room>, ids: &[[u8; 32]; 4], seat: u32) -> [u8; 32] {
        let board = app.view(|s| s.get_board()).unwrap();
        let target = board.seats[seat as usize].clone();
        *ids.iter().find(|id| bs58::encode(**id).into_string() == target).unwrap()
    }

    #[test]
    fn gate_blocks_below_threshold_and_opens_at_it() {
        let mut app = TestHost::new(|| Room::init("11111111111111111111111111111111".into(), "room-1".into(), 4));
        let a = [1u8; 32];
        let b = [2u8; 32];
        let c = [3u8; 32];

        app.call_as(a, |s| s.join_room()).unwrap();
        app.call_as(b, |s| s.join_room()).unwrap();
        app.call_as(c, |s| s.join_room()).unwrap();
        assert!(!app.view(|s| s.is_started()).unwrap());
        assert!(app.call_as(a, |s| s.roll_dice()).is_err());

        let d = [4u8; 32];
        app.call_as(d, |s| s.join_room()).unwrap();
        assert!(app.view(|s| s.is_started()).unwrap());
    }

    #[test]
    fn join_room_rejects_a_fifth_player() {
        let (mut app, _ids) = started_room();
        let fifth = [9u8; 32];
        assert!(app.call_as(fifth, |s| s.join_room()).is_err());
        assert_eq!(app.view(|s| s.member_count()).unwrap(), 4);
    }

    #[test]
    fn only_the_current_turn_seat_may_roll_or_move() {
        let (mut app, ids) = started_room();
        let seat0 = seat_id(&mut app, &ids, 0);
        let seat1 = seat_id(&mut app, &ids, 1);

        // turn_seat starts at seat 0: seat 1 may neither roll nor move.
        assert!(app.call_as(seat1, |s| s.roll_dice()).is_err());
        app.call(|s| {
            s.set_token_steps("0:0", 1)?;
            s.pending_dice.set(3);
            Ok(())
        })
        .unwrap();
        assert!(app.call_as(seat1, |s| s.move_token(0)).is_err());

        // The current turn seat may act with the pending roll.
        assert!(app.call_as(seat0, |s| s.move_token(0)).is_ok());
    }

    #[test]
    fn rolling_a_six_enters_a_token_and_grants_an_extra_turn() {
        let (mut app, ids) = started_room();
        let seat0 = seat_id(&mut app, &ids, 0);

        app.call(|s| {
            s.pending_dice.set(6);
            Ok(())
        })
        .unwrap();
        app.call_as(seat0, |s| s.move_token(0)).unwrap();

        let board = app.view(|s| s.get_board()).unwrap();
        assert_eq!(board.tokens[0].steps, 1);
        assert_eq!(board.turn_seat, 0); // extra turn: still seat 0
        assert_eq!(board.pending_dice, 0); // must roll again
    }

    #[test]
    fn non_six_move_advances_the_turn() {
        let (mut app, ids) = started_room();
        let seat0 = seat_id(&mut app, &ids, 0);

        app.call(|s| {
            s.set_token_steps("0:0", 1)?;
            s.pending_dice.set(3);
            Ok(())
        })
        .unwrap();
        app.call_as(seat0, |s| s.move_token(0)).unwrap();

        let board = app.view(|s| s.get_board()).unwrap();
        assert_eq!(board.tokens[0].steps, 4);
        assert_eq!(board.turn_seat, 1);
    }

    #[test]
    fn cannot_leave_home_without_a_six() {
        let (mut app, ids) = started_room();
        let seat0 = seat_id(&mut app, &ids, 0);
        app.call(|s| {
            s.pending_dice.set(3);
            Ok(())
        })
        .unwrap();
        assert!(app.call_as(seat0, |s| s.move_token(0)).is_err());
    }

    #[test]
    fn landing_on_a_non_safe_square_captures_the_opponent() {
        let (mut app, ids) = started_room();
        let seat0 = seat_id(&mut app, &ids, 0);
        // Seat 0's token 0 sits on its start square (steps=1, square 0);
        // rolling a 5 lands it on square 5, non-safe.
        // Seat 1's token 0 is placed so it also occupies square 5.
        app.call(|s| {
            s.set_token_steps("0:0", 1)?;
            s.set_token_steps("1:0", 45)?;
            s.pending_dice.set(5);
            Ok(())
        })
        .unwrap();
        assert_eq!(abs_square(0, 6), Some(5));
        assert_eq!(abs_square(1, 45), Some(5));
        assert!(!is_safe(5));

        app.call_as(seat0, |s| s.move_token(0)).unwrap();

        let board = app.view(|s| s.get_board()).unwrap();
        assert_eq!(board.tokens[0].steps, 6); // seat 0 token 0
        assert_eq!(board.tokens[4].steps, 0); // seat 1 token 0, sent home
    }

    #[test]
    fn all_four_tokens_home_finishes_the_match_and_locks_it() {
        let (mut app, ids) = started_room();
        let seat0 = seat_id(&mut app, &ids, 0);

        app.call(|s| {
            s.set_token_steps("0:0", FINISHED as u8)?;
            s.set_token_steps("0:1", FINISHED as u8)?;
            s.set_token_steps("0:2", FINISHED as u8)?;
            s.set_token_steps("0:3", 51)?;
            s.pending_dice.set(6);
            Ok(())
        })
        .unwrap();
        app.call_as(seat0, |s| s.move_token(3)).unwrap();

        let board = app.view(|s| s.get_board()).unwrap();
        assert!(board.finished);
        assert_eq!(board.winner, bs58::encode(seat0).into_string());

        // Win-lock: further rolls/moves are rejected.
        assert!(app.call_as(seat0, |s| s.roll_dice()).is_err());
    }
}
