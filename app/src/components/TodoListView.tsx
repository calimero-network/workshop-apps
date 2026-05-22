import React, { useState } from 'react';
import { Task } from '../api/todos/TodosClient';

interface TodoListViewProps {
  tasks: Task[];
  loading: boolean;
  error: Error | null;
  selfExecutorKey: string | null;
  /** Map from executor public key → display name */
  memberNames: Record<string, string>;
  onCreateTask: (title: string, description: string) => Promise<void>;
  onAssignTask: (taskId: string, assignee: string) => Promise<void>;
  onCompleteTask: (taskId: string) => Promise<void>;
  onEditTask: (taskId: string, title: string, description: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
}

function shortenKey(key: string): string {
  if (key.length <= 14) return key;
  return `${key.slice(0, 6)}…${key.slice(-5)}`;
}

function displayName(key: string, names: Record<string, string>): string {
  return names[key] || shortenKey(key);
}

// ── Task card ─────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  isMine: boolean;
  memberNames: Record<string, string>;
  allMembers: string[];
  onAssign: (assignee: string) => Promise<void>;
  onComplete: () => Promise<void>;
  onEdit: (title: string, description: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function TaskCard({
  task, isMine, memberNames, allMembers,
  onAssign, onComplete, onEdit, onDelete,
}: TaskCardProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDesc, setEditDesc] = useState(task.description);
  const [assigning, setAssigning] = useState(false);
  const [assignee, setAssignee] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setLocalError(null);
    try { await fn(); } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const commitEdit = () => run(async () => {
    const t = editTitle.trim();
    const d = editDesc.trim();
    if (!t) return;
    await onEdit(t, d);
    setEditing(false);
  });

  const commitAssign = () => run(async () => {
    const a = assignee.trim();
    if (!a) return;
    await onAssign(a);
    setAssigning(false);
    setAssignee('');
  });

  return (
    <div
      data-testid={`task-card-${task.id}`}
      style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 8,
        padding: '0.75rem 1rem',
        marginBottom: '0.5rem',
        opacity: task.is_complete ? 0.6 : 1,
      }}
    >
      {/* Title row */}
      {editing ? (
        <input
          autoFocus
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          maxLength={120}
          style={inputStyle}
          placeholder="Task title"
        />
      ) : (
        <div style={{
          fontWeight: 600,
          fontSize: '0.95rem',
          color: '#e2e8f0',
          textDecoration: task.is_complete ? 'line-through' : 'none',
          marginBottom: '0.2rem',
        }}>
          {task.title}
        </div>
      )}

      {/* Description */}
      {editing ? (
        <textarea
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          maxLength={500}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', marginTop: '0.3rem' }}
          placeholder="Description (optional)"
        />
      ) : task.description ? (
        <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
          {task.description}
        </div>
      ) : null}

      {/* Meta row */}
      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.3rem', marginBottom: '0.5rem' }}>
        by {displayName(task.author, memberNames)}
        {task.assigned_to && (
          <> · assigned to <span style={{ color: 'var(--color-accent, #10B981)' }}>
            {displayName(task.assigned_to, memberNames)}
          </span></>
        )}
      </div>

      {/* Error */}
      {localError && (
        <div style={{ color: '#f87171', fontSize: '0.75rem', marginBottom: '0.4rem' }}>
          {localError}
        </div>
      )}

      {/* Assign input */}
      {assigning && !task.is_complete && (
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
          <input
            autoFocus
            list={`members-${task.id}`}
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="Paste member key or pick below"
            style={{ ...inputStyle, flex: 1, fontSize: '0.78rem' }}
          />
          <datalist id={`members-${task.id}`}>
            {allMembers.map((k) => (
              <option key={k} value={k}>{memberNames[k] || shortenKey(k)}</option>
            ))}
          </datalist>
          <ActionButton onClick={commitAssign} disabled={busy || !assignee.trim()} accent>
            Assign
          </ActionButton>
          <ActionButton onClick={() => { setAssigning(false); setAssignee(''); }} disabled={busy}>
            Cancel
          </ActionButton>
        </div>
      )}

