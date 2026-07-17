import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { useGroupMembers } from '@calimero-network/mero-react';
import { C } from '../../theme';
import { APP_ROUTE } from '../../config';
import { MemberLabel } from '../../components/MemberLabel';
import { describeError } from '../../utils/errors';
import { Primary, Secondary } from './AppPage';
import { useIncidents } from '../../hooks/useIncidents';
import { useComments } from '../../hooks/useComments';
import { UseWorkspaceReturn } from '../../hooks/useWorkspace';
import { STATUSES } from './constants';

/**
 * IncidentDetailView — incident info, status/assignee controls, timeline,
 * and comments with @mentions. Backed by `useIncidents` (update_status /
 * assign_incident) and `useComments` (add_comment / list_comments).
 *
 * The backend keeps only the incident's *current* status + `updated_at`
 * (no persisted status-change log), so the timeline below shows what's
 * actually stored: when it was reported and its current status — not a
 * full transition history.
 */
export default function IncidentDetailView() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const ws = useOutletContext<UseWorkspaceReturn>();
  const { incidents, updateStatus, assignIncident } = useIncidents({
    contextId: ws.contextId,
    executorPublicKey: ws.executorPublicKey,
  });
  const { comments, addComment } = useComments({
    contextId: ws.contextId,
    executorPublicKey: ws.executorPublicKey,
    incidentId: incidentId ?? null,
  });
  const { members } = useGroupMembers(ws.namespaceId);

  const found = incidents.find((i) => i.id === incidentId);

  const [statusDraft, setStatusDraft] = useState('');
  const [assigneeDraft, setAssigneeDraft] = useState('');
  const [body, setBody] = useState('');
  const [mentions, setMentions] = useState('');
  const [statusError, setStatusError] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [applyingStatus, setApplyingStatus] = useState(false);
  const [applyingAssignee, setApplyingAssignee] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  // Server-driven drafts: sync whenever the incident's persisted values change.
  useEffect(() => {
    if (found) setStatusDraft(found.status);
  }, [found?.status]);
  useEffect(() => {
    if (found) setAssigneeDraft(found.assigned_to ?? '');
  }, [found?.assigned_to]);

  // Assignee options: every workspace member (self + peers) by identity.
  const assigneeOptions = Array.from(
    new Set([ws.executorPublicKey, ...members.map((m) => m.identity)].filter((v): v is string => !!v)),
  );

  if (!found) {
    return (
      <View>
        <Back to={APP_ROUTE}>&larr; Back to dashboard</Back>
        <Hint>Loading incident…</Hint>
      </View>
    );
  }

  const applyStatus = async () => {
    if (statusDraft === found.status || applyingStatus) return;
    setApplyingStatus(true);
    setStatusError(null);
    try {
      await updateStatus(found.id, statusDraft);
    } catch (err) {
      setStatusError(describeError(err));
    } finally {
      setApplyingStatus(false);
    }
  };

  const applyAssignee = async () => {
    if (!assigneeDraft.trim() || applyingAssignee) return;
    setApplyingAssignee(true);
    setAssignError(null);
    try {
      await assignIncident(found.id, assigneeDraft.trim());
    } catch (err) {
      setAssignError(describeError(err));
    } finally {
      setApplyingAssignee(false);
    }
  };

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || submittingComment) return;
    setSubmittingComment(true);
    setCommentError(null);
    try {
      const mentionList = mentions.split(',').map((m) => m.trim()).filter(Boolean);
      await addComment(body.trim(), mentionList);
      setBody('');
      setMentions('');
    } catch (err) {
      setCommentError(describeError(err));
    } finally {
      setSubmittingComment(false);
    }
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
              onChange={(e) => setStatusDraft(e.target.value)}
            >
              {!STATUSES.includes(statusDraft as (typeof STATUSES)[number]) && (
                <option value={statusDraft}>{statusDraft}</option>
              )}
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <Secondary data-testid="action-update_status" type="button" onClick={applyStatus} disabled={statusDraft === found.status || applyingStatus}>
              Update
            </Secondary>
          </div>
          {statusError && <ErrLine>{statusError}</ErrLine>}
        </Field>
        <Field>
          <label>Assignee</label>
          <div className="row">
            <select
              data-testid="field-assigned_to"
              value={assigneeDraft}
              onChange={(e) => setAssigneeDraft(e.target.value)}
            >
              <option value="">Unassigned</option>
              {assigneeOptions.map((id) => (
                <option key={id} value={id}>
                  {id === ws.executorPublicKey ? 'You' : id}
                </option>
              ))}
            </select>
            <Secondary data-testid="action-assign_incident" type="button" onClick={applyAssignee} disabled={!assigneeDraft.trim() || applyingAssignee}>
              Assign
            </Secondary>
          </div>
          {found.assigned_to && <Assigned>Currently: <MemberLabel memberId={found.assigned_to} /></Assigned>}
          {assignError && <ErrLine>{assignError}</ErrLine>}
        </Field>
      </Controls>

      {found.status === 'Resolved' && (
        <ResolvedBanner>
          Incident resolved.{' '}
          <Link to={`${APP_ROUTE}/postmortems?incidentId=${found.id}`}>Write the postmortem &rarr;</Link>
        </ResolvedBanner>
      )}

      <Section>
        <h2>Timeline</h2>
        <Timeline>
          <li>
            <span className="dot" />
            <span className="status">Reported</span>
            <time>{new Date(found.created_at).toLocaleString()}</time>
          </li>
          {found.updated_at !== found.created_at && (
            <li>
              <span className="dot" />
              <span className="status">{found.status}</span>
              <time>{new Date(found.updated_at).toLocaleString()}</time>
            </li>
          )}
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
            placeholder="Mention teammates (comma separated identities)"
            value={mentions}
            onChange={(e) => setMentions(e.target.value)}
          />
          <Primary data-testid="action-add_comment" type="submit" disabled={!body.trim() || submittingComment}>Comment</Primary>
        </CommentForm>
        {commentError && <ErrLine>{commentError}</ErrLine>}
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
    .head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 12px; color: ${C.mutedSoft}; }
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
const ErrLine = styled.p`margin: 6px 0 0; font-size: 12.5px; color: ${C.danger};`;
