import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { useSoulWorkspace } from '../../hooks/useSoulWorkspace';
import { APP_DISPLAY_NAME } from '../../config';
import Sidebar from '../../components/Sidebar';
import ContextView from '../../components/ContextView';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

// Placeholder memberNames for the sidebar (no presence/name service in soul)
// Member names are tracked locally per-session (set in sidebar via onSetName placeholder).
const EMPTY_NAMES: Record<string, string> = {};

export default function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated, mero } = useMero();
  const workspace = useSoulWorkspace();

  const [showCreateContext, setShowCreateContext] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // Local member display names (no lobby service for soul — names are session-local)
  const [memberNames, setMemberNames] = useState<Record<string, string>>(EMPTY_NAMES);
  const handleSetName = useCallback(async (name: string) => {
    if (!workspace.selfIdentity) return;
    setMemberNames((prev) => ({ ...prev, [workspace.selfIdentity!]: name }));
  }, [workspace.selfIdentity]);

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  // Poll members while page is open (no SSE for namespace membership changes)
  useEffect(() => {
    if (!workspace.namespaceId) return;
    const interval = setInterval(() => { void workspace.refetchMembers(); }, 5_000);
    return () => clearInterval(interval);
  }, [workspace.namespaceId, workspace.refetchMembers]);

  // Refetch contexts when soul context events arrive (catches context creation from other peers)
  useSubscription(
    workspace.soulContextId ? [workspace.soulContextId] : [],
    () => { void workspace.refetchContexts(); },
  );

  // --- Welcome screen: only when there are no contexts at all ---
  if (workspace.workspaces.length === 0 && !workspace.workspacesLoading) {
    return (
      <div className="app-bg">
        <div className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', gap: '1.5rem' }}>
          <h2 style={{ color: '#e2e8f0', margin: 0 }}>Welcome to {APP_DISPLAY_NAME}</h2>
          <p style={{ color: '#64748b', textAlign: 'center', maxWidth: 380, margin: 0 }}>
            Create your personal vault to get started, or join a team space with an invitation.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => setShowCreateContext(true)}
              style={{
                padding: '0.6rem 1.4rem',
                background: 'var(--color-accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 500,
              }}
            >
              Create My Vault
            </button>
            <button
              onClick={() => setShowJoin(true)}
              style={{
                padding: '0.6rem 1.4rem',
                background: '#1e293b',
                color: '#cbd5e1',
                border: '1px solid #334155',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Join Team Space
            </button>
          </div>
          {showCreateContext && (
            <CreateWorkspaceModal
              onCreate={async (name) => { await workspace.createWorkspace(name); }}
              onClose={() => setShowCreateContext(false)}
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

  const isShared = workspace.members.length > 0;

  return (
    <div className="app-bg">
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar
          workspaces={workspace.workspaces}
          selectedNamespaceId={workspace.namespaceId}
          onSelectWorkspace={workspace.selectWorkspace}
          onCreateWorkspace={() => setShowCreateContext(true)}
          workspaceAlias={workspace.selectedWorkspace?.alias}
          members={workspace.members}
          selfIdentity={workspace.selfIdentity}
          memberNames={memberNames}
          onSetName={handleSetName}
          onInvite={() => setShowInvite(true)}
          onJoin={() => setShowJoin(true)}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {workspace.soulContextId ? (
            <ContextView
              contextId={workspace.soulContextId}
              executorPublicKey={workspace.executorPublicKey}
              contextName={workspace.selectedWorkspace?.alias || 'My Vault'}
              isShared={isShared}
              memberNames={memberNames}
            />
          ) : (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#475569', flexDirection: 'column', gap: '0.75rem',
            }}>
              {workspace.workspacesLoading
                ? 'Loading…'
                : 'Select a context from the sidebar or create a new one.'}
            </div>
          )}
        </div>
      </div>

      {showCreateContext && (
        <CreateWorkspaceModal
          onCreate={async (name) => { await workspace.createWorkspace(name); setShowCreateContext(false); }}
          onClose={() => setShowCreateContext(false)}
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
          onJoin={async (json) => { await workspace.joinWorkspace(json); setShowJoin(false); }}
          onClose={() => setShowJoin(false)}
        />
      )}
    </div>
  );
}
