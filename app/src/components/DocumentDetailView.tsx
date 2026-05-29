import React, { useState, useRef, useCallback } from 'react';
import type { Document, Tag, Link } from '../api/knowledge-graph/KnowledgeGraphClient';

interface DocumentDetailViewProps {
  document: Document;
  tags: Tag[];
  links: Link[];
  allDocuments: Document[];
  selfIdentity: string | null;
  executorKey: string | null;
  onEditDocument: (newTitle: string, newContent: string) => Promise<void>;
  onAddTag: (label: string) => Promise<void>;
  onRemoveTag: (tagId: string) => Promise<void>;
  onCreateLink: (sourceText: string, targetDocId: string, targetText: string) => Promise<void>;
  onDeleteLink: (linkId: string) => Promise<void>;
  onSelectDoc: (docId: string) => void;
}

export default function DocumentDetailView({
  document,
  tags,
  links,
  allDocuments,
  selfIdentity,
  executorKey,
  onEditDocument,
  onAddTag,
  onRemoveTag,
  onCreateLink,
  onDeleteLink,
  onSelectDoc,
}: DocumentDetailViewProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(document.title);
  const [editingContent, setEditingContent] = useState(false);
  const [draftContent, setDraftContent] = useState(document.content);
  const [newTag, setNewTag] = useState('');
  const [tagBusy, setTagBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  // Link creation state
  const [linkMode, setLinkMode] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [targetDocId, setTargetDocId] = useState('');
  const [targetText, setTargetText] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const isOwner = selfIdentity === document.author || executorKey === document.author;

  // Sync drafts when the doc changes
  React.useEffect(() => {
    setDraftTitle(document.title);
    setDraftContent(document.content);
    setEditingTitle(false);
    setEditingContent(false);
  }, [document.id, document.title, document.content]);

  const commitEdit = useCallback(async () => {
    const t = draftTitle.trim();
    const c = draftContent;
    if (t === document.title && c === document.content) {
      setEditingTitle(false);
      setEditingContent(false);
      return;
    }
    setSaving(true);
    try {
      await onEditDocument(t, c);
      setEditingTitle(false);
      setEditingContent(false);
    } catch {
      // keep draft
    } finally {
      setSaving(false);
    }
  }, [draftTitle, draftContent, document.title, document.content, onEditDocument]);

  const handleAddTag = useCallback(async () => {
    const label = newTag.trim().toLowerCase().replace(/\s+/g, '-');
    if (!label) return;
    setTagBusy(true);
    try {
      await onAddTag(label);
      setNewTag('');
    } catch {
      // keep input
    } finally {
      setTagBusy(false);
    }
  }, [newTag, onAddTag]);

  const handleCaptureLinkText = () => {
    const sel = window.getSelection()?.toString().trim() ?? '';
    if (sel) setSelectedText(sel);
    setLinkMode(true);
  };

  const handleCreateLink = useCallback(async () => {
    if (!selectedText || !targetDocId || !targetText.trim()) return;
    setLinkBusy(true);
    try {
      await onCreateLink(selectedText, targetDocId, targetText.trim());
      setLinkMode(false);
      setSelectedText('');
      setTargetDocId('');
      setTargetText('');
    } catch {
      // keep form
    } finally {
      setLinkBusy(false);
    }
  }, [selectedText, targetDocId, targetText, onCreateLink]);

  // Links where this document is source or target
  const relatedLinks = links.filter(
    (l) => l.source_doc_id === document.id || l.target_doc_id === document.id,
  );

  const docById = (id: string) => allDocuments.find((d) => d.id === id);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1.25rem',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        background: '#0f172a',
      }}>
        {editingTitle ? (
          <input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
              if (e.key === 'Escape') { setDraftTitle(document.title); setEditingTitle(false); }
            }}
            style={{
              flex: 1, fontSize: '1.1rem', fontWeight: 600,
              background: '#1e293b', border: '1px solid #334155',
              borderRadius: 4, color: '#f1f5f9', padding: '0.25rem 0.5rem',
            }}
          />
        ) : (
          <h2
            style={{
              flex: 1, fontSize: '1.1rem', fontWeight: 600, color: '#f1f5f9',
              cursor: isOwner ? 'pointer' : 'default',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            title={isOwner ? 'Click to edit title' : undefined}
            onClick={() => isOwner && setEditingTitle(true)}
          >
            {document.title || '(untitled)'}
          </h2>
        )}
        <span style={{ fontSize: '0.72rem', color: '#475569', whiteSpace: 'nowrap' }}>
          by {document.author ? `${document.author.slice(0, 8)}…` : 'unknown'}
        </span>
        {saving && <span style={{ fontSize: '0.72rem', color: '#64748b' }}>saving…</span>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* Tags */}
        <div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.4rem' }}>TAGS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
            {tags.map((tag) => (
              <span
                key={tag.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.2rem',
                  fontSize: '0.75rem', padding: '0.15rem 0.45rem',
                  borderRadius: 4, background: 'rgba(139,92,246,0.15)',
                  border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa',
                }}
              >
                #{tag.label}
                <button
                  onClick={() => onRemoveTag(tag.id)}
                  style={{
                    background: 'none', border: 'none', color: '#6d28d9',
                    cursor: 'pointer', padding: '0 0.1rem', lineHeight: 1,
                    fontSize: '0.7rem',
                  }}
                  title="Remove tag"
                >
                  ×
                </button>
              </span>
            ))}
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                placeholder="add tag…"
                style={{
                  fontSize: '0.75rem', padding: '0.15rem 0.4rem',
                  background: '#1e293b', border: '1px solid #334155',
                  borderRadius: 4, color: '#cbd5e1', width: 80,
                }}
              />
              <button
                onClick={handleAddTag}
                disabled={tagBusy || !newTag.trim()}
                style={{
                  fontSize: '0.72rem', padding: '0.15rem 0.4rem',
                  background: 'var(--color-accent, #8B5CF6)', color: '#fff',
                  border: 'none', borderRadius: 4, cursor: 'pointer',
                  opacity: tagBusy || !newTag.trim() ? 0.5 : 1,
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '0.4rem',
          }}>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>CONTENT</span>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {isOwner && !editingContent && (
                <button
                  onClick={() => setEditingContent(true)}
                  style={{
                    fontSize: '0.72rem', padding: '0.15rem 0.4rem',
                    background: '#1e293b', color: '#94a3b8',
                    border: '1px solid #334155', borderRadius: 4, cursor: 'pointer',
                  }}
                >
                  Edit
                </button>
              )}
              {isOwner && editingContent && (
                <>
                  <button
                    onClick={commitEdit}
                    disabled={saving}
                    style={{
                      fontSize: '0.72rem', padding: '0.15rem 0.5rem',
                      background: 'var(--color-accent, #8B5CF6)', color: '#fff',
                      border: 'none', borderRadius: 4, cursor: 'pointer',
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setDraftContent(document.content); setEditingContent(false); }}
                    style={{
                      fontSize: '0.72rem', padding: '0.15rem 0.5rem',
                      background: '#1e293b', color: '#94a3b8',
                      border: '1px solid #334155', borderRadius: 4, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </>
              )}
              <button
                onClick={handleCaptureLinkText}
                style={{
                  fontSize: '0.72rem', padding: '0.15rem 0.4rem',
                  background: '#1e293b', color: '#94a3b8',
                  border: '1px solid #334155', borderRadius: 4, cursor: 'pointer',
                }}
                title="Select text then click to create a link"
              >
                🔗 Link selection
              </button>
            </div>
          </div>

          {editingContent ? (
            <textarea
              ref={contentRef}
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              rows={12}
              style={{
                width: '100%', padding: '0.75rem',
                background: '#1e293b', border: '1px solid #334155',
                borderRadius: 6, color: '#e2e8f0', fontSize: '0.88rem',
                lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          ) : (
            <div
              style={{
                padding: '0.75rem',
                background: '#1e293b',
                borderRadius: 6,
                color: '#e2e8f0',
                fontSize: '0.88rem',
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                minHeight: 100,
                userSelect: 'text',
              }}
            >
              {document.content || <span style={{ color: '#475569' }}>(no content)</span>}
            </div>
          )}
        </div>

        {/* Link creation form */}
        {linkMode && (
          <div style={{
            padding: '0.75rem', background: '#1e293b',
            borderRadius: 6, border: '1px solid rgba(139,92,246,0.4)',
            display: 'flex', flexDirection: 'column', gap: '0.5rem',
          }}>
            <div style={{ fontSize: '0.75rem', color: '#a78bfa', fontWeight: 600 }}>Create Link</div>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Source text (from this document):
              <input
                value={selectedText}
                onChange={(e) => setSelectedText(e.target.value)}
                style={{
                  display: 'block', width: '100%', marginTop: 3,
                  padding: '0.25rem 0.5rem', background: '#0f172a',
                  border: '1px solid #334155', borderRadius: 4,
                  color: '#e2e8f0', fontSize: '0.8rem', boxSizing: 'border-box',
                }}
              />
            </label>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Target document:
              <select
                value={targetDocId}
                onChange={(e) => setTargetDocId(e.target.value)}
                style={{
                  display: 'block', width: '100%', marginTop: 3,
                  padding: '0.25rem 0.5rem', background: '#0f172a',
                  border: '1px solid #334155', borderRadius: 4,
                  color: '#e2e8f0', fontSize: '0.8rem', boxSizing: 'border-box',
                }}
              >
                <option value="">— choose target —</option>
                {allDocuments.filter((d) => d.id !== document.id).map((d) => (
                  <option key={d.id} value={d.id}>{d.title || d.id}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Target text (passage in target document):
              <input
                value={targetText}
                onChange={(e) => setTargetText(e.target.value)}
                placeholder="paste or type the target passage…"
                style={{
                  display: 'block', width: '100%', marginTop: 3,
                  padding: '0.25rem 0.5rem', background: '#0f172a',
                  border: '1px solid #334155', borderRadius: 4,
                  color: '#e2e8f0', fontSize: '0.8rem', boxSizing: 'border-box',
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                onClick={handleCreateLink}
                disabled={linkBusy || !selectedText || !targetDocId || !targetText.trim()}
                style={{
                  padding: '0.3rem 0.75rem',
                  background: 'var(--color-accent, #8B5CF6)', color: '#fff',
                  border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem',
                  opacity: linkBusy || !selectedText || !targetDocId || !targetText.trim() ? 0.5 : 1,
                }}
              >
                {linkBusy ? 'Linking…' : 'Create Link'}
              </button>
              <button
                onClick={() => { setLinkMode(false); setSelectedText(''); setTargetDocId(''); setTargetText(''); }}
                style={{
                  padding: '0.3rem 0.75rem',
                  background: '#0f172a', color: '#94a3b8',
                  border: '1px solid #334155', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Related links */}
        {relatedLinks.length > 0 && (
          <div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.4rem' }}>
              LINKS ({relatedLinks.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {relatedLinks.map((link) => {
                const isSource = link.source_doc_id === document.id;
                const otherDocId = isSource ? link.target_doc_id : link.source_doc_id;
                const otherDoc = docById(otherDocId);
                return (
                  <div
                    key={link.id}
                    style={{
                      padding: '0.5rem 0.75rem',
                      background: '#1e293b',
                      borderRadius: 6,
                      border: '1px solid #2d3748',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.2rem' }}>
                        {isSource ? '→' : '←'}{' '}
                        <span
                          onClick={() => otherDoc && onSelectDoc(otherDocId)}
                          style={{
                            color: '#a78bfa', cursor: otherDoc ? 'pointer' : 'default',
                            textDecoration: otherDoc ? 'underline' : 'none',
                            textDecorationStyle: 'dotted',
                          }}
                        >
                          {otherDoc?.title || otherDocId}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>
                        "{isSource ? link.source_text : link.target_text}"
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteLink(link.id)}
                      style={{
                        background: 'none', border: 'none', color: '#475569',
                        cursor: 'pointer', fontSize: '0.8rem', flexShrink: 0, padding: '0 0.2rem',
                      }}
                      title="Remove link"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
