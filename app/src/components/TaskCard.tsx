import React from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import type { Task } from '../api/board/BoardClient';

interface TaskCardProps {
  task: Task;
  memberNames?: Record<string, string>;
  onClick: () => void;
}

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 5)}…${id.slice(-4)}`;
}

export default function TaskCard({ task, memberNames, onClick }: TaskCardProps) {
  const assigneeLabel = task.assignee
    ? memberNames?.[task.assignee] || shortenId(task.assignee)
    : null;
  const creatorLabel = memberNames?.[task.created_by] || shortenId(task.created_by);

  return (
    <Card onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <Top>
        <PriorityBadge $priority={task.priority}>{task.priority}</PriorityBadge>
      </Top>
      <Title>{task.title}</Title>
      {task.description && <Desc>{task.description}</Desc>}
      <Footer>
        <Creator title={`Created by ${task.created_by}`}>
          <Avatar>{creatorLabel.charAt(0).toUpperCase()}</Avatar>
          <span>{creatorLabel}</span>
        </Creator>
        {assigneeLabel && (
          <Assignee title={`Assigned to ${task.assignee}`}>
            <AssigneeAvatar>{assigneeLabel.charAt(0).toUpperCase()}</AssigneeAvatar>
            <span>{assigneeLabel}</span>
          </Assignee>
        )}
      </Footer>
    </Card>
  );
}

/* ── styles ── */
const Card = styled.div`
  background: ${C.paper};
  border: 1px solid ${C.line};
  border-radius: 12px;
  padding: 14px 14px 12px;
  cursor: pointer;
  margin-bottom: 8px;
  transition: box-shadow 0.18s, border-color 0.18s, transform 0.16s;
  &:hover {
    box-shadow: 0 6px 20px -8px rgba(14,20,15,0.22);
    border-color: ${C.lineDark};
    transform: translateY(-1px);
  }
  &:focus-visible {
    outline: 2px solid ${C.green};
    outline-offset: 2px;
  }
`;
const Top = styled.div`display: flex; align-items: center; gap: 8px; margin-bottom: 8px;`;
const PriorityBadge = styled.span<{ $priority: string }>`
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  padding: 2px 8px; border-radius: 999px;
  background: ${(p) => priorityBg(p.$priority)};
  color: ${(p) => priorityColor(p.$priority)};
  border: 1px solid ${(p) => priorityBorder(p.$priority)};
`;
const Title = styled.div`
  font-size: 14px; font-weight: 600; color: ${C.ink}; line-height: 1.4;
  margin-bottom: 6px; word-break: break-word;
`;
const Desc = styled.div`
  font-size: 12.5px; color: ${C.muted}; line-height: 1.5;
  margin-bottom: 10px;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
`;
const Footer = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-top: 10px; padding-top: 8px; border-top: 1px solid ${C.line};
`;
const Creator = styled.div`
  display: flex; align-items: center; gap: 5px;
  font-size: 11.5px; color: ${C.muted};
  span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 90px; }
`;
const Avatar = styled.div`
  width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
  display: grid; place-items: center;
  font-size: 9px; font-weight: 700; color: ${C.ink};
  background: ${C.paper2}; border: 1px solid ${C.line};
`;
const Assignee = styled.div`
  display: flex; align-items: center; gap: 5px;
  font-size: 11.5px; color: ${C.greenDeep}; font-weight: 600;
  span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 90px; }
`;
const AssigneeAvatar = styled.div`
  width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
  display: grid; place-items: center;
  font-size: 9px; font-weight: 700; color: ${C.onAccent};
  background: ${C.green}; border: 1px solid transparent;
`;

function priorityBg(p: string) {
  if (p === 'high') return 'rgba(239,68,68,0.1)';
  if (p === 'medium') return 'rgba(245,158,11,0.12)';
  return 'rgba(59,130,246,0.1)';
}
function priorityColor(p: string) {
  if (p === 'high') return '#dc2626';
  if (p === 'medium') return '#d97706';
  return '#2563eb';
}
function priorityBorder(p: string) {
  if (p === 'high') return 'rgba(239,68,68,0.3)';
  if (p === 'medium') return 'rgba(245,158,11,0.3)';
  return 'rgba(59,130,246,0.25)';
}
