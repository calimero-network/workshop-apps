import React, { useState } from 'react';
import { DEFAULT_WORKSPACE_NAME } from '../config';

interface CreateWorkspaceModalProps {
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
}

export default function CreateWorkspaceModal({ onCreate, onClose }: CreateWorkspaceModalProps) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      await onCreate(name.trim() || DEFAULT_WORKSPACE_NAME);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const ACCENT = 'var(--color-accent, #d4af37)';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0d0d1a', borderRadius: 10, padding: '1.5rem',
          width: 400, border: `1px solid ${ACCENT}`, boxShadow: `0 0 24px ${ACCENT}44`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: '0.25rem', color: ACCENT, fontWeight: 700, fontSize: '1.1rem' }}>
          ⚔️ New Game Table
        </h3>
        <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '1rem', lineHeight: 1.5 }}>
          You will be the Dungeon Master of this table. Name your campaign, then invite
          adventurers using the Invite button once the table is created.
        </p>

        <label style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
          Campaign Name
        </label>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
          placeholder="e.g. The Lost Mines of Phandelver"
          style={{
            width: '100%', padding: '0.55rem 0.75rem',
            background: '#0b0b18', border: '1px solid #334155',
            borderRadius: 6, color: '#e2e8f0', fontSize: '0.9rem', outline: 'none',
          }}
        />

        {error && (
          <p style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '0.5rem' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.4rem 1rem', background: 'transparent',
              color: '#94a3b8', border: '1px solid #334155',
              borderRadius: 6, cursor: 'pointer', fontSize: '0.88rem',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{
              padding: '0.4rem 1.2rem',
              background: creating ? '#1e293b' : ACCENT,
              color: creating ? '#64748b' : '#0d0d1a',
              border: 'none', borderRadius: 6,
              cursor: creating ? 'default' : 'pointer',
              fontSize: '0.88rem', fontWeight: 700,
            }}
          >
            {creating ? 'Creating…' : 'Begin Campaign'}
          </button>
        </div>
      </div>
    </div>
  );
}
