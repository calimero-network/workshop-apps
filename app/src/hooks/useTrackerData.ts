import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { TrackerClient, Submission, TriageResult } from '../api/tracker/TrackerClient';

export interface UseTrackerDataReturn {
  submissions: Submission[];
  approvedTasks: TriageResult[];
  loading: boolean;
  error: Error | null;
  /** Executor identity for this tracker context (may differ from namespace identity). */
  executorPublicKey: string | null;

  submitRequest: (title: string, description: string, type_: string) => Promise<void>;
  editSubmission: (submissionId: string, title: string, description: string) => Promise<void>;
  withdrawSubmission: (submissionId: string) => Promise<void>;
  triageSubmission: (
    submissionId: string,
    status: string,
    impact: number,
    effort: number,
  ) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * useTrackerData — per-project tracker state.
 *
 * Resolves the executor identity for the given context, fetches submissions and
 * approved tasks, and exposes mutations. Subscribes to context events so the UI
 * stays live without manual polling.
 *
 * Priority sort: approved tasks are ordered by (impact − effort) descending so
 * high-impact / low-effort items bubble to the top.
 */
export function useTrackerData(
  contextId: string | null,
  lobbyExecutorPublicKey: string | null,
): UseTrackerDataReturn {
  const { mero } = useMero();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [approvedTasks, setApprovedTasks] = useState<TriageResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [executorPublicKey, setExecutorPublicKey] = useState<string | null>(null);

  // Resolve the executor identity for THIS context (distinct per context when
  // the user has joined with a per-context keypair).
  useEffect(() => {
    if (!mero || !contextId) {
      setExecutorPublicKey(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) {
          setExecutorPublicKey(identities[0]);
          return;
        }
        if (!cancelled && lobbyExecutorPublicKey) {
          setExecutorPublicKey(lobbyExecutorPublicKey);
        }
      } catch {
        if (!cancelled && lobbyExecutorPublicKey) {
          setExecutorPublicKey(lobbyExecutorPublicKey);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, lobbyExecutorPublicKey]);

  const getClient = useCallback(() => {
    if (!mero || !contextId || !executorPublicKey) return null;
    return new TrackerClient(mero, contextId, executorPublicKey);
  }, [mero, contextId, executorPublicKey]);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [subs, tasks] = await Promise.all([
        client.listSubmissions(),
        client.listApprovedTasks(),
      ]);
      setSubmissions(subs);
      // Sort approved tasks: highest (impact − effort) first.
      setApprovedTasks(
        [...tasks].sort((a, b) => (b.impact - b.effort) - (a.impact - a.effort)),
      );
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // React to any tracker state change propagated from other nodes.
  useSubscription(contextId ? [contextId] : [], () => {
    void refresh();
  });

  const submitRequest = useCallback(async (
    title: string,
    description: string,
    type_: string,
  ) => {
    const client = getClient();
    if (!client) return;
    await client.submitRequest({ title, description, type_ });
    await refresh();
  }, [getClient, refresh]);

  const editSubmission = useCallback(async (
    submissionId: string,
    title: string,
    description: string,
  ) => {
    const client = getClient();
    if (!client) return;
    await client.editSubmission({ submission_id: submissionId, title, description });
    await refresh();
  }, [getClient, refresh]);

  const withdrawSubmission = useCallback(async (submissionId: string) => {
    const client = getClient();
    if (!client) return;
    await client.withdrawSubmission({ submission_id: submissionId });
    await refresh();
  }, [getClient, refresh]);

  const triageSubmission = useCallback(async (
    submissionId: string,
    status: string,
    impact: number,
    effort: number,
  ) => {
    const client = getClient();
    if (!client) return;
    await client.triageSubmission({ submission_id: submissionId, status, impact, effort });
    await refresh();
  }, [getClient, refresh]);

  return {
    submissions,
    approvedTasks,
    loading,
    error,
    executorPublicKey,
    submitRequest,
    editSubmission,
    withdrawSubmission,
    triageSubmission,
    refresh,
  };
}
