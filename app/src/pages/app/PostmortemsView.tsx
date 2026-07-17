import React, { useState } from 'react';
import styled from 'styled-components';
import { useSearchParams } from 'react-router-dom';
import { C } from '../../theme';
import { MemberLabel } from '../../components/MemberLabel';
import { Primary, Secondary } from './AppPage';
import { MOCK_POSTMORTEMS, Postmortem } from './mockData';

/**
 * PostmortemsView — list of postmortems (draft + published) and the
 * postmortem editor/template.
 *
 * SHELL PASS: seeded from MOCK_POSTMORTEMS (placeholder). The API has no
 * "update" method — `create_postmortem` always creates a fresh draft, and
 * `publish_postmortem` is the only transition, after which content is locked.
 * The next pass swaps local state for `usePostmortems` wrapping the generated
 * IncidentflowClient's `create_postmortem` / `publish_postmortem` /
 * `list_postmortems`.
 */
export default function PostmortemsView() {
  const [params] = useSearchParams();
  const [postmortems, setPostmortems] = useState<Postmortem[]>(MOCK_POSTMORTEMS);

  const [incidentId, setIncidentId] = useState(params.get('incidentId') ?? '');
  const [summary, setSummary] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [resolutionSteps, setResolutionSteps] = useState('');
  const [lessonsLearned, setLessonsLearned] = useState('');

  const canCreate = incidentId.trim() && summary.trim() && rootCause.trim();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    const next: Postmortem = {
      id: `pm-${Date.now().toString(16)}`,
      incident_id: incidentId.trim(),
      author: 'you',
      summary: summary.trim(),
      root_cause: rootCause.trim(),
      resolution_steps: resolutionSteps.trim(),
      lessons_learned: lessonsLearned.trim(),
      status: 'draft',
      created_at: Date.now(),
    };
    setPostmortems((prev) => [next, ...prev]);
    setSummary('');
    setRootCause('');
    setResolutionSteps('');
    setLessonsLearned('');
  };

  const publish = (id: string) => {
    setPostmortems((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'published' } : p)));
  };

  const sorted = [...postmortems].sort((a, b) => b.created_at - a.created_at);

  return (
    <View>
      <Section>
        <h2>Write a postmortem</h2>
        <Form onSubmit={submit}>
          <input
            data-testid="field-incident_id"
            placeholder="Incident ID"
            value={incidentId}
            onChange={(e) => setIncidentId(e.target.value)}
          />
          <input
            data-testid="field-summary"
            placeholder="Summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
          <input
            data-testid="field-root_cause"
            placeholder="Root cause"
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
          />
          <input
            data-testid="field-resolution_steps"
            placeholder="Resolution steps"
            value={resolutionSteps}
            onChange={(e) => setResolutionSteps(e.target.value)}
          />
          <input
            data-testid="field-lessons_learned"
            placeholder="Lessons learned"
            value={lessonsLearned}
            onChange={(e) => setLessonsLearned(e.target.value)}
          />
          <Primary data-testid="action-create_postmortem" type="submit" disabled={!canCreate}>
            Save draft
          </Primary>
        </Form>
      </Section>

      <Section>
        <h2>Postmortems</h2>
        {sorted.length === 0 && <Hint>No postmortems yet.</Hint>}
        <List>
          {sorted.map((pm) => (
            <Card key={pm.id} data-testid={`item-postmortem-${pm.id}`} className="item-postmortem">
              <div className="head">
                <span className="incident">Incident {pm.incident_id}</span>
                <StatusBadge $published={pm.status === 'published'}>{pm.status}</StatusBadge>
              </div>
              <h3>{pm.summary}</h3>
              <dl>
                <dt>Root cause</dt><dd>{pm.root_cause}</dd>
                {pm.resolution_steps && <><dt>Resolution</dt><dd>{pm.resolution_steps}</dd></>}
                {pm.lessons_learned && <><dt>Lessons learned</dt><dd>{pm.lessons_learned}</dd></>}
              </dl>
              <Byline>By <MemberLabel memberId={pm.author} /></Byline>
              {pm.status === 'draft' && (
                <Secondary data-testid="action-publish_postmortem" type="button" onClick={() => publish(pm.id)}>
                  Publish
                </Secondary>
              )}
            </Card>
          ))}
        </List>
      </Section>
    </View>
  );
}

const View = styled.div`display: flex; flex-direction: column; gap: 30px;`;
const Section = styled.section`
  h2 { font-size: 15px; font-weight: 700; color: ${C.ink}; margin-bottom: 12px; letter-spacing: -0.2px; }
`;
const Form = styled.form`
  display: flex; gap: 8px; flex-wrap: wrap;
  input {
    flex: 1; min-width: 160px;
    padding: 10px 12px; font-size: 14px;
    color: ${C.ink}; background: ${C.paper2};
    border: 1px solid ${C.line}; border-radius: 10px; outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
  }
`;
const List = styled.div`display: flex; flex-direction: column; gap: 12px;`;
const Card = styled.div`
  padding: 16px 18px; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 14px;
  .head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .incident { font-size: 12px; color: ${C.mutedSoft}; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
  h3 { font-size: 15px; font-weight: 700; color: ${C.ink}; margin-bottom: 8px; }
  dl { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
  dt { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: ${C.muted}; margin-top: 6px; }
  dd { font-size: 13px; color: ${C.ink}; }
`;
const StatusBadge = styled.span<{ $published: boolean }>`
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
  padding: 3px 9px; border-radius: 999px;
  color: ${(p) => (p.$published ? '#fff' : 'var(--color-accent)')};
  background: ${(p) => (p.$published ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-accent) 14%, transparent)')};
`;
const Byline = styled.p`font-size: 12px; color: ${C.mutedSoft}; margin-bottom: 10px;`;
const Hint = styled.p`font-size: 14px; color: ${C.muted}; padding: 8px 2px;`;
