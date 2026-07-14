import React, { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { C } from '../../theme';
import type { Category, Comment, Priority, Task } from './types';
import { PRIORITIES } from './types';

/**
 * TaskDetailView — spec's second frontend view.
 *
 * Shell pass: purely presentational. All mutation callbacks are provided by
 * the parent (AppPage) and currently just update local mock state — a later
 * pass rewires them to the generated AbiClient's assign_task / set_priority /
 * move_task / complete_task / archive_task / add_comment / edit_comment /
 * delete_comment methods. The testids below are the real contract and won't
 * change when that wiring lands.
 */
interface TaskDetailModalProps {
  task: Task;
  categories: Category[];
  comments: Comment[];
  currentUser: string;
  onClose: () => void;
  onAssign: (assignee: string) => void;
  onSetPriority: (priority: Priority) => void;
  onMove: (categoryId: string) => void;
  onComplete: () => void;
  onArchive: () => void;
  onAddComment: (body: string, prLink: string | null) => void;
  onEditComment: (commentId: string, body: string) => void;
  onDeleteComment: (commentId: string) => void;
}

export default function TaskDetailModal({
  task,
  categories,
  comments,
  currentUser,
  onClose,
  onAssign,
  onSetPriority,
  onMove,
  onComplete,
  onArchive,
  onAddComment,
  onEditComment,
  onDeleteComment,
}: TaskDetailModalProps) {
  const [assignee, setAssignee] = useState(task.assignee);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [categoryId, setCategoryId] = useState(task.category_id);
  const [body, setBody] = useState('');
  const [prLink, setPrLink] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  useEffect(() => { setAssignee(task.assignee); }, [task.assignee]);
  useEffect(() => { setPriority(task.priority); }, [task.priority]);
  useEffect(() => { setCategoryId(task.category_id); }, [task.category_id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    onAddComment(body.trim(), prLink.trim() || null);
    setBody('');
    setPrLink('');
  };

  const startEdit = (c: Comment) => { setEditingId(c.id); setEditBody(c.body); };
  const saveEdit = (id: string) => {
    if (!editBody.trim()) return;
    onEditComment(id, editBody.trim());
    setEditingId(null);
  };

  return (
    <Overlay onClick={onClose}>
      <Dialog onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="task-title">
        <Close onClick={onClose} aria-label="Close">×</Close>

        <Header>
          <span className={`badge status-${task.status}`}>{task.status}</span>
          <h3 id="task-title">{task.title}</h3>
          {task.description && <p className="desc">{task.description}</p>}
        </Header>

        <Controls>
          <Field>
            <label htmlFor="detail-assignee">Assignee</label>
            <Row>
              <input
                id="detail-assignee"
                data-testid="field-assignee"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="Assign to…"
              />
              <SmallBtn
                data-testid="action-assign_task"
                disabled={!assignee.trim() || assignee === task.assignee}
                onClick={() => onAssign(assignee.trim())}
              >
                Assign
              </SmallBtn>
            </Row>
          </Field>

          <Field>
            <label htmlFor="detail-priority">Priority</label>
            <Row>
              <select
                id="detail-priority"
                data-testid="field-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <SmallBtn
                data-testid="action-set_priority"
                disabled={priority === task.priority}
                onClick={() => onSetPriority(priority)}
              >
                Update
              </SmallBtn>
            </Row>
          </Field>

          <Field>
            <label htmlFor="detail-category">Category</label>
            <Row>
              <select
                id="detail-category"
                data-testid="field-category_id"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <SmallBtn
                data-testid="action-move_task"
                disabled={categoryId === task.category_id}
                onClick={() => onMove(categoryId)}
              >
                Move
              </SmallBtn>
            </Row>
          </Field>
        </Controls>

        <Actions>
          <SecondaryBtn data-testid="action-complete_task" disabled={task.status === 'completed'} onClick={onComplete}>
            Mark complete
          </SecondaryBtn>
          <DangerBtn data-testid="action-archive_task" onClick={onArchive}>
            Archive
          </DangerBtn>
        </Actions>

        <Thread>
          <h4>Discussion</h4>
          {comments.length === 0 && <Hint>No comments yet.</Hint>}
          {comments.map((c) => (
            <CommentRow key={c.id} data-testid={`item-comment-${c.id}`}>
              <div className="meta">
                <strong>{c.author}</strong>
                {c.author === currentUser && editingId !== c.id && (
                  <span className="ops">
                    <button data-testid="action-edit_comment" onClick={() => startEdit(c)}>Edit</button>
                    <button data-testid="action-delete_comment" onClick={() => onDeleteComment(c.id)}>Delete</button>
                  </span>
                )}
              </div>
              {editingId === c.id ? (
                <EditRow>
                  <input value={editBody} onChange={(e) => setEditBody(e.target.value)} />
                  <SmallBtn onClick={() => saveEdit(c.id)} disabled={!editBody.trim()}>Save</SmallBtn>
                  <SmallBtn onClick={() => setEditingId(null)}>Cancel</SmallBtn>
                </EditRow>
              ) : (
                <p className="body">{c.body}</p>
              )}
              {c.pr_link && (
                <a className="pr" href={c.pr_link} target="_blank" rel="noreferrer">🔗 {c.pr_link}</a>
              )}
            </CommentRow>
          ))}

          <CommentForm onSubmit={submitComment}>
            <input
              data-testid="field-body"
              placeholder="Add a comment…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <input
              data-testid="field-pr_link"
              placeholder="PR link (optional)"
              value={prLink}
              onChange={(e) => setPrLink(e.target.value)}
            />
            <PrimaryBtn data-testid="action-add_comment" type="submit" disabled={!body.trim()}>
              Comment
            </PrimaryBtn>
          </CommentForm>
        </Thread>
      </Dialog>
    </Overlay>
  );
}

const fadeIn = keyframes`from{opacity:0;}to{opacity:1;}`;
const pop = keyframes`from{opacity:0;transform:translateY(10px) scale(0.97);}to{opacity:1;transform:none;}`;

const Overlay = styled.div`
  position: fixed; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center; padding: 20px;
  background: rgba(14,20,15,0.45); backdrop-filter: blur(4px);
  animation: ${fadeIn} 0.18s ease both;
`;
const Dialog = styled.div`
  position: relative; width: 100%; max-width: 560px; max-height: 86vh; overflow-y: auto;
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 18px;
  padding: 28px 26px 24px; box-shadow: 0 40px 90px -40px rgba(14,20,15,0.5);
  animation: ${pop} 0.22s cubic-bezier(0.22,1,0.36,1) both;
`;
const Close = styled.button`
  position: absolute; top: 14px; right: 14px; width: 30px; height: 30px;
  display: grid; place-items: center; font-size: 20px; line-height: 1;
  color: ${C.mutedSoft}; background: transparent; border: none; border-radius: 8px; cursor: pointer;
  &:hover { background: ${C.paper2}; color: ${C.ink}; }
`;
const Header = styled.div`
  padding-right: 30px;
  .badge {
    display: inline-block; font-size: 10.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.05em; padding: 3px 9px; border-radius: 999px; margin-bottom: 10px;
    background: ${C.paper2}; color: ${C.muted}; border: 1px solid ${C.line};
  }
  .badge.status-completed { background: rgba(164,255,17,0.16); color: ${C.greenInk}; border-color: ${C.green}; }
  h3 { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; color: ${C.ink}; margin-bottom: 6px; }
  .desc { font-size: 13.5px; color: ${C.muted}; line-height: 1.5; }
`;
const Controls = styled.div`display: flex; flex-direction: column; gap: 14px; margin: 20px 0;`;
const Field = styled.div`
  label { display: block; font-size: 11.5px; font-weight: 600; color: ${C.muted}; margin-bottom: 6px; }
`;
const Row = styled.div`
  display: flex; gap: 8px;
  input, select {
    flex: 1; padding: 9px 11px; font-size: 13.5px; color: ${C.ink}; background: ${C.paper2};
    border: 1px solid ${C.line}; border-radius: 9px; outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
  }
`;
const Actions = styled.div`display: flex; gap: 10px; margin-bottom: 20px;`;
const Thread = styled.div`
  border-top: 1px solid ${C.line}; padding-top: 18px;
  h4 { font-size: 13px; font-weight: 700; color: ${C.ink}; margin-bottom: 12px; }
`;
const Hint = styled.p`font-size: 13px; color: ${C.mutedSoft}; margin-bottom: 12px;`;
const CommentRow = styled.div`
  padding: 10px 0; border-bottom: 1px solid ${C.line};
  .meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .meta strong { font-size: 12.5px; color: ${C.ink}; }
  .ops { display: flex; gap: 10px; }
  .ops button { background: none; border: none; font-size: 11.5px; color: ${C.muted}; cursor: pointer; padding: 0; }
  .ops button:hover { color: ${C.green}; text-decoration: underline; }
  .body { font-size: 13.5px; color: ${C.ink}; line-height: 1.5; }
  .pr { display: inline-block; margin-top: 6px; font-size: 12px; color: ${C.greenInk}; text-decoration: none; word-break: break-all; }
  .pr:hover { text-decoration: underline; }
`;
const EditRow = styled.div`
  display: flex; gap: 6px;
  input { flex: 1; padding: 6px 9px; font-size: 13px; border: 1px solid ${C.line}; border-radius: 7px; outline: none; }
`;
const CommentForm = styled.form`
  display: flex; flex-direction: column; gap: 8px; margin-top: 16px;
  input {
    padding: 9px 11px; font-size: 13.5px; color: ${C.ink}; background: ${C.paper2};
    border: 1px solid ${C.line}; border-radius: 9px; outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
  }
`;

const btnBase = `
  padding: 9px 15px; font-size: 12.5px; font-weight: 600; border-radius: 9px; cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
  &:disabled { opacity: 0.55; cursor: default; }
`;
const SmallBtn = styled.button`
  ${btnBase}
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  &:hover:not(:disabled) { border-color: ${C.green}; }
`;
const SecondaryBtn = styled.button`
  ${btnBase}
  color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c;
  &:hover:not(:disabled) { background: ${C.greenHover}; transform: translateY(-1px); }
`;
const DangerBtn = styled.button`
  ${btnBase}
  color: ${C.danger}; background: ${C.paper}; border: 1px solid ${C.line};
  &:hover:not(:disabled) { border-color: ${C.danger}; }
`;
const PrimaryBtn = styled.button`
  ${btnBase}
  color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c;
  &:hover:not(:disabled) { background: ${C.greenHover}; transform: translateY(-1px); }
`;
