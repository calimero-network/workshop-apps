import React, { useState } from 'react';

export interface MemberOption {
  identity: string;
  alias?: string;
  isSelf: boolean;
}

interface CreateRoomModalProps {
  members: MemberOption[];
  onSubmit: (name: string, selectedMembers: string[]) => Promise<void>;
  onClose: () => void;
}

export default function CreateRoomModal({ members, onSubmit, onClose }: CreateRoomModalProps) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const otherMembers = members.filter((m) => !m.isSelf);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(otherMembers.map((m) => m.identity)));

  const toggle = (identity: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(identity)) next.delete(identity);
      else next.add(identity);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await onSubmit(name.trim(), [...selected]);
    } finally {
      setCreating(false);
    }
  };

  function shortenId(id: string): string {
    if (id.length <= 16) return id;
    return `${id.slice(0, 8)}...${id.slice(-6)}`;
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: '#1a1a1a', borderRadius: 12, padding: '1.5rem',
        width: 400, border: '1px solid #333',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: '1rem' }}>Create Room</h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="Room name"
          autoFocus
          style={{
            width: '100%', padding: '0.5rem', background: '#222',
            border: '1px solid #444', borderRadius: 6, color: '#eee',
            fontSize: '0.9rem', marginBottom: '1rem',
          }}
        />

        {otherMembers.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.5rem' }}>
              Add members ({selected.size} of {otherMembers.length} selected)
            </div>
            <div style={{
              maxHeight: 150, overflowY: 'auto', background: '#222',
              borderRadius: 6, border: '1px solid #333',
            }}>
              {otherMembers.map((m) => (
                <label
                  key={m.identity}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.4rem 0.6rem', cursor: 'pointer',
                    background: selected.has(m.identity) ? '#1e3a5f' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(m.identity)}
                    onChange={() => toggle(m.identity)}
                  />
                  <span style={{ fontSize: '0.85rem' }}>
                    {m.alias || shortenId(m.identity)}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '0.4rem 1rem', background: '#333', color: '#ccc',
            border: '1px solid #444', borderRadius: 6, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSubmit} disabled={!name.trim() || creating} style={{
            padding: '0.4rem 1rem', background: '#2563eb', color: '#fff',
            border: 'none', borderRadius: 6, cursor: name.trim() ? 'pointer' : 'default',
          }}>{creating ? 'Creating...' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
