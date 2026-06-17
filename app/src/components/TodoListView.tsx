import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import type { Task } from '../api/todolist/TodolistClient';
import type { GroupMember } from '@calimero-network/mero-react';

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

interface TodoListViewProps {
  workspaceName: string | undefined;
  tasks: Task[];
  openTasks: Task[];
  completedTasks: Task[];
  loading: boolean;
  error: Error | null;
  executorKey: string | null;
  members: GroupMember[];
  selfIdentity: string | null;
  memberNames: Record<string, string>;
  onCreateTask: (title: string) => Promise<void>;
  onMarkComplete: (taskId: string) => Promise<void>;
  onMarkIncomplete: (taskId: string) => Promise<void>;
  onEditTask: (taskId: string, newTitle: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onAssignTask: (taskId: string, assignee: string) => Promise<void>;
}

interface AssignModalProps {
  task: Task;
  members: GroupMember[];
  memberNames: Record<string, string>;
  selfIdentity: string | null;
  onAssign: (assignee: string) => void;
  onClose: () => void;
}

function AssignModal({ task, members, memberNames, selfIdentity, onAssign, onClose }: AssignModalProps) {
  const allPeople = [
    ...(selfIdentity ? [{ identity: selfIdentity, role: 'You', name: undefined as string | undefined }] : []),
    ...members.map((m) => ({ identity: m.identity, role: m.role, name: m.name })),
  ];

  const displayName = (identity: string, name?: string) =>
    memberNames[identity] || name || shortenId(identity);

  return (
    <Overlay onClick={onClose}>
      <ModalBox onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <h3>Assign task</h3>
          <CloseBtn onClick={onClose} aria-label="Close">✕</CloseBtn>
        </ModalHeader>
        <ModalBody>
          <ModalTaskTitle>"{task.title}"</ModalTaskTitle>
          <AssigneeList>
            {allPeople.map(({ identity, name }) => {
              const isCurrent = task.assigned_to === identity;
              return (
                <AssigneeRow
                  key={identity}
                  $selected={isCurrent}
                  onClick={() => { onAssign(identity); onClose(); }}
                  title={identity}
                >
                  <AssigneeAvatar>{displayName(identity, name).charAt(0).toUpperCase()}</AssigneeAvatar>
                  <span className="name">{displayName(identity, name)}</span>
                  {isCurrent && <span className="badge">assigned</span>}
                </AssigneeRow>
              );
            })}
          </AssigneeList>
          {task.assigned_to && (
            <UnassignBtn onClick={() => { onAssign(''); onClose(); }}>
              Remove assignment
            </UnassignBtn>
          )}
        </ModalBody>
      </ModalBox>
    </Overlay>
  );
}

interface TaskRowProps {
  task: Task;
  isMine: boolean;
  memberNames: Record<string, string>;
  members: GroupMember[];
  selfIdentity: string | null;
  onComplete: () => void;
  onIncomplete: () => void;
  onEdit: (newTitle: string) => void;
  onDelete: () => void;
  onAssign: (assignee: string) => void;
}

function TaskRow({
  task, isMine, memberNames, members, selfIdentity,
  onComplete, onIncomplete, onEdit, onDelete, onAssign,
}: TaskRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const [showAssign, setShowAssign] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // Keep draft in sync if title changes remotely while not editing
  useEffect(() => {
    if (!editing) setDraft(task.title);
  }, [task.title, editing]);

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== task.title) onEdit(trimmed);
    else setDraft(task.title);
    setEditing(false);
  };

  const assigneeName = task.assigned_to
    ? (memberNames[task.assigned_to] || shortenId(task.assigned_to))
    : null;

  const allMembersForAssign: GroupMember[] = members;

  return (
    <>
      <TRow $completed={task.completed}>
        <Checkbox
          type="checkbox"
          checked={task.completed}
          onChange={() => (task.completed ? onIncomplete() : onComplete())}
          aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        />
        <TaskContent>
          {editing ? (
            <EditInput
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') { setDraft(task.title); setEditing(false); }
              }}
              autoFocus
            />
          ) : (
            <TTitle $completed={task.completed}>{task.title}</TTitle>
          )}
          {assigneeName && (
            <AssigneePill title={task.assigned_to || ''}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
              {assigneeName}
            </AssigneePill>
          )}
        </TaskContent>
        <TaskActions>
          <ActionBtn
            onClick={() => setShowAssign(true)}
            title="Assign task"
            aria-label="Assign task"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          </ActionBtn>
          {isMine && !task.completed && (
            <ActionBtn
              onClick={() => setEditing(true)}
              title="Edit task"
              aria-label="Edit task"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </ActionBtn>
          )}
          {isMine && (
            <ActionBtn
              $danger
              onClick={() => {
                if (window.confirm(`Delete "${task.title}"?`)) onDelete();
              }}
              title="Delete task"
              aria-label="Delete task"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
              </svg>
            </ActionBtn>
          )}
        </TaskActions>
      </TRow>

      {showAssign && (
        <AssignModal
          task={task}
          members={allMembersForAssign}
          memberNames={memberNames}
          selfIdentity={selfIdentity}
          onAssign={onAssign}
          onClose={() => setShowAssign(false)}
        />
      )}
    </>
  );
}

