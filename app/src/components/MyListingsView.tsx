import React from 'react';
import type { Listing, Offer } from '../hooks/useMarketplace';

interface MyListingsViewProps {
  listings: Listing[];
  allOffers: Offer[];   // from the currently-selected listing, or all fetched
  selfIdentity: string | null;
  executorPublicKey: string | null;
  memberNames: Record<string, string>;
  onSelectListing: (id: string) => void;
  onCancelListing: (id: string) => Promise<void>;
  onCreateListing: () => void;
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MyListingsView({
  listings,
  allOffers,
  selfIdentity,
  executorPublicKey,
  memberNames,
  onSelectListing,
  onCancelListing,
  onCreateListing,
}: MyListingsViewProps) {
  const myKey = selfIdentity || executorPublicKey;
  const myListings = listings.filter((l) => l.author === myKey);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid #1f2937',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-accent)', flex: 1 }}>
          My Listings
        </h2>
        <button onClick={onCreateListing} style={BTN_PRIMARY}>
          + List Item
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
        {myListings.length === 0 && (
          <div style={EMPTY_MSG}>
            You haven't listed anything yet. Click "+ List Item" to get started.
          </div>
        )}
        {myListings.map((listing) => {
          const pendingOffers = allOffers.filter(
            (o) => o.listing_id === listing.id && o.status === 'pending',
          );
          return (
            <div key={listing.id} style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <div
                    onClick={() => onSelectListing(listing.id)}
                    style={{ fontWeight: 700, color: '#f9fafb', fontSize: '1rem', cursor: 'pointer', marginBottom: '0.2rem' }}
                  >
                    {listing.title}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                    {listing.category} · {listing.condition} · Listed {formatDate(listing.created_at)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                    {listing.asking_price.toLocaleString()} units
                  </div>
                  <div style={statusBadge(listing.status)}>{listing.status}</div>
                </div>
              </div>

              {pendingOffers.length > 0 && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: '#f59e0b' }}>
                  {pendingOffers.length} pending offer{pendingOffers.length !== 1 ? 's' : ''}
                </div>
              )}

              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => onSelectListing(listing.id)}
                  style={BTN_SECONDARY}
                >
                  View Details
                </button>
                {listing.status === 'active' && (
                  <button
                    onClick={() => onCancelListing(listing.id)}
                    style={BTN_DANGER}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function statusBadge(status: string): React.CSSProperties {
  const color =
    status === 'active' ? '#10b981' :
    status === 'cancelled' ? '#6b7280' :
    status === 'completed' ? '#3b82f6' : '#f59e0b';
  return {
    background: color + '22', color,
    borderRadius: 4, padding: '0.15rem 0.5rem', fontSize: '0.72rem', fontWeight: 600,
    display: 'inline-block', marginTop: '0.2rem',
  };
}

const BTN_PRIMARY: React.CSSProperties = {
  background: 'var(--color-accent)', color: '#111827', border: 'none',
  borderRadius: 6, padding: '0.45rem 1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
};
const BTN_SECONDARY: React.CSSProperties = {
  background: 'transparent', color: '#9ca3af', border: '1px solid #374151',
  borderRadius: 6, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.82rem',
};
const BTN_DANGER: React.CSSProperties = {
  background: '#3a1414', color: '#f87171', border: '1px solid #6a2828',
  borderRadius: 6, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.82rem',
};
const CARD: React.CSSProperties = {
  background: '#111827', border: '1px solid #1f2937', borderRadius: 10,
  padding: '1rem', marginBottom: '0.75rem',
};
const EMPTY_MSG: React.CSSProperties = {
  padding: '3rem', textAlign: 'center', color: '#6b7280', fontSize: '0.9rem',
};
