import React, { useEffect, useState } from 'react';
import { CommunitySummary } from '../api/hub/HubClient';
import { Post, Comment, Moderator } from '../api/community/CommunityClient';

interface PostDetailViewProps {
  community: CommunitySummary;
  postId: string;
  posts: Post[];
  comments: Comment[];
  commentsLoading: boolean;
  selfIdentity: string | null;
  moderators: Moderator[];
  onFetchComments: (postId: string) => Promise<void>;
  onCreateComment: (postId: string, body: string, parentCommentId: string | null) => Promise<void>;
  onEditPost: (postId: string, newTitle: string, newBody: string) => Promise<void>;
  onDeletePost: (postId: string) => Promise<void>;
  onEditComment: (commentId: string, newBody: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onVote: (targetId: string, targetType: string, value: number) => Promise<void>;
  onModerateRemovePost: (postId: string) => Promise<void>;
  onModerateRemoveComment: (commentId: string) => Promise<void>;
  onBack: () => void;
  onRefreshPosts: () => Promise<void>;
}

function formatRelative(timestampMs: number): string {
  if (!timestampMs) return '';
  const diff = Date.now() - timestampMs;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export default function PostDetailView({
  community,
  postId,
  posts,
  comments,
  commentsLoading,
  selfIdentity,
  moderators,
  onFetchComments,
  onCreateComment,
  onEditPost,
  onDeletePost,
  onEditComment,
  onDeleteComment,
  onVote,
  onModerateRemovePost,
  onModerateRemoveComment,
  onBack,
  onRefreshPosts,
}: PostDetailViewProps) {
  const post = posts.find((p) => p.id === postId);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [editingPost, setEditingPost] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentBody, setEditCommentBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const isModerator = selfIdentity
    ? moderators.some((m) => m.member_id === selfIdentity)
    : false;
  const isFounder = selfIdentity === community.created_by;
  const canModerate = isFounder || isModerator;

  useEffect(() => {
    onFetchComments(postId);
  }, [postId, onFetchComments]);

  if (!post) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
        Post not found
      </div>
    );
  }

  const isSelfPost = post.author === selfIdentity;

  // Organize comments: top-level and replies
  const topLevelComments = comments.filter((c) => !c.parent_comment_id);
  const getReplies = (parentId: string) => comments.filter((c) => c.parent_comment_id === parentId);

