import React, { useMemo } from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import type { Expense } from '../api/expenses/ExpensesClient';

function fmtAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface CategoryRow {
  category: string;
  pending: number;
  approved: number;
  reimbursed: number;
  rejected: number;
  total: number; // approved + reimbursed (the "real" spend)
}

interface Props {
  allExpenses: Expense[];
  loading: boolean;
}

export default function SpendingSummaryView({ allExpenses, loading }: Props) {
  const { rows, grandApproved, grandReimbursed, grandPending } = useMemo(() => {
    const byCategory: Record<string, CategoryRow> = {};

    for (const exp of allExpenses) {
      if (!byCategory[exp.category]) {
        byCategory[exp.category] = { category: exp.category, pending: 0, approved: 0, reimbursed: 0, rejected: 0, total: 0 };
      }
      const row = byCategory[exp.category];
      if (exp.status === 'pending')    row.pending    += exp.amount;
      if (exp.status === 'approved')   row.approved   += exp.amount;
      if (exp.status === 'reimbursed') row.reimbursed += exp.amount;
      if (exp.status === 'rejected')   row.rejected   += exp.amount;
      row.total = row.approved + row.reimbursed;
    }

    const rows = Object.values(byCategory).sort((a, b) => b.total - a.total);
    const grandApproved   = rows.reduce((s, r) => s + r.approved, 0);
    const grandReimbursed = rows.reduce((s, r) => s + r.reimbursed, 0);
    const grandPending    = rows.reduce((s, r) => s + r.pending, 0);

    return { rows, grandApproved, grandReimbursed, grandPending };
  }, [allExpenses]);

  const maxTotal = rows.length > 0 ? Math.max(...rows.map((r) => r.total)) : 1;

  return (
    <Wrap>
      {/* ── Summary cards ── */}
      <SummaryCards>
        <SummaryCard $color="var(--color-accent)">
          <div className="label">Total Approved</div>
          <div className="value">{fmtAmount(grandApproved)}</div>
        </SummaryCard>
        <SummaryCard $color="var(--color-primary)">
          <div className="label">Total Reimbursed</div>
          <div className="value">{fmtAmount(grandReimbursed)}</div>
        </SummaryCard>
        <SummaryCard $color="#b45309">
          <div className="label">Pending Review</div>
          <div className="value">{fmtAmount(grandPending)}</div>
        </SummaryCard>
      </SummaryCards>

      {/* ── By-category breakdown ── */}
      <Card>
        <CardTitle>Spend by Category</CardTitle>
        {loading && rows.length === 0 && <Empty>Loading…</Empty>}
        {!loading && rows.length === 0 && <Empty>No expenses yet. Submit your first expense to see spending here.</Empty>}

        {rows.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th $left>Category</Th>
                <Th>Approved</Th>
                <Th>Reimbursed</Th>
                <Th>Pending</Th>
                <Th>Bar</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.category}>
                  <Td $left $bold>{row.category || '(uncategorized)'}</Td>
                  <Td $accent>{fmtAmount(row.approved)}</Td>
                  <Td $primary>{fmtAmount(row.reimbursed)}</Td>
                  <Td $muted>{fmtAmount(row.pending)}</Td>
                  <Td $bar>
                    <BarWrap>
                      <BarFill $pct={maxTotal > 0 ? (row.reimbursed / maxTotal) * 100 : 0} $color="var(--color-primary)" />
                      <BarFill $pct={maxTotal > 0 ? (row.approved / maxTotal) * 100 : 0} $color="var(--color-accent)" />
                    </BarWrap>
                  </Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <TdFoot $left>Total</TdFoot>
                <TdFoot $accent>{fmtAmount(grandApproved)}</TdFoot>
                <TdFoot $primary>{fmtAmount(grandReimbursed)}</TdFoot>
                <TdFoot $muted>{fmtAmount(grandPending)}</TdFoot>
                <TdFoot />
              </tr>
            </tfoot>
          </Table>
        )}
      </Card>

      {/* ── Per-status counts ── */}
      {allExpenses.length > 0 && (
        <Card>
          <CardTitle>Count by Status</CardTitle>
          <StatusGrid>
            {(['pending','approved','rejected','reimbursed'] as const).map((s) => {
              const count = allExpenses.filter((e) => e.status === s).length;
              return (
                <StatusCell key={s} $status={s}>
                  <div className="n">{count}</div>
                  <div className="label">{s}</div>
                </StatusCell>
              );
            })}
          </StatusGrid>
        </Card>
      )}
    </Wrap>
  );
}

