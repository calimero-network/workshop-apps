/**
 * useKudos — live kudos feed over KudosBoardClient.
 *
 * Same wiring pattern as the neutral foundation:
 *  - useWorkspace() resolves contextId + executorPublicKey
 *  - KudosBoardClient wraps mero.rpc.execute
 *  - useSubscription re-fetches on every sync event for live updates
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { KudosBoardClient, Kudos } from '../api/kudos-board/KudosBoardClient';

export interface UseKudosArgs {
  contextId: string | null;
  executorPublicKey: string | null;
}

export interface UseKudosReturn {
  feed: Kudos[];
  loading: boolean;
  error: Error | null;
  ready: boolean;
  postKudos: (recipient: string, message: string) => Promise<void>;
  deleteKudos: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useKudos({ contextId, executorPublicKey }: UseKudosArgs): UseKudosReturn {
  const { mero } = useMero();
  const [feed, setFeed] = useState<Kudos[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const client = useMemo(
    () =>
      mero && contextId && executorPublicKey
        ? new KudosBoardClient(mero, contextId, executorPublicKey)
        : null,
    [mero, contextId, executorPublicKey],
  );

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      // Backend already sorts newest-first; defensive sort in case of race.
      const raw = await client.getFeed();
      setFeed([...raw].sort((a, b) => b.created_at - a.created_at));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live updates: re-fetch whenever any peer posts or deletes kudos.
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const postKudos = useCallback(async (recipient: string, message: string) => {
    if (!client) return;
    await client.postKudos({ recipient, message });
    await refresh();
  }, [client, refresh]);

  const deleteKudos = useCallback(async (id: string) => {
    if (!client) return;
    await client.deleteKudos({ id });
    await refresh();
  }, [client, refresh]);

  return { feed, loading, error, ready: client !== null, postKudos, deleteKudos, refresh };
}
