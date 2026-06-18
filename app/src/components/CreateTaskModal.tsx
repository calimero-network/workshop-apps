import React, { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { C } from '../theme';

const PRIORITIES = ['low', 'medium', 'high'] as const;
type Priority = typeof PRIORITIES[number];

interface CreateTaskModalProps {
  onSubmit: (title: string, description: string, priority: string) => Promise<void>;
  onClose: () => void;
  defaultStatus?: string;
}

export default function CreateTaskModal({ onSubmit, onClose, defaultStatus }: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submitting, onClose]);

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Task title is required.'); return; }
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(title.trim(), description.trim(), priority);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Overlay onClick={() => !submitting && onClose()}>
      <Dialog onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ct-title">
        <Close onClick={() => !submitting && onClose()} aria-label="Close">×</Close>

        <IconBadge aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.greenInk} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="M12 8v8M8 12h8" />
          </svg>
        </IconBadge>

        <h3 id="ct-title">New task{defaultStatus ? ` · ${columnLabel(defaultStatus)}` : ''}</h3>
        <p className="sub">Fill in the details to add a task to the board.</p>

        <Field>
          <label htmlFor="ct-title-input">Title <Req>*</Req></label>
          <input
            id="ct-title-input"
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="e.g. Fix login bug"
            disabled={submitting}
            maxLength={120}
          />
        </Field>

        <Field>
          <label htmlFor="ct-desc">Description</label>
          <textarea
            id="ct-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional details..."
            disabled={submitting}
            rows={3}
          />
        </Field>

        <Field>
          <label>Priority</label>
          <PriorityRow>
            {PRIORITIES.map((p) => (
              <PillBtn
                key={p}
                $active={priority === p}
                $priority={p}
                type="button"
                onClick={() => setPriority(p)}
                disabled={submitting}
              >
                {p}
              </PillBtn>
            ))}
          </PriorityRow>
        </Field>

        {error && <ErrorMsg>{error}</ErrorMsg>}

        <Actions>
          <SecondaryBtn onClick={onClose} disabled={submitting}>Cancel</SecondaryBtn>
          <PrimaryBtn onClick={handleSubmit} disabled={submitting || !title.trim()}>
            {submitting ? <Spin /> : 'Create task'}
          </PrimaryBtn>
        </Actions>
      </Dialog>
    </Overlay>
  );
}

function columnLabel(status: string): string {
  if (status === 'in_progress') return 'In Progress';
  if (status === 'done') return 'Done';
  return 'To Do';
}

/* ── animations ── */
const fadeIn = keyframes`from{opacity:0;}to{opacity:1;}`;
const pop = keyframes`from{opacity:0;transform:translateY(10px) scale(0.97);}to{opacity:1;transform:none;}`;
const spin = keyframes`to{transform:rotate(360deg);}`;

/* ── styles ── */
const Overlay = styled.div`
  position: fixed; inset: 0; z-index: 200;
  display: flex; align-items: center; justify-content: center; padding: 20px;
  background: rgba(14,20,15,0.45); backdrop-filter: blur(4px);
  animation: ${fadeIn} 0.18s ease both;
`;
const Dialog = styled.div`
  position: relative; width: 100%; max-width: 440px;
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 18px;
  padding: 28px 26px 24px; box-shadow: 0 40px 90px -40px rgba(14,20,15,0.5);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  animation: ${pop} 0.22s cubic-bezier(0.22,1,0.36,1) both;
  h3 { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: ${C.ink}; margin: 0 0 8px; }
  .sub { font-size: 13.5px; line-height: 1.55; color: ${C.muted}; margin: 0; }
`;
const Close = styled.button`
  position: absolute; top: 14px; right: 14px;
  width: 30px; height: 30px; display: grid; place-items: center;
  font-size: 20px; color: ${C.mutedSoft}; background: transparent; border: none;
  border-radius: 8px; cursor: pointer; transition: background 0.15s, color 0.15s;
  &:hover { background: ${C.paper2}; color: ${C.ink}; }
`;
const IconBadge = styled.div`
  width: 48px; height: 48px; margin-bottom: 16px;
  display: grid; place-items: center; border-radius: 14px;
  background: rgba(164,255,17,0.16); border: 1px solid rgba(164,255,17,0.4);
`;
const Req = styled.span`color: ${C.danger};`;
const Field = styled.div`
  margin: 16px 0 0;
  label { display: block; font-size: 12px; font-weight: 600; color: ${C.muted}; margin-bottom: 6px; }
  input, textarea {
    width: 100%; padding: 11px 13px; font-size: 14px; color: ${C.ink};
    background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 10px;
    outline: none; font-family: inherit; resize: vertical;
    transition: border-color 0.18s, box-shadow 0.18s;
    &::placeholder { color: ${C.mutedSoft}; }
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 4px rgba(164,255,17,0.18); }
    &:disabled { opacity: 0.6; }
  }
`;
const PriorityRow = styled.div`display: flex; gap: 8px;`;
const PillBtn = styled.button<{ $active: boolean; $priority: string }>`
  flex: 1; padding: 8px 10px; font-size: 12.5px; font-weight: 600; border-radius: 9px;
  cursor: pointer; text-transform: capitalize; border: 1.5px solid transparent;
  transition: background 0.15s, border-color 0.15s, transform 0.14s;
  background: ${(p) => p.$active ? priorityBg(p.$priority) : C.paper2};
  color: ${(p) => p.$active ? priorityColor(p.$priority) : C.muted};
  border-color: ${(p) => p.$active ? priorityBorder(p.$priority) : 'transparent'};
  &:hover:not(:disabled) { transform: translateY(-1px); background: ${(p) => priorityBg(p.$priority)}; color: ${(p) => priorityColor(p.$priority)}; }
  &:disabled { opacity: 0.6; cursor: default; }
`;
const ErrorMsg = styled.p`
  margin: 12px 0 0; font-size: 13px; color: ${C.danger};
`;
const Actions = styled.div`display: flex; gap: 10px; justify-content: flex-end; margin-top: 22px;`;
const btn = `
  padding: 11px 18px; font-size: 13.5px; font-weight: 600; border-radius: 11px; cursor: pointer;
  transition: transform 0.15s, box-shadow 0.2s, background 0.18s, border-color 0.18s;
  &:disabled { opacity: 0.6; cursor: default; }
`;
const SecondaryBtn = styled.button`
  ${btn} color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  &:hover:not(:disabled) { background: ${C.paper2}; border-color: ${C.lineDark}; }
`;
const PrimaryBtn = styled.button`
  ${btn} min-width: 130px; display: inline-flex; align-items: center; justify-content: center;
  color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c;
  &:hover:not(:disabled) { background: ${C.greenHover}; box-shadow: 0 10px 28px rgba(164,255,17,0.4); transform: translateY(-1px); }
`;
const Spin = styled.span`
  width: 15px; height: 15px; border: 2px solid rgba(14,20,15,0.3);
  border-top-color: ${C.onAccent}; border-radius: 50%;
  animation: ${spin} 0.6s linear infinite;
`;

function priorityBg(p: string) {
  if (p === 'high') return 'rgba(239,68,68,0.12)';
  if (p === 'medium') return 'rgba(245,158,11,0.14)';
  return 'rgba(59,130,246,0.12)';
}
function priorityColor(p: string) {
  if (p === 'high') return '#dc2626';
  if (p === 'medium') return '#d97706';
  return '#2563eb';
}
function priorityBorder(p: string) {
  if (p === 'high') return 'rgba(239,68,68,0.35)';
  if (p === 'medium') return 'rgba(245,158,11,0.35)';
  return 'rgba(59,130,246,0.3)';
}
