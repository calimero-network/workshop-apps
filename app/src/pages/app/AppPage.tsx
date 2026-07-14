import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { useMero } from '@calimero-network/mero-react';
import { C } from '../../theme';
import { APP_DISPLAY_NAME } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import TaskDetailModal from './TaskDetailModal';
import { PRIORITIES, type Category, type Comment, type Priority, type Task } from './types';

/**
 * BoardView — the spec's primary frontend view: active (non-archived) tasks
 * grouped by category, with create-category / create-task / filter controls.
 *
 * SHELL PASS (ABI-free): state below is local mock data, not the generated
 * AbiClient. The next pass swaps this for a `useTasks`/`useCategories` hook
 * pair over the real client — the view structure, fields, and testids stay.
 * Keep the workspace resolution (bootstrap / join) and Invite/Join wiring —
 * those are real infra, not entity data.
 */
const CURRENT_USER = 'you';

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function seedCategories(): Category[] {
  return [
    { id: nextId('cat'), name: 'Backend', created_at: 1 },
    { id: nextId('cat'), name: 'Frontend', created_at: 2 },
  ];
}

export default function AppPage() {
  const { logout } = useMero();
  const ws = useWorkspace();

  const [categories, setCategories] = useState<Category[]>(seedCategories);
  const [tasks, setTasks] = useState<Task[]>(() => {
    const [backend, frontend] = categories.length ? categories : seedCategories();
    return [
      {
        id: nextId('task'),
        title: 'Fix login bug',
        description: "Users can't log in on Safari",
        assignee: 'alice',
        priority: 'high',
        status: 'open',
        archived: false,
        category_id: backend?.id ?? '',
        author: 'alice',
        created_at: 1,
      },
      {
        id: nextId('task'),
        title: 'Polish board animations',
        description: '',
        assignee: 'bob',
        priority: 'low',
        status: 'open',
        archived: false,
        category_id: frontend?.id ?? '',
        author: 'bob',
        created_at: 2,
      },
    ];
  });
  const [commentsByTask, setCommentsByTask] = useState<Record<string, Comment[]>>(() => {
    const seedTaskId = tasks[0]?.id;
    return seedTaskId
      ? { [seedTaskId]: [{ id: nextId('cmt'), task_id: seedTaskId, author: 'alice', body: 'Repros on Safari 17 only.', pr_link: null, created_at: 1, updated_at: 1 }] }
      : {};
  });

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');

  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [filterAssignee, setFilterAssignee] = useState('');

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const activeTasks = useMemo(
    () => tasks.filter((t) => !t.archived
      && (filterPriority === 'all' || t.priority === filterPriority)
      && (!filterAssignee.trim() || t.assignee.toLowerCase().includes(filterAssignee.trim().toLowerCase()))),
    [tasks, filterPriority, filterAssignee],
  );

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  const createCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    setCategories((prev) => [...prev, { id: nextId('cat'), name, created_at: prev.length + 1 }]);
    setNewCategoryName('');
  };

  const createTask = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    const categoryId = newCategoryId || categories[0]?.id;
    if (!title || !categoryId) return;
    setTasks((prev) => [...prev, {
      id: nextId('task'),
      title,
      description: newDescription.trim(),
      assignee: newAssignee.trim(),
      priority: 'medium',
      status: 'open',
      archived: false,
      category_id: categoryId,
      author: CURRENT_USER,
      created_at: prev.length + 1,
    }]);
    setNewTitle('');
    setNewDescription('');
    setNewAssignee('');
  };

  const patchTask = (id: string, patch: Partial<Task>) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const closeDetail = () => setSelectedTaskId(null);

  // No workspace yet (fresh web session): offer create-or-join.
  if (!ws.ready && !ws.loading) {
    return (
      <Empty>
        <Card>
          <h2>Welcome to {APP_DISPLAY_NAME}</h2>
          <p>Create a workspace to start tracking issues, or join one you were invited to.</p>
          <Row>
            <Primary data-testid="create-workspace-btn" onClick={() => ws.bootstrap()}>Create workspace</Primary>
            <Secondary data-testid="open-join-btn" onClick={() => setShowJoin(true)}>Join with invitation</Secondary>
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

  return (
    <Page data-testid="workspace-ready">
      <Bar>
        <h1>{APP_DISPLAY_NAME}</h1>
        <div className="actions">
          <Secondary data-testid="open-invite-btn" onClick={() => setShowInvite(true)}>Invite</Secondary>
          <Secondary data-testid="open-join-btn" onClick={() => setShowJoin(true)}>Join</Secondary>
          <Secondary onClick={logout}>Sign out</Secondary>
        </div>
      </Bar>

      <Toolbar>
        <form onSubmit={createCategory}>
          <input
            data-testid="field-name"
            placeholder="New category…"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
          />
          <Secondary data-testid="action-create_category" type="submit" disabled={!newCategoryName.trim()}>
            Add category
          </Secondary>
        </form>

        <Filters>
          <select
            data-testid="filter-priority"
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as Priority | 'all')}
          >
            <option value="all">All priorities</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input
            data-testid="filter-assignee"
            placeholder="Filter by assignee…"
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
          />
        </Filters>
      </Toolbar>

      <TaskForm onSubmit={createTask}>
        <input
          data-testid="field-title"
          placeholder="Task title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <input
          data-testid="field-description"
          placeholder="Description (optional)"
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
        />
        <select
          data-testid="field-category_id"
          value={newCategoryId || categories[0]?.id || ''}
          onChange={(e) => setNewCategoryId(e.target.value)}
        >
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input
          data-testid="field-assignee"
          placeholder="Assignee"
          value={newAssignee}
          onChange={(e) => setNewAssignee(e.target.value)}
        />
        <Primary type="submit" data-testid="action-create_task" disabled={!newTitle.trim() || categories.length === 0}>
          Add task
        </Primary>
      </TaskForm>

      {ws.error && <ErrLine>{describeError(ws.error)}</ErrLine>}

      <Board>
        {categories.map((cat) => (
          <Column key={cat.id} data-testid={`item-category-${cat.id}`}>
            <h3>{cat.name}</h3>
            <div className="cards">
              {activeTasks.filter((t) => t.category_id === cat.id).map((task) => (
                <TaskCard
                  key={task.id}
                  data-testid={`item-task-${task.id}`}
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <span className={`pill prio-${task.priority}`}>{task.priority}</span>
                  <strong>{task.title}</strong>
                  {task.assignee && <span className="assignee">@{task.assignee}</span>}
                  {task.status === 'completed' && <span className="done">✓ completed</span>}
                </TaskCard>
              ))}
              {activeTasks.filter((t) => t.category_id === cat.id).length === 0 && (
                <Hint>No active tasks.</Hint>
              )}
            </div>
          </Column>
        ))}
        {categories.length === 0 && <Hint>Add a category to start organizing tasks.</Hint>}
      </Board>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          categories={categories}
          comments={commentsByTask[selectedTask.id] ?? []}
          currentUser={CURRENT_USER}
          onClose={closeDetail}
          onAssign={(assignee) => patchTask(selectedTask.id, { assignee })}
          onSetPriority={(priority) => patchTask(selectedTask.id, { priority })}
          onMove={(categoryId) => patchTask(selectedTask.id, { category_id: categoryId })}
          onComplete={() => patchTask(selectedTask.id, { status: 'completed' })}
          onArchive={() => { patchTask(selectedTask.id, { archived: true }); closeDetail(); }}
          onAddComment={(body, prLink) => setCommentsByTask((prev) => ({
            ...prev,
            [selectedTask.id]: [...(prev[selectedTask.id] ?? []), {
              id: nextId('cmt'),
              task_id: selectedTask.id,
              author: CURRENT_USER,
              body,
              pr_link: prLink,
              created_at: (prev[selectedTask.id]?.length ?? 0) + 1,
              updated_at: (prev[selectedTask.id]?.length ?? 0) + 1,
            }],
          }))}
          onEditComment={(commentId, body) => setCommentsByTask((prev) => ({
            ...prev,
            [selectedTask.id]: (prev[selectedTask.id] ?? []).map((c) =>
              c.id === commentId && c.author === CURRENT_USER ? { ...c, body, updated_at: c.updated_at + 1 } : c),
          }))}
          onDeleteComment={(commentId) => setCommentsByTask((prev) => ({
            ...prev,
            [selectedTask.id]: (prev[selectedTask.id] ?? []).filter((c) => !(c.id === commentId && c.author === CURRENT_USER)),
          }))}
        />
      )}

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

