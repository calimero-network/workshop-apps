import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { useClubData } from '../../hooks/useClubData';
import Sidebar from '../../components/Sidebar';
import ActivityFeed from '../../components/ActivityFeed';
import ClubSettingsView from '../../components/ClubSettingsView';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

export default function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useMero();
  const lobby = useChatLobby();

  const [activeView, setActiveView] = useState<'feed' | 'settings'>('feed');
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  // Poll for new members joining via invitation (no SSE channel for namespace membership)
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const id = setInterval(() => { lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(id);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  // React to lobby/club context events — refetch members too as they may coincide
  useSubscription(
    lobby.lobbyContextId ? [lobby.lobbyContextId] : [],
    () => { lobby.refetchMembers(); },
  );

  // Per-club data: workouts, settings, cheers
  const club = useClubData(lobby.lobbyContextId, lobby.lobbyExecutorPublicKey);

  // No workspaces yet — show welcome screen
  if (lobby.lobbies.length === 0 && !lobby.lobbiesLoading) {
    return (
      <div className="app-bg">
        <div className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ fontSize: '3rem' }}>🏋️</div>
          <h2 style={{ color: '#f1f5f9', margin: 0 }}>No clubs yet</h2>
          <p style={{ color: '#64748b', textAlign: 'center', maxWidth: 360, margin: 0 }}>
            Create your first workout club or join one with an invitation from a friend.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => setShowCreateWorkspace(true)}
              style={{
                padding: '0.5rem 1.25rem',
                background: 'var(--color-primary, #E11D48)', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700,
              }}
            >
              Create Club
            </button>
            <button
              onClick={() => setShowJoin(true)}
              style={{
                padding: '0.5rem 1.25rem',
                background: '#1e293b', color: '#94a3b8',
                border: '1px solid #334155', borderRadius: 8, cursor: 'pointer',
              }}
            >
              Join with Invitation
            </button>
          </div>

          {showCreateWorkspace && (
            <CreateWorkspaceModal
              onCreate={async (name, goal) => { await lobby.createLobby(name, goal); }}
              onClose={() => setShowCreateWorkspace(false)}
            />
          )}
          {showJoin && (
            <JoinModal
              onJoin={async (json) => { await lobby.joinLobby(json); setShowJoin(false); }}
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
          memberNames={{}}
          onSetName={async () => {}}
          onInvite={() => setShowInvite(true)}
          activeView={activeView}
          onSelectView={setActiveView}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {activeView === 'feed' ? (
            <ActivityFeed
              workouts={club.workouts}
              settings={club.settings}
              loading={club.loading}
              error={club.error}
              selfExecutorKey={club.clubExecutorKey}
              onLogWorkout={club.logWorkout}
              onEditWorkout={club.editWorkout}
              onDeleteWorkout={club.deleteWorkout}
              onAddCheer={club.addCheer}
              memberNames={{}}
            />
          ) : (
            <ClubSettingsView
              settings={club.settings}
              members={lobby.members}
              selfIdentity={lobby.selfIdentity}
              memberNames={{}}
              isCreator={lobby.isAdmin}
              onSetWeeklyGoal={club.setWeeklyGoal}
              onInvite={() => setShowInvite(true)}
            />
          )}
        </div>
      </div>

      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onCreate={async (name, goal) => { await lobby.createLobby(name, goal); }}
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
          onJoin={async (json) => { await lobby.joinLobby(json); setShowJoin(false); }}
          onClose={() => setShowJoin(false)}
        />
      )}
    </div>
  );
}
