import React, { useState } from 'react';
import styled from 'styled-components';
import { useGroupMembers, useRemoveGroupMembers, useDefaultCapabilities, useSetDefaultCapabilities } from '@calimero-network/mero-react';
import { C } from '../theme';
import MemberRow from './MemberRow';
import CapabilityPresetSelect from './CapabilityPresetSelect';
import InviteModal from './InviteModal';
import { useWorkspaceInvite } from '../hooks/useWorkspace';

interface Props {
  namespaceId: string | null;
  selfIdentity: string | null;
  selfRole: string | null;
  isAdmin: boolean;
  onChanged: () => void;
}

export default function MembersPanel({ namespaceId, selfIdentity, selfRole, isAdmin, onChanged }: Props): React.ReactElement {
  const { members, selfIdentity: rosterSelf, refetch } = useGroupMembers(namespaceId);
  const { removeGroupMembers } = useRemoveGroupMembers();
  const { defaultCapabilities, refetch: refetchDefaults } = useDefaultCapabilities(namespaceId);
  const { setDefaultCapabilities } = useSetDefaultCapabilities();
  const invite = useWorkspaceInvite(namespaceId);
  const [showInvite, setShowInvite] = useState(false);

  // The roster API returns ALL members including the caller (that's why it also
  // returns selfIdentity). Render self exactly once via the dedicated row -
  // never as a plain entry, whose manage controls would let you remove yourself.
  const selfKey = selfIdentity ?? rosterSelf;
  const others = selfKey ? members.filter((m) => m.identity !== selfKey) : members;
  const memberCount = others.length + (selfKey ? 1 : 0);

  const remove = async (identity: string) => {
    if (!namespaceId) return;
    await removeGroupMembers(namespaceId, { members: [identity] });
    await refetch();
    onChanged();
  };

  const setDefaults = async (mask: number) => {
    if (!namespaceId) return;
    await setDefaultCapabilities(namespaceId, { defaultCapabilities: mask });
    await refetchDefaults();
  };

  return (
    <Wrap data-testid="members-panel">
      <Head>
        <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
        <Invite data-testid="members-invite-btn" onClick={() => setShowInvite(true)}>Invite</Invite>
      </Head>
      <List>
        {selfKey && (
          <MemberRow namespaceId={namespaceId ?? ''} identity={selfKey} role={selfRole ?? undefined} isSelf canManage={false} onRemove={remove} />
        )}
        {others.map((m) => (
          <MemberRow key={m.identity} namespaceId={namespaceId ?? ''} identity={m.identity} role={m.role} isSelf={false} canManage={isAdmin} onRemove={remove} />
        ))}
      </List>
      {isAdmin && (
        <Defaults data-testid="member-defaults">
          <label>New members get</label>
          <CapabilityPresetSelect
            value={defaultCapabilities}
            onChange={(m) => void setDefaults(m)}
            ariaLabel="Default permissions for new members"
          />
        </Defaults>
      )}
      {showInvite && namespaceId && (
        <InviteModal onInvite={invite} onClose={() => setShowInvite(false)} />
      )}
    </Wrap>
  );
}

const Wrap = styled.div``;
const Head = styled.div`
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;
  font-size: 13px; color: ${C.muted};
`;
const Invite = styled.button`
  padding: 6px 12px; font-size: 12.5px; font-weight: 600; border-radius: 8px; cursor: pointer;
  color: ${C.accentInk}; background: ${C.accent}; border: 1px solid var(--c-accent);
  &:hover { filter: brightness(1.06); box-shadow: 0 10px 28px color-mix(in srgb, var(--c-accent) 40%, transparent); }
`;
const List = styled.ul`list-style: none; margin: 8px 0 0; padding: 0;`;
const Defaults = styled.div`
  display: flex; align-items: center; gap: 10px; margin-top: 14px;
  label { font-size: 12.5px; color: ${C.muted}; }
`;
