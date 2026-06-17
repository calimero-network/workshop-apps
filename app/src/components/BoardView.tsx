/**
 * BoardView — grid of all members' habits with streak counts,
 * check-in buttons for the current user's habits, and cheer
 * buttons for friends' habits.
 */

import React, { useState } from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import type { Habit, Cheer } from '../api/streak_board/StreakBoardClient';

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}\u2026${id.slice(-5)}`;
}

function todayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface BoardViewProps {
  habits: Habit[];
  selfIdentity: string | null;
  memberNames: Record<string, string>;
  onCheckIn: (habitId: string) => Promise<void>;
  onCheer: (habitId: string, message: string) => Promise<void>;
  onGetCheers: (habitId: string) => Promise<Cheer[]>;
  onAddHabit: () => void;
  loading: boolean;
}

export default function BoardView({
  habits,
  selfIdentity,
  memberNames,
  onCheckIn,
  onCheer,
  onGetCheers,
  onAddHabit,
  loading,
}: BoardViewProps) {
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [cheering, setCheering] = useState<string | null>(null);
  const [cheerMsg, setCheerMsg] = useState('');
  const [cheerTarget, setCheerTarget] = useState<string | null>(null);
  const [cheersCache, setCheersCache] = useState<Record<string, Cheer[]>>({});
  const [expandedCheers, setExpandedCheers] = useState<string | null>(null);

  const today = todayDate();

  const handleCheckIn = async (habit: Habit) => {
    setCheckingIn(habit.id);
    try {
      await onCheckIn(habit.id);
    } finally {
      setCheckingIn(null);
    }
  };

  const openCheerInput = (habitId: string) => {
    setCheerTarget(habitId);
    setCheerMsg('');
  };

  const handleSendCheer = async () => {
    if (!cheerTarget || !cheerMsg.trim()) return;
    setCheering(cheerTarget);
    try {
      await onCheer(cheerTarget, cheerMsg.trim());
      setCheerTarget(null);
      setCheerMsg('');
    } finally {
      setCheering(null);
    }
  };

  const handleViewCheers = async (habitId: string) => {
    if (expandedCheers === habitId) {
      setExpandedCheers(null);
      return;
    }
    const cheers = await onGetCheers(habitId);
    setCheersCache((prev) => ({ ...prev, [habitId]: cheers }));
    setExpandedCheers(habitId);
  };

  const memberOf = (author: string) =>
    memberNames[author] || shortenId(author);

  // Group habits by author
  const byAuthor = habits.reduce<Record<string, Habit[]>>((acc, h) => {
    (acc[h.author] = acc[h.author] || []).push(h);
    return acc;
  }, {});

  const authors = Object.keys(byAuthor);

  if (loading && habits.length === 0) {
    return <Loading>Loading habits&hellip;</Loading>;
  }

  return (
    <Root>
      <TopBar>
        <PageTitle>🎯 Habit Board</PageTitle>
        <AddBtn onClick={onAddHabit}>+ Add Habit</AddBtn>
      </TopBar>

      {habits.length === 0 && !loading && (
        <Empty>
          <div className="icon">🎯</div>
          <div className="title">No habits yet</div>
          <div className="body">
            Click &ldquo;+ Add Habit&rdquo; to commit to your first habit and start building your streak.
          </div>
        </Empty>
      )}

      <Grid>
        {authors.map((author) => {
          const isSelf = author === selfIdentity;
          const authorHabits = byAuthor[author];
          return (
            <AuthorCol key={author}>
              <ColHeader>
                <AuthorAvatar>{memberOf(author).charAt(0).toUpperCase()}</AuthorAvatar>
                <AuthorName $isSelf={isSelf}>
                  {memberOf(author)}
                  {isSelf && <YouBadge>you</YouBadge>}
                </AuthorName>
              </ColHeader>

              {authorHabits.map((habit) => {
                const checkedInToday = habit.last_check_in_date === today;
                const isMine = habit.author === selfIdentity;
                const cachedCheers = cheersCache[habit.id] ?? [];
                const cheersShown = expandedCheers === habit.id;

                return (
                  <HabitCard key={habit.id}>
                    <CardTop>
                      <HabitTitle title={habit.title}>{habit.title}</HabitTitle>
                      {checkedInToday && <DoneBadge>✓ done today</DoneBadge>}
                    </CardTop>

                    <StreakRow>
                      <StreakBlock>
                        <StreakFire $active={habit.current_streak > 0}>🔥</StreakFire>
                        <StreakNum>{habit.current_streak}</StreakNum>
                        <StreakLabel>day streak</StreakLabel>
                      </StreakBlock>
                      <StreakBlock>
                        <StreakLabel style={{ marginLeft: 'auto' }}>best</StreakLabel>
                        <BestNum>{habit.longest_streak}</BestNum>
                      </StreakBlock>
                    </StreakRow>

                    <CardActions>
                      {isMine && (
                        <CheckInBtn
                          disabled={checkedInToday || checkingIn === habit.id}
                          onClick={() => handleCheckIn(habit)}
                          title={checkedInToday ? 'Already checked in today' : 'Check in for today'}
                        >
                          {checkingIn === habit.id ? 'Saving…' : checkedInToday ? '✓ Checked In' : '✓ Check In'}
                        </CheckInBtn>
                      )}
                      {!isMine && (
                        <CheerBtn
                          disabled={cheering === habit.id}
                          onClick={() => openCheerInput(habit.id)}
                          title="Send a cheer"
                        >
                          🎉 Cheer
                        </CheerBtn>
                      )}
                      <ViewCheersBtn
                        onClick={() => handleViewCheers(habit.id)}
                        title="View cheers"
                      >
                        🙌 {cheersShown ? 'Hide' : 'Cheers'}
                      </ViewCheersBtn>
                    </CardActions>

                    {/* Inline cheer input */}
                    {cheerTarget === habit.id && (
                      <CheerInput>
                        <input
                          autoFocus
                          value={cheerMsg}
                          onChange={(e) => setCheerMsg(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { void handleSendCheer(); }
                            if (e.key === 'Escape') { setCheerTarget(null); }
                          }}
                          placeholder="Write a cheer…"
                          maxLength={120}
                        />
                        <button
                          onClick={() => void handleSendCheer()}
                          disabled={cheering === habit.id || !cheerMsg.trim()}
                        >
                          {cheering === habit.id ? '…' : 'Send'}
                        </button>
                        <button className="cancel" onClick={() => setCheerTarget(null)}>✕</button>
                      </CheerInput>
                    )}

                    {/* Cheers list */}
                    {cheersShown && (
                      <CheerList>
                        {cachedCheers.length === 0 && (
                          <CheerItem><span className="body">No cheers yet — be the first!</span></CheerItem>
                        )}
                        {cachedCheers.map((c) => (
                          <CheerItem key={c.id}>
                            <span className="author">{memberOf(c.author)}</span>
                            <span className="body">{c.message}</span>
                          </CheerItem>
                        ))}
                      </CheerList>
                    )}
                  </HabitCard>
                );
              })}
            </AuthorCol>
          );
        })}
      </Grid>
    </Root>
  );
}

/* ── styles ── */
const Root = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--c-paper2, ${C.paper2});
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 14px;
  border-bottom: 1px solid ${C.line};
  background: ${C.paper};
`;

