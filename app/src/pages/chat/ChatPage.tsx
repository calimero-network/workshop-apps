import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useSubscription } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { useExpenses } from '../../hooks/useExpenses';
import Sidebar from '../../components/Sidebar';
import SubmitExpenseView from '../../components/SubmitExpenseView';
import ReviewDashboard from '../../components/ReviewDashboard';
import SpendingSummaryView from '../../components/SpendingSummaryView';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import WorkspacesEmptyState from '../../components/WorkspacesEmptyState';
import { C } from '../../theme';

type View = 'my-expenses' | 'review' | 'summary';

export default function ChatPage() {
  const lobby = useChatLobby();

  // The expenses service is the single workspace-level context.
  // executorPublicKey is resolved by useChatLobby via getContextIdentitiesOwned.
  const expenses = useExpenses(lobby.lobbyContextId, lobby.executorPublicKey);

  const [activeView, setActiveView] = useState<View>('my-expenses');
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Poll members (no SSE channel for namespace joins).
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const id = setInterval(() => { lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(id);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  // Refresh expenses on any lobby event (e.g. when subscription fires).
  useSubscription(
    lobby.lobbyContextId ? [lobby.lobbyContextId] : [],
    () => { lobby.refetchMembers(); },
  );

  // Welcome screen when there are no workspaces at all.
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
            onJoin={async (json) => { await lobby.joinLobby(json); setShowJoin(false); }}
            onClose={() => setShowJoin(false)}
          />
        )}
      </>
    );
  }

  return (
    <Shell>
      <Sidebar
        workspaces={lobby.lobbies}
        selectedNamespaceId={lobby.namespaceId}
        onSelectWorkspace={lobby.selectLobby}
        onCreateWorkspace={() => setShowCreateWorkspace(true)}
        workspaceAlias={lobby.selectedLobby?.alias}
        members={lobby.members}
        selfIdentity={lobby.selfIdentity}
        onlineMembers={new Set<string>()}
        memberNames={{}}
        onSetName={async () => {}}
        onInvite={() => setShowInvite(true)}
        viewerIsAdmin={lobby.isAdmin}
        onSetMemberRole={lobby.setMemberRole}
        onRemoveMember={lobby.removeMember}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      <Main>
        {/* Tab navigation */}
        <TabBar>
          <Tab $active={activeView === 'my-expenses'} onClick={() => setActiveView('my-expenses')}>
            <TabIcon>📋</TabIcon> My Expenses
          </Tab>
          <Tab $active={activeView === 'review'} onClick={() => setActiveView('review')}>
            <TabIcon>🔍</TabIcon> Review Queue
            {expenses.pendingExpenses.length > 0 && (
              <TabBadge>{expenses.pendingExpenses.length}</TabBadge>
            )}
          </Tab>
          <Tab $active={activeView === 'summary'} onClick={() => setActiveView('summary')}>
            <TabIcon>📊</TabIcon> Spending Summary
          </Tab>
        </TabBar>

        {/* Content area — show loading indicator if not ready */}
        {!lobby.lobbyJoined ? (
          <Centered>
            <Spinner />
            <LoadText>Connecting to workspace…</LoadText>
          </Centered>
        ) : (
          <Content>
            {activeView === 'my-expenses' && (
              <SubmitExpenseView
                myExpenses={expenses.myExpenses}
                categories={expenses.categories}
                loading={expenses.loading}
                onSubmit={expenses.submitExpense}
                onEdit={expenses.editExpense}
                onAddCategory={expenses.addCategory}
              />
            )}
            {activeView === 'review' && (
              <ReviewDashboard
                pendingExpenses={expenses.pendingExpenses}
                allExpenses={expenses.allExpenses}
                memberNames={{}}
                loading={expenses.loading}
                onApprove={expenses.approveExpense}
                onReject={expenses.rejectExpense}
                onMarkReimbursed={expenses.markReimbursed}
              />
            )}
            {activeView === 'summary' && (
              <SpendingSummaryView
                allExpenses={expenses.allExpenses}
                loading={expenses.loading}
              />
            )}
          </Content>
        )}
      </Main>

      {showInvite && (
        <InviteModal onInvite={lobby.inviteUser} onClose={() => setShowInvite(false)} />
      )}
      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onCreate={async (name) => { await lobby.createLobby(name); }}
          onClose={() => setShowCreateWorkspace(false)}
        />
      )}
      {showJoin && (
        <JoinModal
          onJoin={async (json) => { await lobby.joinLobby(json); setShowJoin(false); }}
          onClose={() => setShowJoin(false)}
        />
      )}
    </Shell>
  );
}

/* ── Styles ── */

const Shell = styled.div`
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: ${C.paper2};
  color: ${C.ink};
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
  align-items: center;
  gap: 2px;
  padding: 10px 16px 0;
  background: ${C.paper};
  border-bottom: 1px solid ${C.line};
  flex-shrink: 0;
`;

const Tab = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 16px;
  border: none;
  border-bottom: 2px solid ${(p) => (p.$active ? 'var(--color-primary)' : 'transparent')};
  background: transparent;
  font-size: 13.5px;
  font-weight: ${(p) => (p.$active ? 700 : 500)};
  color: ${(p) => (p.$active ? 'var(--color-primary)' : C.muted)};
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  white-space: nowrap;
  &:hover { color: ${C.ink}; }
`;

const TabIcon = styled.span`font-size: 15px;`;

const TabBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(234,179,8,0.25);
  color: #b45309;
  font-size: 10.5px;
  font-weight: 700;
`;

const Content = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: ${C.paper2};
`;

const Centered = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
`;

const Spinner = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid ${C.line};
  border-top-color: var(--color-primary);
  animation: spin 0.8s linear infinite;
  @keyframes spin { to { transform: rotate(360deg); } }
`;

const LoadText = styled.p`
  font-size: 14px;
  color: ${C.muted};
`;
