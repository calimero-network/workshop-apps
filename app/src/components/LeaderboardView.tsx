/**
 * LeaderboardView — ranked list of longest active streaks across all members.
 */

import React from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import type { Habit } from '../api/streak_board/StreakBoardClient';

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}\u2026${id.slice(-5)}`;
}

const MEDALS = ['🥇', '🥈', '🥉'];

interface LeaderboardViewProps {
  leaderboard: Habit[];
  selfIdentity: string | null;
  memberNames: Record<string, string>;
  loading: boolean;
}

export default function LeaderboardView({
  leaderboard,
  selfIdentity,
  memberNames,
  loading,
}: LeaderboardViewProps) {
  const memberOf = (author: string) =>
    memberNames[author] || shortenId(author);

  if (loading && leaderboard.length === 0) {
    return <Loading>Loading leaderboard&hellip;</Loading>;
  }

  return (
    <Root>
      <TopBar>
        <PageTitle>🏆 Streak Leaderboard</PageTitle>
        <Subtitle>Ranked by longest active streak — keep it going!</Subtitle>
      </TopBar>

      {leaderboard.length === 0 && !loading && (
        <Empty>
          <div className="icon">🏆</div>
          <div className="title">No streaks yet</div>
          <div className="body">
            Start checking in your habits to appear on the leaderboard.
          </div>
        </Empty>
      )}

      <TableWrap>
        {leaderboard.map((habit, i) => {
          const isSelf = habit.author === selfIdentity;
          const medal = i < 3 ? MEDALS[i] : null;
          const streakPct = leaderboard[0]?.current_streak
            ? Math.round((habit.current_streak / leaderboard[0].current_streak) * 100)
            : 0;

          return (
            <LeaderRow key={habit.id} $isSelf={isSelf}>
              <Rank>
                {medal ? (
                  <span>{medal}</span>
                ) : (
                  <span className="num">{i + 1}</span>
                )}
              </Rank>

              <MemberInfo>
                <MemberAvatar $isSelf={isSelf}>
                  {memberOf(habit.author).charAt(0).toUpperCase()}
                </MemberAvatar>
                <div>
                  <MemberName>
                    {memberOf(habit.author)}
                    {isSelf && <YouBadge>you</YouBadge>}
                  </MemberName>
                  <HabitLabel>{habit.title}</HabitLabel>
                </div>
              </MemberInfo>

              <StreakInfo>
                <StreakCount>{habit.current_streak}</StreakCount>
                <StreakLabel>days</StreakLabel>
              </StreakInfo>

              <BarWrap>
                <Bar style={{ width: `${streakPct}%` }} $isSelf={isSelf} />
              </BarWrap>
            </LeaderRow>
          );
        })}
      </TableWrap>
    </Root>
  );
}

/* ── styles ── */
const Root = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--c-paper2, ${C.paper2});
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  min-height: 0;
`;

const TopBar = styled.div`
  padding: 18px 24px 14px;
  border-bottom: 1px solid ${C.line};
  background: ${C.paper};
`;

const PageTitle = styled.h1`
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -0.5px;
  color: ${C.ink};
  margin: 0 0 4px;
`;

const Subtitle = styled.p`
  font-size: 13px;
  color: ${C.muted};
  margin: 0;
`;

const Loading = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  color: ${C.mutedSoft};
`;

const Empty = styled.div`
  margin: 48px auto;
  text-align: center;
  max-width: 360px;
  .icon { font-size: 48px; margin-bottom: 16px; }
  .title { font-size: 20px; font-weight: 800; color: ${C.ink}; margin-bottom: 8px; }
  .body { font-size: 14px; color: ${C.muted}; line-height: 1.6; }
`;

const TableWrap = styled.div`
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
`;

const LeaderRow = styled.div<{ $isSelf?: boolean }>`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
  background: ${(p) => (p.$isSelf ? 'rgba(245,158,11,0.08)' : C.paper)};
  border: 1px solid ${(p) => (p.$isSelf ? 'rgba(245,158,11,0.3)' : C.line)};
  border-radius: 14px;
  transition: box-shadow 0.15s;
  &:hover { box-shadow: 0 3px 14px rgba(0,0,0,0.06); }
`;

const Rank = styled.div`
  width: 32px;
  flex-shrink: 0;
  text-align: center;
  font-size: 22px;
  .num {
    font-size: 16px;
    font-weight: 800;
    color: ${C.muted};
  }
`;

const MemberInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
`;

const MemberAvatar = styled.div<{ $isSelf?: boolean }>`
  width: 36px; height: 36px;
  border-radius: 50%;
  display: grid; place-items: center;
  font-size: 16px; font-weight: 700;
  flex-shrink: 0;
  color: ${(p) => (p.$isSelf ? C.onAccent : C.ink)};
  background: ${(p) => (p.$isSelf ? 'var(--color-primary, #F59E0B)' : C.paper2)};
  border: 2px solid ${(p) => (p.$isSelf ? 'var(--color-primary, #F59E0B)' : C.line)};
`;

const MemberName = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: ${C.ink};
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const YouBadge = styled.span`
  font-size: 10px;
  font-weight: 700;
  color: ${C.greenDeep};
  background: rgba(164,255,17,0.18);
  padding: 2px 7px;
  border-radius: 999px;
`;

const HabitLabel = styled.div`
  font-size: 12px;
  color: ${C.muted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StreakInfo = styled.div`
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex-shrink: 0;
`;

const StreakCount = styled.span`
  font-size: 28px;
  font-weight: 900;
  color: var(--color-primary, #F59E0B);
  letter-spacing: -1.5px;
`;

const StreakLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: ${C.mutedSoft};
`;

const BarWrap = styled.div`
  width: 120px;
  height: 6px;
  border-radius: 999px;
  background: ${C.line};
  overflow: hidden;
  flex-shrink: 0;
`;

const Bar = styled.div<{ $isSelf?: boolean }>`
  height: 100%;
  border-radius: 999px;
  background: ${(p) => (p.$isSelf
    ? 'var(--color-primary, #F59E0B)'
    : 'var(--color-accent, #8B5CF6)')};
  transition: width 0.4s ease;
`;
