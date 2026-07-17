import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { C } from '../../theme';
import { MemberLabel } from '../../components/MemberLabel';
import { PLACEHOLDER_DUELS, PLACEHOLDER_DUEL_RESULTS, PLACEHOLDER_MEMBERS } from '../../data/placeholders';
import type { Duel, DuelResult } from '../../types/domain';

/**
 * DuelsScreen — challenge-the-room button with a shared countdown, plus a
 * history of past duels with winner badges.
 *
 * SHELL PASS: the countdown + result generation run entirely client-side so
 * the flow can be reviewed before the backend exists. The wiring pass swaps:
 *  - "Challenge the room"  → `start_duel(duration_seconds)`,
 *  - the ticking countdown → `get_duels()` + `useSubscription` (shared, not
 *    just local — every room member should see the same clock),
 *  - `finishDuel`          → `finish_duel(duel_id)` once the timer elapses,
 *  - results               → `get_duel_results(duel_id)`.
 */

const SELF_ID = 'you';
const DURATIONS = [30, 60, 90] as const;

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function DuelsScreen() {
  const [duels, setDuels] = useState<Duel[]>(PLACEHOLDER_DUELS);
  const [results, setResults] = useState<Record<string, DuelResult[]>>(PLACEHOLDER_DUEL_RESULTS);
  const [duration, setDuration] = useState<number>(DURATIONS[1]);
  const [tick, setTick] = useState(0);

  const active = duels.find((d) => d.status === 'active') ?? null;

  // Shared countdown tick — re-render every second while a duel is running.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [active?.id]);

  useEffect(() => {
    if (!active) return;
    const elapsed = Math.floor((Date.now() - active.started_at) / 1000);
    if (elapsed >= active.duration_seconds) finishDuel(active.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, active]);

  function startDuel() {
    if (active) return; // a duel cannot start while another is in progress
    const id = `duel-${Math.random().toString(36).slice(2, 8)}`;
    const duel: Duel = {
      id,
      initiator: SELF_ID,
      status: 'active',
      duration_seconds: duration,
      started_at: Date.now(),
      ended_at: null,
    };
    setDuels((prev) => [duel, ...prev]);
  }

  function finishDuel(duelId: string) {
    setDuels((prev) => prev.map((d) => (d.id === duelId ? { ...d, status: 'finished', ended_at: Date.now() } : d)));
    setResults((prev) => {
      if (prev[duelId]) return prev;
      const participants = [SELF_ID, ...PLACEHOLDER_MEMBERS.map((m) => m.player)];
      const rows: DuelResult[] = participants.map((author, i) => ({
        id: `result-${duelId}-${i}`,
        duel_id: duelId,
        author,
        score: 20 + Math.floor(Math.random() * 60),
        length: 4 + Math.floor(Math.random() * 8),
        created_at: Date.now(),
      }));
      return { ...prev, [duelId]: rows };
    });
  }

  const remaining = active ? active.duration_seconds - Math.floor((Date.now() - active.started_at) / 1000) : 0;

  return (
    <Wrap>
      <Challenge>
        <div className="row">
          <div>
            <h2>Challenge the room</h2>
            <p>Everyone races the clock together — highest score when time runs out wins.</p>
          </div>
          {!active && (
            <DurationField>
              <label htmlFor="duel-duration">Duration</label>
              <select
                id="duel-duration"
                data-testid="field-duration_seconds"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {DURATIONS.map((d) => <option key={d} value={d}>{d}s</option>)}
              </select>
            </DurationField>
          )}
        </div>

        {active ? (
          <Countdown data-testid="duel-countdown">
            <span className="clock">{formatClock(remaining)}</span>
            <span className="label">
              duel in progress — started by{' '}
              {active.initiator === SELF_ID ? 'you' : <MemberLabel memberId={active.initiator} className="inline" />}
            </span>
          </Countdown>
        ) : (
          <StartBtn data-testid="action-start_duel" onClick={startDuel}>Start a duel</StartBtn>
        )}
      </Challenge>

      <History>
        <h3>Past duels</h3>
        {duels.length === 0 && <Hint>No duels yet — start the first one above.</Hint>}
        {duels.map((duel) => {
          const rows = [...(results[duel.id] ?? [])].sort((a, b) => b.score - a.score);
          const topScore = rows[0]?.score;
          return (
            <DuelCard key={duel.id} data-testid="item-duel">
              <div className="head">
                <span className="who">
                  {duel.initiator === SELF_ID ? 'you' : <MemberLabel memberId={duel.initiator} />} challenged the room
                </span>
                <span className={`status ${duel.status}`}>{duel.status}</span>
              </div>
              <div className="meta">
                <span>{duel.duration_seconds}s duel</span>
                {duel.ended_at && <span>{formatTimestamp(duel.ended_at)}</span>}
              </div>
              {duel.status === 'finished' && rows.length > 0 && (
                <ResultList>
                  {rows.map((r) => (
                    <ResultRow key={r.id} data-testid="item-duel_result">
                      <div className="who">
                        {r.author === SELF_ID ? 'you' : <MemberLabel memberId={r.author} />}
                        {r.score === topScore && <Winner>🏆 winner</Winner>}
                      </div>
                      <div className="stats">
                        <span>score {r.score}</span>
                        <span>len {r.length}</span>
                      </div>
                    </ResultRow>
                  ))}
                </ResultList>
              )}
            </DuelCard>
          );
        })}
      </History>
    </Wrap>
  );
}

const Wrap = styled.div`display: flex; flex-direction: column; gap: 24px;`;

const Challenge = styled.div`
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 14px; padding: 20px;
  .row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  h2 { font-size: 17px; font-weight: 800; color: ${C.ink}; margin-bottom: 4px; }
  p { font-size: 13px; color: ${C.muted}; max-width: 420px; }
`;

const DurationField = styled.div`
  display: flex; flex-direction: column; gap: 4px;
  label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: ${C.mutedSoft}; }
  select {
    padding: 7px 10px; font-size: 13px; border-radius: 8px; border: 1px solid ${C.line};
    background: ${C.paper}; color: ${C.ink};
  }
`;

const StartBtn = styled.button`
  margin-top: 16px;
  padding: 11px 20px; font-size: 13.5px; font-weight: 700; border-radius: 10px; cursor: pointer;
  color: ${C.onAccent}; background: ${C.green}; border: 1px solid ${C.greenHover};
  &:hover { background: ${C.greenHover}; }
`;

const Countdown = styled.div`
  margin-top: 18px; display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap;
  .clock { font-family: ${C.mono}; font-size: 34px; font-weight: 700; color: ${C.accentInk}; }
  .label { font-size: 12.5px; color: ${C.muted}; }
  .inline { display: inline; }
`;

const History = styled.div`
  h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: ${C.muted}; margin-bottom: 12px; }
`;

const Hint = styled.p`font-size: 13px; color: ${C.muted};`;

const DuelCard = styled.div`
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px;
  .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .who { font-size: 14px; font-weight: 600; color: ${C.ink}; }
  .status {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; padding: 3px 9px; border-radius: 999px;
    &.active { background: rgba(250,204,21,0.22); color: ${C.accentInk}; }
    &.finished { background: rgba(34,197,94,0.16); color: ${C.greenDeep}; }
  }
  .meta { display: flex; gap: 10px; font-size: 11.5px; color: ${C.mutedSoft}; margin-top: 4px; }
`;

const ResultList = styled.div`display: flex; flex-direction: column; gap: 6px; margin-top: 12px;`;

const ResultRow = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 8px 10px; background: ${C.paper2}; border-radius: 8px;
  .who { display: flex; align-items: center; gap: 8px; font-size: 13px; color: ${C.ink}; }
  .stats { display: flex; gap: 10px; font-family: ${C.mono}; font-size: 11.5px; color: ${C.muted}; }
`;

const Winner = styled.span`
  font-size: 10px; font-weight: 700; color: ${C.accentInk};
  background: rgba(250,204,21,0.25); padding: 2px 8px; border-radius: 999px;
`;
