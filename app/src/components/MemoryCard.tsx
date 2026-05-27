/**
 * MemoryCard — displays a single memory entry with:
 *   - Author, timestamp, body text
 *   - Attachment previews (image or audio)
 *   - Reaction bar (emoji counts + add/remove)
 *   - Expandable comment thread (MemoryDetail)
 */

import React, { useState, useCallback } from 'react';
import type { Memory, Reaction, Comment, Attachment } from '../hooks/useMemorial';

const COMMON_EMOJIS = ['❤️', '🕊️', '🌹', '😢', '🙏', '✨'];

interface MemoryCardProps {
  memory: Memory;
  /** Loaded reactions for this memory (may be undefined if not yet fetched). */
  reactions: Reaction[] | undefined;
  /** Loaded comments for this memory (may be undefined if not yet fetched). */
  comments: Comment[] | undefined;
  /** The current user's executor public key — used to determine authorship. */
  executorPublicKey: string | null;

  onEdit: (id: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddReaction: (memoryId: string, emoji: string) => Promise<void>;
  onRemoveReaction: (reactionId: string, memoryId: string) => Promise<void>;
  onPostComment: (memoryId: string, body: string) => Promise<void>;
  onLoadReactions: (memoryId: string) => Promise<void>;
  onLoadComments: (memoryId: string) => Promise<void>;
}

function formatDate(epochMs: number): string {
  // created_at may be seconds or milliseconds — normalise
  const ms = epochMs > 1e12 ? epochMs : epochMs * 1000;
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function shortenKey(key: string): string {
  if (key.length <= 14) return key;
  return `${key.slice(0, 7)}\u2026${key.slice(-5)}`;
}

function AttachmentView({ attachment }: { attachment: Attachment }) {
  if (attachment.kind === 'image') {
    return (
      <img
        src={attachment.url}
        alt="memory attachment"
        style={{
          maxWidth: '100%',
          maxHeight: 320,
          borderRadius: 8,
          objectFit: 'cover',
          marginTop: '0.5rem',
          border: '1px solid rgba(107,76,154,0.3)',
        }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
  if (attachment.kind === 'audio') {
    return (
      <audio
        src={attachment.url}
        controls
        style={{
          width: '100%',
          marginTop: '0.5rem',
          borderRadius: 4,
        }}
      />
    );
  }
  // Generic link for unknown kinds
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'var(--color-accent)', fontSize: '0.82rem', marginTop: '0.25rem', display: 'block' }}
    >
      Attachment: {attachment.url}
    </a>
  );
}

export default function MemoryCard({
  memory,
  reactions,
  comments,
  executorPublicKey,
  onEdit,
  onDelete,
  onAddReaction,
  onRemoveReaction,
  onPostComment,
  onLoadReactions,
  onLoadComments,
}: MemoryCardProps) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(memory.body);
  const [editBusy, setEditBusy] = useState(false);

  const [showComments, setShowComments] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);

  const isSelf = executorPublicKey != null && memory.author === executorPublicKey;

  // ── Group reactions by emoji ─────────────────────────────────────────────────
  const reactionGroups: Record<string, Reaction[]> = {};
  for (const r of reactions ?? []) {
    if (!reactionGroups[r.emoji]) reactionGroups[r.emoji] = [];
    reactionGroups[r.emoji].push(r);
  }
  // Did the current user already react with this emoji?
  const myReaction = (emoji: string): Reaction | undefined =>
    reactionGroups[emoji]?.find((r) => r.author === executorPublicKey);

  const handleToggleReact = useCallback(async (emoji: string) => {
    const mine = myReaction(emoji);
    if (mine) {
      await onRemoveReaction(mine.id, memory.id);
    } else {
      await onAddReaction(memory.id, emoji);
    }
  }, [reactions, executorPublicKey, memory.id, onAddReaction, onRemoveReaction]);

