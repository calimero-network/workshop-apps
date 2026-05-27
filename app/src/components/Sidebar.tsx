import React, { useEffect, useState } from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import type { LobbyRecord } from '../hooks/useChatLobby';

const MAX_NAME_LEN = 20;

interface SidebarProps {
  // Workspace selector (each workspace = one memorial)
  workspaces: LobbyRecord[];
  selectedNamespaceId: string | null;
  onSelectWorkspace: (nsId: string) => void;
  onCreateWorkspace: () => void;
  workspaceAlias?: string;

  // Member directory
  members: GroupMember[];
  selfIdentity: string | null;

  onInvite: () => void;
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}\u2026${id.slice(-5)}`;
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
  // Editable display-name placeholder (identity alias only — no names service)
  const [draftAlias, setDraftAlias] = useState('');
  useEffect(() => { setDraftAlias(''); }, [selfIdentity]);

  return (
    <div style={{
      width: 260,
      borderRight: '1px solid rgba(107,76,154,0.25)',
      display: 'flex',
      flexDirection: 'column',
      background: '#0d0a12',
      color: '#e2d9f3',
    }}>
      {/* App header */}
      <div style={{
        padding: '1rem',
        borderBottom: '1px solid rgba(107,76,154,0.25)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.15rem',
      }}>
        <h1 style={{
          fontSize: '1rem',
          fontWeight: 700,
          color: 'var(--color-primary)',
          margin: 0,
        }}>
          Living Memorial
        </h1>
        {workspaceAlias && (
          <span style={{
            fontSize: '0.75rem',
            color: 'var(--color-accent)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {workspaceAlias}
          </span>
        )}
        <span style={{ color: '#6b5f8a', fontSize: '0.72rem' }}>
          {members.length + (selfIdentity ? 1 : 0)} contributor
          {members.length + (selfIdentity ? 1 : 0) !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Memorial (workspace) list */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid rgba(107,76,154,0.2)' }}>
        <div style={{
          fontSize: '0.68rem',
          color: '#6b5f8a',
          marginBottom: '0.3rem',
          paddingLeft: '0.25rem',
          letterSpacing: '0.05em',
        }}>
          MEMORIALS
        </div>
        {workspaces.map((ws) => {
          const active = ws.namespaceId === selectedNamespaceId;
          return (
            <div
              key={ws.namespaceId}
              onClick={() => onSelectWorkspace(ws.namespaceId)}
              style={{
                padding: '0.35rem 0.6rem',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '0.82rem',
                background: active ? 'rgba(107,76,154,0.2)' : 'transparent',
                color: active ? 'var(--color-primary)' : '#8a7aaa',
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
            color: '#6b5f8a',
            marginTop: workspaces.length > 0 ? 2 : 0,
          }}
          title="Start a new memorial space"
        >
          + New memorial
        </div>
      </div>

      {/* Contributors */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
        <div style={{
          fontSize: '0.68rem',
          color: '#6b5f8a',
          marginBottom: '0.4rem',
          paddingLeft: '0.25rem',
          letterSpacing: '0.05em',
        }}>
          CONTRIBUTORS
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
              background: 'var(--color-accent)',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: '0.82rem', color: '#e2d9f3', fontStyle: 'italic' }}>
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
              color: '#8a7aaa',
              fontSize: '0.82rem',
            }}
            title={m.identity}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#3a2e50',
              flexShrink: 0,
            }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.alias || shortenId(m.identity)}
            </span>
          </div>
        ))}
      </div>

      {/* Invite */}
      <div style={{ padding: '0.75rem', borderTop: '1px solid rgba(107,76,154,0.2)' }}>
        <button
          onClick={onInvite}
          style={{
            width: '100%',
            padding: '0.5rem',
            background: 'rgba(107,76,154,0.2)',
            color: 'var(--color-primary)',
            border: '1px solid rgba(107,76,154,0.4)',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.82rem',
            fontWeight: 600,
          }}
        >
          Invite family &amp; friends
        </button>
      </div>
    </div>
  );
}
