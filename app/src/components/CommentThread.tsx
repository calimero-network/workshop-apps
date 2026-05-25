import React, { useEffect, useState } from 'react';
import type { Comment } from '../hooks/usePortfolioData';

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function formatTs(secondsOrMs: number): string {
  // created_at values from the spec are seconds-epoch; guard for ms too
  const ms = secondsOrMs > 1e12 ? secondsOrMs : secondsOrMs * 1000;
  return new Date(ms).toLocaleString();
}

interface CommentThreadProps {
  updateId: string;
  comments: Comment[];
  selfExecutorKey: string | null;
  onPost: (updateId: string, body: string) => Promise<void>;
  onLoadComments: (updateId: string) => Promise<void>;
}

export default function CommentThread({
  updateId,
  comments,
  selfExecutorKey,
  onPost,
  onLoadComments,
}: CommentThreadProps) {
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    void onLoadComments(updateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateId]);

  const handlePost = async () => {
    const trimmed = body.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    try {
      await onPost(updateId, trimmed);
      setBody('');
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={{ marginTop: '0.75rem', borderTop: '1px solid #334155', paddingTop: '0.75rem' }}>
      {comments.length === 0 && (
        <div style={{ color: '#64748b', fontSize: '0.78rem', marginBottom: '0.5rem' }}>
          No comments yet.
        </div>
      )}
      {comments.map((c) => (
        <div key={c.id} style={{
          marginBottom: '0.5rem',
          paddingLeft: '0.75rem',
          borderLeft: '2px solid #334155',
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', marginBottom: '0.15rem' }}>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: c.author === selfExecutorKey ? 'var(--color-accent, #3B82F6)' : '#94a3b8',
            }}>
              {c.author === selfExecutorKey ? 'You' : shortenId(c.author)}
            </span>
            <span style={{ fontSize: '0.68rem', color: '#475569' }}>{formatTs(c.created_at)}</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: '#cbd5e1' }}>{c.body}</div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handlePost(); } }}
          placeholder="Write a comment…"
          style={{
            flex: 1,
            padding: '0.35rem 0.6rem',
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 6,
            color: '#e2e8f0',
            fontSize: '0.82rem',
          }}
        />
        <button
          onClick={handlePost}
          disabled={posting || !body.trim()}
          style={{
            padding: '0.35rem 0.75rem',
            background: 'var(--color-primary, #1F2937)',
            border: '1px solid var(--color-accent, #3B82F6)',
            borderRadius: 6,
            color: '#e2e8f0',
            fontSize: '0.8rem',
            cursor: posting || !body.trim() ? 'default' : 'pointer',
            opacity: posting || !body.trim() ? 0.6 : 1,
          }}
        >
          {posting ? '…' : 'Reply'}
        </button>
      </div>
    </div>
  );
}
