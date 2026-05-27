/**
 * MemorialTimeline — the main view for a memorial context.
 *
 * Shows memories in reverse chronological order (newest first), each as a
 * MemoryCard with inline reactions and an expandable comment thread.
 * PostMemoryInput sits at the bottom as a persistent composer.
 *
 * This is the MemorialTimeline view from the spec, and the MemoryDetail
 * experience is embedded inside MemoryCard's expandable comment section.
 */

import React, { useRef, useEffect } from 'react';
import type { UseMemorialReturn } from '../hooks/useMemorial';
import MemoryCard from './MemoryCard';
import PostMemoryInput from './PostMemoryInput';

interface MemorialTimelineProps {
  memorial: UseMemorialReturn;
  memorialName?: string;
}

export default function MemorialTimeline({ memorial, memorialName }: MemorialTimelineProps) {
  const topRef = useRef<HTMLDivElement>(null);

  // Scroll to top when new memories arrive (reverse-chrono, newest at top)
  const prevCount = useRef(memorial.memories.length);
  useEffect(() => {
    if (memorial.memories.length > prevCount.current) {
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevCount.current = memorial.memories.length;
  }, [memorial.memories.length]);

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Timeline header */}
      <div style={{
        padding: '0.85rem 1.5rem',
        borderBottom: '1px solid rgba(107,76,154,0.2)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        background: 'rgba(13,10,18,0.95)',
        flexShrink: 0,
      }}>
        <div>
          <h2 style={{
            margin: 0,
            fontSize: '1.05rem',
            fontWeight: 700,
            color: 'var(--color-primary)',
          }}>
            {memorialName ?? 'Memorial Timeline'}
          </h2>
          <span style={{ fontSize: '0.73rem', color: '#6b5f8a' }}>
            {memorial.memories.length} memor{memorial.memories.length !== 1 ? 'ies' : 'y'}
          </span>
        </div>
      </div>

      {/* Scrollable memory feed */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1.25rem 1.5rem',
      }}>
        <div ref={topRef} />

        {memorial.loading && memorial.memories.length === 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '60%',
            color: '#6b5f8a',
            fontSize: '0.9rem',
          }}>
            Loading memories…
          </div>
        )}

        {!memorial.loading && memorial.memories.length === 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '60%',
            gap: '0.75rem',
            color: '#6b5f8a',
          }}>
            <span style={{ fontSize: '2.5rem' }}>🕊️</span>
            <p style={{ margin: 0, fontSize: '0.95rem', textAlign: 'center', maxWidth: 320 }}>
              This memorial is waiting for its first memory.
              <br />
              Share a story or moment below.
            </p>
          </div>
        )}

        {memorial.error && (
          <div style={{
            padding: '1rem',
            background: 'rgba(122,58,58,0.2)',
            border: '1px solid rgba(122,58,58,0.4)',
            borderRadius: 8,
            color: '#f0a8a8',
            fontSize: '0.85rem',
            marginBottom: '1rem',
          }}>
            Failed to load memories: {memorial.error.message}
          </div>
        )}

        {memorial.memories.map((memory) => (
          <MemoryCard
            key={memory.id}
            memory={memory}
            reactions={memorial.reactions[memory.id]}
            comments={memorial.comments[memory.id]}
            executorPublicKey={memorial.memorialExecutorKey}
            onEdit={memorial.editMemory}
            onDelete={memorial.deleteMemory}
            onAddReaction={memorial.addReaction}
            onRemoveReaction={memorial.removeReaction}
            onPostComment={memorial.postComment}
            onLoadReactions={memorial.loadReactions}
            onLoadComments={memorial.loadComments}
          />
        ))}
      </div>

      {/* Compose area */}
      <PostMemoryInput
        onPost={memorial.postMemory}
        disabled={memorial.memorialExecutorKey == null}
      />
    </div>
  );
}
