import React, { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { C } from '../theme';

interface Props {
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
}

export default function NamespaceCreateModal({ onCreate, onClose }: Props) {
  const [name, setName] = useState('My workspace');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(trimmed);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create workspace.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay onClick={() => !busy && onClose()}>
      <Dialog onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ns-create-title">
        <h3 id="ns-create-title">New workspace</h3>
        <p className="sub">Name your workspace. You can invite others once it's created.</p>
        <input
          data-testid="ns-name-input"
          autoFocus
          value={name}
          maxLength={64}
          disabled={busy}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          aria-label="Workspace name"
        />
        {error && <ErrLine>{error}</ErrLine>}
        <Actions>
          <Secondary onClick={onClose} disabled={busy}>Cancel</Secondary>
          <Primary data-testid="ns-create-submit" onClick={() => void submit()} disabled={!name.trim() || busy}>
            {busy ? 'Creating…' : 'Create'}
          </Primary>
        </Actions>
      </Dialog>
    </Overlay>
  );
}

const fadeIn = keyframes`from{opacity:0;}to{opacity:1;}`;
const Overlay = styled.div`
  position: fixed; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center; padding: 20px;
  background: rgba(14,20,15,0.45); backdrop-filter: blur(4px);
  animation: ${fadeIn} 0.18s ease both;
`;
const Dialog = styled.div`
  width: 100%; max-width: 420px;
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 18px;
  padding: 26px 24px 22px; box-shadow: 0 40px 90px -40px rgba(14,20,15,0.5);
  h3 { font-size: 19px; font-weight: 800; letter-spacing: -0.4px; color: ${C.ink}; margin: 0 0 6px; }
  .sub { font-size: 13px; color: ${C.muted}; margin: 0 0 16px; line-height: 1.5; }
  input {
    width: 100%; padding: 10px 12px; font-size: 14px;
    color: ${C.ink}; background: ${C.paper2}; border: 1px solid ${C.line};
    border-radius: 10px; outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
    &:disabled { opacity: 0.6; }
  }
`;
const Actions = styled.div`display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px;`;
const Primary = styled.button`
  padding: 10px 18px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c;
  &:hover:not(:disabled) { background: ${C.greenHover}; }
  &:disabled { opacity: 0.55; cursor: default; }
`;
const Secondary = styled.button`
  padding: 10px 16px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  &:hover:not(:disabled) { background: ${C.paper2}; border-color: ${C.green}; }
  &:disabled { opacity: 0.55; cursor: default; }
`;
const ErrLine = styled.p`margin: 12px 0 0; font-size: 12.5px; color: ${C.danger};`;
