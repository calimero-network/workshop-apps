import React, { useState } from 'react';

interface InviteModalProps {
  onInvite: () => Promise<unknown>;
  onClose: () => void;
}

const ACCENT = 'var(--color-accent, #d4af37)';

export default function InviteModal({ onInvite, onClose }: InviteModalProps) {
  const [inviteJson, setInviteJson] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await onInvite();
      setInviteJson(JSON.stringify(result, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (inviteJson) {
      navigator.clipboard.writeText(inviteJson).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
          maxHeight: '80vh', overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: '0.25rem', color: ACCENT, fontWeight: 700, fontSize: '1.1rem' }}>
          📜 Invite Adventurer
        </h3>
        <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '1rem', lineHeight: 1.5 }}>
          Generate an invitation scroll and share it with the player you wish to recruit.
        </p>

        {!inviteJson ? (
          <>
            {error && (
              <p style={{ color: '#ef4444', fontSize: '0.78rem', marginBottom: '0.5rem' }}>{error}</p>
            )}
            <button
              onClick={handleGenerate}
              disabled={loading}
              style={{
                width: '100%', padding: '0.55rem',
                background: loading ? '#1e293b' : ACCENT,
                color: loading ? '#64748b' : '#0d0d1a',
                border: 'none', borderRadius: 6,
                cursor: loading ? 'default' : 'pointer',
                fontWeight: 700, fontSize: '0.9rem',
              }}
            >
              {loading ? 'Conjuring invitation…' : '🪄 Generate Invitation Scroll'}
            </button>
          </>
        ) : (
          <>
            <p style={{ color: '#94a3b8', fontSize: '0.78rem', marginBottom: '0.5rem' }}>
              Share this scroll with your adventurer:
            </p>
            <pre style={{
              background: '#0b0b18', padding: '0.75rem', borderRadius: 6,
              fontSize: '0.7rem', overflow: 'auto', maxHeight: 220,
              border: '1px solid #2a1e3a', color: '#e2e8f0',
              fontFamily: 'monospace',
            }}>
              {inviteJson}
            </pre>
            <button
              onClick={handleCopy}
              style={{
                marginTop: '0.5rem', width: '100%', padding: '0.4rem',
                background: copied ? '#16a34a22' : '#1e293b',
                color: copied ? '#86efac' : '#94a3b8',
                border: `1px solid ${copied ? '#16a34a' : '#334155'}`,
                borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem',
                fontWeight: 600, transition: 'all 0.2s',
              }}
            >
              {copied ? '✓ Copied to Clipboard!' : 'Copy to Clipboard'}
            </button>
          </>
        )}

        <button
          onClick={onClose}
          style={{
            marginTop: '0.75rem', width: '100%', padding: '0.4rem',
            background: 'transparent', color: '#64748b',
            border: '1px solid #334155',
            borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
