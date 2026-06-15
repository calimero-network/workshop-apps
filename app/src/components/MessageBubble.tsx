/**
 * TaskItem — displays a single task row with toggle, edit, and delete controls.
 *
 * Only the task author can edit or delete their own tasks.
 */
import React, { useState } from 'react';
import { Task } from '../api/todolist/TodolistClient';

interface TaskItemProps {
  task: Task;
  isSelf: boolean;
  onToggle: () => Promise<void>;
  onEdit: (newDescription: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function formatDate(createdAtMs: number): string {
  const d = new Date(createdAtMs);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function shortenKey(key: string): string {
  if (key.length <= 12) return key;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export default function TaskItem({ task, isSelf, onToggle, onEdit, onDelete }: TaskItemProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(task.description);
  const [busy, setBusy] = useState(false);

  const handleToggle = async () => {
    setBusy(true);
    try { await onToggle(); } finally { setBusy(false); }
  };

  const handleSaveEdit = async () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== task.description) {
      setBusy(true);
      try { await onEdit(trimmed); } finally { setBusy(false); }
    }
    setEditing(false);
  };

  const handleDelete = async () => {
    setBusy(true);
    try { await onDelete(); } finally { setBusy(false); }
  };

  return (
    <div
      data-testid={`task-item-${task.id}`}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '0.65rem 0.75rem',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        transition: 'opacity 0.15s',
        opacity: busy ? 0.6 : 1,
      }}
    >
      {/* Checkbox */}
      <button
        onClick={handleToggle}
        disabled={busy}
        data-testid={`task-toggle-${task.id}`}
        aria-label={task.done ? 'Mark as open' : 'Mark as done'}
        style={{
          flexShrink: 0,
          width: 20,
          height: 20,
          marginTop: 1,
          borderRadius: 4,
          border: `2px solid ${task.done ? 'var(--color-accent, #10B981)' : '#475569'}`,
          background: task.done ? 'var(--color-accent, #10B981)' : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          color: '#fff',
          fontSize: '0.75rem',
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        {task.done ? '✓' : ''}
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { void handleSaveEdit(); }
                if (e.key === 'Escape') { setEditText(task.description); setEditing(false); }
              }}
              autoFocus
              style={{
                flex: 1,
                minWidth: 120,
                background: '#1e293b',
                border: '1px solid var(--color-primary, #2563EB)',
                borderRadius: 4,
                color: '#e2e8f0',
                padding: '0.2rem 0.45rem',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
            <button
              onClick={() => void handleSaveEdit()}
              style={{
                padding: '0.2rem 0.6rem',
                background: 'var(--color-primary, #2563EB)',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              Save
            </button>
            <button
              onClick={() => { setEditText(task.description); setEditing(false); }}
              style={{
                padding: '0.2rem 0.6rem',
                background: 'transparent',
                color: '#64748b',
                border: '1px solid #334155',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <span
            style={{
              fontSize: '0.9rem',
              color: task.done ? '#64748b' : '#e2e8f0',
              textDecoration: task.done ? 'line-through' : 'none',
              wordBreak: 'break-word',
            }}
          >
            {task.description}
          </span>
        )}

        <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 3 }}>
          {shortenKey(task.author)} · {formatDate(task.created_at)}
        </div>
      </div>

      {/* Actions (own tasks only) */}
      {isSelf && !editing && (
        <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
          <button
            onClick={() => { setEditText(task.description); setEditing(true); }}
            data-testid={`task-edit-${task.id}`}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: '0.75rem',
              padding: '0.2rem 0.3rem',
            }}
          >
            edit
          </button>
          <button
            onClick={() => void handleDelete()}
            data-testid={`task-delete-${task.id}`}
            style={{
              background: 'none',
              border: 'none',
              color: '#7f1d1d',
              cursor: 'pointer',
              fontSize: '0.75rem',
              padding: '0.2rem 0.3rem',
            }}
          >
            del
          </button>
        </div>
      )}
    </div>
  );
}
