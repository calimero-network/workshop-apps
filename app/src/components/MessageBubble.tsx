import React, { useState } from 'react';
import { Message } from '../api/chat/ChatClient';

interface MessageBubbleProps {
  message: Message;
  isSelf: boolean;
  /** Display name or shortened identity for the author. */
  authorLabel: string;
  onEdit: (newBody: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

/**
 * Format a Unix-millisecond timestamp as a local time string.
 * `created_at` from the chat service is in milliseconds (u64).
 */
function formatTime(createdAtMs: number): string {
  const d = new Date(createdAtMs);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBubble({
  message,
  isSelf,
  authorLabel,
  onEdit,
  onDelete,
}: MessageBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.body);

  const handleSaveEdit = async () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== message.body) {
      await onEdit(trimmed);
    }
    setEditing(false);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isSelf ? 'flex-end' : 'flex-start',
      maxWidth: '70%',
      alignSelf: isSelf ? 'flex-end' : 'flex-start',
    }}>
      {/* Author + timestamp */}
      <div style={{
        fontSize: '0.7rem',
        color: '#888',
        marginBottom: 2,
        display: 'flex',
        gap: '0.5rem',
      }}>
        <span style={{ fontWeight: isSelf ? 600 : 400, color: isSelf ? 'var(--color-primary, #3B82F6)' : '#aaa' }}>
          {authorLabel}
        </span>
        <span>{formatTime(message.created_at)}</span>
        {message.edited_at !== null && (
          <span style={{ fontStyle: 'italic', color: '#666' }}>(edited)</span>
        )}
      </div>

      {/* Bubble */}
      <div style={{
        background: isSelf ? 'rgba(59,130,246,0.18)' : '#1e293b',
        border: `1px solid ${isSelf ? 'rgba(59,130,246,0.35)' : '#334155'}`,
        padding: '0.5rem 0.75rem',
        borderRadius: isSelf ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        fontSize: '0.9rem',
        lineHeight: 1.5,
        wordBreak: 'break-word',
        color: '#e2e8f0',
      }}>
        {editing ? (
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { void handleSaveEdit(); }
                if (e.key === 'Escape') setEditing(false);
              }}
              style={{
                flex: 1,
                background: '#0f172a',
                border: '1px solid #475569',
                color: '#e2e8f0',
                padding: '0.25rem 0.5rem',
                borderRadius: 4,
                fontSize: '0.85rem',
                outline: 'none',
              }}
              autoFocus
            />
            <button
              onClick={() => { void handleSaveEdit(); }}
              style={{
                fontSize: '0.75rem',
                padding: '0 0.5rem',
                cursor: 'pointer',
                background: 'var(--color-primary, #3B82F6)',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
              }}
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              style={{
                fontSize: '0.75rem',
                padding: '0 0.4rem',
                cursor: 'pointer',
                background: 'transparent',
                color: '#888',
                border: '1px solid #475569',
                borderRadius: 4,
              }}
            >
              ✕
            </button>
          </div>
        ) : (
          message.body
        )}
      </div>

      {/* Edit / Delete controls — only for own messages */}
      {isSelf && !editing && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: 2 }}>
          <button
            onClick={() => { setEditText(message.body); setEditing(true); }}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: '0.7rem',
              padding: '0 2px',
            }}
          >
            edit
          </button>
          <button
            onClick={() => { void onDelete(); }}
            style={{
              background: 'none',
              border: 'none',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: '0.7rem',
              padding: '0 2px',
            }}
          >
            delete
          </button>
        </div>
      )}
    </div>
  );
}
