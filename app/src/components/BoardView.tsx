import React from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import type { UseWorkspaceReturn } from '../hooks/useWorkspace';
import { useBoard } from '../hooks/useBoard';
import { MemberLabel } from './MemberLabel';
import { describeError } from '../utils/errors';

interface Props {
  ws: UseWorkspaceReturn;
}

// Seat colour + corner mapping mirrors the approved mockup: seat 0 = red
// (top-left home), seat 1 = blue (top-right), seat 2 = yellow (bottom-left),
// seat 3 = green (bottom-right). These are the game's player colours (not the
// app theme) - classic Ludo needs 4 fixed, distinguishable colours.
const SEAT_COLORS = ['#d9534f', '#4f83d9', '#e0c458', '#63c168'];
const SEAT_LABELS = ['Red', 'Blue', 'Yellow', 'Green'];

const FINISHED = 57;
const RING_LEN = 52;
const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

function startSquare(seat: number): number {
  return (seat * (RING_LEN / 4)) % RING_LEN;
}
/** Mirrors the room crate's `abs_square`: null while at home or in the
 *  private home stretch (steps > 51). */
function absSquare(seat: number, steps: number): number | null {
  if (steps >= 1 && steps <= 51) return (startSquare(seat) + steps - 1) % RING_LEN;
  return null;
}

type Token = { seat: number; token_index: number; steps: number };

// A stylized 3x3-per-quadrant board (matching the approved mockup's
// abstraction, not a pixel-exact 52-square Ludo layout): quadrant 0 = top
// edge, 1 = right edge, 2 = bottom edge, 3 = left edge, walking the ring
// clockwise from each seat's start square.
function quadrantFor(square: number): number {
  return Math.floor(square / 13);
}
function cellFor(square: number): number {
  return Math.min(8, Math.floor(((square % 13) / 13) * 9));
}

const DICE_PIPS: Record<number, boolean[]> = {
  1: [false, false, false, false, true, false, false, false, false],
  2: [true, false, false, false, false, false, false, false, true],
  3: [true, false, false, false, true, false, false, false, true],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, false, true, true, false, true, true, false, true],
};

function tokenLabel(steps: number): string {
  if (steps === 0) return 'Home';
  if (steps >= FINISHED) return 'Finished';
  if (steps > 51) return `Stretch ${steps - 51}/6`;
  return `Square ${steps}`;
}

/**
 * BoardView (spec frontendView) - the live match: 4 colored token sets, dice
 * roller, turn indicator, extra-turn prompt on sixes, live positions.
 */
