/**
 * ChatPage — main todos page.
 *
 * Uses `useChatLobby` (unchanged) for workspace/namespace management, and
 * `useTodosState` for the shared task list that lives in the single todos
 * context per workspace.
 *
 * `useLobbyDirectory` is not used here because the `todos` service does not
 * expose heartbeat / list_presence / list_names / set_name methods.  Members
 * are shown by their alias/identity from the namespace roster.  Online dots
 * are displayed grey (all-offline) since presence is not part of the todos
 * ABI — a future upgrade can add a lobby-style service to the stack.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { useTodosState } from '../../hooks/useTodosState';
import Sidebar from '../../components/Sidebar';
import TodoListView from '../../components/TodoListView';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

export default function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useMero();
  const lobby = useChatLobby();

  // The todos context IS the workspace context (no per-instance split).
  const todos = useTodosState(lobby.lobbyContextId, lobby.executorPublicKey);

  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  // Re-fetch members on lobby subscription events (membership changes
  // coincide with task sync events for the same namespace).
  useSubscription(
    lobby.lobbyContextId ? [lobby.lobbyContextId] : [],
    () => { lobby.refetchMembers(); },
  );

  // No SSE channel for namespace membership — poll so the roster stays current.
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const interval = setInterval(() => { lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(interval);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  // ── Build a memberNames map from the lobby executor key for self, plus
  //    member aliases for peers.  This is the display-name record passed down
  //    to TodoListView and Sidebar so they can show human-readable names.
  //    (A future version could add a `set_name` method to the todos service.)
  const memberNames: Record<string, string> = {};
  for (const m of lobby.members) {
    if (m.alias) memberNames[m.identity] = m.alias;
  }

  // ── Welcome / no-workspace gate ───────────────────────────────────────────
  if (lobby.lobbies.length === 0 && !lobby.lobbiesLoading) {
    return (
      <div className="app-bg">
        <div className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ color: 'var(--color-primary)' }}>Welcome to Team Todos</h2>
          <p style={{ color: '#888' }}>Create a workspace or join one with an invitation to get started.</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setShowCreateWorkspace(true)}
              style={{
                padding: '0.5rem 1.25rem',
                background: 'var(--color-primary, #3B82F6)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Create Workspace
            </button>
            <button
              onClick={() => setShowJoin(true)}
              style={{
                padding: '0.5rem 1.25rem',
                background: 'transparent',
                color: '#94a3b8',
                border: '1px solid #334155',
                borderRadius: 6,
                cursor: 'pointer',
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
          onlineMembers={new Set<string>()}
          memberNames={memberNames}
          onSetName={async () => { /* name-setting not in todos ABI */ }}
          onInvite={() => setShowInvite(true)}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {lobby.lobbyJoined ? (
            <TodoListView
              tasks={todos.tasks}
              loading={todos.loading}
              error={todos.error}
              selfExecutorKey={todos.executorPublicKey}
              memberNames={memberNames}
              onCreateTask={todos.createTask}
              onAssignTask={todos.assignTask}
              onCompleteTask={todos.completeTask}
              onEditTask={todos.editTask}
              onDeleteTask={todos.deleteTask}
            />
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
              fontSize: '0.9rem',
            }}>
              Connecting to workspace…
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
