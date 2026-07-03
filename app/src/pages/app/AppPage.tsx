import React, { useState } from 'react';
import styled from 'styled-components';
import { useMero } from '@calimero-network/mero-react';
import { C } from '../../theme';
import { APP_DISPLAY_NAME } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useTasks, type Task } from '../../hooks/useTasks';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

/**
 * TaskListPage — the main app view.
 *
 * Shows all tasks grouped by status (Open / Done). Team members can:
 *  - Add any task (with a title).
 *  - Edit, toggle done, or remove only their OWN tasks (authorship check via
 *    task.author === ws.executorPublicKey).
 *
 * Keeps the three proven states from the scaffold:
 *  1. Welcome gate (!ws.ready && !ws.loading) — bootstrap or join.
 *  2. Loading spinner while workspace resolves.
 *  3. Main view with live task list.
 */
export default function AppPage() {
  const { logout } = useMero();
  const ws = useWorkspace();
  const data = useTasks({
    contextId: ws.contextId,
    executorPublicKey: ws.executorPublicKey,
  });

  const [newTitle, setNewTitle] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // Inline-edit state: which task is being edited, and its draft title.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditDraft(task.title);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft('');
  };

  const commitEdit = async (id: string) => {
    const next = editDraft.trim();
    if (next) {
      await data.editTask(id, next);
    }
    setEditingId(null);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await data.addTask(newTitle.trim());
    setNewTitle('');
  };

  // Ownership check — only the author can mutate their task.
  const isOwn = (task: Task) => task.author === ws.executorPublicKey;

  // Sort by created_at ascending; split into open and done.
  const sorted = [...data.tasks].sort((a, b) => a.created_at - b.created_at);
  const openTasks = sorted.filter((t) => !t.done);
  const doneTasks = sorted.filter((t) => t.done);

  // ── Welcome gate: no workspace yet ──────────────────────────────────────
  if (!ws.ready && !ws.loading) {
    return (
      <Empty>
        <Card>
          <h2>Welcome to {APP_DISPLAY_NAME}</h2>
          <p>Create a shared todo list and invite your team, or join one you were invited to.</p>
          <Row>
            <Primary onClick={() => ws.bootstrap()}>Create workspace</Primary>
            <Secondary onClick={() => setShowJoin(true)}>Join with invitation</Secondary>
          </Row>
          {ws.error && <ErrLine>{describeError(ws.error)}</ErrLine>}
        </Card>
        {showJoin && (
          <JoinModal
            onJoin={async (code) => { await ws.join(code); setShowJoin(false); }}
            onClose={() => setShowJoin(false)}
          />
        )}
      </Empty>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (ws.loading && !ws.ready) {
    return (
      <Empty>
        <Spinner />
      </Empty>
    );
  }

  // ── Main view ────────────────────────────────────────────────────────────
  return (
    <Page>
      <Bar>
        <h1>{APP_DISPLAY_NAME}</h1>
        <div className="actions">
          <Secondary onClick={() => setShowInvite(true)}>Invite</Secondary>
          <Secondary onClick={() => setShowJoin(true)}>Join</Secondary>
          <Secondary onClick={logout}>Sign out</Secondary>
        </div>
      </Bar>

      {/* Add-task form */}
      <AddForm onSubmit={handleAdd}>
        <input
          data-testid="field-title"
          placeholder="Add a new task…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          disabled={!data.ready}
        />
        <Primary
          type="submit"
          data-testid="action-add_task"
          disabled={!newTitle.trim() || !data.ready}
        >
          Add
        </Primary>
      </AddForm>

      {data.error && <ErrLine>{describeError(data.error)}</ErrLine>}

      {/* ── Open tasks ─────────────────────────────────────────── */}
      <SectionHeader>
        <span>Open</span>
        <Badge>{openTasks.length}</Badge>
      </SectionHeader>
      <TaskList>
        {openTasks.length === 0 && !data.loading && (
          <Hint>No open tasks — add the first one above.</Hint>
        )}
        {openTasks.map((task) => (
          <TaskRow key={task.id} data-testid={`item-task-${task.id}`} $done={false}>
            {editingId === task.id ? (
              /* Inline edit mode */
              <EditRow>
                <input
                  data-testid="field-new_title"
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void commitEdit(task.id);
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  autoFocus
                />
                <SaveBtn onClick={() => void commitEdit(task.id)}>Save</SaveBtn>
                <CancelBtn onClick={cancelEdit}>Cancel</CancelBtn>
              </EditRow>
            ) : (
              /* Normal view */
              <>
                <Checkbox>○</Checkbox>
                <TaskText>
                  <strong>{task.title}</strong>
                  <AuthorLabel>{isOwn(task) ? 'You' : truncateKey(task.author)}</AuthorLabel>
                </TaskText>
                {isOwn(task) && (
                  <Controls>
                    <IconBtn
                      data-testid="action-edit_task"
                      title="Edit task"
                      onClick={() => startEdit(task)}
                    >
                      ✎
                    </IconBtn>
                    <IconBtn
                      data-testid="action-toggle_task"
                      title="Mark as done"
                      onClick={() => void data.toggleTask(task.id)}
                      $accent
                    >
                      ✓
                    </IconBtn>
                    <IconBtn
                      data-testid="action-remove_task"
                      title="Remove task"
                      onClick={() => void data.removeTask(task.id)}
                      $danger
                    >
                      ×
                    </IconBtn>
                  </Controls>
                )}
              </>
            )}
          </TaskRow>
        ))}
      </TaskList>

      {/* ── Done tasks ─────────────────────────────────────────── */}
      <SectionHeader style={{ marginTop: 28 }}>
        <span>Done</span>
        <Badge $muted>{doneTasks.length}</Badge>
      </SectionHeader>
      <TaskList>
        {doneTasks.length === 0 && !data.loading && (
          <Hint>No completed tasks yet.</Hint>
        )}
        {doneTasks.map((task) => (
          <TaskRow key={task.id} data-testid={`item-task-${task.id}`} $done>
            <Checkbox $done>✓</Checkbox>
            <TaskText $done>
              <strong>{task.title}</strong>
              <AuthorLabel>{isOwn(task) ? 'You' : truncateKey(task.author)}</AuthorLabel>
            </TaskText>
            {isOwn(task) && (
              <Controls>
                <IconBtn
                  data-testid="action-toggle_task"
                  title="Reopen task"
                  onClick={() => void data.toggleTask(task.id)}
                >
                  ↺
                </IconBtn>
                <IconBtn
                  data-testid="action-remove_task"
                  title="Remove task"
                  onClick={() => void data.removeTask(task.id)}
                  $danger
                >
                  ×
                </IconBtn>
              </Controls>
            )}
          </TaskRow>
        ))}
      </TaskList>

      {showInvite && (
        <InviteModal onInvite={ws.invite} onClose={() => setShowInvite(false)} />
      )}
      {showJoin && (
        <JoinModal
          onJoin={async (code) => { await ws.join(code); setShowJoin(false); }}
          onClose={() => setShowJoin(false)}
        />
      )}
    </Page>
  );
}

/** Shorten a public-key string to "abc123…ef01" for display. */
function truncateKey(key: string): string {
  if (key.length <= 12) return key;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

/* ════════════ styled components ════════════ */

const Page = styled.div`
  max-width: 680px;
  margin: 0 auto;
  padding: 28px 20px 80px;
  width: 100%;
`;

const Bar = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  h1 {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.5px;
    color: ${C.ink};
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
`;

const AddForm = styled.form`
  display: flex;
  gap: 8px;
  margin-bottom: 28px;
  input {
    flex: 1;
    min-width: 160px;
    padding: 10px 14px;
    font-size: 14px;
    color: ${C.ink};
    background: ${C.paper2};
    border: 1px solid ${C.line};
    border-radius: 10px;
    outline: none;
    &:focus {
      border-color: ${C.green};
      box-shadow: 0 0 0 3px rgba(164, 255, 17, 0.18);
    }
    &:disabled { opacity: 0.55; }
  }
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  span {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: ${C.muted};
  }
`;

const Badge = styled.span<{ $muted?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: ${(p) => (p.$muted ? C.paper2 : C.green)};
  color: ${(p) => (p.$muted ? C.muted : C.onAccent)};
  border: 1px solid ${(p) => (p.$muted ? C.line : 'transparent')};
`;

const TaskList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const TaskRow = styled.div<{ $done?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 12px;
  opacity: ${(p) => (p.$done ? 0.72 : 1)};
  transition: opacity 0.2s;
`;

const Checkbox = styled.span<{ $done?: boolean }>`
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: ${(p) => (p.$done ? '12px' : '14px')};
  border: 1.5px solid ${(p) => (p.$done ? C.green : C.line)};
  color: ${(p) => (p.$done ? C.green : C.muted)};
  background: ${(p) => (p.$done ? 'rgba(164,255,17,0.1)' : 'transparent')};
`;

const TaskText = styled.div<{ $done?: boolean }>`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  strong {
    font-size: 14px;
    font-weight: 600;
    color: ${C.ink};
    text-decoration: ${(p) => (p.$done ? 'line-through' : 'none')};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const AuthorLabel = styled.span`
  font-size: 11px;
  color: ${C.muted};
`;

const Controls = styled.div`
  display: flex;
  gap: 4px;
  flex-shrink: 0;
`;

const IconBtn = styled.button<{ $accent?: boolean; $danger?: boolean }>`
  width: 30px;
  height: 30px;
  font-size: 16px;
  line-height: 1;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  background: transparent;
  color: ${(p) => (p.$danger ? C.danger : p.$accent ? C.green : C.muted)};
  transition: background 0.15s, color 0.15s;
  &:hover {
    background: ${C.paper};
    color: ${(p) => (p.$danger ? C.danger : C.ink)};
  }
`;

const EditRow = styled.div`
  display: flex;
  gap: 8px;
  flex: 1;
  align-items: center;
  input {
    flex: 1;
    padding: 6px 10px;
    font-size: 14px;
    color: ${C.ink};
    background: ${C.paper};
    border: 1px solid ${C.green};
    border-radius: 8px;
    outline: none;
    box-shadow: 0 0 0 3px rgba(164, 255, 17, 0.18);
  }
`;

const SaveBtn = styled.button`
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  color: ${C.onAccent};
  background: ${C.green};
  border: 1px solid transparent;
  transition: background 0.15s;
  &:hover { background: ${C.greenHover}; }
`;

const CancelBtn = styled.button`
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  color: ${C.ink};
  background: ${C.paper};
  border: 1px solid ${C.line};
  transition: background 0.15s;
  &:hover { background: ${C.paper2}; }
`;

const Hint = styled.p`
  font-size: 13px;
  color: ${C.muted};
  padding: 6px 2px;
`;

const ErrLine = styled.p`
  margin: 8px 0;
  font-size: 13px;
  color: ${C.danger};
`;

const Empty = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  min-height: 80vh;
`;

const Card = styled.div`
  max-width: 440px;
  text-align: center;
  padding: 36px 28px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 18px;
  h2 {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.4px;
    color: ${C.ink};
    margin-bottom: 10px;
  }
  p {
    font-size: 14px;
    color: ${C.muted};
    margin-bottom: 24px;
    line-height: 1.55;
  }
`;

const Row = styled.div`
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
`;

const Primary = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  font-size: 13.5px;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  color: ${C.onAccent};
  background: ${C.green};
  border: 1px solid transparent;
  transition: background 0.18s, transform 0.15s;
  &:hover:not(:disabled) { background: ${C.greenHover}; transform: translateY(-1px); }
  &:disabled { opacity: 0.55; cursor: default; }
`;

const Secondary = styled.button`
  padding: 10px 16px;
  font-size: 13.5px;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  color: ${C.ink};
  background: ${C.paper};
  border: 1px solid ${C.line};
  transition: background 0.15s, border-color 0.15s;
  &:hover { background: ${C.paper2}; border-color: ${C.green}; }
`;

const Spinner = styled.div`
  width: 32px;
  height: 32px;
  border: 3px solid ${C.line};
  border-top-color: ${C.green};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  @keyframes spin { to { transform: rotate(360deg); } }
`;
