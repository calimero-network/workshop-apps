import React, { useState } from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import type { Task } from '../hooks/useTodoList';

interface TodoListViewProps {
  tasks: Task[];
  loading: boolean;
  error: Error | null;
  selfIdentity: string | null;
  members: GroupMember[];
  memberNames: Record<string, string>;
  onCreateTask: (title: string, description: string) => Promise<void>;
  onCompleteTask: (taskId: string) => Promise<void>;
  onReopenTask: (taskId: string) => Promise<void>;
  onEditTask: (taskId: string, title: string, description: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onAssignTask: (taskId: string, assignee: string) => Promise<void>;
}

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

interface TaskRowProps {
  task: Task;
  isSelf: boolean;
  selfIdentity: string | null;
  allMembers: GroupMember[];
  memberNames: Record<string, string>;
  onComplete: () => Promise<void>;
  onReopen: () => Promise<void>;
  onEdit: (title: string, description: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onAssign: (assignee: string) => Promise<void>;
}

function TaskRow({
  task,
  isSelf,
  selfIdentity,
  allMembers,
  memberNames,
  onComplete,
  onReopen,
  onEdit,
  onDelete,
  onAssign,
}: TaskRowProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDesc, setEditDesc] = useState(task.description);
  const [assigning, setAssigning] = useState(false);
  const [assignInput, setAssignInput] = useState(task.assigned_to ?? '');
  const [busy, setBusy] = useState(false);

  const displayName = (identity: string) =>
    memberNames[identity] || shortenId(identity);

