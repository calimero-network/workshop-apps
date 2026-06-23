/**
 * ClosedDealsView — summary of Won and Lost deals with totals and outcome filter.
 */
import React, { useState } from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import type { Lead } from '../api/pipeline/PipelineClient';

interface ClosedDealsViewProps {
  closedLeads: Lead[];
  loading: boolean;
}

type Filter = 'All' | 'Won' | 'Lost';

function formatValue(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

function formatDate(epochMs: number): string {
  if (!epochMs) return '—';
  try {
    return new Date(epochMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

export default function ClosedDealsView({ closedLeads, loading }: ClosedDealsViewProps) {
  const [filter, setFilter] = useState<Filter>('All');

  const filtered = filter === 'All' ? closedLeads : closedLeads.filter((l) => l.stage === filter);

  const wonLeads = closedLeads.filter((l) => l.stage === 'Won');
  const lostLeads = closedLeads.filter((l) => l.stage === 'Lost');
  const wonTotal = wonLeads.reduce((s, l) => s + l.value, 0);
  const lostTotal = lostLeads.reduce((s, l) => s + l.value, 0);

  return (
    <Wrap>
      <Toolbar>
        <ToolbarLeft>
          <h1>Closed Deals</h1>
          {loading && <Spinner />}
        </ToolbarLeft>
      </Toolbar>

      {/* Summary cards */}
      <SummaryRow>
        <SummaryCard $variant="won">
          <div className="label">Won</div>
          <div className="value">{formatValue(wonTotal)}</div>
          <div className="count">{wonLeads.length} deal{wonLeads.length !== 1 ? 's' : ''}</div>
        </SummaryCard>
        <SummaryCard $variant="lost">
          <div className="label">Lost</div>
          <div className="value">{formatValue(lostTotal)}</div>
          <div className="count">{lostLeads.length} deal{lostLeads.length !== 1 ? 's' : ''}</div>
        </SummaryCard>
        <SummaryCard $variant="total">
          <div className="label">All Closed</div>
          <div className="value">{formatValue(wonTotal + lostTotal)}</div>
          <div className="count">{closedLeads.length} deal{closedLeads.length !== 1 ? 's' : ''}</div>
        </SummaryCard>
      </SummaryRow>

      {/* Filter tabs */}
      <FilterBar>
        {(['All', 'Won', 'Lost'] as Filter[]).map((f) => (
          <FilterTab key={f} $active={filter === f} onClick={() => setFilter(f)}>
            {f}
            <span className="badge">
              {f === 'All' ? closedLeads.length : f === 'Won' ? wonLeads.length : lostLeads.length}
            </span>
          </FilterTab>
        ))}
      </FilterBar>

      {/* Deals table */}
      <TableWrap>
        {filtered.length === 0 ? (
          <EmptyState>
            {loading ? 'Loading…' : filter === 'All' ? 'No closed deals yet.' : `No ${filter} deals yet.`}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Lead</Th>
                <Th>Company</Th>
                <Th $right>Value</Th>
                <Th>Outcome</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <Tr key={lead.id}>
                  <Td>{lead.name}</Td>
                  <Td style={{ color: C.mutedSoft }}>{lead.company}</Td>
                  <Td $right><ValueBadge>{formatValue(lead.value)}</ValueBadge></Td>
                  <Td>
                    <OutcomeBadge $won={lead.stage === 'Won'}>
                      {lead.stage === 'Won' ? '✓ Won' : '✗ Lost'}
                    </OutcomeBadge>
                  </Td>
                  <Td style={{ color: C.mutedSoft }}>{formatDate(lead.created_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableWrap>
    </Wrap>
  );
}

/* ── Styled components ── */
const font = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased;`;

const Wrap = styled.div`
  flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100%;
  background: ${C.paper2}; ${font}
`;
const Toolbar = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid ${C.line};
  background: ${C.paper}; flex-shrink: 0;
`;
const ToolbarLeft = styled.div`
  display: flex; align-items: center; gap: 12px;
  h1 { font-size: 18px; font-weight: 800; color: ${C.ink}; margin: 0; letter-spacing: -0.4px; }
`;
const Spinner = styled.div`
  width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid ${C.line}; border-top-color: var(--color-primary, #2563EB);
  animation: spin 0.6s linear infinite;
  @keyframes spin { to { transform: rotate(360deg); } }
`;
const SummaryRow = styled.div`
  display: flex; gap: 14px; padding: 20px 20px 0; flex-shrink: 0;
  @media (max-width: 640px) { flex-direction: column; }
`;
const SummaryCard = styled.div<{ $variant: 'won' | 'lost' | 'total' }>`
  flex: 1; padding: 16px 18px; border-radius: 12px; border: 1px solid ${C.line};
  background: ${C.paper};
  .label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${C.mutedSoft}; margin-bottom: 4px; }
  .value { font-size: 22px; font-weight: 800; letter-spacing: -0.6px;
    color: ${(p) => p.$variant === 'won' ? 'var(--color-accent, #10B981)' : p.$variant === 'lost' ? '#ef4444' : C.ink};
  }
  .count { font-size: 12px; color: ${C.mutedSoft}; margin-top: 2px; }
`;
const FilterBar = styled.div`
  display: flex; gap: 4px; padding: 14px 20px 0; flex-shrink: 0;
`;
const FilterTab = styled.button<{ $active?: boolean }>`
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 13px; border-radius: 8px; border: 1px solid ${(p) => (p.$active ? 'var(--color-primary, #2563EB)' : C.line)};
  background: ${(p) => (p.$active ? 'rgba(37,99,235,0.08)' : C.paper)};
  color: ${(p) => (p.$active ? 'var(--color-primary, #2563EB)' : C.muted)};
  font-size: 13px; font-weight: ${(p) => (p.$active ? 700 : 500)};
  cursor: pointer; transition: all 0.14s;
  &:hover { background: ${C.paper2}; }
  .badge {
    font-size: 11px; font-weight: 700;
    background: ${(p) => (p.$active ? 'var(--color-primary, #2563EB)' : C.paper2)};
    color: ${(p) => (p.$active ? '#fff' : C.muted)};
    padding: 1px 7px; border-radius: 999px;
  }
`;
const TableWrap = styled.div`
  flex: 1; overflow-y: auto; padding: 16px 20px;
`;
const EmptyState = styled.div`
  padding: 48px 24px; text-align: center; font-size: 14px; color: ${C.mutedSoft};
`;
const Table = styled.table`
  width: 100%; border-collapse: collapse;
  background: ${C.paper}; border-radius: 12px; overflow: hidden;
  border: 1px solid ${C.line};
`;
const Th = styled.th<{ $right?: boolean }>`
  padding: 11px 14px; text-align: ${(p) => (p.$right ? 'right' : 'left')};
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
  color: ${C.mutedSoft}; background: ${C.paper2}; border-bottom: 1px solid ${C.line};
`;
const Tr = styled.tr`
  border-bottom: 1px solid ${C.line};
  transition: background 0.12s;
  &:last-child { border-bottom: none; }
  &:hover { background: ${C.paper2}; }
`;
const Td = styled.td<{ $right?: boolean }>`
  padding: 12px 14px; font-size: 13.5px; color: ${C.ink};
  text-align: ${(p) => (p.$right ? 'right' : 'left')};
`;
const ValueBadge = styled.span`
  font-size: 13px; font-weight: 700; color: var(--color-accent, #10B981);
`;
const OutcomeBadge = styled.span<{ $won?: boolean }>`
  display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700;
  background: ${(p) => (p.$won ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)')};
  color: ${(p) => (p.$won ? 'var(--color-accent, #10B981)' : '#ef4444')};
`;
