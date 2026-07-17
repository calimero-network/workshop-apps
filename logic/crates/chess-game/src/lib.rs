//! chess-game service — a single shared live chess match between two players.
//!
//! One shared `Game` (the board/turn/status, each field a plain `LwwRegister`
//! so concurrent reads always see the latest committed move) plus an
//! append-only `moves` map keyed by move id (`UnorderedMap<String,
//! LwwRegister<Move>>` — each entry is written exactly once by `submit_move`
//! and never mutated again, so a plain `LwwRegister` wrapper is enough; no
//! hand-written `Mergeable`/`RekeyTarget` is needed anywhere in this crate).
//!
//! Move legality (piece geometry, path-blocking, check/checkmate/stalemate
//! detection) lives in `chess.rs` — a small, dependency-free rules engine
//! deliberately scoped to standard moves without castling/en-passant.
//! Local move preview + unlimited undo-before-submit are frontend-only
//! concerns and never touch this shared state.

use calimero_sdk::app;
use calimero_sdk::borsh::{BorshDeserialize, BorshSerialize};
use calimero_sdk::env;
use calimero_sdk::serde::{Deserialize, Serialize};
use calimero_sdk::types::Error as AppError;
use calimero_storage::collections::{LwwRegister, UnorderedMap};
use calimero_storage::env as storage_env;
use live_chess_types::{validate_label, generate_id, Error};

mod chess;
use chess::Color;

pub mod events;
use events::Event;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

/// A single submitted move. Borsh (for storage, wrapped in a `LwwRegister`)
/// and Serde (returned verbatim by `list_moves`) — no separate storage/view
/// split is needed since none of its fields nest a CRDT.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[borsh(crate = "calimero_sdk::borsh")]
#[serde(crate = "calimero_sdk::serde")]
pub struct Move {
    pub id: String,
    pub player: String,
    pub from_square: String,
    pub to_square: String,
    pub promotion: String,
    pub san: String,
    pub resulting_fen: String,
    pub move_number: u32,
    pub created_at: u64,
}

/// Read-shaped view of the shared game, returned by `get_game_state`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "calimero_sdk::serde")]
pub struct Game {
    pub id: String,
    pub white_player: String,
    pub black_player: String,
    pub board_fen: String,
    pub turn: String,
    pub status: String,
    pub result: String,
    pub move_count: u32,
    pub created_at: u64,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[app::state(emits = for<'a> Event<'a>)]
pub struct ChessGameState {
    id: LwwRegister<String>,
    white_player: LwwRegister<String>,
    black_player: LwwRegister<String>,
    board_fen: LwwRegister<String>,
    turn: LwwRegister<String>,
    status: LwwRegister<String>,
    result: LwwRegister<String>,
    move_count: LwwRegister<u32>,
    created_at: LwwRegister<u64>,
    /// Permanent, append-only submitted moves, keyed by generated move id.
    moves: UnorderedMap<String, LwwRegister<Move>>,
}

#[app::logic]
impl ChessGameState {
    #[app::init]
    pub fn init() -> ChessGameState {
        ChessGameState {
            id: LwwRegister::new(String::new()),
            white_player: LwwRegister::new(String::new()),
            black_player: LwwRegister::new(String::new()),
            board_fen: LwwRegister::new(String::new()),
            turn: LwwRegister::new(String::new()),
            status: LwwRegister::new("pending".to_string()),
            result: LwwRegister::new(String::new()),
            move_count: LwwRegister::new(0),
            created_at: LwwRegister::new(0),
            moves: UnorderedMap::new(),
        }
    }

    /// Create the game: caller becomes white, `opponent` becomes black.
    pub fn create_game(&mut self, opponent: String) -> app::Result<String> {
        if !self.id.get().is_empty() {
            app::bail!(Error::Invalid("game already created".into()));
        }
        validate_label(&opponent).map_err(AppError::from)?;

        let now = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let id = generate_id("game", now, &nonce);
        let white = Self::caller_b58();

        self.id.set(id.clone());
        self.white_player.set(white.clone());
        self.black_player.set(opponent.clone());
        self.board_fen
            .set(format!("{} w - 0 1", chess::STARTING_PLACEMENT));
        self.turn.set("white".to_string());
        self.status.set("active".to_string());
        self.result.set(String::new());
        self.move_count.set(0);
        self.created_at.set(now);

        app::emit!(Event::GameCreated {
            id: &id,
            white_player: &white,
            black_player: &opponent,
        });
        Ok(id)
    }

