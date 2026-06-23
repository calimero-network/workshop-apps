/**
 * PipelineBoard — Kanban-style board with leads as cards grouped into stage
 * columns. Drag a card to a different column header to call move_lead; use the
 * action menu on the card for "Close as Won/Lost".
 */
import React, { useState, DragEvent } from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import type { Lead } from '../api/pipeline/PipelineClient';

interface PipelineBoardProps {
  stages: string[];
  leads: Lead[];
  loading: boolean;
  onMoveLead: (leadId: string, newStage: string) => Promise<void>;
  onCloseLead: (leadId: string, outcome: 'Won' | 'Lost') => Promise<void>;
  onAddLead: () => void;
  onManageStages: () => void;
}

function formatValue(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

export default function PipelineBoard({
  stages,
  leads,
  loading,
  onMoveLead,
  onCloseLead,
  onAddLead,
  onManageStages,
}: PipelineBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [busyLeads, setBusyLeads] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<string | null>(null); // leadId of open action menu

  const leadsByStage = (stage: string) => leads.filter((l) => l.stage === stage);
  const stageTotal = (stage: string) =>
    leadsByStage(stage).reduce((sum, l) => sum + l.value, 0);

  const setBusy = (id: string, busy: boolean) =>
    setBusyLeads((prev) => {
      const next = new Set(prev);
      busy ? next.add(id) : next.delete(id);
      return next;
    });

  /* ── Drag handlers ── */
  const handleDragStart = (e: DragEvent<HTMLDivElement>, leadId: string) => {
    setDraggingId(leadId);
    e.dataTransfer.setData('leadId', leadId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverStage(null);
  };

  const handleColumnDragOver = (e: DragEvent<HTMLDivElement>, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  };

  const handleColumnDrop = async (e: DragEvent<HTMLDivElement>, stage: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('leadId');
    setDraggingId(null);
    setDragOverStage(null);
    if (!leadId) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stage === stage) return;
    setBusy(leadId, true);
    try { await onMoveLead(leadId, stage); } finally { setBusy(leadId, false); }
  };

  /* ── Close actions ── */
  const handleClose = async (leadId: string, outcome: 'Won' | 'Lost') => {
    setOpenMenu(null);
    setBusy(leadId, true);
    try { await onCloseLead(leadId, outcome); } finally { setBusy(leadId, false); }
  };

  return (
    <BoardWrap>
      {/* Toolbar */}
      <Toolbar>
        <ToolbarLeft>
          <h1>Pipeline</h1>
          {loading && <Spinner aria-label="Loading" />}
        </ToolbarLeft>
        <ToolbarRight>
          <StagesBtn onClick={onManageStages} title="Customize pipeline stages">
            <GearIcon /> Stages
          </StagesBtn>
          <AddLeadBtn onClick={onAddLead}>+ Add Lead</AddLeadBtn>
        </ToolbarRight>
      </Toolbar>

      {/* Kanban columns */}
      <Columns>
        {stages.map((stage) => {
          const stageLeads = leadsByStage(stage);
          const total = stageTotal(stage);
          const isOver = dragOverStage === stage;

          return (
            <Column
              key={stage}
              $isOver={isOver}
              onDragOver={(e) => handleColumnDragOver(e, stage)}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => handleColumnDrop(e, stage)}
            >
              <ColumnHeader>
                <StageName>{stage}</StageName>
                <StageMeta>
                  <span className="count">{stageLeads.length}</span>
                  {total > 0 && <span className="total">{formatValue(total)}</span>}
                </StageMeta>
              </ColumnHeader>

              <CardList>
                {stageLeads.length === 0 && (
                  <EmptySlot $isOver={isOver}>
                    {isOver ? 'Drop here' : 'No leads'}
                  </EmptySlot>
                )}
                {stageLeads.map((lead) => {
                  const busy = busyLeads.has(lead.id);
                  const dragging = draggingId === lead.id;
                  const menuOpen = openMenu === lead.id;

                  return (
                    <LeadCard
                      key={lead.id}
                      $dragging={dragging}
                      $busy={busy}
                      draggable={!busy}
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => !busy && setOpenMenu(menuOpen ? null : lead.id)}
                      data-testid={`lead-card-${lead.id}`}
                    >
                      <CardTop>
                        <LeadName>{lead.name}</LeadName>
                        <MenuTrigger $active={menuOpen} aria-label="Actions">⋯</MenuTrigger>
                      </CardTop>
                      <Company>{lead.company}</Company>
                      <CardBottom>
                        <Value>{formatValue(lead.value)}</Value>
                        {busy && <BusyDot />}
                      </CardBottom>

                      {menuOpen && (
                        <ActionMenu onClick={(e) => e.stopPropagation()}>
                          <MenuSection>Move to stage</MenuSection>
                          {stages
                            .filter((s) => s !== stage)
                            .map((s) => (
                              <MenuItem
                                key={s}
                                onClick={async () => {
                                  setOpenMenu(null);
                                  setBusy(lead.id, true);
                                  try { await onMoveLead(lead.id, s); }
                                  finally { setBusy(lead.id, false); }
                                }}
                              >
                                → {s}
                              </MenuItem>
                            ))}
                          <MenuDivider />
                          <MenuSection>Close deal</MenuSection>
                          <MenuItem $won onClick={() => handleClose(lead.id, 'Won')}>
                            ✓ Mark as Won
                          </MenuItem>
                          <MenuItem $lost onClick={() => handleClose(lead.id, 'Lost')}>
                            ✗ Mark as Lost
                          </MenuItem>
                        </ActionMenu>
                      )}
                    </LeadCard>
                  );
                })}
              </CardList>
            </Column>
          );
        })}
      </Columns>

      {/* Click outside to close menu */}
      {openMenu && (
        <ClickAway onClick={() => setOpenMenu(null)} aria-hidden />
      )}
    </BoardWrap>
  );
}

