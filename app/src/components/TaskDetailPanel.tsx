import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { C } from '../theme';
import type { Task, Comment } from '../api/board/BoardClient';
import type { GroupMember } from '@calimero-network/mero-react';

const STATUSES = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
] as const;

type Status = typeof STATUSES[number]['value'];

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 5)}…${id.slice(-4)}`;
}

interface TaskDetailPanelProps {
  task: Task;
  comments: Comment[];
  commentsLoading: boolean;
  members: GroupMember[];
  selfIdentity: string | null;
  memberNames?: Record<string, string>;
  onClose: () => void;
  onUpdateStatus: (newStatus: string) => Promise<void>;
  onAssign: (taskId: string, assignee: string) => Promise<void>;
  onAddComment: (body: string) => Promise<void>;
  onEditComment: (commentId: string, newBody: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
}

export default function TaskDetailPanel({
  task,
  comments,
  commentsLoading,
  members,
  selfIdentity,
  memberNames,
  onClose,
  onUpdateStatus,
  onAssign,
  onAddComment,
  onEditComment,
  onDeleteComment,
}: TaskDetailPanelProps) {
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [statusChanging, setStatusChanging] = useState(false);

  const allMembers = selfIdentity
    ? [{ identity: selfIdentity, name: memberNames?.[selfIdentity] || shortenId(selfIdentity) }, ...members.map((m) => ({ identity: m.identity, name: memberNames?.[m.identity] || m.name || shortenId(m.identity) }))]
    : members.map((m) => ({ identity: m.identity, name: memberNames?.[m.identity] || m.name || shortenId(m.identity) }));

  const memberLabel = (id: string) => memberNames?.[id] || shortenId(id);

  const handleStatusChange = async (status: Status) => {
    if (statusChanging || status === task.status) return;
    setStatusChanging(true);
    try { await onUpdateStatus(status); } finally { setStatusChanging(false); }
  };

  const handleAssign = async (identity: string) => {
    await onAssign(task.id, identity);
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      await onAddComment(newComment.trim());
      setNewComment('');
    } finally { setSubmittingComment(false); }
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!editBody.trim()) return;
    await onEditComment(commentId, editBody.trim());
    setEditingId(null);
  };

  return (
    <Backdrop onClick={onClose}>
      <Panel onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <PanelHeader>
          <PriorityBadge $priority={task.priority}>{task.priority}</PriorityBadge>
          <CloseBtn onClick={onClose} aria-label="Close">×</CloseBtn>
        </PanelHeader>

        <PanelBody>
          <TaskTitle>{task.title}</TaskTitle>
          {task.description && <TaskDesc>{task.description}</TaskDesc>}

          <Meta>
            <MetaRow>
              <MetaLabel>Created by</MetaLabel>
              <MetaValue>{memberLabel(task.created_by)}</MetaValue>
            </MetaRow>
            <MetaRow>
              <MetaLabel>Assignee</MetaLabel>
              <AssignSelect
                value={task.assignee || ''}
                onChange={(e) => e.target.value && handleAssign(e.target.value)}
              >
                <option value="">Unassigned</option>
                {allMembers.map((m) => (
                  <option key={m.identity} value={m.identity}>{m.name}</option>
                ))}
              </AssignSelect>
            </MetaRow>
          </Meta>

          {/* Status switcher */}
          <SectionLabel>Status</SectionLabel>
          <StatusRow>
            {STATUSES.map((s) => (
              <StatusBtn
                key={s.value}
                $active={task.status === s.value}
                onClick={() => handleStatusChange(s.value)}
                disabled={statusChanging}
                type="button"
              >
                {s.label}
              </StatusBtn>
            ))}
          </StatusRow>

          {/* Comments */}
          <SectionLabel style={{ marginTop: 20 }}>
            Comments {commentsLoading ? '…' : `(${comments.length})`}
          </SectionLabel>

          <CommentList>
            {comments.length === 0 && !commentsLoading && (
              <EmptyComments>No comments yet. Be the first to add one.</EmptyComments>
            )}
            {comments.map((c) => {
              const isMine = c.author === selfIdentity;
              const isEditing = editingId === c.id;
              return (
                <CommentItem key={c.id}>
                  <CommentAvatar>{memberLabel(c.author).charAt(0).toUpperCase()}</CommentAvatar>
                  <CommentContent>
                    <CommentMeta>
                      <strong>{memberLabel(c.author)}</strong>
                      <time>{new Date(c.created_at).toLocaleString()}</time>
                    </CommentMeta>
                    {isEditing ? (
                      <EditRow>
                        <textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={2}
                          autoFocus
                        />
                        <EditActions>
                          <SmallBtn onClick={() => handleSaveEdit(c.id)}>Save</SmallBtn>
                          <SmallBtn $ghost onClick={() => setEditingId(null)}>Cancel</SmallBtn>
                        </EditActions>
                      </EditRow>
                    ) : (
                      <>
                        <CommentBody>{c.body}</CommentBody>
                        {isMine && (
                          <CommentActions>
                            <ActionLink onClick={() => { setEditingId(c.id); setEditBody(c.body); }}>Edit</ActionLink>
                            <ActionLink $danger onClick={() => onDeleteComment(c.id)}>Delete</ActionLink>
                          </CommentActions>
                        )}
                      </>
                    )}
                  </CommentContent>
                </CommentItem>
              );
            })}
          </CommentList>

          {/* Add comment */}
          <CommentInputRow>
            <CommentTextarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment(); }}
              placeholder="Add a comment… (Ctrl+Enter to submit)"
              rows={2}
              disabled={submittingComment}
            />
            <SendBtn
              onClick={handleAddComment}
              disabled={submittingComment || !newComment.trim()}
              type="button"
            >
              {submittingComment ? '…' : 'Post'}
            </SendBtn>
          </CommentInputRow>
        </PanelBody>
      </Panel>
    </Backdrop>
  );
}

/* ── animations ── */
const slideIn = keyframes`from{transform:translateX(100%);opacity:0;}to{transform:none;opacity:1;}`;

/* ── styles ── */
const Backdrop = styled.div`
  position: fixed; inset: 0; z-index: 150;
  background: rgba(14,20,15,0.3); backdrop-filter: blur(2px);
  display: flex; justify-content: flex-end;
