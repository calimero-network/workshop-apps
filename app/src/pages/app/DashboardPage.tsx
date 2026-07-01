import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { C } from '../../theme';
import { APP_ROUTE } from '../../config';
import {
  type Incident,
  type OnCallEntry,
  type Severity,
  SEVERITY_ORDER,
  SEVERITY_COLOR,
  STATUS_COLOR,
  STATUS_LABEL,
  timeAgo,
} from '../../types/incidents';

/**
 * Dashboard — live list of open/acknowledged incidents sorted by severity,
 * on-call badge, and quick-declare form.
 *
 * Shell pass: data is placeholder (empty). Client wiring happens in the next pass.
 */

// ── Placeholder data (removed in client-wiring pass) ──────────────────────
const PLACEHOLDER_INCIDENTS: Incident[] = [];
const PLACEHOLDER_ON_CALL: OnCallEntry | null = null;

export default function DashboardPage() {
  const incidents = PLACEHOLDER_INCIDENTS;
  const onCall = PLACEHOLDER_ON_CALL;

  const [showCreate, setShowCreate] = useState(false);
  const [showOnCall, setShowOnCall] = useState(false);

  // Active = open OR acknowledged, sorted by severity
  const active = [...incidents]
    .filter((i) => i.status !== 'resolved')
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return (
    <Page>
      {/* ── Dashboard header ─────────────────────────────────────── */}
      <Header>
        <HeaderLeft>
          <PageTitle>Active Incidents</PageTitle>
          <CountBadge>{active.length}</CountBadge>
        </HeaderLeft>
        <HeaderRight>
          <OnCallBadge onCall={onCall} onSet={() => setShowOnCall(true)} />
          <DeclareBtn
            data-testid="action-create_incident"
            onClick={() => setShowCreate(true)}
          >
            + Declare Incident
          </DeclareBtn>
        </HeaderRight>
      </Header>

      {/* ── Incident list ─────────────────────────────────────────── */}
      {active.length === 0 ? (
        <EmptyState>
          <EmptyIcon aria-hidden="true">✅</EmptyIcon>
          <h3>All clear</h3>
          <p>No open incidents. Declare one if something&apos;s on fire.</p>
        </EmptyState>
      ) : (
        <IncidentTable>
          <thead>
            <tr>
              <th>Severity</th>
              <th>Title</th>
              <th>Status</th>
              <th>Assignee</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {active.map((inc) => (
              <IncidentRow key={inc.id} data-testid={`item-incident-${inc.id}`} data-incident-id={inc.id}>
                <td>
                  <SeverityBadge severity={inc.severity} />
                </td>
                <td className="title-cell">
                  <IncidentTitle>{inc.title}</IncidentTitle>
                </td>
                <td>
                  <StatusBadge status={inc.status} />
                </td>
                <td>
                  <AssigneeCell>{inc.assignee ?? <Unassigned>—</Unassigned>}</AssigneeCell>
                </td>
                <td>
                  <TimeCell>{timeAgo(inc.created_at)}</TimeCell>
                </td>
                <td>
                  <ViewLink to={`${APP_ROUTE}/incident/${inc.id}`}>View →</ViewLink>
                </td>
              </IncidentRow>
            ))}
          </tbody>
        </IncidentTable>
      )}

      {/* ── Declare Incident modal ─────────────────────────────────── */}
      {showCreate && (
        <DeclareModal onClose={() => setShowCreate(false)} />
      )}

      {/* ── Set on-call modal ─────────────────────────────────────── */}
      {showOnCall && (
        <SetOnCallModal onClose={() => setShowOnCall(false)} />
      )}
    </Page>
  );
}

/* ── On-call badge ────────────────────────────────────────────────────────── */
function OnCallBadge({ onCall, onSet }: { onCall: OnCallEntry | null; onSet: () => void }) {
  return (
    <OnCallWrap onClick={onSet} title="Click to set on-call">
      <span className="dot" aria-hidden="true">🔴</span>
      {onCall ? (
        <>On call: <strong>{onCall.responder}</strong></>
      ) : (
        <span className="none">No one on call</span>
      )}
    </OnCallWrap>
  );
}

