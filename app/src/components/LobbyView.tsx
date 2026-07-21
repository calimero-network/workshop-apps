import React from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import type { UseWorkspaceReturn } from '../hooks/useWorkspace';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { MemberLabel } from './MemberLabel';
import RoomList from './RoomList';

interface Props {
  ws: UseWorkspaceReturn;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * LobbyView (spec frontendView) - the open/recent matches list (scaffold's
 * RoomList, reskinned to "match" copy) alongside the group's win leaderboard.
 * Two-column layout on the game-lobby preset, stacking on narrow screens.
 */
export default function LobbyView({ ws }: Props): React.ReactElement {
  const { entries, loading } = useLeaderboard(ws.directoryContextId, ws.executorPublicKey);

  return (
    <Grid>
      <RoomList ws={ws} />
      <Board data-testid="leaderboard-panel">
        <Head>Group Leaderboard</Head>
        {entries.length === 0 && !loading && (
          <Empty>No wins yet — finish a match to top the board.</Empty>
        )}
        <Rows>
          {entries.map((entry, i) => (
            <Row key={entry.player} data-testid="item-leaderboard-entry">
              <div className="who">
                <Rank $top={i < 3}>{MEDALS[i] ?? i + 1}</Rank>
                <MemberLabel memberId={entry.player} />
              </div>
              <Wins>{entry.wins} {entry.wins === 1 ? 'win' : 'wins'}</Wins>
            </Row>
          ))}
        </Rows>
      </Board>
    </Grid>
  );
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1.7fr 1fr;
  gap: 18px;
  align-items: start;
  @media (max-width: 760px) { grid-template-columns: 1fr; }
`;
const Board = styled.div`
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 14px; padding: 16px;
`;
const Head = styled.div`
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: ${C.muted};
  margin-bottom: 12px;
`;
const Empty = styled.p`font-size: 13.5px; color: ${C.mutedSoft}; padding: 4px 2px;`;
const Rows = styled.div`display: flex; flex-direction: column;`;
const Row = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 9px 2px; border-bottom: 1px solid ${C.line}; font-size: 13px;
  &:last-child { border-bottom: none; }
  .who { display: flex; align-items: center; gap: 10px; min-width: 0; }
`;
const Rank = styled.span<{ $top: boolean }>`
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; display: inline-flex;
  align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
  background: ${(p) => (p.$top ? 'var(--color-accent, ' + C.paper + ')' : C.paper)};
  color: ${C.ink};
  border: 1px solid ${C.line};
`;
const Wins = styled.span`font-weight: 700; color: ${C.greenInk}; font-size: 13px; white-space: nowrap;`;
