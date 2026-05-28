import React, { useState, useMemo } from 'react';
import { useSoulContext } from '../hooks/useSoulContext';
import MemoryCard from './MemoryCard';

interface ContextViewProps {
  contextId: string;
  executorPublicKey: string | null;
  /** Display name for the context (workspace alias). */
  contextName: string;
  /** Whether there are other members (shared context). */
  isShared: boolean;
  /** Map of identity → display name for showing author names in shared contexts. */
  memberNames?: Record<string, string>;
}

export default function ContextView({
  contextId,
  executorPublicKey,
  contextName,
  isShared,
  memberNames = {},
}: ContextViewProps) {
  const ctx = useSoulContext(contextId, executorPublicKey);

  // Tag filter state
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());

  // Collect all unique tags across memories
  const allTags = useMemo(() => {
    const s = new Set<string>();
    ctx.memories.forEach((m) => m.tags.forEach((t) => s.add(t)));
    return [...s].sort();
  }, [ctx.memories]);

  // Filter memories by active tags (AND logic: must include ALL selected tags)
  const displayed = useMemo(() => {
    if (activeTags.size === 0) return ctx.memories;
    return ctx.memories.filter((m) => [...activeTags].every((t) => m.tags.includes(t)));
  }, [ctx.memories, activeTags]);

  const toggleTag = (tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  };

  // Add memory form
  const [noteText, setNoteText] = useState('');
  const [noteTagsRaw, setNoteTagsRaw] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [tagSearch, setTagSearch] = useState('');

  const handleAddMemory = async () => {
    const text = noteText.trim();
    if (!text || adding) return;
    const tags = noteTagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
    setAdding(true);
    setAddError(null);
    try {
      await ctx.addMemory(text, tags);
      setNoteText('');
      setNoteTagsRaw('');
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setAdding(false);
    }
  };

  const selfKey = ctx.contextExecutorKey;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1.25rem',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#e2e8f0', fontWeight: 600 }}>
            {contextName || 'Untitled'}
          </h3>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
            {isShared ? 'Shared knowledge' : 'Personal vault'} · {ctx.memories.length} note{ctx.memories.length !== 1 ? 's' : ''}
          </span>
        </div>
        {isShared && (
          <span style={{
            fontSize: '0.7rem',
            background: '#1e3a5f',
            color: '#93c5fd',
            padding: '0.2rem 0.5rem',
            borderRadius: 99,
            border: '1px solid #2563eb44',
          }}>
            Team
          </span>
        )}
      </div>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div style={{
          padding: '0.5rem 1.25rem',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          flexWrap: 'wrap',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '0.7rem', color: '#64748b', marginRight: '0.25rem' }}>Filter:</span>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              data-testid={`tag-filter-${tag}`}
              style={{
                background: activeTags.has(tag) ? 'var(--color-accent)' : '#1e293b',
                color: activeTags.has(tag) ? '#fff' : '#94a3b8',
                border: activeTags.has(tag) ? 'none' : '1px solid #334155',
                borderRadius: 99,
                padding: '0.15rem 0.55rem',
                fontSize: '0.72rem',
                cursor: 'pointer',
              }}
            >
              {tag}
            </button>
          ))}
          {activeTags.size > 0 && (
            <button
              onClick={() => setActiveTags(new Set())}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                fontSize: '0.7rem',
                marginLeft: '0.25rem',
              }}
            >
              clear
            </button>
          )}
        </div>
      )}

      {/* Notes list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {ctx.loading && displayed.length === 0 && (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '3rem' }}>Loading notes…</div>
        )}
        {ctx.error && (
          <div style={{ color: '#ef4444', fontSize: '0.8rem', textAlign: 'center' }}>
            {ctx.error.message}
          </div>
        )}
        {!ctx.loading && displayed.length === 0 && !ctx.error && (
          <div style={{ color: '#475569', textAlign: 'center', padding: '3rem', fontSize: '0.9rem' }}>
            {activeTags.size > 0 ? 'No notes match the selected tags.' : 'No notes yet. Add your first note below.'}
          </div>
        )}
        {displayed.map((memory) => (
          <MemoryCard
            key={memory.id}
            memory={memory}
            isSelf={memory.author === selfKey}
            authorName={memberNames[memory.author]}
            onEdit={(text, tags) => ctx.updateMemory(memory.id, text, tags)}
            onDelete={() => ctx.deleteMemory(memory.id)}
          />
        ))}
      </div>

      {/* Add note panel */}
      <div style={{
        padding: '0.75rem 1.25rem',
        borderTop: '1px solid #1e293b',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        flexShrink: 0,
      }}>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleAddMemory();
            }
          }}
          placeholder="Write a note… (Cmd+Enter to save)"
          rows={2}
          disabled={adding}
          style={{
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 8,
            color: '#e2e8f0',
            padding: '0.6rem 0.75rem',
            fontSize: '0.9rem',
            resize: 'none',
            lineHeight: 1.5,
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            value={noteTagsRaw}
            onChange={(e) => setNoteTagsRaw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleAddMemory()}
            placeholder="Tags (comma-separated, e.g. kind:idea, topic:ai)"
            disabled={adding}
            style={{
              flex: 1,
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 8,
              color: '#94a3b8',
              padding: '0.5rem 0.75rem',
              fontSize: '0.82rem',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleAddMemory}
            disabled={adding || !noteText.trim()}
            data-testid="add-memory-btn"
            style={{
              padding: '0.5rem 1.2rem',
              background: noteText.trim() ? 'var(--color-accent)' : '#334155',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: noteText.trim() && !adding ? 'pointer' : 'default',
              fontSize: '0.9rem',
              fontWeight: 500,
              flexShrink: 0,
            }}
          >
            {adding ? 'Saving…' : 'Add'}
          </button>
        </div>
        {addError && (
          <div style={{ color: '#ef4444', fontSize: '0.78rem' }}>{addError}</div>
        )}
        {/* Quick tag search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <input
            value={tagSearch}
            onChange={(e) => {
              setTagSearch(e.target.value);
              const t = e.target.value.trim();
              if (t) setActiveTags(new Set([t]));
              else setActiveTags(new Set());
            }}
            placeholder="Search by tag…"
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #1e293b',
              color: '#64748b',
              padding: '0.2rem 0',
              fontSize: '0.78rem',
              outline: 'none',
              width: 160,
            }}
          />
        </div>
      </div>
    </div>
  );
}
