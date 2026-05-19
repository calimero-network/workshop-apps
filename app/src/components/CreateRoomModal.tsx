import React, { useState } from 'react';

interface CreateVoteModalProps {
  onSubmit: (title: string, options: string[]) => Promise<void>;
  onClose: () => void;
}

export default function CreateVoteModal({ onSubmit, onClose }: CreateVoteModalProps) {
  const [title, setTitle] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setOption = (i: number, val: string) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? val : o)));

  const addOption = () => setOptions((prev) => [...prev, '']);

  const removeOption = (i: number) =>
    setOptions((prev) => prev.filter((_, idx) => idx !== i));

  const filledOptions = options.map((o) => o.trim()).filter(Boolean);
  const canSubmit = title.trim().length > 0 && filledOptions.length >= 2 && !creating;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setErr(null);
    setCreating(true);
    try {
      await onSubmit(title.trim(), filledOptions);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setCreating(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1a1a1a', borderRadius: 12, padding: '1.5rem',
          width: 420, maxWidth: '90vw', border: '1px solid #333',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: '1rem', color: '#e2e8f0' }}>Create Vote</h3>

        <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
          Vote title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="e.g. Where should we have lunch?"
          autoFocus
          style={{
            width: '100%', padding: '0.5rem', background: '#222',
            border: '1px solid #444', borderRadius: 6, color: '#eee',
            fontSize: '0.9rem', marginBottom: '1rem', boxSizing: 'border-box',
          }}
        />

        <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>
          Options (min 2)
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
          {options.map((opt, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <span style={{ color: '#64748b', fontSize: '0.78rem', width: 20, textAlign: 'right', flexShrink: 0 }}>
                {i + 1}.
              </span>
              <input
                type="text"
                value={opt}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                style={{
                  flex: 1, padding: '0.4rem 0.5rem', background: '#222',
                  border: '1px solid #444', borderRadius: 6, color: '#eee', fontSize: '0.85rem',
                }}
              />
              {options.length > 2 && (
                <button
                  onClick={() => removeOption(i)}
                  title="Remove option"
                  style={{
                    background: 'transparent', border: 'none', color: '#64748b',
                    cursor: 'pointer', fontSize: '1rem', padding: '0 0.25rem',
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={addOption}
          style={{
            background: 'transparent', border: '1px dashed #334155', borderRadius: 6,
            color: '#64748b', cursor: 'pointer', fontSize: '0.8rem',
            padding: '0.35rem 0.75rem', marginBottom: '1.25rem', width: '100%',
          }}
        >
          + Add option
        </button>

        {err && (
          <div style={{ color: '#f08080', fontSize: '0.78rem', marginBottom: '0.75rem' }}>{err}</div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.4rem 1rem', background: '#333', color: '#ccc',
              border: '1px solid #444', borderRadius: 6, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              padding: '0.4rem 1rem',
              background: canSubmit ? 'var(--color-primary, #2563EB)' : '#334155',
              color: '#fff', border: 'none', borderRadius: 6,
              cursor: canSubmit ? 'pointer' : 'default',
              opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? 'Creating...' : 'Create Vote'}
          </button>
        </div>
      </div>
    </div>
  );
}
