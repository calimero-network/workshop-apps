import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMero } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { useKnowledgeGraph } from '../../hooks/useKnowledgeGraph';
import Sidebar, { type ActiveView } from '../../components/Sidebar';
import DocumentDetailView from '../../components/DocumentDetailView';
import GraphVisualizationView from '../../components/GraphVisualizationView';
import TagFilterView from '../../components/TagFilterView';
import CreateDocumentModal from '../../components/CreateDocumentModal';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

export default function ChatPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useMero();
  const lobby = useChatLobby();

  // The lobbyContextId IS the knowledge-graph context (single-service app).
  const graph = useKnowledgeGraph(lobby.lobbyContextId, lobby.executorPublicKey);

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('list');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const [showCreateDoc, setShowCreateDoc] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  // Poll members while the page is open (no SSE for membership joins)
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const interval = setInterval(() => { lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(interval);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  // Auto-select first document when list loads
  useEffect(() => {
    if (graph.documents.length > 0 && !selectedDocId) {
      setSelectedDocId(graph.documents[0].id);
    }
  }, [graph.documents, selectedDocId]);

  const handleSelectDoc = useCallback((docId: string) => {
    setSelectedDocId(docId);
    setActiveView('list');
  }, []);

  const handleSelectTag = useCallback((tag: string | null) => {
    setActiveTag(tag);
    if (tag) setActiveView('tag-filter');
  }, []);

  const handleSetView = useCallback((view: ActiveView) => {
    setActiveView(view);
    if (view !== 'tag-filter') setActiveTag(null);
  }, []);

  const handleCreateDoc = useCallback(async (title: string, content: string) => {
    const id = await graph.createDocument(title, content);
    if (id) setSelectedDocId(id);
  }, [graph]);

  const selectedDoc = graph.documents.find((d) => d.id === selectedDocId) ?? null;

  // Welcome screen: no workspaces yet
  if (lobby.lobbies.length === 0 && !lobby.lobbiesLoading) {
    return (
      <div className="app-bg">
        <div className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ color: '#f1f5f9' }}>No workspaces yet</h2>
          <p style={{ color: '#64748b', maxWidth: 380, textAlign: 'center' }}>
            Create a new knowledge-graph workspace or join one with an invitation.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setShowCreateWorkspace(true)}
              style={{
                padding: '0.5rem 1.25rem',
                background: 'var(--color-accent, #8B5CF6)',
                color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
              }}
            >
              Create Workspace
            </button>
            <button
              onClick={() => setShowJoin(true)}
              style={{
                padding: '0.5rem 1.25rem',
                background: '#1e293b', color: '#cbd5e1',
                border: '1px solid #334155', borderRadius: 6, cursor: 'pointer',
              }}
            >
              Join with Invitation
            </button>
          </div>
          {showCreateWorkspace && (
            <CreateWorkspaceModal
              onCreate={async (name) => { await lobby.createLobby(name); setShowCreateWorkspace(false); }}
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

  return (
    <div className="app-bg">
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar
          workspaces={lobby.lobbies}
          selectedNamespaceId={lobby.namespaceId}
          onSelectWorkspace={lobby.selectLobby}
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          workspaceAlias={lobby.selectedLobby?.alias}
          members={lobby.members}
          selfIdentity={lobby.selfIdentity}
          onInvite={() => setShowInvite(true)}
          documents={graph.documents}
          tagsByDocument={graph.tagsByDocument}
          selectedDocId={selectedDocId}
          onSelectDoc={handleSelectDoc}
          onCreateDoc={() => setShowCreateDoc(true)}
          activeView={activeView}
          onSetView={handleSetView}
          activeTag={activeTag}
          onSelectTag={handleSelectTag}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0a1628' }}>
          {/* Error banner */}
          {graph.error && (
            <div style={{
              padding: '0.5rem 1rem',
              background: 'rgba(239,68,68,0.1)',
              borderBottom: '1px solid rgba(239,68,68,0.2)',
              color: '#fca5a5', fontSize: '0.8rem',
            }}>
              {graph.error.message}
            </div>
          )}

          {/* Loading indicator */}
          {graph.loading && graph.documents.length === 0 && (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#475569', fontSize: '0.9rem',
            }}>
              Loading knowledge graph…
            </div>
          )}

          {/* Graph view */}
          {!graph.loading || graph.documents.length > 0 ? (
            activeView === 'graph' ? (
              <GraphVisualizationView
                documents={graph.documents}
                links={graph.links}
                selectedDocId={selectedDocId}
                onSelectDoc={handleSelectDoc}
              />
            ) : activeView === 'tag-filter' ? (
              <TagFilterView
                documents={graph.documents}
                tagsByDocument={graph.tagsByDocument}
                activeTag={activeTag}
                onSelectTag={handleSelectTag}
                onSelectDoc={handleSelectDoc}
              />
            ) : selectedDoc ? (
              <DocumentDetailView
                document={selectedDoc}
                tags={graph.tagsByDocument[selectedDoc.id] ?? []}
                links={graph.links}
                allDocuments={graph.documents}
                selfIdentity={lobby.selfIdentity}
                executorKey={graph.executorKey}
                onEditDocument={(t, c) => graph.editDocument(selectedDoc.id, t, c)}
                onAddTag={(label) => graph.addTag(selectedDoc.id, label).then(() => {})}
                onRemoveTag={graph.removeTag}
                onCreateLink={(srcText, tgtDocId, tgtText) =>
                  graph.createLink(selectedDoc.id, srcText, tgtDocId, tgtText).then(() => {})
                }
                onDeleteLink={graph.deleteLink}
                onSelectDoc={handleSelectDoc}
              />
            ) : (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#475569', flexDirection: 'column', gap: '0.75rem',
              }}>
                <div style={{ fontSize: '2rem' }}>📄</div>
                <div>
                  {graph.documents.length === 0
                    ? 'No documents yet — create one to get started'
                    : 'Select a document from the sidebar'}
                </div>
                <button
                  onClick={() => setShowCreateDoc(true)}
                  style={{
                    padding: '0.4rem 1rem',
                    background: 'var(--color-accent, #8B5CF6)',
                    color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  + New Document
                </button>
              </div>
            )
          ) : null}
        </div>
      </div>

      {showCreateDoc && (
        <CreateDocumentModal
          onCreate={handleCreateDoc}
          onClose={() => setShowCreateDoc(false)}
        />
      )}
      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onCreate={async (name) => { await lobby.createLobby(name); setShowCreateWorkspace(false); }}
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
