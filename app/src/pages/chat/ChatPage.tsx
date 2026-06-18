/**
 * TodosPage — the main authenticated view for team-todos.
 *
 * Layout: collapsible Sidebar (workspace + members) + TaskListView (shared task list).
 * One todos context per workspace; no per-instance room selection needed.
 */
import React, { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { useSubscription } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { useTodosList } from '../../hooks/useTodosList';
import { C } from '../../theme';
import Sidebar from '../../components/Sidebar';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import WorkspacesEmptyState from '../../components/WorkspacesEmptyState';

export default function ChatPage() {
  const lobby = useChatLobby();
  const todos = useTodosList(lobby.lobbyContextId, lobby.executorPublicKey);

  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Poll members (no SSE for namespace joins).
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const id = setInterval(() => { lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(id);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  // Also refresh tasks when lobby subscription fires (catches any context update).
  useSubscription(
    lobby.lobbyContextId ? [lobby.lobbyContextId] : [],
    () => { todos.refresh(); },
  );

  if (lobby.lobbies.length === 0 && !lobby.lobbiesLoading) {
    return (
      <>
        <WorkspacesEmptyState
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          onJoin={() => setShowJoin(true)}
        />
        {showCreateWorkspace && (
          <CreateWorkspaceModal
            onCreate={async (name) => { await lobby.createLobby(name); }}
            onClose={() => setShowCreateWorkspace(false)}
          />
        )}
        {showJoin && (
          <JoinModal
            onJoin={async (json) => { await lobby.joinLobby(json); setShowJoin(false); }}
            onClose={() => setShowJoin(false)}
          />
        )}
      </>
    );
  }

  return (
    <Shell>
      <Sidebar
        workspaces={lobby.lobbies}
        selectedNamespaceId={lobby.namespaceId}
        onSelectWorkspace={lobby.selectLobby}
        onCreateWorkspace={() => setShowCreateWorkspace(true)}
        workspaceAlias={lobby.selectedLobby?.alias}
        members={lobby.members}
        selfIdentity={lobby.selfIdentity}
        onlineMembers={new Set<string>()}
        memberNames={{}}
        onSetName={async () => {}}
        onInvite={() => setShowInvite(true)}
        viewerIsAdmin={lobby.isAdmin}
        onSetMemberRole={lobby.setMemberRole}
        onRemoveMember={lobby.removeMember}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      <Main>
        <TaskListView
          tasks={todos.tasks}
          loading={todos.loading}
          error={todos.error}
          selfIdentity={lobby.executorPublicKey}
          lobbyReady={lobby.lobbyJoined}
          onAddTask={todos.addTask}
          onToggleTask={todos.toggleTask}
          onEditTask={todos.editTask}
          onDeleteTask={todos.deleteTask}
        />
      </Main>

      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onCreate={async (name) => { await lobby.createLobby(name); }}
          onClose={() => setShowCreateWorkspace(false)}
        />
      )}
      {showInvite && (
        <InviteModal
          onInvite={lobby.inviteUser}
          onClose={() => setShowInvite(false)}
        />
      )}
      {showJoin && (
        <JoinModal
          onJoin={async (json) => { await lobby.joinLobby(json); setShowJoin(false); }}
          onClose={() => setShowJoin(false)}
        />
      )}
    </Shell>
  );
}

// ── TaskListView ──────────────────────────────────────────────────────────────

interface Task {
  id: string;
  author: string;
  description: string;
  done: boolean;
  created_at: number;
}

interface TaskListViewProps {
  tasks: Task[];
  loading: boolean;
  error: Error | null;
  selfIdentity: string | null;
  lobbyReady: boolean;
  onAddTask: (description: string) => Promise<void>;
  onToggleTask: (id: string) => Promise<void>;
  onEditTask: (id: string, newDescription: string) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
}

function TaskListView({
  tasks,
  loading,
  error,
  selfIdentity,
  lobbyReady,
  onAddTask,
  onToggleTask,
  onEditTask,
  onDeleteTask,
}: TaskListViewProps) {
  const [newDesc, setNewDesc] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  const handleAdd = async () => {
    const desc = newDesc.trim();
    if (!desc || adding) return;
    setAdding(true);
    try {
      await onAddTask(desc);
      setNewDesc('');
    } catch {
      // keep input so user can retry
    } finally {
      setAdding(false);
    }
  };

  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusyIds((s) => new Set(s).add(id));
    try { await fn(); } finally {
      setBusyIds((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditDraft(task.description);
  };

  const commitEdit = async (id: string) => {
    const trimmed = editDraft.trim();
    if (!trimmed) { setEditingId(null); return; }
    setEditingId(null);
    await withBusy(id, () => onEditTask(id, trimmed));
  };

  return (
    <ListPane>
      {/* Header */}
      <ListHeader>
        <div className="title">
          <CheckIcon />
          <h2>Team Tasks</h2>
        </div>
        <div className="meta">
          {open.length} open · {done.length} done
        </div>
      </ListHeader>

      {/* Add task input */}
      <AddBar>
        <AddInput
          placeholder={lobbyReady ? 'Add a new task…' : 'Connecting…'}
          value={newDesc}
          disabled={!lobbyReady || adding}
          onChange={(e) => setNewDesc(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { void handleAdd(); } }}
          aria-label="New task description"
        />
        <AddBtn onClick={() => void handleAdd()} disabled={!lobbyReady || adding || !newDesc.trim()}>
          {adding ? <Spin /> : '+ Add'}
        </AddBtn>
      </AddBar>

      {/* Error */}
      {error && <ErrorBanner>{error.message}</ErrorBanner>}

      {/* Task groups */}
      <TaskScroll>
        {loading && tasks.length === 0 && (
          <EmptyMsg>Loading tasks…</EmptyMsg>
        )}

        {!loading && tasks.length === 0 && (
          <EmptyState>
            <span className="icon" aria-hidden>✅</span>
            <p>No tasks yet — add the first one above.</p>
          </EmptyState>
        )}

        {open.length > 0 && (
          <Group>
            <GroupLabel>Open — {open.length}</GroupLabel>
            {open.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selfIdentity={selfIdentity}
                busy={busyIds.has(task.id)}
                editing={editingId === task.id}
                editDraft={editDraft}
                onEditDraftChange={setEditDraft}
                onToggle={() => withBusy(task.id, () => onToggleTask(task.id))}
                onStartEdit={() => startEdit(task)}
                onCommitEdit={() => void commitEdit(task.id)}
                onCancelEdit={() => setEditingId(null)}
                onDelete={() => withBusy(task.id, () => onDeleteTask(task.id))}
              />
            ))}
          </Group>
        )}

        {done.length > 0 && (
          <Group>
            <GroupLabel $muted>Done — {done.length}</GroupLabel>
            {done.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selfIdentity={selfIdentity}
                busy={busyIds.has(task.id)}
                editing={editingId === task.id}
                editDraft={editDraft}
                onEditDraftChange={setEditDraft}
                onToggle={() => withBusy(task.id, () => onToggleTask(task.id))}
                onStartEdit={() => startEdit(task)}
                onCommitEdit={() => void commitEdit(task.id)}
                onCancelEdit={() => setEditingId(null)}
                onDelete={() => withBusy(task.id, () => onDeleteTask(task.id))}
              />
            ))}
          </Group>
        )}
      </TaskScroll>
    </ListPane>
  );
}

