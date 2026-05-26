import React, { useEffect, useState } from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import type { LobbyRecord } from '../hooks/useChatLobby';

const MAX_NAME_LEN = 20;

interface SidebarProps {
  // Workspace selector
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

  // Nav
  activeView: string;
  onNavigate: (view: string) => void;
  onInvite: () => void;
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

const NAV_ITEMS = [
  { id: 'marketplace', label: '🏛️ Marketplace' },
  { id: 'my-listings', label: '🏷️ My Listings' },
  { id: 'my-offers', label: '💬 My Offers' },
  { id: 'trades', label: '🤝 Trades & Escrow' },
];

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
  onSetName,
  activeView,
  onNavigate,
  onInvite,
}: SidebarProps) {
  const persistedName = (selfIdentity && memberNames[selfIdentity]) || '';
  const [draftName, setDraftName] = useState(persistedName);

  useEffect(() => {
    setDraftName(persistedName);
  }, [persistedName]);

  const commitName = async () => {
    const trimmed = draftName.trim().slice(0, MAX_NAME_LEN);
    setDraftName(trimmed);
    if (trimmed === persistedName) return;
    try { await onSetName(trimmed); } catch { /* keep draft on failure */ }
  };

  const renderMemberLabel = (identity: string, alias?: string) =>
    memberNames[identity] || alias || shortenId(identity);

  return (
    <div style={{
      width: 240,
      borderRight: '1px solid #1f2937',
      display: 'flex',
      flexDirection: 'column',
      background: '#0f172a',
      flexShrink: 0,
    }}>
      {/* Circle header */}
      <div style={{ padding: '1rem', borderBottom: '1px solid #1f2937' }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
          Circle
        </div>
        <h2 style={{
          fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-accent)',
          margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {workspaceAlias || 'Collectors Circle'}
        </h2>
        <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
          {members.length + (selfIdentity ? 1 : 0)} member{(members.length + (selfIdentity ? 1 : 0)) !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Navigation */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1f2937' }}>
        {NAV_ITEMS.map((item) => (
          <div
            key={item.id}
            onClick={() => onNavigate(item.id)}
            style={{
              padding: '0.45rem 0.6rem',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.83rem',
              background: activeView === item.id ? 'rgba(212,175,55,0.12)' : 'transparent',
              color: activeView === item.id ? 'var(--color-accent)' : '#94a3b8',
              marginBottom: 2,
              fontWeight: activeView === item.id ? 600 : 400,
            }}
          >
            {item.label}
          </div>
        ))}
      </div>

      {/* Workspace list */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1f2937' }}>
        <div style={{ fontSize: '0.65rem', color: '#6b7280', marginBottom: '0.25rem', paddingLeft: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Circles
        </div>
        {workspaces.map((ws) => (
          <div
            key={ws.namespaceId}
            onClick={() => onSelectWorkspace(ws.namespaceId)}
            style={{
              padding: '0.35rem 0.6rem',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.8rem',
              background: ws.namespaceId === selectedNamespaceId
                ? 'rgba(212,175,55,0.1)'
                : 'transparent',
              color: ws.namespaceId === selectedNamespaceId ? 'var(--color-accent)' : '#64748b',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {ws.alias || shortenId(ws.namespaceId)}
          </div>
        ))}
        <div
          onClick={onCreateWorkspace}
          style={{
            padding: '0.35rem 0.6rem', borderRadius: 6, cursor: 'pointer',
            fontSize: '0.78rem', color: '#4b5563', marginTop: workspaces.length > 0 ? 2 : 0,
          }}
          title="Create a new circle"
        >
          + New circle
        </div>
      </div>

      {/* Members */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
        <div style={{ fontSize: '0.65rem', color: '#6b7280', marginBottom: '0.4rem', paddingLeft: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Members
        </div>

        {/* Self — editable display name */}
        {selfIdentity && (
          <div style={{ padding: '0.35rem 0.6rem', borderRadius: 6, marginBottom: 2, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
                color: '#e2e8f0', fontSize: '0.82rem', padding: 0,
              }}
            />
          </div>
        )}

        {members.map((m) => {
          const online = onlineMembers.has(m.identity);
          return (
            <div key={m.identity} style={{ padding: '0.35rem 0.6rem', borderRadius: 6, marginBottom: 2, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94a3b8', fontSize: '0.82rem' }} title={m.identity}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: online ? '#10b981' : '#374151', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {renderMemberLabel(m.identity, m.alias)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Invite button */}
      <div style={{ padding: '0.75rem' }}>
        <button
          onClick={onInvite}
          style={{
            width: '100%', padding: '0.5rem', background: 'rgba(212,175,55,0.1)',
            color: 'var(--color-accent)', border: '1px solid rgba(212,175,55,0.3)',
            borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
          }}
        >
          Invite to Circle
        </button>
      </div>
    </div>
  );
}
