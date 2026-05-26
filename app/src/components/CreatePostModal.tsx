import React, { useState } from 'react';

type PostType = 'thesis' | 'post-mortem' | 'general';

interface CreatePostModalProps {
  initialPost?: { id: string; title: string; body: string; post_type: string } | null;
  onSubmit: (title: string, body: string, post_type: string) => Promise<void>;
  onClose: () => void;
}

const POST_TYPES: { value: PostType; label: string; description: string }[] = [
  { value: 'thesis', label: 'Thesis', description: 'Entry/exit targets & rationale' },
  { value: 'post-mortem', label: 'Post-Mortem', description: 'Closed position review' },
  { value: 'general', label: 'General', description: 'Commentary & discussion' },
];

export default function CreatePostModal({ initialPost, onSubmit, onClose }: CreatePostModalProps) {
  const [title, setTitle] = useState(initialPost?.title ?? '');
  const [body, setBody] = useState(initialPost?.body ?? '');
  const [postType, setPostType] = useState<PostType>((initialPost?.post_type as PostType) ?? 'thesis');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!initialPost;

  const handleSubmit = async () => {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      setError('Title and body are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(t, b, postType);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save post');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1f2937',
          border: '1px solid #374151',
          borderRadius: 12,
          padding: '1.5rem',
          width: '100%',
          maxWidth: 560,
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f9fafb' }}>
          {isEdit ? 'Edit Post' : 'New Post'}
        </h2>

        {/* Post type selector (hidden in edit mode — type isn't changed) */}
        {!isEdit && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {POST_TYPES.map((pt) => (
              <button
                key={pt.value}
                onClick={() => setPostType(pt.value)}
                title={pt.description}
                style={{
                  flex: 1,
                  padding: '0.4rem',
                  borderRadius: 6,
                  border: '1px solid',
                  borderColor: postType === pt.value ? 'var(--color-accent, #10B981)' : '#374151',
                  background: postType === pt.value ? 'rgba(16,185,129,0.12)' : 'transparent',
                  color: postType === pt.value ? 'var(--color-accent, #10B981)' : '#9ca3af',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                }}
              >
                {pt.label}
              </button>
            ))}
          </div>
        )}

        {/* Title */}
        {!isEdit && (
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.35rem' }}>
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Long AAPL 200C — Entry at 180"
              data-testid="post-title-input"
              style={{
                width: '100%',
                background: '#111827',
                border: '1px solid #374151',
                borderRadius: 6,
                color: '#e5e7eb',
                padding: '0.55rem 0.75rem',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Body */}
        <div>
          <label style={{ display: 'block', fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.35rem' }}>
            {isEdit ? 'Updated body' : 'Body'}
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share your reasoning, targets, and risk parameters…"
            rows={6}
            data-testid="post-body-input"
            style={{
              width: '100%',
              background: '#111827',
              border: '1px solid #374151',
              borderRadius: 6,
              color: '#e5e7eb',
              padding: '0.55rem 0.75rem',
              fontSize: '0.88rem',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {error && (
          <div style={{ color: '#f87171', fontSize: '0.8rem' }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              background: 'transparent',
              color: '#9ca3af',
              border: '1px solid #374151',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={busy}
            data-testid="submit-post-button"
            style={{
              padding: '0.5rem 1.25rem',
              background: 'var(--color-accent, #10B981)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}
