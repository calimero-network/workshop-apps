import React, { useEffect, useState } from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import type { LobbyRecord } from '../hooks/useChatLobby';
import { APP_NAME } from '../config';

const MAX_NAME_LEN = 20;

interface SidebarProps {
  // Conversation (workspace) list
  workspaces: LobbyRecord[];
  selectedNamespaceId: string | null;
  onSelectWorkspace: (nsId: string) => void;
  onCreateWorkspace: () => void;

  // Members in the selected conversation
  members: GroupMember[];
  selfIdentity: string | null;
  /** memberNames is kept for display but has no server backing in this spec —
   *  it's always an empty record; the editable self-name below is local-only. */
  memberNames: Record<string, string>;

  // Actions
  onInvite: () => void;
  onJoin: () => void;
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
  members,
  selfIdentity,
  memberNames,
  onInvite,
  onJoin,
}: SidebarProps) {
  // Self display name — local-only (chat service has no set_name method).
  const LOCAL_NAME_KEY = `${APP_NAME}:displayName`;
  const [displayName, setDisplayName] = useState(() => {
    try { return localStorage.getItem(LOCAL_NAME_KEY) || ''; } catch { return ''; }
  });
  const [draftName, setDraftName] = useState(displayName);

  useEffect(() => { setDraftName(displayName); }, [displayName]);

  const commitName = () => {
    const trimmed = draftName.trim().slice(0, MAX_NAME_LEN);
    setDraftName(trimmed);
    setDisplayName(trimmed);
    try { localStorage.setItem(LOCAL_NAME_KEY, trimmed); } catch { /* storage unavailable */ }
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
      <div style={{
        padding: '1rem',
        borderBottom: '1px solid #1e293b',
      }}>
        <h2 style={{
          fontSize: '1rem',
          fontWeight: 700,
          color: 'var(--color-primary, #3B82F6)',
          margin: 0,
        }}>
          {APP_NAME}
        </h2>
        <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
          Decentralized 1-on-1 chat
        </span>
      </div>

      {/* Conversations list (each namespace = one 1-on-1 conversation) */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b', flex: 1, overflowY: 'auto' }}>
        <div style={{
          fontSize: '0.68rem',
          color: '#475569',
          letterSpacing: '0.05em',
          marginBottom: '0.25rem',
          paddingLeft: '0.4rem',
        }}>
          CONVERSATIONS
        </div>

        {workspaces.length === 0 && (
          <div style={{ padding: '0.5rem 0.4rem', color: '#475569', fontSize: '0.8rem' }}>
            No conversations yet
          </div>
        )}

        {workspaces.map((ws) => {
          const active = ws.namespaceId === selectedNamespaceId;
          return (
            <div
              key={ws.namespaceId}
              data-testid={`sidebar-conv-${ws.alias || ws.namespaceId}`}
              onClick={() => onSelectWorkspace(ws.namespaceId)}
              style={{
                padding: '0.45rem 0.6rem',
                borderRadius: 6,
                cursor: 'pointer',
                marginBottom: 2,
                background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: active ? '#93c5fd' : '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem',
                overflow: 'hidden',
              }}
            >
              <span style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: active ? 'rgba(59,130,246,0.3)' : '#1e293b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                flexShrink: 0,
                color: active ? '#93c5fd' : '#64748b',
              }}>
                💬
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ws.alias || shortenId(ws.namespaceId)}
              </span>
            </div>
          );
        })}

        {/* + New conversation */}
        <div
          onClick={onCreateWorkspace}
          style={{
            padding: '0.45rem 0.6rem',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.8rem',
            color: '#64748b',
            marginTop: workspaces.length > 0 ? 4 : 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
          title="Start a new 1-on-1 conversation"
        >
          <span style={{ fontSize: '1rem' }}>+</span> New conversation
        </div>
      </div>

      {/* Members in selected conversation */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b' }}>
        <div style={{
          fontSize: '0.68rem',
          color: '#475569',
          letterSpacing: '0.05em',
          marginBottom: '0.4rem',
          paddingLeft: '0.4rem',
        }}>
          PEOPLE
        </div>

        {/* Self — editable local display name */}
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
            }} title="You (online)" />
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                  setDraftName(displayName);
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              maxLength={MAX_NAME_LEN}
              placeholder={shortenId(selfIdentity)}
              title="Your display name (local)"
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
            <span style={{ fontSize: '0.65rem', color: '#334155' }}>you</span>
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
              {renderMemberLabel(m.identity, m.alias)}
            </span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ padding: '0.6rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <button
          onClick={onInvite}
          style={{
            padding: '0.45rem',
            background: 'var(--color-primary, #3B82F6)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.82rem',
            fontWeight: 500,
          }}
        >
          Invite friend
        </button>
        <button
          onClick={onJoin}
          style={{
            padding: '0.45rem',
            background: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #334155',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.82rem',
          }}
        >
          Join with invitation
        </button>
      </div>
    </div>
  );
}