/* ── Styled components ── */

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  overflow-y: auto;
  flex: 1;
`;

const SummaryCards = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;

const SummaryCard = styled.div<{ $color: string }>`
  padding: 18px 20px;
  border-radius: 12px;
  border: 1px solid ${C.line};
  background: ${C.paper};
  .label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: ${C.muted};
    margin-bottom: 8px;
  }
  .value {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.8px;
    color: ${(p) => p.$color};
  }
`;

const Card = styled.div`
  background: ${C.paper};
  border: 1px solid ${C.line};
  border-radius: 14px;
  padding: 20px 22px;
`;

const CardTitle = styled.h3`
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: ${C.ink};
  margin: 0 0 16px;
`;

const Empty = styled.div`
  text-align: center;
  padding: 28px 0;
  font-size: 13.5px;
  color: ${C.muted};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th<{ $left?: boolean }>`
  padding: 8px 12px;
  text-align: ${(p) => (p.$left ? 'left' : 'right')};
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${C.mutedSoft};
  border-bottom: 1px solid ${C.line};
`;

const Td = styled.td<{ $left?: boolean; $bold?: boolean; $accent?: boolean; $primary?: boolean; $muted?: boolean; $bar?: boolean }>`
  padding: 10px 12px;
  text-align: ${(p) => (p.$left || p.$bar ? (p.$bar ? 'left' : 'left') : 'right')};
  font-size: 13.5px;
  font-weight: ${(p) => (p.$bold ? 700 : 500)};
  color: ${(p) => p.$accent ? 'var(--color-accent)' : p.$primary ? 'var(--color-primary)' : p.$muted ? '#b45309' : C.ink};
  border-bottom: 1px solid ${C.line};
  min-width: ${(p) => (p.$bar ? '120px' : 'auto')};
  &:last-child { border-bottom: none; }
`;

const TdFoot = styled.td<{ $left?: boolean; $accent?: boolean; $primary?: boolean; $muted?: boolean }>`
  padding: 10px 12px;
  text-align: ${(p) => (p.$left ? 'left' : 'right')};
  font-size: 13.5px;
  font-weight: 700;
  color: ${(p) => p.$accent ? 'var(--color-accent)' : p.$primary ? 'var(--color-primary)' : p.$muted ? '#b45309' : C.ink};
  border-top: 2px solid ${C.line};
`;

const BarWrap = styled.div`
  position: relative;
  height: 8px;
  border-radius: 999px;
  background: ${C.paper2};
  overflow: hidden;
  display: flex;
`;

const BarFill = styled.div<{ $pct: number; $color: string }>`
  height: 100%;
  width: ${(p) => p.$pct}%;
  background: ${(p) => p.$color};
  transition: width 0.4s ease;
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  @media (max-width: 640px) { grid-template-columns: repeat(2, 1fr); }
`;

const STATUS_BG: Record<string, string> = {
  pending:    'rgba(234,179,8,0.12)',
  approved:   'rgba(5,150,105,0.12)',
  rejected:   'rgba(220,38,38,0.10)',
  reimbursed: 'rgba(30,64,175,0.10)',
};
const STATUS_FG: Record<string, string> = {
  pending:    '#b45309',
  approved:   '#065f46',
  rejected:   '#991b1b',
  reimbursed: '#1e40af',
};

const StatusCell = styled.div<{ $status: string }>`
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid ${C.line};
  background: ${(p) => STATUS_BG[p.$status] ?? C.paper2};
  .n {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.8px;
    color: ${(p) => STATUS_FG[p.$status] ?? C.ink};
  }
  .label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: ${(p) => STATUS_FG[p.$status] ?? C.muted};
    margin-top: 4px;
  }
`;
