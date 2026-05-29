import React, { useEffect, useState } from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import { RoomSummary } from '../api/lobby/LobbyClient';
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

  // Room list
  rooms: RoomSummary[];
  selectedRoomId: string | null;
  onSelectRoom: (room: RoomSummary) => void;
  onCreateRoom: () => void;
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
  // Editable display name for self. Names are author-owned, so the only
  // source of `persistedName` change is our own committed write — sync the
  // draft whenever the backend value changes. Don't gate this on a local
  // `isEditing` flag; flipping it during commit re-fires the effect and
  // reverts the optimistic value before the roundtrip lands.
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
      width: 260,
      borderRight: '1px solid #1e293b',
      display: 'flex',
      flexDirection: 'column',
      background: '#0f172a',
    }}>
      {/* Workspace header */}
      <div style={{
        padding: '1rem',
        borderBottom: '1px solid #1e293b',
      }}>
        <h2 style={{
          fontSize: '1rem',
          fontWeight: 700,
          color: 'var(--color-primary, #3B82F6)',
          marginBottom: '0.2rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {workspaceAlias || 'Chat'}
        </h2>
        <span style={{ color: '#64748b', fontSize: '0.78rem' }}>
          {members.length + (selfIdentity ? 1 : 0)} member{members.length === 0 && selfIdentity ? '' : 's'}
        </span>
      </div>

      {/* Workspace list (always visible — switching is just a transition) */}
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
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.4rem', paddingLeft: '0.25rem' }}>
          MEMBERS
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
                background: online ? 'var(--color-accent, #10B981)' : '#475569',
                flexShrink: 0,
              }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {renderMemberLabel(m.identity, m.alias)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Room actions */}
      <div style={{ padding: '0.5rem', display: 'flex', gap: '0.25rem' }}>
        <button
          onClick={onCreateRoom}
          style={{
            flex: 1,
            padding: '0.4rem',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          + Room
        </button>
        <button
          onClick={onInvite}
          style={{
            flex: 1,
            padding: '0.4rem',
            background: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #334155',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          Invite
        </button>
      </div>

      {/* Room list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem' }}>
        <div style={{ fontSize: '0.7rem', color: '#64748b', margin: '0.25rem 0.5rem' }}>
          ROOMS
        </div>
        {rooms.length === 0 && (
          <div style={{ padding: '1rem', color: '#475569', fontSize: '0.8rem', textAlign: 'center' }}>
            No rooms yet
          </div>
        )}
        {rooms.map((room) => (
          <div
            key={room.room_id}
            data-testid={`sidebar-room-${room.name}`}
            onClick={() => onSelectRoom(room)}
            style={{
              padding: '0.55rem 0.7rem',
              borderRadius: 6,
              cursor: 'pointer',
              background: room.room_id === selectedRoomId ? 'rgba(59,130,246,0.15)' : 'transparent',
              color: room.room_id === selectedRoomId ? '#93c5fd' : '#cbd5e1',
              marginBottom: 2,
            }}
          >
            <div style={{ fontSize: '0.88rem' }}># {room.name}</div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
              {room.member_count} member{room.member_count !== 1 ? 's' : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
