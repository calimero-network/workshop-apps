import React from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import type { LobbyRecord } from '../hooks/useChatLobby';

interface SidebarProps {
  // Workspace (board) selector
  workspaces: LobbyRecord[];
  selectedNamespaceId: string | null;
  onSelectWorkspace: (nsId: string) => void;
  onCreateWorkspace: () => void;
  workspaceAlias?: string;

  // Member directory
  members: GroupMember[];
  selfIdentity: string | null;
  /** user_ids of currently active collaborators (cursor seen recently). */
  activeUserIds: Set<string>;

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
  activeUserIds,
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
      flexShrink: 0,
    }}>
      {/* Board header */}
      <div style={{ padding: '1rem', borderBottom: '1px solid #1e293b' }}>
        <h2 style={{
          fontSize: '1rem',
          fontWeight: 700,
          color: 'var(--color-primary)',
          marginBottom: '0.2rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {workspaceAlias || 'Infinite Whiteboard'}
        </h2>
        <span style={{ color: '#64748b', fontSize: '0.78rem' }}>
          {totalMembers} collaborator{totalMembers !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Board list — always visible */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b' }}>
        <div style={{
          fontSize: '0.68rem',
          color: '#64748b',
          letterSpacing: '0.05em',
          marginBottom: '0.3rem',
          paddingLeft: '0.25rem',
        }}>
          BOARDS
        </div>
        {workspaces.map((ws) => {
          const isSelected = ws.namespaceId === selectedNamespaceId;
          return (
            <div
              key={ws.namespaceId}
              onClick={() => onSelectWorkspace(ws.namespaceId)}
              style={{
                padding: '0.35rem 0.6rem',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '0.82rem',
                background: isSelected ? 'rgba(124,58,237,0.15)' : 'transparent',
                color: isSelected ? 'var(--color-primary)' : '#94a3b8',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginBottom: 2,
                transition: 'background 0.1s',
              }}
              title={ws.namespaceId}
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
          title="Create a new board"
        >
          + New board
        </div>
      </div>

      {/* Collaborators */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
        <div style={{
          fontSize: '0.68rem',
          color: '#64748b',
          letterSpacing: '0.05em',
          marginBottom: '0.4rem',
          paddingLeft: '0.25rem',
        }}>
          COLLABORATORS
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
            color: '#e2e8f0',
            fontSize: '0.82rem',
          }}>
            {/* Self is always "active" */}
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--color-accent)',
              flexShrink: 0,
            }} />
            <span style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {shortenId(selfIdentity)} (you)
            </span>
          </div>
        )}

        {/* Other members */}
        {members.map((m) => {
          const active = activeUserIds.has(m.identity);
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
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: active ? 'var(--color-accent)' : '#475569',
                flexShrink: 0,
                transition: 'background 0.3s',
              }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.alias || shortenId(m.identity)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Invite */}
      <div style={{ padding: '0.5rem', borderTop: '1px solid #1e293b' }}>
        <button
          onClick={onInvite}
          style={{
            width: '100%',
            padding: '0.5rem',
            background: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #334155',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.82rem',
          }}
        >
          Invite collaborator
        </button>
      </div>
    </div>
  );
}
