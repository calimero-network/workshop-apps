import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { useTodolist } from '../../hooks/useTodolist';
import Sidebar from '../../components/Sidebar';
import TodoListView from '../../components/TodoListView';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import WorkspacesEmptyState from '../../components/WorkspacesEmptyState';

export default function ChatPage() {
  const { mero } = useMero();
  const lobby = useChatLobby();

  // useTodolist: contextId = the todolist context (== lobbyContextId for single-service)
  // executorPublicKey = the signing key for that context (from the lobby hook)
  const todolist = useTodolist(lobby.lobbyContextId, lobby.executorPublicKey);

  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Poll members while the page is open (no SSE for namespace membership changes).
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const interval = setInterval(() => { void lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(interval);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  // Refresh tasks on any subscription event for the lobby/todolist context.
  useSubscription(
    lobby.lobbyContextId ? [lobby.lobbyContextId] : [],
    () => {
      void todolist.refreshTasks();
      void lobby.refetchMembers();
    },
  );

  // Build member display names from namespace members (no presence endpoint).
  // Falls back to shortened identity for members without a set name.
  const memberNames: Record<string, string> = {};
  if (lobby.selfIdentity) {
    // self has no separate name in this spec — leave empty so identity is shown
  }
  for (const m of lobby.members) {
    if (m.name) memberNames[m.identity] = m.name;
  }

  // Show welcome screen only when there are no workspaces.
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
          memberNames={memberNames}
          onInvite={() => setShowInvite(true)}
          viewerIsAdmin={lobby.isAdmin}
          onSetMemberRole={lobby.setMemberRole}
          onRemoveMember={lobby.removeMember}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />

        {/* Main content — always the todo list view for the selected workspace */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {lobby.lobbyJoined ? (
            <TodoListView
              workspaceName={lobby.selectedLobby?.alias}
              tasks={todolist.tasks}
              openTasks={todolist.openTasks}
              completedTasks={todolist.completedTasks}
              loading={todolist.loading}
              error={todolist.error}
              executorKey={todolist.executorKey}
              members={lobby.members}
              selfIdentity={lobby.selfIdentity}
              memberNames={memberNames}
              onCreateTask={todolist.createTask}
              onMarkComplete={todolist.markComplete}
              onMarkIncomplete={todolist.markIncomplete}
              onEditTask={todolist.editTask}
              onDeleteTask={todolist.deleteTask}
              onAssignTask={todolist.assignTask}
            />
          ) : (
            /* Loading / connecting state */
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              color: 'var(--c-muted)',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}>
              <div style={{
                width: 48, height: 48, display: 'grid', placeItems: 'center',
                borderRadius: 14, background: 'rgba(164,255,17,0.14)',
                border: '1px solid rgba(164,255,17,0.4)',
              }} aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--c-green-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-ink)' }}>
                Connecting to workspace…
              </div>
              <div style={{ fontSize: 13, maxWidth: 300, textAlign: 'center', lineHeight: 1.55 }}>
                Setting up your shared task list. This takes just a moment.
              </div>
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
