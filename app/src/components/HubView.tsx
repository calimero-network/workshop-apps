import React from 'react';
import { CommunitySummary } from '../api/hub/HubClient';

interface HubViewProps {
  communities: CommunitySummary[];
  onSelectCommunity: (community: CommunitySummary) => void;
  onCreateCommunity: () => void;
}

function formatDate(timestampMs: number): string {
  if (!timestampMs) return '';
  const d = new Date(timestampMs);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function HubView({ communities, onSelectCommunity, onCreateCommunity }: HubViewProps) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary)' }}>
              Community Hub
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Browse all communities or create a new one
            </p>
          </div>
          <button
            onClick={onCreateCommunity}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--color-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 600,
            }}
          >
            + New Community
          </button>
        </div>

        {communities.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '3rem',
            color: '#64748b',
            background: '#0f172a',
            borderRadius: 12,
            border: '1px solid #1e293b',
          }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No communities yet</p>
            <p style={{ fontSize: '0.85rem' }}>Create the first community to get started!</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {communities.map((comm) => (
            <div
              key={comm.id}
              onClick={() => onSelectCommunity(comm)}
              style={{
                padding: '1rem 1.25rem',
                background: '#0f172a',
                borderRadius: 10,
                border: '1px solid #1e293b',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-primary)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#1e293b'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.25rem' }}>
                    {comm.name}
                  </h3>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.4 }}>
                    {comm.topic}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '1rem' }}>
                  <div style={{ color: 'var(--color-accent)', fontSize: '0.85rem', fontWeight: 600 }}>
                    {comm.member_count} member{comm.member_count !== 1 ? 's' : ''}
                  </div>
                  <div style={{ color: '#475569', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                    {formatDate(comm.created_at)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
