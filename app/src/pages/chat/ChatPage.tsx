import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { useLobbyDirectory } from '../../hooks/useLobbyDirectory';
import { useTodoList } from '../../hooks/useTodoList';
import Sidebar from '../../components/Sidebar';
import TodoListView from '../../components/TodoListView';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

export default function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useMero();
  const lobby = useChatLobby();

  // useLobbyDirectory is a stub for this single-service spec — no presence
  // or name methods are part of the todo ABI. Returns empty sets/maps.
  const { onlineMembers, memberNames, setName } = useLobbyDirectory(
    lobby.lobbyContextId,
    lobby.lobbyExecutorPublicKey,
  );

  // The todo context IS the workspace context for this single-service spec.
  const todo = useTodoList(lobby.lobbyContextId, lobby.executorPublicKey);

  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  // Refresh members on subscription events (membership changes coincide
  // with lobby events on the todo context).
  useSubscription(
    lobby.lobbyContextId ? [lobby.lobbyContextId] : [],
    () => {
      lobby.refetchMembers();
    },
  );

  // Poll for namespace member joins — no SSE channel for this (SDK limitation).
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const interval = setInterval(() => { lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(interval);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  // Welcome screen — only when there are no workspaces at all.
  // Never gate on `!lobbyJoined`; that resets on every workspace switch.
  if (lobby.lobbies.length === 0 && !lobby.lobbiesLoading) {
    return (
      <div className="app-bg">
        <div className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ color: '#e2e8f0' }}>No workspaces yet</h2>
          <p style={{ color: '#888' }}>Create a new team workspace or join one with an invitation.</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setShowCreateWorkspace(true)}
              style={{
                padding: '0.55rem 1.2rem',
                background: 'var(--color-primary, #3B82F6)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Create Workspace
            </button>
            <button
              onClick={() => setShowJoin(true)}
              style={{
                padding: '0.55rem 1.2rem',
                background: '#1e293b',
                color: '#cbd5e1',
                border: '1px solid #334155',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '0.9rem',
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

        {/* Main content — always the todo list for the selected workspace */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {lobby.lobbyJoined ? (
            <TodoListView
              tasks={todo.tasks}
              loading={todo.loading}
              error={todo.error}
              // Use the context executor key for creator comparison — task.creator
              // is set by the backend from the executor's public key, not the
              // namespace-level selfIdentity from listGroupMembers.
              selfIdentity={lobby.executorPublicKey ?? lobby.selfIdentity}
              members={lobby.members}
              memberNames={memberNames}
              onCreateTask={todo.createTask}
              onCompleteTask={todo.completeTask}
              onReopenTask={todo.reopenTask}
              onEditTask={todo.editTask}
              onDeleteTask={todo.deleteTask}
              onAssignTask={todo.assignTask}
            />
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#475569',
              fontSize: '0.9rem',
            }}>
              Connecting to workspace…
            </div>
          )}
        </div>
      </div>

      {showInvite && (
        <InviteModal
          onInvite={lobby.inviteUser}
          onClose={() => setShowInvite(false)}
        />
      )}
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
  );
}
