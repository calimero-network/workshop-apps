import React, { useState } from 'react';

interface JoinModalProps {
  onJoin: (invitationJson: string) => Promise<void>;
  onClose: () => void;
}

export default function JoinModal({ onJoin, onClose }: JoinModalProps) {
  const [json, setJson] = useState('');
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    if (!json.trim() || joining) return;
    setJoining(true);
    try {
      await onJoin(json.trim());
    } catch (err) {
      console.error('Failed to join:', err);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: '#1a1a1a', borderRadius: 12, padding: '1.5rem',
        width: 440, border: '1px solid #333',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: '1rem' }}>Join a Trip</h3>
        <p style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
          Paste the invitation JSON you received from the trip organizer:
        </p>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder='{"invitation": ...}'
          rows={6}
          style={{
            width: '100%', padding: '0.5rem', background: '#222',
            border: '1px solid #444', borderRadius: 6, color: '#eee',
            fontSize: '0.8rem', resize: 'vertical', fontFamily: 'monospace',
          }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
          <button onClick={onClose} style={{
            padding: '0.4rem 1rem', background: '#333', color: '#ccc',
            border: '1px solid #444', borderRadius: 6, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleJoin} disabled={!json.trim() || joining} style={{
            padding: '0.4rem 1rem', background: '#2563eb', color: '#fff',
            border: 'none', borderRadius: 6, cursor: json.trim() ? 'pointer' : 'default',
          }}>{joining ? 'Joining...' : 'Join'}</button>
        </div>
      </div>
    </div>
  );
}
