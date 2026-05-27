import React from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import type { WorkspaceRecord, ProjectRecord } from '../hooks/useWhiteboardWorkspace';

const MAX_NAME_LEN = 20;

interface SidebarProps {
  // Workspace selector
  workspaces: WorkspaceRecord[];
  selectedNamespaceId: string | null;
  onSelectWorkspace: (nsId: string) => void;
  onCreateWorkspace: () => void;
  workspaceAlias?: string;

  // Member directory
  members: GroupMember[];
  selfIdentity: string | null;

  // Project list
  projects: ProjectRecord[];
  selectedProjectId: string | null;
  onSelectProject: (project: ProjectRecord) => void;
  onCreateProject: () => void;
  onInvite: () => void;
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

export default function Sidebar({
  workspaces,
  selectedNamespaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  workspaceAlias,
  members,
  selfIdentity,
  projects,
  selectedProjectId,
  onSelectProject,
  onCreateProject,
  onInvite,
}: SidebarProps) {
  return (
    <div style={{
      width: 260,
      borderRight: '1px solid #2d2156',
      display: 'flex',
      flexDirection: 'column',
      background: '#120d1f',
      flexShrink: 0,
    }}>
      {/* Workspace header */}
      <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #2d2156' }}>
        <h2 style={{
          fontSize: '1rem', fontWeight: 700,
          color: 'var(--color-primary, #5B21B6)',
          margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {workspaceAlias || 'Collab Whiteboard'}
        </h2>
        <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
          {members.length + (selfIdentity ? 1 : 0)} member{(members.length + (selfIdentity ? 1 : 0)) !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Workspace list — always visible */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #2d2156' }}>
        <div style={{ fontSize: '0.68rem', color: '#64748b', marginBottom: '0.25rem', paddingLeft: '0.25rem', letterSpacing: '0.05em' }}>
          WORKSPACES
        </div>
        {workspaces.map((ws) => (
          <div
            key={ws.namespaceId}
            onClick={() => onSelectWorkspace(ws.namespaceId)}
            style={{
              padding: '0.35rem 0.6rem', borderRadius: 6, cursor: 'pointer',
              fontSize: '0.82rem',
              background: ws.namespaceId === selectedNamespaceId
                ? 'rgba(91,33,182,0.25)' : 'transparent',
              color: ws.namespaceId === selectedNamespaceId ? '#c4b5fd' : '#94a3b8',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {ws.alias || shortenId(ws.namespaceId)}
          </div>
        ))}
        <div
          onClick={onCreateWorkspace}
          style={{
            padding: '0.35rem 0.6rem', borderRadius: 6, cursor: 'pointer',
            fontSize: '0.78rem', color: '#64748b',
            marginTop: workspaces.length > 0 ? 2 : 0,
          }}
          title="Create a new workspace"
        >
          + New workspace
        </div>
      </div>

      {/* Members */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #2d2156' }}>
        <div style={{ fontSize: '0.68rem', color: '#64748b', marginBottom: '0.35rem', paddingLeft: '0.25rem', letterSpacing: '0.05em' }}>
          MEMBERS
        </div>

        {selfIdentity && (
          <div style={{
            padding: '0.35rem 0.6rem', borderRadius: 6, marginBottom: 2,
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--color-accent, #EC4899)', flexShrink: 0,
            }} />
            <span style={{ fontSize: '0.82rem', color: '#e2e8f0',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={selfIdentity}
            >
              {shortenId(selfIdentity)} (you)
            </span>
          </div>
        )}

        {members.map((m) => (
          <div
            key={m.identity}
            style={{
              padding: '0.35rem 0.6rem', borderRadius: 6, marginBottom: 2,
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              color: '#94a3b8', fontSize: '0.82rem',
            }}
            title={m.identity}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#475569', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.alias || shortenId(m.identity)}
            </span>
          </div>
        ))}
      </div>

      {/* Project actions */}
      <div style={{ padding: '0.5rem', display: 'flex', gap: '0.25rem' }}>
        <button
          onClick={onCreateProject}
          style={{
            flex: 1, padding: '0.4rem',
            background: 'var(--color-primary, #5B21B6)',
            color: '#fff', border: 'none', borderRadius: 4,
            cursor: 'pointer', fontSize: '0.8rem',
          }}
        >
          + Project
        </button>
        <button
          onClick={onInvite}
          style={{
            flex: 1, padding: '0.4rem',
            background: '#1e1a30', color: '#cbd5e1',
            border: '1px solid #3d3d6e', borderRadius: 4,
            cursor: 'pointer', fontSize: '0.8rem',
          }}
        >
          Invite
        </button>
      </div>

      {/* Project list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem' }}>
        <div style={{ fontSize: '0.68rem', color: '#64748b', margin: '0.25rem 0.5rem', letterSpacing: '0.05em' }}>
          PROJECTS
        </div>
        {projects.length === 0 && (
          <div style={{ padding: '1rem', color: '#475569', fontSize: '0.8rem', textAlign: 'center' }}>
            No projects yet
          </div>
        )}
        {projects.map((project) => (
          <div
            key={project.contextId}
            data-testid={`sidebar-project-${project.alias}`}
            onClick={() => onSelectProject(project)}
            style={{
              padding: '0.55rem 0.7rem', borderRadius: 6, cursor: 'pointer',
              background: project.contextId === selectedProjectId
                ? 'rgba(91,33,182,0.25)' : 'transparent',
              color: project.contextId === selectedProjectId ? '#c4b5fd' : '#cbd5e1',
              marginBottom: 2,
            }}
          >
            <div style={{ fontSize: '0.88rem' }}>
              ✦ {project.alias}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
