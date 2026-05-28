import React, { useState } from 'react';
import { MemoryItem } from '../api/soul/SoulClient';

interface MemoryCardProps {
  memory: MemoryItem;
  isSelf: boolean;
  authorName?: string;
  onEdit: (text: string, tags: string[]) => Promise<void>;
  onDelete: () => Promise<void>;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function shortenKey(key: string): string {
  if (key.length <= 12) return key;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export default function MemoryCard({ memory, isSelf, authorName, onEdit, onDelete }: MemoryCardProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(memory.text);
  const [editTagsRaw, setEditTagsRaw] = useState(memory.tags.join(', '));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    const text = editText.trim();
    if (!text) return;
    const tags = editTagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
    setSaving(true);
    try {
      await onEdit(text, tags);
      setEditing(false);
    } catch {
      /* keep editing on failure */
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await onDelete(); } finally { setDeleting(false); }
  };

  const displayAuthor = authorName || shortenKey(memory.author);

  return (
    <div
      data-testid={`memory-card-${memory.id}`}
      style={{
        background: '#1a1a2e',
        border: '1px solid #1e293b',
        borderRadius: 8,
        padding: '0.85rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      {/* Meta row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#64748b' }}>
        <span style={{ fontWeight: 600, color: isSelf ? 'var(--color-accent)' : '#94a3b8' }}>
          {isSelf ? 'You' : displayAuthor}
        </span>
        <span>{formatTime(memory.created_at)}</span>
      </div>

      {/* Content */}
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
            autoFocus
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#e2e8f0',
              padding: '0.5rem',
              fontSize: '0.9rem',
              resize: 'vertical',
              lineHeight: 1.5,
              outline: 'none',
            }}
          />
          <input
            value={editTagsRaw}
            onChange={(e) => setEditTagsRaw(e.target.value)}
            placeholder="Tags, comma-separated"
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#94a3b8',
              padding: '0.35rem 0.5rem',
              fontSize: '0.8rem',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              onClick={handleSave}
              disabled={saving || !editText.trim()}
              style={{
                padding: '0.3rem 0.8rem',
                background: 'var(--color-accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 5,
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { setEditText(memory.text); setEditTagsRaw(memory.tags.join(', ')); setEditing(false); }}
              style={{
                padding: '0.3rem 0.8rem',
                background: 'transparent',
                color: '#64748b',
                border: '1px solid #334155',
                borderRadius: 5,
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p style={{ margin: 0, color: '#e2e8f0', fontSize: '0.9rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {memory.text}
        </p>
      )}

      {/* Tags */}
      {!editing && memory.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
          {memory.tags.map((tag) => (
            <span
              key={tag}
              style={{
                background: '#1e3a5f',
                color: '#93c5fd',
                fontSize: '0.7rem',
                padding: '0.15rem 0.5rem',
                borderRadius: 99,
                border: '1px solid #2563eb33',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions (own only) */}
      {isSelf && !editing && (
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: 2 }}>
          <button
            onClick={() => { setEditText(memory.text); setEditTagsRaw(memory.tags.join(', ')); setEditing(true); }}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.72rem', padding: 0 }}
          >
            edit
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.72rem', padding: 0 }}
          >
            {deleting ? 'deleting…' : 'delete'}
          </button>
        </div>
      )}
    </div>
  );
}