  // Ensure reactions are loaded when the card mounts
  React.useEffect(() => {
    if (reactions === undefined) {
      void onLoadReactions(memory.id);
    }
  }, [memory.id]);

  // ── Edit flow ────────────────────────────────────────────────────────────────
  const commitEdit = async () => {
    const trimmed = editBody.trim();
    if (!trimmed || trimmed === memory.body) { setEditing(false); return; }
    setEditBusy(true);
    try {
      await onEdit(memory.id, trimmed);
      setEditing(false);
    } finally {
      setEditBusy(false);
    }
  };

  // ── Comment flow ─────────────────────────────────────────────────────────────
  const handleToggleComments = async () => {
    if (!showComments && comments === undefined) {
      await onLoadComments(memory.id);
    }
    setShowComments((v) => !v);
  };

  const handlePostComment = async () => {
    const trimmed = commentBody.trim();
    if (!trimmed || commentBusy) return;
    setCommentBusy(true);
    try {
      await onPostComment(memory.id, trimmed);
      setCommentBody('');
    } finally {
      setCommentBusy(false);
    }
  };

  const commentCount = comments?.length ?? 0;

  return (
    <article style={{
      background: 'rgba(13,10,18,0.85)',
      border: '1px solid rgba(107,76,154,0.25)',
      borderRadius: 12,
      padding: '1.25rem',
      marginBottom: '1rem',
      backdropFilter: 'blur(4px)',
    }}>
      {/* Header: author + date */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '0.75rem',
        flexWrap: 'wrap',
        gap: '0.25rem',
      }}>
        <div>
          <span style={{
            fontWeight: 600,
            fontSize: '0.85rem',
            color: 'var(--color-primary)',
          }}>
            {shortenKey(memory.author)}
          </span>
          {isSelf && (
            <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', color: '#6b5f8a' }}>
              (you)
            </span>
          )}
        </div>
        <span style={{ fontSize: '0.72rem', color: '#6b5f8a' }}>
          {formatDate(memory.created_at)}
        </span>
      </div>

