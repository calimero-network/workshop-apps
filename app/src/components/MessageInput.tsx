/**
 * AddTaskInput — text field + button to add a new task.
 */
import React, { useState, useCallback } from 'react';

interface AddTaskInputProps {
  onAdd: (description: string) => Promise<void>;
  disabled?: boolean;
}

export default function AddTaskInput({ onAdd, disabled }: AddTaskInputProps) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = useCallback(async () => {
    const desc = text.trim();
    if (!desc || adding || disabled) return;
    setAdding(true);
    try {
      await onAdd(desc);
      setText('');
    } catch (err) {
      console.error('Failed to add task:', err);
    } finally {
      setAdding(false);
    }
  }, [text, adding, disabled, onAdd]);

  return (
    <div style={{
      padding: '0.75rem 1rem',
      borderTop: '1px solid #1e293b',
      display: 'flex',
      gap: '0.5rem',
    }}>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleAdd();
          }
        }}
        placeholder="Add a new task…"
        disabled={adding || disabled}
        data-testid="add-task-input"
        style={{
          flex: 1,
          padding: '0.6rem 0.75rem',
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: 8,
          color: '#e2e8f0',
          fontSize: '0.9rem',
          outline: 'none',
        }}
      />
      <button
        onClick={() => void handleAdd()}
        disabled={adding || !text.trim() || disabled}
        data-testid="add-task-button"
        style={{
          padding: '0.6rem 1.2rem',
          background: text.trim() && !disabled ? 'var(--color-primary, #2563EB)' : '#1e293b',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: text.trim() && !disabled ? 'pointer' : 'default',
          fontSize: '0.9rem',
          whiteSpace: 'nowrap',
        }}
      >
        Add Task
      </button>
    </div>
  );
}
