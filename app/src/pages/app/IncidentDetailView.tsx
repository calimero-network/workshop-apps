import React, { useState } from 'react';
import styled from 'styled-components';
import { Link, useParams } from 'react-router-dom';
import { C } from '../../theme';
import { APP_ROUTE } from '../../config';
import { MemberLabel } from '../../components/MemberLabel';
import { Primary, Secondary } from './AppPage';
import {
  Comment,
  IncidentStatus,
  MOCK_COMMENTS,
  MOCK_INCIDENTS,
  MOCK_TIMELINE,
  STATUSES,
  TimelineEntry,
} from './mockData';

/**
 * IncidentDetailView — incident info, status/assignee controls, timeline, and
 * comments with @mentions.
 *
 * SHELL PASS: incident/timeline/comments are looked up from the MOCK_* fixtures
 * by :incidentId. Status/assignee changes and new comments update local state
 * so the flow is fully clickable; the next pass swaps this for `useIncidents` /
 * `useComments` hooks wrapping the generated IncidentflowClient's
 * `update_status` / `assign_incident` / `add_comment` / `list_comments`.
 */
export default function IncidentDetailView() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const found = MOCK_INCIDENTS.find((i) => i.id === incidentId) ?? MOCK_INCIDENTS[0];

  const [status, setStatus] = useState<IncidentStatus>(found.status);
  const [statusDraft, setStatusDraft] = useState<IncidentStatus>(found.status);
  const [assignedTo, setAssignedTo] = useState<string | null>(found.assigned_to);
  const [assigneeDraft, setAssigneeDraft] = useState(found.assigned_to ?? '');
  const [timeline, setTimeline] = useState<TimelineEntry[]>(
    MOCK_TIMELINE.filter((t) => t.incident_id === found.id),
  );
  const [comments, setComments] = useState<Comment[]>(
    MOCK_COMMENTS.filter((c) => c.incident_id === found.id),
  );
  const [body, setBody] = useState('');
  const [mentions, setMentions] = useState('');

  const applyStatus = () => {
    if (statusDraft === status) return;
    const now = Date.now();
    setStatus(statusDraft);
    setTimeline((prev) => [...prev, { incident_id: found.id, status: statusDraft, at: now }]);
  };

  const applyAssignee = () => {
    const next = assigneeDraft.trim() || null;
    setAssignedTo(next);
  };

  const submitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    const next: Comment = {
      id: `cmt-${Date.now().toString(16)}`,
      incident_id: found.id,
      author: 'you',
      body: body.trim(),
      mentions: mentions.split(',').map((m) => m.trim()).filter(Boolean),
      created_at: Date.now(),
    };
    setComments((prev) => [...prev, next]);
    setBody('');
    setMentions('');
  };

  const removeComment = (id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <View>
      <Back to={APP_ROUTE}>&larr; Back to dashboard</Back>

      <Header>
        <div className="title">
          <SevBadge $severity={found.severity}>{found.severity}</SevBadge>
          <h1>{found.title}</h1>
        </div>
        <p>{found.description}</p>
        <Meta>
          <span>Affected area: <b>{found.affected_area}</b></span>
          <span>Reported by <MemberLabel memberId={found.created_by} /></span>
        </Meta>
      </Header>

      <Controls>
        <Field>
          <label>Status</label>
          <div className="row">
            <select
              data-testid="field-status"
              value={statusDraft}
              onChange={(e) => setStatusDraft(e.target.value as IncidentStatus)}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <Secondary data-testid="action-update_status" type="button" onClick={applyStatus} disabled={statusDraft === status}>
              Update
            </Secondary>
          </div>
        </Field>
        <Field>
          <label>Assignee</label>
          <div className="row">
            <input
              data-testid="field-assigned_to"
              placeholder="Teammate name"
              value={assigneeDraft}
              onChange={(e) => setAssigneeDraft(e.target.value)}
            />
            <Secondary data-testid="action-assign_incident" type="button" onClick={applyAssignee} disabled={!assigneeDraft.trim()}>
              Assign
            </Secondary>
          </div>
          {assignedTo && <Assigned>Currently: <MemberLabel memberId={assignedTo} /></Assigned>}
        </Field>
      </Controls>

      {status === 'Resolved' && (
        <ResolvedBanner>
          Incident resolved.{' '}
          <Link to={`${APP_ROUTE}/postmortems?incidentId=${found.id}`}>Write the postmortem &rarr;</Link>
        </ResolvedBanner>
      )}

      <Section>
        <h2>Timeline</h2>
        <Timeline>
          {timeline.map((t, i) => (
            <li key={`${t.status}-${t.at}-${i}`}>
              <span className="dot" />
              <span className="status">{t.status}</span>
              <time>{new Date(t.at).toLocaleString()}</time>
            </li>
          ))}
        </Timeline>
      </Section>

      <Section>
        <h2>Comments</h2>
        <Comments>
          {comments.length === 0 && <Hint>No comments yet.</Hint>}
          {comments.map((c) => (
            <li key={c.id} data-testid={`item-comment-${c.id}`} className="item-comment">
              <div className="head">
                <MemberLabel memberId={c.author} />
                <time>{new Date(c.created_at).toLocaleTimeString()}</time>
                {c.author === 'you' && (
                  <button aria-label="Delete comment" onClick={() => removeComment(c.id)}>&times;</button>
                )}
              </div>
              <p>{c.body}</p>
              {c.mentions.length > 0 && (
                <div className="mentions">
                  {c.mentions.map((m) => (
                    <span key={m}>@<MemberLabel memberId={m} showYou={false} /></span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </Comments>

        <CommentForm onSubmit={submitComment}>
          <input
            data-testid="field-body"
            placeholder="Add a comment…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <input
            data-testid="field-mentions"
            placeholder="Mention teammates (comma separated)"
            value={mentions}
            onChange={(e) => setMentions(e.target.value)}
          />
          <Primary data-testid="action-add_comment" type="submit" disabled={!body.trim()}>Comment</Primary>
        </CommentForm>
      </Section>
    </View>
  );
}

const View = styled.div`display: flex; flex-direction: column; gap: 26px;`;
const Back = styled(Link)`font-size: 13px; color: ${C.muted}; text-decoration: none; &:hover { color: ${C.ink}; }`;
const Header = styled.header`
  .title { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: ${C.ink}; }
  p { font-size: 14px; color: ${C.muted}; margin-bottom: 10px; }
`;
const Meta = styled.div`display: flex; gap: 18px; flex-wrap: wrap; font-size: 12.5px; color: ${C.mutedSoft};`;
const SevBadge = styled.span<{ $severity: string }>`
  flex-shrink: 0;
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  padding: 4px 9px; border-radius: 999px; color: #fff;
  background: ${(p) => (p.$severity === 'Critical' || p.$severity === 'High' ? 'var(--color-primary)' : C.mutedSoft)};
`;
const Controls = styled.div`
  display: flex; gap: 20px; flex-wrap: wrap;
  padding: 18px; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 14px;
`;
const Field = styled.div`
  flex: 1; min-width: 220px;
  label { display: block; font-size: 12px; font-weight: 600; color: ${C.muted}; margin-bottom: 7px; }
  .row { display: flex; gap: 8px; }
  select, input {
    flex: 1; padding: 9px 11px; font-size: 13.5px;
    color: ${C.ink}; background: ${C.paper};
    border: 1px solid ${C.line}; border-radius: 9px; outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
  }
`;
const Assigned = styled.p`margin-top: 8px; font-size: 12px; color: ${C.mutedSoft};`;
const ResolvedBanner = styled.div`
  padding: 12px 16px; border-radius: 10px;
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  color: var(--color-accent); font-size: 13.5px; font-weight: 600;
  a { color: inherit; text-decoration: underline; }
`;
const Section = styled.section`
  h2 { font-size: 15px; font-weight: 700; color: ${C.ink}; margin-bottom: 12px; letter-spacing: -0.2px; }
`;
const Timeline = styled.ul`
  list-style: none; display: flex; flex-direction: column; gap: 10px;
  li { display: flex; align-items: center; gap: 10px; font-size: 13px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-accent); flex-shrink: 0; }
  .status { font-weight: 600; color: ${C.ink}; min-width: 110px; }
  time { color: ${C.mutedSoft}; font-size: 12px; }
`;
const Comments = styled.ul`
  list-style: none; display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px;
  li {
    padding: 12px 14px; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 12px;
    .head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 12px; color: ${C.mutedSoft};
      button { margin-left: auto; background: none; border: none; color: ${C.mutedSoft}; font-size: 16px; cursor: pointer; &:hover { color: ${C.danger}; } }
    }
    p { font-size: 13.5px; color: ${C.ink}; }
    .mentions { margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap;
      span { font-size: 12px; color: var(--color-accent); font-weight: 600; }
    }
  }
`;
const CommentForm = styled.form`
  display: flex; gap: 8px; flex-wrap: wrap;
  input {
    flex: 1; min-width: 160px;
    padding: 10px 12px; font-size: 14px;
    color: ${C.ink}; background: ${C.paper2};
    border: 1px solid ${C.line}; border-radius: 10px; outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
  }
`;
const Hint = styled.p`font-size: 14px; color: ${C.muted}; padding: 8px 2px;`;
