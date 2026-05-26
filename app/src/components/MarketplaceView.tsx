import React, { useMemo, useState } from 'react';
import type { Listing } from '../hooks/useMarketplace';

interface MarketplaceViewProps {
  listings: Listing[];
  loading: boolean;
  memberNames: Record<string, string>;
  selfIdentity: string | null;
  onSelectListing: (id: string) => void;
  onCreateListing: () => void;
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

const CONDITIONS = ['all', 'mint', 'excellent', 'good', 'fair', 'poor'];
const CATEGORIES = ['all', 'watches', 'coins', 'stamps', 'art', 'jewelry', 'books', 'sports', 'other'];

export default function MarketplaceView({
  listings,
  loading,
  memberNames,
  selfIdentity,
  onSelectListing,
  onCreateListing,
}: MarketplaceViewProps) {
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterCondition, setFilterCondition] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return listings.filter((l) => {
      if (filterCategory !== 'all' && l.category !== filterCategory) return false;
      if (filterCondition !== 'all' && l.condition !== filterCondition) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!l.title.toLowerCase().includes(q) && !l.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [listings, filterCategory, filterCondition, search]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid #1f2937',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
      }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-accent)', flex: 1 }}>
          Marketplace
        </h2>
        <button onClick={onCreateListing} style={BTN_PRIMARY}>
          + List Item
        </button>
      </div>

      {/* Filters */}
      <div style={{
        padding: '0.75rem 1.5rem',
        borderBottom: '1px solid #1f2937',
        display: 'flex',
        gap: '0.75rem',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <input
          style={SEARCH_INPUT}
          placeholder="Search listings…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select style={SELECT} value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c === 'all' ? 'All Categories' : c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
        <select style={SELECT} value={filterCondition} onChange={(e) => setFilterCondition(e.target.value)}>
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>{c === 'all' ? 'All Conditions' : c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Listing grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
        {loading && filtered.length === 0 && (
          <div style={EMPTY_MSG}>Loading listings…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={EMPTY_MSG}>
            {listings.length === 0
              ? 'No active listings yet. Be the first to list an item!'
              : 'No listings match your filters.'}
          </div>
        )}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '1rem',
        }}>
          {filtered.map((listing) => {
            const sellerName = memberNames[listing.author] || shortenId(listing.author);
            const isSelf = listing.author === selfIdentity;
            return (
              <div
                key={listing.id}
                onClick={() => onSelectListing(listing.id)}
                data-testid={`listing-card-${listing.id}`}
                style={CARD}
              >
                {/* Category badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={BADGE}>{listing.category}</span>
                  <span style={{ ...BADGE, background: conditionColor(listing.condition) + '22', color: conditionColor(listing.condition) }}>
                    {listing.condition}
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.3rem', color: '#f9fafb' }}>
                  {listing.title}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {listing.description || 'No description'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                    {listing.asking_price.toLocaleString()} units
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {isSelf ? '(you)' : sellerName}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function conditionColor(condition: string): string {
  switch (condition) {
    case 'mint': return '#10b981';
    case 'excellent': return '#3b82f6';
    case 'good': return '#f59e0b';
    case 'fair': return '#f97316';
    case 'poor': return '#ef4444';
    default: return '#6b7280';
  }
}

const BTN_PRIMARY: React.CSSProperties = {
  background: 'var(--color-accent)', color: '#111827', border: 'none',
  borderRadius: 6, padding: '0.45rem 1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
};
const SEARCH_INPUT: React.CSSProperties = {
  background: '#1f2937', border: '1px solid #374151', borderRadius: 6,
  color: '#f9fafb', padding: '0.4rem 0.75rem', fontSize: '0.875rem', flex: 1, minWidth: 160,
};
const SELECT: React.CSSProperties = {
  background: '#1f2937', border: '1px solid #374151', borderRadius: 6,
  color: '#f9fafb', padding: '0.4rem 0.6rem', fontSize: '0.875rem',
};
const CARD: React.CSSProperties = {
  background: '#111827', border: '1px solid #1f2937', borderRadius: 10,
  padding: '1rem', cursor: 'pointer',
  transition: 'border-color 0.15s',
};
const BADGE: React.CSSProperties = {
  background: 'rgba(212,175,55,0.12)', color: 'var(--color-accent)',
  borderRadius: 4, padding: '0.15rem 0.5rem', fontSize: '0.72rem', fontWeight: 600,
};
const EMPTY_MSG: React.CSSProperties = {
  padding: '3rem', textAlign: 'center', color: '#6b7280', fontSize: '0.9rem',
};
