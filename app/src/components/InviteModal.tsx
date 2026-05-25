import React, { useState } from 'react';

interface InviteModalProps {
  onInvite: () => Promise<unknown>;
  onClose: () => void;
}

export default function InviteModal({ onInvite, onClose }: InviteModalProps) {
  const [inviteJson, setInviteJson] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const result = await onInvite();
      setInviteJson(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Failed to create invitation:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (inviteJson) {
      navigator.clipboard.writeText(inviteJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: '#1a1a1a', borderRadius: 12, padding: '1.5rem',
        width: 440, border: '1px solid #333', maxHeight: '80vh', overflow: 'auto',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: '1rem' }}>Invite User</h3>

        {!inviteJson ? (
          <button onClick={handleGenerate} disabled={loading} style={{
            width: '100%', padding: '0.5rem', background: '#2563eb', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer',
          }}>{loading ? 'Generating...' : 'Generate Invitation'}</button>
        ) : (
          <>
            <p style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
              Share this invitation JSON with the user you want to invite:
            </p>
            <pre style={{
              background: '#222', padding: '0.75rem', borderRadius: 6,
              fontSize: '0.7rem', overflow: 'auto', maxHeight: 200,
              border: '1px solid #333',
            }}>{inviteJson}</pre>
            <button onClick={handleCopy} style={{
              marginTop: '0.5rem', width: '100%', padding: '0.4rem',
              background: '#333', color: '#ccc', border: '1px solid #444',
              borderRadius: 6, cursor: 'pointer',
            }}>{copied ? 'Copied!' : 'Copy to Clipboard'}</button>
          </>
        )}

        <button onClick={onClose} style={{
          marginTop: '0.75rem', width: '100%', padding: '0.4rem',
          background: 'transparent', color: '#888', border: '1px solid #333',
          borderRadius: 6, cursor: 'pointer',
        }}>Close</button>
      </div>
    </div>
  );
}