    /// Submit a legal move. Instant, permanent, and visible to the opponent
    /// as soon as this call commits.
    pub fn submit_move(&mut self, from: String, to: String, promotion: Option<String>) -> app::Result<String> {
        if self.status.get() != "active" {
            app::bail!(Error::Invalid("game is not active".into()));
        }
        let mover_color = self.caller_color()?;
        let expected_turn = mover_color.as_str();
        if self.turn.get() != expected_turn {
            return Err(AppError::from(Error::Forbidden("not your turn".into())));
        }

        let placement = self.board_fen.get().clone();
        let applied = chess::apply_player_move(&placement, &from, &to, mover_color, promotion.as_deref())
            .map_err(|e| AppError::from(Error::Invalid(e)))?;

        let opponent_color = mover_color.opposite();
        let opponent_in_check = chess::in_check(&applied.board, opponent_color);
        let opponent_has_moves = chess::has_any_legal_move(&applied.board, opponent_color);

        let (game_over, new_status, new_result): (bool, &'static str, String) = if !opponent_has_moves {
            if opponent_in_check {
                (true, "finished", format!("{}_wins", mover_color.as_str()))
            } else {
                (true, "finished", "draw".to_string())
            }
        } else {
            (false, "active", String::new())
        };

        let now = storage_env::time_now() / 1_000_000;
        let mut nonce = [0u8; 4];
        env::random_bytes(&mut nonce);
        let move_id = generate_id("move", now, &nonce);
        let move_number = self.move_count.get() + 1;
        let new_fen = format!(
            "{} {} - 0 {}",
            chess::placement_to_string(&applied.board),
            opponent_color.as_fen_char(),
            (move_number / 2) + 1,
        );
        let san = build_san(
            applied.piece,
            &from,
            &to,
            applied.captured,
            applied.promotion,
            opponent_in_check,
            game_over && opponent_in_check,
        );
        let player = Self::caller_b58();

        let mv = Move {
            id: move_id.clone(),
            player: player.clone(),
            from_square: from,
            to_square: to,
            promotion: promotion.unwrap_or_default(),
            san: san.clone(),
            resulting_fen: new_fen.clone(),
            move_number,
            created_at: now,
        };
        self.moves
            .insert(move_id.clone(), LwwRegister::new(mv))
            .map_err(|e| AppError::msg(format!("moves.insert: {e}")))?;

        self.board_fen.set(new_fen);
        self.turn.set(if game_over {
            String::new()
        } else {
            opponent_color.as_str().to_string()
        });
        self.status.set(new_status.to_string());
        self.result.set(new_result.clone());
        self.move_count.set(move_number);

        app::emit!(Event::MoveSubmitted {
            id: &move_id,
            player: &player,
            san: &san,
        });
        if game_over {
            app::emit!(Event::GameEnded {
                status: new_status,
                result: &new_result,
            });
        }
        Ok(move_id)
    }

    /// Resign the game; the other player wins.
    pub fn resign(&mut self) -> app::Result<()> {
        if self.status.get() != "active" {
            app::bail!(Error::Invalid("game is not active".into()));
        }
        let mover_color = self.caller_color()?;
        let winner = mover_color.opposite();
        let result = format!("{}_wins", winner.as_str());

        self.status.set("finished".to_string());
        self.result.set(result.clone());

        app::emit!(Event::GameEnded {
            status: "finished",
            result: &result,
        });
        Ok(())
    }

    /// All submitted moves, in ascending move order.
    pub fn list_moves(&self) -> app::Result<Vec<Move>> {
        let mut out: Vec<Move> = self
            .moves
            .entries()
            .map_err(|e| AppError::msg(format!("moves.entries: {e}")))?
            .map(|(_, reg)| reg.get().clone())
            .collect();
        out.sort_by_key(|m| m.move_number);
        Ok(out)
    }

    /// The current shared game state.
    pub fn get_game_state(&self) -> app::Result<Game> {
        Ok(Game {
            id: self.id.get().clone(),
            white_player: self.white_player.get().clone(),
            black_player: self.black_player.get().clone(),
            board_fen: self.board_fen.get().clone(),
            turn: self.turn.get().clone(),
            status: self.status.get().clone(),
            result: self.result.get().clone(),
            move_count: *self.move_count.get(),
            created_at: *self.created_at.get(),
        })
    }
}

impl ChessGameState {
    fn caller_b58() -> String {
        bs58::encode(env::executor_id()).into_string()
    }

    fn caller_color(&self) -> app::Result<Color> {
        let caller = Self::caller_b58();
        if caller == *self.white_player.get() {
            Ok(Color::White)
        } else if caller == *self.black_player.get() {
            Ok(Color::Black)
        } else {
            Err(AppError::from(Error::Forbidden("caller is not a player in this game".into())))
        }
    }
}

fn build_san(piece: char, from: &str, to: &str, captured: bool, promotion: Option<char>, check: bool, mate: bool) -> String {
    let letter = match piece.to_ascii_uppercase() {
        'N' => "N",
        'B' => "B",
        'R' => "R",
        'Q' => "Q",
        'K' => "K",
        _ => "",
    };
    let mut s = String::new();
    if letter.is_empty() && captured {
        s.push_str(&from[0..1]);
    }
    s.push_str(letter);
    if captured {
        s.push('x');
    }
    s.push_str(to);
    if let Some(p) = promotion {
        s.push('=');
        s.push(p.to_ascii_uppercase());
    }
    if mate {
        s.push('#');
    } else if check {
        s.push('+');
    }
    s
}

// ---------------------------------------------------------------------------
// In-process tests — one TestHost roundtrip per mutation.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use calimero_sdk::testing::TestHost;

