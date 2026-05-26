import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { useForumFeed } from '../../hooks/useForumFeed';
import type { Post } from '../../api/forum/ForumClient';
import Sidebar from '../../components/Sidebar';
import ForumFeed from '../../components/ForumFeed';
import PostDetail from '../../components/PostDetail';
import CreatePostModal from '../../components/CreatePostModal';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

// No presence/heartbeat needed for this single-service forum app.
// Member names come from the admin member list; online status is omitted
// since the forum backend doesn't expose presence endpoints.
const NO_ONLINE: Set<string> = new Set();
const NO_NAMES: Record<string, string> = {};

type View = 'feed' | 'detail';

export default function ForumPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useMero();

  // Redirect unauthenticated users
  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  // ── Pod workspace state ────────────────────────────────────────────────────
  const lobby = useChatLobby();

  // Members polling (no SSE for membership changes)
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const id = setInterval(() => { void lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(id);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  // ── Forum feed state ───────────────────────────────────────────────────────
  const forum = useForumFeed(lobby.lobbyContextId, lobby.executorPublicKey);

  // ── View navigation ────────────────────────────────────────────────────────
  const [view, setView] = useState<View>('feed');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  // Reset to feed when switching pods
  useEffect(() => {
    setView('feed');
    setSelectedPost(null);
  }, [lobby.namespaceId]);

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // ── Post handlers ──────────────────────────────────────────────────────────
  const handleCreatePost = useCallback(async (
    title: string,
    body: string,
    post_type: string,
  ) => {
    await forum.createPost(title, body, post_type);
  }, [forum]);

  const handleEditPost = useCallback(async (
    title: string,
    body: string,
    _post_type: string,
  ) => {
    if (!editingPost) return;
    // The spec's edit_post only changes the body; title is immutable post-creation.
    await forum.editPost(editingPost.id, body);
    setEditingPost(null);
  }, [forum, editingPost]);

  const handleDeletePost = useCallback(async (postId: string) => {
    await forum.deletePost(postId);
    if (selectedPost?.id === postId) {
      setSelectedPost(null);
      setView('feed');
    }
  }, [forum, selectedPost]);

  const handleSelectPost = useCallback((post: Post) => {
    setSelectedPost(post);
    setView('detail');
  }, []);

  // ── Welcome screen ─────────────────────────────────────────────────────────
  // Gate on workspaces.length === 0, NOT on !lobbyJoined (that flips on every
  // workspace switch and would flash the welcome screen mid-transition).
  if (lobby.lobbies.length === 0 && !lobby.lobbiesLoading) {
    return (
      <div className="app-bg">
        <div className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ fontSize: '2.5rem' }}>📊</div>
          <h2 style={{ margin: 0, color: '#f9fafb' }}>No trading pods yet</h2>
          <p style={{ color: '#9ca3af', maxWidth: 400, textAlign: 'center', margin: 0 }}>
            Create a private pod for your trading group, or join one with an invitation.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => setShowCreateWorkspace(true)}
              style={{
                padding: '0.6rem 1.25rem',
                background: 'var(--color-accent, #10B981)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.9rem',
              }}
            >
              Create pod
            </button>
            <button
              onClick={() => setShowJoin(true)}
              style={{
                padding: '0.6rem 1.25rem',
                background: 'transparent',
                color: '#9ca3af',
                border: '1px solid #374151',
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
              onCreate={async (name) => {
                await lobby.createLobby(name);
                setShowCreateWorkspace(false);
              }}
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

        {/* Sidebar */}
        <Sidebar
          workspaces={lobby.lobbies}
          selectedNamespaceId={lobby.namespaceId}
          onSelectWorkspace={lobby.selectLobby}
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          workspaceAlias={lobby.selectedLobby?.alias}
          members={lobby.members}
          selfIdentity={lobby.selfIdentity}
          onlineMembers={NO_ONLINE}
          memberNames={NO_NAMES}
          onSetName={async () => {}} // no name service in single-service app
          onInvite={() => setShowInvite(true)}
        />

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#111827' }}>
          {!lobby.lobbyJoined ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#6b7280', fontSize: '0.9rem',
            }}>
              Connecting to pod…
            </div>
          ) : view === 'detail' && selectedPost ? (
            <PostDetail
              post={selectedPost}
              forum={forum}
              selfExecutorKey={forum.forumExecutorKey}
              memberNames={NO_NAMES}
              onBack={() => setView('feed')}
              onEditPost={(post) => {
                setEditingPost(post);
              }}
            />
          ) : (
            <ForumFeed
              posts={forum.posts}
              loading={forum.loading}
              error={forum.error}
              selfExecutorKey={forum.forumExecutorKey}
              memberNames={NO_NAMES}
              onSelectPost={handleSelectPost}
              onCreatePost={() => setShowCreatePost(true)}
              onEditPost={(post) => setEditingPost(post)}
              onDeletePost={handleDeletePost}
            />
          )}
        </div>
      </div>

      {/* Create / edit post modal */}
      {(showCreatePost || editingPost) && (
        <CreatePostModal
          initialPost={editingPost ?? null}
          onSubmit={editingPost ? handleEditPost : handleCreatePost}
          onClose={() => {
            setShowCreatePost(false);
            setEditingPost(null);
          }}
        />
      )}

      {/* Invite modal */}
      {showInvite && (
        <InviteModal
          onInvite={lobby.inviteUser}
          onClose={() => setShowInvite(false)}
        />
      )}

      {/* Create workspace (pod) modal */}
      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onCreate={async (name) => {
            await lobby.createLobby(name);
            setShowCreateWorkspace(false);
          }}
          onClose={() => setShowCreateWorkspace(false)}
        />
      )}

      {/* Join modal */}
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
