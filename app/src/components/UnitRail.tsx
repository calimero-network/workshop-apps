import React, { useState } from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import { ErrLine, NARROW, focusRing, tapTarget } from './primitives';
import type { UseWorkspaceReturn } from '../hooks/useWorkspace';
import { describeError } from '../utils/errors';

interface Props {
  ws: UseWorkspaceReturn;
}

/**
 * SCAFFOLD-OWNED sibling-unit rail. The build agent reskins copy/labels (a
 * "unit" is a board, project, trip, ...) but keeps the list + create-unit
 * testids mounted so the multi e2e stories can drive unit management.
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
    // The group service's init(name) takes the group's display name as its
    // sole param — pass it alongside the context label so the backend's
    // GroupInfo.name is seeded from what the user actually typed.
    const id = await ws.createUnit(trimmed, { name: trimmed });
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
            placeholder="Group name"
            maxLength={64}
            aria-label="Group name"
          />
          <button data-testid="unit-create-submit" type="submit" disabled={!name.trim() || ws.createUnitLoading}>
            {ws.createUnitLoading ? '...' : 'Add'}
          </button>
        </CreateForm>
      )}
      {creating && attempted && ws.error && <ErrorLine role="alert">{describeError(ws.error)}</ErrorLine>}
      <List>
        {ws.units.length === 0 && !ws.unitsLoading && <Empty>No groups yet.</Empty>}
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
  width: var(--c-app-rail); flex-shrink: 0;
  display: flex; flex-direction: column; gap: var(--c-space-3);
  padding: var(--c-space-3); border-right: 1px solid ${C.line};
  @media ${NARROW} { width: 100%; border-right: none; border-bottom: 1px solid ${C.line}; }
`;
const Head = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  .title {
    font-size: var(--c-text-xs); font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.8px; color: ${C.muted};
  }
`;
const AddBtn = styled.button`
  ${tapTarget}
  width: 26px; height: 26px; border-radius: var(--c-radius-sm);
  font-size: var(--c-text-lg); line-height: 1; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  transition: background var(--c-duration-fast) var(--c-ease), border-color var(--c-duration-fast) var(--c-ease);
  &:hover { border-color: ${C.lineAccent}; background: ${C.paper2}; }
  ${focusRing}
`;
const CreateForm = styled.form`
  display: flex; gap: var(--c-space-2);
  input {
    flex: 1; min-width: 0;
    padding: var(--c-space-2) var(--c-space-2);
    font-family: inherit; font-size: var(--c-text-base);
    color: ${C.ink}; background: ${C.paper2};
    border: 1px solid ${C.line}; border-radius: var(--c-radius-sm); outline: none;
    ${focusRing}
  }
`;
const List = styled.div`display: flex; flex-direction: column; gap: var(--c-space-1);`;
const Empty = styled.p`font-size: var(--c-text-sm); color: ${C.mutedSoft}; padding: var(--c-space-2) 0;`;
const ErrorLine = styled(ErrLine)`margin: 0;`;
const UnitBtn = styled.button<{ $active: boolean }>`
  display: flex; align-items: center; gap: var(--c-space-2); text-align: left; width: 100%;
  padding: var(--c-space-2) var(--c-space-3); border-radius: var(--c-radius-sm);
  cursor: pointer; font-size: var(--c-text-base);
  color: ${(p) => (p.$active ? C.ink : C.muted)};
  background: ${(p) => (p.$active ? C.paper2 : 'transparent')};
  border: 1px solid ${(p) => (p.$active ? C.line : 'transparent')};
  transition: background var(--c-duration-fast) var(--c-ease);
  &:hover { background: ${C.paper2}; }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: ${(p) => (p.$active ? C.green : C.mutedSoft)}; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${focusRing}
`;