/* ── Icons ── */
const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

/* ── Styled components ── */
const font = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased;`;

const BoardWrap = styled.div`
  flex: 1; display: flex; flex-direction: column; min-width: 0;
  height: 100%; overflow: hidden;
  background: ${C.paper2};
  ${font}
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
const ToolbarRight = styled.div`display: flex; align-items: center; gap: 8px;`;
const StagesBtn = styled.button`
  display: inline-flex; align-items: center; gap: 5px;
  padding: 8px 13px; border-radius: 9px; border: 1px solid ${C.line};
  background: ${C.paper}; color: ${C.muted}; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.14s;
  &:hover { background: ${C.paper2}; border-color: ${C.lineDark}; color: ${C.ink}; }
`;
const AddLeadBtn = styled.button`
  padding: 8px 16px; border-radius: 9px;
  background: var(--color-primary, #2563EB); border: 1px solid var(--color-primary, #2563EB);
  color: #fff; font-size: 13px; font-weight: 700; cursor: pointer;
  transition: filter 0.14s, transform 0.12s;
  &:hover { filter: brightness(1.08); transform: translateY(-1px); }
`;
const Spinner = styled.div`
  width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid ${C.line}; border-top-color: var(--color-primary, #2563EB);
  animation: spin 0.6s linear infinite;
  @keyframes spin { to { transform: rotate(360deg); } }
`;
const Columns = styled.div`
  flex: 1; display: flex; gap: 0; overflow-x: auto; overflow-y: hidden;
  padding: 20px; gap: 14px; align-items: flex-start;
`;
const Column = styled.div<{ $isOver?: boolean }>`
  flex: 0 0 240px; min-width: 240px;
  display: flex; flex-direction: column;
  background: ${(p) => (p.$isOver ? 'rgba(37,99,235,0.06)' : C.paper)};
  border: 2px solid ${(p) => (p.$isOver ? 'var(--color-primary, #2563EB)' : C.line)};
  border-radius: 12px; overflow: hidden;
  transition: border-color 0.14s, background 0.14s;
`;
const ColumnHeader = styled.div`
  padding: 12px 14px 10px; border-bottom: 1px solid ${C.line};
  background: ${C.paper};
`;
const StageName = styled.div`
  font-size: 13px; font-weight: 800; color: ${C.ink};
  text-transform: uppercase; letter-spacing: 0.06em;
`;
const StageMeta = styled.div`
  display: flex; align-items: center; gap: 8px; margin-top: 3px;
  .count { font-size: 12px; color: ${C.mutedSoft}; }
  .total { font-size: 12px; font-weight: 600; color: var(--color-accent, #10B981); }
`;
const CardList = styled.div`
  flex: 1; overflow-y: auto;
  padding: 10px;
  display: flex; flex-direction: column; gap: 8px;
  min-height: 80px;
`;
const EmptySlot = styled.div<{ $isOver?: boolean }>`
  padding: 18px 12px; text-align: center;
  font-size: 12.5px; color: ${(p) => (p.$isOver ? 'var(--color-primary, #2563EB)' : C.mutedSoft)};
  border: 2px dashed ${(p) => (p.$isOver ? 'var(--color-primary, #2563EB)' : C.line)};
  border-radius: 9px; transition: all 0.14s;
`;
const LeadCard = styled.div<{ $dragging?: boolean; $busy?: boolean }>`
  position: relative;
  padding: 12px 13px;
  background: ${C.paper};
  border: 1px solid ${C.line};
  border-radius: 10px;
  cursor: ${(p) => (p.$busy ? 'wait' : 'grab')};
  opacity: ${(p) => (p.$dragging ? 0.45 : p.$busy ? 0.7 : 1)};
  box-shadow: 0 1px 4px rgba(0,0,0,0.07);
  transition: box-shadow 0.14s, transform 0.12s, opacity 0.14s;
  user-select: none;
  &:hover { box-shadow: 0 4px 16px -6px rgba(0,0,0,0.18); transform: translateY(-1px); }
  &:active { cursor: grabbing; }
`;
const CardTop = styled.div`display: flex; align-items: flex-start; justify-content: space-between; gap: 6px;`;
const LeadName = styled.div`font-size: 13.5px; font-weight: 700; color: ${C.ink}; line-height: 1.3;`;
const MenuTrigger = styled.button<{ $active?: boolean }>`
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 6px;
  border: 1px solid ${(p) => (p.$active ? C.lineDark : 'transparent')};
  background: ${(p) => (p.$active ? C.paper2 : 'transparent')};
  color: ${C.muted}; cursor: pointer; font-size: 15px; line-height: 1;
  display: grid; place-items: center;
  &:hover { background: ${C.paper2}; border-color: ${C.line}; }
`;
const Company = styled.div`font-size: 12px; color: ${C.mutedSoft}; margin-top: 3px;`;
const CardBottom = styled.div`display: flex; align-items: center; justify-content: space-between; margin-top: 8px;`;
const Value = styled.div`
  font-size: 13px; font-weight: 700;
  color: var(--color-accent, #10B981);
`;
const BusyDot = styled.div`
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--color-primary, #2563EB); opacity: 0.7;
  animation: pulse 0.8s ease-in-out infinite;
  @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.4)} }
`;
const ActionMenu = styled.div`
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 50;
  min-width: 180px; background: ${C.paper}; border: 1px solid ${C.line};
  border-radius: 10px; box-shadow: 0 8px 30px -10px rgba(0,0,0,0.35);
  padding: 6px 4px; overflow: hidden;
`;
const MenuSection = styled.div`
  padding: 4px 10px 2px; font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.1em; color: ${C.mutedSoft};
`;
const MenuDivider = styled.div`height: 1px; background: ${C.line}; margin: 5px 4px;`;
const MenuItem = styled.button<{ $won?: boolean; $lost?: boolean }>`
  display: block; width: 100%; text-align: left;
  padding: 7px 10px; border: none; background: transparent;
  font-size: 13px; font-weight: 500; cursor: pointer;
  border-radius: 7px;
  color: ${(p) => (p.$won ? 'var(--color-accent, #10B981)' : p.$lost ? '#ef4444' : C.ink)};
  &:hover { background: ${C.paper2}; }
`;
const ClickAway = styled.div`
  position: fixed; inset: 0; z-index: 40;
`;
