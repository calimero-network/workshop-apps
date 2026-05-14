/**
 * ChatPage — main D&D Online Table page.
 *
 * Layout:
 *   ┌─────────────┬───────────────────────────────────┐
 *   │  Sidebar    │         Table View                 │
 *   │ (games +    │  (game log · character roster ·    │
 *   │  members)   │   DM control panel)                │
 *   └─────────────┴───────────────────────────────────┘
 *
 * Architecture (single service):
 *   - Each namespace = one game session.
 *   - The one `table` context per namespace holds all game state.
 *   - `lobbyContextId` (from useChatLobby) IS the table context ID.
 *   - No per-instance room contexts; no CreateRoomModal needed.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { useLobbyDirectory } from '../../hooks/useLobbyDirectory';
import Sidebar from '../../components/Sidebar';
import RoomView from '../../components/RoomView';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

export default function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated, mero } = useMero();
  const lobby = useChatLobby();

  // useLobbyDirectory is a no-op for this app (no presence service).
  // Kept for Sidebar prop compatibility.
  const { onlineMembers, memberNames, setName } = useLobbyDirectory(
    lobby.lobbyContextId,
    lobby.lobbyExecutorPublicKey,
  );

  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  // Poll namespace membership (no SSE for join events)
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const id = setInterval(() => { void lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(id);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  // When the table context is first resolved (e.g. after joining via invitation),
  // ensure this node has joined the context so executor identity can be resolved.
  const joinedContextRef = useRef<string | null>(null);
  useEffect(() => {
    const ctxId = lobby.lobbyContextId;
    if (!mero || !ctxId || joinedContextRef.current === ctxId) return;
    joinedContextRef.current = ctxId;
    const timeout = new Promise<void>((r) => setTimeout(r, 5_000));
    void Promise.race([
      mero.admin.joinContext(ctxId).then(() => {}).catch(() => {}),
      timeout,
    ]);
  }, [mero, lobby.lobbyContextId]);

  // Welcome screen — only when there are zero namespaces
  if (lobby.lobbies.length === 0 && !lobby.lobbiesLoading) {
    return (
      <div className="app-bg">
        <div className="page-shell" style={{
          justifyContent: 'center',
          alignItems: 'center',
          gap: '1.5rem',
        }}>
          <div style={{ fontSize: '3rem' }}>⚔️</div>
          <h2 style={{
            fontSize: '1.8rem',
            color: 'var(--color-accent)',
            fontWeight: 700,
          }}>
            No Game Tables Yet
          </h2>
          <p style={{ color: '#888', textAlign: 'center', maxWidth: 380 }}>
            Create a new game table as the Dungeon Master, or join an existing
            one with an invitation from your DM.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => setShowCreateWorkspace(true)}
              style={{
                padding: '0.6rem 1.4rem',
                background: 'var(--color-accent)',
                color: '#1a1a2e',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.95rem',
              }}
            >
              ⚔️ New Game Table
            </button>
            <button
              onClick={() => setShowJoin(true)}
              style={{
                padding: '0.6rem 1.4rem',
                background: 'transparent',
                color: 'var(--color-accent)',
                border: '1px solid var(--color-accent)',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.95rem',
              }}
            >
              Join with Invitation
            </button>
          </div>

          {showCreateWorkspace && (
            <CreateWorkspaceModal
              onCreate={async (name) => {
                await lobby.createLobby(name);
                setShowCreateWorkspace(false);
              }}
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
      </div>
    );
  }

  return (
    <div className="app-bg">
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
          onInvite={() => setShowInvite(true)}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {lobby.lobbyContextId ? (
            <RoomView
              contextId={lobby.lobbyContextId}
              executorPublicKey={lobby.executorPublicKey}
            />
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              color: '#666',
            }}>
              {lobby.lobbiesLoading || lobby.groupLoading ? (
                <p>Loading game table…</p>
              ) : (
                <>
                  <p>No active game found in this namespace.</p>
                  <p style={{ fontSize: '0.8rem' }}>
                    The table context may still be syncing.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onCreate={async (name) => {
            await lobby.createLobby(name);
            setShowCreateWorkspace(false);
          }}
          onClose={() => setShowCreateWorkspace(false)}
        />
      )}
      {showInvite && (
        <InviteModal
          onInvite={lobby.inviteUser}
          onClose={() => setShowInvite(false)}
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
