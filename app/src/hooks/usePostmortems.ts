/**
 * usePostmortems — draft/publish workflow over the incident-tracker's
 * authored `Postmortem` entity. There is no update/edit method exposed —
 * `create_postmortem` always creates a fresh draft, and `publish_postmortem`
 * is the only transition (owner-gated on the backend, content locked after).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { IncidentTrackerClient, Postmortem } from '../api/incident-tracker/IncidentTrackerClient';

export interface UsePostmortemsArgs {
  contextId: string | null;
  executorPublicKey: string | null;
}

export interface UsePostmortemsReturn {
  postmortems: Postmortem[];
  loading: boolean;
  error: Error | null;
  createPostmortem: (
    incidentId: string,
    summary: string,
    rootCause: string,
    resolutionSteps: string,
    lessonsLearned: string,
  ) => Promise<void>;
  publishPostmortem: (postmortemId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function usePostmortems({ contextId, executorPublicKey }: UsePostmortemsArgs): UsePostmortemsReturn {
  const { mero } = useMero();
  const [postmortems, setPostmortems] = useState<Postmortem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const client = useMemo(
    () =>
      mero && contextId && executorPublicKey
        ? new IncidentTrackerClient(mero, contextId, executorPublicKey)
        : null,
    [mero, contextId, executorPublicKey],
  );

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      setPostmortems(await client.listPostmortems());
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live updates: re-fetch on any sync event for this context (local or remote peers).
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const createPostmortem = useCallback(
    async (
      incidentId: string,
      summary: string,
      rootCause: string,
      resolutionSteps: string,
      lessonsLearned: string,
    ) => {
      if (!client) return;
      await client.createPostmortem({
        incident_id: incidentId,
        summary,
        root_cause: rootCause,
        resolution_steps: resolutionSteps,
        lessons_learned: lessonsLearned,
      });
      await refresh();
    },
    [client, refresh],
  );

  const publishPostmortem = useCallback(
    async (postmortemId: string) => {
      if (!client) return;
      await client.publishPostmortem({ postmortem_id: postmortemId });
      await refresh();
    },
    [client, refresh],
  );

  return { postmortems, loading, error, createPostmortem, publishPostmortem, refresh };
}
