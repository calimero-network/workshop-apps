/**
 * usePostmortemData — fetches a single incident and its postmortem.
 * Re-fetches on sync events. Used by PostmortemPage.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { IncidentcommandClient } from '../generated/IncidentcommandClient';
import type { Incident, Postmortem } from '../types/incidents';

export interface UsePostmortemDataArgs {
  contextId: string | null;
  executorPublicKey: string | null;
  incidentId: string;
}

export interface UsePostmortemDataReturn {
  incident: Incident | null;
  postmortem: Postmortem | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  createPostmortem: (timeline: string, rootCause: string, actionItems: string) => Promise<void>;
  editPostmortem: (
    postmortemId: string,
    timeline: string | null,
    rootCause: string | null,
    actionItems: string | null,
  ) => Promise<void>;
}

export function usePostmortemData({
  contextId,
  executorPublicKey,
  incidentId,
}: UsePostmortemDataArgs): UsePostmortemDataReturn {
  const { mero } = useMero();

  const client = useMemo(
    () =>
      mero && contextId && executorPublicKey
        ? new IncidentcommandClient(mero, contextId, executorPublicKey)
        : null,
    [mero, contextId, executorPublicKey],
  );

  const [incident, setIncident] = useState<Incident | null>(null);
  const [postmortem, setPostmortem] = useState<Postmortem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [inc, pm] = await Promise.all([
        client.getIncident(incidentId),
        client.getPostmortem(incidentId),
      ]);
      setIncident(inc);
      setPostmortem(pm);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, incidentId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const createPostmortem = useCallback(async (
    timeline: string,
    rootCause: string,
    actionItems: string,
  ) => {
    if (!client) return;
    await client.createPostmortem(incidentId, timeline, rootCause, actionItems);
    await refresh();
  }, [client, incidentId, refresh]);

  const editPostmortem = useCallback(async (
    postmortemId: string,
    timeline: string | null,
    rootCause: string | null,
    actionItems: string | null,
  ) => {
    if (!client) return;
    await client.editPostmortem(postmortemId, timeline, rootCause, actionItems);
    await refresh();
  }, [client, refresh]);

  return {
    incident,
    postmortem,
    loading,
    error,
    refresh,
    createPostmortem,
    editPostmortem,
  };
}
