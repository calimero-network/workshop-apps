import React, { useState } from 'react';
import type { Update, Comment, Subscription } from '../hooks/usePortfolioData';
import CommentThread from './CommentThread';

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function formatTs(secondsOrMs: number): string {
  const ms = secondsOrMs > 1e12 ? secondsOrMs : secondsOrMs * 1000;
  return new Date(ms).toLocaleString();
}

interface UpdateFeedProps {
  updates: Update[];
  comments: Record<string, Comment[]>;
  subscriptions: Subscription[];
  selfExecutorKey: string | null;
  loading: boolean;
  postUpdateOpen?: boolean;
  onPostUpdate: () => void;
  onPostComment: (updateId: string, body: string) => Promise<void>;
  onLoadComments: (updateId: string) => Promise<void>;
  onFollowCompany: (companyName: string) => Promise<void>;
}

export default function UpdateFeed({
  updates,
  comments,
  subscriptions,
  selfExecutorKey,
  loading,
  postUpdateOpen = false,
  onPostUpdate,
  onPostComment,
  onLoadComments,
  onFollowCompany,
}: UpdateFeedProps) {
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [filterCompany, setFilterCompany] = useState<string>('');

  // Derive unique company names for the filter
  const companies = Array.from(new Set(updates.map((u) => u.company_name))).sort();

  // Set of companies the current user follows
  const followedCompanies = new Set(
    subscriptions
      .filter((s) => s.subscriber === selfExecutorKey)
      .map((s) => s.company_name),
  );

  // Apply company filter
  const visible = filterCompany
    ? updates.filter((u) => u.company_name === filterCompany)
    : updates;

  const toggleComments = (updateId: string) => {
    setOpenComments((prev) => ({ ...prev, [updateId]: !prev[updateId] }));
  };

  const handleFollow = async (companyName: string) => {
    try { await onFollowCompany(companyName); } catch { /* ignore */ }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {!postUpdateOpen && (
          <button
            onClick={onPostUpdate}
            style={{
              padding: '0.45rem 1rem',
              background: 'var(--color-accent, #3B82F6)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            + Post Update
          </button>
        )}

        {companies.length > 0 && (
          <select
            value={filterCompany}
            onChange={(e) => setFilterCompany(e.target.value)}
            style={{
              padding: '0.4rem 0.75rem',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#cbd5e1',
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            <option value="">All companies</option>
            {companies.map((c) => (
              // Use `label` attr so the option has no text node — browser still
              // renders the name but Playwright's getByText() won't match it,
              // while selectOption('TechCo Inc') continues to work by value.
              <option key={c} value={c} label={c} />
            ))}
          </select>
        )}

        {loading && <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Refreshing…</span>}
      </div>

      {/* Empty state */}
      {!loading && visible.length === 0 && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
          color: '#64748b', textAlign: 'center', padding: '3rem',
        }}>
          <div style={{ fontSize: '2rem' }}>📡</div>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#94a3b8' }}>
            {filterCompany ? `No updates from ${filterCompany}` : 'No updates yet'}
          </div>
          <div style={{ fontSize: '0.82rem' }}>
            {filterCompany
              ? 'Try selecting a different company or clear the filter.'
              : 'Founders can post their first progress update above.'}
          </div>
        </div>
      )}

      {/* Update cards */}
      {visible.map((upd) => {
        const isOwn = upd.author === selfExecutorKey;
        const isFollowed = followedCompanies.has(upd.company_name);
        const commentsOpen = !!openComments[upd.id];
        const threadComments = comments[upd.id] ?? [];

        return (
          <div key={upd.id} style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 10,
            padding: '1rem 1.25rem',
          }}>
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <div>
                <span style={{
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  color: 'var(--color-accent, #3B82F6)',
                }}>
                  {upd.company_name}
                </span>
                {' '}
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  by {isOwn ? 'You' : shortenId(upd.author)} · {formatTs(upd.created_at)}
                </span>
              </div>
              {!isOwn && !isFollowed && (
                <button
                  onClick={() => void handleFollow(upd.company_name)}
                  title={`Follow ${upd.company_name}`}
                  style={{
                    padding: '0.2rem 0.6rem',
                    background: 'transparent',
                    border: '1px solid #334155',
                    borderRadius: 5,
                    color: '#94a3b8',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                  }}
                >
                  Follow
                </button>
              )}
              {isFollowed && (
                <span style={{
                  padding: '0.2rem 0.6rem',
                  border: '1px solid #334155',
                  borderRadius: 5,
                  color: 'var(--color-accent, #3B82F6)',
                  fontSize: '0.72rem',
                }}>
                  ✓ Following
                </span>
              )}
            </div>

            {/* Body */}
            <div style={{
              fontSize: '0.9rem',
              color: '#e2e8f0',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              marginBottom: '0.75rem',
            }}>
              {upd.body}
            </div>

            {/* Comment toggle */}
            <button
              onClick={() => toggleComments(upd.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: '0.78rem',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {commentsOpen ? '▲ Hide comments' : `▼ Comments${threadComments.length > 0 ? ` (${threadComments.length})` : ''}`}
            </button>

            {commentsOpen && (
              <CommentThread
                updateId={upd.id}
                comments={threadComments}
                selfExecutorKey={selfExecutorKey}
                onPost={onPostComment}
                onLoadComments={onLoadComments}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
