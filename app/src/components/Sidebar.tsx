import React from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import type { WorkspaceRecord } from '../hooks/useCounterWorkspace';

interface SidebarProps {
  // Workspace selector
  workspaces: WorkspaceRecord[];
  selectedNamespaceId: string | null;
  onSelectWorkspace: (nsId: string) => void;
  onCreateWorkspace: () => void;
  workspaceAlias?: string;

  // Member directory
  members: GroupMember[];
  selfIdentity: string | null;

  // Actions
  onInvite: () => void;
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

export default function Sidebar({
  workspaces,
  selectedNamespaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  workspaceAlias,
  members,
  selfIdentity,
  onInvite,
}: SidebarProps) {
  const totalMembers = members.length + (selfIdentity ? 1 : 0);

  return (
    <div style={{
      width: 240,
      borderRight: '1px solid #1e293b',
      display: 'flex',
      flexDirection: 'column',
      background: '#0f172a',
    }}>
      {/* Workspace header */}
      <div style={{ padding: '1rem', borderBottom: '1px solid #1e293b' }}>
        <h2 style={{
          fontSize: '1rem',
          fontWeight: 700,
          color: 'var(--color-primary, #3B82F6)',
          marginBottom: '0.2rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {workspaceAlias || 'shared-counter'}
        </h2>
        <span style={{ color: '#64748b', fontSize: '0.78rem' }}>
          {totalMembers} member{totalMembers !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Workspace list — always visible */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.25rem', paddingLeft: '0.25rem' }}>
          WORKSPACES
        </div>
        {workspaces.map((ws) => (
          <div
            key={ws.namespaceId}
            onClick={() => onSelectWorkspace(ws.namespaceId)}
            style={{
              padding: '0.35rem 0.6rem',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.82rem',
              background: ws.namespaceId === selectedNamespaceId
                ? 'rgba(59,130,246,0.15)'
                : 'transparent',
              color: ws.namespaceId === selectedNamespaceId ? '#93c5fd' : '#94a3b8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {ws.alias || shortenId(ws.namespaceId)}
          </div>
        ))}
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
          title="Create a new workspace"
        >
          + New workspace
        </div>
      </div>

      {/* Members */}
      <div style={{ flex: 1, padding: '0.5rem', overflowY: 'auto' }}>
        <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.4rem', paddingLeft: '0.25rem' }}>
          MEMBERS
        </div>

        {/* Self */}
        {selfIdentity && (
          <div style={{
            padding: '0.35rem 0.6rem',
            borderRadius: 6,
            marginBottom: 2,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--color-accent, #10B981)',
              flexShrink: 0,
            }} />
            <span style={{
              flex: 1,
              minWidth: 0,
              color: '#e2e8f0',
              fontSize: '0.82rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {shortenId(selfIdentity)} (you)
            </span>
          </div>
        )}

        {/* Other members */}
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
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#475569',
              flexShrink: 0,
            }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.alias || shortenId(m.identity)}
            </span>
          </div>
        ))}
      </div>

      {/* Invite action */}
      <div style={{ padding: '0.5rem', borderTop: '1px solid #1e293b' }}>
        <button
          onClick={onInvite}
          style={{
            width: '100%',
            padding: '0.4rem',
            background: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #334155',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          Invite member
        </button>
      </div>
    </div>
  );
}

