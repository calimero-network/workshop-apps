import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero } from '@calimero-network/mero-react';
import { useWhiteboardWorkspace } from '../../hooks/useWhiteboardWorkspace';
import type { ProjectRecord } from '../../hooks/useWhiteboardWorkspace';
import Sidebar from '../../components/Sidebar';
import WhiteboardView from '../../components/WhiteboardView';
import CreateProjectModal from '../../components/CreateProjectModal';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

export default function WhiteboardPage() {
  const navigate = useNavigate();
  const { isAuthenticated, mero } = useMero();
  const workspace = useWhiteboardWorkspace();

  const [selectedProject, setSelectedProject] = useState<ProjectRecord | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  // Clear selected project when workspace changes
  useEffect(() => {
    setSelectedProject(null);
  }, [workspace.namespaceId]);

  const handleSelectProject = useCallback(async (project: ProjectRecord) => {
    if (!mero) return;

    // Join the project's context if not already in it — bound by 5 s timeout
    // so a hang doesn't freeze the UI.
    const joinTimeout = new Promise<void>((resolve) => setTimeout(resolve, 5_000));
    await Promise.race([
      mero.admin.joinContext(project.contextId).then(() => {}).catch(() => {}),
      joinTimeout,
    ]);

    setSelectedProject(project);
  }, [mero]);

  const handleCreateProject = useCallback(async (name: string) => {
    await workspace.createProject(name);
    setShowCreateProject(false);
  }, [workspace]);

  // ── Welcome screen when no workspaces exist ────────────────────────────────
  if (workspace.workspaces.length === 0 && !workspace.workspacesLoading) {
    return (
      <div className="app-bg">
        <div className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', gap: '1.25rem' }}>
          <h2 style={{ color: 'var(--color-primary)', fontSize: '1.4rem' }}>Welcome to Collab Whiteboard</h2>
          <p style={{ color: '#888', maxWidth: 380, textAlign: 'center', fontSize: '0.9rem' }}>
            Create a workspace for your team, or join one using an invitation.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => setShowCreateWorkspace(true)}
              style={{
                padding: '0.5rem 1.25rem',
                background: 'var(--color-primary, #5B21B6)',
                color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.9rem',
              }}
            >
              Create Workspace
            </button>
            <button
              onClick={() => setShowJoin(true)}
              style={{
                padding: '0.5rem 1.25rem',
                background: '#1e1a30', color: '#c4b5fd',
                border: '1px solid #3d3d6e', borderRadius: 8, cursor: 'pointer', fontSize: '0.9rem',
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
          workspaceAlias={workspace.selectedWorkspace?.alias}
          members={workspace.members}
          selfIdentity={workspace.selfIdentity}
          projects={workspace.projects}
          selectedProjectId={selectedProject?.contextId ?? null}
          onSelectProject={handleSelectProject}
          onCreateProject={() => setShowCreateProject(true)}
          onInvite={() => setShowInvite(true)}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedProject ? (
            <WhiteboardView
              key={selectedProject.contextId}
              contextId={selectedProject.contextId}
              projectName={selectedProject.alias}
              executorPublicKey={null}
            />
          ) : (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              color: '#64748b', gap: '1rem',
            }}>
              <div style={{ fontSize: '2.5rem' }}>✦</div>
              <div style={{ fontSize: '1rem', color: '#94a3b8' }}>
                Select a project or create a new one
              </div>
              <button
                onClick={() => setShowCreateProject(true)}
                disabled={workspace.createProjectLoading}
                style={{
                  padding: '0.5rem 1.25rem',
                  background: 'var(--color-primary, #5B21B6)',
                  color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.9rem',
                }}
              >
                + New Project
              </button>
            </div>
          )}
        </div>
      </div>

      {showCreateProject && (
        <CreateProjectModal
          onSubmit={handleCreateProject}
          onClose={() => setShowCreateProject(false)}
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