// ── TaskRow ───────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: Task;
  selfIdentity: string | null;
  busy: boolean;
  editing: boolean;
  editDraft: string;
  onEditDraftChange: (v: string) => void;
  onToggle: () => void;
  onStartEdit: () => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}

function TaskRow({
  task,
  selfIdentity,
  busy,
  editing,
  editDraft,
  onEditDraftChange,
  onToggle,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onDelete,
}: TaskRowProps) {
  const isOwner = selfIdentity === task.author;
  const isBusy = busy;

  return (
    <TRow $done={task.done} $busy={isBusy}>
      {/* Checkbox */}
      <Checkbox
        checked={task.done}
        onChange={onToggle}
        disabled={isBusy}
        aria-label={task.done ? 'Reopen task' : 'Complete task'}
      />

      {/* Description / edit input */}
      <TaskBody>
        {editing && isOwner ? (
          <EditInput
            autoFocus
            value={editDraft}
            onChange={(e) => onEditDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            onBlur={onCommitEdit}
            aria-label="Edit task"
          />
        ) : (
          <TaskDesc $done={task.done}>{task.description}</TaskDesc>
        )}
        <TaskMeta>
          {shortenId(task.author)}{isOwner ? ' (you)' : ''}
        </TaskMeta>
      </TaskBody>

      {/* Actions — only owner can edit/delete */}
      {isOwner && !editing && (
        <RowActions>
          <ActionBtn onClick={onStartEdit} title="Edit task" aria-label="Edit">
            <EditIcon />
          </ActionBtn>
          <ActionBtn $danger onClick={onDelete} disabled={isBusy} title="Delete task" aria-label="Delete">
            <TrashIcon />
          </ActionBtn>
        </RowActions>
      )}
    </TRow>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortenId(id: string): string {
  if (!id) return '?';
  if (id.length <= 12) return id;
  return `${id.slice(0, 5)}…${id.slice(-4)}`;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const CheckIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--c-primary, #2563EB)"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
);

// ── Checkbox ──────────────────────────────────────────────────────────────────

interface CheckboxProps {
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
  'aria-label': string;
}

function Checkbox({ checked, onChange, disabled, 'aria-label': label }: CheckboxProps) {
  return (
    <CheckWrap
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      $checked={checked}
      $disabled={disabled}
      onClick={disabled ? undefined : onChange}
      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !disabled) onChange(); }}
    >
      {checked && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="2 6 5 9 10 3" />
        </svg>
      )}
    </CheckWrap>
  );
}

