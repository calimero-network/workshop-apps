import React, { useState } from 'react';
import { Message } from '../api/room/RoomClient';

interface MessageBubbleProps {
  message: Message;
  isSelf: boolean;
  onEdit: (newBody: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function formatTime(timestampMs: number): string {
  const d = new Date(timestampMs);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function shortenKey(key: string): string {
  if (key.length <= 12) return key;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

export default function MessageBubble({ message, isSelf, onEdit, onDelete }: MessageBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.body);

  const handleSaveEdit = async () => {
    if (editText.trim() && editText !== message.body) {
      await onEdit(editText.trim());
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
      <div style={{
        fontSize: '0.7rem',
        color: '#888',
        marginBottom: 2,
        display: 'flex',
        gap: '0.5rem',
      }}>
        <span>{shortenKey(message.sender)}</span>
        <span>{formatTime(message.timestamp_ms)}</span>
        {message.edited && <span style={{ fontStyle: 'italic' }}>(edited)</span>}
      </div>

      <div style={{
        background: isSelf ? '#1e3a5f' : '#222',
        padding: '0.5rem 0.75rem',
        borderRadius: 8,
        fontSize: '0.9rem',
        lineHeight: 1.4,
        wordBreak: 'break-word',
      }}>
        {editing ? (
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
              style={{
                flex: 1,
                background: '#333',
                border: '1px solid #555',
                color: '#eee',
                padding: '0.25rem',
                borderRadius: 4,
                fontSize: '0.85rem',
              }}
              autoFocus
            />
            <button
              onClick={handleSaveEdit}
              style={{ fontSize: '0.75rem', padding: '0 0.4rem', cursor: 'pointer' }}
            >
              Save
            </button>
          </div>
        ) : (
          message.body
        )}
      </div>

      {isSelf && !editing && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: 2, fontSize: '0.7rem' }}>
          <button
            onClick={() => { setEditText(message.body); setEditing(true); }}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.7rem' }}
          >
            edit
          </button>
          <button
            onClick={onDelete}
            style={{ background: 'none', border: 'none', color: '#a44', cursor: 'pointer', fontSize: '0.7rem' }}
          >
            delete
          </button>
        </div>
      )}
    </div>
  );
}
