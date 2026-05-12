import React, { useState } from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import type { Expense } from '../api/trip/TripClient';
import AddExpenseModal from './AddExpenseModal';
import EditExpenseModal from './EditExpenseModal';

interface ExpenseListProps {
  expenses: Expense[];
  currency: string;
  members: GroupMember[];
  selfIdentity: string | null;
  memberNames: Record<string, string>;
  onAddExpense: (amount: number, description: string, splitAmong: string[]) => Promise<void>;
  onEditExpense: (id: string, newAmount: number, newDescription: string) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
}

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 5)}…${id.slice(-4)}`;
}

function formatAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ExpenseList({
  expenses,
  currency,
  members,
  selfIdentity,
  memberNames,
  onAddExpense,
  onEditExpense,
  onDeleteExpense,
}: ExpenseListProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Expense | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const displayName = (id: string) => {
    const m = members.find((x) => x.identity === id);
    return memberNames[id] || m?.alias || shortenId(id);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this expense?')) return;
    setDeletingId(id);
    try { await onDeleteExpense(id); } catch (err) {
      alert(`Failed to delete: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setDeletingId(null); }
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
          Expenses
        </h2>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            padding: '0.4rem 0.9rem', background: 'var(--color-primary, #0066CC)',
            color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
            fontSize: '0.85rem', fontWeight: 500,
          }}
        >
          + Add Expense
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem' }}>
        {expenses.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '3rem', color: '#475569',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🧾</div>
            <div>No expenses yet. Add the first one!</div>
          </div>
        )}

        {expenses.map((exp) => {
          const isMine = exp.payer === selfIdentity;
          const perPerson = exp.split_among.length > 0
            ? exp.amount / exp.split_among.length
            : exp.amount;

          return (
            <div
              key={exp.id}
              data-testid={`expense-${exp.id}`}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 8,
                padding: '0.75rem 1rem',
                marginBottom: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.95rem' }}>
                    {exp.description}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                    Paid by <span style={{ color: isMine ? 'var(--color-primary, #0066CC)' : '#cbd5e1' }}>
                      {isMine ? 'you' : displayName(exp.payer)}
                    </span>
                    {' · '}
                    {formatDate(exp.created_at)}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '0.2rem' }}>
                    Split among {exp.split_among.length} person{exp.split_among.length !== 1 ? 's' : ''}
                    {' · '}{formatAmount(perPerson, currency)}/person
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.75rem' }}>
                  <div style={{
                    fontSize: '1.1rem', fontWeight: 700,
                    color: 'var(--color-accent, #FF6B35)',
                  }}>
                    {formatAmount(exp.amount, currency)}
                  </div>
                  {isMine && (
                    <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', marginTop: '0.4rem' }}>
                      <button
                        onClick={() => setEditTarget(exp)}
                        style={iconBtnStyle}
                        title="Edit expense"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(exp.id)}
                        disabled={deletingId === exp.id}
                        style={{ ...iconBtnStyle, color: '#f87171' }}
                        title="Delete expense"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <AddExpenseModal
          currency={currency}
          members={members}
          selfIdentity={selfIdentity}
          memberNames={memberNames}
          onSubmit={onAddExpense}
          onClose={() => setShowAdd(false)}
        />
      )}

      {editTarget && (
        <EditExpenseModal
          expense={editTarget}
          currency={currency}
          onSubmit={onEditExpense}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  padding: '0.15rem 0.35rem',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid #334155',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: '0.8rem',
  color: '#94a3b8',
};
