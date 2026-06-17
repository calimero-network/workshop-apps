/**
 * useStreakBoard — per-board context state hook.
 *
 * Manages habits, check-ins, cheers, and leaderboard for a single board
 * context. Subscribes to real-time updates via useSubscription.
 */

import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { StreakBoardClient, Habit, CheckIn, Cheer } from '../api/streak_board/StreakBoardClient';

export interface UseStreakBoardReturn {
  habits: Habit[];
  leaderboard: Habit[];
  loading: boolean;
  error: Error | null;
  boardExecutorKey: string | null;

  createHabit: (title: string) => Promise<void>;
  checkIn: (habitId: string) => Promise<void>;
  sendCheer: (habitId: string, message: string) => Promise<void>;
  getCheers: (habitId: string) => Promise<Cheer[]>;
  getCheckIns: (habitId: string) => Promise<CheckIn[]>;
  refresh: () => Promise<void>;
}

/** Returns today's date as YYYY-MM-DD in local time. */
function todayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function useStreakBoard(
  boardContextId: string | null,
  lobbyExecutorPublicKey: string | null,
): UseStreakBoardReturn {
  const { mero } = useMero();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [leaderboard, setLeaderboard] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Resolve the executor identity for this board context.
  const [boardExecutorKey, setBoardExecutorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !boardContextId) {
      setBoardExecutorKey(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(boardContextId);
        if (!cancelled && identities.length > 0) {
          setBoardExecutorKey(identities[0]);
        } else if (!cancelled && lobbyExecutorPublicKey) {
          setBoardExecutorKey(lobbyExecutorPublicKey);
        }
      } catch {
        if (!cancelled && lobbyExecutorPublicKey) {
          setBoardExecutorKey(lobbyExecutorPublicKey);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mero, boardContextId, lobbyExecutorPublicKey]);

  const getClient = useCallback((): StreakBoardClient | null => {
    if (!mero || !boardContextId || !boardExecutorKey) return null;
    return new StreakBoardClient(mero, boardContextId, boardExecutorKey);
  }, [mero, boardContextId, boardExecutorKey]);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [h, lb] = await Promise.all([
        client.listHabits(),
        client.getLeaderboard(),
      ]);
      setHabits(h);
      setLeaderboard(lb);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  // Load on mount and whenever the board context or executor changes.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // React to real-time sync events from other nodes.
  useSubscription(boardContextId ? [boardContextId] : [], () => {
    void refresh();
  });

  const createHabit = useCallback(async (title: string) => {
    const client = getClient();
    if (!client) return;
    await client.createHabit({ title });
    await refresh();
  }, [getClient, refresh]);

  const checkIn = useCallback(async (habitId: string) => {
    const client = getClient();
    if (!client) return;
    await client.checkIn({ habit_id: habitId, date: todayDate() });
    await refresh();
  }, [getClient, refresh]);

  const sendCheer = useCallback(async (habitId: string, message: string) => {
    const client = getClient();
    if (!client) return;
    await client.sendCheer({ habit_id: habitId, message });
    await refresh();
  }, [getClient, refresh]);

  const getCheers = useCallback(async (habitId: string): Promise<Cheer[]> => {
    const client = getClient();
    if (!client) return [];
    try {
      return await client.getCheers({ habit_id: habitId });
    } catch {
      return [];
    }
  }, [getClient]);

  const getCheckIns = useCallback(async (habitId: string): Promise<CheckIn[]> => {
    const client = getClient();
    if (!client) return [];
    try {
      return await client.getCheckIns({ habit_id: habitId });
    } catch {
      return [];
    }
  }, [getClient]);

  return {
    habits,
    leaderboard,
    loading,
    error,
    boardExecutorKey,
    createHabit,
    checkIn,
    sendCheer,
    getCheers,
    getCheckIns,
    refresh,
  };
}
