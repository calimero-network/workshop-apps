import React from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import type { LobbyRecord } from '../hooks/useChatLobby';

const MAX_NAME_LEN = 20;

interface SidebarProps {
  // Trip (workspace) selector
  workspaces: LobbyRecord[];
  selectedNamespaceId: string | null;
  onSelectWorkspace: (nsId: string) => void;
  onCreateWorkspace: () => void;
  workspaceAlias?: string;
  tripCurrency: string;

  // Member directory
  members: GroupMember[];
  selfIdentity: string | null;

  // Actions
  onInvite: () => void;

  // Active tab
  activeTab: 'expenses' | 'settlement';
  onTabChange: (tab: 'expenses' | 'settlement') => void;
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
  tripCurrency,
  members,
  selfIdentity,
  onInvite,
  activeTab,
  onTabChange,
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
      {/* Current trip header */}
      <div style={{
        padding: '1rem',
        borderBottom: '1px solid #1e293b',
      }}>
        <h2 style={{
          fontSize: '1rem',
          fontWeight: 700,
          color: 'var(--color-primary, #0066CC)',
          marginBottom: '0.15rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {workspaceAlias || 'Trip Splitter'}
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
            {totalMembers} traveller{totalMembers !== 1 ? 's' : ''}
          </span>
          {tripCurrency && (
            <span style={{
              fontSize: '0.65rem', background: 'rgba(0,102,204,0.15)',
              color: 'var(--color-primary, #0066CC)', padding: '0.1rem 0.4rem',
              borderRadius: 4, fontWeight: 600,
            }}>
              {tripCurrency}
            </span>
          )}
        </div>
      </div>

      {/* Navigation tabs */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: '0.3rem', paddingLeft: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Views
        </div>
        {(['expenses', 'settlement'] as const).map((tab) => {
          const labels = { expenses: '🧾 Expenses', settlement: '⚖️ Settlement' };
          const active = activeTab === tab;
          return (
            <div
              key={tab}
              onClick={() => onTabChange(tab)}
              style={{
                padding: '0.4rem 0.6rem',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '0.83rem',
                background: active ? 'rgba(0,102,204,0.15)' : 'transparent',
                color: active ? '#93c5fd' : '#94a3b8',
                fontWeight: active ? 600 : 400,
                marginBottom: 2,
              }}
            >
              {labels[tab]}
            </div>
          );
        })}
      </div>

      {/* Trip list (always visible) */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: '0.25rem', paddingLeft: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Trips
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
                ? 'rgba(0,102,204,0.15)'
                : 'transparent',
              color: ws.namespaceId === selectedNamespaceId ? '#93c5fd' : '#94a3b8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginBottom: 2,
            }}
          >
            ✈️ {ws.alias || shortenId(ws.namespaceId)}
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
          title="Create a new trip"
        >
          + New trip
        </div>
      </div>

      {/* Members */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
        <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: '0.4rem', paddingLeft: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Travellers
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
            color: 'var(--color-primary, #0066CC)',
            fontSize: '0.82rem',
            fontWeight: 500,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--color-accent, #FF6B35)',
              flexShrink: 0,
            }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
              width: 7, height: 7, borderRadius: '50%',
              background: '#475569',
              flexShrink: 0,
            }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.alias || shortenId(m.identity)}
            </span>
          </div>
        ))}

        {/* Invite button */}
        <div style={{ padding: '0.5rem 0.25rem', marginTop: '0.25rem' }}>
          <button
            onClick={onInvite}
            style={{
              width: '100%',
              padding: '0.4rem',
              background: '#1e293b',
              color: '#cbd5e1',
              border: '1px solid #334155',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            + Invite Traveller
          </button>
        </div>
      </div>
    </div>
  );
}
