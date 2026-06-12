import React, { useState } from 'react';

interface CreateCommunityModalProps {
  onSubmit: (name: string, topic: string) => Promise<void>;
  onClose: () => void;
}

export default function CreateCommunityModal({ onSubmit, onClose }: CreateCommunityModalProps) {
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !topic.trim() || creating) return;
    setCreating(true);
    try {
      await onSubmit(name.trim(), topic.trim());
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: '#1a1a1a', borderRadius: 12, padding: '1.5rem',
        width: 420, border: '1px solid #333',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: '1rem', color: 'var(--color-primary)' }}>Create Community</h3>

        <label style={{ display: 'block', fontSize: '0.8rem', color: '#888', marginBottom: '0.25rem' }}>
          Community Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Rust Developers"
          autoFocus
          style={{
            width: '100%', padding: '0.5rem', background: '#222',
            border: '1px solid #444', borderRadius: 6, color: '#eee',
            fontSize: '0.9rem', marginBottom: '0.75rem',
          }}
        />

        <label style={{ display: 'block', fontSize: '0.8rem', color: '#888', marginBottom: '0.25rem' }}>
          Topic
        </label>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="e.g. All things Rust programming"
          style={{
            width: '100%', padding: '0.5rem', background: '#222',
            border: '1px solid #444', borderRadius: 6, color: '#eee',
            fontSize: '0.9rem', marginBottom: '1rem',
          }}
        />

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '0.4rem 1rem', background: '#333', color: '#ccc',
            border: '1px solid #444', borderRadius: 6, cursor: 'pointer',
          }}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !topic.trim() || creating}
            style={{
              padding: '0.4rem 1rem', background: 'var(--color-primary)', color: '#fff',
              border: 'none', borderRadius: 6,
              cursor: name.trim() && topic.trim() ? 'pointer' : 'default',
            }}
          >{creating ? 'Creating...' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
