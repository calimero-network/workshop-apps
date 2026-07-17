import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { C } from '../../theme';
import { MemberLabel } from '../../components/MemberLabel';
import type { PlayerStatus } from '../../api/room/RoomClient';

/**
 * GameScreen — local DOM-grid snake game plus a live sidebar of everyone
 * else's status/score/length.
 *
 * The game itself is fully local (no backend calls needed to play). Every
 * status/score/length change is reported through `update_status` so the room
 * sees it within a subscription tick; `members` is the live `list_members()`
 * feed (self excluded) threaded down from `useRoom` via AppPage.
 */

const SIZE = 15;
const TICK_MS = 140;

type Cell = { x: number; y: number };
type Dir = { dx: number; dy: number };
const UP: Dir = { dx: 0, dy: -1 };
const DOWN: Dir = { dx: 0, dy: 1 };
const LEFT: Dir = { dx: -1, dy: 0 };
const RIGHT: Dir = { dx: 1, dy: 0 };

function cellIndex(x: number, y: number): number {
  return y * SIZE + x;
}

function randomFood(occupied: Set<number>): number {
  let idx: number;
  do {
    idx = Math.floor(Math.random() * SIZE * SIZE);
  } while (occupied.has(idx));
  return idx;
}

function initialSnake(): Cell[] {
  const c = Math.floor(SIZE / 2);
  return [{ x: c, y: c }, { x: c - 1, y: c }, { x: c - 2, y: c }];
}

const KEY_TO_DIR: Record<string, Dir> = {
  ArrowUp: UP, w: UP, W: UP,
  ArrowDown: DOWN, s: DOWN, S: DOWN,
  ArrowLeft: LEFT, a: LEFT, A: LEFT,
  ArrowRight: RIGHT, d: RIGHT, D: RIGHT,
};

interface GameScreenProps {
  /** Every other room member's live status (self excluded by the caller). */
  members: PlayerStatus[];
  /** This player's own best-ever score, as recorded by the backend. */
  bestScore: number;
  /** Reports status/score/length to the room via `update_status`. */
  onUpdateStatus: (status: 'playing' | 'idle', score: number, length: number) => void;
}

