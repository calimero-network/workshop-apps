import React, { useState } from 'react';
import type { GroupMember } from '@calimero-network/mero-react';

interface RecordPaymentModalProps {
  currency: string;
  members: GroupMember[];
  selfIdentity: string | null;
  memberNames: Record<string, string>;
  /** Pre-populate the "to" field (e.g. clicked "settle up" next to a member). */
  defaultTo?: string;
  /** Pre-populate the amount (e.g. from balance display). */
  defaultAmount?: number;
  onSubmit: (from: string, to: string, amount: number) => Promise<void>;
  onClose: () => void;
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

export default function RecordPaymentModal({
  currency,
  members,
  selfIdentity,
  memberNames,
  defaultTo,
  defaultAmount,
  onSubmit,
  onClose,
}: RecordPaymentModalProps) {
  const allParticipants = [
    ...(selfIdentity ? [selfIdentity] : []),
    ...members.map((m) => m.identity),
  ];

  const [from, setFrom] = useState(selfIdentity ?? '');
  const [to, setTo] = useState(defaultTo ?? '');
  const [amountStr, setAmountStr] = useState(defaultAmount != null ? String(defaultAmount) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = (id: string) => {
    const member = members.find((m) => m.identity === id);
    return memberNames[id] || member?.alias || shortenId(id);
  };

  const handleSubmit = async () => {
    const amount = parseFloat(amountStr);
    if (!from) { setError('Select who is paying'); return; }
    if (!to) { setError('Select who is receiving'); return; }
    if (from === to) { setError('Payer and receiver must be different'); return; }
    if (!amountStr || isNaN(amount) || amount <= 0) { setError('Enter a valid positive amount'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(from, to, amount);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '0.5rem 0.75rem', background: '#222',
    border: '1px solid #444', borderRadius: 6, color: '#eee',
    fontSize: '0.9rem',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: '#1a1a1a', borderRadius: 12, padding: '1.5rem',
        width: 400, border: '1px solid #333',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: '1rem', color: '#f1f5f9' }}>Record Payment</h3>

        <label style={labelStyle}>From (who paid)</label>
        <select value={from} onChange={(e) => setFrom(e.target.value)} style={selectStyle}>
          <option value="">— Select —</option>
          {allParticipants.map((id) => (
            <option key={id} value={id}>
              {displayName(id)}{id === selfIdentity ? ' (you)' : ''}
            </option>
          ))}
        </select>

        <label style={{ ...labelStyle, marginTop: '0.75rem' }}>To (who received)</label>
        <select value={to} onChange={(e) => setTo(e.target.value)} style={selectStyle}>
          <option value="">— Select —</option>
          {allParticipants.map((id) => (
            <option key={id} value={id}>
              {displayName(id)}{id === selfIdentity ? ' (you)' : ''}
            </option>
          ))}
        </select>

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
          style={{
            width: '100%', padding: '0.5rem 0.75rem', background: '#222',
            border: '1px solid #444', borderRadius: 6, color: '#eee',
            fontSize: '0.9rem', boxSizing: 'border-box',
          }}
        />

        {error && (
          <div style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '0.5rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={submitBtnStyle}>
            {saving ? 'Recording…' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '0.4rem 1rem', background: '#333', color: '#ccc',
  border: '1px solid #444', borderRadius: 6, cursor: 'pointer',
};

const submitBtnStyle: React.CSSProperties = {
  padding: '0.4rem 1rem', background: 'var(--color-accent, #FF6B35)',
  color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
};
