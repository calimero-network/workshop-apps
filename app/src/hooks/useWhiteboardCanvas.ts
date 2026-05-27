/**
 * useWhiteboardCanvas — per-project canvas state for collab-whiteboard.
 *
 * Adapts the useChatRoom pattern for the whiteboard domain:
 * - Resolves per-context executor identity via getContextIdentitiesOwned.
 * - Loads shapes from list_shapes() and subscribes to context events.
 * - Exposes add/update/delete shape mutations, each followed by a refresh.
 */

import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { WhiteboardClient, Shape } from '../api/whiteboard/WhiteboardClient';

export interface UseWhiteboardCanvasReturn {
  shapes: Shape[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;

  executorKey: string | null;

  addShape: (
    shapeType: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ) => Promise<string | null>;

  updateShape: (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ) => Promise<void>;

  deleteShape: (id: string) => Promise<void>;
}

export function useWhiteboardCanvas(
  contextId: string | null,
  fallbackExecutorKey: string | null,
): UseWhiteboardCanvasReturn {
  const { mero } = useMero();
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Resolve per-context executor key (may differ from namespace-level identity).
  const [executorKey, setExecutorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !contextId) { setExecutorKey(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) { setExecutorKey(identities[0]); return; }
        if (!cancelled) setExecutorKey(fallbackExecutorKey);
      } catch {
        if (!cancelled) setExecutorKey(fallbackExecutorKey);
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, fallbackExecutorKey]);

  const getClient = useCallback((): WhiteboardClient | null => {
    if (!mero || !contextId || !executorKey) return null;
    return new WhiteboardClient(mero, contextId, executorKey);
  }, [mero, contextId, executorKey]);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const list = await client.listShapes();
      setShapes(list);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  // Load shapes on mount / context change.
  useEffect(() => { void refresh(); }, [refresh]);

  // React to any whiteboard state change (local or synced from peers).
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const addShape = useCallback(async (
    shapeType: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ): Promise<string | null> => {
    const client = getClient();
    if (!client) return null;
    const id = await client.addShape({ shape_type: shapeType, x, y, width, height, color });
    await refresh();
    return id;
  }, [getClient, refresh]);

  const updateShape = useCallback(async (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ): Promise<void> => {
    const client = getClient();
    if (!client) return;
    await client.updateShape({ id, x, y, width, height, color });
    await refresh();
  }, [getClient, refresh]);

  const deleteShape = useCallback(async (id: string): Promise<void> => {
    const client = getClient();
    if (!client) return;
    await client.deleteShape({ id });
    await refresh();
  }, [getClient, refresh]);

  return { shapes, loading, error, refresh, executorKey, addShape, updateShape, deleteShape };
}
