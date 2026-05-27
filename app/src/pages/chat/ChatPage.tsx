/**
 * ChatPage — living-memorial main page.
 *
 * Composes:
 *  - useChatLobby  → namespace selection, members, invites
 *  - useMemorial   → memories, reactions, comments for the active memorial context
 *  - Sidebar       → memorial switcher + contributor list + invite
 *  - MemorialTimeline → the main reverse-chronological memory feed
 *
 * Architecture notes:
 *  - Each "workspace" is a memorial namespace containing one `memorial` context.
 *  - There are no per-instance sub-contexts (no room creation flow).
 *  - Welcome gate is `lobbies.length === 0`, never `!lobbyJoined`, to avoid
 *    flashing the welcome screen on every namespace switch.
 *  - Members are polled every 5 s (no SSE channel for namespace joins).
 */

import React, { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { useMemorial } from '../../hooks/useMemorial';
import Sidebar from '../../components/Sidebar';
import MemorialTimeline from '../../components/MemorialTimeline';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

export default function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useMero();
  const lobby = useChatLobby();

  // The memorial context IS the lobby context — single service per namespace.
  const memorial = useMemorial(
    lobby.lobbyContextId,
    lobby.executorPublicKey,
  );

  const [showCreateWorkspace, setShowCreateWorkspace] = React.useState(false);
  const [showInvite, setShowInvite] = React.useState(false);
  const [showJoin, setShowJoin] = React.useState(false);

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  // Poll namespace membership (no SSE channel for joins via invitation).
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const id = setInterval(() => { void lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(id);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  const handleCreateWorkspace = useCallback(async (name: string) => {
    await lobby.createLobby(name);
    setShowCreateWorkspace(false);
  }, [lobby]);

  // ── Welcome screen — only when there are NO memorials yet ───────────────────
  if (lobby.lobbies.length === 0 && !lobby.lobbiesLoading) {
    return (
      <div className="app-bg">
        <div className="page-shell" style={{
          justifyContent: 'center',
          alignItems: 'center',
          gap: '1.25rem',
          textAlign: 'center',
        }}>
          <span style={{ fontSize: '3rem' }}>🕊️</span>
          <h2 style={{ margin: 0, color: 'var(--color-primary)', fontSize: '1.4rem' }}>
            Welcome to Living Memorial
          </h2>
          <p style={{ color: '#6b5f8a', maxWidth: 380, margin: 0 }}>
            Create a memorial space to preserve and celebrate their story,
            or join one with an invitation from a family member.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => setShowCreateWorkspace(true)}
              style={{
                padding: '0.6rem 1.25rem',
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 600,
              }}
            >
              Create Memorial
            </button>
            <button
              onClick={() => setShowJoin(true)}
              style={{
                padding: '0.6rem 1.25rem',
                background: 'transparent',
                color: 'var(--color-primary)',
                border: '1px solid rgba(107,76,154,0.5)',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Join with Invitation
            </button>
          </div>

          {showCreateWorkspace && (
            <CreateWorkspaceModal
              onCreate={handleCreateWorkspace}
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

  // ── Main layout ─────────────────────────────────────────────────────────────
  return (
    <div className="app-bg">
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        {/* Sidebar: workspace list + contributors + invite */}
        <Sidebar
          workspaces={lobby.lobbies}
          selectedNamespaceId={lobby.namespaceId}
          onSelectWorkspace={lobby.selectLobby}
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          workspaceAlias={lobby.selectedLobby?.alias}
          members={lobby.members}
          selfIdentity={lobby.selfIdentity}
          onInvite={() => setShowInvite(true)}
        />

        {/* Main content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {lobby.lobbyContextId ? (
            <MemorialTimeline
              memorial={memorial}
              memorialName={lobby.selectedLobby?.alias}
            />
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6b5f8a',
              fontSize: '0.9rem',
            }}>
              {lobby.groupLoading ? 'Loading memorial…' : 'Select or create a memorial'}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onCreate={handleCreateWorkspace}
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