// ── Styled components ─────────────────────────────────────────────────────────

const spin = keyframes`to { transform: rotate(360deg); }`;
const fadeIn = keyframes`from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; }`;

const Shell = styled.div`
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: ${C.paper};
  color: ${C.ink};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
`;

const Main = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: ${C.paper2};
  min-width: 0;
`;

// ── TaskListView styles ───────────────────────────────────────────────────────

const ListPane = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ListHeader = styled.div`
  padding: 20px 28px 16px;
  border-bottom: 1px solid ${C.line};
  background: ${C.paper};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;

  .title {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  h2 {
    font-size: 17px;
    font-weight: 800;
    letter-spacing: -0.4px;
    color: ${C.ink};
    margin: 0;
  }
  .meta {
    font-size: 12.5px;
    color: ${C.mutedSoft};
    font-weight: 500;
  }
`;

const AddBar = styled.div`
  display: flex;
  gap: 10px;
  padding: 14px 24px;
  border-bottom: 1px solid ${C.line};
  background: ${C.paper};
  flex-shrink: 0;
`;

const AddInput = styled.input`
  flex: 1;
  padding: 11px 14px;
  font-size: 14px;
  color: ${C.ink};
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 10px;
  outline: none;
  min-width: 0;
  transition: border-color 0.18s, box-shadow 0.18s;
  &::placeholder { color: ${C.mutedSoft}; }
  &:focus { border-color: var(--color-primary, #2563EB); box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
  &:disabled { opacity: 0.5; }
`;

const AddBtn = styled.button`
  padding: 11px 18px;
  font-size: 13.5px;
  font-weight: 700;
  border-radius: 10px;
  cursor: pointer;
  white-space: nowrap;
  color: white;
  background: var(--color-primary, #2563EB);
  border: none;
  transition: opacity 0.15s, transform 0.15s, box-shadow 0.18s;
  &:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); box-shadow: 0 6px 18px rgba(37,99,235,0.3); }
  &:disabled { opacity: 0.45; cursor: default; }
`;

const ErrorBanner = styled.div`
  padding: 10px 24px;
  background: rgba(210,59,47,0.08);
  border-bottom: 1px solid rgba(210,59,47,0.2);
  font-size: 13px;
  color: ${C.danger};
  flex-shrink: 0;
`;

const TaskScroll = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 18px 24px 32px;
`;

const EmptyMsg = styled.p`
  text-align: center;
  padding: 48px 24px;
  color: ${C.mutedSoft};
  font-size: 14px;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 64px 24px;
  text-align: center;
  .icon { font-size: 40px; }
  p { font-size: 14.5px; color: ${C.muted}; max-width: 320px; line-height: 1.55; }
`;

const Group = styled.div`
  margin-bottom: 28px;
`;

const GroupLabel = styled.div<{ $muted?: boolean }>`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${(p) => (p.$muted ? C.mutedSoft : C.muted)};
  margin-bottom: 10px;
  padding-left: 2px;
`;

const TRow = styled.div<{ $done?: boolean; $busy?: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 13px 14px;
  border-radius: 12px;
  margin-bottom: 6px;
  background: ${C.paper};
  border: 1px solid ${C.line};
  opacity: ${(p) => (p.$busy ? 0.6 : 1)};
  transition: border-color 0.16s, box-shadow 0.16s, opacity 0.15s;
  animation: ${fadeIn} 0.28s ease both;
  &:hover { border-color: rgba(37,99,235,0.25); box-shadow: 0 2px 10px rgba(37,99,235,0.06); }
`;

const TaskBody = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const TaskDesc = styled.span<{ $done?: boolean }>`
  font-size: 14px;
  font-weight: 500;
  color: ${(p) => (p.$done ? C.mutedSoft : C.ink)};
  text-decoration: ${(p) => (p.$done ? 'line-through' : 'none')};
  word-break: break-word;
  line-height: 1.45;
`;

const TaskMeta = styled.span`
  font-size: 11.5px;
  color: ${C.mutedSoft};
  font-weight: 400;
`;

const EditInput = styled.input`
  width: 100%;
  font-size: 14px;
  font-weight: 500;
  color: ${C.ink};
  background: ${C.paper2};
  border: 1px solid var(--color-primary, #2563EB);
  border-radius: 7px;
  padding: 5px 9px;
  outline: none;
  box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
`;

const RowActions = styled.div`
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.14s;
  ${TRow}:hover & { opacity: 1; }
`;

const ActionBtn = styled.button<{ $danger?: boolean }>`
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  cursor: pointer;
  border: 1px solid ${C.line};
  background: transparent;
  color: ${(p) => (p.$danger ? C.danger : C.muted)};
  transition: background 0.14s, color 0.14s, border-color 0.14s;
  &:hover {
    background: ${(p) => (p.$danger ? 'rgba(210,59,47,0.08)' : C.paper2)};
    border-color: ${(p) => (p.$danger ? 'rgba(210,59,47,0.3)' : C.lineDark)};
    color: ${(p) => (p.$danger ? C.danger : C.ink)};
  }
  &:disabled { opacity: 0.4; cursor: default; }
`;

const CheckWrap = styled.div<{ $checked?: boolean; $disabled?: boolean }>`
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 6px;
  border: 2px solid ${(p) => (p.$checked ? 'var(--color-accent, #10B981)' : C.line)};
  background: ${(p) => (p.$checked ? 'var(--color-accent, #10B981)' : 'transparent')};
  display: grid;
  place-items: center;
  cursor: ${(p) => (p.$disabled ? 'default' : 'pointer')};
  transition: border-color 0.16s, background 0.16s, box-shadow 0.16s;
  margin-top: 2px;
  &:hover:not([aria-disabled]) {
    border-color: ${(p) => (p.$checked ? 'var(--color-accent, #10B981)' : 'rgba(16,185,129,0.5)')};
    box-shadow: 0 0 0 3px rgba(16,185,129,0.12);
  }
`;

const Spin = styled.span`
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: white;
  border-radius: 50%;
  animation: ${spin} 0.6s linear infinite;
`;
