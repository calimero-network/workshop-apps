//! Minimal, self-contained chess rules engine used by `submit_move`.
//!
//! Deliberately scoped: standard piece movement + captures + check /
//! checkmate / stalemate detection, WITHOUT castling or en-passant (kept out
//! to bound complexity — the spec only requires legal-move rejection and
//! end-of-game detection, not full FIDE rules). Board state is represented as
//! the FEN piece-placement field only; `board_fen` in `Game` additionally
//! carries side-to-move / a placeholder castling+en-passant field / halfmove
//! / fullmove so it reads like a real FEN string.

pub type Board = [[u8; 8]; 8];

pub const STARTING_PLACEMENT: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Color {
    White,
    Black,
}

impl Color {
    pub fn opposite(self) -> Color {
        match self {
            Color::White => Color::Black,
            Color::Black => Color::White,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Color::White => "white",
            Color::Black => "black",
        }
    }

    pub fn as_fen_char(self) -> char {
        match self {
            Color::White => 'w',
            Color::Black => 'b',
        }
    }
}

/// The outcome of a single applied move: the resulting board, whether a
/// piece was captured, the promotion piece chosen (if any), and the letter
/// of the piece that moved (for SAN).
pub struct AppliedMove {
    pub board: Board,
    pub captured: bool,
    pub promotion: Option<char>,
    pub piece: char,
}

pub fn square_to_rc(sq: &str) -> Option<(usize, usize)> {
    let bytes = sq.as_bytes();
    if bytes.len() != 2 {
        return None;
    }
    let file = bytes[0];
    let rank = bytes[1];
    if !(b'a'..=b'h').contains(&file) || !(b'1'..=b'8').contains(&rank) {
        return None;
    }
    let col = (file - b'a') as usize;
    let rank_num = (rank - b'0') as usize;
    let row = 8 - rank_num;
    Some((row, col))
}

pub fn rc_to_square(row: usize, col: usize) -> String {
    let file = (b'a' + col as u8) as char;
    let rank = 8 - row;
    format!("{file}{rank}")
}

pub fn parse_placement(fen: &str) -> Board {
    let placement = fen.split_whitespace().next().unwrap_or(fen);
    let mut board: Board = [[0u8; 8]; 8];
    for (row, rank_str) in placement.split('/').enumerate() {
        if row >= 8 {
            break;
        }
        let mut col = 0usize;
        for ch in rank_str.chars() {
            if let Some(d) = ch.to_digit(10) {
                col += d as usize;
            } else if col < 8 {
                board[row][col] = ch as u8;
                col += 1;
            }
        }
    }
    board
}

pub fn placement_to_string(board: &Board) -> String {
    let mut ranks = Vec::with_capacity(8);
    for row in board.iter() {
        let mut s = String::new();
        let mut empty = 0u32;
        for &p in row.iter() {
            if p == 0 {
                empty += 1;
            } else {
                if empty > 0 {
                    s.push_str(&empty.to_string());
                    empty = 0;
                }
                s.push(p as char);
            }
        }
        if empty > 0 {
            s.push_str(&empty.to_string());
        }
        ranks.push(s);
    }
    ranks.join("/")
}

fn piece_at(board: &Board, row: usize, col: usize) -> u8 {
    board[row][col]
}

fn piece_color(p: u8) -> Option<Color> {
    if p == 0 {
        return None;
    }
    if p.is_ascii_uppercase() {
        Some(Color::White)
    } else {
        Some(Color::Black)
    }
}

fn step_moves(board: &Board, from: (usize, usize), color: Color, offsets: &[(i32, i32)]) -> Vec<(usize, usize)> {
    let mut out = vec![];
    for &(dr, dc) in offsets {
        let nr = from.0 as i32 + dr;
        let nc = from.1 as i32 + dc;
        if !(0..8).contains(&nr) || !(0..8).contains(&nc) {
            continue;
        }
        let (nr, nc) = (nr as usize, nc as usize);
        let target = piece_at(board, nr, nc);
        if target == 0 || piece_color(target) != Some(color) {
            out.push((nr, nc));
        }
    }
    out
}

