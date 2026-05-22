import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { useCounterWorkspace } from '../../hooks/useCounterWorkspace';
import { useCounter } from '../../hooks/useCounter';
import { APP_NAME } from '../../config';
import Sidebar from '../../components/Sidebar';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import CounterView from '../../components/CounterView';

export default function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useMero();
  const workspace = useCounterWorkspace();

  const counter = useCounter(
    workspace.counterContextId,
    workspace.executorPublicKey,
  );

  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  // Subscribe to workspace-level events and refresh members on any change.
  useSubscription(
    workspace.counterContextId ? [workspace.counterContextId] : [],
    () => { workspace.refetchMembers(); },
  );

  // Poll members — no SSE channel for namespace joins.
  useEffect(() => {
    if (!workspace.namespaceId) return;
    const interval = setInterval(() => { workspace.refetchMembers(); }, 5_000);
    return () => clearInterval(interval);
  }, [workspace.namespaceId, workspace.refetchMembers]);

  // Welcome screen when no workspaces exist yet.
  if (workspace.workspaces.length === 0 && !workspace.workspacesLoading) {
    return (
      <div className="app-bg">
        <div className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ fontWeight: 700 }}>{APP_NAME}</h2>
          <p style={{ color: '#888' }}>Create a new workspace or join one with an invitation.</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setShowCreateWorkspace(true)}
              style={{
                padding: '0.5rem 1.25rem',
                background: 'var(--color-primary, #3B82F6)',
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
          onInvite={() => setShowInvite(true)}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {workspace.counterContextId ? (
            <CounterView
              counter={counter.counter}
              loading={counter.loading}
              error={counter.error}
              onIncrement={counter.increment}
              onReset={counter.reset}
              currentExecutorKey={counter.executorKey}
            />
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666',
              fontSize: '0.9rem',
            }}>
              {workspace.workspacesLoading ? 'Loading workspace…' : 'Connecting to counter…'}
            </div>
          )}
        </div>
      </div>

      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onCreate={async (name) => { await workspace.createWorkspace(name); }}
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