const Page = styled.div`
  max-width: 1120px;
  margin: 0 auto;
  padding: 28px 20px 64px;
  width: 100%;
`;
const Bar = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: ${C.ink}; }
  .actions { display: flex; gap: 8px; }
`;
const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  form { display: flex; gap: 8px; }
  input, select {
    padding: 9px 12px; font-size: 13.5px;
    color: ${C.ink}; background: ${C.paper2};
    border: 1px solid ${C.line}; border-radius: 10px; outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
  }
`;
const Filters = styled.div`display: flex; gap: 8px;`;
const TaskForm = styled.form`
  display: flex;
  gap: 8px;
  margin-bottom: 22px;
  flex-wrap: wrap;
  input, select {
    flex: 1; min-width: 140px;
    padding: 10px 12px; font-size: 14px;
    color: ${C.ink}; background: ${C.paper2};
    border: 1px solid ${C.line}; border-radius: 10px; outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
  }
`;
const Board = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  align-items: flex-start;
`;
const Column = styled.div`
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 14px;
  padding: 14px;
  h3 { font-size: 14px; font-weight: 700; color: ${C.ink}; margin-bottom: 12px; }
  .cards { display: flex; flex-direction: column; gap: 10px; }
`;
const TaskCard = styled.button`
  display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
  width: 100%; text-align: left; cursor: pointer;
  padding: 12px 14px; background: ${C.paper};
  border: 1px solid ${C.line}; border-radius: 12px;
  transition: border-color 0.15s, transform 0.15s;
  &:hover { border-color: ${C.green}; transform: translateY(-1px); }
  strong { font-size: 14px; color: ${C.ink}; }
  .assignee { font-size: 12px; color: ${C.muted}; }
  .done { font-size: 11.5px; font-weight: 600; color: ${C.greenInk}; }
  .pill {
    font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
    padding: 2px 8px; border-radius: 999px; color: ${C.ink}; background: ${C.line};
  }
  .pill.prio-medium { background: #cde88a; }
  .pill.prio-high { background: #ffbd6b; }
  .pill.prio-urgent { background: #ff8a7a; color: #4a0d05; }
`;
const Hint = styled.p`font-size: 13px; color: ${C.muted}; padding: 8px 2px;`;
const ErrLine = styled.p`margin: 8px 0; font-size: 13px; color: ${C.danger};`;

const Empty = styled.div`
  flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px;
`;
const Card = styled.div`
  max-width: 420px; text-align: center;
  padding: 32px 28px; background: ${C.paper2};
  border: 1px solid ${C.line}; border-radius: 18px;
  h2 { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; color: ${C.ink}; margin-bottom: 8px; }
  p { font-size: 14px; color: ${C.muted}; margin-bottom: 22px; line-height: 1.55; }
`;
const Row = styled.div`display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;`;

const Primary = styled.button`
  display: inline-flex; align-items: center; justify-content: center;
  padding: 10px 18px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c;
  transition: background 0.18s, transform 0.15s;
  &:hover:not(:disabled) { background: ${C.greenHover}; transform: translateY(-1px); }
  &:disabled { opacity: 0.55; cursor: default; }
`;
const Secondary = styled.button`
  padding: 10px 16px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  transition: background 0.15s, border-color 0.15s;
  &:hover:not(:disabled) { background: ${C.paper2}; border-color: ${C.green}; }
  &:disabled { opacity: 0.55; cursor: default; }
`;
