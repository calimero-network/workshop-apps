import React from 'react';
import type { Expense, SettlementSummary } from '../api/trip/TripClient';

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

interface LedgerViewProps {
  expenses: Expense[];
  settlement: SettlementSummary | null;
  memberNames: Record<string, string>;
  loading: boolean;
}

export default function LedgerView({ expenses, settlement, memberNames, loading }: LedgerViewProps) {
  const memberLabel = (id: string) => memberNames[id] || shortenId(id);

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount_cents, 0);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
      {loading && expenses.length === 0 && (
        <div style={{ textAlign: 'center', color: '#64748b', padding: '3rem' }}>Loading…</div>
      )}

      {/* Settlement summary */}
      {settlement && (
        <>
          <SectionTitle>Settlement</SectionTitle>
          {settlement.balances.length === 0 ? (
            <InfoBox>Everyone is settled up!</InfoBox>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.25rem' }}>
              {settlement.balances.map((b, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.6rem 0.75rem',
                  background: '#0f172a',
                  borderRadius: 8,
                  border: '1px solid #1e293b',
                }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                      {memberLabel(b.debtor)}
                    </span>
                    {' owes '}
                    <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
                      {memberLabel(b.creditor)}
                    </span>
                  </span>
                  <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '1rem' }}>
                    {formatCents(b.amount_cents)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Per-person breakdown */}
          {settlement.spent.length > 0 && (
            <>
              <SectionTitle>Per Person</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1.25rem' }}>
                {settlement.spent.map((s) => {
                  const owed = settlement.owed.find((o) => o.member === s.member);
                  return (
                    <div key={s.member} style={{
                      padding: '0.75rem',
                      background: '#0f172a',
                      borderRadius: 8,
                      border: '1px solid #1e293b',
                    }}>
                      <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.88rem', marginBottom: 4 }}>
                        {memberLabel(s.member)}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                        <span style={{ color: '#64748b' }}>Paid</span>
                        <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
                          {formatCents(s.amount_cents)}
                        </span>
                      </div>
                      {owed && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginTop: 2 }}>
                          <span style={{ color: '#64748b' }}>Owes</span>
                          <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                            {formatCents(owed.amount_cents)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* Trip total */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem 1rem',
        background: 'rgba(255,107,107,0.08)',
        border: '1px solid rgba(255,107,107,0.2)',
        borderRadius: 8,
        marginBottom: '1.25rem',
      }}>
        <span style={{ color: '#94a3b8', fontSize: '0.88rem' }}>Trip Total</span>
        <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '1.1rem' }}>
          {formatCents(totalSpent)}
        </span>
      </div>

      {/* Expense list */}
      <SectionTitle>Expenses ({expenses.length})</SectionTitle>
      {expenses.length === 0 && !loading && (
        <InfoBox>No expenses logged yet.</InfoBox>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {[...expenses].sort((a, b) => b.logged_at - a.logged_at).map((exp) => (
          <div key={exp.id} style={{
            padding: '0.65rem 0.75rem',
            background: '#0f172a',
            borderRadius: 8,
            border: '1px solid #1e293b',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.88rem' }}>{exp.description}</span>
              <span style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: '0.95rem' }}>
                {formatCents(exp.amount_cents)}
              </span>
            </div>
            <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: 3 }}>
              Paid by {memberLabel(exp.payer)} · {exp.participants.map(memberLabel).join(', ')}
            </div>
            <div style={{ fontSize: '0.68rem', color: '#475569', marginTop: 1 }}>
              {formatTime(exp.logged_at)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '0.7rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      color: '#64748b',
      textTransform: 'uppercase',
      marginBottom: '0.5rem',
    }}>
      {children}
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '0.75rem',
      background: '#0f172a',
      borderRadius: 8,
      border: '1px solid #1e293b',
      color: '#64748b',
      fontSize: '0.82rem',
      marginBottom: '1rem',
    }}>
      {children}
    </div>
  );
}
