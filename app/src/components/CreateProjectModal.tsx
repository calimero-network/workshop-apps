import React, { useState } from 'react';

interface CreateProjectModalProps {
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}

export default function CreateProjectModal({ onSubmit, onClose }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1a1a2e', borderRadius: 12, padding: '1.5rem',
          width: 380, border: '1px solid #2d2d4e',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: '0.5rem', color: '#e2e8f0' }}>New Project</h3>
        <p style={{ color: '#64748b', fontSize: '0.82rem', marginBottom: '1rem' }}>
          Give your canvas a name. Team members in this workspace can join it.
        </p>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="e.g. Mobile App Mockup"
          style={{
            width: '100%', padding: '0.5rem 0.75rem',
            background: '#0f0f1e', border: '1px solid #3d3d6e',
            borderRadius: 6, color: '#e2e8f0', fontSize: '0.9rem',
            boxSizing: 'border-box',
          }}
        />
        {error && (
          <div style={{ color: '#f87171', fontSize: '0.78rem', marginTop: '0.4rem' }}>{error}</div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.4rem 1rem', background: '#2d2d4e', color: '#94a3b8',
              border: '1px solid #3d3d6e', borderRadius: 6, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || creating}
            style={{
              padding: '0.4rem 1rem',
              background: name.trim() && !creating ? 'var(--color-primary, #5B21B6)' : '#3d3d6e',
              color: '#fff', border: 'none', borderRadius: 6,
              cursor: name.trim() && !creating ? 'pointer' : 'default',
            }}
          >
            {creating ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}
