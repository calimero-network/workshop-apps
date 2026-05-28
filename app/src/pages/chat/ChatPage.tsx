import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { useTrackerData } from '../../hooks/useTrackerData';
import { TrackerClient } from '../../api/tracker/TrackerClient';
import Sidebar from '../../components/Sidebar';
import SubmissionQueueView from '../../components/SubmissionQueueView';
import TaskBoardView from '../../components/TaskBoardView';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

type ActiveTab = 'submissions' | 'tasks';

export default function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated, mero } = useMero();
  const lobby = useChatLobby();

  const [activeTab, setActiveTab] = useState<ActiveTab>('tasks');
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  // Tracker data for the currently selected project.
  const tracker = useTrackerData(
    lobby.lobbyContextId,
    lobby.executorPublicKey,
  );

  // Keep members current (no SSE channel for namespace joins).
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const interval = setInterval(() => { void lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(interval);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  // Refresh tracker data when lobby context emits events.
  useSubscription(
    lobby.lobbyContextId ? [lobby.lobbyContextId] : [],
    () => {
      void tracker.refresh();
      void lobby.refetchMembers();
    },
  );

  // Create project: 1) create namespace + context, 2) call create_project to
  // set owner and project name in the tracker contract state.
  const handleCreateProject = useCallback(async (name: string) => {
    if (!mero) return;
    setCreateProjectError(null);
    try {
      const result = await lobby.createLobby(name);
      if (result) {
        const client = new TrackerClient(mero, result.lobbyContextId, result.memberPublicKey);
        await client.createProject({ name });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCreateProjectError(msg);
      console.error('Failed to initialize project:', err);
    }
  }, [mero, lobby]);

  // Welcome screen when no projects exist yet.
  if (lobby.lobbies.length === 0 && !lobby.lobbiesLoading) {
    return (
      <div className="app-bg">
        <div className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ color: 'var(--color-primary)' }}>Welcome to Project Tracker</h2>
          <p style={{ color: '#888' }}>Create a project or join one with an invitation to get started.</p>
          {createProjectError && (
            <div style={{ color: '#fca5a5', fontSize: '0.85rem' }}>{createProjectError}</div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setShowCreateProject(true)}
              style={{
                padding: '0.5rem 1.25rem', background: 'var(--color-primary)', color: '#fff',
                border: 'none', borderRadius: 6, cursor: 'pointer',
              }}
            >
              Create Project
            </button>
            <button
              onClick={() => setShowJoin(true)}
              style={{
                padding: '0.5rem 1.25rem', background: '#1e293b', color: '#cbd5e1',
                border: '1px solid #334155', borderRadius: 6, cursor: 'pointer',
              }}
            >
              Join with Invitation
            </button>
          </div>
          {showCreateProject && (
            <CreateWorkspaceModal
              onCreate={handleCreateProject}
              onClose={() => setShowCreateProject(false)}
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

  const projectName = lobby.selectedLobby?.alias || 'Project';

  return (
    <div className="app-bg">
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar
          workspaces={lobby.lobbies}
          selectedNamespaceId={lobby.namespaceId}
          onSelectWorkspace={lobby.selectLobby}
          onCreateWorkspace={() => setShowCreateProject(true)}
          workspaceAlias={lobby.selectedLobby?.alias}
          members={lobby.members}
          selfIdentity={lobby.selfIdentity}
          onInvite={() => setShowInvite(true)}
        />

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            padding: '0.75rem 1.25rem',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#0f172a',
          }}>
            <div>
              <h2 style={{ fontSize: '1.05rem', color: '#e2e8f0', fontWeight: 700 }}>
                {projectName}
              </h2>
              {lobby.isAdmin && (
                <span style={{
                  fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: 4,
                  background: 'rgba(16,185,129,0.15)', color: '#6ee7b7',
                }}>
                  Owner
                </span>
              )}
            </div>

            {/* Tab switcher */}
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {([
                { id: 'tasks', label: 'Tasks' },
                { id: 'submissions', label: 'Submissions' },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    background: activeTab === tab.id ? 'var(--color-primary)' : '#1e293b',
                    color: activeTab === tab.id ? '#fff' : '#94a3b8',
                    fontWeight: activeTab === tab.id ? 600 : 400,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Loading / error state */}
          {tracker.loading && tracker.submissions.length === 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
              Loading project data…
            </div>
          )}

          {tracker.error && tracker.submissions.length === 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fca5a5', fontSize: '0.85rem' }}>
              {tracker.error.message}
            </div>
          )}

          {/* Tab content */}
          {(!tracker.loading || tracker.submissions.length > 0) && !tracker.error && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {activeTab === 'submissions' ? (
                <SubmissionQueueView
                  submissions={tracker.submissions}
                  triageResults={tracker.approvedTasks}
                  selfIdentity={tracker.executorPublicKey}
                  isOwner={lobby.isAdmin}
                  onTriage={tracker.triageSubmission}
                  onEdit={tracker.editSubmission}
                  onWithdraw={tracker.withdrawSubmission}
                />
              ) : (
                <TaskBoardView
                  approvedTasks={tracker.approvedTasks}
                  submissions={tracker.submissions}
                  onSubmitRequest={tracker.submitRequest}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateProject && (
        <CreateWorkspaceModal
          onCreate={handleCreateProject}
          onClose={() => setShowCreateProject(false)}
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
