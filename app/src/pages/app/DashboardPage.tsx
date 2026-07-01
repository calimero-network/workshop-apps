import React from 'react';
import styled from 'styled-components';
import { C } from '../../theme';
import { APP_ROUTE } from '../../config';
import { useNavigate } from 'react-router-dom';

/**
 * DashboardPage — overview stats and entry point into the vector knowledge base.
 * Shell pass: placeholder values; real data is wired in the ABI pass.
 */
export default function DashboardPage() {
  const navigate = useNavigate();

  return (
    <Page>
      <PageHeader>
        <div>
          <PageTitle>Dashboard</PageTitle>
          <PageSub>Overview of your shared vector knowledge base</PageSub>
        </div>
        <AddBtn onClick={() => navigate(`${APP_ROUTE}/browse`)}>
          <PlusIcon />
          Add Entry
        </AddBtn>
      </PageHeader>

      {/* Stats grid */}
      <StatsGrid>
        <StatCard $accent="primary">
          <StatIcon>
            <IconEntries />
          </StatIcon>
          <StatBody>
            <StatValue data-testid="stat-total_entries">—</StatValue>
            <StatLabel>Total Entries</StatLabel>
          </StatBody>
        </StatCard>

        <StatCard $accent="accent">
          <StatIcon $accent="accent">
            <IconCollections />
          </StatIcon>
          <StatBody>
            <StatValue data-testid="stat-total_collections">—</StatValue>
            <StatLabel>Collections</StatLabel>
          </StatBody>
        </StatCard>

        <StatCard $accent="neutral">
          <StatIcon $accent="neutral">
            <IconDimension />
          </StatIcon>
          <StatBody>
            <StatValue data-testid="stat-dimension">—</StatValue>
            <StatLabel>Vector Dimension</StatLabel>
          </StatBody>
        </StatCard>

        <StatCard $accent="neutral">
          <StatIcon $accent="neutral">
            <IconTags />
          </StatIcon>
          <StatBody>
            <StatValue>—</StatValue>
            <StatLabel>Unique Tags</StatLabel>
          </StatBody>
        </StatCard>
      </StatsGrid>

      {/* Quick actions */}
      <QuickSection>
        <SectionTitle>Quick Actions</SectionTitle>
        <QuickGrid>
          <QuickCard onClick={() => navigate(`${APP_ROUTE}/browse`)}>
            <QIcon $color="primary"><IconBrowse /></QIcon>
            <QBody>
              <QTitle>Add Knowledge</QTitle>
              <QDesc>Add a text chunk with its embedding vector</QDesc>
            </QBody>
          </QuickCard>
          <QuickCard onClick={() => navigate(`${APP_ROUTE}/search`)}>
            <QIcon $color="accent"><IconSearch /></QIcon>
            <QBody>
              <QTitle>Semantic Search</QTitle>
              <QDesc>Find similar entries by cosine similarity</QDesc>
            </QBody>
          </QuickCard>
          <QuickCard onClick={() => navigate(`${APP_ROUTE}/viz`)}>
            <QIcon $color="purple"><IconViz /></QIcon>
            <QBody>
              <QTitle>Visualize</QTitle>
              <QDesc>Explore the shape of your knowledge base</QDesc>
            </QBody>
          </QuickCard>
          <QuickCard onClick={() => navigate(`${APP_ROUTE}/collections`)}>
            <QIcon $color="neutral"><IconFolders /></QIcon>
            <QBody>
              <QTitle>Collections</QTitle>
              <QDesc>Organize entries into named groups</QDesc>
            </QBody>
          </QuickCard>
        </QuickGrid>
      </QuickSection>

      {/* Recent additions */}
      <QuickSection>
        <SectionTitle>Recent Additions</SectionTitle>
        <EmptyState>
          <EmptyIcon><IconEntries /></EmptyIcon>
          <EmptyText>No entries yet.</EmptyText>
          <EmptySub>Add your first knowledge chunk to get started.</EmptySub>
          <EmptyBtn onClick={() => navigate(`${APP_ROUTE}/browse`)}>Add Entry</EmptyBtn>
        </EmptyState>
      </QuickSection>
    </Page>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────────── */
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconEntries() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}
function IconCollections() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function IconDimension() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
function IconTags() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}
function IconBrowse() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  );
}
function IconViz() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="17" r="2" /><circle cx="17" cy="7" r="2" /><circle cx="17" cy="17" r="2" />
      <circle cx="7" cy="7" r="2" /><circle cx="12" cy="12" r="2" />
    </svg>
  );
}
function IconFolders() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/* ── Styled components ──────────────────────────────────────────────────────── */
const Page = styled.div`
  padding: 28px 32px 60px;
  max-width: 1100px;
  width: 100%;
`;

const PageHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
`;

const PageTitle = styled.h1`
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: ${C.ink};
  margin-bottom: 4px;
`;

const PageSub = styled.p`
  font-size: 13.5px;
  color: ${C.muted};
`;

const AddBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  color: #fff;
  background: var(--color-primary);
  border: none;
  flex-shrink: 0;
  transition: opacity 0.18s, transform 0.15s;
  &:hover { opacity: 0.88; transform: translateY(-1px); }
`;

/* Stats */
const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 32px;
  @media (max-width: 900px) { grid-template-columns: repeat(2, 1fr); }
  @media (max-width: 500px) { grid-template-columns: 1fr; }
`;

const StatCard = styled.div<{ $accent: 'primary' | 'accent' | 'neutral' }>`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 16px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 14px;
  border-top: 3px solid ${(p) =>
    p.$accent === 'primary' ? 'var(--color-primary)' :
    p.$accent === 'accent' ? 'var(--color-accent)' :
    C.line};
`;

const StatIcon = styled.div<{ $accent?: 'primary' | 'accent' | 'neutral' }>`
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: ${(p) =>
    p.$accent === 'accent' ? 'rgba(34,211,238,0.12)' : 'rgba(124,58,237,0.12)'};
  color: ${(p) =>
    p.$accent === 'accent' ? 'var(--color-accent)' : 'var(--color-primary)'};
`;

const StatBody = styled.div``;

const StatValue = styled.div`
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.8px;
  color: ${C.ink};
  line-height: 1;
  margin-bottom: 4px;
`;

const StatLabel = styled.div`
  font-size: 12px;
  color: ${C.muted};
  font-weight: 500;
`;

/* Quick actions */
const QuickSection = styled.section`
  margin-bottom: 28px;
`;

const SectionTitle = styled.h2`
  font-size: 14px;
  font-weight: 700;
  color: ${C.muted};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 12px;
`;

const QuickGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  @media (max-width: 900px) { grid-template-columns: repeat(2, 1fr); }
  @media (max-width: 500px) { grid-template-columns: 1fr; }
`;

const QuickCard = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
  &:hover {
    border-color: var(--color-primary);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(124, 58, 237, 0.12);
  }
`;

const QIcon = styled.div<{ $color: 'primary' | 'accent' | 'purple' | 'neutral' }>`
  width: 34px;
  height: 34px;
  border-radius: 9px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  background: ${(p) =>
    p.$color === 'accent' ? 'rgba(34,211,238,0.12)' :
    p.$color === 'neutral' ? C.paper :
    'rgba(124,58,237,0.12)'};
  color: ${(p) =>
    p.$color === 'accent' ? 'var(--color-accent)' :
    p.$color === 'neutral' ? C.muted :
    'var(--color-primary)'};
`;

const QBody = styled.div``;
const QTitle = styled.div`font-size: 13px; font-weight: 600; color: ${C.ink}; margin-bottom: 2px;`;
const QDesc = styled.div`font-size: 12px; color: ${C.muted};`;

/* Empty state */
const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 24px;
  background: ${C.paper2};
  border: 1px dashed ${C.line};
  border-radius: 14px;
  text-align: center;
`;

const EmptyIcon = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(124, 58, 237, 0.1);
  color: var(--color-primary);
  display: grid;
  place-items: center;
  margin-bottom: 14px;
`;

const EmptyText = styled.p`
  font-size: 15px;
  font-weight: 600;
  color: ${C.ink};
  margin-bottom: 6px;
`;

const EmptySub = styled.p`
  font-size: 13px;
  color: ${C.muted};
  margin-bottom: 18px;
`;

const EmptyBtn = styled.button`
  padding: 9px 18px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 9px;
  cursor: pointer;
  color: #fff;
  background: var(--color-primary);
  border: none;
  transition: opacity 0.18s;
  &:hover { opacity: 0.88; }
`;
