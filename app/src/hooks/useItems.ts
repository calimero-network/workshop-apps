/**
 * Data hooks for the design-review service: mockups (versions the designer
 * uploads) and pins (timestamped feedback dropped on a mockup).
 *
 * Same canonical Calimero data-binding pattern as the neutral scaffold:
 *  - `useWorkspace()` resolves the shared context + the executor identity to
 *    sign RPC calls with.
 *  - the generated `DesignReviewClient` wraps `mero.rpc.execute`.
 *  - `useSubscription([contextId])` re-fetches on every sync event, so a
 *    teammate's upload / pin / resolve appears live with no polling.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { DesignReviewClient, Mockup, PinView } from '../api/design-review/DesignReviewClient';

export interface UseServiceArgs {
  contextId: string | null;
  executorPublicKey: string | null;
}

function useDesignReviewClient({ contextId, executorPublicKey }: UseServiceArgs): DesignReviewClient | null {
  const { mero } = useMero();
  return useMemo(
    () =>
      mero && contextId && executorPublicKey
        ? new DesignReviewClient(mero, contextId, executorPublicKey)
        : null,
    [mero, contextId, executorPublicKey],
  );
}

export interface UseMockupsReturn {
  mockups: Mockup[];
  loading: boolean;
  error: Error | null;
  ready: boolean;
  upload: (title: string, image: string, version: number) => Promise<void>;
  refresh: () => Promise<void>;
}

/** Mockup versions uploaded to this workspace, newest first. */
export function useMockups({ contextId, executorPublicKey }: UseServiceArgs): UseMockupsReturn {
  const client = useDesignReviewClient({ contextId, executorPublicKey });
  const [mockups, setMockups] = useState<Mockup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const list = await client.listMockups();
      setMockups([...list].sort((a, b) => b.created_at - a.created_at));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live updates: re-fetch on any sync event for this context (local or remote).
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const upload = useCallback(async (title: string, image: string, version: number) => {
    if (!client) return;
    await client.uploadMockup({ title, image, version });
    await refresh();
  }, [client, refresh]);

  return { mockups, loading, error, ready: client !== null, upload, refresh };
}

export interface UsePinsReturn {
  pins: PinView[];
  loading: boolean;
  error: Error | null;
  ready: boolean;
  add: (x: number, y: number, text: string) => Promise<void>;
  edit: (pinId: string, text: string) => Promise<void>;
  remove: (pinId: string) => Promise<void>;
  resolve: (pinId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/** Pins dropped on ONE mockup, oldest first (the order feedback came in). */
export function usePins(
  { contextId, executorPublicKey }: UseServiceArgs,
  mockupId: string | null,
): UsePinsReturn {
  const client = useDesignReviewClient({ contextId, executorPublicKey });
  const [pins, setPins] = useState<PinView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!client || !mockupId) { setPins([]); return; }
    setLoading(true);
    setError(null);
    try {
      const list = await client.listPins({ mockup_id: mockupId });
      setPins([...list].sort((a, b) => a.created_at - b.created_at));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, mockupId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const add = useCallback(async (x: number, y: number, text: string) => {
    if (!client || !mockupId) return;
    await client.addPin({ mockup_id: mockupId, x, y, text });
    await refresh();
  }, [client, mockupId, refresh]);

  const edit = useCallback(async (pinId: string, text: string) => {
    if (!client) return;
    await client.editPin({ pin_id: pinId, text });
    await refresh();
  }, [client, refresh]);

  const remove = useCallback(async (pinId: string) => {
    if (!client) return;
    await client.removePin({ pin_id: pinId });
    await refresh();
  }, [client, refresh]);

  const resolve = useCallback(async (pinId: string) => {
    if (!client) return;
    await client.resolvePin({ pin_id: pinId });
    await refresh();
  }, [client, refresh]);

  return { pins, loading, error, ready: client !== null, add, edit, remove, resolve, refresh };
}