export default function GameScreen({ members, bestScore, onUpdateStatus }: GameScreenProps) {
  const [snake, setSnake] = useState<Cell[]>(initialSnake);
  const [food, setFood] = useState<number>(() =>
    randomFood(new Set(initialSnake().map((c) => cellIndex(c.x, c.y)))),
  );
  const [status, setStatus] = useState<'idle' | 'playing'>('idle');
  const [score, setScore] = useState(0);

  const dirRef = useRef<Dir>(RIGHT);
  const nextDirRef = useRef<Dir>(RIGHT);

  const reset = useCallback(() => {
    const s = initialSnake();
    setSnake(s);
    setFood(randomFood(new Set(s.map((c) => cellIndex(c.x, c.y)))));
    dirRef.current = RIGHT;
    nextDirRef.current = RIGHT;
    setScore(0);
    setStatus('playing');
  }, []);

  // The game loop — status flips to idle the instant the run ends (wall or
  // self collision), matching "idle once the snake game ends".
  useEffect(() => {
    if (status !== 'playing') return;
    const id = window.setInterval(() => {
      setSnake((prev) => {
        const d = nextDirRef.current;
        dirRef.current = d;
        const head = prev[0];
        const nx = head.x + d.dx;
        const ny = head.y + d.dy;

        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) {
          setStatus('idle');
          return prev;
        }
        const nextHeadIdx = cellIndex(nx, ny);
        const tail = prev[prev.length - 1];
        const willMoveTail = !(nextHeadIdx === food);
        const bodyToCheck = willMoveTail ? prev.slice(0, -1) : prev;
        if (bodyToCheck.some((c) => cellIndex(c.x, c.y) === nextHeadIdx)) {
          setStatus('idle');
          return prev;
        }

        const grew = nextHeadIdx === food;
        const newSnake = grew
          ? [{ x: nx, y: ny }, ...prev]
          : [{ x: nx, y: ny }, ...prev.slice(0, -1)];

        if (grew) {
          setScore((s) => s + 10);
          setFood(randomFood(new Set(newSnake.map((c) => cellIndex(c.x, c.y)))));
        }
        void tail;
        return newSnake;
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [status, food]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const next = KEY_TO_DIR[e.key];
      if (!next) return;
      e.preventDefault();
      const cur = dirRef.current;
      if (cur.dx === -next.dx && cur.dy === -next.dy) return; // no 180° reversal
      nextDirRef.current = next;
      if (status === 'idle') reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, reset]);

  const length = snake.length;
  const cells = Array.from({ length: SIZE * SIZE }, (_, i) => i);
  const bodySet = new Set(snake.slice(1).map((c) => cellIndex(c.x, c.y)));
  const headIdx = cellIndex(snake[0].x, snake[0].y);
  const best = Math.max(bestScore, score);

  // Report every status/score/length change to the room so peers see it in
  // their sidebar within a subscription tick. Fires once on mount too, so a
  // player shows up as idle before they've even played a round.
  const onUpdateStatusRef = useRef(onUpdateStatus);
  onUpdateStatusRef.current = onUpdateStatus;
  useEffect(() => {
    onUpdateStatusRef.current(status, score, length);
  }, [status, score, length]);

  // Leaving the game screen (tab switch / unmount) always flips status to
  // idle, per "idle once the snake game ends or they leave the game screen".
  const latestRef = useRef({ score, length });
  latestRef.current = { score, length };
  useEffect(() => {
    return () => {
      onUpdateStatusRef.current('idle', latestRef.current.score, latestRef.current.length);
    };
  }, []);

  return (
    <Wrap>
      <GameArea>
        <Hud>
          <div><label>status</label><b className={status}>{status}</b></div>
          <div><label>score</label><b>{score}</b></div>
          <div><label>length</label><b>{length}</b></div>
          <div><label>best</label><b>{best}</b></div>
        </Hud>
        <BoardFrame>
          <CellGrid data-testid="snake-grid">
            {cells.map((c) => (
              <i
                key={c}
                className={c === headIdx ? 'head' : bodySet.has(c) ? 'body' : c === food ? 'food' : ''}
              />
            ))}
          </CellGrid>
          {status === 'idle' && (
            <Overlay>
              <p>{score > 0 ? `Game over — score ${score}` : 'Use the arrow keys (or WASD) to start'}</p>
              <button data-testid="start-game-btn" onClick={reset}>{score > 0 ? 'Play again' : 'Start'}</button>
            </Overlay>
          )}
        </BoardFrame>
      </GameArea>

      <Sidebar>
        <h3>Room</h3>
        <MemberList>
          {members.length === 0 && <Hint>Nobody else is here yet — invite the room.</Hint>}
          {members.map((m) => (
            <MemberRow key={m.player} data-testid="item-player_status">
              <div className="who"><MemberLabel memberId={m.player} /></div>
              <span className={`badge ${m.status}`}>{m.status}</span>
              <div className="stats">
                <span>score {m.live_score}</span>
                <span>len {m.live_length}</span>
              </div>
            </MemberRow>
          ))}
        </MemberList>
      </Sidebar>
    </Wrap>
  );
}

const Wrap = styled.div`
  display: grid;
  grid-template-columns: 1fr 260px;
  gap: 20px;
  align-items: start;
  @media (max-width: 760px) { grid-template-columns: 1fr; }
`;

const GameArea = styled.div`display: flex; flex-direction: column; gap: 12px;`;

const Hud = styled.div`
  display: flex; gap: 10px; flex-wrap: wrap;
  div {
    background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 10px;
    padding: 8px 12px; min-width: 74px;
  }
  label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: ${C.mutedSoft}; margin-bottom: 3px; }
  b { font-family: ${C.mono}; font-size: 16px; color: ${C.greenDeep}; }
  b.playing { color: ${C.green}; }
  b.idle { color: ${C.mutedSoft}; }
`;

const BoardFrame = styled.div`
  position: relative;
  background: ${C.ink};
  border: 1px solid ${C.line};
  border-radius: 14px;
  padding: 10px;
`;

const CellGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(${SIZE}, 1fr);
  gap: 2px;
  width: 100%;
  aspect-ratio: 1;
  i {
    display: block;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.04);
    &.body { background: ${C.green}; }
    &.head { background: ${C.accent}; box-shadow: 0 0 6px rgba(250, 204, 21, 0.6); }
    &.food { background: rgba(250, 204, 21, 0.4); border-radius: 50%; }
  }
`;

const Overlay = styled.div`
  position: absolute; inset: 10px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  background: rgba(14, 20, 15, 0.82);
  border-radius: 10px;
  text-align: center;
  p { color: #e7edf2; font-size: 13.5px; max-width: 240px; }
  button {
    padding: 10px 20px; font-size: 13.5px; font-weight: 700; border-radius: 10px; cursor: pointer;
    color: ${C.onAccent}; background: ${C.green}; border: 1px solid ${C.greenHover};
    &:hover { background: ${C.greenHover}; }
  }
`;

const Sidebar = styled.aside`
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 14px; padding: 16px;
  h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: ${C.muted}; margin-bottom: 12px; }
`;

const MemberList = styled.div`display: flex; flex-direction: column; gap: 8px;`;

const MemberRow = styled.div`
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 12px; background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 10px;
  .who { font-size: 13.5px; font-weight: 600; color: ${C.ink}; }
  .badge {
    align-self: flex-start; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
    padding: 2px 8px; border-radius: 999px;
    &.playing { background: rgba(34,197,94,0.16); color: ${C.greenDeep}; }
    &.idle { background: ${C.disabled}; color: ${C.mutedSoft}; }
  }
  .stats { display: flex; gap: 10px; font-family: ${C.mono}; font-size: 11.5px; color: ${C.muted}; }
`;

const Hint = styled.p`font-size: 13px; color: ${C.muted};`;
