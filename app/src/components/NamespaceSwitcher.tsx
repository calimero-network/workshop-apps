import React, { useState } from 'react';
import styled from 'styled-components';
import type { Namespace } from '@calimero-network/mero-react';
import { C } from '../theme';
import { focusRing, tapTarget } from './primitives';
import NamespaceCreateModal from './NamespaceCreateModal';

interface Props {
  namespaces: Namespace[];
  activeNamespaceId: string | null;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onJoin: () => void;
}

export default function NamespaceSwitcher({
  namespaces,
  activeNamespaceId,
  onSwitch,
  onCreate,
  onJoin,
}: Props): React.ReactElement {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <Wrap>
      <select
        data-testid="ns-switcher"
        aria-label="Switch workspace"
        value={activeNamespaceId ?? ''}
        onChange={(e) => { if (e.target.value) onSwitch(e.target.value); }}
      >
        {namespaces.length === 0 && <option value="">No workspace</option>}
        {namespaces.map((n) => (
          <option key={n.namespaceId} value={n.namespaceId}>
            {n.name || n.namespaceId.slice(0, 8)}
          </option>
        ))}
      </select>
      <IconBtn data-testid="ns-create-btn" title="New workspace" aria-label="New workspace" onClick={() => setShowCreate(true)}>+</IconBtn>
      <IconBtn data-testid="ns-join-btn" title="Join workspace" aria-label="Join workspace" onClick={onJoin}>↧</IconBtn>
      {showCreate && (
        <NamespaceCreateModal onCreate={onCreate} onClose={() => setShowCreate(false)} />
      )}
    </Wrap>
  );
}

const Wrap = styled.div`
  display: inline-flex; align-items: center; gap: var(--c-space-2); min-width: 0;
  select {
    max-width: 200px; min-width: 0;
    padding: var(--c-space-2) var(--c-space-3);
    font-family: inherit; font-size: var(--c-text-base); font-weight: 600;
    color: ${C.ink}; background: ${C.paper2};
    border: 1px solid ${C.line}; border-radius: var(--c-radius-sm); outline: none; cursor: pointer;
    ${focusRing}
  }
`;
const IconBtn = styled.button`
  ${tapTarget}
  width: 30px; height: 30px; flex: 0 0 auto;
  display: grid; place-items: center; font-size: var(--c-text-base); line-height: 1;
  color: ${C.muted}; background: ${C.paper}; border: 1px solid ${C.line};
  border-radius: var(--c-radius-sm); cursor: pointer;
  transition: background var(--c-duration-fast) var(--c-ease), border-color var(--c-duration-fast) var(--c-ease);
  &:hover { background: ${C.paper2}; border-color: ${C.lineAccent}; color: ${C.ink}; }
  ${focusRing}
`;
