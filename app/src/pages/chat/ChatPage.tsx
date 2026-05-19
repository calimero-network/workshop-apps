import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { useTaskList } from '../../hooks/useTaskList';
import Sidebar from '../../components/Sidebar';
import TaskListView from '../../components/TaskListView';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

export default function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useMero();
  const lobby = useChatLobby();
  const tasks = useTaskList(lobby.lobbyContextId, lobby.executorPublicKey);

  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  // Poll members while the page is open (no SSE channel for namespace joins)
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const interval = setInterval(() => { void lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(interval);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  // Welcome screen — shown ONLY when there are no workspaces at all.
  // Never gate on !lobbyJoined — that flips false on every workspace switch
  // and would flash the welcome screen mid-transition.
  if (lobby.lobbies.length === 0 && !lobby.lobbiesLoading) {
    return (
      <div className="app-bg">
        <div className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ color: 'var(--color-primary, #3B82F6)', fontWeight: 700 }}>
            Welcome to Team Todo
          </h2>
          <p style={{ color: '#888', maxWidth: 380, textAlign: 'center', fontSize: '0.9rem' }}>
            Create a workspace for your team or join one with an invitation link.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setShowCreateWorkspace(true)}
              style={{
                padding: '0.5rem 1.2rem',
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
                padding: '0.5rem 1.2rem',
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
          onInvite={() => setShowInvite(true)}
        />

        {/* Main content — task list */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {lobby.lobbyContextId ? (
            <TaskListView
              tasks={tasks.tasks}
              loading={tasks.loading}
              error={tasks.error}
              selfExecutorKey={lobby.executorPublicKey}
              onCreateTask={tasks.createTask}
              onCompleteTask={tasks.completeTask}
              onUncompleteTask={tasks.uncompleteTask}
              onEditTask={tasks.editTask}
              onDeleteTask={tasks.deleteTask}
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
              {lobby.lobbiesLoading ? 'Connecting…' : 'Select a workspace to see tasks.'}
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
