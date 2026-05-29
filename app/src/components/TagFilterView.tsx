import React from 'react';
import type { Document, Tag } from '../api/knowledge-graph/KnowledgeGraphClient';

interface TagFilterViewProps {
  documents: Document[];
  tagsByDocument: Record<string, Tag[]>;
  activeTag: string | null;
  onSelectTag: (tag: string | null) => void;
  onSelectDoc: (docId: string) => void;
}

export default function TagFilterView({
  documents,
  tagsByDocument,
  activeTag,
  onSelectTag,
  onSelectDoc,
}: TagFilterViewProps) {
  // All unique tags
  const allTags: string[] = React.useMemo(() => {
    const seen = new Set<string>();
    Object.values(tagsByDocument).forEach((tags) => tags.forEach((t) => seen.add(t.label)));
    return Array.from(seen).sort();
  }, [tagsByDocument]);

  const filteredDocs = React.useMemo(() => {
    if (!activeTag) return documents;
    return documents.filter((doc) =>
      (tagsByDocument[doc.id] ?? []).some((t) => t.label === activeTag),
    );
  }, [documents, tagsByDocument, activeTag]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1.25rem',
        borderBottom: '1px solid #1e293b',
        background: '#0f172a',
      }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', margin: 0 }}>
          {activeTag ? `Documents tagged #${activeTag}` : 'Browse by Tag'}
        </h3>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Tag cloud */}
        <div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.4rem' }}>ALL TAGS</div>
          {allTags.length === 0 ? (
            <div style={{ color: '#475569', fontSize: '0.85rem' }}>No tags yet — add tags to documents to get started.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {allTags.map((tag) => {
                const count = documents.filter(
                  (d) => (tagsByDocument[d.id] ?? []).some((t) => t.label === tag),
                ).length;
                const active = activeTag === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => onSelectTag(active ? null : tag)}
                    style={{
                      padding: '0.25rem 0.6rem',
                      borderRadius: 4,
                      border: active ? '1px solid #a78bfa' : '1px solid rgba(139,92,246,0.3)',
                      background: active ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.08)',
                      color: active ? '#e9d5ff' : '#a78bfa',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                  >
                    #{tag}
                    <span style={{
                      fontSize: '0.65rem',
                      background: 'rgba(139,92,246,0.3)',
                      borderRadius: 10,
                      padding: '0 0.3rem',
                    }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Filtered documents */}
        {activeTag && (
          <div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.4rem' }}>
              DOCUMENTS ({filteredDocs.length})
            </div>
            {filteredDocs.length === 0 ? (
              <div style={{ color: '#475569', fontSize: '0.85rem' }}>
                No documents with tag #{activeTag}.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {filteredDocs.map((doc) => {
                  const tags = tagsByDocument[doc.id] ?? [];
                  return (
                    <div
                      key={doc.id}
                      onClick={() => onSelectDoc(doc.id)}
                      style={{
                        padding: '0.75rem 1rem',
                        background: '#1e293b',
                        borderRadius: 6,
                        border: '1px solid #2d3748',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#8B5CF6'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#2d3748'; }}
                    >
                      <div style={{ fontWeight: 500, color: '#f1f5f9', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                        {doc.title || '(untitled)'}
                      </div>
                      <div style={{ color: '#475569', fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                        by {doc.author ? `${doc.author.slice(0, 8)}…` : 'unknown'}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {tags.map((t) => (
                          <span
                            key={t.id}
                            style={{
                              fontSize: '0.7rem',
                              padding: '0.1rem 0.35rem',
                              borderRadius: 3,
                              background: t.label === activeTag
                                ? 'rgba(139,92,246,0.35)'
                                : 'rgba(139,92,246,0.1)',
                              color: t.label === activeTag ? '#e9d5ff' : '#a78bfa',
                            }}
                          >
                            #{t.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
