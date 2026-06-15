import React, { useState } from 'react';
import { DEFAULT_WORKSPACE_NAME } from '../config';

interface CreateWorkspaceModalProps {
  onCreate: (name: string, weeklyGoal: number) => Promise<void>;
  onClose: () => void;
}

export default function CreateWorkspaceModal({ onCreate, onClose }: CreateWorkspaceModalProps) {
  const [name, setName] = useState('');
  const [goalStr, setGoalStr] = useState('4');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const weeklyGoal = Math.max(1, Math.min(99, parseInt(goalStr, 10) || 4));

  const handleCreate = async () => {
    if (creating) return;
    setErr(null);
    setCreating(true);
    try {
      await onCreate(name.trim() || DEFAULT_WORKSPACE_NAME, weeklyGoal);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create club');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: '#1a1a1a', borderRadius: 12, padding: '1.5rem',
        width: 400, border: '1px solid #333',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: '0.25rem', color: '#f1f5f9' }}>New Club</h3>
        <p style={{ color: '#888', fontSize: '0.8rem', marginBottom: '1rem' }}>
          Name your club and set a weekly workout goal. You can invite friends after it's created.
        </p>

        <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
          Club name
        </label>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="e.g. Morning Grinders"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.75rem',
            background: '#222', border: '1px solid #444', borderRadius: 6,
            color: '#eee', fontSize: '0.9rem', marginBottom: '0.75rem',
          }}
        />

        <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
          Weekly workout goal (sessions/week)
        </label>
        <input
          type="number"
          min={1}
          max={99}
          value={goalStr}
          onChange={(e) => setGoalStr(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.75rem',
            background: '#222', border: '1px solid #444', borderRadius: 6,
            color: '#eee', fontSize: '0.9rem', marginBottom: '0.75rem',
          }}
        />

        {err && (
          <p style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '0.5rem' }}>{err}</p>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
          <button onClick={onClose} style={{
            padding: '0.4rem 1rem', background: '#333', color: '#ccc',
            border: '1px solid #444', borderRadius: 6, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleCreate} disabled={creating} style={{
            padding: '0.4rem 1rem', background: 'var(--color-primary, #E11D48)', color: '#fff',
            border: 'none', borderRadius: 6, cursor: creating ? 'default' : 'pointer', opacity: creating ? 0.7 : 1,
          }}>{creating ? 'Creating…' : 'Create Club'}</button>
        </div>
      </div>
    </div>
  );
}
