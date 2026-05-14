import React, { useState } from 'react';

interface JoinModalProps {
  onJoin: (invitationJson: string) => Promise<void>;
  onClose: () => void;
}

const ACCENT = 'var(--color-accent, #d4af37)';
const PRIMARY = 'var(--color-primary, #1a1a2e)';

export default function JoinModal({ onJoin, onClose }: JoinModalProps) {
  const [json, setJson] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    if (!json.trim() || joining) return;
    setJoining(true);
    setError(null);
    try {
      await onJoin(json.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setJoining(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0d0d1a', borderRadius: 10, padding: '1.5rem',
          width: 460, border: `1px solid ${ACCENT}`, boxShadow: `0 0 24px ${ACCENT}44`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: '0.25rem', color: ACCENT, fontWeight: 700, fontSize: '1.1rem' }}>
          🗺️ Join Game Table
        </h3>
        <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '1rem', lineHeight: 1.5 }}>
          Paste the invitation scroll your Dungeon Master shared with you to join their campaign.
        </p>

        <label style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>
          Invitation JSON
        </label>
        <textarea
          autoFocus
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder='{"invitation": ...}'
          rows={6}
          style={{
            width: '100%', padding: '0.55rem 0.75rem',
            background: '#0b0b18', border: '1px solid #334155',
            borderRadius: 6, color: '#e2e8f0',
            fontSize: '0.8rem', resize: 'vertical', fontFamily: 'monospace',
            outline: 'none',
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
            onClick={handleJoin}
            disabled={!json.trim() || joining}
            style={{
              padding: '0.4rem 1.2rem',
              background: json.trim() && !joining ? ACCENT : '#1e293b',
              color: json.trim() && !joining ? '#0d0d1a' : '#64748b',
              border: 'none', borderRadius: 6,
              cursor: json.trim() && !joining ? 'pointer' : 'default',
              fontSize: '0.88rem', fontWeight: 700,
            }}
          >
            {joining ? 'Joining…' : 'Answer the Call'}
          </button>
        </div>
      </div>
    </div>
  );
}