/* ── Declare Incident modal ───────────────────────────────────────────────── */
function DeclareModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Severity>('high');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      // Client wiring happens in the next pass — no-op for now
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay onClick={onClose}>
      <ModalDialog onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="dec-title">
        <ModalClose onClick={onClose} aria-label="Close">×</ModalClose>
        <ModalTitle id="dec-title">Declare Incident</ModalTitle>
        <ModalSub>Fill in the details and notify the whole team instantly.</ModalSub>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <label htmlFor="inc-severity">Severity</label>
            <StyledSelect
              id="inc-severity"
              data-testid="field-severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity)}
            >
              <option value="critical">🔴 Critical</option>
              <option value="high">🟠 High</option>
              <option value="medium">🟡 Medium</option>
              <option value="low">🟢 Low</option>
            </StyledSelect>
          </FieldGroup>

          <FieldGroup>
            <label htmlFor="inc-title">Title</label>
            <StyledInput
              id="inc-title"
              data-testid="field-title"
              placeholder="e.g. DB connection pool exhausted"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </FieldGroup>

          <FieldGroup>
            <label htmlFor="inc-desc">Description</label>
            <StyledTextarea
              id="inc-desc"
              data-testid="field-description"
              placeholder="What's broken? When did it start? What's the impact?"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FieldGroup>

          <ModalActions>
            <CancelBtn type="button" onClick={onClose}>Cancel</CancelBtn>
            <SubmitBtn
              type="submit"
              data-testid="action-create_incident"
              disabled={!title.trim() || submitting}
            >
              {submitting ? 'Declaring…' : 'Declare Incident'}
            </SubmitBtn>
          </ModalActions>
        </form>
      </ModalDialog>
    </ModalOverlay>
  );
}

/* ── Set on-call modal ────────────────────────────────────────────────────── */
function SetOnCallModal({ onClose }: { onClose: () => void }) {
  const [responder, setResponder] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!responder.trim()) return;
    setSubmitting(true);
    try {
      // Client wiring in next pass
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay onClick={onClose}>
      <ModalDialog onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="oc-title">
        <ModalClose onClick={onClose} aria-label="Close">×</ModalClose>
        <ModalTitle id="oc-title">Set On-Call Responder</ModalTitle>
        <ModalSub>The team will see who&apos;s on duty right now.</ModalSub>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <label htmlFor="oc-responder">Responder</label>
            <StyledInput
              id="oc-responder"
              data-testid="field-responder"
              placeholder="e.g. alice"
              value={responder}
              onChange={(e) => setResponder(e.target.value)}
              required
              autoFocus
            />
          </FieldGroup>
          <ModalActions>
            <CancelBtn type="button" onClick={onClose}>Cancel</CancelBtn>
            <SubmitBtn
              type="submit"
              data-testid="action-set_on_call"
              disabled={!responder.trim() || submitting}
            >
              {submitting ? 'Saving…' : 'Set On Call'}
            </SubmitBtn>
          </ModalActions>
        </form>
      </ModalDialog>
    </ModalOverlay>
  );
}

/* ── Badge helpers ────────────────────────────────────────────────────────── */
function SeverityBadge({ severity }: { severity: Severity }) {
  const { bg, text } = SEVERITY_COLOR[severity];
  return (
    <Badge style={{ background: bg, color: text }}>
      {severity.toUpperCase()}
    </Badge>
  );
}

