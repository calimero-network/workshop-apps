import React, { useEffect, useState } from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import type { WorkspaceRecord } from '../hooks/useSoulWorkspace';

const MAX_NAME_LEN = 20;

interface SidebarProps {
  workspaces: WorkspaceRecord[];
  selectedNamespaceId: string | null;
  onSelectWorkspace: (nsId: string) => void;
  onCreateWorkspace: () => void;
  workspaceAlias?: string;

  members: GroupMember[];
  selfIdentity: string | null;
  memberNames: Record<string, string>;
  onSetName: (name: string) => Promise<void>;

  onInvite: () => void;
  onJoin: () => void;
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

/** Personal vault: only the owner (no other members). */
function getContextLabel(totalCount: number): string {
  return totalCount <= 1 ? 'Personal' : 'Team';
}

export default function Sidebar({
  workspaces,
  selectedNamespaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  workspaceAlias,
  members,
  selfIdentity,
  memberNames,
  onSetName,
  onInvite,
  onJoin,
}: SidebarProps) {
  const totalMemberCount = members.length + (selfIdentity ? 1 : 0);
  const isPersonal = totalMemberCount <= 1;

  // Editable display name for self
  const persistedName = (selfIdentity && memberNames[selfIdentity]) || '';
  const [draftName, setDraftName] = useState(persistedName);

  useEffect(() => { setDraftName(persistedName); }, [persistedName]);

  const commitName = async () => {
    const trimmed = draftName.trim().slice(0, MAX_NAME_LEN);
    setDraftName(trimmed);
    if (trimmed === persistedName) return;
    try { await onSetName(trimmed); } catch { /* keep draft */ }
  };

  const renderMemberLabel = (identity: string, alias?: string) =>
    memberNames[identity] || alias || shortenId(identity);

  return (
    <div style={{
      width: 260,
      borderRight: '1px solid #1e293b',
      display: 'flex',
      flexDirection: 'column',
      background: '#0f172a',
      flexShrink: 0,
    }}>
      {/* App header */}
      <div style={{ padding: '1rem', borderBottom: '1px solid #1e293b' }}>
        <h2 style={{
          margin: 0,
          fontSize: '1.1rem',
          fontWeight: 700,
          color: 'var(--color-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {workspaceAlias || 'My Vault'}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
          <span style={{
            fontSize: '0.68rem',
            background: isPersonal ? '#1e293b' : '#1e3a5f',
            color: isPersonal ? '#64748b' : '#93c5fd',
            padding: '0.1rem 0.45rem',
            borderRadius: 99,
          }}>
            {getContextLabel(totalMemberCount)}
          </span>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
            {totalMemberCount} member{totalMemberCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Context list (always visible) */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontSize: '0.68rem', color: '#64748b', marginBottom: '0.3rem', paddingLeft: '0.25rem', letterSpacing: '0.06em' }}>
          CONTEXTS
        </div>
        {workspaces.map((ws) => {
          const isSelected = ws.namespaceId === selectedNamespaceId;
          return (
            <div
              key={ws.namespaceId}
              onClick={() => onSelectWorkspace(ws.namespaceId)}
              data-testid={`context-item-${ws.alias || ws.namespaceId}`}
              style={{
                padding: '0.35rem 0.6rem',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '0.83rem',
                background: isSelected ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: isSelected ? '#93c5fd' : '#94a3b8',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginBottom: 2,
              }}
            >
              {ws.alias || shortenId(ws.namespaceId)}
            </div>
          );
        })}
        <div
          onClick={onCreateWorkspace}
          style={{
            padding: '0.35rem 0.6rem',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.78rem',
            color: '#64748b',
            marginTop: workspaces.length > 0 ? 2 : 0,
          }}
          title="Create a new vault or team space"
        >
          + New context
        </div>
        <div
          onClick={onJoin}
          style={{
            padding: '0.35rem 0.6rem',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.78rem',
            color: '#64748b',
          }}
          title="Join a context with an invitation"
        >
          + Join with invite
        </div>
      </div>

      {/* Members */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: '0.68rem', color: '#64748b', marginBottom: '0.4rem', paddingLeft: '0.25rem', letterSpacing: '0.06em' }}>
          MEMBERS
        </div>

        {/* Self — editable display name */}
        {selfIdentity && (
          <div style={{
            padding: '0.35rem 0.6rem',
            borderRadius: 6,
            marginBottom: 2,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-accent)', flexShrink: 0 }} />
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                if (e.key === 'Escape') { setDraftName(persistedName); (e.currentTarget as HTMLInputElement).blur(); }
              }}
              maxLength={MAX_NAME_LEN}
              placeholder={shortenId(selfIdentity)}
              style={{
                flex: 1,
                minWidth: 0,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#e2e8f0',
                fontSize: '0.82rem',
                padding: 0,
              }}
            />
          </div>
        )}

        {members.map((m) => (
          <div
            key={m.identity}
            style={{
              padding: '0.35rem 0.6rem',
              borderRadius: 6,
              marginBottom: 2,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#94a3b8',
              fontSize: '0.82rem',
            }}
            title={m.identity}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#475569', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {renderMemberLabel(m.identity, m.alias)}
            </span>
          </div>
        ))}
      </div>

      {/* Action: Invite */}
      <div style={{ padding: '0.5rem' }}>
        <button
          onClick={onInvite}
          style={{
            width: '100%',
            padding: '0.45rem',
            background: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #334155',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.82rem',
          }}
        >
          Invite to this context
        </button>
      </div>
    </div>
  );
}
