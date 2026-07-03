/**
 * useStandup — CRDT-backed data hook for the async standup board.
 *
 * Wraps AsyncstandupClient and provides live-updating standup entries and
 * comment helpers. useSubscription re-fetches on any sync event so changes
 * from all peers appear within seconds, no polling required.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import {
  AsyncstandupClient,
  StandupEntry,
  Comment,
} from '../generated/AsyncstandupClient';

export type { StandupEntry, Comment };

export interface UseStandupArgs {
  contextId: string | null;
  executorPublicKey: string | null;
}

export interface UseStandupReturn {
  standups: StandupEntry[];
  loading: boolean;
  error: Error | null;
  ready: boolean;
  refresh: () => Promise<void>;
  postStandup: (
    done_items: string,
    blockers: string,
    planned_items: string,
    date: string,
  ) => Promise<void>;
  editStandup: (
    id: string,
    done_items: string,
    blockers: string,
    planned_items: string,
  ) => Promise<void>;
  deleteStandup: (id: string) => Promise<void>;
  getStandupsByDate: (date: string) => Promise<StandupEntry[]>;
  addComment: (standup_id: string, body: string) => Promise<void>;
  getComments: (standup_id: string) => Promise<Comment[]>;
}

export function useStandup({ contextId, executorPublicKey }: UseStandupArgs): UseStandupReturn {
  const { mero } = useMero();
  const [standups, setStandups] = useState<StandupEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Memoized typed client — null until context + executor identity resolve.
  const client = useMemo(
    () =>
      mero && contextId && executorPublicKey
        ? new AsyncstandupClient(mero, contextId, executorPublicKey)
        : null,
    [mero, contextId, executorPublicKey],
  );

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      setStandups(await client.getStandups());
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Re-fetch on every sync event (local mutations + remote peer updates).
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const postStandup = useCallback(
    async (done_items: string, blockers: string, planned_items: string, date: string) => {
      if (!client) return;
      await client.postStandup({ done_items, blockers, planned_items, date });
      await refresh();
    },
    [client, refresh],
  );

  const editStandup = useCallback(
    async (id: string, done_items: string, blockers: string, planned_items: string) => {
      if (!client) return;
      await client.editStandup({ id, done_items, blockers, planned_items });
      await refresh();
    },
    [client, refresh],
  );

  const deleteStandup = useCallback(
    async (id: string) => {
      if (!client) return;
      await client.deleteStandup({ id });
      await refresh();
    },
    [client, refresh],
  );

  const getStandupsByDate = useCallback(
    async (date: string): Promise<StandupEntry[]> => {
      if (!client) return [];
      return client.getStandupsByDate({ date });
    },
    [client],
  );

  const addComment = useCallback(
    async (standup_id: string, body: string) => {
      if (!client) return;
      await client.addComment({ standup_id, body });
      // Subscription will trigger a global refresh; no local refresh needed
      // for comments since they're fetched per-standup on demand.
    },
    [client],
  );

  const getComments = useCallback(
    async (standup_id: string): Promise<Comment[]> => {
      if (!client) return [];
      return client.getComments({ standup_id });
    },
    [client],
  );

  return {
    standups,
    loading,
    error,
    ready: client !== null,
    refresh,
    postStandup,
    editStandup,
    deleteStandup,
    getStandupsByDate,
    addComment,
    getComments,
  };
}