      {/* Body */}
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={4}
            autoFocus
            style={{
              width: '100%',
              padding: '0.5rem',
              background: '#1a1226',
              border: '1px solid rgba(107,76,154,0.4)',
              borderRadius: 6,
              color: '#e2d9f3',
              fontSize: '0.9rem',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setEditing(false); setEditBody(memory.body); }}
              style={{
                padding: '0.3rem 0.75rem',
                background: '#1a1226',
                color: '#8a7aaa',
                border: '1px solid rgba(107,76,154,0.3)',
                borderRadius: 5,
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              Cancel
            </button>
            <button
              onClick={commitEdit}
              disabled={editBusy}
              style={{
                padding: '0.3rem 0.75rem',
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 5,
                cursor: editBusy ? 'default' : 'pointer',
                fontSize: '0.8rem',
              }}
            >
              {editBusy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <p style={{
          margin: 0,
          lineHeight: 1.65,
          fontSize: '0.95rem',
          color: '#ddd4f0',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {memory.body}
        </p>
      )}

      {/* Attachments */}
      {memory.attachments.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          {memory.attachments.map((att, i) => (
            <AttachmentView key={i} attachment={att} />
          ))}
        </div>
      )}

      {/* Reaction bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.35rem',
        marginTop: '0.9rem',
        alignItems: 'center',
      }}>
        {/* Existing grouped reactions */}
        {Object.entries(reactionGroups).map(([emoji, group]) => {
          const mine = group.some((r) => r.author === executorPublicKey);
          return (
            <button
              key={emoji}
              onClick={() => void handleToggleReact(emoji)}
              title={mine ? 'Remove your reaction' : 'React'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem',
                padding: '0.25rem 0.55rem',
                borderRadius: 20,
                border: mine
                  ? '1px solid rgba(212,165,116,0.6)'
                  : '1px solid rgba(107,76,154,0.3)',
                background: mine
                  ? 'rgba(212,165,116,0.12)'
                  : 'rgba(107,76,154,0.08)',
                cursor: 'pointer',
                fontSize: '0.88rem',
                color: mine ? 'var(--color-accent)' : '#9a88bb',
              }}
            >
              {emoji}
              <span style={{ fontSize: '0.72rem' }}>{group.length}</span>
            </button>
          );
        })}

        {/* Quick-add emoji picker */}
        {COMMON_EMOJIS.filter((e) => !reactionGroups[e]).map((emoji) => (
          <button
            key={emoji}
            onClick={() => void handleToggleReact(emoji)}
            title={`React with ${emoji}`}
            style={{
              padding: '0.22rem 0.45rem',
              borderRadius: 20,
              border: '1px dashed rgba(107,76,154,0.3)',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '0.82rem',
              color: '#6b5f8a',
              opacity: 0.6,
            }}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Footer: author actions + comment toggle */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginTop: '0.75rem',
        fontSize: '0.75rem',
        color: '#6b5f8a',
        borderTop: '1px solid rgba(107,76,154,0.15)',
        paddingTop: '0.6rem',
      }}>
        {isSelf && !editing && (
          <>
            <button
              onClick={() => { setEditBody(memory.body); setEditing(true); }}
              style={{ background: 'none', border: 'none', color: '#6b5f8a', cursor: 'pointer', fontSize: '0.75rem' }}
            >
              Edit
            </button>
            <button
              onClick={() => void onDelete(memory.id)}
              style={{ background: 'none', border: 'none', color: '#7a3a3a', cursor: 'pointer', fontSize: '0.75rem' }}
            >
              Delete
            </button>
          </>
        )}
        <button
          onClick={() => void handleToggleComments()}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            color: '#8a7aaa',
            cursor: 'pointer',
            fontSize: '0.75rem',
          }}
        >
          {showComments ? 'Hide' : 'Comments'}
          {commentCount > 0 ? ` (${commentCount})` : ''}
        </button>
      </div>

      {/* Comment thread — shown when expanded */}
      {showComments && (
        <div style={{ marginTop: '0.75rem' }}>
          {(comments ?? []).length === 0 && (
            <p style={{ color: '#6b5f8a', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>
              No comments yet — be the first to share a thought.
            </p>
          )}
          {(comments ?? []).map((c) => (
            <div key={c.id} style={{
              padding: '0.5rem 0.75rem',
              marginBottom: '0.4rem',
              background: 'rgba(107,76,154,0.07)',
              borderRadius: 8,
              borderLeft: '2px solid rgba(107,76,154,0.3)',
            }}>
              <div style={{ fontSize: '0.72rem', color: '#6b5f8a', marginBottom: '0.2rem' }}>
                {shortenKey(c.author)}
                {c.author === executorPublicKey && (
                  <span style={{ marginLeft: '0.3rem', color: '#5a4a7a' }}>(you)</span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#c8bedf', lineHeight: 1.5 }}>
                {c.body}
              </p>
            </div>
          ))}

          {/* Add comment */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <input
              type="text"
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handlePostComment(); }
              }}
              placeholder="Add a comment…"
              disabled={commentBusy}
              style={{
                flex: 1,
                padding: '0.4rem 0.65rem',
                background: '#1a1226',
                border: '1px solid rgba(107,76,154,0.3)',
                borderRadius: 6,
                color: '#e2d9f3',
                fontSize: '0.82rem',
                outline: 'none',
              }}
            />
            <button
              onClick={() => void handlePostComment()}
              disabled={commentBusy || !commentBody.trim()}
              style={{
                padding: '0.4rem 0.9rem',
                background: commentBody.trim() ? 'var(--color-primary)' : '#1a1226',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: commentBody.trim() ? 'pointer' : 'default',
                fontSize: '0.82rem',
              }}
            >
              {commentBusy ? '…' : 'Reply'}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
