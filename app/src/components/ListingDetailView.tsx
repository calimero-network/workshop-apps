import React, { useState } from 'react';
import type { Listing, Offer, ProvenanceRecord, Trade } from '../hooks/useMarketplace';

interface ListingDetailViewProps {
  listing: Listing;
  offers: Offer[];
  provenance: ProvenanceRecord[];
  trades: Trade[];
  selfIdentity: string | null;
  executorPublicKey: string | null;
  memberNames: Record<string, string>;
  onMakeOffer: (listingId: string, amount: number) => Promise<string>;
  onAcceptOffer: (offerId: string) => Promise<string>;
  onCancelListing: (id: string) => Promise<void>;
  onDepositEscrow: (tradeId: string, amount: number) => Promise<void>;
  onConfirmReceipt: (tradeId: string) => Promise<void>;
  onBack: () => void;
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ListingDetailView({
  listing,
  offers,
  provenance,
  trades,
  selfIdentity,
  executorPublicKey,
  memberNames,
  onMakeOffer,
  onAcceptOffer,
  onCancelListing,
  onDepositEscrow,
  onConfirmReceipt,
  onBack,
}: ListingDetailViewProps) {
  const [offerAmount, setOfferAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [depositTradeId, setDepositTradeId] = useState('');
  const [depositAmount, setDepositAmount] = useState('');

  const isSeller = listing.author === selfIdentity || listing.author === executorPublicKey;

  // Trades associated with this listing
  const listingTrades = trades.filter((t) => t.listing_id === listing.id);

  const handleMakeOffer = async () => {
    const amount = parseInt(offerAmount, 10);
    if (isNaN(amount) || amount <= 0) { setActionError('Enter a valid offer amount.'); return; }
    setBusy(true); setActionError(null);
    try {
      await onMakeOffer(listing.id, amount);
      setOfferAmount('');
    } catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const handleAccept = async (offerId: string) => {
    setBusy(true); setActionError(null);
    try { await onAcceptOffer(offerId); }
    catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const handleCancel = async () => {
    if (!confirm('Cancel this listing?')) return;
    setBusy(true); setActionError(null);
    try { await onCancelListing(listing.id); }
    catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const handleDeposit = async () => {
    const amount = parseInt(depositAmount, 10);
    if (!depositTradeId || isNaN(amount) || amount <= 0) { setActionError('Enter trade ID and amount.'); return; }
    setBusy(true); setActionError(null);
    try { await onDepositEscrow(depositTradeId, amount); setDepositTradeId(''); setDepositAmount(''); }
    catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const handleConfirmReceipt = async (tradeId: string) => {
    setBusy(true); setActionError(null);
    try { await onConfirmReceipt(tradeId); }
    catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0.85rem 1.5rem',
        borderBottom: '1px solid #1f2937',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}>
        <button onClick={onBack} style={BTN_GHOST}>← Back</button>
        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
          {listing.category} · {listing.condition}
        </span>
        {isSeller && listing.status === 'active' && (
          <button onClick={handleCancel} disabled={busy} style={{ ...BTN_DANGER, marginLeft: 'auto' }}>
            Cancel Listing
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Listing info */}
        <div style={SECTION}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.25rem', color: '#f9fafb', fontSize: '1.3rem' }}>{listing.title}</h2>
              <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                Listed by {memberNames[listing.author] || shortenId(listing.author)}
                {isSeller && ' (you)'}
                {' · '}{formatDate(listing.created_at)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                {listing.asking_price.toLocaleString()} units
              </div>
              <div style={statusBadge(listing.status)}>{listing.status}</div>
            </div>
          </div>
          {listing.description && (
            <p style={{ margin: '0.75rem 0 0', color: '#d1d5db', fontSize: '0.9rem', lineHeight: 1.6 }}>
              {listing.description}
            </p>
          )}
        </div>

        {/* Make offer (buyer) */}
        {!isSeller && listing.status === 'active' && (
          <div style={SECTION}>
            <h3 style={SECTION_TITLE}>Make an Offer</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                style={INPUT}
                type="number"
                min={1}
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                placeholder={`Up to ${listing.asking_price.toLocaleString()} units`}
              />
              <button onClick={handleMakeOffer} disabled={busy} style={BTN_PRIMARY}>
                Submit Offer
              </button>
            </div>
          </div>
        )}

        {/* Offers (seller sees them) */}
        {isSeller && offers.length > 0 && (
          <div style={SECTION}>
            <h3 style={SECTION_TITLE}>Pending Offers</h3>
            {offers.map((offer) => (
              <div key={offer.id} style={OFFER_ROW}>
                <div>
                  <div style={{ fontWeight: 600, color: '#f9fafb' }}>
                    {offer.amount.toLocaleString()} units
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
                    from {memberNames[offer.author] || shortenId(offer.author)} · {formatDate(offer.created_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={statusBadge(offer.status)}>{offer.status}</span>
                  {offer.status === 'pending' && (
                    <button onClick={() => handleAccept(offer.id)} disabled={busy} style={BTN_PRIMARY}>
                      Accept
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Buyer sees their offers */}
        {!isSeller && offers.filter((o) => o.author === selfIdentity || o.author === executorPublicKey).length > 0 && (
          <div style={SECTION}>
            <h3 style={SECTION_TITLE}>Your Offers</h3>
            {offers
              .filter((o) => o.author === selfIdentity || o.author === executorPublicKey)
              .map((offer) => (
                <div key={offer.id} style={OFFER_ROW}>
                  <div style={{ fontWeight: 600, color: '#f9fafb' }}>{offer.amount.toLocaleString()} units</div>
                  <span style={statusBadge(offer.status)}>{offer.status}</span>
                </div>
              ))}
          </div>
        )}

        {/* Escrow / Trades */}
        {listingTrades.length > 0 && (
          <div style={SECTION}>
            <h3 style={SECTION_TITLE}>Escrow & Trades</h3>
            {listingTrades.map((trade) => {
              const isBuyer = trade.buyer === selfIdentity || trade.buyer === executorPublicKey;
              return (
                <div key={trade.id} style={OFFER_ROW}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', fontFamily: 'monospace' }}>
                      Trade {shortenId(trade.id)}
                    </div>
                    <div style={{ color: '#f9fafb', fontSize: '0.9rem' }}>
                      {trade.amount.toLocaleString()} units
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
                      Buyer: {memberNames[trade.buyer] || shortenId(trade.buyer)}{' '}
                      · Seller: {memberNames[trade.seller] || shortenId(trade.seller)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
                    <span style={statusBadge(trade.escrow_status)}>{trade.escrow_status}</span>
                    {isBuyer && trade.escrow_status === 'awaiting_deposit' && (
                      <button onClick={() => handleConfirmDeposit(trade)} disabled={busy} style={BTN_PRIMARY}>
                        Deposit Funds
                      </button>
                    )}
                    {isBuyer && trade.escrow_status === 'shipped' && (
                      <button onClick={() => handleConfirmReceipt(trade.id)} disabled={busy} style={BTN_PRIMARY}>
                        Confirm Receipt
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Deposit inline form */}
        {listingTrades.some(
          (t) =>
            (t.buyer === selfIdentity || t.buyer === executorPublicKey) &&
            t.escrow_status === 'awaiting_deposit',
        ) && (
          <div style={SECTION}>
            <h3 style={SECTION_TITLE}>Deposit to Escrow</h3>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                style={{ ...INPUT, maxWidth: 220 }}
                placeholder="Trade ID"
                value={depositTradeId}
                onChange={(e) => setDepositTradeId(e.target.value)}
              />
              <input
                style={{ ...INPUT, maxWidth: 140 }}
                type="number" min={1}
                placeholder="Amount"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
              <button onClick={handleDeposit} disabled={busy} style={BTN_PRIMARY}>
                Deposit
              </button>
            </div>
          </div>
        )}

        {/* Provenance timeline */}
        {provenance.length > 0 && (
          <div style={SECTION}>
            <h3 style={SECTION_TITLE}>Provenance History</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[...provenance].sort((a, b) => b.sale_date - a.sale_date).map((rec, i) => (
                <div key={i} style={PROVENANCE_ROW}>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>
                      {rec.price.toLocaleString()} units
                    </span>
                    <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>
                      {formatDate(rec.sale_date * 1000)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#d1d5db' }}>
                    {memberNames[rec.prior_owner] || shortenId(rec.prior_owner)}
                  </div>
                  {rec.notes && (
                    <div style={{ fontSize: '0.78rem', color: '#6b7280', fontStyle: 'italic' }}>{rec.notes}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {actionError && (
          <div style={{ color: '#f87171', fontSize: '0.85rem', padding: '0.5rem' }}>{actionError}</div>
        )}
      </div>
    </div>
  );

  // Helper to pre-fill deposit form from trade row button
  function handleConfirmDeposit(trade: Trade) {
    setDepositTradeId(trade.id);
    setDepositAmount(String(trade.amount));
  }
}

function statusBadge(status: string): React.CSSProperties {
  const color =
    status === 'active' ? '#10b981' :
    status === 'pending' ? '#f59e0b' :
    status === 'accepted' ? '#3b82f6' :
    status === 'shipped' ? '#8b5cf6' :
    status === 'completed' ? '#10b981' :
    status === 'cancelled' ? '#6b7280' :
    status === 'awaiting_deposit' ? '#f97316' : '#9ca3af';
  return {
    background: color + '22', color,
    borderRadius: 4, padding: '0.15rem 0.5rem', fontSize: '0.72rem', fontWeight: 600,
    whiteSpace: 'nowrap',
  };
}

const SECTION: React.CSSProperties = {
  background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '1rem',
};
const SECTION_TITLE: React.CSSProperties = {
  margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em',
};
const OFFER_ROW: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '0.6rem 0', borderBottom: '1px solid #1f2937', gap: '0.5rem',
};
const PROVENANCE_ROW: React.CSSProperties = {
  background: '#1f2937', borderRadius: 6, padding: '0.6rem 0.75rem',
  display: 'flex', flexDirection: 'column', gap: '0.2rem',
};
const INPUT: React.CSSProperties = {
  background: '#1f2937', border: '1px solid #374151', borderRadius: 6,
  color: '#f9fafb', padding: '0.45rem 0.6rem', fontSize: '0.9rem', flex: 1,
};
const BTN_PRIMARY: React.CSSProperties = {
  background: 'var(--color-accent)', color: '#111827', border: 'none',
  borderRadius: 6, padding: '0.4rem 0.9rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
  whiteSpace: 'nowrap',
};
const BTN_GHOST: React.CSSProperties = {
  background: 'transparent', color: '#9ca3af', border: 'none',
  cursor: 'pointer', fontSize: '0.9rem', padding: '0.25rem 0',
};
const BTN_DANGER: React.CSSProperties = {
  background: '#3a1414', color: '#f87171', border: '1px solid #6a2828',
  borderRadius: 6, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.82rem',
};
