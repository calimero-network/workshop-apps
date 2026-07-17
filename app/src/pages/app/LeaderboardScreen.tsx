import React from 'react';
import styled from 'styled-components';
import { C } from '../../theme';
import { MemberLabel } from '../../components/MemberLabel';
import type { PlayerStatus } from '../../api/room/RoomClient';

/**
 * LeaderboardScreen — all-time best score per player, ranked best first.
 *
 * `entries` is the live `get_leaderboard()` feed threaded down from
 * `useRoom` via AppPage, refreshed on every sync event so a beaten best
 * score climbs the board live for every member.
 */

const MEDALS = ['🥇', '🥈', '🥉'];

interface LeaderboardScreenProps {
  entries: PlayerStatus[];
}

export default function LeaderboardScreen({ entries }: LeaderboardScreenProps) {
  const ranked = [...entries].sort((a, b) => b.best_score - a.best_score);

  return (
    <Wrap>
      <h2>All-time leaderboard</h2>
      <p className="sub">Best-ever score per player, across every game and duel.</p>

      <List>
        {ranked.length === 0 && <Hint>No scores yet — play a game to take the top spot.</Hint>}
        {ranked.map((p, i) => (
          <Row key={p.player} data-testid="item-player_status" className={i === 0 ? 'top' : ''}>
            <span className="rank">{MEDALS[i] ?? `#${i + 1}`}</span>
            <span className="who"><MemberLabel memberId={p.player} /></span>
            <span className="score">{p.best_score}</span>
          </Row>
        ))}
      </List>
    </Wrap>
  );
}

const Wrap = styled.div`
  max-width: 560px;
  h2 { font-size: 20px; font-weight: 800; color: ${C.ink}; margin-bottom: 4px; }
  .sub { font-size: 13px; color: ${C.muted}; margin-bottom: 20px; }
`;

const List = styled.div`display: flex; flex-direction: column; gap: 8px;`;

const Row = styled.div`
  display: grid; grid-template-columns: 32px 1fr auto; align-items: center; gap: 12px;
  padding: 12px 16px; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 12px;
  &.top { border-color: rgba(250, 204, 21, 0.6); background: rgba(250, 204, 21, 0.08); }
  .rank { font-size: 16px; text-align: center; }
  .who { font-size: 14px; font-weight: 600; color: ${C.ink}; }
  .score { font-family: ${C.mono}; font-size: 16px; font-weight: 700; color: ${C.greenDeep}; }
`;

const Hint = styled.p`font-size: 13px; color: ${C.muted};`;
