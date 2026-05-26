import React from 'react';
import type { Offer, Listing } from '../hooks/useMarketplace';

interface MyOffersViewProps {
  allListings: Listing[];
  offers: Offer[];  // all known offers (fetched per-listing as listings are viewed)
  selfIdentity: string | null;
  executorPublicKey: string | null;
  memberNames: Record<string, string>;
  onSelectListing: (id: string) => void;
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MyOffersView({
  allListings,
  offers,
  selfIdentity,
  executorPublicKey,
  memberNames,
  onSelectListing,
}: MyOffersViewProps) {
  const myKey = selfIdentity || executorPublicKey;
  const myOffers = offers.filter((o) => o.author === myKey);

  const getListingTitle = (listingId: string) => {
    const l = allListings.find((x) => x.id === listingId);
    return l?.title || shortenId(listingId);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid #1f2937',
      }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-accent)' }}>
          My Offers
        </h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
        {myOffers.length === 0 && (
          <div style={EMPTY_MSG}>
            You haven't made any offers yet. Browse the marketplace to find items!
          </div>
        )}
        {myOffers.map((offer) => {
          const listing = allListings.find((l) => l.id === offer.listing_id);
          const sellerName = listing
            ? memberNames[listing.author] || shortenId(listing.author)
            : shortenId(offer.listing_id);
          return (
            <div
              key={offer.id}
              style={CARD}
              onClick={() => onSelectListing(offer.listing_id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#f9fafb', fontSize: '0.95rem', marginBottom: '0.2rem' }}>
                    {getListingTitle(offer.listing_id)}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                    Seller: {sellerName} · {formatDate(offer.created_at)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                    {offer.amount.toLocaleString()} units
                  </div>
                  <div style={statusBadge(offer.status)}>{offer.status}</div>
                </div>
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#4b5563' }}>
                Click to view listing details →
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
    status === 'pending' ? '#f59e0b' :
    status === 'accepted' ? '#10b981' :
    status === 'rejected' ? '#ef4444' : '#6b7280';
  return {
    background: color + '22', color,
    borderRadius: 4, padding: '0.15rem 0.5rem', fontSize: '0.72rem', fontWeight: 600,
    display: 'inline-block', marginTop: '0.2rem',
  };
}

const CARD: React.CSSProperties = {
  background: '#111827', border: '1px solid #1f2937', borderRadius: 10,
  padding: '1rem', marginBottom: '0.75rem', cursor: 'pointer',
};
const EMPTY_MSG: React.CSSProperties = {
  padding: '3rem', textAlign: 'center', color: '#6b7280', fontSize: '0.9rem',
};
