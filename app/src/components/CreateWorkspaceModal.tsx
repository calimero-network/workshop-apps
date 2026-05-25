import React, { useState } from 'react';
import { DEFAULT_WORKSPACE_NAME } from '../config';

interface CreateWorkspaceModalProps {
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
}

export default function CreateWorkspaceModal({ onCreate, onClose }: CreateWorkspaceModalProps) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await onCreate(name.trim() || DEFAULT_WORKSPACE_NAME);
      onClose();
    } catch (err) {
      console.error('Failed to create workspace:', err);
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
        width: 380, border: '1px solid #333',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: '1rem' }}>New Workspace</h3>
        <p style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
          Name your workspace — you can invite teammates and create rooms after it's created.
        </p>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="Workspace name (e.g. Design Team)"
          style={{
            width: '100%', padding: '0.5rem 0.75rem', background: '#222',
            border: '1px solid #444', borderRadius: 6, color: '#eee',
            fontSize: '0.9rem',
          }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
          <button onClick={onClose} style={{
            padding: '0.4rem 1rem', background: '#333', color: '#ccc',
            border: '1px solid #444', borderRadius: 6, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleCreate} disabled={creating} style={{
            padding: '0.4rem 1rem', background: 'var(--color-primary, #3B82F6)', color: '#fff',
            border: 'none', borderRadius: 6, cursor: creating ? 'default' : 'pointer',
          }}>{creating ? 'Creating…' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
