/**
 * useForumFeed — per-forum-context state hook.
 *
 * Reads posts and replies from the forum context. Subscribes to ABI events so
 * the feed refreshes within seconds of a peer writing a new post or reply.
 *
 * Mirrors the shape of useChatRoom but targets the single-service forum ABI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { ForumClient, Post, Reply } from '../api/forum/ForumClient';

export interface UseForumFeedReturn {
  posts: Post[];
  loading: boolean;
  error: Error | null;
  refreshPosts: () => Promise<void>;

  // Executor identity for this forum context
  forumExecutorKey: string | null;

  // Post mutations
  createPost: (title: string, body: string, post_type: string) => Promise<void>;
  editPost: (id: string, newBody: string) => Promise<void>;
  deletePost: (id: string) => Promise<void>;

  // Reply queries + mutations
  getReplies: (postId: string) => Promise<Reply[]>;
  replyToPost: (postId: string, body: string) => Promise<void>;
  editReply: (id: string, newBody: string) => Promise<void>;
  deleteReply: (id: string) => Promise<void>;
}

export function useForumFeed(
  contextId: string | null,
  /** Fallback identity when the context identity is not yet resolved. */
  fallbackExecutorKey: string | null,
): UseForumFeedReturn {
  const { mero } = useMero();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Resolve the executor identity for THIS forum context.
  // Each context may have its own keypair; fall back to the lobby/namespace key.
  const [forumExecutorKey, setForumExecutorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !contextId) {
      setForumExecutorKey(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) {
          setForumExecutorKey(identities[0]);
        } else if (!cancelled && fallbackExecutorKey) {
          setForumExecutorKey(fallbackExecutorKey);
        }
      } catch {
        if (!cancelled && fallbackExecutorKey) {
          setForumExecutorKey(fallbackExecutorKey);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, fallbackExecutorKey]);

  // Build the client lazily; rebuilt whenever identity resolves.
  const clientRef = useRef<ForumClient | null>(null);
  clientRef.current =
    mero && contextId && forumExecutorKey
      ? new ForumClient(mero, contextId, forumExecutorKey)
      : null;

  const refreshPosts = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const list = await client.listPosts();
      // Chronological order: oldest first
      setPosts([...list].sort((a, b) => a.created_at - b.created_at));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount / context change
  useEffect(() => {
    if (forumExecutorKey && contextId) {
      void refreshPosts();
    }
  }, [forumExecutorKey, contextId, refreshPosts]);

  // React to any forum state change synced from other nodes.
  useSubscription(contextId ? [contextId] : [], () => {
    void refreshPosts();
  });

  // ── Post mutations ──────────────────────────────────────────────────────────

  const createPost = useCallback(async (
    title: string,
    body: string,
    post_type: string,
  ) => {
    const client = clientRef.current;
    if (!client) throw new Error('Forum client not ready');
    await client.createPost({ title, body, post_type });
    await refreshPosts();
  }, [refreshPosts]);

  const editPost = useCallback(async (id: string, newBody: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Forum client not ready');
    await client.editPost({ id, new_body: newBody });
    await refreshPosts();
  }, [refreshPosts]);

  const deletePost = useCallback(async (id: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Forum client not ready');
    await client.deletePost({ id });
    await refreshPosts();
  }, [refreshPosts]);

  // ── Reply operations ────────────────────────────────────────────────────────

  const getReplies = useCallback(async (postId: string): Promise<Reply[]> => {
    const client = clientRef.current;
    if (!client) return [];
    const replies = await client.getReplies({ post_id: postId });
    return [...replies].sort((a, b) => a.created_at - b.created_at);
  }, []);

  const replyToPost = useCallback(async (postId: string, body: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Forum client not ready');
    await client.replyToPost({ post_id: postId, body });
    await refreshPosts();
  }, [refreshPosts]);

  const editReply = useCallback(async (id: string, newBody: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Forum client not ready');
    await client.editReply({ id, new_body: newBody });
  }, []);

  const deleteReply = useCallback(async (id: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Forum client not ready');
    await client.deleteReply({ id });
  }, []);

  return {
    posts,
    loading,
    error,
    refreshPosts,
    forumExecutorKey,
    createPost,
    editPost,
    deletePost,
    getReplies,
    replyToPost,
    editReply,
    deleteReply,
  };
}
