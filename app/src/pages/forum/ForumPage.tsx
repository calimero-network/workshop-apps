import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { useForumWorkspace } from '../../hooks/useForumWorkspace';
import { useCommunity } from '../../hooks/useCommunity';
import { HubClient, CommunitySummary } from '../../api/hub/HubClient';
import { SERVICE_NAME } from '../../config';
import ForumSidebar from '../../components/ForumSidebar';
import HubView from '../../components/HubView';
import CommunityFeedView from '../../components/CommunityFeedView';
import PostDetailView from '../../components/PostDetailView';
import CommunitySettingsView from '../../components/CommunitySettingsView';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import CreateCommunityModal from '../../components/CreateCommunityModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

// Mirror generate_id from Rust: "comm-{ts_ms}-{8-hex-nonce}"
function generateCommunityId(): string {
  const ts = Date.now();
  const nonce = crypto.getRandomValues(new Uint8Array(4));
  const hex = Array.from(nonce).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `comm-${ts}-${hex}`;
}

type ViewState =
  | { kind: 'hub' }
  | { kind: 'feed'; community: CommunitySummary }
  | { kind: 'post'; community: CommunitySummary; postId: string }
  | { kind: 'settings'; community: CommunitySummary };

export default function ForumPage() {
  const navigate = useNavigate();
  const { isAuthenticated, mero } = useMero();
  const workspace = useForumWorkspace();

  const [communities, setCommunities] = useState<CommunitySummary[]>([]);
  const [viewState, setViewState] = useState<ViewState>({ kind: 'hub' });
  const [showCreateCommunity, setShowCreateCommunity] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // The active community context ID (when viewing feed/post/settings)
  const activeCommunityContextId =
    viewState.kind !== 'hub' && viewState.community.context_id
      ? viewState.community.context_id
      : null;

  const community = useCommunity(activeCommunityContextId, workspace.executorPublicKey);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const fetchCommunities = useCallback(async () => {
    if (!mero || !workspace.hubContextId || !workspace.executorPublicKey) return;
    try {
      const client = new HubClient(mero, workspace.hubContextId, workspace.executorPublicKey);
      const list = await client.getCommunities();
      setCommunities(list);
    } catch (err) {
      console.error('Failed to fetch communities:', err);
    }
  }, [mero, workspace.hubContextId, workspace.executorPublicKey]);

  useEffect(() => {
    if (workspace.workspaceJoined) {
      fetchCommunities();
    }
  }, [workspace.workspaceJoined, fetchCommunities]);

  // React to hub state changes
  useSubscription(
    workspace.hubContextId ? [workspace.hubContextId] : [],
    () => {
      fetchCommunities();
      workspace.refetchMembers();
    },
  );

  // Poll members (no SSE for namespace membership)
  useEffect(() => {
    if (!workspace.namespaceId) return;
    const interval = setInterval(() => { workspace.refetchMembers(); }, 5_000);
    return () => clearInterval(interval);
  }, [workspace.namespaceId, workspace.refetchMembers]);

  const handleCreateCommunity = useCallback(async (name: string, topic: string) => {
    if (!mero || !workspace.hubContextId || !workspace.executorPublicKey || !workspace.namespaceId) return;

    const appId = workspace.selectedWorkspace?.applicationId;
    if (!appId) return;

    const client = new HubClient(mero, workspace.hubContextId, workspace.executorPublicKey);
    const communityId = generateCommunityId();

    try {
      const initParams = JSON.stringify({
        community_id: communityId,
        name,
        topic,
      });
      const initBytes = Array.from(new TextEncoder().encode(initParams));

      const instanceServiceName = SERVICE_NAME.instance;
      if (!instanceServiceName) {
        throw new Error('No "instance" service declared in studio.config.json');
      }
      const { contextId } = await mero.admin.createContext({
        applicationId: appId,
        groupId: workspace.namespaceId,
        serviceName: instanceServiceName,
        initializationParams: initBytes,
      });

      await client.registerCommunity({
        community_id: communityId,
        name,
        topic,
        context_id: contextId,
      });
      setShowCreateCommunity(false);
      await fetchCommunities();
    } catch (err) {
      console.error('Failed to create community:', err);
    }
  }, [mero, workspace, fetchCommunities]);

  const handleSelectCommunity = useCallback(async (comm: CommunitySummary) => {
    if (!comm.context_id || !mero) {
      setViewState({ kind: 'feed', community: comm });
      return;
    }

    // Join the community context with safety timeout
    const joinTimeout = new Promise<void>((resolve) => setTimeout(resolve, 5_000));
    await Promise.race([
      mero.admin.joinContext(comm.context_id).then(() => {}).catch(() => {}),
      joinTimeout,
    ]);

    setViewState({ kind: 'feed', community: comm });
  }, [mero]);

  const handleViewPost = useCallback((postId: string) => {
    if (viewState.kind === 'hub') return;
    setViewState({ kind: 'post', community: viewState.community, postId });
  }, [viewState]);

  const handleBackToFeed = useCallback(() => {
    if (viewState.kind === 'hub') return;
    setViewState({ kind: 'feed', community: viewState.community });
  }, [viewState]);

  const handleBackToHub = useCallback(() => {
    setViewState({ kind: 'hub' });
  }, []);

  const handleOpenSettings = useCallback(() => {
    if (viewState.kind === 'hub') return;
    setViewState({ kind: 'settings', community: viewState.community });
  }, [viewState]);

  // Welcome screen: no workspaces at all
  if (workspace.workspaces.length === 0 && !workspace.workspacesLoading) {
    return (
      <div className="app-bg">
        <div className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ color: 'var(--color-primary)' }}>Welcome to Decentra Forum</h2>
          <p style={{ color: '#888' }}>Create a new workspace or join one with an invitation.</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setShowCreateWorkspace(true)}>Create Workspace</button>
            <button onClick={() => setShowJoin(true)}>Join with Invitation</button>
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
        <ForumSidebar
          workspaces={workspace.workspaces}
          selectedNamespaceId={workspace.namespaceId}
          onSelectWorkspace={workspace.selectWorkspace}
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          workspaceAlias={workspace.selectedWorkspace?.alias}
          members={workspace.members}
          selfIdentity={workspace.selfIdentity}
          communities={communities}
          selectedCommunityId={viewState.kind !== 'hub' ? viewState.community.id : null}
          onSelectCommunity={handleSelectCommunity}
          onCreateCommunity={() => setShowCreateCommunity(true)}
          onInvite={() => setShowInvite(true)}
          onBackToHub={handleBackToHub}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {viewState.kind === 'hub' && (
            <HubView
              communities={communities}
              onSelectCommunity={handleSelectCommunity}
              onCreateCommunity={() => setShowCreateCommunity(true)}
            />
          )}
          {viewState.kind === 'feed' && activeCommunityContextId && (
            <CommunityFeedView
              community={viewState.community}
              posts={community.posts}
              loading={community.postsLoading}
              selfIdentity={community.communityExecutorKey}
              moderators={community.moderators}
              onCreatePost={community.createPost}
              onVote={community.castVote}
              onViewPost={handleViewPost}
              onDeletePost={community.deletePost}
              onModerateRemovePost={community.moderateRemovePost}
              onOpenSettings={handleOpenSettings}
              onBack={handleBackToHub}
            />
          )}
          {viewState.kind === 'post' && activeCommunityContextId && (
            <PostDetailView
              community={viewState.community}
              postId={viewState.postId}
              posts={community.posts}
              comments={community.comments}
              commentsLoading={community.commentsLoading}
              selfIdentity={community.communityExecutorKey}
              moderators={community.moderators}
              onFetchComments={community.fetchComments}
              onCreateComment={community.createComment}
              onEditPost={community.editPost}
              onDeletePost={community.deletePost}
              onEditComment={community.editComment}
              onDeleteComment={community.deleteComment}
              onVote={community.castVote}
              onModerateRemovePost={community.moderateRemovePost}
              onModerateRemoveComment={community.moderateRemoveComment}
              onBack={handleBackToFeed}
              onRefreshPosts={community.refreshPosts}
            />
          )}
          {viewState.kind === 'settings' && activeCommunityContextId && (
            <CommunitySettingsView
              community={viewState.community}
              moderators={community.moderators}
              members={workspace.members}
              selfIdentity={community.communityExecutorKey}
              onRenameCommunity={community.renameCommunity}
              onAppointModerator={community.appointModerator}
              onRevokeModerator={community.revokeModerator}
              onRefreshModerators={community.refreshModerators}
              onBack={handleBackToFeed}
            />
          )}
          {viewState.kind !== 'hub' && !activeCommunityContextId && (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666',
            }}>
              Loading community...
            </div>
          )}
        </div>
      </div>

      {showCreateCommunity && (
        <CreateCommunityModal
          onSubmit={handleCreateCommunity}
          onClose={() => setShowCreateCommunity(false)}
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
