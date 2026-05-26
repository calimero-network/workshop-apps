import React, { useState } from 'react';
import type { Post } from '../api/forum/ForumClient';

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

interface ForumFeedProps {
  posts: Post[];
  loading: boolean;
  error: Error | null;
  selfExecutorKey: string | null;
  memberNames: Record<string, string>;
  onSelectPost: (post: Post) => void;
  onCreatePost: () => void;
  onEditPost: (post: Post) => void;
  onDeletePost: (postId: string) => Promise<void>;
}

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 5)}…${id.slice(-4)}`;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function ForumFeed({
  posts,
  loading,
  error,
  selfExecutorKey,
  memberNames,
  onSelectPost,
  onCreatePost,
  onEditPost,
  onDeletePost,
}: ForumFeedProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    setDeletingId(postId);
    try {
      await onDeletePost(postId);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading && posts.length === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#6b7280', fontSize: '0.9rem',
      }}>
        Loading posts…
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Feed header */}
      <div style={{
        padding: '1rem 1.25rem',
        borderBottom: '1px solid #374151',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#111827',
      }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f9fafb', margin: 0 }}>
            Forum Feed
          </h2>
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            {posts.length} post{posts.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={onCreatePost}
          data-testid="create-post-button"
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--color-accent, #10B981)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          + New Post
        </button>
      </div>

      {error && (
        <div style={{
          padding: '0.75rem 1.25rem',
          background: '#1f0a0a',
          color: '#f87171',
          fontSize: '0.8rem',
          borderBottom: '1px solid #374151',
        }}>
          {error.message}
        </div>
      )}

      {/* Post list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        {posts.length === 0 && !loading && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: '0.75rem', padding: '3rem',
            color: '#6b7280', textAlign: 'center',
          }}>
            <div style={{ fontSize: '2rem' }}>📊</div>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              No posts yet. Share your first position thesis or post-mortem.
            </p>
            <button
              onClick={onCreatePost}
              style={{
                padding: '0.5rem 1rem',
                background: 'var(--color-accent, #10B981)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              Write a post
            </button>
          </div>
        )}

        {[...posts].reverse().map((post) => {
          const isMine = post.author === selfExecutorKey;
          const authorLabel = memberNames[post.author] || shortenId(post.author);
          const typeColor = POST_TYPE_COLORS[post.post_type] ?? '#6b7280';
          const typeLabel = POST_TYPE_LABELS[post.post_type] ?? post.post_type;

          return (
            <div
              key={post.id}
              data-testid={`post-card-${post.id}`}
              onClick={() => onSelectPost(post)}
              style={{
                background: '#1f2937',
                border: '1px solid #374151',
                borderRadius: 8,
                padding: '1rem',
                marginBottom: '0.75rem',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent, #10B981)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#374151')}
            >
              {/* Post type badge + timestamp */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
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

              {/* Title */}
              <h3 style={{
                fontSize: '0.95rem',
                fontWeight: 700,
                color: '#f9fafb',
                margin: '0 0 0.4rem 0',
                lineHeight: 1.3,
              }}>
                {post.title}
              </h3>

              {/* Body preview */}
              <p style={{
                fontSize: '0.82rem',
                color: '#9ca3af',
                margin: '0 0 0.75rem 0',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                {post.body}
              </p>

              {/* Footer: author + actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  by <strong style={{ color: '#9ca3af' }}>{authorLabel}</strong>
                </span>
                {isMine && (
                  <div style={{ display: 'flex', gap: '0.4rem' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditPost(post); }}
                      style={{
                        padding: '0.2rem 0.5rem',
                        background: 'transparent',
                        color: '#6b7280',
                        border: '1px solid #374151',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, post.id)}
                      disabled={deletingId === post.id}
                      style={{
                        padding: '0.2rem 0.5rem',
                        background: 'transparent',
                        color: '#ef4444',
                        border: '1px solid #374151',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                        opacity: deletingId === post.id ? 0.5 : 1,
                      }}
                    >
                      {deletingId === post.id ? '…' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
