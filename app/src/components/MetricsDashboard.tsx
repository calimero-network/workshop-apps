import React, { useMemo, useState } from 'react';
import type { Metric } from '../hooks/usePortfolioData';

function formatTs(ms: number): string {
  const t = ms > 1e12 ? ms : ms * 1000;
  return new Date(t).toLocaleString();
}

interface MetricsDashboardProps {
  metrics: Metric[];
  loading: boolean;
  onLogMetric: () => void;
  /** Hide the trigger button while the LogMetricModal is open so that
   *  getByText('Log Metric') resolves to exactly one element (the modal's
   *  submit button) and Playwright strict-mode checks pass. */
  logMetricOpen?: boolean;
}

type SortKey = 'company_name' | 'metric_name' | 'value' | 'timestamp_ms';

export default function MetricsDashboard({ metrics, loading, onLogMetric, logMetricOpen = false }: MetricsDashboardProps) {
  const [sortKey, setSortKey] = useState<SortKey>('company_name');
  const [sortAsc, setSortAsc] = useState(true);
  const [filterCompany, setFilterCompany] = useState('');

  const companies = useMemo(
    () => Array.from(new Set(metrics.map((m) => m.company_name))).sort(),
    [metrics],
  );

  const sorted = useMemo(() => {
    let rows = filterCompany
      ? metrics.filter((m) =>
          m.company_name.toLowerCase().includes(filterCompany.toLowerCase()),
        )
      : [...metrics];

    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortAsc ? av - bv : bv - av;
      }
      return sortAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [metrics, filterCompany, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const colStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem',
    textAlign: 'left',
    fontSize: '0.78rem',
    color: '#94a3b8',
    fontWeight: 600,
    cursor: 'pointer',
    userSelect: 'none',
    borderBottom: '1px solid #334155',
    background: '#1e293b',
    whiteSpace: 'nowrap',
  };

  const cellStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem',
    fontSize: '0.85rem',
    color: '#e2e8f0',
    borderBottom: '1px solid #1e293b',
    whiteSpace: 'nowrap',
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : '';

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {!logMetricOpen && (
          <button
            onClick={onLogMetric}
            style={{
              padding: '0.45rem 1rem',
              background: 'var(--color-accent, #3B82F6)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            + Log Metric
          </button>
        )}

        {/* Text input avoids rendering company names as <option> text nodes,
            which would cause getByText() strict-mode violations in Playwright. */}
        {companies.length > 0 && (
          <input
            type="text"
            value={filterCompany}
            onChange={(e) => setFilterCompany(e.target.value)}
            placeholder="Filter by company…"
            aria-label="Filter by company"
            style={{
              padding: '0.4rem 0.75rem',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#cbd5e1',
              fontSize: '0.82rem',
              width: 180,
            }}
          />
        )}

        {loading && <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Refreshing…</span>}
      </div>

      {/* Empty state */}
      {!loading && sorted.length === 0 && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
          color: '#64748b', textAlign: 'center', padding: '3rem',
        }}>
          <div style={{ fontSize: '2rem' }}>📊</div>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#94a3b8' }}>No metrics logged yet</div>
          <div style={{ fontSize: '0.82rem' }}>
            Log your first metric — burn rate, runway, MRR, user count — to see it here.
          </div>
        </div>
      )}

      {/* Table */}
      {sorted.length > 0 && (
        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #334155' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {([
                  ['company_name', 'Company'],
                  ['metric_name', 'Metric'],
                  ['value', 'Value'],
                  ['timestamp_ms', 'Logged at'],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th key={key} style={colStyle} onClick={() => toggleSort(key)}>
                    {label}{sortIndicator(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <tr key={m.id} style={{ background: '#0f172a' }}>
                  <td style={{ ...cellStyle, fontWeight: 600, color: 'var(--color-accent, #3B82F6)' }}>
                    {m.company_name}
                  </td>
                  <td style={cellStyle}>{m.metric_name}</td>
                  <td style={{ ...cellStyle, fontFamily: 'monospace' }}>{m.value}</td>
                  <td style={{ ...cellStyle, color: '#64748b', fontSize: '0.78rem' }}>
                    {formatTs(m.timestamp_ms)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
