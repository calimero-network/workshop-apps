import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { THEME } from '../../config';
import { C } from '../../theme';
import { describeError } from '../../utils/errors';
import type { Game } from '../../api/chess-game/ChessGameClient';

/**
 * ChessBoardView — the live board synced from `get_game_state`.
 *
 * Move preview + undo are LOCAL ONLY (plain component state): clicking a
 * square you own "picks it up", clicking a destination previews the move by
 * re-rendering the board with the piece moved — `game.board_fen` (the shared
 * CRDT register) is never touched until "Submit move" calls `submit_move`.
 * "Undo" just clears the local preview. Any change to the committed
 * `board_fen` (our own successful submit, or the opponent's move arriving via
 * `useSubscription`) resets the preview via the effect below.
 */
type PieceGrid = (string | null)[][];

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const PIECE_GLYPH: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

const PROMOTION_CHOICES: { value: string; label: string }[] = [
  { value: 'q', label: 'Queen' },
  { value: 'r', label: 'Rook' },
  { value: 'b', label: 'Bishop' },
  { value: 'n', label: 'Knight' },
];

function parsePlacement(placement: string): PieceGrid {
  return placement.split('/').map((rank) => {
    const row: (string | null)[] = [];
    for (const ch of rank) {
      if (ch >= '1' && ch <= '8') {
        for (let i = 0; i < Number(ch); i++) row.push(null);
      } else {
        row.push(ch);
      }
    }
    while (row.length < 8) row.push(null);
    return row;
  });
}

/** Row 0 is rank 8 (top), col 0 is file a — independent of display order. */
function squareAt(row: number, col: number): string {
  return `${FILES[col]}${8 - row}`;
}

function isOwnPiece(piece: string | null, color: 'white' | 'black' | null): boolean {
  if (!piece || !color) return false;
  const white = piece === piece.toUpperCase();
  return color === 'white' ? white : !white;
}

function describeResult(result: string): string {
  if (result === 'white_wins') return 'White wins';
  if (result === 'black_wins') return 'Black wins';
  if (result === 'draw') return 'Draw';
  return 'Game over';
}

interface ChessBoardViewProps {
  game: Game;
  myColor: 'white' | 'black' | null;
  onSubmitMove: (from: string, to: string, promotion: string | null) => Promise<void>;
  onResign: () => Promise<void>;
}

