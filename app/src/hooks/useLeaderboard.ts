/**
 * useLeaderboard (Ludo Lounge domain hook) - total wins per player, read from
 * the DIRECTORY context's `get_leaderboard`. Same shape as useLobby: a
 * memoized generated client wraps mero.rpc.execute, useSubscription refreshes
 * on every sync event for the directory context (a win is recorded there via
 * the room's xcall into `on_room_finished`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { DirectoryClient, LeaderboardEntry } from '../api/directory/DirectoryClient';

export interface UseLeaderboardReturn {
  entries: LeaderboardEntry[];
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useLeaderboard(
  directoryContextId: string | null,
  executorPublicKey: string | null,
): UseLeaderboardReturn {
  const { mero } = useMero();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const client = useMemo(
    () =>
      mero && directoryContextId && executorPublicKey
        ? new DirectoryClient(mero, directoryContextId, executorPublicKey)
        : null,
    [mero, directoryContextId, executorPublicKey],
  );

  const refetch = useCallback(async () => {
    if (!client) { setEntries([]); return; }
    setLoading(true);
    try {
      const list = await client.getLeaderboard();
      setEntries([...list].sort((a, b) => b.wins - a.wins));
    } catch {
      // transient RPC error - keep the last-known board, as useLobby does.
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void refetch(); }, [refetch]);

  // Live updates: a win lands here via the winning room's xcall, which syncs
  // to this context like any other mutation.
  useSubscription(directoryContextId ? [directoryContextId] : [], () => { void refetch(); });

  return { entries, loading, refetch };
}
