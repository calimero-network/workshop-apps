import React, { useState } from 'react';
import styled from 'styled-components';
import { Link, useOutletContext } from 'react-router-dom';
import { C } from '../../theme';
import { APP_ROUTE } from '../../config';
import { MemberLabel } from '../../components/MemberLabel';
import { describeError } from '../../utils/errors';
import { Primary } from './AppPage';
import { useIncidents } from '../../hooks/useIncidents';
import { UseWorkspaceReturn } from '../../hooks/useWorkspace';
import { Incident } from '../../api/incident-tracker/IncidentTrackerClient';
import { SEVERITIES, Severity } from './constants';

/**
 * DashboardView — open incidents, my assigned incidents, and recent
 * activity. Backed by `useIncidents` (create_incident / list_incidents),
 * live-synced across peers via `useSubscription`.
 */
export default function DashboardView() {
  const ws = useOutletContext<UseWorkspaceReturn>();
  const { incidents, createIncident } = useIncidents({
    contextId: ws.contextId,
    executorPublicKey: ws.executorPublicKey,
  });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Severity>(SEVERITIES[0]);
  const [affectedArea, setAffectedArea] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !affectedArea.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await createIncident(title.trim(), description.trim(), severity, affectedArea.trim());
      setTitle('');
      setDescription('');
      setAffectedArea('');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const open = [...incidents]
    .filter((i) => i.status !== 'Resolved')
    .sort((a, b) => b.updated_at - a.updated_at);
  const mine = open.filter((i) => i.assigned_to === ws.executorPublicKey);
  const recent = [...incidents].sort((a, b) => b.updated_at - a.updated_at).slice(0, 5);

  return (
    <View>
      <Section>
        <h2>Report an incident</h2>
        <Form onSubmit={submit}>
          <input
            data-testid="field-title"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            data-testid="field-description"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <select
            data-testid="field-severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
          >
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            data-testid="field-affected_area"
            placeholder="Affected area"
            value={affectedArea}
            onChange={(e) => setAffectedArea(e.target.value)}
          />
          <Primary data-testid="action-create_incident" type="submit" disabled={!title.trim() || !affectedArea.trim() || submitting}>
            Report incident
          </Primary>
        </Form>
        {error && <ErrLine>{error}</ErrLine>}
      </Section>

      <Section>
        <h2>Open incidents</h2>
        {open.length === 0 && <Hint>No open incidents — all clear.</Hint>}
        <List>
          {open.map((incident) => <IncidentRow key={incident.id} incident={incident} />)}
        </List>
      </Section>

      {mine.length > 0 && (
        <Section>
          <h2>Assigned to you</h2>
          <List>
            {mine.map((incident) => <IncidentRow key={incident.id} incident={incident} />)}
          </List>
        </Section>
      )}

      <Section>
        <h2>Recent activity</h2>
        <List>
          {recent.map((incident) => <IncidentRow key={incident.id} incident={incident} compact />)}
        </List>
      </Section>
    </View>
  );
}

function IncidentRow({ incident, compact }: { incident: Incident; compact?: boolean }) {
  return (
    <Row
      to={`${APP_ROUTE}/incidents/${incident.id}`}
      data-testid={`item-incident-${incident.id}`}
      className="item-incident"
    >
      <SevBadge $severity={incident.severity}>{incident.severity}</SevBadge>
      <div className="body">
        <strong>{incident.title}</strong>
        {!compact && <span>{incident.affected_area}</span>}
      </div>
      <StatusBadge $status={incident.status}>{incident.status}</StatusBadge>
      <Byline>
        {incident.assigned_to ? <MemberLabel memberId={incident.assigned_to} /> : 'Unassigned'}
      </Byline>
    </Row>
  );
}

const View = styled.div`display: flex; flex-direction: column; gap: 30px;`;
const Section = styled.section`
  h2 { font-size: 15px; font-weight: 700; color: ${C.ink}; margin-bottom: 12px; letter-spacing: -0.2px; }
`;
const Form = styled.form`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  input, select {
    flex: 1; min-width: 140px;
    padding: 10px 12px; font-size: 14px;
    color: ${C.ink}; background: ${C.paper2};
    border: 1px solid ${C.line}; border-radius: 10px; outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
  }
`;
const List = styled.div`display: flex; flex-direction: column; gap: 10px;`;
const Row = styled(Link)`
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; background: ${C.paper2};
  border: 1px solid ${C.line}; border-radius: 12px;
  text-decoration: none; transition: border-color 0.15s;
  &:hover { border-color: ${C.green}; }
  .body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .body strong { font-size: 14.5px; color: ${C.ink}; }
  .body span { font-size: 12.5px; color: ${C.muted}; }
`;
const SevBadge = styled.span<{ $severity: string }>`
  flex-shrink: 0;
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  padding: 4px 9px; border-radius: 999px;
  color: #fff;
  background: ${(p) => (p.$severity === 'Critical' || p.$severity === 'High' ? 'var(--color-primary)' : C.mutedSoft)};
`;
const StatusBadge = styled.span<{ $status: string }>`
  flex-shrink: 0;
  font-size: 11.5px; font-weight: 600;
  padding: 4px 10px; border-radius: 999px;
  color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 14%, transparent);
`;
const Byline = styled.span`flex-shrink: 0; font-size: 12px; color: ${C.mutedSoft}; min-width: 70px; text-align: right;`;
const Hint = styled.p`font-size: 14px; color: ${C.muted}; padding: 8px 2px;`;
const ErrLine = styled.p`margin: 8px 0 0; font-size: 13px; color: ${C.danger};`;
