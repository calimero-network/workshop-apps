import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { useVotingWorkspace } from '../../hooks/useVotingWorkspace';
import { useVotingContext } from '../../hooks/useVotingContext';
import { Vote } from '../../api/voting/VotingClient';
import Sidebar from '../../components/Sidebar';
import VoteDetailView from '../../components/RoomView';
import CreateVoteModal from '../../components/CreateRoomModal';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

export default function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useMero();
  const workspace = useVotingWorkspace();
  const voting = useVotingContext(
    workspace.votingContextId,
    workspace.executorPublicKey,
  );

  const [selectedVote, setSelectedVote] = useState<Vote | null>(null);
  const [showCreateVote, setShowCreateVote] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  // Keep selected vote in sync with live data (e.g., when it gets closed)
  useEffect(() => {
    if (!selectedVote) return;
    const updated = voting.votes.find((v) => v.id === selectedVote.id);
    if (updated) setSelectedVote(updated);
  }, [voting.votes]);

  // Poll members while page is open (no SSE channel for namespace membership)
  useEffect(() => {
    if (!workspace.namespaceId) return;
    const interval = setInterval(() => { void workspace.refetchMembers(); }, 5_000);
    return () => clearInterval(interval);
  }, [workspace.namespaceId, workspace.refetchMembers]);

  // Refresh votes on lobby subscription events
  useSubscription(
    workspace.votingContextId ? [workspace.votingContextId] : [],
    () => { void voting.refresh(); workspace.refetchMembers(); },
  );

  const handleCreateVote = useCallback(async (title: string, options: string[]) => {
    await voting.createVote(title, options);
    setShowCreateVote(false);
  }, [voting]);

  const handleSelectVote = useCallback((vote: Vote) => {
    setSelectedVote(vote);
    void voting.fetchRankings(vote.id);
  }, [voting]);

  // Welcome screen when no workspaces exist
  if (workspace.workspaces.length === 0 && !workspace.workspacesLoading) {
    return (
      <div className="app-bg">
        <div className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ color: '#e2e8f0' }}>No workspaces yet</h2>
          <p style={{ color: '#888' }}>Create a new workspace or join one with an invitation.</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setShowCreateWorkspace(true)}
              style={{
                padding: '0.5rem 1.25rem', background: 'var(--color-primary, #2563EB)',
                color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
              }}
            >
              Create Workspace
            </button>
            <button
              onClick={() => setShowJoin(true)}
              style={{
                padding: '0.5rem 1.25rem', background: '#1e293b',
                color: '#cbd5e1', border: '1px solid #334155', borderRadius: 8, cursor: 'pointer',
              }}
            >
              Join with Invitation
            </button>
          </div>

          {showCreateWorkspace && (
            <CreateWorkspaceModal
              onCreate={async (name) => { await workspace.createWorkspace(name); }}
              onClose={() => setShowCreateWorkspace(false)}
            />
          )}
          {showJoin && (
            <JoinModal
              onJoin={async (json) => { await workspace.joinWorkspace(json); setShowJoin(false); }}
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
          workspaces={workspace.workspaces}
          selectedNamespaceId={workspace.namespaceId}
          onSelectWorkspace={workspace.selectWorkspace}
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          workspaceAlias={workspace.selectedWorkspace?.alias}
          members={workspace.members}
          selfIdentity={workspace.selfIdentity}
          votes={voting.votes}
          selectedVoteId={selectedVote?.id ?? null}
          onSelectVote={handleSelectVote}
          onCreateVote={() => setShowCreateVote(true)}
          onInvite={() => setShowInvite(true)}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedVote ? (
            <VoteDetailView
              vote={selectedVote}
              rankings={voting.rankings}
              votingExecutorKey={voting.votingExecutorKey}
              onSubmitRanking={voting.submitRanking}
              onUpdateRanking={voting.updateRanking}
              onCloseVote={voting.closeVote}
              onFetchRankings={voting.fetchRankings}
            />
          ) : (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '1rem',
              color: '#64748b',
            }}>
              {workspace.workspaceJoined && voting.votes.length === 0 && !voting.loading ? (
                <>
                  <p style={{ fontSize: '0.9rem' }}>No votes yet in this workspace.</p>
                  <button
                    onClick={() => setShowCreateVote(true)}
                    style={{
                      padding: '0.5rem 1.25rem',
                      background: 'var(--color-primary, #2563EB)',
                      color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
                    }}
                  >
                    Create First Vote
                  </button>
                </>
              ) : (
                <p style={{ fontSize: '0.9rem' }}>
                  {workspace.workspaceJoined ? 'Select a vote from the sidebar' : 'Connecting…'}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {showCreateVote && (
        <CreateVoteModal
          onSubmit={handleCreateVote}
          onClose={() => setShowCreateVote(false)}
        />
      )}
      {showInvite && (
        <InviteModal
          onInvite={workspace.inviteUser}
          onClose={() => setShowInvite(false)}
        />
      )}
      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onCreate={async (name) => { await workspace.createWorkspace(name); }}
          onClose={() => setShowCreateWorkspace(false)}
        />
      )}
      {showJoin && (
        <JoinModal
          onJoin={async (json) => { await workspace.joinWorkspace(json); setShowJoin(false); }}
          onClose={() => setShowJoin(false)}
        />
      )}
    </div>
  );
}