export default function TodoListView({
  workspaceName,
  openTasks,
  completedTasks,
  loading,
  error,
  executorKey,
  members,
  selfIdentity,
  memberNames,
  onCreateTask,
  onMarkComplete,
  onMarkIncomplete,
  onEditTask,
  onDeleteTask,
  onAssignTask,
}: TodoListViewProps) {
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      await onCreateTask(title);
      setNewTitle('');
    } finally {
      setAdding(false);
    }
  };

  const totalTasks = openTasks.length + completedTasks.length;

  return (
    <Root>
      {/* Header */}
      <Header>
        <div className="title">
          <CheckIcon aria-hidden />
          <h2>{workspaceName || 'Team Tasks'}</h2>
        </div>
        <Stats>
          <StatChip $accent>
            {openTasks.length} open
          </StatChip>
          <StatChip>
            {completedTasks.length} done
          </StatChip>
          {totalTasks > 0 && (
            <ProgressBar title={`${completedTasks.length}/${totalTasks} completed`}>
              <div style={{ width: `${Math.round((completedTasks.length / totalTasks) * 100)}%` }} />
            </ProgressBar>
          )}
        </Stats>
      </Header>

      {/* Add task composer */}
      <AddBar>
        <AddInput
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
          placeholder="Add a new task… (Enter to submit)"
          disabled={adding}
          maxLength={200}
          aria-label="New task title"
        />
        <AddBtn
          onClick={() => void handleAdd()}
          disabled={!newTitle.trim() || adding}
          aria-label="Add task"
        >
          {adding ? '…' : '+ Add'}
        </AddBtn>
      </AddBar>

      <ScrollArea>
        {/* Error state */}
        {error && (
          <ErrorBanner>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            {error.message}
          </ErrorBanner>
        )}

        {/* Loading state */}
        {loading && openTasks.length === 0 && completedTasks.length === 0 && (
          <Placeholder>Loading tasks…</Placeholder>
        )}

        {/* Open tasks */}
        <Section>
          <SectionLabel>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="10" />
            </svg>
            Open tasks
            <Count>{openTasks.length}</Count>
          </SectionLabel>

          {openTasks.length === 0 && !loading && (
            <EmptySection>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.greenInk} strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <span>All caught up! Add a task above.</span>
            </EmptySection>
          )}

          <TaskList>
            {openTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                isMine={task.author === executorKey}
                memberNames={memberNames}
                members={members}
                selfIdentity={selfIdentity}
                onComplete={() => void onMarkComplete(task.id)}
                onIncomplete={() => void onMarkIncomplete(task.id)}
                onEdit={(t) => void onEditTask(task.id, t)}
                onDelete={() => void onDeleteTask(task.id)}
                onAssign={(a) => void onAssignTask(task.id, a)}
              />
            ))}
          </TaskList>
        </Section>

        {/* Completed tasks */}
        {completedTasks.length > 0 && (
          <Section>
            <SectionLabel $muted>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Completed
              <Count>{completedTasks.length}</Count>
            </SectionLabel>

            <TaskList>
              {completedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isMine={task.author === executorKey}
                  memberNames={memberNames}
                  members={members}
                  selfIdentity={selfIdentity}
                  onComplete={() => void onMarkComplete(task.id)}
                  onIncomplete={() => void onMarkIncomplete(task.id)}
                  onEdit={(t) => void onEditTask(task.id, t)}
                  onDelete={() => void onDeleteTask(task.id)}
                  onAssign={(a) => void onAssignTask(task.id, a)}
                />
              ))}
            </TaskList>
          </Section>
        )}
      </ScrollArea>
    </Root>
  );
}