fn slide_moves(board: &Board, from: (usize, usize), color: Color, dirs: &[(i32, i32)]) -> Vec<(usize, usize)> {
    let mut out = vec![];
    for &(dr, dc) in dirs {
        let mut nr = from.0 as i32 + dr;
        let mut nc = from.1 as i32 + dc;
        while (0..8).contains(&nr) && (0..8).contains(&nc) {
            let (r, c) = (nr as usize, nc as usize);
            let target = piece_at(board, r, c);
            if target == 0 {
                out.push((r, c));
            } else {
                if piece_color(target) != Some(color) {
                    out.push((r, c));
                }
                break;
            }
            nr += dr;
            nc += dc;
        }
    }
    out
}

fn pawn_moves(board: &Board, from: (usize, usize), color: Color) -> Vec<(usize, usize)> {
    let mut out = vec![];
    let (dir, start_row): (i32, usize) = match color {
        Color::White => (-1, 6),
        Color::Black => (1, 1),
    };
    let nr = from.0 as i32 + dir;
    if (0..8).contains(&nr) {
        let nr_u = nr as usize;
        if piece_at(board, nr_u, from.1) == 0 {
            out.push((nr_u, from.1));
            if from.0 == start_row {
                let nr2 = from.0 as i32 + 2 * dir;
                if (0..8).contains(&nr2) {
                    let nr2_u = nr2 as usize;
                    if piece_at(board, nr2_u, from.1) == 0 {
                        out.push((nr2_u, from.1));
                    }
                }
            }
        }
        for dc in [-1i32, 1] {
            let nc = from.1 as i32 + dc;
            if (0..8).contains(&nc) {
                let nc_u = nc as usize;
                let target = piece_at(board, nr_u, nc_u);
                if target != 0 && piece_color(target) != Some(color) {
                    out.push((nr_u, nc_u));
                }
            }
        }
    }
    out
}

fn pawn_attack_squares(from: (usize, usize), color: Color) -> Vec<(usize, usize)> {
    let dir: i32 = match color {
        Color::White => -1,
        Color::Black => 1,
    };
    let nr = from.0 as i32 + dir;
    let mut out = vec![];
    if (0..8).contains(&nr) {
        let nr_u = nr as usize;
        for dc in [-1i32, 1] {
            let nc = from.1 as i32 + dc;
            if (0..8).contains(&nc) {
                out.push((nr_u, nc as usize));
            }
        }
    }
    out
}

/// Pseudo-legal destinations for the piece at `from` — obeys piece geometry,
/// path-blocking, and "can't capture your own piece", but does NOT check
/// whether the move leaves the mover's own king in check.
fn pseudo_moves(board: &Board, from: (usize, usize)) -> Vec<(usize, usize)> {
    let piece = piece_at(board, from.0, from.1);
    if piece == 0 {
        return vec![];
    }
    let color = piece_color(piece).unwrap();
    match piece.to_ascii_uppercase() {
        b'P' => pawn_moves(board, from, color),
        b'N' => step_moves(
            board,
            from,
            color,
            &[(-2, -1), (-2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2), (2, -1), (2, 1)],
        ),
        b'K' => step_moves(
            board,
            from,
            color,
            &[(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)],
        ),
        b'B' => slide_moves(board, from, color, &[(-1, -1), (-1, 1), (1, -1), (1, 1)]),
        b'R' => slide_moves(board, from, color, &[(-1, 0), (1, 0), (0, -1), (0, 1)]),
        b'Q' => slide_moves(
            board,
            from,
            color,
            &[(-1, -1), (-1, 1), (1, -1), (1, 1), (-1, 0), (1, 0), (0, -1), (0, 1)],
        ),
        _ => vec![],
    }
}

fn is_square_attacked(board: &Board, target: (usize, usize), by_color: Color) -> bool {
    for r in 0..8 {
        for c in 0..8 {
            let p = piece_at(board, r, c);
            if p == 0 || piece_color(p) != Some(by_color) {
                continue;
            }
            let hits = if p.to_ascii_uppercase() == b'P' {
                pawn_attack_squares((r, c), by_color).contains(&target)
            } else {
                pseudo_moves(board, (r, c)).contains(&target)
            };
            if hits {
                return true;
            }
        }
    }
    false
}

