import React, { useState } from 'react';

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'INR', 'MXN'];

interface CreateWorkspaceModalProps {
  onCreate: (name: string, currency: string) => Promise<void>;
  onClose: () => void;
}

export default function CreateWorkspaceModal({ onCreate, onClose }: CreateWorkspaceModalProps) {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [customCurrency, setCustomCurrency] = useState('');
  const [creating, setCreating] = useState(false);

  const resolvedCurrency = currency === 'OTHER' ? customCurrency.trim().toUpperCase() : currency;

  const handleCreate = async () => {
    if (creating || !name.trim()) return;
    const cur = resolvedCurrency || 'USD';
    setCreating(true);
    try {
      await onCreate(name.trim(), cur);
      onClose();
    } catch (err) {
      console.error('Failed to create trip:', err);
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
        width: 400, border: '1px solid #333',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: '0.25rem', color: '#f1f5f9' }}>New Trip</h3>
        <p style={{ color: '#64748b', fontSize: '0.82rem', marginBottom: '1rem' }}>
          Create a shared space to track expenses with your travel group.
        </p>

        <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
          Trip name
        </label>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="e.g. Greece 2026"
          maxLength={128}
          style={{
            width: '100%', padding: '0.5rem 0.75rem', background: '#222',
            border: '1px solid #444', borderRadius: 6, color: '#eee',
            fontSize: '0.9rem', boxSizing: 'border-box',
          }}
        />

        <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.75rem', marginBottom: '0.25rem' }}>
          Currency
        </label>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          style={{
            width: '100%', padding: '0.5rem 0.75rem', background: '#222',
            border: '1px solid #444', borderRadius: 6, color: '#eee',
            fontSize: '0.9rem',
          }}
        >
          {COMMON_CURRENCIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          <option value="OTHER">Other…</option>
        </select>

        {currency === 'OTHER' && (
          <input
            type="text"
            value={customCurrency}
            onChange={(e) => setCustomCurrency(e.target.value.slice(0, 8))}
            placeholder="Currency code (e.g. THB)"
            maxLength={8}
            style={{
              width: '100%', padding: '0.5rem 0.75rem', background: '#222',
              border: '1px solid #444', borderRadius: 6, color: '#eee',
              fontSize: '0.9rem', marginTop: '0.5rem', boxSizing: 'border-box',
            }}
          />
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button onClick={onClose} style={{
            padding: '0.4rem 1rem', background: '#333', color: '#ccc',
            border: '1px solid #444', borderRadius: 6, cursor: 'pointer',
          }}>Cancel</button>
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            style={{
              padding: '0.4rem 1rem',
              background: name.trim() ? 'var(--color-primary, #0066CC)' : '#334155',
              color: '#fff', border: 'none', borderRadius: 6,
              cursor: creating || !name.trim() ? 'default' : 'pointer',
            }}
          >
            {creating ? 'Creating…' : 'Create Trip'}
          </button>
        </div>
      </div>
    </div>
  );
}