`;
const Panel = styled.div`
  width: min(500px, 100vw);
  height: 100%;
  background: ${C.paper};
  border-left: 1px solid ${C.line};
  display: flex; flex-direction: column;
  box-shadow: -20px 0 60px -20px rgba(14,20,15,0.3);
  animation: ${slideIn} 0.24s cubic-bezier(0.22,1,0.36,1) both;
  overflow: hidden;
`;
const PanelHeader = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid ${C.line}; flex-shrink: 0;
`;
const CloseBtn = styled.button`
  width: 30px; height: 30px; display: grid; place-items: center;
  font-size: 20px; color: ${C.mutedSoft}; background: transparent; border: none;
  border-radius: 8px; cursor: pointer; transition: background 0.15s, color 0.15s;
  &:hover { background: ${C.paper2}; color: ${C.ink}; }
`;
const PanelBody = styled.div`
  flex: 1; overflow-y: auto; padding: 20px 20px 28px;
`;
const TaskTitle = styled.h2`
  font-size: 20px; font-weight: 800; letter-spacing: -0.5px;
  color: ${C.ink}; margin: 0 0 10px; line-height: 1.3; word-break: break-word;
`;
const TaskDesc = styled.p`
  font-size: 14px; color: ${C.muted}; line-height: 1.6; margin: 0 0 16px;
`;
const Meta = styled.div`
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 12px;
  padding: 14px 16px; margin-bottom: 18px; display: flex; flex-direction: column; gap: 10px;
`;
const MetaRow = styled.div`display: flex; align-items: center; gap: 12px;`;
const MetaLabel = styled.span`
  font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  color: ${C.mutedSoft}; width: 80px; flex-shrink: 0;
`;
const MetaValue = styled.span`font-size: 13.5px; color: ${C.ink}; font-weight: 500;`;
const AssignSelect = styled.select`
  font-size: 13.5px; color: ${C.ink}; font-weight: 500;
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 8px;
  padding: 5px 10px; cursor: pointer; outline: none;
  &:focus { border-color: ${C.green}; }
`;
const SectionLabel = styled.div`
  font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
  color: ${C.mutedSoft}; margin-bottom: 8px;
`;
const StatusRow = styled.div`display: flex; gap: 6px;`;
const StatusBtn = styled.button<{ $active: boolean }>`
  flex: 1; padding: 8px 6px; font-size: 12px; font-weight: 600; border-radius: 9px;
  cursor: pointer; border: 1.5px solid transparent;
  background: ${(p) => p.$active ? 'rgba(164,255,17,0.16)' : C.paper2};
  color: ${(p) => p.$active ? C.greenInk : C.muted};
  border-color: ${(p) => p.$active ? 'rgba(164,255,17,0.5)' : 'transparent'};
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  &:hover:not(:disabled) { background: rgba(164,255,17,0.1); color: ${C.greenInk}; }
  &:disabled { opacity: 0.6; cursor: default; }
`;
const PriorityBadge = styled.span<{ $priority: string }>`
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  padding: 3px 10px; border-radius: 999px;
  background: ${(p) => priorityBg(p.$priority)};
  color: ${(p) => priorityColor(p.$priority)};
  border: 1px solid ${(p) => priorityBorder(p.$priority)};
`;
const CommentList = styled.div`display: flex; flex-direction: column; gap: 14px; margin-top: 6px;`;
const EmptyComments = styled.div`
  font-size: 13px; color: ${C.mutedSoft}; text-align: center; padding: 18px 0;
`;
const CommentItem = styled.div`display: flex; gap: 10px; align-items: flex-start;`;
const CommentAvatar = styled.div`
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
  display: grid; place-items: center; font-size: 12px; font-weight: 700;
  color: ${C.onAccent}; background: ${C.green}; border: none;
`;
const CommentContent = styled.div`flex: 1; min-width: 0;`;
const CommentMeta = styled.div`
  display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
  strong { font-size: 13px; color: ${C.ink}; }
  time { font-size: 11px; color: ${C.mutedSoft}; }
`;
const CommentBody = styled.p`
  font-size: 13.5px; color: ${C.ink}; line-height: 1.5; margin: 0;
  word-break: break-word;
`;
const CommentActions = styled.div`display: flex; gap: 10px; margin-top: 4px;`;
const ActionLink = styled.button<{ $danger?: boolean }>`
  font-size: 12px; font-weight: 600; background: none; border: none; cursor: pointer;
  color: ${(p) => p.$danger ? C.danger : C.greenDeep}; padding: 2px 0;
  transition: opacity 0.15s;
  &:hover { opacity: 0.75; }
`;
const EditRow = styled.div`display: flex; flex-direction: column; gap: 8px;
  textarea {
    width: 100%; padding: 9px 11px; font-size: 13.5px; font-family: inherit;
    color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
    border-radius: 9px; outline: none; resize: vertical;
    &:focus { border-color: ${C.green}; }
  }
`;
const EditActions = styled.div`display: flex; gap: 8px;`;
const SmallBtn = styled.button<{ $ghost?: boolean }>`
  padding: 6px 14px; font-size: 12.5px; font-weight: 600; border-radius: 8px; cursor: pointer;
  background: ${(p) => p.$ghost ? C.paper : C.green};
  color: ${(p) => p.$ghost ? C.ink : C.onAccent};
  border: 1px solid ${(p) => p.$ghost ? C.line : '#93e60c'};
  transition: background 0.15s;
  &:hover { background: ${(p) => p.$ghost ? C.paper2 : C.greenHover}; }
`;
const CommentInputRow = styled.div`
  display: flex; flex-direction: column; gap: 8px; margin-top: 16px;
`;
const CommentTextarea = styled.textarea`
  width: 100%; padding: 11px 13px; font-size: 13.5px; font-family: inherit;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  border-radius: 10px; outline: none; resize: vertical;
  transition: border-color 0.18s, box-shadow 0.18s;
  &::placeholder { color: ${C.mutedSoft}; }
  &:focus { border-color: ${C.green}; box-shadow: 0 0 0 4px rgba(164,255,17,0.14); }
  &:disabled { opacity: 0.6; }
`;
const SendBtn = styled.button`
  align-self: flex-end; padding: 9px 20px; font-size: 13.5px; font-weight: 600;
  border-radius: 10px; cursor: pointer;
  color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c;
  transition: background 0.15s, box-shadow 0.18s, transform 0.14s;
  &:hover:not(:disabled) { background: ${C.greenHover}; box-shadow: 0 6px 18px rgba(164,255,17,0.35); transform: translateY(-1px); }
  &:disabled { opacity: 0.6; cursor: default; }
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
