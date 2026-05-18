/**
 * TodoListView — main task-list panel.
 *
 * Shows active and completed tasks in separate sections.
 * Inline actions: toggle completion, assign to member, delete.
 */
import React, { useState } from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import { useTodoList } from '../hooks/useTodoList';
import type { Task } from '../api/todolist/TodolistClient';

interface TodoListViewProps {
  contextId: string;
  executorPublicKey: string | null;
  members: GroupMember[];
  selfIdentity: string | null;
}

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export default function TodoListView({
  contextId,
  executorPublicKey,
  members,
  selfIdentity,
}: TodoListViewProps) {
  const todo = useTodoList(contextId, executorPublicKey);

  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  // assigningId: which task is currently showing the assignee picker
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const activeTasks = todo.tasks.filter((t) => !t.completed);
  const completedTasks = todo.tasks.filter((t) => t.completed);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    try {
      await todo.createTask(title);
      setNewTitle('');
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (task: Task) => {
    try { await todo.toggleTask(task.id); } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => {
    try { await todo.deleteTask(id); } catch (err) { console.error(err); }
  };

  const handleAssign = async (taskId: string, assignee: string | null) => {
    setAssigningId(null);
    try { await todo.assignTask(taskId, assignee); } catch (err) { console.error(err); }
  };

  // All identities that can be assigned (self + other members)
  const allMembers = [
    ...(selfIdentity ? [{ identity: selfIdentity, alias: 'Me' }] : []),
    ...members.map((m) => ({ identity: m.identity, alias: m.alias })),
  ];

  const renderAssignee = (task: Task) => {
    if (!task.assigned_to) return null;
    const match = allMembers.find((m) => m.identity === task.assigned_to);
    const label = match?.alias || shortenId(task.assigned_to);
    return (
      <span style={{
        fontSize: '0.7rem', color: 'var(--color-accent, #10B981)',
        background: 'rgba(16,185,129,0.1)', borderRadius: 4,
        padding: '0.1rem 0.35rem', marginLeft: '0.4rem',
      }}>
        @{label}
      </span>
    );
  };

  const renderTask = (task: Task) => (
    <div
      key={task.id}
      data-testid={`task-row-${task.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.6rem 0.75rem',
        borderRadius: 8,
        background: task.completed ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
        marginBottom: 4,
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => handleToggle(task)}
        data-testid={`task-toggle-${task.id}`}
        style={{ width: 16, height: 16, accentColor: 'var(--color-primary, #2563EB)', cursor: 'pointer', flexShrink: 0 }}
      />

      {/* Title + assignee */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: '0.88rem',
          color: task.completed ? '#64748b' : '#e2e8f0',
          textDecoration: task.completed ? 'line-through' : 'none',
          wordBreak: 'break-word',
        }}>
          {task.title}
        </span>
        {renderAssignee(task)}
      </div>

      {/* Assign button */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setAssigningId(assigningId === task.id ? null : task.id)}
          data-testid={`task-assign-btn-${task.id}`}
          title="Assign task"
          style={{
            background: 'transparent',
            border: '1px solid #334155',
            borderRadius: 4,
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '0.72rem',
            padding: '0.15rem 0.4rem',
          }}
        >
          assign
        </button>

        {assigningId === task.id && (
          <div style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: 4,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 6,
            zIndex: 10,
            minWidth: 160,
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}>
            <div
              onClick={() => handleAssign(task.id, null)}
              style={{
                padding: '0.45rem 0.75rem',
                cursor: 'pointer',
                fontSize: '0.82rem',
                color: '#94a3b8',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#2d3748')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Unassign
            </div>
            {allMembers.map((m) => (
              <div
                key={m.identity}
                onClick={() => handleAssign(task.id, m.identity)}
                style={{
                  padding: '0.45rem 0.75rem',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  color: m.identity === task.assigned_to ? 'var(--color-accent, #10B981)' : '#e2e8f0',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#2d3748')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {m.alias || shortenId(m.identity)}
                {m.identity === selfIdentity ? ' (me)' : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete button */}
      <button
        onClick={() => handleDelete(task.id)}
        data-testid={`task-delete-${task.id}`}
        title="Delete task"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#475569',
          cursor: 'pointer',
          fontSize: '0.9rem',
          padding: '0.1rem 0.25rem',
          flexShrink: 0,
          lineHeight: 1,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
      >
        ✕
      </button>
    </div>
  );

  return (
    <div
      style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
      onClick={() => assigningId && setAssigningId(null)}
    >
      {/* Header */}
      <div style={{
        padding: '0.9rem 1.25rem',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0' }}>
          Tasks
        </h2>
        <span style={{ color: '#64748b', fontSize: '0.78rem' }}>
          {activeTasks.length} active · {completedTasks.length} done
        </span>
      </div>

      {/* Add task input */}
      <div style={{
        padding: '0.75rem 1.25rem',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        gap: '0.5rem',
        flexShrink: 0,
      }}>
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="Add a task…"
          data-testid="new-task-input"
          style={{
            flex: 1,
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 6,
            color: '#e2e8f0',
            fontSize: '0.88rem',
            padding: '0.45rem 0.75rem',
            outline: 'none',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary, #2563EB)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = '#334155')}
        />
        <button
          onClick={handleCreate}
          disabled={!newTitle.trim() || creating}
          data-testid="add-task-button"
          style={{
            padding: '0.45rem 1rem',
            background: 'var(--color-primary, #2563EB)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: newTitle.trim() && !creating ? 'pointer' : 'default',
            fontSize: '0.85rem',
            fontWeight: 500,
            opacity: !newTitle.trim() || creating ? 0.5 : 1,
          }}
        >
          {creating ? 'Adding…' : 'Add'}
        </button>
      </div>

      {/* Task list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
        {todo.loading && todo.tasks.length === 0 && (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
            Loading tasks…
          </div>
        )}

        {/* Active tasks */}
        {activeTasks.length > 0 && (
          <>
            <div style={{
              fontSize: '0.7rem', color: '#64748b', marginBottom: '0.4rem',
              letterSpacing: '0.05em', fontWeight: 600,
            }}>
              ACTIVE ({activeTasks.length})
            </div>
            {activeTasks.map(renderTask)}
          </>
        )}

        {/* Empty active state */}
        {!todo.loading && activeTasks.length === 0 && completedTasks.length === 0 && (
          <div style={{ color: '#475569', textAlign: 'center', padding: '2rem', fontSize: '0.88rem' }}>
            No tasks yet — add one above!
          </div>
        )}

        {!todo.loading && activeTasks.length === 0 && completedTasks.length > 0 && (
          <div style={{ color: 'var(--color-accent, #10B981)', textAlign: 'center', padding: '1rem', fontSize: '0.88rem' }}>
            All tasks complete 🎉
          </div>
        )}

        {/* Completed tasks */}
        {completedTasks.length > 0 && (
          <div style={{ marginTop: activeTasks.length > 0 ? '1.25rem' : 0 }}>
            <div style={{
              fontSize: '0.7rem', color: '#64748b', marginBottom: '0.4rem',
              letterSpacing: '0.05em', fontWeight: 600,
            }}>
              COMPLETED ({completedTasks.length})
            </div>
            {completedTasks.map(renderTask)}
          </div>
        )}

        {todo.error && (
          <div style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '0.5rem' }}>
            Error: {todo.error.message}
          </div>
        )}
      </div>
    </div>
  );
}