fn find_king(board: &Board, color: Color) -> Option<(usize, usize)> {
    let king = if color == Color::White { b'K' } else { b'k' };
    for r in 0..8 {
        for c in 0..8 {
            if piece_at(board, r, c) == king {
                return Some((r, c));
            }
        }
    }
    None
}

pub fn in_check(board: &Board, color: Color) -> bool {
    match find_king(board, color) {
        Some(king_pos) => is_square_attacked(board, king_pos, color.opposite()),
        None => false,
    }
}

fn apply_move_to_board(board: &mut Board, from: (usize, usize), to: (usize, usize), promotion: Option<u8>) -> u8 {
    let piece = board[from.0][from.1];
    let captured = board[to.0][to.1];
    board[from.0][from.1] = 0;
    board[to.0][to.1] = promotion.unwrap_or(piece);
    captured
}

fn legal_destinations(board: &Board, from: (usize, usize), color: Color) -> Vec<(usize, usize)> {
    let piece = piece_at(board, from.0, from.1);
    if piece == 0 || piece_color(piece) != Some(color) {
        return vec![];
    }
    pseudo_moves(board, from)
        .into_iter()
        .filter(|&to| {
            let mut b2 = *board;
            let _ = apply_move_to_board(&mut b2, from, to, None);
            !in_check(&b2, color)
        })
        .collect()
}

pub fn has_any_legal_move(board: &Board, color: Color) -> bool {
    for r in 0..8 {
        for c in 0..8 {
            let p = piece_at(board, r, c);
            if p != 0 && piece_color(p) == Some(color) && !legal_destinations(board, (r, c), color).is_empty() {
                return true;
            }
        }
    }
    false
}

/// Validate and apply a player's move against the given placement. Returns
/// `Err(reason)` for any illegal move (unknown square, empty source, wrong
/// piece owner, occupied-by-own-piece destination, illegal geometry/blocking,
/// or a move that leaves the mover's own king in check) — the board is never
/// mutated on error.
pub fn apply_player_move(
    placement: &str,
    from_sq: &str,
    to_sq: &str,
    mover: Color,
    promotion: Option<&str>,
) -> Result<AppliedMove, String> {
    let board = parse_placement(placement);
    let from = square_to_rc(from_sq).ok_or_else(|| "invalid source square".to_string())?;
    let to = square_to_rc(to_sq).ok_or_else(|| "invalid destination square".to_string())?;

    let piece = piece_at(&board, from.0, from.1);
    if piece == 0 {
        return Err("no piece at source square".into());
    }
    if piece_color(piece) != Some(mover) {
        return Err("cannot move a piece you don't own".into());
    }
    let dest_piece = piece_at(&board, to.0, to.1);
    if dest_piece != 0 && piece_color(dest_piece) == Some(mover) {
        return Err("destination is occupied by your own piece".into());
    }

    let legal = legal_destinations(&board, from, mover);
    if !legal.contains(&to) {
        return Err("illegal move".into());
    }

    let is_pawn = piece.to_ascii_uppercase() == b'P';
    let promo_rank = if mover == Color::White { 0 } else { 7 };
    let mut promo_byte: Option<u8> = None;
    let mut promo_char: Option<char> = None;
    if is_pawn && to.0 == promo_rank {
        let requested = promotion.unwrap_or("q").to_lowercase();
        let ch = match requested.as_str() {
            "q" => 'q',
            "r" => 'r',
            "b" => 'b',
            "n" => 'n',
            _ => return Err("invalid promotion piece".into()),
        };
        promo_char = Some(ch);
        let upper = ch.to_ascii_uppercase() as u8;
        promo_byte = Some(if mover == Color::White { upper } else { upper.to_ascii_lowercase() });
    }

    let mut new_board = board;
    let captured = apply_move_to_board(&mut new_board, from, to, promo_byte);

    Ok(AppliedMove {
        board: new_board,
        captured: captured != 0,
        promotion: promo_char,
        piece: piece as char,
    })
}
