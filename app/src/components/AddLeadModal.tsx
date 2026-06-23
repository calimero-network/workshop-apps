import React, { useState } from 'react';
import styled from 'styled-components';
import { C } from '../theme';

interface AddLeadModalProps {
  onAdd: (name: string, company: string, value: number) => Promise<void>;
  onClose: () => void;
}

export default function AddLeadModal({ onAdd, onClose }: AddLeadModalProps) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [valueStr, setValueStr] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedCompany = company.trim();
    const value = parseFloat(valueStr.replace(/[^0-9.]/g, ''));

    if (!trimmedName) { setError('Lead name is required.'); return; }
    if (!trimmedCompany) { setError('Company is required.'); return; }
    if (isNaN(value) || value < 0) { setError('Enter a valid deal value.'); return; }

    setLoading(true);
    setError(null);
    try {
      await onAdd(trimmedName, trimmedCompany, Math.round(value));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add lead.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Overlay onClick={(e) => e.target === e.currentTarget && onClose()}>
      <Dialog>
        <DialogHeader>
          <h2>Add Lead</h2>
          <CloseBtn onClick={onClose} aria-label="Close">✕</CloseBtn>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Fields>
            <FieldGroup>
              <label htmlFor="lead-name">Lead / Contact Name</label>
              <input
                id="lead-name"
                type="text"
                placeholder="e.g. Sarah Chen"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                autoFocus
              />
            </FieldGroup>
            <FieldGroup>
              <label htmlFor="lead-company">Company</label>
              <input
                id="lead-company"
                type="text"
                placeholder="e.g. Acme Corp"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                maxLength={80}
              />
            </FieldGroup>
            <FieldGroup>
              <label htmlFor="lead-value">Estimated Deal Value ($)</label>
              <input
                id="lead-value"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 25000"
                value={valueStr}
                onChange={(e) => setValueStr(e.target.value)}
              />
            </FieldGroup>
          </Fields>
          {error && <ErrorMsg>{error}</ErrorMsg>}
          <Actions>
            <CancelBtn type="button" onClick={onClose} disabled={loading}>Cancel</CancelBtn>
            <SubmitBtn type="submit" disabled={loading}>
              {loading ? 'Adding…' : 'Add Lead'}
            </SubmitBtn>
          </Actions>
        </form>
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
  overflow: hidden;
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
const Fields = styled.div`
  display: flex; flex-direction: column; gap: 14px;
  padding: 20px 22px 0;
`;
const FieldGroup = styled.div`
  display: flex; flex-direction: column; gap: 5px;
  label { font-size: 12px; font-weight: 600; color: ${C.muted}; }
  input {
    padding: 9px 12px; border-radius: 9px;
    border: 1px solid ${C.line}; background: ${C.paper};
    color: ${C.ink}; font-size: 14px;
    outline: none; transition: border-color 0.15s, box-shadow 0.15s;
    &:focus { border-color: var(--color-primary, #2563EB); box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
    &::placeholder { color: ${C.mutedSoft}; }
  }
`;
const ErrorMsg = styled.p`
  margin: 10px 22px 0; font-size: 12.5px; color: ${C.danger};
`;
const Actions = styled.div`
  display: flex; gap: 8px; justify-content: flex-end;
  padding: 18px 22px 20px;
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
const SubmitBtn = styled.button`
  ${baseBtn}
  background: var(--color-primary, #2563EB); border: 1px solid var(--color-primary, #2563EB);
  color: #fff;
  &:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
`;
