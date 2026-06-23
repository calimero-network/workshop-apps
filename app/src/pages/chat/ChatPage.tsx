import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { useLobbyDirectory } from '../../hooks/useLobbyDirectory';
import { LobbyClient, RoomSummary } from '../../api/lobby/LobbyClient';
import { SERVICE_NAME } from '../../config';
import Sidebar from '../../components/Sidebar';
import RoomView from '../../components/RoomView';
import CreateRoomModal from '../../components/CreateRoomModal';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import WorkspacesEmptyState from '../../components/WorkspacesEmptyState';

// Mirror chat_types::generate_id (Rust): "room-{ts_ms}-{8-hex-nonce}"
function generateRoomId(): string {
  const ts = Date.now();
  const nonce = crypto.getRandomValues(new Uint8Array(4));
  const hex = Array.from(nonce).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `room-${ts}-${hex}`;
}

export default function ChatPage() {
  // Auth is gated by <RequireAuth> in App.tsx (which waits for the async auth
  // probe before redirecting) — this page only runs once authenticated.
  const { mero } = useMero();
  const lobby = useChatLobby();
  const { onlineMembers, memberNames, setName } = useLobbyDirectory(
    lobby.lobbyContextId,
    lobby.lobbyExecutorPublicKey,
  );

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<{ id: string; contextId: string | null } | null>(null);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const fetchRooms = useCallback(async () => {
    if (!mero || !lobby.lobbyContextId || !lobby.executorPublicKey) return;
    try {
      const client = new LobbyClient(mero, lobby.lobbyContextId, lobby.executorPublicKey);
      const roomList = await client.getRooms();
      setRooms(roomList);
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    }
  }, [mero, lobby.lobbyContextId, lobby.executorPublicKey]);

  useEffect(() => {
    if (lobby.lobbyJoined) {
      fetchRooms();
    }
  }, [lobby.lobbyJoined, fetchRooms]);

  // React to any lobby state change (local or synced from other nodes).
  // Also refetch members because some membership changes coincide with lobby
  // events.
  useSubscription(
    lobby.lobbyContextId ? [lobby.lobbyContextId] : [],
    () => {
      fetchRooms();
      lobby.refetchMembers();
    },
  );

  // Namespace membership has no SSE channel — peers joining via invitation
  // never trigger a re-render. Poll while the chat page is open so the
  // member count and CreateRoomModal pre-selection stay current.
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const interval = setInterval(() => { lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(interval);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  const handleCreateRoom = useCallback(async (name: string) => {
    if (!mero || !lobby.lobbyContextId || !lobby.executorPublicKey || !lobby.namespaceId) return;

    const appId = lobby.selectedLobby?.applicationId;
    if (!appId) return;

    const client = new LobbyClient(mero, lobby.lobbyContextId, lobby.executorPublicKey);

    // Single atomic lobby write: createContext first, then register_room with
    // the resulting context_id. Avoids the propagation race where remote peers
    // would see the room name with context_id == null between two writes.
    const roomId = generateRoomId();

    try {
      const initParams = JSON.stringify({
        room_id: roomId,
        name,
        lobby_context_id: lobby.lobbyContextId,
      });
      const initBytes = Array.from(new TextEncoder().encode(initParams));

      // Create the per-instance context in the root namespace group.
      // All namespace members can see and join it via auto_join.
      const instanceServiceName = SERVICE_NAME.instance;
      if (!instanceServiceName) {
        throw new Error('No "instance" service declared in studio.config.json');
      }
      const { contextId } = await mero.admin.createContext({
        applicationId: appId,
        groupId: lobby.namespaceId,
        serviceName: instanceServiceName,
        initializationParams: initBytes,
      });

      // Rooms auto-join every workspace member, so the room's membership is the
      // workspace membership. Store that as the count (display reads it live).
      await client.registerRoom({
        room_id: roomId,
        name,
        context_id: contextId,
        member_count: lobby.members.length + (lobby.selfIdentity ? 1 : 0),
      });
      setShowCreateRoom(false);
      await fetchRooms();
    } catch (err) {
      console.error('Failed to create room:', err);
    }
  }, [mero, lobby, fetchRooms]);

  const handleSelectRoom = useCallback(async (room: RoomSummary) => {
    if (!room.context_id || !mero) {
      setSelectedRoom({ id: room.room_id, contextId: null });
      return;
    }

    // Bound the join attempt so a hang doesn't freeze the UI. If we're
    // already in the context the call returns quickly; if not, the join
    // needs to complete before useChatRoom can read state from the context.
    const joinTimeout = new Promise<void>((resolve) => setTimeout(resolve, 5_000));
    await Promise.race([
      mero.admin.joinContext(room.context_id).then(() => {}).catch(() => {}),
      joinTimeout,
    ]);

    setSelectedRoom({ id: room.room_id, contextId: room.context_id });
  }, [mero]);

  // Show Welcome only when there are no workspaces at all. Don't gate on
  // `!lobbyJoined` — that flips to false on every workspace switch and would
  // flash the Welcome screen mid-transition. Switching is just a transition
  // between contexts; keep the main layout mounted.
  if (lobby.lobbies.length === 0 && !lobby.lobbiesLoading) {
    return (
      <>
        <WorkspacesEmptyState
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          onJoin={() => setShowJoin(true)}
        />
        {showCreateWorkspace && (
          <CreateWorkspaceModal
            onCreate={async (name) => { await lobby.createLobby(name); }}
            onClose={() => setShowCreateWorkspace(false)}
          />
        )}
        {showJoin && (
          <JoinModal
            onJoin={async (json) => {
              await lobby.joinLobby(json);
              setShowJoin(false);
            }}
            onClose={() => setShowJoin(false)}
          />
        )}
      </>
    );
  }

  return (
    <div style={{ background: 'var(--c-paper)', color: 'var(--c-ink)' }}>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar
          workspaces={lobby.lobbies}
          selectedNamespaceId={lobby.namespaceId}
          onSelectWorkspace={lobby.selectLobby}
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          workspaceAlias={lobby.selectedLobby?.alias}
          members={lobby.members}
          selfIdentity={lobby.selfIdentity}
          onlineMembers={onlineMembers}
          memberNames={memberNames}
          onSetName={setName}
          rooms={rooms}
          selectedRoomId={selectedRoom?.id ?? null}
          onSelectRoom={handleSelectRoom}
          onCreateRoom={() => setShowCreateRoom(true)}
          onInvite={() => setShowInvite(true)}
          viewerIsAdmin={lobby.isAdmin}
          onSetMemberRole={lobby.setMemberRole}
          onRemoveMember={lobby.removeMember}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--c-paper2)', minWidth: 0 }}>
          {selectedRoom?.contextId ? (
            <RoomView
              contextId={selectedRoom.contextId}
              executorPublicKey={lobby.executorPublicKey}
              onRoomDeleted={() => {
                setSelectedRoom(null);
                fetchRooms();
              }}
            />
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              textAlign: 'center',
              padding: '24px',
            }}>
              <div style={{
                width: 56, height: 56, display: 'grid', placeItems: 'center',
                borderRadius: 16, background: 'rgba(164,255,17,0.16)',
                border: '1px solid rgba(164,255,17,0.4)',
              }} aria-hidden>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--c-green-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8A8.5 8.5 0 0 1 21 11.5z" />
                </svg>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.4px', color: 'var(--c-ink)' }}>
                Select a room to start chatting
              </div>
              <div style={{ fontSize: 14, color: 'var(--c-muted)', maxWidth: 340, lineHeight: 1.55 }}>
                Pick a room from the sidebar, or create a new one to begin a conversation.
              </div>
            </div>
          )}
        </div>
      </div>

      {showCreateRoom && (
        <CreateRoomModal
          memberCount={lobby.members.length + (lobby.selfIdentity ? 1 : 0)}
          onSubmit={handleCreateRoom}
          onClose={() => setShowCreateRoom(false)}
        />
      )}
      {showInvite && (
        <InviteModal
          onInvite={lobby.inviteUser}
          onClose={() => setShowInvite(false)}
        />
      )}
      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onCreate={async (name) => { await lobby.createLobby(name); }}
          onClose={() => setShowCreateWorkspace(false)}
        />
      )}
      {showJoin && (
        <JoinModal
          onJoin={async (json) => {
            await lobby.joinLobby(json);
            setShowJoin(false);
          }}
          onClose={() => setShowJoin(false)}
        />
      )}
    </div>
  );
}
