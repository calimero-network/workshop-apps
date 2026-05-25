import React, { useState } from 'react';

interface PostUpdateModalProps {
  onPost: (companyName: string, body: string) => Promise<void>;
  onClose: () => void;
}

export default function PostUpdateModal({ onPost, onClose }: PostUpdateModalProps) {
  const [companyName, setCompanyName] = useState('');
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handlePost = async () => {
    const cn = companyName.trim();
    const bd = body.trim();
    if (!cn || !bd || posting) return;
    setPosting(true);
    setErr(null);
    try {
      await onPost(cn, bd);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: '#1e293b', borderRadius: 12, padding: '1.5rem',
        width: 460, border: '1px solid #334155',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: '1rem', color: '#e2e8f0' }}>Post Progress Update</h3>

        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem', display: 'block' }}>
            Company name
          </span>
          <input
            autoFocus
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. TechCo Inc"
            style={{
              width: '100%', padding: '0.5rem 0.75rem',
              background: '#0f172a', border: '1px solid #334155', borderRadius: 6,
              color: '#e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box',
            }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem', display: 'block' }}>
            Update body
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="Strong month. MRR up 15%, runway at 18 months…"
            style={{
              width: '100%', padding: '0.5rem 0.75rem',
              background: '#0f172a', border: '1px solid #334155', borderRadius: 6,
              color: '#e2e8f0', fontSize: '0.88rem', resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </label>

        {err && (
          <div style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{err}</div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '0.4rem 1rem', background: '#334155', color: '#cbd5e1',
            border: '1px solid #475569', borderRadius: 6, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handlePost} disabled={posting || !companyName.trim() || !body.trim()} style={{
            padding: '0.4rem 1.25rem',
            background: 'var(--color-accent, #3B82F6)', color: '#fff',
            border: 'none', borderRadius: 6,
            cursor: posting || !companyName.trim() || !body.trim() ? 'default' : 'pointer',
            opacity: posting || !companyName.trim() || !body.trim() ? 0.7 : 1,
          }}>
            {posting ? 'Posting…' : 'Post Update'}
          </button>
        </div>
      </div>
    </div>
  );
}
