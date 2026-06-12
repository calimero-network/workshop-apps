import React, { useState } from 'react';
import { CommunitySummary } from '../api/hub/HubClient';
import { Post, Moderator } from '../api/community/CommunityClient';

interface CommunityFeedViewProps {
  community: CommunitySummary;
  posts: Post[];
  loading: boolean;
  selfIdentity: string | null;
  moderators: Moderator[];
  onCreatePost: (title: string, body: string) => Promise<void>;
  onVote: (targetId: string, targetType: string, value: number) => Promise<void>;
  onViewPost: (postId: string) => void;
  onDeletePost: (postId: string) => Promise<void>;
  onModerateRemovePost: (postId: string) => Promise<void>;
  onOpenSettings: () => void;
  onBack: () => void;
}

type SortMode = 'votes' | 'recent';

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

export default function CommunityFeedView({
  community,
  posts,
  loading,
  selfIdentity,
  moderators,
  onCreatePost,
  onVote,
  onViewPost,
  onDeletePost,
  onModerateRemovePost,
  onOpenSettings,
  onBack,
}: CommunityFeedViewProps) {
  const [sortMode, setSortMode] = useState<SortMode>('votes');
  const [showComposer, setShowComposer] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isModerator = selfIdentity
    ? moderators.some((m) => m.member_id === selfIdentity)
    : false;
  const isFounder = selfIdentity === community.created_by;
  const canModerate = isFounder || isModerator;

  const sortedPosts = [...posts].sort((a, b) => {
    if (sortMode === 'votes') return b.vote_score - a.vote_score || b.created_at - a.created_at;
    return b.created_at - a.created_at;
  });

  const handleSubmitPost = async () => {
    if (!newTitle.trim() || !newBody.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onCreatePost(newTitle.trim(), newBody.trim());
      setNewTitle('');
      setNewBody('');
      setShowComposer(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <button
              onClick={onBack}
              style={{
                background: 'none', border: 'none', color: '#64748b',
                cursor: 'pointer', fontSize: '0.85rem', padding: 0,
              }}
            >
              ← Hub
            </button>
            <span style={{ color: '#334155' }}>·</span>
            {(isFounder) && (
              <button
                onClick={onOpenSettings}
                style={{
                  background: 'none', border: 'none', color: '#64748b',
                  cursor: 'pointer', fontSize: '0.85rem', padding: 0,
                }}
              >
                Settings
              </button>
            )}
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#e2e8f0' }}>
            {community.name}
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{community.topic}</p>
        </div>

        {/* Controls bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '1rem', gap: '0.5rem',
        }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setSortMode('votes')}
              style={{
                padding: '0.3rem 0.75rem', borderRadius: 6, fontSize: '0.8rem',
                border: 'none', cursor: 'pointer',
                background: sortMode === 'votes' ? 'var(--color-primary)' : '#1e293b',
                color: sortMode === 'votes' ? '#fff' : '#94a3b8',
              }}
            >
              Top
            </button>
            <button
              onClick={() => setSortMode('recent')}
              style={{
                padding: '0.3rem 0.75rem', borderRadius: 6, fontSize: '0.8rem',
                border: 'none', cursor: 'pointer',
                background: sortMode === 'recent' ? 'var(--color-primary)' : '#1e293b',
                color: sortMode === 'recent' ? '#fff' : '#94a3b8',
              }}
            >
              New
            </button>
          </div>
          <button
            onClick={() => setShowComposer(!showComposer)}
            style={{
              padding: '0.4rem 1rem', background: 'var(--color-accent)',
              color: '#fff', border: 'none', borderRadius: 8,
              cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
            }}
          >
            {showComposer ? 'Cancel' : '+ New Post'}
          </button>
        </div>

        {/* Composer */}
        {showComposer && (
          <div style={{
            background: '#0f172a', borderRadius: 10, border: '1px solid #1e293b',
            padding: '1rem', marginBottom: '1rem',
          }}>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Post title"
              autoFocus
              style={{
                width: '100%', padding: '0.5rem', background: '#1e293b',
                border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0',
                fontSize: '0.95rem', marginBottom: '0.5rem',
              }}
            />
            <textarea
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="What do you want to share?"
              rows={4}
              style={{
                width: '100%', padding: '0.5rem', background: '#1e293b',
                border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0',
                fontSize: '0.9rem', resize: 'vertical', marginBottom: '0.5rem',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleSubmitPost}
                disabled={!newTitle.trim() || !newBody.trim() || submitting}
                style={{
                  padding: '0.4rem 1rem', background: 'var(--color-primary)', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: newTitle.trim() && newBody.trim() ? 'pointer' : 'default',
                }}
              >
                {submitting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        )}

        {/* Posts */}
        {loading && posts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
            Loading posts...
          </div>
        )}
        {!loading && posts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
            No posts yet. Be the first to post!
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {sortedPosts.map((post) => {
            const isSelf = post.author === selfIdentity;
            return (
              <div
                key={post.id}
                style={{
                  background: '#0f172a', borderRadius: 10,
                  border: '1px solid #1e293b', padding: '0.75rem 1rem',
                  cursor: 'pointer',
                }}
                onClick={() => onViewPost(post.id)}
              >
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  {/* Vote column */}
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: '0.15rem', minWidth: 36, paddingTop: 2,
                  }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onVote(post.id, 'post', 1)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#64748b', fontSize: '1rem', padding: 0, lineHeight: 1,
                      }}
                      title="Upvote"
                    >▲</button>
                    <span style={{
                      color: post.vote_score > 0 ? 'var(--color-accent)' : post.vote_score < 0 ? '#ef4444' : '#94a3b8',
                      fontSize: '0.85rem', fontWeight: 600,
                    }}>
                      {post.vote_score}
                    </span>
                    <button
                      onClick={() => onVote(post.id, 'post', -1)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#64748b', fontSize: '1rem', padding: 0, lineHeight: 1,
                      }}
                      title="Downvote"
                    >▼</button>
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.2rem' }}>
                      {post.title}
                    </h3>
                    <p style={{
                      color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.4,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {post.body}
                    </p>
                    <div style={{
                      display: 'flex', gap: '0.75rem', marginTop: '0.4rem',
                      fontSize: '0.75rem', color: '#475569',
                    }}>
                      <span>{shortenId(post.author)}</span>
                      <span>{formatRelative(post.created_at)}</span>
                      <span>{post.comment_count} comment{post.comment_count !== 1 ? 's' : ''}</span>
                      {isSelf && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeletePost(post.id); }}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#ef4444', fontSize: '0.75rem', padding: 0,
                          }}
                        >delete</button>
                      )}
                      {canModerate && !isSelf && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onModerateRemovePost(post.id); }}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#f97316', fontSize: '0.75rem', padding: 0,
                          }}
                        >remove</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