function StatusBadge({ status }: { status: Incident['status'] }) {
  const { bg, text } = STATUS_COLOR[status];
  return (
    <Badge style={{ background: bg, color: text, fontSize: 11 }}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/* ── Styled components ─────────────────────────────────────────────────────── */

const Page = styled.div`width: 100%;`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const PageTitle = styled.h1`
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: ${C.ink};
`;

const CountBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
  background: var(--color-accent, #EF4444);
  color: #ffffff;
`;

const DeclareBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 9px 18px;
  font-size: 13.5px;
  font-weight: 700;
  border-radius: 8px;
  cursor: pointer;
  color: #ffffff;
  background: var(--color-accent, #EF4444);
  border: 1px solid rgba(0,0,0,0.1);
  transition: filter 0.15s, transform 0.12s;
  &:hover { filter: brightness(1.1); transform: translateY(-1px); }
`;

const OnCallWrap = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  font-size: 13px;
  font-weight: 500;
  color: ${C.muted};
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  strong { color: ${C.ink}; }
  .none { font-style: italic; }
  &:hover { border-color: ${C.muted}; color: ${C.ink}; }
`;

const IncidentTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  border: 1px solid ${C.line};
  border-radius: 12px;
  overflow: hidden;
  thead th {
    padding: 12px 14px;
    text-align: left;
    font-size: 11.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: ${C.muted};
    background: ${C.paper2};
    border-bottom: 1px solid ${C.line};
  }
`;

const IncidentRow = styled.tr`
  border-bottom: 1px solid ${C.line};
  transition: background 0.12s;
  &:last-child { border-bottom: none; }
  &:hover { background: ${C.paper2}; }
  td { padding: 13px 14px; vertical-align: middle; }
  td.title-cell { min-width: 180px; }
`;

const IncidentTitle = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${C.ink};
`;

const AssigneeCell = styled.span`font-size: 13px; color: ${C.muted};`;
const TimeCell = styled.span`font-size: 12.5px; color: ${C.mutedSoft}; white-space: nowrap;`;
const Unassigned = styled.span`color: ${C.off}; font-style: italic;`;

const ViewLink = styled(Link)`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-accent, #EF4444);
  text-decoration: none;
  white-space: nowrap;
  &:hover { text-decoration: underline; }
`;

const Badge = styled.span`
  display: inline-block;
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
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

/* Modals */
const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(14, 20, 15, 0.45);
  backdrop-filter: blur(4px);
`;

const ModalDialog = styled.div`
  position: relative;
  width: 100%;
  max-width: 460px;
  background: ${C.paper};
  border: 1px solid ${C.line};
  border-radius: 16px;
  padding: 28px 26px 24px;
  box-shadow: 0 40px 90px -40px rgba(14, 20, 15, 0.5);
`;

const ModalClose = styled.button`
  position: absolute;
  top: 12px;
  right: 12px;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  font-size: 20px;
  color: ${C.mutedSoft};
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  &:hover { background: ${C.paper2}; color: ${C.ink}; }
`;

const ModalTitle = styled.h3`
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.4px;
  color: ${C.ink};
  margin: 0 0 6px;
`;

const ModalSub = styled.p`
  font-size: 13.5px;
  color: ${C.muted};
  margin: 0 0 20px;
`;

const FieldGroup = styled.div`
  margin-bottom: 16px;
  label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: ${C.muted};
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
`;

const StyledInput = styled.input`
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  color: ${C.ink};
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 8px;
  outline: none;
  &:focus { border-color: var(--color-accent, #EF4444); box-shadow: 0 0 0 3px rgba(239,68,68,0.15); }
`;

const StyledSelect = styled.select`
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 500;
  color: ${C.ink};
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 8px;
  outline: none;
  cursor: pointer;
  &:focus { border-color: var(--color-accent, #EF4444); box-shadow: 0 0 0 3px rgba(239,68,68,0.15); }
`;

const StyledTextarea = styled.textarea`
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  color: ${C.ink};
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 8px;
  outline: none;
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;
  &:focus { border-color: var(--color-accent, #EF4444); box-shadow: 0 0 0 3px rgba(239,68,68,0.15); }
`;

const ModalActions = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 22px;
`;

const CancelBtn = styled.button`
  padding: 9px 16px;
  font-size: 13.5px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  color: ${C.muted};
  background: ${C.paper2};
  border: 1px solid ${C.line};
  transition: background 0.15s;
  &:hover { background: ${C.paper}; color: ${C.ink}; }
`;

const SubmitBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 9px 20px;
  font-size: 13.5px;
  font-weight: 700;
  border-radius: 8px;
  cursor: pointer;
  color: #ffffff;
  background: var(--color-accent, #EF4444);
  border: 1px solid rgba(0,0,0,0.1);
  transition: filter 0.15s, transform 0.12s;
  &:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
  &:disabled { opacity: 0.5; cursor: default; }
`;
