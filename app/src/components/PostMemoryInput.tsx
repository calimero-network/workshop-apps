/**
 * PostMemoryInput — composer for new memories.
 *
 * Users type a story/memory and can optionally attach image or audio URLs
 * (since Calimero contexts don't have a built-in file store; contributors
 * paste external URLs, e.g. from a shared drive or hosting service).
 */

import React, { useState, useCallback } from 'react';
import type { Attachment } from '../hooks/useMemorial';

interface PostMemoryInputProps {
  onPost: (body: string, attachments: Attachment[]) => Promise<void>;
  disabled?: boolean;
}

interface DraftAttachment {
  url: string;
  kind: 'image' | 'audio';
}

export default function PostMemoryInput({ onPost, disabled = false }: PostMemoryInputProps) {
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [showAttach, setShowAttach] = useState(false);
  const [attachUrl, setAttachUrl] = useState('');
  const [attachKind, setAttachKind] = useState<'image' | 'audio'>('image');
  const [posting, setPosting] = useState(false);

  const canPost = body.trim().length > 0 && !posting && !disabled;

  const addAttachment = () => {
    const url = attachUrl.trim();
    if (!url) return;
    setAttachments((prev) => [...prev, { url, kind: attachKind }]);
    setAttachUrl('');
    setShowAttach(false);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePost = useCallback(async () => {
    if (!canPost) return;
    setPosting(true);
    try {
      await onPost(body.trim(), attachments.map((a) => ({ url: a.url, kind: a.kind })));
      setBody('');
      setAttachments([]);
    } catch (err) {
      console.error('Failed to post memory:', err);
    } finally {
      setPosting(false);
    }
  }, [body, attachments, canPost, onPost]);

  return (
    <div style={{
      padding: '1rem 1.25rem',
      borderTop: '1px solid rgba(107,76,154,0.2)',
      background: 'rgba(13,10,18,0.9)',
    }}>
      {/* Attachment list */}
      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.6rem' }}>
          {attachments.map((att, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.25rem 0.55rem',
              background: 'rgba(107,76,154,0.15)',
              borderRadius: 20,
              border: '1px solid rgba(107,76,154,0.3)',
              fontSize: '0.75rem',
              color: '#8a7aaa',
            }}>
              <span>{att.kind === 'image' ? '🖼' : '🎵'}</span>
              <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {att.url}
              </span>
              <button
                onClick={() => removeAttachment(i)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#7a3a3a', fontSize: '0.75rem', padding: 0, lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Attachment URL input */}
      {showAttach && (
        <div style={{
          display: 'flex', gap: '0.4rem', marginBottom: '0.6rem', alignItems: 'center',
        }}>
          <select
            value={attachKind}
            onChange={(e) => setAttachKind(e.target.value as 'image' | 'audio')}
            style={{
              padding: '0.35rem 0.5rem',
              background: '#1a1226',
              border: '1px solid rgba(107,76,154,0.3)',
              borderRadius: 5,
              color: '#e2d9f3',
              fontSize: '0.8rem',
            }}
          >
            <option value="image">Image URL</option>
            <option value="audio">Audio URL</option>
          </select>
          <input
            type="url"
            value={attachUrl}
            onChange={(e) => setAttachUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addAttachment()}
            placeholder="https://…"
            autoFocus
            style={{
              flex: 1,
              padding: '0.35rem 0.6rem',
              background: '#1a1226',
              border: '1px solid rgba(107,76,154,0.3)',
              borderRadius: 5,
              color: '#e2d9f3',
              fontSize: '0.82rem',
              outline: 'none',
            }}
          />
          <button
            onClick={addAttachment}
            disabled={!attachUrl.trim()}
            style={{
              padding: '0.35rem 0.7rem',
              background: attachUrl.trim() ? 'rgba(107,76,154,0.3)' : 'transparent',
              border: '1px solid rgba(107,76,154,0.3)',
              borderRadius: 5,
              color: '#e2d9f3',
              cursor: attachUrl.trim() ? 'pointer' : 'default',
              fontSize: '0.8rem',
            }}
          >
            Add
          </button>
          <button
            onClick={() => { setShowAttach(false); setAttachUrl(''); }}
            style={{
              background: 'none', border: 'none',
              color: '#6b5f8a', cursor: 'pointer', fontSize: '0.8rem',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main compose row */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); void handlePost(); }
          }}
          placeholder="Share a memory…  (Ctrl+Enter to post)"
          disabled={disabled || posting}
          rows={3}
          style={{
            flex: 1,
            padding: '0.65rem 0.85rem',
            background: '#1a1226',
            border: '1px solid rgba(107,76,154,0.3)',
            borderRadius: 8,
            color: '#e2d9f3',
            fontSize: '0.92rem',
            outline: 'none',
            resize: 'vertical',
            minHeight: 72,
            fontFamily: 'inherit',
            lineHeight: 1.55,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {/* Attach button */}
          <button
            onClick={() => setShowAttach((v) => !v)}
            title="Attach image or audio"
            style={{
              padding: '0.45rem 0.7rem',
              background: showAttach ? 'rgba(107,76,154,0.25)' : 'rgba(107,76,154,0.1)',
              border: '1px solid rgba(107,76,154,0.3)',
              borderRadius: 7,
              color: '#8a7aaa',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            📎
          </button>
          {/* Post button */}
          <button
            onClick={() => void handlePost()}
            disabled={!canPost}
            style={{
              padding: '0.45rem 0.85rem',
              background: canPost ? 'var(--color-primary)' : 'rgba(107,76,154,0.15)',
              color: canPost ? '#fff' : '#5a4a7a',
              border: 'none',
              borderRadius: 7,
              cursor: canPost ? 'pointer' : 'default',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            {posting ? '…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