export default function BoardView({ ws }: Props): React.ReactElement {
  const game = useBoard({ contextId: ws.contextId, executorPublicKey: ws.executorPublicKey });
  const b = game.board;

  if (!b) {
    return <Loading>Setting up the board…</Loading>;
  }

  const tokensBySeat: Token[][] = [[], [], [], []];
  for (const t of b.tokens) tokensBySeat[t.seat]?.push(t);
  for (const seat of [0, 1, 2, 3]) tokensBySeat[seat].sort((x, y) => x.token_index - y.token_index);

  const quadTokens: Token[][] = [[], [], [], []];
  for (const t of b.tokens) {
    const sq = absSquare(t.seat, t.steps);
    if (sq !== null) quadTokens[quadrantFor(sq)].push(t);
  }

  const needsRoll = game.isMyTurn && b.pending_dice === 0 && !b.finished;
  const needsMove = game.isMyTurn && b.pending_dice > 0 && !b.finished;
  const dicePips = b.pending_dice > 0 ? DICE_PIPS[b.pending_dice] : null;

  return (
    <Wrap data-testid="board-view">
      <TurnBar>
        {b.seats.map((player, seat) => (
          <Chip key={player || seat} $color={SEAT_COLORS[seat]} $current={!b.finished && seat === b.turn_seat}>
            <Dot $color={SEAT_COLORS[seat]} />
            <MemberLabel memberId={player} showYou={false} />
            {seat === game.mySeat && <You>you</You>}
          </Chip>
        ))}
      </TurnBar>

      {b.finished && (
        <FinishedBanner data-testid="match-finished-banner">
          🏆 <MemberLabel memberId={b.winner} showYou={false} /> won the match — no more moves.
        </FinishedBanner>
      )}
      {game.error && <ErrLine role="alert">{describeError(game.error)}</ErrLine>}

      <Shell>
        <Board>
          {/* top-left */}
          <HomeQuad $color={SEAT_COLORS[0]}>
            <span className="label">{SEAT_LABELS[0]}</span>
            <div className="tokens">
              {tokensBySeat[0].filter((t) => t.steps === 0).map((t) => (
                <TokenDot key={t.token_index} $color={SEAT_COLORS[0]} />
              ))}
            </div>
          </HomeQuad>
          <PathQuad>
            {Array.from({ length: 9 }, (_, cell) => (
              <Cell key={cell} $safe={cell === 0 || cell === 8}>
                {quadTokens[0].filter((t) => cellFor(absSquare(t.seat, t.steps) as number) === cell).map((t) => (
                  <Token key={`${t.seat}:${t.token_index}`} $color={SEAT_COLORS[t.seat]} />
                ))}
              </Cell>
            ))}
          </PathQuad>
          <HomeQuad $color={SEAT_COLORS[1]}>
            <span className="label">{SEAT_LABELS[1]}</span>
            <div className="tokens">
              {tokensBySeat[1].filter((t) => t.steps === 0).map((t) => (
                <TokenDot key={t.token_index} $color={SEAT_COLORS[1]} />
              ))}
            </div>
          </HomeQuad>

          <PathQuad>
            {Array.from({ length: 9 }, (_, cell) => (
              <Cell key={cell} $safe={cell === 0 || cell === 8}>
                {quadTokens[3].filter((t) => cellFor(absSquare(t.seat, t.steps) as number) === cell).map((t) => (
                  <Token key={`${t.seat}:${t.token_index}`} $color={SEAT_COLORS[t.seat]} />
                ))}
              </Cell>
            ))}
          </PathQuad>
          <CenterQuad>
            <Star />
          </CenterQuad>
          <PathQuad>
            {Array.from({ length: 9 }, (_, cell) => (
              <Cell key={cell} $safe={cell === 0 || cell === 8}>
                {quadTokens[1].filter((t) => cellFor(absSquare(t.seat, t.steps) as number) === cell).map((t) => (
                  <Token key={`${t.seat}:${t.token_index}`} $color={SEAT_COLORS[t.seat]} />
                ))}
              </Cell>
            ))}
          </PathQuad>

          <HomeQuad $color={SEAT_COLORS[2]}>
            <span className="label">{SEAT_LABELS[2]}</span>
            <div className="tokens">
              {tokensBySeat[2].filter((t) => t.steps === 0).map((t) => (
                <TokenDot key={t.token_index} $color={SEAT_COLORS[2]} />
              ))}
            </div>
          </HomeQuad>
          <PathQuad>
            {Array.from({ length: 9 }, (_, cell) => (
              <Cell key={cell} $safe={cell === 0 || cell === 8}>
                {quadTokens[2].filter((t) => cellFor(absSquare(t.seat, t.steps) as number) === cell).map((t) => (
                  <Token key={`${t.seat}:${t.token_index}`} $color={SEAT_COLORS[t.seat]} />
                ))}
              </Cell>
            ))}
          </PathQuad>
          <HomeQuad $color={SEAT_COLORS[3]}>
            <span className="label">{SEAT_LABELS[3]}</span>
            <div className="tokens">
              {tokensBySeat[3].filter((t) => t.steps === 0).map((t) => (
                <TokenDot key={t.token_index} $color={SEAT_COLORS[3]} />
              ))}
            </div>
          </HomeQuad>
        </Board>

        <SidePanel>
          <DiceCard>
            <div className="label">{needsMove ? 'Pick a token to move' : needsRoll ? 'Your roll' : 'Waiting…'}</div>
            <DiceFace>
              {(dicePips ?? DICE_PIPS[1]).map((on, i) => <Pip key={i} $on={!!dicePips && on} />)}
            </DiceFace>
            <Value>{b.pending_dice > 0 ? b.pending_dice : '–'}</Value>
            {game.isMyTurn && game.lastRollWasSix && b.pending_dice === 0 && !b.finished && (
              <ExtraTurnBanner>🎉 Six rolled — roll again!</ExtraTurnBanner>
            )}
            <RollBtn
              data-testid="action-roll_dice"
              disabled={!needsRoll || game.rolling}
              onClick={() => void game.rollDice()}
            >
              {game.rolling ? 'Rolling…' : 'Roll'}
            </RollBtn>
          </DiceCard>

          <TokensCard>
            <div className="label">Your tokens</div>
            {game.mySeat === -1 && <Hint>You're not seated on this board.</Hint>}
            {game.mySeat !== -1 && tokensBySeat[game.mySeat].map((t) => {
              const canLeaveHome = t.steps === 0 && b.pending_dice === 6;
              const canAdvance = t.steps > 0 && t.steps + b.pending_dice <= FINISHED;
              const actionable = needsMove && (canLeaveHome || canAdvance);
              return (
                <TokenRow key={t.token_index} $color={SEAT_COLORS[game.mySeat]}>
                  <span className="dot" />
                  <span className="status">{tokenLabel(t.steps)}</span>
                  <button
                    data-testid="action-move_token"
                    data-token-index={t.token_index}
                    disabled={!actionable || game.moving}
                    onClick={() => void game.moveToken(t.token_index)}
                  >
                    Move
                  </button>
                </TokenRow>
              );
            })}
          </TokensCard>

          <LegendCard>
            <div className="label">Tokens Home</div>
            {[0, 1, 2, 3].map((seat) => (
              <LegendRow key={seat}>
                <span><Dot $color={SEAT_COLORS[seat]} /> <MemberLabel memberId={b.seats[seat] ?? ''} showYou={false} /></span>
                <span className="amt">{tokensBySeat[seat].filter((t) => t.steps === FINISHED).length} / 4</span>
              </LegendRow>
            ))}
          </LegendCard>
        </SidePanel>
      </Shell>
    </Wrap>
  );
}

const Wrap = styled.div`display: flex; flex-direction: column; gap: 14px;`;
const Loading = styled.p`padding: 24px; text-align: center; color: ${C.muted}; font-size: 14px;`;
const ErrLine = styled.p`margin: 0; font-size: 13px; color: ${C.danger};`;

const TurnBar = styled.div`
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 10px; padding: 10px 14px;
`;
const Chip = styled.div<{ $color: string; $current: boolean }>`
  display: flex; align-items: center; gap: 6px; font-size: 12.5px; padding: 4px 10px; border-radius: 20px;
  color: ${(p) => (p.$current ? C.ink : C.muted)};
  background: ${(p) => (p.$current ? 'rgba(164,255,17,0.16)' : 'transparent')};
  border: 1px solid ${(p) => (p.$current ? C.green : 'transparent')};
  font-weight: ${(p) => (p.$current ? 700 : 500)};
`;
const Dot = styled.span<{ $color: string }>`
  width: 10px; height: 10px; border-radius: 50%; background: ${(p) => p.$color}; flex-shrink: 0;
`;
const You = styled.span`font-size: 10px; text-transform: uppercase; color: ${C.mutedSoft};`;

const FinishedBanner = styled.div`
  text-align: center; padding: 12px 16px; border-radius: 10px; font-weight: 700;
  background: rgba(164,255,17,0.16); border: 1px solid ${C.green}; color: ${C.greenInk};
`;

const Shell = styled.div`
  display: grid; grid-template-columns: 1fr 280px; gap: 18px;
  @media (max-width: 760px) { grid-template-columns: 1fr; }
`;

const Board = styled.div`
  aspect-ratio: 1 / 1; background: ${C.paper2}; border: 3px solid ${C.line}; border-radius: 10px;
  display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); gap: 4px; padding: 4px;
`;
const HomeQuad = styled.div<{ $color: string }>`
  border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  background: ${(p) => p.$color}33; border: 2px solid ${(p) => p.$color};
  .label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; color: ${C.muted}; }
  .tokens { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; width: 70%; }
`;
const TokenDot = styled.span<{ $color: string }>`
  width: 14px; height: 14px; border-radius: 50%; background: ${(p) => p.$color}; border: 2px solid rgba(0,0,0,0.35);
`;
const CenterQuad = styled.div`
  background: ${C.paper}; border-radius: 8px; display: flex; align-items: center; justify-content: center;
`;
const Star = styled.div`
  width: 65%; height: 65%;
  background: conic-gradient(#d9534f 0 90deg, #4f83d9 90deg 180deg, #e0c458 180deg 270deg, #63c168 270deg 360deg);
  clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
`;
const PathQuad = styled.div`
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 8px;
  display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); gap: 2px; padding: 4px;
`;
const Cell = styled.div<{ $safe: boolean }>`
  background: ${(p) => (p.$safe ? 'rgba(164,255,17,0.14)' : C.paper2)};
  border-radius: 3px; position: relative; display: flex; align-items: center; justify-content: center;
`;
const Token = styled.span<{ $color: string }>`
  width: 65%; height: 65%; border-radius: 50%; background: ${(p) => p.$color}; border: 2px solid rgba(0,0,0,0.35);
`;

const SidePanel = styled.div`display: flex; flex-direction: column; gap: 14px;`;
const cardBase = `
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 12px; padding: 14px 16px;
`;
const DiceCard = styled.div`
  ${cardBase} text-align: center;
  .label { font-size: 11px; color: ${C.muted}; text-transform: uppercase; letter-spacing: 0.4px; }
`;
const DiceFace = styled.div`
  width: 60px; height: 60px; margin: 10px auto; background: #fff; border-radius: 10px;
  display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr);
  padding: 8px; gap: 3px; border: 1px solid ${C.line};
`;
const Pip = styled.span<{ $on: boolean }>`
  border-radius: 50%; background: ${(p) => (p.$on ? '#20260f' : 'transparent')};
`;
const Value = styled.div`font-size: 22px; font-weight: 800; color: ${C.greenInk};`;
const ExtraTurnBanner = styled.div`
  margin-top: 8px; font-size: 11px; font-weight: 700; padding: 7px 8px; border-radius: 8px;
  background: rgba(164,255,17,0.16); border: 1px solid ${C.green}; color: ${C.greenInk};
`;
const RollBtn = styled.button`
  margin-top: 10px; width: 100%; padding: 10px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer;
  color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c;
  &:disabled { opacity: 0.5; cursor: default; }
`;
const TokensCard = styled.div`
  ${cardBase}
  .label { font-size: 11px; color: ${C.muted}; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px; }
`;
const Hint = styled.p`font-size: 12.5px; color: ${C.mutedSoft};`;
const TokenRow = styled.div<{ $color: string }>`
  display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 12.5px;
  .dot { width: 10px; height: 10px; border-radius: 50%; background: ${(p) => p.$color}; flex-shrink: 0; }
  .status { flex: 1; color: ${C.ink}; }
  button {
    padding: 4px 10px; font-size: 11.5px; font-weight: 700; border-radius: 7px; cursor: pointer;
    color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c;
    &:disabled { opacity: 0.4; cursor: default; }
  }
`;
const LegendCard = styled.div`
  ${cardBase}
  .label { font-size: 11px; color: ${C.muted}; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px; }
`;
const LegendRow = styled.div`
  display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: ${C.muted}; padding: 5px 0;
  span:first-child { display: flex; align-items: center; gap: 6px; }
  .amt { font-weight: 700; color: ${C.ink}; }
`;
