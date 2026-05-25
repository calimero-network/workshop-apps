import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import {
  PortfolioClient,
  Update,
  Metric,
  Comment,
  Subscription,
} from '../api/portfolio/PortfolioClient';

export type { Update, Metric, Comment, Subscription };

export interface UsePortfolioDataReturn {
  updates: Update[];
  metrics: Metric[];
  comments: Record<string, Comment[]>; // keyed by update_id
  subscriptions: Subscription[];
  loading: boolean;
  error: Error | null;
  executorKey: string | null;

  postUpdate: (companyName: string, body: string) => Promise<void>;
  logMetric: (companyName: string, metricName: string, value: string) => Promise<void>;
  postComment: (updateId: string, body: string) => Promise<void>;
  followCompany: (companyName: string) => Promise<void>;
  fetchComments: (updateId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function usePortfolioData(
  contextId: string | null,
  lobbyExecutorPublicKey: string | null,
): UsePortfolioDataReturn {
  const { mero } = useMero();

  const [updates, setUpdates] = useState<Update[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [executorKey, setExecutorKey] = useState<string | null>(null);

  // Resolve executor identity per-context (may differ from lobby key in
  // subgroup scenarios); fall back to lobbyExecutorPublicKey.
  useEffect(() => {
    if (!mero || !contextId) {
      setExecutorKey(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) {
          setExecutorKey(identities[0]);
          return;
        }
        if (!cancelled && lobbyExecutorPublicKey) {
          setExecutorKey(lobbyExecutorPublicKey);
        }
      } catch {
        if (!cancelled && lobbyExecutorPublicKey) {
          setExecutorKey(lobbyExecutorPublicKey);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, lobbyExecutorPublicKey]);

  const getClient = useCallback((): PortfolioClient | null => {
    // Use the context-specific identity when resolved; fall back to the lobby
    // executor key immediately so the first mutation after workspace creation
    // doesn't silently no-op while getContextIdentitiesOwned is still in flight.
    const key = executorKey ?? lobbyExecutorPublicKey;
    if (!mero || !contextId || !key) return null;
    return new PortfolioClient(mero, contextId, key);
  }, [mero, contextId, executorKey, lobbyExecutorPublicKey]);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [upds, mets, subs] = await Promise.all([
        client.getUpdates(),
        client.getLatestMetrics(),
        client.getSubscriptions(),
      ]);
      // Sort updates newest-first
      setUpdates([...upds].sort((a, b) => b.created_at - a.created_at));
      setMetrics(mets);
      setSubscriptions(subs);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live updates via subscription
  useSubscription(contextId ? [contextId] : [], () => {
    void refresh();
  });

  const fetchComments = useCallback(async (updateId: string) => {
    const client = getClient();
    if (!client) return;
    try {
      const cmts = await client.getComments({ update_id: updateId });
      setComments((prev) => ({ ...prev, [updateId]: cmts }));
    } catch {
      // transient — keep previous
    }
  }, [getClient]);

  const postUpdate = useCallback(async (companyName: string, body: string) => {
    const client = getClient();
    if (!client) return;
    await client.postUpdate({ company_name: companyName, body });
    await refresh();
  }, [getClient, refresh]);

  const logMetric = useCallback(async (
    companyName: string,
    metricName: string,
    value: string,
  ) => {
    const client = getClient();
    if (!client) return;
    await client.logMetric({ company_name: companyName, metric_name: metricName, value });
    await refresh();
  }, [getClient, refresh]);

  const postComment = useCallback(async (updateId: string, body: string) => {
    const client = getClient();
    if (!client) return;
    await client.postComment({ update_id: updateId, body });
    await fetchComments(updateId);
  }, [getClient, fetchComments]);

  const followCompany = useCallback(async (companyName: string) => {
    const client = getClient();
    if (!client) return;
    await client.followCompany({ company_name: companyName });
    await refresh();
  }, [getClient, refresh]);

  return {
    updates,
    metrics,
    comments,
    subscriptions,
    loading,
    error,
    executorKey,
    postUpdate,
    logMetric,
    postComment,
    followCompany,
    fetchComments,
    refresh,
  };
}
