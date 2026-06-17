import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero } from '@calimero-network/mero-react';
import { useTripWorkspace } from '../../hooks/useTripWorkspace';
import { useTripData } from '../../hooks/useTripData';
import Sidebar from '../../components/Sidebar';
import FeedView from '../../components/FeedView';
import LedgerView from '../../components/LedgerView';
import TripSettingsView from '../../components/TripSettingsView';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

type TabId = 'feed' | 'ledger' | 'settings';

// Presence/names are not provided by the trip service, so we use a
// lightweight stub that tracks online members via subscription events.
// Full presence would require a dedicated lobby/directory service.
const EMPTY_ONLINE = new Set<string>();
const EMPTY_NAMES: Record<string, string> = {};

export default function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useMero();
  const workspace = useTripWorkspace();

  const [activeTab, setActiveTab] = useState<TabId>('feed');
  const [tripStatus, setTripStatus] = useState<string | null>(null);

  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  // Per-trip data hook driven by the resolved trip context
  const trip = useTripData(workspace.tripContextId, workspace.executorPublicKey);

  // Poll members while the page is open (no SSE for namespace membership)
  useEffect(() => {
    if (!workspace.namespaceId) return;
    const id = setInterval(() => { void workspace.refetchMembers(); }, 5_000);
    return () => clearInterval(id);
  }, [workspace.namespaceId, workspace.refetchMembers]);

  // tripStatus is maintained locally: the backend enforces the freeze,
  // but we drive the UI flag ourselves since there's no get_trip_status view.

  const allMemberIdentities = [
    ...(workspace.selfIdentity ? [workspace.selfIdentity] : []),
    ...workspace.members.map((m) => m.identity),
  ];

  const handleFinishTrip = useCallback(async () => {
    await trip.finishTrip();
    setTripStatus('finished');
  }, [trip]);

  // Welcome screen — only when no workspaces exist at all
  if (workspace.workspaces.length === 0 && !workspace.workspacesLoading) {
    return (
      <div className="app-bg">
        <div className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
          <div style={{ fontSize: '3rem' }}>✈️</div>
          <h2 style={{ color: '#e2e8f0', fontWeight: 700 }}>No trips yet</h2>
          <p style={{ color: '#64748b', maxWidth: 360, textAlign: 'center', lineHeight: 1.6 }}>
            Start a new trip to begin tracking expenses, sharing locations, and posting photos with your group.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setShowCreateWorkspace(true)}
              style={{
                padding: '0.6rem 1.2rem',
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Start a Trip
            </button>
            <button
              onClick={() => setShowJoin(true)}
              style={{
                padding: '0.6rem 1.2rem',
                background: '#1e293b',
                color: '#94a3b8',
                border: '1px solid #334155',
                borderRadius: 8,
                cursor: 'pointer',
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
              onJoin={async (json) => {
                await workspace.joinWorkspace(json);
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
          workspaces={workspace.workspaces}
          selectedNamespaceId={workspace.namespaceId}
          onSelectWorkspace={workspace.selectWorkspace}
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          members={workspace.members}
          selfIdentity={workspace.selfIdentity}
          onlineMembers={EMPTY_ONLINE}
          memberNames={EMPTY_NAMES}
          onSetName={async (_name) => { /* presence/names not in trip service */ }}
          onInvite={() => setShowInvite(true)}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{
            display: 'flex',
            gap: 0,
            borderBottom: '1px solid #1e293b',
            background: '#0a0f1a',
            padding: '0 1rem',
          }}>
            {(['feed', 'ledger', 'settings'] as TabId[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '0.7rem 1rem',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${activeTab === tab ? 'var(--color-primary)' : 'transparent'}`,
                  color: activeTab === tab ? 'var(--color-primary)' : '#64748b',
                  cursor: 'pointer',
                  fontSize: '0.84rem',
                  fontWeight: activeTab === tab ? 600 : 400,
                  textTransform: 'capitalize',
                  transition: 'all 0.15s',
                }}
              >
                {tab === 'feed' ? '🗺️ Feed' : tab === 'ledger' ? '💰 Ledger' : '⚙️ Settings'}
              </button>
            ))}
          </div>

          {/* No trip context yet */}
          {!workspace.tripContextId && (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#64748b', flexDirection: 'column', gap: '0.5rem',
            }}>
              <div style={{ fontSize: '2rem' }}>⏳</div>
              <div>Loading trip data…</div>
            </div>
          )}

          {/* Tab content */}
          {workspace.tripContextId && activeTab === 'feed' && (
            <FeedView
              locations={trip.locations}
              expenses={trip.expenses}
              photos={trip.photos}
              tripStatus={tripStatus}
              memberNames={EMPTY_NAMES}
              selfIdentity={workspace.selfIdentity}
              loading={trip.loading}
              onPostLocation={trip.postLocation}
              onLogExpense={trip.logExpense}
              onUploadPhoto={trip.uploadPhoto}
              allMemberIdentities={allMemberIdentities}
            />
          )}

          {workspace.tripContextId && activeTab === 'ledger' && (
            <LedgerView
              expenses={trip.expenses}
              settlement={trip.settlement}
              memberNames={EMPTY_NAMES}
              loading={trip.loading}
            />
          )}

          {workspace.tripContextId && activeTab === 'settings' && (
            <TripSettingsView
              tripAlias={workspace.selectedWorkspace?.alias}
              tripStatus={tripStatus}
              members={workspace.members}
              selfIdentity={workspace.selfIdentity}
              onlineMembers={EMPTY_ONLINE}
              memberNames={EMPTY_NAMES}
              onFinishTrip={handleFinishTrip}
              onInvite={() => setShowInvite(true)}
            />
          )}

          {/* Error banner */}
          {trip.error && (
            <div style={{
              position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)',
              background: '#7f1d1d', color: '#fca5a5', padding: '0.5rem 1rem',
              borderRadius: 6, fontSize: '0.82rem', zIndex: 200,
            }}>
              {trip.error.message}
            </div>
          )}
        </div>
      </div>

      {showInvite && (
        <InviteModal
          onInvite={workspace.inviteUser}
          onClose={() => setShowInvite(false)}
        />
      )}
      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onCreate={async (name) => { await workspace.createWorkspace(name); setShowCreateWorkspace(false); }}
          onClose={() => setShowCreateWorkspace(false)}
        />
      )}
      {showJoin && (
        <JoinModal
          onJoin={async (json) => {
            await workspace.joinWorkspace(json);
            setShowJoin(false);
          }}
          onClose={() => setShowJoin(false)}
        />
      )}
    </div>
  );
}
