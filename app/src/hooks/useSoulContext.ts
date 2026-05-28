import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { SoulClient, MemoryItem } from '../api/soul/SoulClient';

export interface UseSoulContextReturn {
  memories: MemoryItem[];
  loading: boolean;
  error: Error | null;
  addMemory: (text: string, tags: string[]) => Promise<void>;
  updateMemory: (id: string, text: string, tags: string[]) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  refreshMemories: () => Promise<void>;
  /** Executor key for this specific context (resolved per-context, not from the lobby). */
  contextExecutorKey: string | null;
}

export function useSoulContext(
  contextId: string | null,
  fallbackExecutorKey: string | null,
): UseSoulContextReturn {
  const { mero } = useMero();
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [contextExecutorKey, setContextExecutorKey] = useState<string | null>(null);

  // Resolve executor identity per context — never reuse a key from another context.
  useEffect(() => {
    if (!mero || !contextId) { setContextExecutorKey(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) {
          setContextExecutorKey(identities[0]);
          return;
        }
        if (!cancelled && fallbackExecutorKey) setContextExecutorKey(fallbackExecutorKey);
      } catch {
        if (!cancelled && fallbackExecutorKey) setContextExecutorKey(fallbackExecutorKey);
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, fallbackExecutorKey]);

  const getClient = useCallback((): SoulClient | null => {
    if (!mero || !contextId || !contextExecutorKey) return null;
    return new SoulClient(mero, contextId, contextExecutorKey);
  }, [mero, contextId, contextExecutorKey]);

  const refreshMemories = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const mems = await client.listMemories();
      // Sort newest first
      setMemories([...mems].sort((a, b) => b.created_at - a.created_at));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  // Load memories when context / executor key changes
  useEffect(() => { void refreshMemories(); }, [refreshMemories]);

  // React to real-time state changes from other peers
  useSubscription(contextId ? [contextId] : [], () => {
    void refreshMemories();
  });

  const addMemory = useCallback(async (text: string, tags: string[]) => {
    const client = getClient();
    if (!client) return;
    await client.addMemory({ text, tags });
    await refreshMemories();
  }, [getClient, refreshMemories]);

  const updateMemory = useCallback(async (id: string, text: string, tags: string[]) => {
    const client = getClient();
    if (!client) return;
    await client.updateMemory({ id, text, tags });
    await refreshMemories();
  }, [getClient, refreshMemories]);

  const deleteMemory = useCallback(async (id: string) => {
    const client = getClient();
    if (!client) return;
    await client.deleteMemory({ id });
    await refreshMemories();
  }, [getClient, refreshMemories]);

  return {
    memories,
    loading,
    error,
    addMemory,
    updateMemory,
    deleteMemory,
    refreshMemories,
    contextExecutorKey,
  };
}
