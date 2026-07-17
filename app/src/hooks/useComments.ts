/**
 * useComments — comment thread for one incident (`add_comment` /
 * `list_comments`). Append-only on the backend: no edit/delete method is
 * exposed on the ABI, so this hook doesn't offer them either.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { IncidentTrackerClient, Comment } from '../api/incident-tracker/IncidentTrackerClient';

export interface UseCommentsArgs {
  contextId: string | null;
  executorPublicKey: string | null;
  incidentId: string | null;
}

export interface UseCommentsReturn {
  comments: Comment[];
  loading: boolean;
  error: Error | null;
  addComment: (body: string, mentions: string[]) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useComments({ contextId, executorPublicKey, incidentId }: UseCommentsArgs): UseCommentsReturn {
  const { mero } = useMero();
  const [comments, setComments] = useState<Comment[]>([]);
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
    if (!client || !incidentId) return;
    setLoading(true);
    setError(null);
    try {
      setComments(await client.listComments({ incident_id: incidentId }));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, incidentId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live updates: re-fetch on any sync event for this context (local or remote peers).
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const addComment = useCallback(
    async (body: string, mentions: string[]) => {
      if (!client || !incidentId) return;
      await client.addComment({ incident_id: incidentId, body, mentions });
      await refresh();
    },
    [client, incidentId, refresh],
  );

  return { comments, loading, error, addComment, refresh };
}
