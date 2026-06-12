import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { CommunityClient, Post, Comment, Moderator } from '../api/community/CommunityClient';

export interface UseCommunityReturn {
  // Posts
  posts: Post[];
  postsLoading: boolean;
  error: Error | null;
  createPost: (title: string, body: string) => Promise<void>;
  editPost: (postId: string, newTitle: string, newBody: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  refreshPosts: () => Promise<void>;

  // Comments
  comments: Comment[];
  commentsLoading: boolean;
  fetchComments: (postId: string) => Promise<void>;
  createComment: (postId: string, body: string, parentCommentId: string | null) => Promise<void>;
  editComment: (commentId: string, newBody: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;

  // Votes
  castVote: (targetId: string, targetType: string, value: number) => Promise<void>;

  // Moderation
  moderators: Moderator[];
  appointModerator: (memberId: string) => Promise<void>;
  revokeModerator: (moderatorId: string) => Promise<void>;
  moderateRemovePost: (postId: string) => Promise<void>;
  moderateRemoveComment: (commentId: string) => Promise<void>;
  renameCommunity: (newName: string, newTopic: string) => Promise<void>;
  refreshModerators: () => Promise<void>;

  // Identity
  communityExecutorKey: string | null;
}

export function useCommunity(
  contextId: string | null,
  _hubExecutorPublicKey: string | null,
): UseCommunityReturn {
  const { mero } = useMero();
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Resolve the executor identity for THIS community's context
  const [communityExecutorKey, setCommunityExecutorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !contextId) {
      setCommunityExecutorKey(null);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) {
          setCommunityExecutorKey(identities[0]);
        }
      } catch {
        if (!cancelled && _hubExecutorPublicKey) {
          setCommunityExecutorKey(_hubExecutorPublicKey);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [mero, contextId, _hubExecutorPublicKey]);

  const getClient = useCallback(() => {
    if (!mero || !contextId || !communityExecutorKey) return null;
    return new CommunityClient(mero, contextId, communityExecutorKey);
  }, [mero, contextId, communityExecutorKey]);

  // --- Posts ---
  const refreshPosts = useCallback(async () => {
    const client = getClient();
    if (!client) return;

    setPostsLoading(true);
    setError(null);
    try {
      const result = await client.getPosts();
      setPosts(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setPostsLoading(false);
    }
  }, [getClient]);

  useEffect(() => {
    refreshPosts();
  }, [refreshPosts]);

  // React to any community state change
  useSubscription(contextId ? [contextId] : [], () => {
    refreshPosts();
  });

  const createPost = useCallback(async (title: string, body: string) => {
    const client = getClient();
    if (!client) return;
    await client.createPost({ title, body });
    await refreshPosts();
  }, [getClient, refreshPosts]);

  const editPost = useCallback(async (postId: string, newTitle: string, newBody: string) => {
    const client = getClient();
    if (!client) return;
    await client.editPost({ post_id: postId, new_title: newTitle, new_body: newBody });
    await refreshPosts();
  }, [getClient, refreshPosts]);

  const deletePost = useCallback(async (postId: string) => {
    const client = getClient();
    if (!client) return;
    await client.deletePost({ post_id: postId });
    await refreshPosts();
  }, [getClient, refreshPosts]);

  // --- Comments ---
  const fetchComments = useCallback(async (postId: string) => {
    const client = getClient();
    if (!client) return;

    setCommentsLoading(true);
    try {
      const result = await client.getComments({ post_id: postId });
      setComments(result);
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    } finally {
      setCommentsLoading(false);
    }
  }, [getClient]);

  const createComment = useCallback(async (postId: string, body: string, parentCommentId: string | null) => {
    const client = getClient();
    if (!client) return;
    await client.createComment({ post_id: postId, body, parent_comment_id: parentCommentId });
    await fetchComments(postId);
    await refreshPosts(); // Update comment_count
  }, [getClient, fetchComments, refreshPosts]);

  const editComment = useCallback(async (commentId: string, newBody: string) => {
    const client = getClient();
    if (!client) return;
    await client.editComment({ comment_id: commentId, new_body: newBody });
    // Re-fetch comments for the current view (caller should pass postId context)
  }, [getClient]);

  const deleteComment = useCallback(async (commentId: string) => {
    const client = getClient();
    if (!client) return;
    await client.deleteComment({ comment_id: commentId });
  }, [getClient]);

  // --- Votes ---
  const castVote = useCallback(async (targetId: string, targetType: string, value: number) => {
    const client = getClient();
    if (!client) return;
    await client.castVote({ target_id: targetId, target_type: targetType, value });
    await refreshPosts();
  }, [getClient, refreshPosts]);

  // --- Moderation ---
  const refreshModerators = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    try {
      const result = await client.getModerators();
      setModerators(result);
    } catch (err) {
      console.error('Failed to fetch moderators:', err);
    }
  }, [getClient]);

  useEffect(() => {
    refreshModerators();
  }, [refreshModerators]);

  const appointModerator = useCallback(async (memberId: string) => {
    const client = getClient();
    if (!client) return;
    await client.appointModerator({ member_id: memberId });
    await refreshModerators();
  }, [getClient, refreshModerators]);

  const revokeModerator = useCallback(async (moderatorId: string) => {
    const client = getClient();
    if (!client) return;
    await client.revokeModerator({ moderator_id: moderatorId });
    await refreshModerators();
  }, [getClient, refreshModerators]);

  const moderateRemovePost = useCallback(async (postId: string) => {
    const client = getClient();
    if (!client) return;
    await client.moderateRemovePost({ post_id: postId });
    await refreshPosts();
  }, [getClient, refreshPosts]);

  const moderateRemoveComment = useCallback(async (commentId: string) => {
    const client = getClient();
    if (!client) return;
    await client.moderateRemoveComment({ comment_id: commentId });
  }, [getClient]);

  const renameCommunity = useCallback(async (newName: string, newTopic: string) => {
    const client = getClient();
    if (!client) return;
    await client.renameCommunity({ new_name: newName, new_topic: newTopic });
  }, [getClient]);

  return {
    posts,
    postsLoading,
    error,
    createPost,
    editPost,
    deletePost,
    refreshPosts,

    comments,
    commentsLoading,
    fetchComments,
    createComment,
    editComment,
    deleteComment,

    castVote,

    moderators,
    appointModerator,
    revokeModerator,
    moderateRemovePost,
    moderateRemoveComment,
    renameCommunity,
    refreshModerators,

    communityExecutorKey,
  };
}