const PageTitle = styled.h1`
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -0.5px;
  color: ${C.ink};
  margin: 0;
`;

const AddBtn = styled.button`
  padding: 9px 20px;
  font-size: 14px;
  font-weight: 700;
  color: ${C.onAccent};
  background: var(--color-primary, ${C.green});
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: opacity 0.14s, transform 0.12s;
  &:hover { opacity: 0.88; transform: translateY(-1px); }
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

const Grid = styled.div`
  flex: 1;
  display: flex;
  gap: 0;
  overflow-x: auto;
  overflow-y: auto;
  padding: 20px;
  gap: 16px;
  align-items: flex-start;
`;

const AuthorCol = styled.div`
  min-width: 260px;
  max-width: 300px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ColHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 4px 4px;
  border-bottom: 2px solid var(--color-primary, ${C.green});
  margin-bottom: 4px;
`;

const AuthorAvatar = styled.div`
  width: 32px; height: 32px;
  border-radius: 50%;
  display: grid; place-items: center;
  font-size: 14px; font-weight: 700;
  color: ${C.onAccent};
  background: var(--color-primary, ${C.green});
  flex-shrink: 0;
`;

const AuthorName = styled.div<{ $isSelf?: boolean }>`
  font-size: 14px;
  font-weight: 700;
  color: ${C.ink};
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const YouBadge = styled.span`
  font-size: 10px;
  font-weight: 700;
  color: ${C.greenDeep};
  background: rgba(164,255,17,0.18);
  padding: 2px 7px;
  border-radius: 999px;
`;

