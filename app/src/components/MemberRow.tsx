import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useGroupCapabilities, useUpdateMemberRole } from '@calimero-network/mero-react';
import { C } from '../theme';
import { ErrLine, tapTarget } from './primitives';
import { MemberLabel } from './MemberLabel';
import CapabilityPresetSelect from './CapabilityPresetSelect';

interface Props {
  namespaceId: string;
  identity: string;
  role?: string;
  isSelf: boolean;
  canManage: boolean;
  onRemove: (identity: string) => Promise<void>;
}

const ROLES = ['Admin', 'Member', 'ReadOnly'];

export default function MemberRow({ namespaceId, identity, role, isSelf, canManage, onRemove }: Props): React.ReactElement {
  const caps = useGroupCapabilities(namespaceId, identity);
  const { updateMemberRole } = useUpdateMemberRole();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState(role);
  useEffect(() => { setCurrentRole(role); }, [role]);

  const editable = canManage && !isSelf;

  const changeRole = async (nextRole: string) => {
    setBusy(true); setError(null);
    try {
      await updateMemberRole(namespaceId, identity, { role: nextRole });
      setCurrentRole(nextRole);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const changeCaps = async (mask: number) => {
    setBusy(true); setError(null);
    try {
      await caps.setCapabilities(mask);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true); setError(null);
    try {
      await onRemove(identity);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <Row data-testid="member-row">
      <div className="who">
        <MemberLabel memberId={identity} />
        {currentRole && <Tag>{currentRole}</Tag>}
      </div>
      {editable && (
        <div className="controls">
          <select
            data-testid="member-role-select"
            aria-label={`Role for ${identity.slice(0, 8)}`}
            value={currentRole ?? 'Member'}
            disabled={busy}
            onChange={(e) => void changeRole(e.target.value)}
          >
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {currentRole === 'Member' && (
            <CapabilityPresetSelect
              value={caps.capabilities}
              onChange={(m) => void changeCaps(m)}
              disabled={busy || caps.loading}
              ariaLabel={`Permissions for ${identity.slice(0, 8)}`}
            />
          )}
          <Remove data-testid="member-remove-btn" aria-label="Remove member" disabled={busy} onClick={() => void remove()}>×</Remove>
        </div>
      )}
      {error && <ErrorLine role="alert">{error}</ErrorLine>}
    </Row>
  );
}

const Row = styled.li`
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--c-space-3); flex-wrap: wrap;
  padding: var(--c-space-3) 0; border-bottom: 1px solid ${C.line};
  .who { display: flex; align-items: center; gap: var(--c-space-2); min-width: 0; }
  .controls { display: flex; align-items: center; gap: var(--c-space-2); }
  select {
    height: 30px; padding: 0 var(--c-space-2);
    font-family: inherit; font-size: var(--c-text-sm); font-weight: 600;
    color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
    border-radius: var(--c-radius-sm); cursor: pointer;
    &:disabled { opacity: 0.55; }
  }
`;
const Tag = styled.span`
  font-size: var(--c-text-xs); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700;
  padding: 2px var(--c-space-2); border-radius: var(--c-radius-pill);
  color: ${C.mutedSoft}; background: ${C.paper}; border: 1px solid ${C.line};
`;
const Remove = styled.button`
  ${tapTarget}
  width: 28px; height: 28px; font-size: var(--c-text-base); line-height: 1;
  color: ${C.mutedSoft}; background: transparent; border: 1px solid ${C.line};
  border-radius: var(--c-radius-sm); cursor: pointer;
  transition: color var(--c-duration-fast) var(--c-ease), border-color var(--c-duration-fast) var(--c-ease);
  &:hover:not(:disabled) { color: ${C.danger}; border-color: ${C.danger}; }
  &:disabled { opacity: 0.55; cursor: default; }
`;
const ErrorLine = styled(ErrLine)`width: 100%; margin: var(--c-space-1) 0 0;`;
