import React, { useState } from 'react';
import type { GroupMember } from '@calimero-network/mero-react';

interface AddExpenseModalProps {
  currency: string;
  members: GroupMember[];
  selfIdentity: string | null;
  memberNames: Record<string, string>;
  onSubmit: (amount: number, description: string, splitAmong: string[]) => Promise<void>;
  onClose: () => void;
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

export default function AddExpenseModal({
  currency,
  members,
  selfIdentity,
  memberNames,
  onSubmit,
  onClose,
}: AddExpenseModalProps) {
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // All participants (self + other members)
  const allParticipants = [
    ...(selfIdentity ? [selfIdentity] : []),
    ...members.map((m) => m.identity),
  ];

  // Default: split among everyone
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(
    new Set(allParticipants),
  );

  const toggleParticipant = (id: string) => {
    setSelectedParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const displayName = (id: string, alias?: string) =>
    memberNames[id] || alias || shortenId(id);

  const handleSubmit = async () => {
    const amount = parseFloat(amountStr);
    if (!description.trim()) { setError('Description is required'); return; }
    if (!amountStr || isNaN(amount) || amount <= 0) { setError('Enter a valid positive amount'); return; }
    if (selectedParticipants.size === 0) { setError('Select at least one participant to split with'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(amount, description.trim(), Array.from(selectedParticipants));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: '#1a1a1a', borderRadius: 12, padding: '1.5rem',
        width: 420, border: '1px solid #333', maxHeight: '80vh', overflowY: 'auto',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: '1rem', color: '#f1f5f9' }}>Add Expense</h3>

        <label style={labelStyle}>Description</label>
        <input
          autoFocus
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Dinner at the taverna"
          maxLength={256}
          style={inputStyle}
        />

        <label style={{ ...labelStyle, marginTop: '0.75rem' }}>
          Amount ({currency || 'USD'})
        </label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="0.00"
          style={inputStyle}
        />

        <label style={{ ...labelStyle, marginTop: '0.75rem' }}>
          Split among ({selectedParticipants.size} selected)
        </label>
        <div style={{
          background: '#222', border: '1px solid #333', borderRadius: 6,
          padding: '0.5rem', maxHeight: 160, overflowY: 'auto',
        }}>
          {allParticipants.map((id) => {
            const checked = selectedParticipants.has(id);
            const isSelf = id === selfIdentity;
            const member = members.find((m) => m.identity === id);
            return (
              <label
                key={id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.3rem 0.25rem', cursor: 'pointer', color: '#cbd5e1',
                  fontSize: '0.83rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleParticipant(id)}
                  style={{ accentColor: 'var(--color-primary, #0066CC)', cursor: 'pointer' }}
                />
                {displayName(id, member?.alias)}
                {isSelf && (
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>(you)</span>
                )}
              </label>
            );
          })}
          {allParticipants.length === 0 && (
            <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '0.25rem' }}>
              No participants yet — invite travel buddies first.
            </div>
          )}
        </div>

        {error && (
          <div style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '0.5rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={submitBtnStyle}>
            {saving ? 'Adding…' : 'Add Expense'}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem', background: '#222',
  border: '1px solid #444', borderRadius: 6, color: '#eee',
  fontSize: '0.9rem', boxSizing: 'border-box',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '0.4rem 1rem', background: '#333', color: '#ccc',
  border: '1px solid #444', borderRadius: 6, cursor: 'pointer',
};

const submitBtnStyle: React.CSSProperties = {
  padding: '0.4rem 1rem', background: 'var(--color-primary, #0066CC)',
  color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
};
