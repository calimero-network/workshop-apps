/**
 * DealFlowPage — the main deal-flow app page.
 *
 * Layout: PipelineSidebar on the left, kanban board or closed-deals summary
 * in the main area. Workspace management (create / join / invite) is exposed
 * via modals identical to the foundation chat app.
 */
import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import styled from 'styled-components';
import { useChatLobby } from '../../hooks/useChatLobby';
import { useLobbyDirectory } from '../../hooks/useLobbyDirectory';
import { usePipeline } from '../../hooks/usePipeline';
import PipelineSidebar, { type PipelineView } from '../../components/PipelineSidebar';
import PipelineBoard from '../../components/PipelineBoard';
import ClosedDealsView from '../../components/ClosedDealsView';
import AddLeadModal from '../../components/AddLeadModal';
import ManageStagesModal from '../../components/ManageStagesModal';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import WorkspacesEmptyState from '../../components/WorkspacesEmptyState';
import { C } from '../../theme';

export default function DealFlowPage() {
  const { mero } = useMero();
  const workspace = useChatLobby();

  // Presence + display names (useLobbyDirectory uses the same lobby context
  // to resolve heartbeats and name entries via the pipeline context).
  // For single-service apps the lobby client IS the pipeline context but the
  // LobbyClient wraps the old lobby ABI methods — those won't exist in the
  // pipeline contract. We still call useLobbyDirectory for presence tracking
  // if the pipeline contract implements heartbeat/list_presence/list_names;
  // otherwise we pass null so it no-ops gracefully.
  //
  // For now pass null — the pipeline spec has no presence methods.
  const { onlineMembers, memberNames, setName } = useLobbyDirectory(null, null);

  // Pipeline state for the selected workspace's context.
  const pipeline = usePipeline(
    workspace.lobbyContextId,
    workspace.lobbyExecutorPublicKey,
  );

  const [activeView, setActiveView] = useState<PipelineView>('board');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Modal visibility
  const [showAddLead, setShowAddLead] = useState(false);
  const [showManageStages, setShowManageStages] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // Poll members while page is open (no SSE for membership joins).
  useEffect(() => {
    if (!workspace.namespaceId) return;
    const id = setInterval(() => { void workspace.refetchMembers(); }, 5_000);
    return () => clearInterval(id);
  }, [workspace.namespaceId, workspace.refetchMembers]);

  // Refetch members whenever the lobby context emits an event.
  useSubscription(
    workspace.lobbyContextId ? [workspace.lobbyContextId] : [],
    () => { void workspace.refetchMembers(); },
  );

  const handleAddLead = useCallback(async (name: string, company: string, value: number) => {
    await pipeline.addLead(name, company, value);
  }, [pipeline]);

  const handleSetStages = useCallback(async (stages: string[]) => {
    await pipeline.setStages(stages);
  }, [pipeline]);

  const handleMoveLead = useCallback(async (leadId: string, newStage: string) => {
    await pipeline.moveLead(leadId, newStage);
  }, [pipeline]);

  const handleCloseLead = useCallback(async (leadId: string, outcome: 'Won' | 'Lost') => {
    await pipeline.closeLead(leadId, outcome);
    // Auto-switch to closed view so the user sees the result.
    setActiveView('closed');
  }, [pipeline]);

  // No workspaces → show the empty state / onboarding.
  if (workspace.lobbies.length === 0 && !workspace.lobbiesLoading) {
    return (
      <>
        <WorkspacesEmptyState
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          onJoin={() => setShowJoin(true)}
        />
        {showCreateWorkspace && (
          <CreateWorkspaceModal
            onCreate={async (name) => { await workspace.createLobby(name); }}
            onClose={() => setShowCreateWorkspace(false)}
          />
        )}
        {showJoin && (
          <JoinModal
            onJoin={async (json) => { await workspace.joinLobby(json); setShowJoin(false); }}
            onClose={() => setShowJoin(false)}
          />
        )}
      </>
    );
  }

  return (
    <PageRoot>
      <PipelineSidebar
        workspaces={workspace.lobbies}
        selectedNamespaceId={workspace.namespaceId}
        onSelectWorkspace={workspace.selectLobby}
        onCreateWorkspace={() => setShowCreateWorkspace(true)}
        workspaceAlias={workspace.selectedLobby?.alias}
        members={workspace.members}
        selfIdentity={workspace.selfIdentity}
        onlineMembers={onlineMembers}
        memberNames={memberNames}
        onSetName={setName}
        onInvite={() => setShowInvite(true)}
        viewerIsAdmin={workspace.isAdmin}
        onSetMemberRole={workspace.setMemberRole}
        onRemoveMember={workspace.removeMember}
        activeView={activeView}
        onSelectView={setActiveView}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      <MainArea>
        {!workspace.lobbyContextId ? (
          <Placeholder>
            <div className="icon" aria-hidden>⏳</div>
            <div className="title">Connecting to pipeline…</div>
            <div className="sub">Resolving workspace context. This usually takes a moment.</div>
          </Placeholder>
        ) : activeView === 'board' ? (
          <PipelineBoard
            stages={pipeline.stages}
            leads={pipeline.leads}
            loading={pipeline.loading}
            onMoveLead={handleMoveLead}
            onCloseLead={handleCloseLead}
            onAddLead={() => setShowAddLead(true)}
            onManageStages={() => setShowManageStages(true)}
          />
        ) : (
          <ClosedDealsView
            closedLeads={pipeline.closedLeads}
            loading={pipeline.loading}
          />
        )}
      </MainArea>

      {/* Modals */}
      {showAddLead && (
        <AddLeadModal
          onAdd={handleAddLead}
          onClose={() => setShowAddLead(false)}
        />
      )}
      {showManageStages && (
        <ManageStagesModal
          currentStages={pipeline.stages}
          onSave={handleSetStages}
          onClose={() => setShowManageStages(false)}
        />
      )}
      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onCreate={async (name) => { await workspace.createLobby(name); }}
          onClose={() => setShowCreateWorkspace(false)}
        />
      )}
      {showInvite && (
        <InviteModal
          onInvite={workspace.inviteUser}
          onClose={() => setShowInvite(false)}
        />
      )}
      {showJoin && (
        <JoinModal
          onJoin={async (json) => { await workspace.joinLobby(json); setShowJoin(false); }}
          onClose={() => setShowJoin(false)}
        />
      )}
    </PageRoot>
  );
}

/* ── Styles ── */
const PageRoot = styled.div`
  display: flex; height: 100vh; overflow: hidden;
  background: ${C.paper}; color: ${C.ink};
`;
const MainArea = styled.div`
  flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden;
`;
const Placeholder = styled.div`
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px; text-align: center; padding: 40px;
  .icon { font-size: 36px; line-height: 1; }
  .title { font-size: 18px; font-weight: 700; color: ${C.ink}; letter-spacing: -0.3px; }
  .sub { font-size: 14px; color: ${C.mutedSoft}; max-width: 360px; line-height: 1.55; }
`;
