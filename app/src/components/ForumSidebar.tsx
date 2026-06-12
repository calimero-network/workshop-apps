import React from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import { CommunitySummary } from '../api/hub/HubClient';
import type { WorkspaceRecord } from '../hooks/useForumWorkspace';

interface ForumSidebarProps {
  workspaces: WorkspaceRecord[];
  selectedNamespaceId: string | null;
  onSelectWorkspace: (nsId: string) => void;
  onCreateWorkspace: () => void;
  workspaceAlias?: string;

  members: GroupMember[];
  selfIdentity: string | null;

  communities: CommunitySummary[];
  selectedCommunityId: string | null;
  onSelectCommunity: (community: CommunitySummary) => void;
  onCreateCommunity: () => void;
  onInvite: () => void;
  onBackToHub: () => void;
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

export default function ForumSidebar({
  workspaces,
  selectedNamespaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  workspaceAlias,
  members,
  selfIdentity,
  communities,
  selectedCommunityId,
  onSelectCommunity,
  onCreateCommunity,
  onInvite,
  onBackToHub,
}: ForumSidebarProps) {
  const memberCount = members.length + (selfIdentity ? 1 : 0);

  return (
    <div style={{
      width: 270,
      borderRight: '1px solid #1e293b',
      display: 'flex',
      flexDirection: 'column',
      background: '#0f172a',
    }}>
      {/* Workspace header */}
      <div style={{
        padding: '1rem',
        borderBottom: '1px solid #1e293b',
      }}>
        <h2 style={{
          fontSize: '1rem',
          fontWeight: 700,
          color: 'var(--color-primary)',
          marginBottom: '0.2rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        }} onClick={onBackToHub}>
          {workspaceAlias || 'Decentra Forum'}
        </h2>
        <span style={{ color: '#64748b', fontSize: '0.78rem' }}>
          {memberCount} member{memberCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Workspace list */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.25rem', paddingLeft: '0.25rem' }}>
          WORKSPACES
        </div>
        {workspaces.map((ws) => (
          <div
            key={ws.namespaceId}
            onClick={() => onSelectWorkspace(ws.namespaceId)}
            style={{
              padding: '0.35rem 0.6rem',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.82rem',
              background: ws.namespaceId === selectedNamespaceId
                ? 'rgba(30,64,175,0.15)'
                : 'transparent',
              color: ws.namespaceId === selectedNamespaceId ? '#93c5fd' : '#94a3b8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {ws.alias || shortenId(ws.namespaceId)}
          </div>
        ))}
        <div
          onClick={onCreateWorkspace}
          style={{
            padding: '0.35rem 0.6rem',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.78rem',
            color: '#64748b',
            marginTop: workspaces.length > 0 ? 2 : 0,
          }}
          title="Create a new workspace"
        >
          + New workspace
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: '0.5rem', display: 'flex', gap: '0.25rem', borderBottom: '1px solid #1e293b' }}>
        <button
          onClick={onCreateCommunity}
          style={{
            flex: 1,
            padding: '0.4rem',
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          + Community
        </button>
        <button
          onClick={onInvite}
          style={{
            flex: 1,
            padding: '0.4rem',
            background: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #334155',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          Invite
        </button>
      </div>

      {/* Community list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem' }}>
        <div style={{ fontSize: '0.7rem', color: '#64748b', margin: '0.5rem 0.5rem 0.25rem' }}>
          COMMUNITIES
        </div>
        {communities.length === 0 && (
          <div style={{ padding: '1rem', color: '#475569', fontSize: '0.8rem', textAlign: 'center' }}>
            No communities yet
          </div>
        )}
        {communities.map((comm) => (
          <div
            key={comm.id}
            onClick={() => onSelectCommunity(comm)}
            style={{
              padding: '0.55rem 0.7rem',
              borderRadius: 6,
              cursor: 'pointer',
              background: comm.id === selectedCommunityId ? 'rgba(30,64,175,0.15)' : 'transparent',
              color: comm.id === selectedCommunityId ? '#93c5fd' : '#cbd5e1',
              marginBottom: 2,
            }}
          >
            <div style={{ fontSize: '0.88rem', fontWeight: 500 }}>{comm.name}</div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
              {comm.topic} · {comm.member_count} member{comm.member_count !== 1 ? 's' : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
