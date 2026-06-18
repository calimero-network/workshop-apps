import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import type { Task } from '../api/board/BoardClient';
import type { GroupMember } from '@calimero-network/mero-react';
import TaskCard from './TaskCard';

const COLUMNS: { key: string; label: string; accent: string }[] = [
  { key: 'todo',        label: 'To Do',       accent: 'rgba(59,130,246,0.14)' },
  { key: 'in_progress', label: 'In Progress',  accent: 'rgba(245,158,11,0.14)' },
  { key: 'done',        label: 'Done',         accent: 'rgba(164,255,17,0.14)' },
];

interface BoardViewProps {
  tasks: Task[];
  tasksLoading: boolean;
  members: GroupMember[];
  selfIdentity: string | null;
  memberNames?: Record<string, string>;
  onSelectTask: (task: Task) => void;
  onCreateTask: (status: string) => void;
}

export default function BoardView({
  tasks,
  tasksLoading,
  members,
  selfIdentity,
  memberNames,
  onSelectTask,
  onCreateTask,
}: BoardViewProps) {
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  // All member identities for the assignee filter
  const allMembers = useMemo(() => {
    const ids: Array<{ identity: string; label: string }> = [];
    if (selfIdentity) ids.push({ identity: selfIdentity, label: memberNames?.[selfIdentity] || shortenId(selfIdentity) + ' (you)' });
    for (const m of members) ids.push({ identity: m.identity, label: memberNames?.[m.identity] || m.name || shortenId(m.identity) });
    return ids;
  }, [members, selfIdentity, memberNames]);

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (filterAssignee) list = list.filter((t) => t.assignee === filterAssignee);
    if (filterPriority) list = list.filter((t) => t.priority === filterPriority);
    return list;
  }, [tasks, filterAssignee, filterPriority]);

  const tasksByStatus = useMemo(() => {
    const map: Record<string, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const t of filteredTasks) {
      const col = COLUMNS.find((c) => c.key === t.status);
      if (col) map[col.key].push(t);
      else map['todo'].push(t); // fallback
    }
    return map;
  }, [filteredTasks]);

  const hasFilters = filterAssignee || filterPriority;

  return (
    <Root>
      {/* Filter bar */}
      <FilterBar>
        <FilterLabel>Filter</FilterLabel>
        <Select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
          aria-label="Filter by assignee"
        >
          <option value="">All assignees</option>
          {allMembers.map((m) => (
            <option key={m.identity} value={m.identity}>{m.label}</option>
          ))}
        </Select>
        <Select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          aria-label="Filter by priority"
        >
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        {hasFilters && (
          <ClearBtn onClick={() => { setFilterAssignee(''); setFilterPriority(''); }}>
            Clear filters
          </ClearBtn>
        )}
        {tasksLoading && <LoadingDot title="Loading…" />}
      </FilterBar>

      {/* Kanban columns */}
      <ColumnsArea>
        {COLUMNS.map((col) => {
          const colTasks = tasksByStatus[col.key] ?? [];
          return (
            <Column key={col.key}>
              <ColHeader $accent={col.accent}>
                <ColTitle>{col.label}</ColTitle>
                <ColCount>{colTasks.length}</ColCount>
                <AddTaskBtn onClick={() => onCreateTask(col.key)} title={`Add task to ${col.label}`} aria-label={`Add task to ${col.label}`}>
                  +
                </AddTaskBtn>
              </ColHeader>
              <ColBody>
                {colTasks.length === 0 && (
                  <EmptyCol onClick={() => onCreateTask(col.key)}>
                    <span>+ Add task</span>
                  </EmptyCol>
                )}
                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    memberNames={memberNames}
                    onClick={() => onSelectTask(task)}
                  />
                ))}
              </ColBody>
            </Column>
          );
        })}
      </ColumnsArea>
    </Root>
  );
}

function shortenId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 4)}…${id.slice(-3)}`;
}

/* ── styles ── */
const Root = styled.div`
  display: flex; flex-direction: column; height: 100%; background: ${C.paper2};
`;
const FilterBar = styled.div`
  display: flex; align-items: center; gap: 10px;
  padding: 12px 20px; background: ${C.paper}; border-bottom: 1px solid ${C.line};
  flex-shrink: 0;
`;
const FilterLabel = styled.span`
  font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
  color: ${C.mutedSoft};
`;
const Select = styled.select`
  padding: 7px 12px; font-size: 13px; color: ${C.ink};
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 9px;
  cursor: pointer; outline: none;
  transition: border-color 0.18s;
  &:focus { border-color: ${C.green}; }
`;
const ClearBtn = styled.button`
  padding: 7px 13px; font-size: 12.5px; font-weight: 600;
  color: ${C.muted}; background: transparent; border: 1px solid ${C.line};
  border-radius: 9px; cursor: pointer; transition: background 0.15s, color 0.15s;
  &:hover { background: ${C.paper2}; color: ${C.ink}; }
`;
const LoadingDot = styled.span`
  width: 8px; height: 8px; border-radius: 50%;
  background: ${C.green}; margin-left: 4px;
  animation: pulse 1.2s ease-in-out infinite;
  @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.35;} }
`;
const ColumnsArea = styled.div`
  flex: 1; display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 16px; padding: 20px; overflow-y: auto; min-height: 0;
  @media (max-width: 800px) { grid-template-columns: 1fr; }
`;
const Column = styled.div`
  display: flex; flex-direction: column;
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 14px;
  overflow: hidden; min-height: 0;
`;
const ColHeader = styled.div<{ $accent: string }>`
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px; border-bottom: 1px solid ${C.line};
  background: ${(p) => p.$accent}; flex-shrink: 0;
`;
const ColTitle = styled.span`
  font-size: 13px; font-weight: 700; letter-spacing: -0.2px; color: ${C.ink}; flex: 1;
`;
const ColCount = styled.span`
  font-size: 11.5px; font-weight: 600; color: ${C.muted};
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 999px;
  padding: 1px 7px;
`;
const AddTaskBtn = styled.button`
  width: 24px; height: 24px; display: grid; place-items: center;
  font-size: 16px; color: ${C.muted}; background: ${C.paper}; border: 1px solid ${C.line};
  border-radius: 7px; cursor: pointer; transition: background 0.14s, color 0.14s, border-color 0.14s;
  &:hover { background: ${C.green}; color: ${C.onAccent}; border-color: #93e60c; }
`;
const ColBody = styled.div`
  flex: 1; overflow-y: auto; padding: 12px 10px;
`;
const EmptyCol = styled.div`
  padding: 28px 12px; text-align: center; cursor: pointer; border-radius: 10px;
  border: 1.5px dashed ${C.line}; margin-bottom: 8px;
  transition: border-color 0.16s, background 0.16s;
  span { font-size: 13px; color: ${C.mutedSoft}; font-weight: 600; }
  &:hover { border-color: ${C.green}; background: rgba(164,255,17,0.06); }
  &:hover span { color: ${C.greenDeep}; }
`;
