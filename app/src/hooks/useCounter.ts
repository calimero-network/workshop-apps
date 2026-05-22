import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { CounterClient, Counter } from '../api/counter/CounterClient';

export interface UseCounterReturn {
  counter: Counter | null;
  loading: boolean;
  error: Error | null;
  increment: () => Promise<void>;
  reset: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Executor public key resolved for this specific context. */
  executorKey: string | null;
}

export function useCounter(
  contextId: string | null,
  _fallbackExecutorKey: string | null,
): UseCounterReturn {
  const { mero } = useMero();
  const [counter, setCounter] = useState<Counter | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Resolve per-context identity — never reuse the workspace-level key.
  const [executorKey, setExecutorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !contextId) { setExecutorKey(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) { setExecutorKey(identities[0]); return; }
        if (!cancelled && _fallbackExecutorKey) setExecutorKey(_fallbackExecutorKey);
      } catch {
        if (!cancelled && _fallbackExecutorKey) setExecutorKey(_fallbackExecutorKey);
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, _fallbackExecutorKey]);

  const getClient = useCallback(() => {
    if (!mero || !contextId || !executorKey) return null;
    return new CounterClient(mero, contextId, executorKey);
  }, [mero, contextId, executorKey]);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const result = await client.getCounter();
      setCounter(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  // Load on mount / context change
  useEffect(() => { void refresh(); }, [refresh]);

  // React to any counter state change synced from other peers
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const increment = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    await client.increment();
    await refresh();
  }, [getClient, refresh]);

  const reset = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    await client.reset();
    await refresh();
  }, [getClient, refresh]);

  return { counter, loading, error, increment, reset, refresh, executorKey };
}
