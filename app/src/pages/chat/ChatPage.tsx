import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { useWhiteboardCanvas } from '../../hooks/useWhiteboardCanvas';
import Sidebar from '../../components/Sidebar';
import CanvasView, { type ActiveTool } from '../../components/CanvasView';
import ToolbarView from '../../components/ToolbarView';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

// Cursor active window: a cursor updated within the last 60 s means the user
// is present on the canvas.
const CURSOR_ACTIVE_MS = 60_000;

export default function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useMero();
  const lobby = useChatLobby();

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  // Canvas state for the currently-selected board context
  const canvas = useWhiteboardCanvas(
    lobby.lobbyContextId,
    lobby.executorPublicKey,
  );

  // Poll namespace members while the page is open (no SSE channel for joins)
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const id = setInterval(() => { void lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(id);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  // Subscribe to canvas events and also refresh member list
  useSubscription(
    lobby.lobbyContextId ? [lobby.lobbyContextId] : [],
    () => {
      void canvas.refresh();
      void lobby.refetchMembers();
    },
  );

  // Toolbar state
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  // Default to the primary theme color declared in studio.config (index.tsx sets it as a CSS var,
  // but we can read it at runtime or fall back to the literal default).
  const [activeColor, setActiveColor] = useState<string>(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#7C3AED',
  );

  // Modals
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // Derive active user IDs from cursor last_updated_at
  const activeUserIds = useMemo<Set<string>>(() => {
    const cutoff = Date.now() - CURSOR_ACTIVE_MS;
    const ids = new Set<string>();
    for (const c of canvas.cursors) {
      if (c.last_updated_at >= cutoff) ids.add(c.user_id);
    }
    return ids;
  }, [canvas.cursors]);

  // Handle board creation: namespace + whiteboard context created by bootstrap
  const handleCreateBoard = useCallback(async (name: string) => {
    await lobby.createLobby(name);
    setShowCreateWorkspace(false);
  }, [lobby]);

  // ── Welcome screen when there are no boards yet ───────────────────────
  if (lobby.lobbies.length === 0 && !lobby.lobbiesLoading) {
    return (
      <div className="app-bg">
        <div
          className="page-shell"
          style={{ justifyContent: 'center', alignItems: 'center', gap: '1.25rem' }}
        >
          <h2 style={{ color: 'var(--color-primary)', fontSize: '1.5rem' }}>
            No boards yet
          </h2>
          <p style={{ color: '#64748b', maxWidth: 360, textAlign: 'center' }}>
            Create a new board to start sketching, or join an existing one with
            an invitation link.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setShowCreateWorkspace(true)}
              style={{
                padding: '0.5rem 1.25rem',
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Create board
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
              Join with invitation
            </button>
          </div>

          {showCreateWorkspace && (
            <CreateWorkspaceModal
              onCreate={handleCreateBoard}
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

  // ── Main whiteboard layout ────────────────────────────────────────────
  return (
    <div className="app-bg" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar: boards + collaborators */}
        <Sidebar
          workspaces={lobby.lobbies}
          selectedNamespaceId={lobby.namespaceId}
          onSelectWorkspace={lobby.selectLobby}
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          workspaceAlias={lobby.selectedLobby?.alias}
          members={lobby.members}
          selfIdentity={lobby.selfIdentity}
          activeUserIds={activeUserIds}
          onInvite={() => setShowInvite(true)}
        />

        {/* Main canvas area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Toolbar */}
          <ToolbarView
            activeTool={activeTool}
            activeColor={activeColor}
            canClear={!!lobby.lobbyContextId}
            onToolChange={setActiveTool}
            onColorChange={setActiveColor}
            onClearCanvas={canvas.clearCanvas}
            onInvite={() => setShowInvite(true)}
          />

          {/* Canvas */}
          {lobby.lobbyContextId ? (
            canvas.loading && canvas.shapes.length === 0 && canvas.texts.length === 0 ? (
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#475569',
              }}>
                Loading canvas…
              </div>
            ) : (
              <CanvasView
                shapes={canvas.shapes}
                texts={canvas.texts}
                cursors={canvas.cursors}
                selfUserId={canvas.executorKey}
                activeTool={activeTool}
                activeColor={activeColor}
                onAddShape={canvas.addShape}
                onUpdateShapePosition={canvas.updateShapePosition}
                onDeleteShape={canvas.deleteShape}
                onAddText={canvas.addText}
                onUpdateText={canvas.updateText}
                onDeleteText={canvas.deleteText}
                onAddComment={canvas.addComment}
                onDeleteComment={canvas.deleteComment}
                onGetCommentsForTarget={canvas.getCommentsForTarget}
                onUpdateCursor={canvas.updateCursor}
              />
            )
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#475569',
            }}>
              Select a board from the sidebar
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onCreate={handleCreateBoard}
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
