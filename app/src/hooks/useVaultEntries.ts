/**
 * useVaultEntries — CRUD over the single-context `vault` service.
 *
 * The canonical Calimero data-binding pattern (mero-react v4):
 *  - `useWorkspace()` resolves the shared context + the executor identity to
 *    sign RPC calls with (from the auth callback on desktop, or the bootstrapped
 *    context on web).
 *  - the typed generated client (`VaultClient`) wraps `mero.rpc.execute`.
 *  - `useSubscription([contextId])` re-fetches on every sync event, so entries
 *    added by other household members appear live with no polling.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { VaultClient, VaultEntry } from '../api/vault/VaultClient';

export interface UseVaultEntriesArgs {
  contextId: string | null;
  executorPublicKey: string | null;
}

export interface UseVaultEntriesReturn {
  entries: VaultEntry[];
  loading: boolean;
  error: Error | null;
  ready: boolean;
  add: (serviceName: string, username: string, secret: string, notes: string) => Promise<void>;
  edit: (id: string, serviceName: string, username: string, secret: string, notes: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useVaultEntries({ contextId, executorPublicKey }: UseVaultEntriesArgs): UseVaultEntriesReturn {
  const { mero } = useMero();
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Memoized typed client — null until the context + identity resolve.
  const client = useMemo(
    () =>
      mero && contextId && executorPublicKey
        ? new VaultClient(mero, contextId, executorPublicKey)
        : null,
    [mero, contextId, executorPublicKey],
  );

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      setEntries(await client.listEntries());
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live updates: re-fetch on any sync event for this context (local or remote).
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const add = useCallback(async (serviceName: string, username: string, secret: string, notes: string) => {
    if (!client) return;
    await client.addEntry({ service_name: serviceName, username, secret, notes });
    await refresh();
  }, [client, refresh]);

  const edit = useCallback(async (id: string, serviceName: string, username: string, secret: string, notes: string) => {
    if (!client) return;
    await client.editEntry({ id, service_name: serviceName, username, secret, notes });
    await refresh();
  }, [client, refresh]);

  const remove = useCallback(async (id: string) => {
    if (!client) return;
    await client.deleteEntry({ id });
    await refresh();
  }, [client, refresh]);

  return {
    entries,
    loading,
    error,
    ready: client !== null,
    add,
    edit,
    remove,
    refresh,
  };
}