/* ── Icons ── */
function CheckIcon(props: { 'aria-hidden'?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.greenInk} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

/* ── Styles ── */
const font = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased;`;

const Root = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: ${C.paper2};
  min-width: 0;
  ${font}
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  background: ${C.paper};
  border-bottom: 1px solid ${C.line};
  flex-wrap: wrap;
  .title {
    display: flex; align-items: center; gap: 10px;
    h2 { font-size: 16px; font-weight: 800; letter-spacing: -0.4px; color: ${C.ink}; margin: 0; }
  }
`;

const Stats = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const StatChip = styled.span<{ $accent?: boolean }>`
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
  color: ${(p) => (p.$accent ? C.greenInk : C.muted)};
  background: ${(p) => (p.$accent ? 'rgba(164,255,17,0.18)' : C.paper2)};
  border: 1px solid ${(p) => (p.$accent ? 'rgba(164,255,17,0.4)' : C.line)};
`;

const ProgressBar = styled.div`
  width: 80px;
  height: 6px;
  border-radius: 99px;
  background: ${C.line};
  overflow: hidden;
  div {
    height: 100%;
    background: ${C.green};
    border-radius: 99px;
    transition: width 0.4s ease;
  }
`;

const AddBar = styled.div`
  display: flex;
  gap: 10px;
  padding: 12px 20px;
  background: ${C.paper};
  border-bottom: 1px solid ${C.line};
`;

const AddInput = styled.input`
  flex: 1;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid ${C.line};
  background: ${C.paper2};
  color: ${C.ink};
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  &::placeholder { color: ${C.mutedSoft}; }
  &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
  &:disabled { opacity: 0.6; }
`;

const AddBtn = styled.button`
  padding: 10px 18px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  color: ${C.onAccent};
  background: ${C.green};
  border: 1px solid #93e60c;
  transition: background 0.15s, box-shadow 0.18s, transform 0.14s;
  white-space: nowrap;
  &:hover:not(:disabled) { background: ${C.greenHover}; box-shadow: 0 6px 18px rgba(164,255,17,0.4); transform: translateY(-1px); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const ScrollArea = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px 32px;
  display: flex;
  flex-direction: column;
  gap: 18px;
`;

const ErrorBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(210,59,47,0.08);
  border: 1px solid rgba(210,59,47,0.22);
  color: ${C.danger};
  font-size: 13px;
  font-weight: 500;
`;

const Placeholder = styled.div`
  text-align: center;
  padding: 40px 0;
  color: ${C.mutedSoft};
  font-size: 13.5px;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const SectionLabel = styled.div<{ $muted?: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${(p) => (p.$muted ? C.mutedSoft : C.greenInk)};
  padding: 0 2px 8px;
`;

const Count = styled.span`
  margin-left: 2px;
  font-size: 11px;
  font-weight: 700;
  color: inherit;
  background: rgba(0,0,0,0.06);
  padding: 1px 6px;
  border-radius: 999px;
`;

const EmptySection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 16px;
  border-radius: 12px;
  border: 1.5px dashed ${C.line};
  color: ${C.mutedSoft};
  font-size: 13px;
  text-align: center;
`;

const TaskList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const TRow = styled.div<{ $completed: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-radius: 11px;
  background: ${(p) => (p.$completed ? C.paper2 : C.paper)};
  border: 1px solid ${C.line};
  transition: box-shadow 0.15s, border-color 0.15s;
  opacity: ${(p) => (p.$completed ? 0.7 : 1)};
  &:hover {
    border-color: ${(p) => (p.$completed ? C.line : C.lineDark)};
    box-shadow: ${(p) => (p.$completed ? 'none' : '0 2px 10px rgba(14,20,15,0.06)')};
  }
`;

const Checkbox = styled.input`
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: ${C.green};
`;

const TaskContent = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const TTitle = styled.span<{ $completed: boolean }>`
  font-size: 14px;
  font-weight: ${(p) => (p.$completed ? 400 : 500)};
  color: ${(p) => (p.$completed ? C.mutedSoft : C.ink)};
  text-decoration: ${(p) => (p.$completed ? 'line-through' : 'none')};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const AssigneePill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-primary, ${C.greenDeep});
  background: rgba(164,255,17,0.12);
  border: 1px solid rgba(164,255,17,0.3);
  padding: 2px 8px;
  border-radius: 999px;
  flex-shrink: 0;
`;

const EditInput = styled.input`
  flex: 1;
  min-width: 120px;
  padding: 4px 8px;
  border-radius: 7px;
  border: 1px solid ${C.line};
  background: ${C.paper2};
  color: ${C.ink};
  font-size: 14px;
  font-weight: 500;
  outline: none;
  &:focus { border-color: ${C.green}; box-shadow: 0 0 0 2px rgba(164,255,17,0.2); }
`;

const TaskActions = styled.div`
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
  ${TRow}:hover & { opacity: 1; }
`;

const ActionBtn = styled.button<{ $danger?: boolean }>`
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  color: ${(p) => (p.$danger ? C.danger : C.muted)};
  transition: background 0.14s, border-color 0.14s, color 0.14s;
  &:hover {
    background: ${(p) => (p.$danger ? 'rgba(210,59,47,0.1)' : C.paper2)};
    border-color: ${(p) => (p.$danger ? 'rgba(210,59,47,0.3)' : C.line)};
    color: ${(p) => (p.$danger ? C.danger : C.ink)};
  }
`;

/* ── Assign modal ── */
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(14,20,15,0.45);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  z-index: 200;
  padding: 20px;
`;

const ModalBox = styled.div`
  background: ${C.paper};
  border: 1px solid ${C.line};
  border-radius: 16px;
  box-shadow: 0 24px 60px -20px rgba(14,20,15,0.5);
  width: 100%;
  max-width: 380px;
  overflow: hidden;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 14px;
  border-bottom: 1px solid ${C.line};
  h3 { font-size: 15px; font-weight: 700; letter-spacing: -0.2px; color: ${C.ink}; margin: 0; }
`;

const CloseBtn = styled.button`
  width: 28px; height: 28px;
  display: grid; place-items: center;
  border-radius: 8px;
  cursor: pointer;
  color: ${C.muted};
  background: transparent;
  border: 1px solid ${C.line};
  font-size: 13px;
  transition: background 0.14s;
  &:hover { background: ${C.paper2}; color: ${C.ink}; }
`;

const ModalBody = styled.div`
  padding: 16px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ModalTaskTitle = styled.p`
  font-size: 13px;
  color: ${C.muted};
  font-style: italic;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const AssigneeList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 240px;
  overflow-y: auto;
`;

const AssigneeRow = styled.div<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 9px;
  cursor: pointer;
  background: ${(p) => (p.$selected ? 'rgba(164,255,17,0.14)' : 'transparent')};
  border: 1px solid ${(p) => (p.$selected ? 'rgba(164,255,17,0.4)' : 'transparent')};
  transition: background 0.14s, border-color 0.14s;
  &:hover { background: ${C.paper2}; }
  .name { flex: 1; font-size: 13px; font-weight: 500; color: ${C.ink}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { font-size: 10.5px; font-weight: 600; color: ${C.greenDeep}; background: rgba(164,255,17,0.18); padding: 2px 7px; border-radius: 999px; }
`;

const AssigneeAvatar = styled.span`
  width: 26px; height: 26px; flex-shrink: 0;
  display: grid; place-items: center;
  border-radius: 50%;
  font-size: 11px; font-weight: 700;
  color: ${C.onAccent};
  background: linear-gradient(135deg, ${C.green}, #cde88a);
`;

const UnassignBtn = styled.button`
  padding: 9px 12px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: ${C.danger};
  background: rgba(210,59,47,0.06);
  border: 1px solid rgba(210,59,47,0.2);
  transition: background 0.15s;
  &:hover { background: rgba(210,59,47,0.12); }
`;