  const handleSubmitComment = async () => {
    if (!commentText.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      await onCreateComment(postId, commentText.trim(), replyTo);
      setCommentText('');
      setReplyTo(null);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleSavePostEdit = async () => {
    if (!editTitle.trim() || !editBody.trim()) return;
    await onEditPost(postId, editTitle.trim(), editBody.trim());
    setEditingPost(false);
    await onRefreshPosts();
  };

  const handleSaveCommentEdit = async (commentId: string) => {
    if (!editCommentBody.trim()) return;
    await onEditComment(commentId, editCommentBody.trim());
    setEditingCommentId(null);
    await onFetchComments(postId);
  };

  const handleDeletePost = async () => {
    await onDeletePost(postId);
    onBack();
  };

  const handleModRemovePost = async () => {
    await onModerateRemovePost(postId);
    onBack();
  };

  const handleDeleteComment = async (commentId: string) => {
    await onDeleteComment(commentId);
    await onFetchComments(postId);
    await onRefreshPosts();
  };

  const handleModRemoveComment = async (commentId: string) => {
    await onModerateRemoveComment(commentId);
    await onFetchComments(postId);
    await onRefreshPosts();
  };

  const renderComment = (comment: Comment, depth: number) => {
    const isSelfComment = comment.author === selfIdentity;
    const isEditing = editingCommentId === comment.id;
    const replies = getReplies(comment.id);

    return (
      <div key={comment.id} style={{ marginLeft: depth * 24, marginTop: '0.5rem' }}>
        <div style={{
          background: depth === 0 ? '#0f172a' : '#131b2e',
          borderRadius: 8, padding: '0.6rem 0.75rem',
          borderLeft: depth > 0 ? '2px solid #1e293b' : 'none',
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: '#475569', marginBottom: '0.25rem' }}>
            <span>{shortenId(comment.author)}</span>
            <span>{formatRelative(comment.created_at)}</span>
          </div>

          {isEditing ? (
            <div>
              <textarea
                value={editCommentBody}
                onChange={(e) => setEditCommentBody(e.target.value)}
                rows={2}
                style={{
                  width: '100%', padding: '0.4rem', background: '#1e293b',
                  border: '1px solid #334155', borderRadius: 4, color: '#e2e8f0',
                  fontSize: '0.85rem', resize: 'vertical',
                }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button
                  onClick={() => handleSaveCommentEdit(comment.id)}
                  style={{
                    padding: '0.2rem 0.5rem', background: 'var(--color-primary)',
                    color: '#fff', border: 'none', borderRadius: 4, fontSize: '0.75rem', cursor: 'pointer',
                  }}
                >Save</button>
                <button
                  onClick={() => setEditingCommentId(null)}
                  style={{
                    padding: '0.2rem 0.5rem', background: '#333',
                    color: '#ccc', border: '1px solid #444', borderRadius: 4, fontSize: '0.75rem', cursor: 'pointer',
                  }}
                >Cancel</button>
              </div>
            </div>
          ) : (
            <p style={{ color: '#cbd5e1', fontSize: '0.87rem', lineHeight: 1.5, margin: 0 }}>
              {comment.body}
            </p>
          )}

          {!isEditing && (
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.3rem', fontSize: '0.72rem' }}>
              {/* Vote on comment */}
              <button
                onClick={() => onVote(comment.id, 'comment', 1)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}
              >▲</button>
              <span style={{
                color: comment.vote_score > 0 ? 'var(--color-accent)' : comment.vote_score < 0 ? '#ef4444' : '#64748b',
                fontWeight: 600,
              }}>
                {comment.vote_score}
              </span>
              <button
                onClick={() => onVote(comment.id, 'comment', -1)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}
              >▼</button>
              <button
                onClick={() => { setReplyTo(comment.id); setCommentText(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}
              >reply</button>
              {isSelfComment && (
                <>
                  <button
                    onClick={() => { setEditingCommentId(comment.id); setEditCommentBody(comment.body); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}
                  >edit</button>
                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 0 }}
                  >delete</button>
                </>
              )}
              {canModerate && !isSelfComment && (
                <button
                  onClick={() => handleModRemoveComment(comment.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f97316', padding: 0 }}
                >remove</button>
              )}
            </div>
          )}
        </div>

        {replies.map((reply) => renderComment(reply, depth + 1))}
      </div>
    );
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* Nav */}
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', color: '#64748b',
            cursor: 'pointer', fontSize: '0.85rem', padding: 0, marginBottom: '1rem',
          }}
        >
          ← Back to {community.name}
        </button>

        {/* Post */}
        <div style={{
          background: '#0f172a', borderRadius: 10, border: '1px solid #1e293b',
          padding: '1.25rem',
        }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {/* Vote column */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '0.15rem', minWidth: 40, paddingTop: 4,
            }}>
              <button
                onClick={() => onVote(post.id, 'post', 1)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#64748b', fontSize: '1.2rem', padding: 0, lineHeight: 1,
                }}
              >▲</button>
              <span style={{
                color: post.vote_score > 0 ? 'var(--color-accent)' : post.vote_score < 0 ? '#ef4444' : '#94a3b8',
                fontSize: '1rem', fontWeight: 700,
              }}>
                {post.vote_score}
              </span>
              <button
                onClick={() => onVote(post.id, 'post', -1)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#64748b', fontSize: '1.2rem', padding: 0, lineHeight: 1,
                }}
              >▼</button>
            </div>

            {/* Content */}
            <div style={{ flex: 1 }}>
              {editingPost ? (
                <div>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    style={{
                      width: '100%', padding: '0.5rem', background: '#1e293b',
                      border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0',
                      fontSize: '1rem', marginBottom: '0.5rem',
                    }}
                  />
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={4}
                    style={{
                      width: '100%', padding: '0.5rem', background: '#1e293b',
                      border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0',
                      fontSize: '0.9rem', resize: 'vertical', marginBottom: '0.5rem',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={handleSavePostEdit} style={{
                      padding: '0.35rem 0.75rem', background: 'var(--color-primary)', color: '#fff',
                      border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem',
                    }}>Save</button>
                    <button onClick={() => setEditingPost(false)} style={{
                      padding: '0.35rem 0.75rem', background: '#333', color: '#ccc',
                      border: '1px solid #444', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem',
                    }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.35rem' }}>
                    {post.title}
                  </h2>
                  <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.78rem', color: '#475569', marginBottom: '0.5rem' }}>
                    <span>{shortenId(post.author)}</span>
                    <span>{formatRelative(post.created_at)}</span>
                  </div>
                  <p style={{ color: '#cbd5e1', fontSize: '0.92rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {post.body}
                  </p>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', fontSize: '0.78rem' }}>
                    {isSelfPost && (
                      <>
                        <button
                          onClick={() => { setEditTitle(post.title); setEditBody(post.body); setEditingPost(true); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0 }}
                        >edit</button>
                        <button
                          onClick={handleDeletePost}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 0 }}
                        >delete</button>
                      </>
                    )}
                    {canModerate && !isSelfPost && (
                      <button
                        onClick={handleModRemovePost}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f97316', padding: 0 }}
                      >remove (mod)</button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Comment input */}
        <div style={{
          marginTop: '1rem', background: '#0f172a', borderRadius: 10,
          border: '1px solid #1e293b', padding: '0.75rem 1rem',
        }}>
          {replyTo && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: '0.78rem', color: '#64748b', marginBottom: '0.35rem',
            }}>
              <span>Replying to {shortenId(replyTo)}</span>
              <button
                onClick={() => setReplyTo(null)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.78rem' }}
              >× Cancel reply</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write a comment..."
              rows={2}
              style={{
                flex: 1, padding: '0.5rem', background: '#1e293b',
                border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0',
                fontSize: '0.87rem', resize: 'vertical',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitComment();
                }
              }}
            />
            <button
              onClick={handleSubmitComment}
              disabled={!commentText.trim() || submittingComment}
              style={{
                padding: '0.5rem 0.75rem', background: 'var(--color-primary)',
                color: '#fff', border: 'none', borderRadius: 6,
                cursor: commentText.trim() ? 'pointer' : 'default',
                fontSize: '0.85rem', alignSelf: 'flex-end',
              }}
            >
              {submittingComment ? '...' : 'Reply'}
            </button>
          </div>
        </div>

        {/* Comments */}
        <div style={{ marginTop: '1rem' }}>
          <h3 style={{ fontSize: '0.92rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
            {post.comment_count} Comment{post.comment_count !== 1 ? 's' : ''}
          </h3>

          {commentsLoading && comments.length === 0 && (
            <div style={{ color: '#475569', fontSize: '0.85rem', padding: '0.5rem' }}>
              Loading comments...
            </div>
          )}

          {topLevelComments.map((c) => renderComment(c, 0))}
        </div>
      </div>
    </div>
  );
}
