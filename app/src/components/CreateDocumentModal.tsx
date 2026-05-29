import React, { useState } from 'react';

interface CreateDocumentModalProps {
  onCreate: (title: string, content: string) => Promise<void>;
  onClose: () => void;
}

export default function CreateDocumentModal({ onCreate, onClose }: CreateDocumentModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (creating || !title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await onCreate(title.trim(), content);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1a1a2e', borderRadius: 12, padding: '1.5rem',
          width: 480, border: '1px solid #334155', maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', gap: '0.75rem',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: '1.05rem' }}>New Document</h3>
        <div>
          <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
            Title
          </label>
          <input
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Document title…"
            style={{
              width: '100%', padding: '0.5rem 0.75rem', background: '#0f172a',
              border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9',
              fontSize: '0.9rem', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
            Content (optional)
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Start writing…"
            rows={8}
            style={{
              width: '100%', padding: '0.5rem 0.75rem', background: '#0f172a',
              border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9',
              fontSize: '0.88rem', resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.6, boxSizing: 'border-box',
            }}
          />
        </div>
        {error && (
          <div style={{ color: '#f87171', fontSize: '0.78rem' }}>{error}</div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.4rem 1rem', background: '#1e293b', color: '#94a3b8',
              border: '1px solid #334155', borderRadius: 6, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !title.trim()}
            style={{
              padding: '0.4rem 1rem',
              background: creating || !title.trim() ? '#4c1d95' : 'var(--color-accent, #8B5CF6)',
              color: '#fff', border: 'none', borderRadius: 6,
              cursor: creating || !title.trim() ? 'default' : 'pointer',
              opacity: creating || !title.trim() ? 0.6 : 1,
            }}
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
