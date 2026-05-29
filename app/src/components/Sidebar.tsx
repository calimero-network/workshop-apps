import React from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import type { Document, Tag } from '../api/knowledge-graph/KnowledgeGraphClient';
import type { LobbyRecord } from '../hooks/useChatLobby';

const MAX_NAME_LEN = 20;

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

export type ActiveView = 'list' | 'graph' | 'tag-filter';

interface SidebarProps {
  // Workspace selector
  workspaces: LobbyRecord[];
  selectedNamespaceId: string | null;
  onSelectWorkspace: (nsId: string) => void;
  onCreateWorkspace: () => void;
  workspaceAlias?: string;

  // Members
  members: GroupMember[];
  selfIdentity: string | null;
  onInvite: () => void;

  // Documents
  documents: Document[];
  tagsByDocument: Record<string, Tag[]>;
  selectedDocId: string | null;
  onSelectDoc: (docId: string) => void;
  onCreateDoc: () => void;
  activeView: ActiveView;
  onSetView: (view: ActiveView) => void;

  // Tag filter
  activeTag: string | null;
  onSelectTag: (tag: string | null) => void;
}

export default function Sidebar({
  workspaces,
  selectedNamespaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  workspaceAlias,
  members,
  selfIdentity,
  onInvite,
  documents,
  tagsByDocument,
  selectedDocId,
  onSelectDoc,
  onCreateDoc,
  activeView,
  onSetView,
  activeTag,
  onSelectTag,
}: SidebarProps) {
  // Collect all unique tags across all documents
  const allTags: string[] = React.useMemo(() => {
    const seen = new Set<string>();
    Object.values(tagsByDocument).forEach((tags) =>
      tags.forEach((t) => seen.add(t.label)),
    );
    return Array.from(seen).sort();
  }, [tagsByDocument]);

  return (
    <div style={{
      width: 260,
      borderRight: '1px solid #1e293b',
      display: 'flex',
      flexDirection: 'column',
      background: '#0f172a',
      flexShrink: 0,
    }}>
      {/* Workspace header */}
      <div style={{ padding: '1rem', borderBottom: '1px solid #1e293b' }}>
        <h2 style={{
          fontSize: '1rem',
          fontWeight: 700,
          color: 'var(--color-accent, #8B5CF6)',
          marginBottom: '0.2rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {workspaceAlias || 'Knowledge Graph'}
        </h2>
        <span style={{ color: '#64748b', fontSize: '0.78rem' }}>
          {members.length + (selfIdentity ? 1 : 0)} member{(members.length + (selfIdentity ? 1 : 0)) === 1 ? '' : 's'}
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
                ? 'rgba(139,92,246,0.15)'
                : 'transparent',
              color: ws.namespaceId === selectedNamespaceId ? '#a78bfa' : '#94a3b8',
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

      {/* View switcher */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b', display: 'flex', gap: '0.25rem' }}>
        {(['list', 'graph', 'tag-filter'] as ActiveView[]).map((v) => (
          <button
            key={v}
            onClick={() => onSetView(v)}
            style={{
              flex: 1,
              padding: '0.3rem',
              fontSize: '0.72rem',
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              background: activeView === v ? 'var(--color-accent, #8B5CF6)' : '#1e293b',
              color: activeView === v ? '#fff' : '#94a3b8',
            }}
          >
            {v === 'list' ? 'Docs' : v === 'graph' ? 'Graph' : 'Tags'}
          </button>
        ))}
      </div>

      {/* Document list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.25rem 0.5rem',
          marginBottom: '0.1rem',
        }}>
          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>DOCUMENTS</span>
          <button
            onClick={onCreateDoc}
            style={{
              fontSize: '0.72rem',
              padding: '0.15rem 0.4rem',
              background: 'var(--color-accent, #8B5CF6)',
              color: '#fff',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
            }}
          >
            + New
          </button>
        </div>

        {/* Tag filter strip (when active) */}
        {activeTag && (
          <div style={{
            margin: '0 0.4rem 0.4rem',
            padding: '0.25rem 0.5rem',
            borderRadius: 4,
            background: 'rgba(139,92,246,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
          }}>
            <span style={{ color: '#a78bfa' }}>#{activeTag}</span>
            <button
              onClick={() => onSelectTag(null)}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.75rem' }}
            >
              ✕
            </button>
          </div>
        )}

        {documents.length === 0 && (
          <div style={{ padding: '1rem', color: '#475569', fontSize: '0.8rem', textAlign: 'center' }}>
            No documents yet
          </div>
        )}

        {documents.map((doc) => {
          const tags = tagsByDocument[doc.id] ?? [];
          return (
            <div
              key={doc.id}
              data-testid={`sidebar-doc-${doc.id}`}
              onClick={() => onSelectDoc(doc.id)}
              style={{
                padding: '0.5rem 0.7rem',
                borderRadius: 6,
                cursor: 'pointer',
                background: doc.id === selectedDocId ? 'rgba(139,92,246,0.15)' : 'transparent',
                color: doc.id === selectedDocId ? '#c4b5fd' : '#cbd5e1',
                marginBottom: 2,
              }}
            >
              <div style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {doc.title || '(untitled)'}
              </div>
              {tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', marginTop: '0.25rem' }}>
                  {tags.slice(0, 4).map((t) => (
                    <span
                      key={t.id}
                      onClick={(e) => { e.stopPropagation(); onSelectTag(t.label); }}
                      style={{
                        fontSize: '0.65rem',
                        padding: '0.1rem 0.3rem',
                        borderRadius: 3,
                        background: 'rgba(139,92,246,0.2)',
                        color: '#a78bfa',
                        cursor: 'pointer',
                      }}
                    >
                      #{t.label}
                    </span>
                  ))}
                  {tags.length > 4 && (
                    <span style={{ fontSize: '0.65rem', color: '#64748b' }}>+{tags.length - 4}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* All tags (tag filter view) */}
      {allTags.length > 0 && (
        <div style={{ padding: '0.5rem', borderTop: '1px solid #1e293b' }}>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.25rem' }}>ALL TAGS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
            {allTags.map((tag) => (
              <span
                key={tag}
                onClick={() => onSelectTag(activeTag === tag ? null : tag)}
                style={{
                  fontSize: '0.7rem',
                  padding: '0.15rem 0.4rem',
                  borderRadius: 3,
                  background: activeTag === tag ? 'rgba(139,92,246,0.4)' : 'rgba(139,92,246,0.1)',
                  color: activeTag === tag ? '#e9d5ff' : '#a78bfa',
                  cursor: 'pointer',
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Invite / member actions */}
      <div style={{ padding: '0.5rem', borderTop: '1px solid #1e293b', display: 'flex', gap: '0.25rem' }}>
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
          Invite Member
        </button>
      </div>
    </div>
  );
}
