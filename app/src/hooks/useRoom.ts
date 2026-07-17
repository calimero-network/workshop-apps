/**
 * useRoom — live data binding over the `room` service (member status, timed
 * duels, all-time leaderboard).
 *
 * Same canonical pattern as the foundation's `useItems`:
 *  - a typed generated client (`RoomClient`) wraps `mero.rpc.execute`.
 *  - `useSubscription([contextId])` re-fetches on every sync event, so a
 *    peer's status/score/duel change appears live with no polling.
 *  - every mutation is followed by an optimistic `refresh()`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { RoomClient, Duel, DuelResult, PlayerStatus } from '../api/room/RoomClient';

export interface UseRoomArgs {
  contextId: string | null;
  executorPublicKey: string | null;
}

export interface UseRoomReturn {
  members: PlayerStatus[];
  leaderboard: PlayerStatus[];
  duels: Duel[];
  duelResults: Record<string, DuelResult[]>;
  /** This player's own row in `members`, if reported at least once. */
  self: PlayerStatus | null;
  loading: boolean;
  error: Error | null;
  ready: boolean;
  updateStatus: (status: 'playing' | 'idle', score: number, length: number) => Promise<void>;
  startDuel: (durationSeconds: number) => Promise<string | null>;
  submitDuelResult: (duelId: string, score: number, length: number) => Promise<void>;
  finishDuel: (duelId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useRoom({ contextId, executorPublicKey }: UseRoomArgs): UseRoomReturn {
  const { mero } = useMero();
  const [members, setMembers] = useState<PlayerStatus[]>([]);
  const [leaderboard, setLeaderboard] = useState<PlayerStatus[]>([]);
  const [duels, setDuels] = useState<Duel[]>([]);
  const [duelResults, setDuelResults] = useState<Record<string, DuelResult[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Memoized typed client — null until the context + identity resolve.
  const client = useMemo(
    () =>
      mero && contextId && executorPublicKey
        ? new RoomClient(mero, contextId, executorPublicKey)
        : null,
    [mero, contextId, executorPublicKey],
  );

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [nextMembers, nextLeaderboard, nextDuels] = await Promise.all([
        client.listMembers(),
        client.getLeaderboard(),
        client.getDuels(),
      ]);
      setMembers(nextMembers);
      setLeaderboard(nextLeaderboard);
      setDuels(nextDuels);

      // Results are only meaningful for finished duels — pull them so history
      // (winner badge + per-player score) stays visible for every room member.
      const finished = nextDuels.filter((d) => d.status === 'finished');
      if (finished.length > 0) {
        const entries = await Promise.all(
          finished.map(async (d) => [d.id, await client.getDuelResults({ duel_id: d.id })] as const),
        );
        setDuelResults((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live updates: re-fetch on any sync event for this context (local or remote) —
  // covers other players' status/score changes and shared duel state.
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const updateStatus = useCallback(async (status: 'playing' | 'idle', score: number, length: number) => {
    if (!client) return;
    await client.updateStatus({ status, score, length });
    await refresh();
  }, [client, refresh]);

  const startDuel = useCallback(async (durationSeconds: number) => {
    if (!client) return null;
    const id = await client.startDuel({ duration_seconds: durationSeconds });
    await refresh();
    return id;
  }, [client, refresh]);

  const submitDuelResult = useCallback(async (duelId: string, score: number, length: number) => {
    if (!client) return;
    await client.submitDuelResult({ duel_id: duelId, score, length });
    await refresh();
  }, [client, refresh]);

  const finishDuel = useCallback(async (duelId: string) => {
    if (!client) return;
    await client.finishDuel({ duel_id: duelId });
    await refresh();
  }, [client, refresh]);

  const self = useMemo(
    () => members.find((m) => m.player === executorPublicKey) ?? null,
    [members, executorPublicKey],
  );

  return {
    members,
    leaderboard,
    duels,
    duelResults,
    self,
    loading,
    error,
    ready: client !== null,
    updateStatus,
    startDuel,
    submitDuelResult,
    finishDuel,
    refresh,
  };
}