const HabitCard = styled.div`
  background: ${C.paper};
  border: 1px solid ${C.line};
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: box-shadow 0.16s;
  &:hover { box-shadow: 0 4px 18px rgba(0,0,0,0.07); }
`;

const CardTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
`;

const HabitTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: ${C.ink};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
`;

const DoneBadge = styled.span`
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 700;
  color: ${C.greenDeep};
  background: rgba(164,255,17,0.18);
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
`;

const StreakRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const StreakBlock = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const StreakFire = styled.span<{ $active?: boolean }>`
  font-size: 18px;
  opacity: ${(p) => (p.$active ? 1 : 0.25)};
`;

const StreakNum = styled.span`
  font-size: 24px;
  font-weight: 900;
  color: var(--color-primary, #F59E0B);
  letter-spacing: -1px;
`;

const BestNum = styled.span`
  font-size: 16px;
  font-weight: 700;
  color: var(--color-accent, #8B5CF6);
`;

const StreakLabel = styled.span`
  font-size: 11px;
  color: ${C.mutedSoft};
  font-weight: 600;
`;

const CardActions = styled.div`
  display: flex;
  gap: 6px;
`;

const baseCardBtn = `
  flex: 1;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 700;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid;
  transition: opacity 0.14s, transform 0.12s;
  &:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
  &:not(:disabled):hover { transform: translateY(-1px); }
`;

const CheckInBtn = styled.button`
  ${baseCardBtn}
  color: ${C.onAccent};
  background: var(--color-primary, #F59E0B);
  border-color: var(--color-primary, #F59E0B);
`;

const CheerBtn = styled.button`
  ${baseCardBtn}
  color: var(--color-accent, #8B5CF6);
  background: rgba(139,92,246,0.08);
  border-color: rgba(139,92,246,0.3);
`;

const ViewCheersBtn = styled.button`
  ${baseCardBtn}
  flex: 0;
  white-space: nowrap;
  color: ${C.muted};
  background: transparent;
  border-color: ${C.line};
  &:hover { background: ${C.paper2}; }
`;

const CheerInput = styled.div`
  display: flex;
  gap: 6px;
  margin-top: 2px;
  input {
    flex: 1;
    padding: 7px 10px;
    font-size: 13px;
    border: 1px solid ${C.line};
    border-radius: 8px;
    background: ${C.paper2};
    color: ${C.ink};
    outline: none;
    &:focus { border-color: var(--color-accent, #8B5CF6); }
  }
  button {
    padding: 7px 12px;
    font-size: 12px;
    font-weight: 700;
    border-radius: 8px;
    cursor: pointer;
    border: 1px solid;
    transition: opacity 0.14s;
    &:disabled { opacity: 0.4; cursor: not-allowed; }
  }
  button:first-of-type {
    color: white;
    background: var(--color-accent, #8B5CF6);
    border-color: var(--color-accent, #8B5CF6);
  }
  button.cancel {
    color: ${C.muted};
    background: transparent;
    border-color: ${C.line};
  }
`;

const CheerList = styled.div`
  border-top: 1px solid ${C.line};
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 140px;
  overflow-y: auto;
`;

const CheerItem = styled.div`
  font-size: 12px;
  line-height: 1.5;
  display: flex;
  gap: 6px;
  .author {
    font-weight: 700;
    color: var(--color-accent, #8B5CF6);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .body { color: ${C.muted}; }
`;
