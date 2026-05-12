import React, { useState } from 'react';
import type { Expense } from '../api/trip/TripClient';

interface EditExpenseModalProps {
  expense: Expense;
  currency: string;
  onSubmit: (id: string, newAmount: number, newDescription: string) => Promise<void>;
  onClose: () => void;
}

export default function EditExpenseModal({ expense, currency, onSubmit, onClose }: EditExpenseModalProps) {
  const [description, setDescription] = useState(expense.description);
  const [amountStr, setAmountStr] = useState(String(expense.amount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const amount = parseFloat(amountStr);
    if (!description.trim()) { setError('Description is required'); return; }
    if (!amountStr || isNaN(amount) || amount <= 0) { setError('Enter a valid positive amount'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(expense.id, amount, description.trim());
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
        width: 400, border: '1px solid #333',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: '1rem', color: '#f1f5f9' }}>Edit Expense</h3>

        <label style={labelStyle}>Description</label>
        <input
          autoFocus
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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
          style={inputStyle}
        />

        {error && (
          <div style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '0.5rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={submitBtnStyle}>
            {saving ? 'Saving…' : 'Save Changes'}
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
