import React, { useEffect, useState } from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import type { TripWorkspaceRecord } from '../hooks/useTripWorkspace';

const MAX_NAME_LEN = 20;

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

interface SidebarProps {
  // Trip (workspace) list
  workspaces: TripWorkspaceRecord[];
  selectedNamespaceId: string | null;
  onSelectWorkspace: (nsId: string) => void;
  onCreateWorkspace: () => void;

  // Member directory
  members: GroupMember[];
  selfIdentity: string | null;
  onlineMembers: Set<string>;
  memberNames: Record<string, string>;
  onSetName: (name: string) => Promise<void>;

  // Actions
  onInvite: () => void;
}

export default function Sidebar({
  workspaces,
  selectedNamespaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  members,
  selfIdentity,
  onlineMembers,
  memberNames,
  onSetName,
  onInvite,
}: SidebarProps) {
  const persistedName = (selfIdentity && memberNames[selfIdentity]) || '';
  const [draftName, setDraftName] = useState(persistedName);

  useEffect(() => { setDraftName(persistedName); }, [persistedName]);

  const commitName = async () => {
    const trimmed = draftName.trim().slice(0, MAX_NAME_LEN);
    setDraftName(trimmed);
    if (trimmed === persistedName) return;
    try { await onSetName(trimmed); } catch { /* keep draft on failure */ }
  };

  const renderMemberLabel = (identity: string, alias?: string) =>
    memberNames[identity] || alias || shortenId(identity);

  const selectedWorkspace = workspaces.find((w) => w.namespaceId === selectedNamespaceId);

  return (
    <div style={{
      width: 260,
      borderRight: '1px solid #1e293b',
      display: 'flex',
      flexDirection: 'column',
      background: '#0a0f1a',
      flexShrink: 0,
    }}>
      {/* Header */}
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
          {selectedWorkspace?.alias || '✈️ Trip Tracker'}
        </h2>
        <span style={{ color: '#64748b', fontSize: '0.78rem' }}>
          {members.length + (selfIdentity ? 1 : 0)} traveller{(members.length + (selfIdentity ? 1 : 0)) !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Trip list (always visible) */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.25rem', paddingLeft: '0.25rem', letterSpacing: '0.05em' }}>
          TRIPS
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
                ? 'rgba(255,107,107,0.12)'
                : 'transparent',
              color: ws.namespaceId === selectedNamespaceId
                ? 'var(--color-primary)'
                : '#94a3b8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginBottom: 1,
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
          title="Start a new trip"
        >
          + New trip
        </div>
      </div>

      {/* Members */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.4rem', paddingLeft: '0.25rem', letterSpacing: '0.05em' }}>
          TRAVELLERS
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
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--color-accent)',
              flexShrink: 0,
            }} />
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                  setDraftName(persistedName);
                  (e.currentTarget as HTMLInputElement).blur();
                }
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
                background: online ? 'var(--color-accent)' : '#475569',
                flexShrink: 0,
              }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {renderMemberLabel(m.identity, m.alias)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ padding: '0.5rem', display: 'flex', gap: '0.25rem' }}>
        <button
          onClick={onInvite}
          style={{
            flex: 1,
            padding: '0.4rem',
            background: 'rgba(78,205,196,0.1)',
            color: 'var(--color-accent)',
            border: '1px solid rgba(78,205,196,0.3)',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          Invite
        </button>
      </div>
    </div>
  );
}
