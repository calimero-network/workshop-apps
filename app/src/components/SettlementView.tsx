import React, { useState } from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import RecordPaymentModal from './RecordPaymentModal';

interface SettlementViewProps {
  balances: Record<string, number>;
  currency: string;
  members: GroupMember[];
  selfIdentity: string | null;
  memberNames: Record<string, string>;
  onRecordPayment: (from: string, to: string, amount: number) => Promise<void>;
}

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 5)}…${id.slice(-4)}`;
}

interface PaymentSuggestion {
  from: string;
  to: string;
  amount: number;
}

/** Greedy min-cash-flow algorithm to compute suggested payments from balances. */
function computeSettlements(balances: Record<string, number>): PaymentSuggestion[] {
  const eps = 0.005; // ignore balances below half a cent
  const debtors: { id: string; amount: number }[] = [];
  const creditors: { id: string; amount: number }[] = [];

  for (const [id, bal] of Object.entries(balances)) {
    if (bal < -eps) debtors.push({ id, amount: -bal });
    else if (bal > eps) creditors.push({ id, amount: bal });
  }

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const suggestions: PaymentSuggestion[] = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const payment = Math.min(d.amount, c.amount);
    suggestions.push({ from: d.id, to: c.id, amount: Math.round(payment * 100) / 100 });
    d.amount -= payment;
    c.amount -= payment;
    if (d.amount < eps) i++;
    if (c.amount < eps) j++;
  }

  return suggestions;
}

export default function SettlementView({
  balances,
  currency,
  members,
  selfIdentity,
  memberNames,
  onRecordPayment,
}: SettlementViewProps) {
  const [showPayment, setShowPayment] = useState(false);
  const [paymentDefaults, setPaymentDefaults] = useState<{ to?: string; amount?: number }>({});

  const displayName = (id: string) => {
    const m = members.find((x) => x.identity === id);
    return memberNames[id] || m?.alias || shortenId(id);
  };

  const fmt = (amount: number) =>
    `${currency || 'USD'} ${Math.abs(amount).toFixed(2)}`;

  const suggestions = computeSettlements(balances);
  const sortedBalances = Object.entries(balances).sort((a, b) => b[1] - a[1]);

  const openPaymentFor = (to: string, amount: number) => {
    setPaymentDefaults({ to, amount });
    setShowPayment(true);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.25rem', borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#0f172a',
      }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f1f5f9' }}>
          Settlement
        </h2>
        <button
          onClick={() => { setPaymentDefaults({}); setShowPayment(true); }}
          style={{
            padding: '0.4rem 0.9rem', background: 'var(--color-accent, #FF6B35)',
            color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
            fontSize: '0.85rem', fontWeight: 500,
          }}
        >
          + Record Payment
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem' }}>
        {/* Balances */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Balances
          </div>

          {sortedBalances.length === 0 && (
            <div style={{ color: '#475569', fontSize: '0.85rem', padding: '1rem 0' }}>
              No balances yet — add some expenses first.
            </div>
          )}

          {sortedBalances.map(([id, balance]) => {
            const isSelf = id === selfIdentity;
            const isPositive = balance > 0.005;
            const isNegative = balance < -0.005;

            return (
              <div
                key={id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.65rem 0.75rem', background: '#1e293b',
                  border: '1px solid #334155', borderRadius: 8, marginBottom: '0.4rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, color: isSelf ? 'var(--color-primary, #0066CC)' : '#cbd5e1', fontSize: '0.88rem' }}>
                    {displayName(id)}{isSelf ? ' (you)' : ''}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.1rem' }}>
                    {isPositive ? 'is owed' : isNegative ? 'owes' : 'settled up'}
                  </div>
                </div>
                <div style={{
                  fontWeight: 700, fontSize: '1rem',
                  color: isPositive ? '#4ade80' : isNegative ? '#f87171' : '#64748b',
                }}>
                  {isPositive ? '+' : isNegative ? '-' : ''}{fmt(balance)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Suggested settlements */}
        {suggestions.length > 0 && (
          <div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Suggested Payments
            </div>
            {suggestions.map((s, i) => {
              const isFromMe = s.from === selfIdentity;
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.6rem 0.75rem', background: '#1e293b',
                    border: `1px solid ${isFromMe ? 'var(--color-accent, #FF6B35)' : '#334155'}`,
                    borderRadius: 8, marginBottom: '0.4rem',
                  }}
                >
                  <div style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
                    <span style={{ color: isFromMe ? 'var(--color-primary, #0066CC)' : '#e2e8f0', fontWeight: isFromMe ? 600 : 400 }}>
                      {isFromMe ? 'You' : displayName(s.from)}
                    </span>
                    {' → '}
                    <span style={{ color: '#e2e8f0' }}>{displayName(s.to)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--color-accent, #FF6B35)' }}>
                      {fmt(s.amount)}
                    </span>
                    {isFromMe && (
                      <button
                        onClick={() => openPaymentFor(s.to, s.amount)}
                        style={{
                          padding: '0.2rem 0.55rem', fontSize: '0.75rem',
                          background: 'var(--color-accent, #FF6B35)', color: '#fff',
                          border: 'none', borderRadius: 4, cursor: 'pointer',
                        }}
                      >
                        Pay
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {suggestions.length === 0 && sortedBalances.length > 0 && (
          <div style={{ color: '#4ade80', fontSize: '0.9rem', padding: '0.5rem 0', textAlign: 'center' }}>
            ✅ Everyone is settled up!
          </div>
        )}
      </div>

      {showPayment && (
        <RecordPaymentModal
          currency={currency}
          members={members}
          selfIdentity={selfIdentity}
          memberNames={memberNames}
          defaultTo={paymentDefaults.to}
          defaultAmount={paymentDefaults.amount}
          onSubmit={onRecordPayment}
          onClose={() => setShowPayment(false)}
        />
      )}
    </div>
  );
}
