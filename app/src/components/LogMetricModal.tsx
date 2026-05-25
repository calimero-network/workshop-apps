import React, { useState } from 'react';

interface LogMetricModalProps {
  onLog: (companyName: string, metricName: string, value: string) => Promise<void>;
  onClose: () => void;
}

const COMMON_METRICS = ['MRR', 'ARR', 'Burn Rate', 'Runway (months)', 'User Count', 'Churn Rate'];

export default function LogMetricModal({ onLog, onClose }: LogMetricModalProps) {
  const [companyName, setCompanyName] = useState('');
  const [metricName, setMetricName] = useState('');
  const [value, setValue] = useState('');
  const [logging, setLogging] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleLog = async () => {
    const cn = companyName.trim();
    const mn = metricName.trim();
    const v = value.trim();
    if (!cn || !mn || !v || logging) return;
    setLogging(true);
    setErr(null);
    try {
      await onLog(cn, mn, v);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLogging(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: '#1e293b', borderRadius: 12, padding: '1.5rem',
        width: 420, border: '1px solid #334155',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: '1rem', color: '#e2e8f0' }}>New Metric</h3>

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

        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem', display: 'block' }}>
            Metric name
          </span>
          <input
            list="metric-suggestions"
            value={metricName}
            onChange={(e) => setMetricName(e.target.value)}
            placeholder="e.g. MRR"
            style={{
              width: '100%', padding: '0.5rem 0.75rem',
              background: '#0f172a', border: '1px solid #334155', borderRadius: 6,
              color: '#e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box',
            }}
          />
          <datalist id="metric-suggestions">
            {COMMON_METRICS.map((m) => <option key={m} value={m} />)}
          </datalist>
        </label>

        <label style={{ display: 'block', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem', display: 'block' }}>
            Value
          </span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. $45,000"
            style={{
              width: '100%', padding: '0.5rem 0.75rem',
              background: '#0f172a', border: '1px solid #334155', borderRadius: 6,
              color: '#e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box',
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
          <button
            onClick={handleLog}
            disabled={logging || !companyName.trim() || !metricName.trim() || !value.trim()}
            style={{
              padding: '0.4rem 1.25rem',
              background: 'var(--color-accent, #3B82F6)', color: '#fff',
              border: 'none', borderRadius: 6,
              cursor: logging || !companyName.trim() || !metricName.trim() || !value.trim()
                ? 'default' : 'pointer',
              opacity: logging || !companyName.trim() || !metricName.trim() || !value.trim()
                ? 0.7 : 1,
            }}
          >
            {logging ? 'Logging…' : 'Log Metric'}
          </button>
        </div>
      </div>
    </div>
  );
}
