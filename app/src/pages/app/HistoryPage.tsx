import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { C } from '../../theme';
import { APP_ROUTE } from '../../config';
import {
  type Incident,
  SEVERITY_COLOR,
  STATUS_COLOR,
  STATUS_LABEL,
  timeAgo,
} from '../../types/incidents';

/**
 * HistoryPage — searchable list of all resolved incidents with links to
 * their detail views and postmortems.
 *
 * Shell pass: placeholder data. Client wired in next pass.
 */

// ── Placeholder data ───────────────────────────────────────────────────────
const PLACEHOLDER_RESOLVED: Incident[] = [];

export default function HistoryPage() {
  const resolved = PLACEHOLDER_RESOLVED;
  const [query, setQuery] = useState('');

  const filtered = resolved.filter((i) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      i.title.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q) ||
      i.created_by.toLowerCase().includes(q)
    );
  });

  return (
    <Page>
      {/* ── Header ─────────────────────────────────────────────── */}
      <Header>
        <PageTitle>Incident History</PageTitle>
        <ResolvedCount>{resolved.length} resolved</ResolvedCount>
      </Header>

      {/* ── Search ─────────────────────────────────────────────── */}
      <SearchRow>
        <SearchIcon aria-hidden="true">🔍</SearchIcon>
        <SearchInput
          type="search"
          placeholder="Search resolved incidents…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search resolved incidents"
        />
      </SearchRow>

      {/* ── List ───────────────────────────────────────────────── */}
      {resolved.length === 0 ? (
        <EmptyState>
          <EmptyIcon aria-hidden="true">📋</EmptyIcon>
          <h3>No resolved incidents yet</h3>
          <p>Resolved incidents will appear here with links to their postmortems.</p>
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState>
          <h3>No results for &ldquo;{query}&rdquo;</h3>
          <p>Try a different search term.</p>
        </EmptyState>
      ) : (
        <IncidentList>
          {filtered.map((inc) => (
            <HistoryRow key={inc.id} data-testid={`item-incident-${inc.id}`}>
              <RowLeft>
                <SevBadge style={{ background: SEVERITY_COLOR[inc.severity].bg, color: SEVERITY_COLOR[inc.severity].text }}>
                  {inc.severity.toUpperCase()}
                </SevBadge>
                <RowInfo>
                  <RowTitle>{inc.title}</RowTitle>
                  <RowMeta>
                    Declared by {inc.created_by} · Resolved {inc.resolved_at ? timeAgo(inc.resolved_at) : 'unknown'}
                  </RowMeta>
                </RowInfo>
              </RowLeft>
              <RowActions>
                <IncidentLink to={`${APP_ROUTE}/incident/${inc.id}`}>
                  View
                </IncidentLink>
                <PostmortemLink to={`${APP_ROUTE}/incident/${inc.id}/postmortem`}>
                  Postmortem
                </PostmortemLink>
              </RowActions>
            </HistoryRow>
          ))}
        </IncidentList>
      )}
    </Page>
  );
}

/* ── Styled components ─────────────────────────────────────────────────────── */

const Page = styled.div`width: 100%;`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
`;

const PageTitle = styled.h1`
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: ${C.ink};
`;

const ResolvedCount = styled.span`
  font-size: 13px;
  color: ${C.muted};
  font-weight: 500;
`;

const SearchRow = styled.div`
  position: relative;
  margin-bottom: 20px;
`;

const SearchIcon = styled.span`
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 15px;
  pointer-events: none;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 10px 12px 10px 36px;
  font-size: 14px;
  color: ${C.ink};
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 10px;
  outline: none;
  &:focus {
    border-color: var(--color-accent, #EF4444);
    box-shadow: 0 0 0 3px rgba(239,68,68,0.12);
  }
  &::placeholder { color: ${C.mutedSoft}; }
`;

const IncidentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid ${C.line};
  border-radius: 12px;
  overflow: hidden;
`;

const HistoryRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid ${C.line};
  transition: background 0.12s;
  &:last-child { border-bottom: none; }
  &:hover { background: ${C.paper2}; }
  @media (max-width: 600px) { flex-direction: column; align-items: flex-start; }
`;

const RowLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
`;

const SevBadge = styled.span`
  display: inline-block;
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  flex-shrink: 0;
  white-space: nowrap;
`;

const RowInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
`;

const RowTitle = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${C.ink};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const RowMeta = styled.span`
  font-size: 12px;
  color: ${C.mutedSoft};
`;

const RowActions = styled.div`
  display: flex;
  gap: 8px;
  flex-shrink: 0;
`;

const IncidentLink = styled(Link)`
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 7px;
  color: ${C.ink};
  background: ${C.paper};
  border: 1px solid ${C.line};
  text-decoration: none;
  transition: background 0.12s, border-color 0.12s;
  &:hover { background: ${C.paper2}; border-color: ${C.muted}; }
`;

const PostmortemLink = styled(Link)`
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 7px;
  color: var(--color-accent, #EF4444);
  background: rgba(239,68,68,0.07);
  border: 1px solid rgba(239,68,68,0.2);
  text-decoration: none;
  transition: background 0.12s;
  &:hover { background: rgba(239,68,68,0.14); }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 24px;
  border: 1px dashed ${C.line};
  border-radius: 14px;
  h3 { font-size: 18px; font-weight: 700; color: ${C.ink}; margin: 12px 0 8px; }
  p { font-size: 14px; color: ${C.muted}; }
`;

const EmptyIcon = styled.div`font-size: 40px; line-height: 1;`;
