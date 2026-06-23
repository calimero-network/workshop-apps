import React, { useState } from 'react';
import styled from 'styled-components';
import { C } from '../theme';

interface ManageStagesModalProps {
  currentStages: string[];
  onSave: (stages: string[]) => Promise<void>;
  onClose: () => void;
}

export default function ManageStagesModal({ currentStages, onSave, onClose }: ManageStagesModalProps) {
  const [stages, setStages] = useState<string[]>(currentStages.length > 0 ? [...currentStages] : ['New', 'Contacted', 'Proposal', 'Won', 'Lost']);
  const [newStage, setNewStage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addStage = () => {
    const trimmed = newStage.trim();
    if (!trimmed) return;
    if (stages.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      setError('Stage already exists.');
      return;
    }
    setStages((prev) => [...prev, trimmed]);
    setNewStage('');
    setError(null);
  };

  const removeStage = (idx: number) => {
    setStages((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setStages((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveDown = (idx: number) => {
    setStages((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  const handleSave = async () => {
    if (stages.length === 0) { setError('Add at least one stage.'); return; }
    setLoading(true);
    setError(null);
    try {
      await onSave(stages);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save stages.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Overlay onClick={(e) => e.target === e.currentTarget && onClose()}>
      <Dialog>
        <DialogHeader>
          <h2>Manage Pipeline Stages</h2>
          <CloseBtn onClick={onClose} aria-label="Close">✕</CloseBtn>
        </DialogHeader>
        <Body>
          <Hint>Drag or use arrows to reorder. All team members will see the updated stages within 5 s.</Hint>
          <StageList>
            {stages.map((stage, idx) => (
              <StageItem key={`${stage}-${idx}`}>
                <span className="label">{stage}</span>
                <div className="actions">
                  <ArrowBtn onClick={() => moveUp(idx)} disabled={idx === 0} title="Move up">▲</ArrowBtn>
                  <ArrowBtn onClick={() => moveDown(idx)} disabled={idx === stages.length - 1} title="Move down">▼</ArrowBtn>
                  <RemoveBtn onClick={() => removeStage(idx)} title="Remove stage">✕</RemoveBtn>
                </div>
              </StageItem>
            ))}
          </StageList>
          <AddRow>
            <input
              type="text"
              placeholder="New stage name…"
              value={newStage}
              onChange={(e) => setNewStage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addStage()}
              maxLength={40}
            />
            <AddBtn type="button" onClick={addStage}>+ Add</AddBtn>
          </AddRow>
          {error && <ErrorMsg>{error}</ErrorMsg>}
        </Body>
        <Actions>
          <CancelBtn onClick={onClose} disabled={loading}>Cancel</CancelBtn>
          <SaveBtn onClick={handleSave} disabled={loading}>
            {loading ? 'Saving…' : 'Save Stages'}
          </SaveBtn>
        </Actions>
      </Dialog>
    </Overlay>
  );
}

const Overlay = styled.div`
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
`;
const Dialog = styled.div`
  width: 100%; max-width: 440px;
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 16px;
  box-shadow: 0 20px 60px -20px rgba(0,0,0,0.5);
  display: flex; flex-direction: column;
`;
const DialogHeader = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 22px 0;
  h2 { font-size: 17px; font-weight: 700; color: ${C.ink}; margin: 0; letter-spacing: -0.3px; }
`;
const CloseBtn = styled.button`
  width: 28px; height: 28px; border-radius: 8px; border: 1px solid ${C.line};
  background: transparent; color: ${C.muted}; cursor: pointer; font-size: 13px;
  display: grid; place-items: center;
  &:hover { background: ${C.paper2}; color: ${C.ink}; }
`;
const Body = styled.div`padding: 16px 22px 0;`;
const Hint = styled.p`font-size: 12.5px; color: ${C.mutedSoft}; margin: 0 0 14px;`;
const StageList = styled.div`
  display: flex; flex-direction: column; gap: 6px;
  max-height: 280px; overflow-y: auto;
  margin-bottom: 12px;
`;
const StageItem = styled.div`
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 9px; background: ${C.paper2};
  border: 1px solid ${C.line};
  .label { flex: 1; font-size: 13.5px; font-weight: 600; color: ${C.ink}; }
  .actions { display: flex; gap: 4px; }
`;
const ArrowBtn = styled.button`
  width: 24px; height: 24px; border-radius: 6px; border: 1px solid ${C.line};
  background: ${C.paper}; color: ${C.muted}; cursor: pointer; font-size: 9px;
  display: grid; place-items: center;
  &:hover:not(:disabled) { background: ${C.paper2}; color: ${C.ink}; }
  &:disabled { opacity: 0.35; cursor: not-allowed; }
`;
const RemoveBtn = styled.button`
  width: 24px; height: 24px; border-radius: 6px; border: 1px solid transparent;
  background: transparent; color: ${C.mutedSoft}; cursor: pointer; font-size: 10px;
  display: grid; place-items: center;
  &:hover { background: rgba(210,59,47,0.08); color: ${C.danger}; }
`;
const AddRow = styled.div`
  display: flex; gap: 8px;
  input {
    flex: 1; padding: 8px 12px; border-radius: 9px;
    border: 1px solid ${C.line}; background: ${C.paper};
    color: ${C.ink}; font-size: 13.5px; outline: none;
    &:focus { border-color: var(--color-primary, #2563EB); box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
    &::placeholder { color: ${C.mutedSoft}; }
  }
`;
const AddBtn = styled.button`
  padding: 8px 14px; border-radius: 9px; border: 1px solid ${C.line};
  background: ${C.paper2}; color: ${C.ink}; font-size: 13px; font-weight: 600;
  cursor: pointer;
  &:hover { background: ${C.paper}; border-color: var(--color-primary, #2563EB); color: var(--color-primary, #2563EB); }
`;
const ErrorMsg = styled.p`
  margin: 8px 0 0; font-size: 12.5px; color: ${C.danger};
`;
const Actions = styled.div`
  display: flex; gap: 8px; justify-content: flex-end;
  padding: 16px 22px 20px;
`;
const baseBtn = `
  padding: 9px 18px; border-radius: 9px; font-size: 13.5px; font-weight: 600;
  cursor: pointer; transition: background 0.15s, border-color 0.15s, transform 0.12s;
  &:disabled { opacity: 0.55; cursor: not-allowed; }
`;
const CancelBtn = styled.button`
  ${baseBtn}
  background: ${C.paper}; border: 1px solid ${C.line}; color: ${C.muted};
  &:hover:not(:disabled) { background: ${C.paper2}; }
`;
const SaveBtn = styled.button`
  ${baseBtn}
  background: var(--color-primary, #2563EB); border: 1px solid var(--color-primary, #2563EB);
  color: #fff;
  &:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
`;
