import React, { useState } from 'react';
import type { Task } from '../hooks/useTaskList';

type Filter = 'all' | 'pending' | 'done';

interface TaskListViewProps {
  tasks: Task[];
  loading: boolean;
  error: Error | null;
  /** Context executor public key — used to determine task ownership. */
  selfExecutorKey: string | null;
  onCreateTask: (title: string, description: string) => Promise<void>;
  onCompleteTask: (taskId: string) => Promise<void>;
  onUncompleteTask: (taskId: string) => Promise<void>;
  onEditTask: (taskId: string, newTitle: string, newDescription: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

function formatDate(epochSecs: number): string {
  return new Date(epochSecs * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

interface EditState {
  title: string;
  description: string;
}

export default function TaskListView({
  tasks,
  loading,
  error,
  selfExecutorKey,
  onCreateTask,
  onCompleteTask,
  onUncompleteTask,
  onEditTask,
  onDeleteTask,
}: TaskListViewProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Per-task inline edit state: taskId → draft
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditState>({ title: '', description: '' });
  const [editBusy, setEditBusy] = useState(false);

  const filtered = tasks.filter((t) => {
    if (filter === 'pending') return !t.completed;
    if (filter === 'done') return t.completed;
    return true;
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setAddBusy(true);
    setAddError(null);
    try {
      await onCreateTask(title, newDescription.trim());
      setNewTitle('');
      setNewDescription('');
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddBusy(false);
    }
  };

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditDraft({ title: task.title, description: task.description });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({ title: '', description: '' });
  };

  const commitEdit = async (taskId: string) => {
    const title = editDraft.title.trim();
    if (!title) return;
    setEditBusy(true);
    try {
      await onEditTask(taskId, title, editDraft.description.trim());
      setEditingId(null);
    } catch {
      // keep draft visible on error
    } finally {
      setEditBusy(false);
    }
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.3rem 0.8rem',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.8rem',
    background: active ? 'var(--color-primary, #3B82F6)' : '#1e293b',
    color: active ? '#fff' : '#94a3b8',
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1.25rem',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        background: '#0a0f1e',
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary, #3B82F6)', marginRight: 'auto' }}>
          Team Tasks
        </h2>
        <button style={tabStyle(filter === 'all')} onClick={() => setFilter('all')}>All</button>
        <button style={tabStyle(filter === 'pending')} onClick={() => setFilter('pending')}>Pending</button>
        <button style={tabStyle(filter === 'done')} onClick={() => setFilter('done')}>Done</button>
      </div>

      {/* Add task form */}
      <form
        onSubmit={handleAdd}
        style={{
          padding: '0.75rem 1.25rem',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
          background: '#0d1424',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New task title…"
            disabled={addBusy}
            maxLength={120}
            style={{
              flex: 1,
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 4,
              color: '#e2e8f0',
              padding: '0.4rem 0.6rem',
              fontSize: '0.88rem',
            }}
          />
          <button
            type="submit"
            disabled={addBusy || !newTitle.trim()}
            style={{
              padding: '0.4rem 1rem',
              background: 'var(--color-accent, #10B981)',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: addBusy || !newTitle.trim() ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
              opacity: addBusy || !newTitle.trim() ? 0.6 : 1,
            }}
          >
            {addBusy ? 'Adding…' : '+ Add Task'}
          </button>
        </div>
        <input
          type="text"
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="Description (optional)"
          disabled={addBusy}
          maxLength={400}
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 4,
            color: '#e2e8f0',
            padding: '0.35rem 0.6rem',
            fontSize: '0.82rem',
          }}
        />
        {addError && (
          <div style={{ color: '#f87171', fontSize: '0.78rem' }}>{addError}</div>
        )}
      </form>

      {/* Task list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 1.25rem' }}>
        {loading && tasks.length === 0 && (
          <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
            Loading tasks…
          </div>
        )}
        {error && (
          <div style={{ textAlign: 'center', color: '#f87171', padding: '1rem', fontSize: '0.85rem' }}>
            {error.message}
          </div>
        )}
        {!loading && filtered.length === 0 && !error && (
          <div style={{ textAlign: 'center', color: '#475569', padding: '2rem', fontSize: '0.88rem' }}>
            {filter === 'all' ? 'No tasks yet — add one above!' : `No ${filter} tasks.`}
          </div>
        )}

        {filtered.map((task) => {
          const isSelf = !!selfExecutorKey && task.created_by === selfExecutorKey;
          const isEditing = editingId === task.id;

          return (
            <div
              key={task.id}
              data-testid={`task-${task.id}`}
              style={{
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start',
                padding: '0.7rem 0.9rem',
                marginBottom: '0.4rem',
                borderRadius: 6,
                background: task.completed ? '#0e1a12' : '#0f172a',
                border: `1px solid ${task.completed ? '#14532d' : '#1e293b'}`,
              }}
            >
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={task.completed}
                onChange={() =>
                  task.completed
                    ? onUncompleteTask(task.id)
                    : onCompleteTask(task.id)
                }
                style={{ marginTop: 3, accentColor: 'var(--color-accent, #10B981)', cursor: 'pointer' }}
                title={task.completed ? 'Mark as pending' : 'Mark as done'}
              />

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <input
                      autoFocus
                      value={editDraft.title}
                      onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                      maxLength={120}
                      style={{
                        background: '#1e293b',
                        border: '1px solid #3B82F6',
                        borderRadius: 4,
                        color: '#e2e8f0',
                        padding: '0.3rem 0.5rem',
                        fontSize: '0.88rem',
                        width: '100%',
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitEdit(task.id);
                        if (e.key === 'Escape') cancelEdit();
                      }}
                    />
                    <input
                      value={editDraft.description}
                      onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                      maxLength={400}
                      placeholder="Description"
                      style={{
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: 4,
                        color: '#e2e8f0',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.8rem',
                        width: '100%',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        onClick={() => void commitEdit(task.id)}
                        disabled={editBusy || !editDraft.title.trim()}
                        style={{
                          padding: '0.2rem 0.6rem',
                          background: 'var(--color-primary, #3B82F6)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        style={{
                          padding: '0.2rem 0.6rem',
                          background: '#1e293b',
                          color: '#94a3b8',
                          border: '1px solid #334155',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{
                      fontSize: '0.92rem',
                      color: task.completed ? '#64748b' : '#e2e8f0',
                      textDecoration: task.completed ? 'line-through' : 'none',
                      wordBreak: 'break-word',
                    }}>
                      {task.title}
                    </div>
                    {task.description && (
                      <div style={{
                        fontSize: '0.78rem',
                        color: '#64748b',
                        marginTop: '0.15rem',
                        wordBreak: 'break-word',
                      }}>
                        {task.description}
                      </div>
                    )}
                    <div style={{
                      fontSize: '0.7rem',
                      color: '#475569',
                      marginTop: '0.25rem',
                      display: 'flex',
                      gap: '0.75rem',
                      flexWrap: 'wrap',
                    }}>
                      <span>by {isSelf ? 'you' : shortenId(task.created_by)}</span>
                      <span>{formatDate(task.created_at)}</span>
                      {task.completed && task.completed_at != null && (
                        <span style={{ color: 'var(--color-accent, #10B981)' }}>
                          ✓ {formatDate(task.completed_at)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Actions (own tasks only) */}
              {isSelf && !isEditing && (
                <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                  <button
                    onClick={() => startEdit(task)}
                    title="Edit task"
                    style={{
                      background: 'transparent',
                      border: '1px solid #334155',
                      borderRadius: 4,
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: '0.2rem 0.45rem',
                      fontSize: '0.75rem',
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => onDeleteTask(task.id)}
                    title="Delete task"
                    style={{
                      background: 'transparent',
                      border: '1px solid #5b1f1f',
                      borderRadius: 4,
                      color: '#f87171',
                      cursor: 'pointer',
                      padding: '0.2rem 0.45rem',
                      fontSize: '0.75rem',
                    }}
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