    use super::*;

    const BLACK: [u8; 32] = [7u8; 32];
    const OTHER: [u8; 32] = [42u8; 32];

    fn black_id() -> String {
        bs58::encode(BLACK).into_string()
    }

    #[test]
    fn create_game_assigns_colors() {
        let mut app = TestHost::new(ChessGameState::init);
        let black = black_id();

        let id = app.call(|s| s.create_game(black.clone())).unwrap();
        let game = app.view(|s| s.get_game_state()).unwrap();

        assert_eq!(game.id, id);
        assert_eq!(game.black_player, black);
        assert_eq!(game.status, "active");
        assert_eq!(game.turn, "white");
        assert!(game.board_fen.starts_with(chess::STARTING_PLACEMENT));
        // `create_game` emits exactly one event.
        assert_eq!(app.events().len(), 1);
    }

    #[test]
    fn illegal_move_is_rejected_and_state_unchanged() {
        let mut app = TestHost::new(ChessGameState::init);
        app.call(|s| s.create_game(black_id())).unwrap();

        // A pawn cannot jump three squares.
        let result = app.call(|s| s.submit_move("e2".into(), "e5".into(), None));
        assert!(result.is_err());

        let game = app.view(|s| s.get_game_state()).unwrap();
        assert_eq!(game.move_count, 0);
        assert!(game.board_fen.starts_with(chess::STARTING_PLACEMENT));
    }

    #[test]
    fn turn_is_enforced() {
        let mut app = TestHost::new(ChessGameState::init);
        app.call(|s| s.create_game(black_id())).unwrap();

        app.call(|s| s.submit_move("e2".into(), "e4".into(), None)).unwrap();
        // White again, out of turn — must be rejected.
        let result = app.call(|s| s.submit_move("d2".into(), "d4".into(), None));
        assert!(result.is_err());
        assert_eq!(app.view(|s| s.get_game_state()).unwrap().move_count, 1);
    }

    #[test]
    fn moves_alternate_and_list_in_ascending_order() {
        let mut app = TestHost::new(ChessGameState::init);
        app.call(|s| s.create_game(black_id())).unwrap();

        app.call(|s| s.submit_move("e2".into(), "e4".into(), None)).unwrap();
        app.call_as(BLACK, |s| s.submit_move("e7".into(), "e5".into(), None))
            .unwrap();

        let moves = app.view(|s| s.list_moves()).unwrap();
        assert_eq!(moves.len(), 2);
        assert_eq!(moves[0].move_number, 1);
        assert_eq!(moves[1].move_number, 2);
        assert_eq!(app.view(|s| s.get_game_state()).unwrap().turn, "white");
    }

    #[test]
    fn non_player_cannot_submit_move() {
        let mut app = TestHost::new(ChessGameState::init);
        app.call(|s| s.create_game(black_id())).unwrap();

        let result = app.call_as(OTHER, |s| s.submit_move("e2".into(), "e4".into(), None));
        assert!(result.is_err());
    }

    #[test]
    fn resign_ends_the_game() {
        let mut app = TestHost::new(ChessGameState::init);
        app.call(|s| s.create_game(black_id())).unwrap();

        app.call(|s| s.resign()).unwrap();
        let game = app.view(|s| s.get_game_state()).unwrap();
        assert_eq!(game.status, "finished");
        assert_eq!(game.result, "black_wins");

        // No further moves are accepted once the game is finished.
        assert!(app
            .call(|s| s.submit_move("d2".into(), "d4".into(), None))
            .is_err());
    }

    #[test]
    fn fools_mate_ends_in_checkmate() {
        let mut app = TestHost::new(ChessGameState::init);
        app.call(|s| s.create_game(black_id())).unwrap();

        app.call(|s| s.submit_move("f2".into(), "f3".into(), None)).unwrap();
        app.call_as(BLACK, |s| s.submit_move("e7".into(), "e5".into(), None))
            .unwrap();
        app.call(|s| s.submit_move("g2".into(), "g4".into(), None)).unwrap();
        app.call_as(BLACK, |s| s.submit_move("d8".into(), "h4".into(), None))
            .unwrap();

        let game = app.view(|s| s.get_game_state()).unwrap();
        assert_eq!(game.status, "finished");
        assert_eq!(game.result, "black_wins");
    }
}
