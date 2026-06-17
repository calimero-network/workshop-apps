import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { useLobbyDirectory } from '../../hooks/useLobbyDirectory';
import { useStreakBoard } from '../../hooks/useStreakBoard';
import { C } from '../../theme';
import Sidebar from '../../components/Sidebar';
import BoardView from '../../components/BoardView';
import LeaderboardView from '../../components/LeaderboardView';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import WorkspacesEmptyState from '../../components/WorkspacesEmptyState';
import AddHabitModal from '../../components/AddHabitModal';

type Tab = 'board' | 'leaderboard';

export default function ChatPage() {
  const { mero } = useMero();
  const lobby = useChatLobby();

  // lobbyContextId doubles as the boardContextId for this single-service app.
  const { onlineMembers, memberNames, setName } = useLobbyDirectory(
    lobby.lobbyContextId,
    lobby.lobbyExecutorPublicKey,
  );

  const board = useStreakBoard(
    lobby.lobbyContextId,
    lobby.lobbyExecutorPublicKey,
  );

  const [activeTab, setActiveTab] = useState<Tab>('board');
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Poll members for newcomers (no SSE for namespace membership).
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const id = setInterval(() => { void lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(id);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  // Refresh board when the board context gets a sync event.
  useSubscription(
    lobby.lobbyContextId ? [lobby.lobbyContextId] : [],
    () => {
      void board.refresh();
      void lobby.refetchMembers();
    },
  );

  // Show the Welcome screen only when there are truly no workspaces yet.
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
    <Root>
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
        viewerIsAdmin={lobby.isAdmin}
        onSetMemberRole={lobby.setMemberRole}
        onRemoveMember={lobby.removeMember}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      <Main>
        {/* Tab bar */}
        <TabBar>
          <Tab $active={activeTab === 'board'} onClick={() => setActiveTab('board')}>
            &#127917; Board
          </Tab>
          <Tab $active={activeTab === 'leaderboard'} onClick={() => setActiveTab('leaderboard')}>
            &#127942; Leaderboard
          </Tab>
        </TabBar>

        {/* Content */}
        {activeTab === 'board' ? (
          <BoardView
            habits={board.habits}
            selfIdentity={lobby.selfIdentity}
            memberNames={memberNames}
            onCheckIn={board.checkIn}
            onCheer={board.sendCheer}
            onGetCheers={board.getCheers}
            onAddHabit={() => setShowAddHabit(true)}
            loading={board.loading}
          />
        ) : (
          <LeaderboardView
            leaderboard={board.leaderboard}
            selfIdentity={lobby.selfIdentity}
            memberNames={memberNames}
            loading={board.loading}
          />
        )}
      </Main>

      {/* Modals */}
      {showAddHabit && (
        <AddHabitModal
          onSubmit={async (title) => {
            await board.createHabit(title);
            setShowAddHabit(false);
          }}
          onClose={() => setShowAddHabit(false)}
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
    </Root>
  );
}

/* ── styles ── */
const Root = styled.div`
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--c-paper, ${C.paper});
  color: var(--c-ink, ${C.ink});
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
`;

const Main = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
`;

const TabBar = styled.div`
  display: flex;
  border-bottom: 1px solid ${C.line};
  background: ${C.paper};
  flex-shrink: 0;
`;

const Tab = styled.button<{ $active?: boolean }>`
  padding: 14px 24px;
  font-size: 14px;
  font-weight: ${(p) => (p.$active ? 700 : 600)};
  color: ${(p) => (p.$active ? C.greenInk : C.muted)};
  background: transparent;
  border: none;
  border-bottom: 2px solid ${(p) => (p.$active ? 'var(--color-primary, #F59E0B)' : 'transparent')};
  cursor: pointer;
  transition: color 0.14s, border-color 0.14s;
  &:hover { color: ${C.ink}; }
`;
