import React, { useState } from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import type { UseWorkspaceReturn } from '../hooks/useWorkspace';
import { describeError } from '../utils/errors';

interface Props {
  ws: UseWorkspaceReturn;
}

/**
 * SCAFFOLD-OWNED sibling-unit rail. Reskinned for Splitwise-clone: a "unit" is
 * an expense GROUP (e.g. "Bali trip", "Flatmates") — keeps the list +
 * create-unit testids mounted so the multi e2e stories can drive unit
 * management.
 */
export default function UnitRail({ ws }: Props): React.ReactElement {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  // Only surface ws.error once a create was actually attempted here - the shared
  // error state is also written by bootstrap/join, so showing it on mere form-open
  // would leak a stale error from an unrelated workflow.
  const [attempted, setAttempted] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setAttempted(true);
    const id = await ws.createUnit(trimmed);
    if (id) { setName(''); setCreating(false); setAttempted(false); }
  };

  return (
    <Rail data-testid="unit-rail">
      <Head>
        <span className="title">Groups</span>
        <AddBtn data-testid="create-unit-btn" aria-label="New group" onClick={() => { setCreating((v) => !v); setAttempted(false); }}>+</AddBtn>
      </Head>
      {creating && (
        <CreateForm onSubmit={submit}>
          <input
            data-testid="field-unit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bali trip"
            maxLength={64}
            aria-label="Group name"
          />
          <button data-testid="unit-create-submit" type="submit" disabled={!name.trim() || ws.createUnitLoading}>
            {ws.createUnitLoading ? '...' : 'Add'}
          </button>
        </CreateForm>
      )}
      {creating && attempted && ws.error && <ErrLine role="alert">{describeError(ws.error)}</ErrLine>}
      <List>
        {ws.units.length === 0 && !ws.unitsLoading && <Empty>No groups yet — create one to start splitting.</Empty>}
        {ws.units.map((u) => (
          <UnitBtn
            key={u.contextId}
            data-testid="unit-list-item"
            $active={u.contextId === ws.activeUnitId}
            onClick={() => ws.selectUnit(u.contextId)}
            title={u.name}
          >
            <span className="dot" aria-hidden="true" />
            <span className="name">{u.name}</span>
          </UnitBtn>
        ))}
      </List>
    </Rail>
  );
}

const Rail = styled.aside`
  width: 220px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px;
  padding: 12px; border-right: 1px solid ${C.line};
  @media (max-width: 640px) { width: 100%; border-right: none; border-bottom: 1px solid ${C.line}; }
`;
const Head = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  .title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: ${C.muted}; }
`;
const AddBtn = styled.button`
  width: 26px; height: 26px; border-radius: 8px; font-size: 18px; line-height: 1; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  &:hover { border-color: ${C.green}; background: ${C.paper2}; }
`;
const CreateForm = styled.form`
  display: flex; gap: 6px;
  input { flex: 1; min-width: 0; padding: 7px 9px; font-size: 13px; color: ${C.ink}; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 8px; outline: none; &:focus { border-color: ${C.green}; } }
  button { padding: 7px 10px; font-size: 12px; font-weight: 600; border-radius: 8px; cursor: pointer; color: ${C.accentInk}; background: ${C.accent}; border: 1px solid var(--c-accent); &:disabled { opacity: 0.55; cursor: default; } }
`;
const List = styled.div`display: flex; flex-direction: column; gap: 4px;`;
const Empty = styled.p`font-size: 12.5px; color: ${C.mutedSoft}; padding: 6px 2px;`;
const ErrLine = styled.p`margin: 0; font-size: 13px; color: ${C.danger};`;
const UnitBtn = styled.button<{ $active: boolean }>`
  display: flex; align-items: center; gap: 8px; text-align: left; width: 100%;
  padding: 8px 10px; border-radius: 8px; cursor: pointer; font-size: 13px;
  color: ${(p) => (p.$active ? C.ink : C.muted)};
  background: ${(p) => (p.$active ? C.paper2 : 'transparent')};
  border: 1px solid ${(p) => (p.$active ? C.line : 'transparent')};
  &:hover { background: ${C.paper2}; }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: ${(p) => (p.$active ? C.green : C.mutedSoft)}; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
