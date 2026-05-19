import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import Sidebar from '../../components/Sidebar';
import RoomView from '../../components/RoomView';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

/**
 * Main page for one-on-one-chat.
 *
 * Architecture: each Calimero namespace = one 1-on-1 conversation.
 * The namespace contains exactly one context (service: "chat") which is
 * used as the chat context directly — no separate lobby/room split.
 *
 * `useChatLobby` resolves `lobbyContextId` by looking for the context
 * whose serviceName === SERVICE_NAME.directory (= "chat" for this app).
 * That context IS the chat context we pass to RoomView/ChatView.
 */
export default function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useMero();
  const lobby = useChatLobby();

  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // Redirect to login if session expires.
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  // Poll for new members joining via invitation (no SSE channel for membership).
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const id = setInterval(() => { void lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(id);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  // --- Welcome screen: no conversations yet ---
  if (lobby.lobbies.length === 0 && !lobby.lobbiesLoading) {
    return (
      <div className="app-bg">
        <div
          className="page-shell"
          style={{ justifyContent: 'center', alignItems: 'center', gap: '1.5rem' }}
        >
          <div style={{ fontSize: '3rem' }}>💬</div>
          <h2 style={{ color: '#f1f5f9', margin: 0 }}>No conversations yet</h2>
          <p style={{ color: '#64748b', maxWidth: 360, textAlign: 'center', margin: 0 }}>
            Start a new 1-on-1 conversation or join one using your friend's invitation.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => setShowCreateWorkspace(true)}
              style={{
                padding: '0.6rem 1.25rem',
                background: 'var(--color-primary, #3B82F6)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 500,
              }}
            >
              New conversation
            </button>
            <button
              onClick={() => setShowJoin(true)}
              style={{
                padding: '0.6rem 1.25rem',
                background: '#1e293b',
                color: '#cbd5e1',
                border: '1px solid #334155',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Join with invitation
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

  // --- Main layout ---
  // `lobbyContextId` is the chat context for the selected conversation.
  // It's null while the context lookup is in-flight after a namespace switch.
  const chatContextId = lobby.lobbyContextId;

  return (
    <div className="app-bg">
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar
          workspaces={lobby.lobbies}
          selectedNamespaceId={lobby.namespaceId}
          onSelectWorkspace={lobby.selectLobby}
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          members={lobby.members}
          selfIdentity={lobby.selfIdentity}
          memberNames={{}}
          onInvite={() => setShowInvite(true)}
          onJoin={() => setShowJoin(true)}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {chatContextId ? (
            <RoomView
              contextId={chatContextId}
              executorPublicKey={lobby.executorPublicKey}
              memberNames={{}}
              conversationAlias={lobby.selectedLobby?.alias}
            />
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#475569',
              gap: '0.5rem',
            }}>
              {lobby.groupLoading ? (
                <>
                  <div style={{ fontSize: '1.5rem' }}>⏳</div>
                  <span style={{ fontSize: '0.9rem' }}>Setting up conversation…</span>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '2rem' }}>💬</div>
                  <span style={{ fontSize: '0.9rem' }}>Select a conversation or start a new one.</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
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
