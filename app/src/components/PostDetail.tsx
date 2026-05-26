import React, { useCallback, useEffect, useState } from 'react';
import type { Post, Reply } from '../api/forum/ForumClient';
import type { UseForumFeedReturn } from '../hooks/useForumFeed';

interface PostDetailProps {
  post: Post;
  forum: UseForumFeedReturn;
  selfExecutorKey: string | null;
  memberNames: Record<string, string>;
  onBack: () => void;
  onEditPost: (post: Post) => void;
}

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 5)}…${id.slice(-4)}`;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const POST_TYPE_LABELS: Record<string, string> = {
  thesis: 'Thesis',
  'post-mortem': 'Post-Mortem',
  general: 'General',
};

const POST_TYPE_COLORS: Record<string, string> = {
  thesis: '#10B981',
  'post-mortem': '#F59E0B',
  general: '#6B7280',
};

export default function PostDetail({
  post,
  forum,
  selfExecutorKey,
  memberNames,
  onBack,
  onEditPost,
}: PostDetailProps) {
  const [replies, setReplies] = useState<Reply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Edit state for replies
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editingReplyBody, setEditingReplyBody] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  const [deletingReplyId, setDeletingReplyId] = useState<string | null>(null);

  const fetchReplies = useCallback(async () => {
    setRepliesLoading(true);
    try {
      const list = await forum.getReplies(post.id);
      setReplies(list);
    } catch {
      // keep previous
    } finally {
      setRepliesLoading(false);
    }
  }, [forum, post.id]);

  useEffect(() => {
    void fetchReplies();
  }, [fetchReplies]);

  const handleReply = async () => {
    const trimmed = replyBody.trim();
    if (!trimmed) return;
    setReplyBusy(true);
    setReplyError(null);
    try {
      await forum.replyToPost(post.id, trimmed);
      setReplyBody('');
      await fetchReplies();
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setReplyBusy(false);
    }
  };

  const handleEditReply = async (replyId: string) => {
    const trimmed = editingReplyBody.trim();
    if (!trimmed) return;
    setEditBusy(true);
    try {
      await forum.editReply(replyId, trimmed);
      setEditingReplyId(null);
      await fetchReplies();
    } catch {
      // keep editing
    } finally {
      setEditBusy(false);
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    setDeletingReplyId(replyId);
    try {
      await forum.deleteReply(replyId);
      await fetchReplies();
    } finally {
      setDeletingReplyId(null);
    }
  };

  const isMinePost = post.author === selfExecutorKey;
  const typeColor = POST_TYPE_COLORS[post.post_type] ?? '#6b7280';
  const typeLabel = POST_TYPE_LABELS[post.post_type] ?? post.post_type;
  const authorLabel = memberNames[post.author] || shortenId(post.author);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1.25rem',
        borderBottom: '1px solid #374151',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        background: '#111827',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            border: '1px solid #374151',
            borderRadius: 6,
            color: '#9ca3af',
            padding: '0.3rem 0.7rem',
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          ← Back
        </button>
        <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>Post Detail</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
        {/* Post card */}
        <div style={{
          background: '#1f2937',
          border: '1px solid #374151',
          borderRadius: 8,
          padding: '1.25rem',
          marginBottom: '1.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
            <span style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '0.15rem 0.45rem',
              borderRadius: 4,
              background: `${typeColor}22`,
              color: typeColor,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              {typeLabel}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>
              {formatTime(post.created_at)}
            </span>
          </div>

          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f9fafb', marginBottom: '0.75rem' }}>
            {post.title}
          </h2>

          <p style={{
            fontSize: '0.9rem',
            color: '#d1d5db',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            marginBottom: '1rem',
          }}>
            {post.body}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              by <strong style={{ color: '#9ca3af' }}>{authorLabel}</strong>
            </span>
            {isMinePost && (
              <button
                onClick={() => onEditPost(post)}
                style={{
                  padding: '0.25rem 0.6rem',
                  background: 'transparent',
                  color: '#9ca3af',
                  border: '1px solid #374151',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                }}
              >
                Edit post
              </button>
            )}
          </div>
        </div>

        {/* Reply section header */}
        <div style={{ marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
          </h3>
        </div>

        {/* Reply list */}
        {repliesLoading && replies.length === 0 && (
          <div style={{ color: '#6b7280', fontSize: '0.85rem', padding: '1rem 0' }}>
            Loading replies…
          </div>
        )}
        {!repliesLoading && replies.length === 0 && (
          <div style={{ color: '#6b7280', fontSize: '0.85rem', padding: '0.5rem 0' }}>
            No replies yet. Be the first to comment.
          </div>
        )}

        {replies.map((reply) => {
          const isMineReply = reply.author === selfExecutorKey;
          const replyAuthor = memberNames[reply.author] || shortenId(reply.author);
          const isEditing = editingReplyId === reply.id;

          return (
            <div
              key={reply.id}
              data-testid={`reply-${reply.id}`}
              style={{
                background: '#111827',
                border: '1px solid #374151',
                borderRadius: 6,
                padding: '0.85rem 1rem',
                marginBottom: '0.6rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>
                  {replyAuthor}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                    {formatTime(reply.created_at)}
                  </span>
                  {isMineReply && !isEditing && (
                    <>
                      <button
                        onClick={() => {
                          setEditingReplyId(reply.id);
                          setEditingReplyBody(reply.body);
                        }}
                        style={{
                          padding: '0.15rem 0.4rem',
                          background: 'transparent',
                          color: '#6b7280',
                          border: '1px solid #374151',
                          borderRadius: 3,
                          cursor: 'pointer',
                          fontSize: '0.7rem',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteReply(reply.id)}
                        disabled={deletingReplyId === reply.id}
                        style={{
                          padding: '0.15rem 0.4rem',
                          background: 'transparent',
                          color: '#ef4444',
                          border: '1px solid #374151',
                          borderRadius: 3,
                          cursor: 'pointer',
                          fontSize: '0.7rem',
                          opacity: deletingReplyId === reply.id ? 0.5 : 1,
                        }}
                      >
                        {deletingReplyId === reply.id ? '…' : 'Delete'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <textarea
                    value={editingReplyBody}
                    onChange={(e) => setEditingReplyBody(e.target.value)}
                    rows={3}
                    style={{
                      width: '100%',
                      background: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: 4,
                      color: '#e5e7eb',
                      padding: '0.5rem',
                      fontSize: '0.85rem',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleEditReply(reply.id)}
                      disabled={editBusy}
                      style={{
                        padding: '0.3rem 0.7rem',
                        background: 'var(--color-accent, #10B981)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        opacity: editBusy ? 0.6 : 1,
                      }}
                    >
                      {editBusy ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingReplyId(null)}
                      style={{
                        padding: '0.3rem 0.7rem',
                        background: 'transparent',
                        color: '#6b7280',
                        border: '1px solid #374151',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '0.85rem', color: '#d1d5db', margin: 0, whiteSpace: 'pre-wrap' }}>
                  {reply.body}
                </p>
              )}
            </div>
          );
        })}

        {/* Reply composer */}
        <div style={{
          background: '#1f2937',
          border: '1px solid #374151',
          borderRadius: 8,
          padding: '1rem',
          marginTop: '1rem',
        }}>
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                void handleReply();
              }
            }}
            placeholder="Write a reply… (Cmd/Ctrl+Enter to submit)"
            rows={3}
            data-testid="reply-input"
            style={{
              width: '100%',
              background: '#111827',
              border: '1px solid #374151',
              borderRadius: 6,
              color: '#e5e7eb',
              padding: '0.6rem 0.75rem',
              fontSize: '0.88rem',
              resize: 'vertical',
              boxSizing: 'border-box',
              marginBottom: '0.6rem',
            }}
          />
          {replyError && (
            <div style={{ color: '#f87171', fontSize: '0.78rem', marginBottom: '0.4rem' }}>
              {replyError}
            </div>
          )}
          <button
            onClick={handleReply}
            disabled={replyBusy || !replyBody.trim()}
            data-testid="submit-reply-button"
            style={{
              padding: '0.5rem 1rem',
              background: replyBusy || !replyBody.trim()
                ? '#374151'
                : 'var(--color-accent, #10B981)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: replyBusy || !replyBody.trim() ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            {replyBusy ? 'Posting…' : 'Post reply'}
          </button>
        </div>
      </div>
    </div>
  );
}
