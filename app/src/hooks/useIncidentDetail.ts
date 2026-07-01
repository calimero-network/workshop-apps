/**
 * useIncidentDetail — per-incident data hook.
 *
 * Fetches a single incident and its comments, re-fetches on sync events.
 * Used by IncidentDetailPage.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { IncidentcommandClient } from '../generated/IncidentcommandClient';
import type { Incident, Comment } from '../types/incidents';

export interface UseIncidentDetailArgs {
  contextId: string | null;
  executorPublicKey: string | null;
  incidentId: string;
}

export interface UseIncidentDetailReturn {
  incident: Incident | null;
  comments: Comment[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  acknowledgeIncident: () => Promise<void>;
  resolveIncident: () => Promise<void>;
  updateIncident: (severity: string | null, assignee: string | null) => Promise<void>;
  addComment: (body: string) => Promise<void>;
  editComment: (commentId: string, body: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
}

export function useIncidentDetail({
  contextId,
  executorPublicKey,
  incidentId,
}: UseIncidentDetailArgs): UseIncidentDetailReturn {
  const { mero } = useMero();

  const client = useMemo(
    () =>
      mero && contextId && executorPublicKey
        ? new IncidentcommandClient(mero, contextId, executorPublicKey)
        : null,
    [mero, contextId, executorPublicKey],
  );

  const [incident, setIncident] = useState<Incident | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [inc, cmts] = await Promise.all([
        client.getIncident(incidentId),
        client.getComments(incidentId),
      ]);
      setIncident(inc);
      setComments(cmts);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, incidentId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const acknowledgeIncident = useCallback(async () => {
    if (!client) return;
    await client.acknowledgeIncident(incidentId);
    await refresh();
  }, [client, incidentId, refresh]);

  const resolveIncident = useCallback(async () => {
    if (!client) return;
    await client.resolveIncident(incidentId);
    await refresh();
  }, [client, incidentId, refresh]);

  const updateIncident = useCallback(async (severity: string | null, assignee: string | null) => {
    if (!client) return;
    await client.updateIncident(incidentId, severity, assignee);
    await refresh();
  }, [client, incidentId, refresh]);

  const addComment = useCallback(async (body: string) => {
    if (!client) return;
    await client.addComment(incidentId, body);
    await refresh();
  }, [client, incidentId, refresh]);

  const editComment = useCallback(async (commentId: string, body: string) => {
    if (!client) return;
    await client.editComment(commentId, body);
    await refresh();
  }, [client, refresh]);

  const deleteComment = useCallback(async (commentId: string) => {
    if (!client) return;
    await client.deleteComment(commentId);
    await refresh();
  }, [client, refresh]);

  return {
    incident,
    comments,
    loading,
    error,
    refresh,
    acknowledgeIncident,
    resolveIncident,
    updateIncident,
    addComment,
    editComment,
    deleteComment,
  };
}
