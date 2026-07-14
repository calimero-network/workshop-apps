/**
 * useComments — per-task discussion thread over the generated
 * `IssueTrackerClient`. Only the comment's author (the caller's base58
 * executor public key, stamped server-side) may edit/delete it — the UI
 * gates those actions by comparing `comment.author === executorPublicKey`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { IssueTrackerClient } from '../api/issue-tracker/IssueTrackerClient';
import type { Comment } from '../pages/app/types';

export interface UseCommentsArgs {
  contextId: string | null;
  executorPublicKey: string | null;
  taskId: string | null;
}

export interface UseCommentsReturn {
  comments: Comment[];
  loading: boolean;
  error: Error | null;
  addComment: (body: string, prLink: string | null) => Promise<void>;
  editComment: (commentId: string, body: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useComments({ contextId, executorPublicKey, taskId }: UseCommentsArgs): UseCommentsReturn {
  const { mero } = useMero();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const client = useMemo(
    () =>
      mero && contextId && executorPublicKey
        ? new IssueTrackerClient(mero, contextId, executorPublicKey)
        : null,
    [mero, contextId, executorPublicKey],
  );

  const refresh = useCallback(async () => {
    if (!client || !taskId) {
      setComments([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setComments(await client.listComments({ task_id: taskId }));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, taskId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live updates: re-fetch on any sync event for this context (local or remote).
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const addComment = useCallback(async (body: string, prLink: string | null) => {
    if (!client || !taskId) return;
    await client.addComment({ task_id: taskId, body, pr_link: prLink });
    await refresh();
  }, [client, taskId, refresh]);

  const editComment = useCallback(async (commentId: string, body: string) => {
    if (!client) return;
    await client.editComment({ comment_id: commentId, body });
    await refresh();
  }, [client, refresh]);

  const deleteComment = useCallback(async (commentId: string) => {
    if (!client) return;
    await client.deleteComment({ comment_id: commentId });
    await refresh();
  }, [client, refresh]);

  return { comments, loading, error, addComment, editComment, deleteComment, refresh };
}
