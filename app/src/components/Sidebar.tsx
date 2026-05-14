import React, { useEffect, useState } from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import type { LobbyRecord } from '../hooks/useChatLobby';

const MAX_NAME_LEN = 20;

interface SidebarProps {
  // Workspace = game selector
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
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

const PRIMARY = 'var(--color-primary, #1a1a2e)';
const ACCENT = 'var(--color-accent, #d4af37)';

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
  onInvite,
}: SidebarProps) {
  // Editable display name — sync draft when server value changes, never gate
  // on a local `isEditing` flag (would revert draft on commit via effect).
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

  const totalMembers = members.length + (selfIdentity ? 1 : 0);

  return (
    <div style={{
      width: 256,
      minWidth: 220,
      borderRight: '1px solid #2a1e3a',
      display: 'flex',
      flexDirection: 'column',
      background: '#0d0d1a',
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '1rem',
        borderBottom: '1px solid #2a1e3a',
        background: PRIMARY,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.2rem' }}>⚔️</span>
          <h2 style={{
            fontSize: '0.95rem',
            fontWeight: 700,
            color: ACCENT,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}>
            {workspaceAlias || 'D&D Table'}
          </h2>
        </div>
        <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.2rem' }}>
          {totalMembers} adventurer{totalMembers !== 1 ? 's' : ''} at the table
        </div>
      </div>

      {/* Game tables list (workspaces) — always visible */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #2a1e3a' }}>
        <div style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: ACCENT,
          marginBottom: '0.3rem',
          paddingLeft: '0.3rem',
        }}>
          GAME TABLES
        </div>
        {workspaces.map((ws) => {
          const active = ws.namespaceId === selectedNamespaceId;
          return (
            <div
              key={ws.namespaceId}
              onClick={() => onSelectWorkspace(ws.namespaceId)}
              title={ws.namespaceId}
              style={{
                padding: '0.38rem 0.6rem',
                borderRadius: 5,
                cursor: 'pointer',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: active ? 'rgba(212,175,55,0.12)' : 'transparent',
                color: active ? ACCENT : '#94a3b8',
                borderLeft: active ? `2px solid ${ACCENT}` : '2px solid transparent',
                marginBottom: 1,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              }}
            >
              <span style={{ flexShrink: 0 }}>🎲</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {ws.alias || shortenId(ws.namespaceId)}
              </span>
            </div>
          );
        })}
        <div
          onClick={onCreateWorkspace}
          title="Create a new game table"
          style={{
            padding: '0.35rem 0.6rem',
            borderRadius: 5,
            cursor: 'pointer',
            fontSize: '0.78rem',
            color: '#64748b',
            marginTop: workspaces.length > 0 ? 2 : 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
          }}
        >
          <span>+</span>
          <span>New Game Table</span>
        </div>
      </div>

      {/* Members / Adventurers */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #2a1e3a', flex: 1, overflowY: 'auto' }}>
        <div style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: ACCENT,
          marginBottom: '0.35rem',
          paddingLeft: '0.3rem',
        }}>
          ADVENTURERS
        </div>

        {/* Self — editable display name */}
        {selfIdentity && (
          <div style={{
            padding: '0.32rem 0.55rem',
            borderRadius: 5,
            marginBottom: 2,
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: ACCENT,
              flexShrink: 0,
              boxShadow: `0 0 5px ${ACCENT}`,
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
              title="Your display name (press Enter to save)"
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
            <span style={{ fontSize: '0.65rem', color: '#64748b', flexShrink: 0 }}>you</span>
          </div>
        )}

        {/* Other members */}
        {members.map((m) => {
          const online = onlineMembers.has(m.identity);
          return (
            <div
              key={m.identity}
              title={m.identity}
              style={{
                padding: '0.32rem 0.55rem',
                borderRadius: 5,
                marginBottom: 2,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                color: '#94a3b8',
                fontSize: '0.82rem',
              }}
            >
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: online ? '#22c55e' : '#374151',
                flexShrink: 0,
              }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {renderMemberLabel(m.identity, m.alias)}
              </span>
            </div>
          );
        })}

        {members.length === 0 && !selfIdentity && (
          <div style={{ padding: '0.5rem', color: '#475569', fontSize: '0.78rem', textAlign: 'center' }}>
            No members yet
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: '0.5rem' }}>
        <button
          onClick={onInvite}
          style={{
            width: '100%',
            padding: '0.45rem',
            background: 'transparent',
            color: ACCENT,
            border: `1px solid ${ACCENT}`,
            borderRadius: 5,
            cursor: 'pointer',
            fontSize: '0.82rem',
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}
        >
          📜 Invite Adventurer
        </button>
      </div>
    </div>
  );
}