export default function ChessBoardView({ game, myColor, onSubmitMove, onResign }: ChessBoardViewProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingTo, setPendingTo] = useState<string | null>(null);
  const [promotion, setPromotion] = useState('q');
  const [submitting, setSubmitting] = useState(false);
  const [resigning, setResigning] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // A committed board (our own submit, or the opponent's move) invalidates
  // any in-progress local preview.
  useEffect(() => {
    setSelected(null);
    setPendingTo(null);
    setPromotion('q');
    setLocalError(null);
  }, [game.board_fen]);

  const placement = game.board_fen.split(' ')[0] ?? '';
  const grid = useMemo(() => parsePlacement(placement), [placement]);

  const pieceAt = (grid_: PieceGrid, square: string): string | null => {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (squareAt(r, c) === square) return grid_[r]?.[c] ?? null;
      }
    }
    return null;
  };

  // Overlay the previewed move — a fresh copy, never the shared state.
  const previewGrid = useMemo<PieceGrid>(() => {
    if (!selected || !pendingTo) return grid;
    const copy = grid.map((row) => [...row]);
    const moving = pieceAt(copy, selected);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = squareAt(r, c);
        if (sq === selected) copy[r][c] = null;
        if (sq === pendingTo) copy[r][c] = moving;
      }
    }
    return copy;
  }, [grid, selected, pendingTo]);

  const isMyTurn = game.status === 'active' && myColor !== null && game.turn === myColor;

  const needsPromotionChoice = useMemo(() => {
    if (!selected || !pendingTo) return false;
    const piece = pieceAt(grid, selected);
    if (!piece || piece.toUpperCase() !== 'P') return false;
    const rank = Number(pendingTo[1]);
    return rank === 1 || rank === 8;
  }, [grid, selected, pendingTo]);

  const handleSquareClick = (square: string) => {
    if (!isMyTurn || submitting) return;
    if (pendingTo) return; // already previewing — submit or undo first
    const piece = pieceAt(grid, square);
    if (!selected) {
      if (isOwnPiece(piece, myColor)) setSelected(square);
      return;
    }
    if (square === selected) { setSelected(null); return; }
    if (isOwnPiece(piece, myColor)) { setSelected(square); return; } // re-pick
    setPendingTo(square);
  };

  const handleUndo = () => {
    setSelected(null);
    setPendingTo(null);
    setLocalError(null);
  };

  const handleSubmit = async () => {
    if (!selected || !pendingTo) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      await onSubmitMove(selected, pendingTo, needsPromotionChoice ? promotion : null);
      // success: the board_fen effect above clears the preview once refreshed
    } catch (err) {
      setLocalError(describeError(err));
      setSelected(null);
      setPendingTo(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResign = async () => {
    setResigning(true);
    try {
      await onResign();
    } catch (err) {
      setLocalError(describeError(err));
    } finally {
      setResigning(false);
    }
  };

  const flipped = myColor === 'black';
  const rowOrder = flipped ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
  const colOrder = flipped ? [...Array(8).keys()].reverse() : [...Array(8).keys()];

  return (
    <Wrap data-testid="chess-board">
      {game.status === 'finished' && (
        <Banner data-testid="game-finished-banner">Game over — {describeResult(game.result)}</Banner>
      )}

      <TurnBar>
        <span>You are <strong>{myColor ?? 'a spectator'}</strong></span>
        <span>
          {game.status === 'active'
            ? isMyTurn ? 'Your move' : `Waiting for ${game.turn}…`
            : game.status === 'finished' ? 'Match finished' : ''}
        </span>
      </TurnBar>

      <Board>
        {rowOrder.map((r) =>
          colOrder.map((c) => {
            const square = squareAt(r, c);
            const piece = previewGrid[r]?.[c] ?? null;
            const dark = (r + c) % 2 === 1;
            return (
              <Square
                key={square}
                data-testid={`square-${square}`}
                $dark={dark}
                $selected={square === selected}
                $target={square === pendingTo}
                onClick={() => handleSquareClick(square)}
              >
                {piece && <Piece>{PIECE_GLYPH[piece] ?? piece}</Piece>}
              </Square>
            );
          }),
        )}
      </Board>

      {needsPromotionChoice && (
        <PromotionRow>
          <label htmlFor="promotion-choice">Promote to</label>
          <select
            id="promotion-choice"
            data-testid="field-promotion"
            value={promotion}
            onChange={(e) => setPromotion(e.target.value)}
          >
            {PROMOTION_CHOICES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </PromotionRow>
      )}

      <Actions>
        <Secondary data-testid="undo-move-btn" onClick={handleUndo} disabled={!pendingTo || submitting}>
          Undo
        </Secondary>
        <Primary data-testid="action-submit_move" onClick={handleSubmit} disabled={!pendingTo || submitting}>
          {submitting ? 'Submitting…' : 'Submit move'}
        </Primary>
        {game.status === 'active' && (
          <Danger data-testid="action-resign" onClick={handleResign} disabled={resigning}>
            {resigning ? 'Resigning…' : 'Resign'}
          </Danger>
        )}
      </Actions>

      {localError && <ErrLine>{localError}</ErrLine>}
    </Wrap>
  );
}

const Wrap = styled.div`margin-bottom: 28px;`;
const Banner = styled.div`
  padding: 12px 16px;
  margin-bottom: 14px;
  border-radius: 10px;
  background: rgba(201, 162, 39, 0.14);
  border: 1px solid ${THEME.accentColor};
  color: ${C.ink};
  font-weight: 700;
  font-size: 14px;
  text-align: center;
`;
const TurnBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 13.5px;
  color: ${C.muted};
  strong { color: ${C.ink}; text-transform: capitalize; }
`;
const Board = styled.div`
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  aspect-ratio: 1 / 1;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  border: 2px solid ${THEME.primaryColor};
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 18px 40px -24px rgba(14, 20, 15, 0.4);
`;
const Square = styled.div<{ $dark: boolean; $selected: boolean; $target: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1 / 1;
  cursor: pointer;
  background: ${(p) => (p.$dark ? THEME.primaryColor : '#f1e9d8')};
  ${(p) => p.$selected && `box-shadow: inset 0 0 0 3px ${THEME.accentColor};`}
  ${(p) => p.$target && `background: rgba(201, 162, 39, 0.35);`}
`;
const Piece = styled.span`
  font-size: clamp(20px, 5vw, 34px);
  line-height: 1;
  user-select: none;
`;
const PromotionRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 14px;
  font-size: 13px;
  color: ${C.muted};
  select {
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid ${C.line};
    background: ${C.paper2};
    color: ${C.ink};
  }
`;
const Actions = styled.div`
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
`;
const Primary = styled.button`
  padding: 10px 18px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c;
  transition: background 0.18s, transform 0.15s;
  &:hover:not(:disabled) { background: ${C.greenHover}; transform: translateY(-1px); }
  &:disabled { opacity: 0.5; cursor: default; }
`;
const Secondary = styled.button`
  padding: 10px 16px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  transition: background 0.15s, border-color 0.15s;
  &:hover:not(:disabled) { background: ${C.paper2}; border-color: ${C.green}; }
  &:disabled { opacity: 0.5; cursor: default; }
`;
const Danger = styled.button`
  padding: 10px 16px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.danger}; background: ${C.paper}; border: 1px solid ${C.danger};
  transition: background 0.15s;
  &:hover:not(:disabled) { background: rgba(220, 60, 60, 0.08); }
  &:disabled { opacity: 0.5; cursor: default; }
`;
const ErrLine = styled.p`margin-top: 12px; font-size: 13px; color: ${C.danger}; text-align: center;`;