  const handleToggle = async () => {
    setBusy(true);
    try {
      if (task.completed) await onReopen();
      else await onComplete();
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async () => {
    const t = editTitle.trim();
    const d = editDesc.trim();
    if (!t) return;
    setBusy(true);
    try {
      await onEdit(t, d);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAssign = async () => {
    const a = assignInput.trim();
    setBusy(true);
    try {
      await onAssign(a);
      setAssigning(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      background: '#1e293b',
      borderRadius: 8,
      padding: '0.85rem 1rem',
      marginBottom: '0.5rem',
      border: '1px solid #334155',
      opacity: task.completed ? 0.65 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        {/* Completion checkbox */}
        <button
          onClick={handleToggle}
          disabled={busy}
          title={task.completed ? 'Mark as open' : 'Mark as complete'}
          style={{
            width: 20, height: 20,
            borderRadius: 4,
            border: `2px solid ${task.completed ? 'var(--color-accent, #10B981)' : '#475569'}`,
            background: task.completed ? 'var(--color-accent, #10B981)' : 'transparent',
            cursor: busy ? 'not-allowed' : 'pointer',
            flexShrink: 0,
            marginTop: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
            fontSize: '0.75rem',
            padding: 0,
          }}
        >
          {task.completed ? '✓' : ''}
        </button>

        {/* Task body */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Task title"
                style={inputStyle}
              />
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                <button onClick={handleSaveEdit} disabled={busy || !editTitle.trim()} style={btnPrimarySmall}>
                  Save
                </button>
                <button onClick={() => { setEditing(false); setEditTitle(task.title); setEditDesc(task.description); }} style={btnSecondarySmall}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{
                fontSize: '0.92rem',
                fontWeight: 600,
                color: task.completed ? '#64748b' : '#e2e8f0',
                textDecoration: task.completed ? 'line-through' : 'none',
                wordBreak: 'break-word',
              }}>
                {task.title}
              </div>
              {task.description && (
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem', wordBreak: 'break-word' }}>
                  {task.description}
                </div>
              )}
            </>
          )}

          {/* Meta row */}
          {!editing && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.45rem', alignItems: 'center' }}>
              <span style={metaChip}>
                by {displayName(task.creator)}
              </span>
              {task.assigned_to && (
                <span style={{ ...metaChip, background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
                  → {displayName(task.assigned_to)}
                </span>
              )}
            </div>
          )}

          {/* Assign panel */}
          {assigning && (
            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <select
                value={assignInput}
                onChange={(e) => setAssignInput(e.target.value)}
                style={inputStyle}
              >
                <option value="">— unassigned —</option>
                {selfIdentity && (
                  <option value={selfIdentity}>
                    {memberNames[selfIdentity] || 'You'} (you)
                  </option>
                )}
                {allMembers.map((m) => (
                  <option key={m.identity} value={m.identity}>
                    {memberNames[m.identity] || shortenId(m.identity)}
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button onClick={handleSaveAssign} disabled={busy} style={btnPrimarySmall}>
                  Assign
                </button>
                <button onClick={() => setAssigning(false)} style={btnSecondarySmall}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        {!editing && !assigning && (
          <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
            <button
              onClick={() => { setAssigning(true); setAssignInput(task.assigned_to ?? ''); }}
              title="Assign task"
              style={btnIcon}
            >
              👤
            </button>
            {isSelf && (
              <>
                <button
                  onClick={() => { setEditing(true); setEditTitle(task.title); setEditDesc(task.description); }}
                  title="Edit task"
                  style={btnIcon}
                >
                  ✏️
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm('Delete this task?')) return;
                    setBusy(true);
                    try { await onDelete(); } finally { setBusy(false); }
                  }}
                  disabled={busy}
                  title="Delete task"
                  style={{ ...btnIcon, color: '#f87171' }}
                >
                  🗑
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.4rem 0.6rem',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 4,
  color: '#e2e8f0',
  fontSize: '0.85rem',
  boxSizing: 'border-box',
};

const btnPrimarySmall: React.CSSProperties = {
  padding: '0.3rem 0.75rem',
  background: 'var(--color-primary, #3B82F6)',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: '0.78rem',
};

const btnSecondarySmall: React.CSSProperties = {
  padding: '0.3rem 0.75rem',
  background: 'transparent',
  color: '#94a3b8',
  border: '1px solid #334155',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: '0.78rem',
};

const btnIcon: React.CSSProperties = {
  padding: '0.2rem 0.35rem',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.9rem',
  borderRadius: 4,
  lineHeight: 1,
};

const metaChip: React.CSSProperties = {
  fontSize: '0.72rem',
  background: '#0f172a',
  color: '#64748b',
  borderRadius: 4,
  padding: '0.1rem 0.4rem',
};

export default function TodoListView({
  tasks,
  loading,
  error,
  selfIdentity,
  members,
  memberNames,
  onCreateTask,
  onCompleteTask,
  onReopenTask,
  onEditTask,
  onDeleteTask,
  onAssignTask,
}: TodoListViewProps) {
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const openTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      await onCreateTask(title, newDesc.trim());
      setNewTitle('');
      setNewDesc('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid #1e293b',
        background: '#0f172a',
      }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
          Tasks
        </h2>
        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
          {openTasks.length} open · {completedTasks.length} completed
        </span>
      </div>

      {/* Add task form */}
      <div style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid #1e293b',
        background: '#0f172a',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleCreate(); } }}
              placeholder="Add a new task…"
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 6,
                color: '#e2e8f0',
                fontSize: '0.88rem',
              }}
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newTitle.trim()}
              style={{
                padding: '0.5rem 1.1rem',
                background: 'var(--color-primary, #3B82F6)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: creating || !newTitle.trim() ? 'not-allowed' : 'pointer',
                fontSize: '0.88rem',
                fontWeight: 600,
                opacity: creating || !newTitle.trim() ? 0.5 : 1,
              }}
            >
              {creating ? '…' : '+ Add'}
            </button>
          </div>
          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            style={{
              padding: '0.4rem 0.75rem',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#94a3b8',
              fontSize: '0.82rem',
            }}
          />
        </div>
      </div>

      {/* Task list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
        {error && (
          <div style={{ color: '#f87171', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
            Error loading tasks: {error.message}
          </div>
        )}

        {loading && tasks.length === 0 && (
          <div style={{ color: '#64748b', textAlign: 'center', marginTop: '2rem' }}>
            Loading tasks…
          </div>
        )}

        {!loading && tasks.length === 0 && (
          <div style={{ color: '#475569', textAlign: 'center', marginTop: '3rem', fontSize: '0.9rem' }}>
            No tasks yet. Add one above!
          </div>
        )}

        {/* Open tasks */}
        {openTasks.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{
              fontSize: '0.7rem',
              color: '#64748b',
              letterSpacing: '0.05em',
              marginBottom: '0.5rem',
            }}>
              OPEN — {openTasks.length}
            </div>
            {openTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                isSelf={task.creator === selfIdentity}
                selfIdentity={selfIdentity}
                allMembers={members}
                memberNames={memberNames}
                onComplete={() => onCompleteTask(task.id)}
                onReopen={() => onReopenTask(task.id)}
                onEdit={(title, description) => onEditTask(task.id, title, description)}
                onDelete={() => onDeleteTask(task.id)}
                onAssign={(assignee) => onAssignTask(task.id, assignee)}
              />
            ))}
          </div>
        )}

        {/* Completed tasks */}
        {completedTasks.length > 0 && (
          <div>
            <div style={{
              fontSize: '0.7rem',
              color: '#64748b',
              letterSpacing: '0.05em',
              marginBottom: '0.5rem',
            }}>
              COMPLETED — {completedTasks.length}
            </div>
            {completedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                isSelf={task.creator === selfIdentity}
                selfIdentity={selfIdentity}
                allMembers={members}
                memberNames={memberNames}
                onComplete={() => onCompleteTask(task.id)}
                onReopen={() => onReopenTask(task.id)}
                onEdit={(title, description) => onEditTask(task.id, title, description)}
                onDelete={() => onDeleteTask(task.id)}
                onAssign={(assignee) => onAssignTask(task.id, assignee)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
