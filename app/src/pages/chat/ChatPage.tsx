import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { usePortfolioData } from '../../hooks/usePortfolioData';
import Sidebar from '../../components/Sidebar';
import UpdateFeed from '../../components/UpdateFeed';
import MetricsDashboard from '../../components/MetricsDashboard';
import PostUpdateModal from '../../components/PostUpdateModal';
import LogMetricModal from '../../components/LogMetricModal';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import { APP_NAME } from '../../config';

type View = 'feed' | 'metrics';

export default function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useMero();
  const lobby = useChatLobby();

  const portfolio = usePortfolioData(
    lobby.lobbyContextId,
    lobby.lobbyExecutorPublicKey,
  );

  const [activeView, setActiveView] = useState<View>('feed');
  const [showPostUpdate, setShowPostUpdate] = useState(false);
  const [showLogMetric, setShowLogMetric] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  // Poll members — no SSE channel for namespace membership joins.
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const interval = setInterval(() => { void lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(interval);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  const handlePostUpdate = useCallback(async (companyName: string, body: string) => {
    await portfolio.postUpdate(companyName, body);
    setShowPostUpdate(false);
  }, [portfolio]);

  const handleLogMetric = useCallback(async (
    companyName: string,
    metricName: string,
    value: string,
  ) => {
    await portfolio.logMetric(companyName, metricName, value);
    setShowLogMetric(false);
  }, [portfolio]);

  // Welcome screen — gate on no workspaces, never on !lobbyJoined
  if (lobby.lobbies.length === 0 && !lobby.lobbiesLoading) {
    return (
      <div className="app-bg">
        <div className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ color: '#e2e8f0' }}>Welcome to {APP_NAME}</h2>
          <p style={{ color: '#64748b', maxWidth: 380, textAlign: 'center' }}>
            Create a workspace to start sharing portfolio updates, logging metrics,
            and collaborating with your team.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setShowCreateWorkspace(true)}
              style={{
                padding: '0.5rem 1.25rem',
                background: 'var(--color-accent, #3B82F6)',
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
                padding: '0.5rem 1.25rem',
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
          activeView={activeView}
          onSetView={setActiveView}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Page header */}
          <div style={{
            padding: '0.85rem 1.25rem',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#0f172a',
          }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: '1rem', color: '#e2e8f0' }}>
                {activeView === 'feed' ? 'Update Feed' : 'Metrics Dashboard'}
              </span>
              {lobby.selectedLobby?.alias && (
                <span style={{ color: '#64748b', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                  · {lobby.selectedLobby.alias}
                </span>
              )}
            </div>
            {portfolio.error && (
              <span style={{ color: '#f87171', fontSize: '0.78rem' }}>
                {portfolio.error.message}
              </span>
            )}
          </div>

          {/* Main view */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {activeView === 'feed' ? (
              <UpdateFeed
                updates={portfolio.updates}
                comments={portfolio.comments}
                subscriptions={portfolio.subscriptions}
                selfExecutorKey={portfolio.executorKey}
                loading={portfolio.loading}
                onPostUpdate={() => setShowPostUpdate(true)}
                onPostComment={portfolio.postComment}
                onLoadComments={portfolio.fetchComments}
                onFollowCompany={portfolio.followCompany}
              />
            ) : (
              <MetricsDashboard
                metrics={portfolio.metrics}
                loading={portfolio.loading}
                onLogMetric={() => setShowLogMetric(true)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showPostUpdate && (
        <PostUpdateModal
          onPost={handlePostUpdate}
          onClose={() => setShowPostUpdate(false)}
        />
      )}
      {showLogMetric && (
        <LogMetricModal
          onLog={handleLogMetric}
          onClose={() => setShowLogMetric(false)}
        />
      )}
      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onCreate={async (name) => { await lobby.createLobby(name); }}
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
