import React, { useEffect, useState } from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import type { LobbyRecord } from '../hooks/useChatLobby';
import type { RoomSummary } from '../api/lobby/LobbyClient';

const MAX_NAME_LEN = 20;

interface SidebarProps {
  // Workspace (pod) selector
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

  // Optional room list (chat app only)
  rooms?: RoomSummary[];
  selectedRoomId?: string | null;
  onSelectRoom?: (room: RoomSummary) => void;
  onCreateRoom?: () => void;

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
  onlineMembers,
  memberNames,
  onSetName,
  rooms,
  selectedRoomId,
  onSelectRoom,
  onCreateRoom,
  onInvite,
}: SidebarProps) {
  const persistedName = (selfIdentity && memberNames[selfIdentity]) || '';
  const [draftName, setDraftName] = useState(persistedName);

  // Sync only when server value changes — never gate on isEditing flag
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

  const totalMembers = members.length + (selfIdentity ? 1 : 0);

  return (
    <div style={{
      width: 260,
      borderRight: '1px solid #374151',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-primary, #1F2937)',
      color: '#e5e7eb',
    }}>

      {/* Pod header */}
      <div style={{
        padding: '1rem',
        borderBottom: '1px solid #374151',
      }}>
        <h2 style={{
          fontSize: '1rem',
          fontWeight: 700,
          color: 'var(--color-accent, #10B981)',
          marginBottom: '0.2rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {workspaceAlias || 'Trading Pod'}
        </h2>
        <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>
          {totalMembers} member{totalMembers !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Pod list (always visible) */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #374151' }}>
        <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '0.25rem', paddingLeft: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Pods
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
                background: active ? 'rgba(16,185,129,0.15)' : 'transparent',
                color: active ? 'var(--color-accent, #10B981)' : '#9ca3af',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
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
            color: '#6b7280',
            marginTop: workspaces.length > 0 ? 2 : 0,
          }}
          title="Create a new pod"
        >
          + New pod
        </div>
      </div>

      {/* Room list (chat app) */}
      {rooms !== undefined && (
        <div style={{ padding: '0.5rem', borderBottom: '1px solid #374151' }}>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '0.25rem', paddingLeft: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Rooms
          </div>
          {rooms.map((room) => {
            const active = room.room_id === selectedRoomId;
            return (
              <div
                key={room.room_id}
                onClick={() => onSelectRoom?.(room)}
                style={{
                  padding: '0.35rem 0.6rem',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  background: active ? 'rgba(16,185,129,0.15)' : 'transparent',
                  color: active ? 'var(--color-accent, #10B981)' : '#9ca3af',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                # {room.name}
              </div>
            );
          })}
          {onCreateRoom && (
            <div
              onClick={onCreateRoom}
              style={{
                padding: '0.35rem 0.6rem',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '0.78rem',
                color: '#6b7280',
                marginTop: rooms.length > 0 ? 2 : 0,
              }}
              title="Create a new room"
            >
              + New room
            </div>
          )}
        </div>
      )}

      {/* Members */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
        <div style={{
          fontSize: '0.7rem',
          color: '#6b7280',
          marginBottom: '0.4rem',
          paddingLeft: '0.25rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          Members
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
              background: 'var(--color-accent, #10B981)',
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
                color: '#f3f4f6',
                fontSize: '0.82rem',
                padding: 0,
              }}
            />
            <span style={{ fontSize: '0.65rem', color: '#6b7280' }}>you</span>
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
                color: '#9ca3af',
                fontSize: '0.82rem',
              }}
              title={m.identity}
            >
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: online ? 'var(--color-accent, #10B981)' : '#374151',
                flexShrink: 0,
              }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {renderMemberLabel(m.identity, m.alias)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Invite action */}
      <div style={{ padding: '0.75rem', borderTop: '1px solid #374151' }}>
        <button
          onClick={onInvite}
          style={{
            width: '100%',
            padding: '0.5rem',
            background: 'transparent',
            color: 'var(--color-accent, #10B981)',
            border: '1px solid var(--color-accent, #10B981)',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.82rem',
            fontWeight: 500,
          }}
        >
          Invite trader
        </button>
      </div>
    </div>
  );
}
