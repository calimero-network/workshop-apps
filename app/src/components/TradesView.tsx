import React from 'react';
import type { Trade, Listing } from '../hooks/useMarketplace';

interface TradesViewProps {
  trades: Trade[];
  allListings: Listing[];
  selfIdentity: string | null;
  executorPublicKey: string | null;
  memberNames: Record<string, string>;
  onDepositEscrow: (tradeId: string, amount: number) => Promise<void>;
  onConfirmReceipt: (tradeId: string) => Promise<void>;
  onSelectListing: (id: string) => void;
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TradesView({
  trades,
  allListings,
  selfIdentity,
  executorPublicKey,
  memberNames,
  onDepositEscrow,
  onConfirmReceipt,
  onSelectListing,
}: TradesViewProps) {
  const myKey = selfIdentity || executorPublicKey;
  const myTrades = trades.filter(
    (t) => t.buyer === myKey || t.seller === myKey,
  );

  const active = myTrades.filter((t) => !['completed', 'cancelled'].includes(t.escrow_status));
  const history = myTrades.filter((t) => ['completed', 'cancelled'].includes(t.escrow_status));

  const getListingTitle = (listingId: string) =>
    allListings.find((l) => l.id === listingId)?.title || shortenId(listingId);

  const handleDeposit = async (trade: Trade) => {
    try { await onDepositEscrow(trade.id, trade.amount); }
    catch (e) { console.error(e); }
  };

  const handleConfirm = async (tradeId: string) => {
    try { await onConfirmReceipt(tradeId); }
    catch (e) { console.error(e); }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #1f2937' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-accent)' }}>
          Trades & Escrow
        </h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Active escrows */}
        <div>
          <div style={SECTION_LABEL}>Active Escrows</div>
          {active.length === 0 && (
            <div style={EMPTY_MSG}>No active escrows.</div>
          )}
          {active.map((trade) => {
            const isBuyer = trade.buyer === myKey;
            return (
              <div key={trade.id} style={CARD}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <div
                      style={{ fontWeight: 700, color: '#f9fafb', cursor: 'pointer', marginBottom: '0.2rem' }}
                      onClick={() => onSelectListing(trade.listing_id)}
                    >
                      {getListingTitle(trade.listing_id)}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                      Trade {shortenId(trade.id)} · {formatDate(trade.created_at)}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                      {isBuyer ? '🛒 You are the buyer' : '🏷️ You are the seller'} ·{' '}
                      {isBuyer
                        ? `Seller: ${memberNames[trade.seller] || shortenId(trade.seller)}`
                        : `Buyer: ${memberNames[trade.buyer] || shortenId(trade.buyer)}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                      {trade.amount.toLocaleString()} units
                    </div>
                    <div style={escrowBadge(trade.escrow_status)}>{trade.escrow_status}</div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                  {isBuyer && trade.escrow_status === 'awaiting_deposit' && (
                    <button onClick={() => handleDeposit(trade)} style={BTN_PRIMARY}>
                      Deposit {trade.amount.toLocaleString()} units
                    </button>
                  )}
                  {isBuyer && trade.escrow_status === 'shipped' && (
                    <button onClick={() => handleConfirm(trade.id)} style={BTN_PRIMARY}>
                      Confirm Receipt
                    </button>
                  )}
                  {!isBuyer && trade.escrow_status === 'deposited' && (
                    <div style={{ fontSize: '0.82rem', color: '#f59e0b' }}>
                      Funds locked — ship the item and confirm dispatch.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* History */}
        <div>
          <div style={SECTION_LABEL}>Completed Trades</div>
          {history.length === 0 && (
            <div style={EMPTY_MSG}>No completed trades yet.</div>
          )}
          {history.map((trade) => {
            const isBuyer = trade.buyer === myKey;
            return (
              <div key={trade.id} style={{ ...CARD, opacity: 0.7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <div
                      style={{ fontWeight: 700, color: '#f9fafb', cursor: 'pointer' }}
                      onClick={() => onSelectListing(trade.listing_id)}
                    >
                      {getListingTitle(trade.listing_id)}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.2rem' }}>
                      {formatDate(trade.created_at)} · {isBuyer ? 'Bought' : 'Sold'} for {trade.amount.toLocaleString()} units
                    </div>
                  </div>
                  <div style={escrowBadge(trade.escrow_status)}>{trade.escrow_status}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function escrowBadge(status: string): React.CSSProperties {
  const color =
    status === 'awaiting_deposit' ? '#f97316' :
    status === 'deposited' ? '#3b82f6' :
    status === 'shipped' ? '#8b5cf6' :
    status === 'completed' ? '#10b981' :
    status === 'cancelled' ? '#6b7280' : '#9ca3af';
  return {
    background: color + '22', color,
    borderRadius: 4, padding: '0.15rem 0.5rem', fontSize: '0.72rem', fontWeight: 600,
    display: 'inline-block',
  };
}

const BTN_PRIMARY: React.CSSProperties = {
  background: 'var(--color-accent)', color: '#111827', border: 'none',
  borderRadius: 6, padding: '0.4rem 0.9rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
};
const CARD: React.CSSProperties = {
  background: '#111827', border: '1px solid #1f2937', borderRadius: 10,
  padding: '1rem', marginBottom: '0.75rem',
};
const SECTION_LABEL: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 700, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem',
};
const EMPTY_MSG: React.CSSProperties = {
  padding: '1.5rem', textAlign: 'center', color: '#4b5563', fontSize: '0.85rem',
};
