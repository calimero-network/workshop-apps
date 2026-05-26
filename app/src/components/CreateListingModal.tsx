import React, { useState } from 'react';

interface CreateListingModalProps {
  onSubmit: (params: {
    title: string;
    description: string;
    category: string;
    asking_price: number;
    condition: string;
  }) => Promise<string | void>;
  onClose: () => void;
}

const CATEGORIES = ['watches', 'coins', 'stamps', 'art', 'jewelry', 'books', 'sports', 'other'];
const CONDITIONS = ['mint', 'excellent', 'good', 'fair', 'poor'];

export default function CreateListingModal({ onSubmit, onClose }: CreateListingModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [askingPrice, setAskingPrice] = useState('');
  const [condition, setCondition] = useState(CONDITIONS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseInt(askingPrice, 10);
    if (!title.trim() || isNaN(price) || price <= 0) {
      setError('Title and a valid asking price are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        category,
        asking_price: price,
        condition,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={OVERLAY}>
      <div style={DIALOG}>
        <h3 style={{ margin: '0 0 1rem', color: 'var(--color-accent)' }}>List an Item</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label style={LABEL}>
            Title
            <input
              style={INPUT}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Rolex Submariner 1960"
              maxLength={120}
              required
            />
          </label>
          <label style={LABEL}>
            Description
            <textarea
              style={{ ...INPUT, resize: 'vertical', minHeight: 72 }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Condition details, provenance notes, etc."
              maxLength={1000}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label style={LABEL}>
              Category
              <select style={INPUT} value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </label>
            <label style={LABEL}>
              Condition
              <select style={INPUT} value={condition} onChange={(e) => setCondition(e.target.value)}>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </label>
          </div>
          <label style={LABEL}>
            Asking Price (units)
            <input
              style={INPUT}
              type="number"
              min={1}
              value={askingPrice}
              onChange={(e) => setAskingPrice(e.target.value)}
              placeholder="e.g. 8500"
              required
            />
          </label>
          {error && <div style={{ color: '#f87171', fontSize: '0.82rem' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" onClick={onClose} style={BTN_SECONDARY} disabled={busy}>
              Cancel
            </button>
            <button type="submit" style={BTN_PRIMARY} disabled={busy}>
              {busy ? 'Listing…' : 'Create Listing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const DIALOG: React.CSSProperties = {
  background: '#111827', border: '1px solid #374151', borderRadius: 12,
  padding: '1.5rem', width: '100%', maxWidth: 520,
};
const LABEL: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.25rem',
  fontSize: '0.82rem', color: '#9ca3af',
};
const INPUT: React.CSSProperties = {
  background: '#1f2937', border: '1px solid #374151', borderRadius: 6,
  color: '#f9fafb', padding: '0.45rem 0.6rem', fontSize: '0.9rem', outline: 'none',
};
const BTN_PRIMARY: React.CSSProperties = {
  background: 'var(--color-accent)', color: '#111827', border: 'none',
  borderRadius: 6, padding: '0.5rem 1.25rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
};
const BTN_SECONDARY: React.CSSProperties = {
  background: 'transparent', color: '#9ca3af', border: '1px solid #374151',
  borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.9rem',
};