      {/* Action buttons */}
      {!task.is_complete && (
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {editing ? (
            <>
              <ActionButton onClick={commitEdit} disabled={busy || !editTitle.trim()} accent>
                Save
              </ActionButton>
              <ActionButton onClick={() => { setEditing(false); setEditTitle(task.title); setEditDesc(task.description); }} disabled={busy}>
                Cancel
              </ActionButton>
            </>
          ) : (
            <>
              <ActionButton
                onClick={() => run(() => onComplete())}
                disabled={busy}
                accent
                data-testid={`complete-task-${task.id}`}
              >
                ✓ Complete
              </ActionButton>
              {!assigning && (
                <ActionButton onClick={() => setAssigning(true)} disabled={busy}>
                  Assign
                </ActionButton>
              )}
              {isMine && !assigning && (
                <ActionButton onClick={() => { setEditing(true); }} disabled={busy}>
                  Edit
                </ActionButton>
              )}
              {isMine && (
                <ActionButton
                  onClick={() => run(() => onDelete())}
                  disabled={busy}
                  danger
                  data-testid={`delete-task-${task.id}`}
                >
                  Delete
                </ActionButton>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Small reusable button ─────────────────────────────────────────────────────

interface ActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  danger?: boolean;
  children: React.ReactNode;
  'data-testid'?: string;
}

function ActionButton({ onClick, disabled, accent, danger, children, 'data-testid': testId }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      style={{
        padding: '0.25rem 0.6rem',
        fontSize: '0.78rem',
        borderRadius: 4,
        border: danger ? '1px solid #6a2828' : '1px solid #334155',
        background: accent
          ? 'var(--color-accent, #10B981)'
          : danger
          ? '#3a1414'
          : '#0f172a',
        color: accent ? '#fff' : danger ? '#f0a8a8' : '#cbd5e1',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  background: '#0f172a',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 4,
  padding: '0.35rem 0.6rem',
  fontSize: '0.88rem',
  boxSizing: 'border-box',
};

// ── Create-task form ──────────────────────────────────────────────────────────

interface CreateTaskFormProps {
  onSubmit: (title: string, description: string) => Promise<void>;
}

function CreateTaskForm({ onSubmit }: CreateTaskFormProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(t, description.trim());
      setTitle('');
      setDescription('');
      setOpen(false);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        data-testid="add-task-button"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.5rem 1rem',
          background: 'var(--color-primary, #3B82F6)',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '0.88rem',
          marginBottom: '1rem',
        }}
      >
        + Add Task
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 8,
        padding: '0.75rem 1rem',
        marginBottom: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title*"
        maxLength={120}
        required
        style={inputStyle}
        data-testid="task-title-input"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        maxLength={500}
        rows={2}
        style={{ ...inputStyle, resize: 'vertical' }}
        data-testid="task-description-input"
      />
      {err && <div style={{ color: '#f87171', fontSize: '0.75rem' }}>{err}</div>}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="submit"
          disabled={busy || !title.trim()}
          data-testid="submit-task-button"
          style={{
            padding: '0.4rem 1rem',
            background: 'var(--color-primary, #3B82F6)',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: busy || !title.trim() ? 'not-allowed' : 'pointer',
            opacity: busy || !title.trim() ? 0.6 : 1,
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          {busy ? 'Adding…' : 'Add Task'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setTitle(''); setDescription(''); setErr(null); }}
          disabled={busy}
          style={{
            padding: '0.4rem 0.8rem',
            background: 'transparent',
            color: '#64748b',
            border: '1px solid #334155',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Group heading ─────────────────────────────────────────────────────────────

function GroupHeading({ label, count }: { label: string; count: number }) {
  return (
    <div style={{
      fontSize: '0.72rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      color: '#64748b',
      textTransform: 'uppercase',
      marginTop: '1.25rem',
      marginBottom: '0.4rem',
      paddingBottom: '0.25rem',
      borderBottom: '1px solid #1e293b',
    }}>
      {label} <span style={{ fontWeight: 400 }}>({count})</span>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function TodoListView({
  tasks, loading, error,
  selfExecutorKey, memberNames,
  onCreateTask, onAssignTask, onCompleteTask, onEditTask, onDeleteTask,
}: TodoListViewProps) {
  // Group pending tasks by assignee; unassigned first.
  const pending = tasks.filter((t) => !t.is_complete);
  const completed = tasks.filter((t) => t.is_complete);

  // Build assignee groups for pending tasks.
  const unassigned = pending.filter((t) => !t.assigned_to);
  const assigneeMap = new Map<string, Task[]>();
  for (const t of pending) {
    if (t.assigned_to) {
      const list = assigneeMap.get(t.assigned_to) ?? [];
      list.push(t);
      assigneeMap.set(t.assigned_to, list);
    }
  }

  // All known executor keys for the assign datalist.
  const allMemberKeys = Array.from(
    new Set([...Object.keys(memberNames), ...(selfExecutorKey ? [selfExecutorKey] : [])]),
  );

  const renderTask = (task: Task) => (
    <TaskCard
      key={task.id}
      task={task}
      isMine={task.author === selfExecutorKey}
      memberNames={memberNames}
      allMembers={allMemberKeys}
      onAssign={(assignee) => onAssignTask(task.id, assignee)}
      onComplete={() => onCompleteTask(task.id)}
      onEdit={(title, desc) => onEditTask(task.id, title, desc)}
      onDelete={() => onDeleteTask(task.id)}
    />
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1.25rem',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
          Team Tasks
        </h2>
        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
          {pending.length} pending · {completed.length} completed
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
        <CreateTaskForm onSubmit={onCreateTask} />

        {error && (
          <div style={{ color: '#f87171', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
            Error loading tasks: {error.message}
          </div>
        )}

        {loading && tasks.length === 0 && (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
            Loading tasks…
          </div>
        )}

        {/* Unassigned pending */}
        {unassigned.length > 0 && (
          <>
            <GroupHeading label="Unassigned" count={unassigned.length} />
            {unassigned.map(renderTask)}
          </>
        )}

        {/* Assigned, grouped by assignee */}
        {Array.from(assigneeMap.entries()).map(([key, taskList]) => (
          <React.Fragment key={key}>
            <GroupHeading
              label={displayName(key, memberNames)}
              count={taskList.length}
            />
            {taskList.map(renderTask)}
          </React.Fragment>
        ))}

        {/* Empty state for pending */}
        {pending.length === 0 && !loading && (
          <div style={{
            color: '#475569',
            textAlign: 'center',
            padding: '2rem',
            fontSize: '0.88rem',
          }}>
            No pending tasks — add one above!
          </div>
        )}

        {/* Completed section */}
        {completed.length > 0 && (
          <>
            <GroupHeading label="Completed" count={completed.length} />
            {completed.map(renderTask)}
          </>
        )}
      </div>
    </div>
  );
}
