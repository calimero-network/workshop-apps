import React, { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { C } from '../theme';
import { DEFAULT_WORKSPACE_NAME } from '../config';

interface CreateWorkspaceModalProps {
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
}


export default function CreateWorkspaceModal({ onCreate, onClose }: CreateWorkspaceModalProps) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  // Esc closes the modal (unless a create is in-flight).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !creating) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [creating, onClose]);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await onCreate(name.trim() || DEFAULT_WORKSPACE_NAME);
      onClose();
    } catch (err) {
      console.error('Failed to create workspace:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Overlay onClick={() => !creating && onClose()}>
      <Dialog onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cw-title">
        <Close onClick={() => !creating && onClose()} aria-label="Close">×</Close>

        <IconBadge aria-hidden>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.greenInk} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="14" rx="2.5" />
            <path d="M3 9h18" />
            <path d="M12 12.5v3M10.5 14h3" />
          </svg>
        </IconBadge>

        <h3 id="cw-title">New workspace</h3>
        <p className="sub">Name your workspace — you can invite teammates and create rooms after it's created.</p>

        <Field>
          <label htmlFor="cw-name">Workspace name</label>
          <input
            id="cw-name"
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="e.g. Design Team"
            disabled={creating}
          />
        </Field>

        <Actions>
          <SecondaryBtn onClick={onClose} disabled={creating}>Cancel</SecondaryBtn>
          <PrimaryBtn onClick={handleCreate} disabled={creating}>
            {creating ? <Spin /> : 'Create workspace'}
          </PrimaryBtn>
        </Actions>
      </Dialog>
    </Overlay>
  );
}

/* ── animations ── */
const fadeIn = keyframes`from{opacity:0;}to{opacity:1;}`;
const pop = keyframes`from{opacity:0;transform:translateY(10px) scale(0.97);}to{opacity:1;transform:none;}`;
const spin = keyframes`to{transform:rotate(360deg);}`;

/* ── styles ── */
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(14, 20, 15, 0.45);
  backdrop-filter: blur(4px);
  animation: ${fadeIn} 0.18s ease both;
`;
const Dialog = styled.div`
  position: relative;
  width: 100%;
  max-width: 420px;
  background: ${C.paper};
  border: 1px solid ${C.line};
  border-radius: 18px;
  padding: 28px 26px 24px;
  box-shadow: 0 40px 90px -40px rgba(14, 20, 15, 0.5);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  animation: ${pop} 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
  h3 { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: ${C.ink}; margin: 0 0 8px; }
  .sub { font-size: 13.5px; line-height: 1.55; color: ${C.muted}; margin: 0; }
`;
const Close = styled.button`
  position: absolute;
  top: 14px; right: 14px;
  width: 30px; height: 30px;
  display: grid; place-items: center;
  font-size: 20px; line-height: 1;
  color: ${C.mutedSoft};
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  &:hover { background: ${C.paper2}; color: ${C.ink}; }
`;
const IconBadge = styled.div`
  width: 48px; height: 48px;
  margin-bottom: 16px;
  display: grid; place-items: center;
  border-radius: 14px;
  background: ${C.greenSoft};
  border: 1px solid ${C.greenBorder};
`;
const Field = styled.div`
  margin: 20px 0 22px;
  label { display: block; font-size: 12px; font-weight: 600; color: ${C.muted}; margin-bottom: 7px; }
  input {
    width: 100%;
    padding: 12px 14px;
    font-size: 14px;
    color: ${C.ink};
    background: ${C.paper};
    border: 1px solid ${C.line};
    border-radius: 11px;
    outline: none;
    transition: border-color 0.18s, box-shadow 0.18s;
    &::placeholder { color: ${C.mutedSoft}; }
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 4px ${C.greenRing}; }
    &:disabled { opacity: 0.6; }
  }
`;
const Actions = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
`;
const btn = `
  padding: 11px 18px;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: -0.1px;
  border-radius: 11px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.2s, background 0.18s, border-color 0.18s;
  &:disabled { opacity: 0.6; cursor: default; }
`;
const SecondaryBtn = styled.button`
  ${btn}
  color: ${C.ink};
  background: ${C.paper};
  border: 1px solid ${C.line};
  &:hover:not(:disabled) { background: ${C.paper2}; border-color: ${C.lineDark}; }
`;
const PrimaryBtn = styled.button`
  ${btn}
  min-width: 150px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${C.onAccent};
  background: ${C.green};
  border: 1px solid #93e60c;
  &:hover:not(:disabled) { background: ${C.greenHover}; box-shadow: 0 10px 28px rgba(164, 255, 17, 0.4); transform: translateY(-1px); }
`;
const Spin = styled.span`
  width: 15px; height: 15px;
  border: 2px solid rgba(14, 20, 15, 0.3);
  border-top-color: ${C.onAccent};
  border-radius: 50%;
  animation: ${spin} 0.6s linear infinite;
`;
