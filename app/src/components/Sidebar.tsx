import React from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import type { LobbyRecord } from '../hooks/useChatLobby';

const MAX_NAME_LEN = 20;

interface SidebarProps {
  // Club (workspace) selector
  workspaces: LobbyRecord[];
  selectedNamespaceId: string | null;
  onSelectWorkspace: (nsId: string) => void;
  onCreateWorkspace: () => void;
  workspaceAlias?: string;

  // Member directory
  members: GroupMember[];
  selfIdentity: string | null;
  onlineMembers: Set<string>;
  memberNames: Record<string, string>;
  onSetName: (name: string) => Promise<void>;

  // Actions
  onInvite: () => void;
  activeView: 'feed' | 'settings';
  onSelectView: (v: 'feed' | 'settings') => void;
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
  onlineMembers,
  memberNames,
  onInvite,
  activeView,
  onSelectView,
}: SidebarProps) {
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
      {/* Club header */}
      <div style={{ padding: '1rem', borderBottom: '1px solid #1e293b' }}>
        <h2 style={{
          fontSize: '1rem', fontWeight: 700,
          color: 'var(--color-primary, #E11D48)',
          marginBottom: '0.2rem',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {workspaceAlias || 'Workout Club'}
        </h2>
        <span style={{ color: '#64748b', fontSize: '0.78rem' }}>
          {members.length + (selfIdentity ? 1 : 0)} member{(members.length + (selfIdentity ? 1 : 0)) !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Navigation */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b' }}>
        {[
          { id: 'feed' as const, label: '🏋️  Activity Feed' },
          { id: 'settings' as const, label: '⚙️  Club Settings' },
        ].map((item) => (
          <div
            key={item.id}
            onClick={() => onSelectView(item.id)}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.84rem',
              fontWeight: activeView === item.id ? 700 : 400,
              background: activeView === item.id ? 'rgba(225,29,72,0.12)' : 'transparent',
              color: activeView === item.id ? 'var(--color-primary, #E11D48)' : '#94a3b8',
              marginBottom: 2,
            }}
          >
            {item.label}
          </div>
        ))}
      </div>

      {/* Club list (always visible) */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.25rem', paddingLeft: '0.25rem' }}>
          YOUR CLUBS
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
                ? 'rgba(225,29,72,0.12)'
                : 'transparent',
              color: ws.namespaceId === selectedNamespaceId ? 'var(--color-primary, #E11D48)' : '#94a3b8',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
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
          title="Create a new club"
        >
          + New club
        </div>
      </div>

      {/* Members */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', borderBottom: '1px solid #1e293b' }}>
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
              background: 'var(--color-accent, #F59E0B)',
              flexShrink: 0,
            }} />
            <span style={{ color: '#e2e8f0', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {memberNames[selfIdentity] || shortenId(selfIdentity)}&nbsp;
              <span style={{ color: '#475569', fontSize: '0.72rem' }}>(you)</span>
            </span>
          </div>
        )}

        {/* Other members */}
        {members.map((m) => {
          const online = onlineMembers.has(m.identity);
          return (
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
                background: online ? 'var(--color-accent, #F59E0B)' : '#334155',
                flexShrink: 0,
              }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {renderMemberLabel(m.identity, m.name)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Invite button */}
      <div style={{ padding: '0.5rem' }}>
        <button
          onClick={onInvite}
          style={{
            width: '100%',
            padding: '0.45rem',
            background: 'var(--color-accent, #F59E0B)',
            color: '#0f172a',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.82rem',
            fontWeight: 700,
          }}
        >
          Invite to Club
        </button>
      </div>
    </div>
  );
}
