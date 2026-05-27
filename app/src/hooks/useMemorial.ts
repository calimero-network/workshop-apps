/**
 * useMemorial — per-context state hook for the living-memorial app.
 *
 * Backed by the `memorial` service context. Fetches memories in reverse
 * chronological order, lazily loads reactions and comments per-memory, and
 * mutates via MemorialClient.
 *
 * Pattern mirrors useChatRoom: resolves executor identity per context,
 * builds client lazily, subscribes via useSubscription, refreshes after
 * every mutation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import {
  MemorialClient,
  type Memory,
  type Reaction,
  type Comment,
  type Attachment,
} from '../api/memorial/MemorialClient';

export type { Memory, Reaction, Comment, Attachment };

export interface UseMemorialReturn {
  memories: Memory[];
  loading: boolean;
  error: Error | null;

  /** Reactions keyed by memory id. Populated on demand via loadReactions. */
  reactions: Record<string, Reaction[]>;
  /** Comments keyed by memory id. Populated on demand via loadComments. */
  comments: Record<string, Comment[]>;

  postMemory: (body: string, attachments: Attachment[]) => Promise<void>;
  editMemory: (id: string, body: string) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;

  addReaction: (memoryId: string, emoji: string) => Promise<void>;
  removeReaction: (reactionId: string, memoryId: string) => Promise<void>;

  postComment: (memoryId: string, body: string) => Promise<void>;

  loadReactions: (memoryId: string) => Promise<void>;
  loadComments: (memoryId: string) => Promise<void>;

  refreshMemories: () => Promise<void>;
  /** Executor public key for this context — used to determine authorship. */
  memorialExecutorKey: string | null;
}

export function useMemorial(
  contextId: string | null,
  fallbackExecutorKey: string | null,
): UseMemorialReturn {
  const { mero } = useMero();

  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [comments, setComments] = useState<Record<string, Comment[]>>({});

  // Resolve executor identity for this context; fall back to lobby key.
  const [memorialExecutorKey, setMemorialExecutorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !contextId) {
      setMemorialExecutorKey(null);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) {
          setMemorialExecutorKey(identities[0]);
          return;
        }
        if (!cancelled && fallbackExecutorKey) {
          setMemorialExecutorKey(fallbackExecutorKey);
        }
      } catch {
        if (!cancelled && fallbackExecutorKey) {
          setMemorialExecutorKey(fallbackExecutorKey);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [mero, contextId, fallbackExecutorKey]);

  // Build client lazily — avoids stale closure captures.
  const clientRef = useRef<MemorialClient | null>(null);
  clientRef.current =
    mero && contextId && memorialExecutorKey
      ? new MemorialClient(mero, contextId, memorialExecutorKey)
      : null;

  const getClient = useCallback(() => clientRef.current, []);

  // ── Memories ────────────────────────────────────────────────────────────────

  const refreshMemories = useCallback(async () => {
    const client = getClient();
    if (!client) return;

    setLoading(true);
    setError(null);
    try {
      const mems = await client.getMemories();
      // Reverse chronological — largest created_at first.
      const sorted = [...mems].sort((a, b) => b.created_at - a.created_at);
      setMemories(sorted);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  useEffect(() => {
    void refreshMemories();
  }, [refreshMemories]);

  // React to any memorial state change pushed via CRDT sync.
  useSubscription(contextId ? [contextId] : [], () => {
    void refreshMemories();
  });

  const postMemory = useCallback(async (body: string, attachments: Attachment[]) => {
    const client = getClient();
    if (!client) return;
    await client.postMemory({ body, attachments });
    await refreshMemories();
  }, [getClient, refreshMemories]);

  const editMemory = useCallback(async (id: string, body: string) => {
    const client = getClient();
    if (!client) return;
    await client.editMemory({ id, body });
    await refreshMemories();
  }, [getClient, refreshMemories]);

  const deleteMemory = useCallback(async (id: string) => {
    const client = getClient();
    if (!client) return;
    await client.deleteMemory({ id });
    await refreshMemories();
  }, [getClient, refreshMemories]);

  // ── Reactions ────────────────────────────────────────────────────────────────

  const loadReactions = useCallback(async (memoryId: string) => {
    const client = getClient();
    if (!client) return;
    try {
      const r = await client.getReactions({ memory_id: memoryId });
      setReactions((prev) => ({ ...prev, [memoryId]: r }));
    } catch { /* transient — keep previous */ }
  }, [getClient]);

  const addReaction = useCallback(async (memoryId: string, emoji: string) => {
    const client = getClient();
    if (!client) return;
    await client.addReaction({ memory_id: memoryId, emoji });
    // Refresh just this memory's reactions.
    const updated = await client.getReactions({ memory_id: memoryId });
    setReactions((prev) => ({ ...prev, [memoryId]: updated }));
  }, [getClient]);

  const removeReaction = useCallback(async (reactionId: string, memoryId: string) => {
    const client = getClient();
    if (!client) return;
    await client.removeReaction({ id: reactionId });
    const updated = await client.getReactions({ memory_id: memoryId });
    setReactions((prev) => ({ ...prev, [memoryId]: updated }));
  }, [getClient]);

  // ── Comments ─────────────────────────────────────────────────────────────────

  const loadComments = useCallback(async (memoryId: string) => {
    const client = getClient();
    if (!client) return;
    try {
      const c = await client.getComments({ memory_id: memoryId });
      setComments((prev) => ({ ...prev, [memoryId]: c }));
    } catch { /* transient */ }
  }, [getClient]);

  const postComment = useCallback(async (memoryId: string, body: string) => {
    const client = getClient();
    if (!client) return;
    await client.postComment({ memory_id: memoryId, body });
    const updated = await client.getComments({ memory_id: memoryId });
    setComments((prev) => ({ ...prev, [memoryId]: updated }));
  }, [getClient]);

  return {
    memories,
    loading,
    error,
    reactions,
    comments,
    postMemory,
    editMemory,
    deleteMemory,
    addReaction,
    removeReaction,
    postComment,
    loadReactions,
    loadComments,
    refreshMemories,
    memorialExecutorKey,
  };
}
