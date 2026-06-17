import React, { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { C } from '../theme';

interface AddHabitModalProps {
  onSubmit: (title: string) => Promise<void>;
  onClose: () => void;
}

export default function AddHabitModal({ onSubmit, onClose }: AddHabitModalProps) {
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !creating) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [creating, onClose]);

  const handleSubmit = async () => {
    if (!title.trim() || creating) return;
    setCreating(true);
    try {
      await onSubmit(title.trim());
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <Overlay onClick={() => !creating && onClose()}>
      <Dialog onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ah-title">
        <Close onClick={() => !creating && onClose()} aria-label="Close">&times;</Close>

        <IconBadge aria-hidden>&#127919;</IconBadge>

        <h3 id="ah-title">Add a Habit</h3>
        <p className="sub">Commit to a daily habit and start building your streak. Everyone on the board can see it.</p>

        <Field>
          <label htmlFor="ah-title-input">Habit title</label>
          <input
            id="ah-title-input"
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="e.g. Morning run, Read 20 pages, Meditate&hellip;"
            disabled={creating}
            maxLength={80}
          />
        </Field>

        <Actions>
          <SecondaryBtn onClick={onClose} disabled={creating}>Cancel</SecondaryBtn>
          <PrimaryBtn onClick={handleSubmit} disabled={!title.trim() || creating}>
            {creating ? <Spin /> : 'Add Habit'}
          </PrimaryBtn>
        </Actions>
      </Dialog>
    </Overlay>
  );
}

const fadeIn = keyframes`from{opacity:0;}to{opacity:1;}`;
const pop = keyframes`from{opacity:0;transform:translateY(10px) scale(0.97);}to{opacity:1;transform:none;}`;
const spin = keyframes`to{transform:rotate(360deg);}`;

const Overlay = styled.div`
  position: fixed; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  background: rgba(14, 20, 15, 0.45);
  backdrop-filter: blur(4px);
  animation: ${fadeIn} 0.18s ease both;
`;
const Dialog = styled.div`
  position: relative;
  width: 100%; max-width: 440px;
  background: ${C.paper};
  border: 1px solid ${C.line};
  border-radius: 18px;
  padding: 28px 26px 24px;
  box-shadow: 0 40px 90px -40px rgba(14,20,15,0.5);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  animation: ${pop} 0.22s cubic-bezier(0.22,1,0.36,1) both;
  h3 { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: ${C.ink}; margin: 0 0 8px; }
  .sub { font-size: 13.5px; line-height: 1.55; color: ${C.muted}; margin: 0; }
`;
const Close = styled.button`
  position: absolute; top: 14px; right: 14px;
  width: 30px; height: 30px;
  display: grid; place-items: center;
  font-size: 20px; line-height: 1;
  color: ${C.mutedSoft}; background: transparent; border: none; border-radius: 8px; cursor: pointer;
  transition: background 0.15s, color 0.15s;
  &:hover { background: ${C.paper2}; color: ${C.ink}; }
`;
const IconBadge = styled.div`
  font-size: 36px;
  margin-bottom: 16px;
  line-height: 1;
`;
const Field = styled.div`
  margin-top: 20px;
  & > label { display: block; font-size: 12px; font-weight: 600; color: ${C.muted}; margin-bottom: 7px; }
  input[type='text'] {
    width: 100%; padding: 12px 14px; font-size: 14px;
    color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 11px; outline: none;
    box-sizing: border-box;
    transition: border-color 0.18s, box-shadow 0.18s;
    &::placeholder { color: ${C.mutedSoft}; }
    &:focus { border-color: var(--color-primary, #F59E0B); box-shadow: 0 0 0 4px rgba(245,158,11,0.15); }
    &:disabled { opacity: 0.6; }
  }
`;
const Actions = styled.div`
  display: flex; gap: 10px; justify-content: flex-end; margin-top: 24px;
`;
const btn = `
  padding: 11px 18px; font-size: 13.5px; font-weight: 600; letter-spacing: -0.1px;
  border-radius: 11px; cursor: pointer;
  transition: transform 0.15s, box-shadow 0.2s, background 0.18s, border-color 0.18s;
  &:disabled { opacity: 0.6; cursor: default; }
`;
const SecondaryBtn = styled.button`
  ${btn}
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  &:hover:not(:disabled) { background: ${C.paper2}; border-color: ${C.lineDark}; }
`;
const PrimaryBtn = styled.button`
  ${btn}
  min-width: 130px; display: inline-flex; align-items: center; justify-content: center;
  color: white; background: var(--color-primary, #F59E0B); border: 1px solid var(--color-primary, #F59E0B);
  &:hover:not(:disabled) { opacity: 0.88; box-shadow: 0 10px 28px rgba(245,158,11,0.35); transform: translateY(-1px); }
`;
const Spin = styled.span`
  width: 15px; height: 15px;
  border: 2px solid rgba(255,255,255,0.3); border-top-color: white;
  border-radius: 50%; animation: ${spin} 0.6s linear infinite;
`;
