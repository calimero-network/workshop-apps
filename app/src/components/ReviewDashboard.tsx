import React, { useState } from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import type { Expense } from '../api/expenses/ExpensesClient';

const STATUS_COLORS: Record<string, string> = {
  pending:    'rgba(234,179,8,0.15)',
  approved:   'rgba(5,150,105,0.15)',
  rejected:   'rgba(220,38,38,0.15)',
  reimbursed: 'rgba(59,130,246,0.15)',
};
const STATUS_TEXT: Record<string, string> = {
  pending:    '#b45309',
  approved:   '#065f46',
  rejected:   '#991b1b',
  reimbursed: '#1e40af',
};

function fmtAmount(amount: number, currency: string): string {
  return `${(amount / 100).toFixed(2)} ${currency}`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

interface Props {
  pendingExpenses: Expense[];
  allExpenses: Expense[];
  memberNames: Record<string, string>;
  loading: boolean;
  onApprove: (expense_id: string, note: string) => Promise<void>;
  onReject: (expense_id: string, note: string) => Promise<void>;
  onMarkReimbursed: (expense_id: string) => Promise<void>;
}

type Tab = 'pending' | 'all';

export default function ReviewDashboard({
  pendingExpenses,
  allExpenses,
  memberNames,
  loading,
  onApprove,
  onReject,
  onMarkReimbursed,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  // Per-expense note drafts (for approve/reject).
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setNote = (id: string, val: string) => setNotes((p) => ({ ...p, [id]: val }));
  const setBusyFor = (id: string, v: boolean) => setBusy((p) => ({ ...p, [id]: v }));
  const setError = (id: string, msg: string) => setErrors((p) => ({ ...p, [id]: msg }));

  const approve = async (id: string) => {
    setBusyFor(id, true);
    setError(id, '');
    try { await onApprove(id, notes[id] ?? ''); } catch (err) {
      setError(id, err instanceof Error ? err.message : 'Failed');
    } finally { setBusyFor(id, false); }
  };

  const reject = async (id: string) => {
    setBusyFor(id, true);
    setError(id, '');
    try { await onReject(id, notes[id] ?? ''); } catch (err) {
      setError(id, err instanceof Error ? err.message : 'Failed');
    } finally { setBusyFor(id, false); }
  };

  const reimburse = async (id: string) => {
    setBusyFor(id, true);
    setError(id, '');
    try { await onMarkReimbursed(id); } catch (err) {
      setError(id, err instanceof Error ? err.message : 'Failed');
    } finally { setBusyFor(id, false); }
  };

  const displayedExpenses = activeTab === 'pending' ? pendingExpenses : allExpenses;
  const authorName = (identity: string) => memberNames[identity] || shortenId(identity);

  return (
    <Wrap>
      <Header>
        <Title>Review Queue</Title>
        <Tabs>
          <TabBtn $active={activeTab === 'pending'} onClick={() => setActiveTab('pending')}>
            Pending {pendingExpenses.length > 0 && <Badge>{pendingExpenses.length}</Badge>}
          </TabBtn>
          <TabBtn $active={activeTab === 'all'} onClick={() => setActiveTab('all')}>
            All Expenses
          </TabBtn>
        </Tabs>
      </Header>

      {loading && displayedExpenses.length === 0 && <Empty>Loading…</Empty>}
      {!loading && displayedExpenses.length === 0 && (
        <Empty>
          {activeTab === 'pending'
            ? 'No pending expenses — all caught up!'
            : 'No expenses submitted yet.'}
        </Empty>
      )}

      <List>
        {displayedExpenses.map((exp) => (
          <Item key={exp.id}>
            <ItemTop>
              <Author>{authorName(exp.author)}</Author>
              <StatusBadge $status={exp.status}>{exp.status}</StatusBadge>
              <Amount>{fmtAmount(exp.amount, exp.currency)}</Amount>
            </ItemTop>

            <DescRow>
              <span className="desc">{exp.description}</span>
              <span className="cat">{exp.category}</span>
              <span className="date">{fmtDate(exp.submitted_at)}</span>
            </DescRow>

            {exp.reviewer_note && (
              <ReviewNote>Reviewer note: {exp.reviewer_note}</ReviewNote>
            )}

            {errors[exp.id] && <ErrMsg>{errors[exp.id]}</ErrMsg>}

            {/* Action row — shown based on current status */}
            {exp.status === 'pending' && (
              <ActionRow>
                <NoteInput
                  value={notes[exp.id] ?? ''}
                  onChange={(e) => setNote(exp.id, e.target.value)}
                  placeholder="Reviewer note (optional)"
                />
                <ApproveBtn onClick={() => approve(exp.id)} disabled={busy[exp.id]}>
                  {busy[exp.id] ? '…' : 'Approve'}
                </ApproveBtn>
                <RejectBtn onClick={() => reject(exp.id)} disabled={busy[exp.id]}>
                  {busy[exp.id] ? '…' : 'Reject'}
                </RejectBtn>
              </ActionRow>
            )}

            {exp.status === 'approved' && (
              <ActionRow>
                <ReimburseBtn onClick={() => reimburse(exp.id)} disabled={busy[exp.id]}>
                  {busy[exp.id] ? 'Marking…' : 'Mark as Reimbursed'}
                </ReimburseBtn>
              </ActionRow>
            )}
          </Item>
        ))}
      </List>
    </Wrap>
  );
}

/* ── Styled components ── */

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  overflow-y: auto;
  flex: 1;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
`;

const Title = styled.h3`
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: ${C.ink};
  margin: 0;
`;

const Tabs = styled.div`
  display: flex;
  gap: 4px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 10px;
  padding: 3px;
`;

const TabBtn = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background 0.14s, color 0.14s;
  background: ${(p) => (p.$active ? '#fff' : 'transparent')};
  color: ${(p) => (p.$active ? C.ink : C.muted)};
  box-shadow: ${(p) => (p.$active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none')};
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(234,179,8,0.25);
  color: #b45309;
  font-size: 11px;
  font-weight: 700;
`;

const Empty = styled.div`
  text-align: center;
  padding: 52px 0;
  font-size: 14px;
  color: ${C.muted};
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Item = styled.div`
  background: ${C.paper};
  border: 1px solid ${C.line};
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ItemTop = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const Author = styled.span`
  font-size: 13.5px;
  font-weight: 700;
  color: ${C.ink};
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StatusBadge = styled.span<{ $status: string }>`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 3px 9px;
  border-radius: 999px;
  background: ${(p) => STATUS_COLORS[p.$status] ?? 'rgba(100,100,100,0.12)'};
  color: ${(p) => STATUS_TEXT[p.$status] ?? C.muted};
`;

const Amount = styled.span`
  font-size: 15px;
  font-weight: 800;
  color: ${C.ink};
  white-space: nowrap;
`;

const DescRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
  color: ${C.muted};
  flex-wrap: wrap;
  .desc { flex: 1; font-weight: 500; color: ${C.ink}; }
  .cat { background: rgba(30,64,175,0.08); color: #1e40af; border-radius: 6px; padding: 2px 8px; font-weight: 600; font-size: 12px; }
  .date { white-space: nowrap; }
`;

const ReviewNote = styled.div`
  font-size: 12.5px;
  font-style: italic;
  color: ${C.muted};
  background: ${C.paper2};
  padding: 6px 10px;
  border-radius: 7px;
`;

const ErrMsg = styled.p`
  font-size: 12px;
  color: ${C.danger};
  margin: 0;
`;

const ActionRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const NoteInput = styled.input`
  flex: 1;
  min-width: 160px;
  padding: 7px 11px;
  border-radius: 8px;
  border: 1px solid ${C.line};
  background: ${C.paper2};
  color: ${C.ink};
  font-size: 13px;
  outline: none;
  &:focus { border-color: var(--color-primary); }
`;

const ApproveBtn = styled.button`
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: #fff;
  background: var(--color-accent);
  border: none;
  transition: opacity 0.15s;
  &:disabled { opacity: 0.55; cursor: default; }
  &:hover:not(:disabled) { opacity: 0.85; }
`;

const RejectBtn = styled.button`
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: ${C.danger};
  background: rgba(220,38,38,0.08);
  border: 1px solid rgba(220,38,38,0.25);
  transition: background 0.14s;
  &:disabled { opacity: 0.55; cursor: default; }
  &:hover:not(:disabled) { background: rgba(220,38,38,0.14); }
`;

const ReimburseBtn = styled.button`
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: #fff;
  background: var(--color-primary);
  border: none;
  transition: opacity 0.15s;
  &:disabled { opacity: 0.55; cursor: default; }
  &:hover:not(:disabled) { opacity: 0.85; }
`;
