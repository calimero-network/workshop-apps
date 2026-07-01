import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { C } from '../../theme';
import { APP_ROUTE } from '../../config';
import { useWs } from './AppPage';
import { useIncidentDetail } from '../../hooks/useIncidentDetail';
import { describeError } from '../../utils/errors';
import {
  type Incident,
  type Comment,
  type Severity,
  SEVERITY_COLOR,
  STATUS_COLOR,
  STATUS_LABEL,
  timeAgo,
} from '../../types/incidents';

/**
 * IncidentDetailPage — full incident view with:
 *  - Status controls: acknowledge, resolve
 *  - Severity badge + assignee + commander actions (change severity / reassign)
 *  - Comment thread (add, edit, delete own comments)
 *  - Link to postmortem (only when resolved)
 */

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { contextId, executorPublicKey } = useWs();

  const detail = useIncidentDetail({
    contextId,
    executorPublicKey,
    incidentId: id ?? '',
  });

  const incident = detail.incident;
  const comments = detail.comments;

  // Use the short executor public key as the "current user" identifier for comment authorship.
  const currentUser = executorPublicKey ?? '';

  const [commentBody, setCommentBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [showReassign, setShowReassign] = useState(false);
  const [showEscalate, setShowEscalate] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (detail.loading && !incident) {
    return <LoadingPage>Loading incident…</LoadingPage>;
  }

  if (!incident) {
    return (
      <NotFound>
        <h2>Incident not found</h2>
        <p>This incident may have been removed or the link is invalid.</p>
        <BackLink to={APP_ROUTE}>← Back to dashboard</BackLink>
      </NotFound>
    );
  }

  const isResolved = incident.status === 'resolved';
  const canAck = incident.status === 'open';
  const canResolve = incident.status !== 'resolved';

  const withError = async (fn: () => Promise<void>) => {
    setActionError(null);
    try { await fn(); } catch (err) { setActionError(describeError(err)); }
  };

  const handleAck = () => withError(detail.acknowledgeIncident);
  const handleResolve = () => withError(detail.resolveIncident);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setSubmittingComment(true);
    setActionError(null);
    try {
      await detail.addComment(commentBody.trim());
      setCommentBody('');
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!editBody.trim()) return;
    try {
      await detail.editComment(commentId, editBody.trim());
      setEditingId(null);
      setEditBody('');
    } catch (err) {
      setActionError(describeError(err));
    }
  };

  const handleDeleteComment = (commentId: string) =>
    withError(() => detail.deleteComment(commentId));

  const startEdit = (comment: Comment) => {
    setEditingId(comment.id);
    setEditBody(comment.body);
  };

  const { bg: sevBg, text: sevText } = SEVERITY_COLOR[incident.severity];
  const { bg: stBg, text: stText } = STATUS_COLOR[incident.status];

  return (
    <Page>
      {/* ── Breadcrumb ─────────────────────────────────────────── */}
      <BackLink to={APP_ROUTE}>← Dashboard</BackLink>

      {/* ── Incident header ────────────────────────────────────── */}
      <IncidentHeader>
        <BadgeRow>
          <SevBadge style={{ background: sevBg, color: sevText }}>
            {incident.severity.toUpperCase()}
          </SevBadge>
          <StatBadge style={{ background: stBg, color: stText }}>
            {STATUS_LABEL[incident.status]}
          </StatBadge>
        </BadgeRow>
        <IncidentTitle>{incident.title}</IncidentTitle>
        <IncidentDesc>{incident.description}</IncidentDesc>

        <MetaRow>
          <MetaItem>
            <MetaLabel>Declared by</MetaLabel>
            <MetaValue>{incident.created_by}</MetaValue>
          </MetaItem>
          <MetaItem>
            <MetaLabel>Assignee</MetaLabel>
            <MetaValue>{incident.assignee ?? <em>Unassigned</em>}</MetaValue>
          </MetaItem>
          <MetaItem>
            <MetaLabel>Opened</MetaLabel>
            <MetaValue>{timeAgo(incident.created_at)}</MetaValue>
          </MetaItem>
          {isResolved && incident.resolved_at && (
            <MetaItem>
              <MetaLabel>Resolved</MetaLabel>
              <MetaValue>{timeAgo(incident.resolved_at)}</MetaValue>
            </MetaItem>
          )}
        </MetaRow>
      </IncidentHeader>

      {/* ── Action buttons ─────────────────────────────────────── */}
      <ActionBar>
        {canAck && (
          <AckBtn data-testid="action-acknowledge_incident" onClick={handleAck}>
            Acknowledge
          </AckBtn>
        )}
        {canResolve && (
          <ResolveBtn data-testid="action-resolve_incident" onClick={handleResolve}>
            Resolve
          </ResolveBtn>
        )}
        <OutlineBtn data-testid="action-update_incident" onClick={() => setShowEscalate(true)}>
          Change Severity
        </OutlineBtn>
        <OutlineBtn onClick={() => setShowReassign(true)}>
          Reassign
        </OutlineBtn>
        {isResolved && (
          <PostmortemBtn to={`${APP_ROUTE}/incident/${id}/postmortem`}>
            📋 Postmortem
          </PostmortemBtn>
        )}
      </ActionBar>

      {actionError && <ErrorBar>{actionError}</ErrorBar>}

      <Divider />

      {/* ── Comment thread ─────────────────────────────────────── */}
      <SectionTitle>Comments ({comments.length})</SectionTitle>

      {comments.length === 0 ? (
        <NoComments>No comments yet — be the first to update the thread.</NoComments>
      ) : (
        <CommentList>
          {comments.map((c) => (
            <CommentItem key={c.id} data-testid={`item-comment-${c.id}`}>
              <CommentMeta>
                <AuthorAvatar>{c.author.charAt(0).toUpperCase()}</AuthorAvatar>
                <AuthorName title={c.author}>{c.author.length > 16 ? c.author.slice(0, 8) + '…' : c.author}</AuthorName>
                <CommentTime>{timeAgo(c.created_at)}</CommentTime>
                {/* own comment controls: compare full executor key */}
                {(c.author === currentUser || c.author === currentUser.slice(0, c.author.length)) && (
                  <CommentActions>
                    <CommentActionBtn
                      data-testid="action-edit_comment"
                      onClick={() => startEdit(c)}
                      aria-label="Edit comment"
                    >
                      Edit
                    </CommentActionBtn>
                    <CommentActionBtn
                      data-testid="action-delete_comment"
                      onClick={() => handleDeleteComment(c.id)}
                      className="danger"
                      aria-label="Delete comment"
                    >
                      Delete
                    </CommentActionBtn>
                  </CommentActions>
                )}
              </CommentMeta>

              {editingId === c.id ? (
                <EditForm>
                  <StyledTextarea
                    data-testid="field-body"
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                  <EditActions>
                    <SaveBtn
                      onClick={() => handleEditComment(c.id)}
                      disabled={!editBody.trim()}
                    >
                      Save
                    </SaveBtn>
                    <CancelEditBtn onClick={() => setEditingId(null)}>Cancel</CancelEditBtn>
                  </EditActions>
                </EditForm>
              ) : (
                <CommentBody>{c.body}</CommentBody>
              )}
            </CommentItem>
          ))}
        </CommentList>
      )}

      {/* ── Add comment form ───────────────────────────────────── */}
      <AddCommentForm onSubmit={handleAddComment}>
        <StyledTextarea
          data-testid="field-body"
          placeholder="Add an update or comment…"
          rows={3}
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
        />
        <AddCommentActions>
          <PostCommentBtn
            type="submit"
            data-testid="action-add_comment"
            disabled={!commentBody.trim() || submittingComment}
          >
            {submittingComment ? 'Posting…' : 'Post Comment'}
          </PostCommentBtn>
        </AddCommentActions>
      </AddCommentForm>

      {/* ── Change severity modal ──────────────────────────────── */}
      {showEscalate && (
        <UpdateSeverityModal
          current={incident.severity}
          onSave={(sev) => withError(() => detail.updateIncident(sev, null))}
          onClose={() => setShowEscalate(false)}
        />
      )}

      {/* ── Reassign modal ─────────────────────────────────────── */}
      {showReassign && (
        <ReassignModal
          current={incident.assignee}
          onSave={(assignee) => withError(() => detail.updateIncident(null, assignee))}
          onClose={() => setShowReassign(false)}
        />
      )}
    </Page>
  );
}

/* ── Update severity modal ────────────────────────────────────────────────── */
function UpdateSeverityModal({
  current,
  onSave,
  onClose,
}: {
  current: Severity;
  onSave: (severity: string) => Promise<void>;
  onClose: () => void;
}) {
  const [severity, setSeverity] = useState<Severity>(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(severity);
      onClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClick={onClose}>
      <ModalDialog onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <ModalClose onClick={onClose} aria-label="Close">×</ModalClose>
        <ModalTitle>Change Severity</ModalTitle>
        <form onSubmit={handleSave}>
          <FieldGroup>
            <label htmlFor="upd-severity">New severity</label>
            <StyledSelect
              id="upd-severity"
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
          {error && <ErrorLine>{error}</ErrorLine>}
          <ModalActions>
            <CancelBtn type="button" onClick={onClose}>Cancel</CancelBtn>
            <SubmitBtn type="submit" data-testid="action-update_incident" disabled={saving}>
              {saving ? 'Saving…' : 'Update Severity'}
            </SubmitBtn>
          </ModalActions>
        </form>
      </ModalDialog>
    </ModalOverlay>
  );
}

/* ── Reassign modal ───────────────────────────────────────────────────────── */
function ReassignModal({
  current,
  onSave,
  onClose,
}: {
  current: string | null;
  onSave: (assignee: string) => Promise<void>;
  onClose: () => void;
}) {
  const [assignee, setAssignee] = useState(current ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(assignee.trim());
      onClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClick={onClose}>
      <ModalDialog onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <ModalClose onClick={onClose} aria-label="Close">×</ModalClose>
        <ModalTitle>Reassign Incident</ModalTitle>
        <form onSubmit={handleSave}>
          <FieldGroup>
            <label htmlFor="reassign-field">Assignee</label>
            <StyledInput
              id="reassign-field"
              data-testid="field-assignee"
              placeholder="e.g. bob"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              autoFocus
            />
          </FieldGroup>
          {error && <ErrorLine>{error}</ErrorLine>}
          <ModalActions>
            <CancelBtn type="button" onClick={onClose}>Cancel</CancelBtn>
            <SubmitBtn
              type="submit"
              data-testid="action-update_incident"
              disabled={!assignee.trim() || saving}
            >
              {saving ? 'Saving…' : 'Reassign'}
            </SubmitBtn>
          </ModalActions>
        </form>
      </ModalDialog>
    </ModalOverlay>
  );
}

/* ── Styled components ─────────────────────────────────────────────────────── */

const Page = styled.div`width: 100%;`;

const LoadingPage = styled.div`
  padding: 48px 0;
  font-size: 14px;
  color: ${C.muted};
`;

const NotFound = styled.div`
  padding: 64px 0;
  text-align: center;
  h2 { font-size: 20px; font-weight: 700; color: ${C.ink}; margin-bottom: 8px; }
  p { font-size: 14px; color: ${C.muted}; margin-bottom: 20px; }
`;

const BackLink = styled(Link)`
  display: inline-block;
  font-size: 13px;
  font-weight: 500;
  color: ${C.muted};
  text-decoration: none;
  margin-bottom: 20px;
  &:hover { color: ${C.ink}; }
`;

const IncidentHeader = styled.div`
  margin-bottom: 24px;
`;

const BadgeRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
`;

const SevBadge = styled.span`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.05em;
`;

const StatBadge = styled.span`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 700;
`;

const IncidentTitle = styled.h1`
  font-size: clamp(20px, 3vw, 27px);
  font-weight: 800;
  letter-spacing: -0.6px;
  color: ${C.ink};
  margin-bottom: 10px;
`;

const IncidentDesc = styled.p`
  font-size: 14.5px;
  color: ${C.muted};
  line-height: 1.6;
  margin-bottom: 18px;
`;

const MetaRow = styled.div`
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
`;

const MetaItem = styled.div`display: flex; flex-direction: column; gap: 2px;`;
const MetaLabel = styled.span`font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: ${C.mutedSoft};`;
const MetaValue = styled.span`font-size: 13.5px; font-weight: 500; color: ${C.ink}; em { color: ${C.off}; font-style: italic; }`;

const ActionBar = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
`;

const AckBtn = styled.button`
  padding: 9px 18px; font-size: 13.5px; font-weight: 700; border-radius: 8px; cursor: pointer;
  color: #ffffff; background: #F97316; border: 1px solid rgba(0,0,0,0.1);
  transition: filter 0.15s, transform 0.12s;
  &:hover { filter: brightness(1.1); transform: translateY(-1px); }
`;

const ResolveBtn = styled.button`
  padding: 9px 18px; font-size: 13.5px; font-weight: 700; border-radius: 8px; cursor: pointer;
  color: #ffffff; background: #22C55E; border: 1px solid rgba(0,0,0,0.1);
  transition: filter 0.15s, transform 0.12s;
  &:hover { filter: brightness(1.1); transform: translateY(-1px); }
`;

const OutlineBtn = styled.button`
  padding: 9px 16px; font-size: 13px; font-weight: 600; border-radius: 8px; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  transition: background 0.15s, border-color 0.15s;
  &:hover { background: ${C.paper2}; border-color: ${C.muted}; }
`;

const PostmortemBtn = styled(Link)`
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 16px; font-size: 13px; font-weight: 600; border-radius: 8px;
  color: var(--color-primary, #1E293B); background: #e0e7f0; border: 1px solid #c8d4e0;
  text-decoration: none;
  transition: background 0.15s;
  &:hover { background: #d0dcea; }
`;

const ErrorBar = styled.div`
  padding: 10px 14px;
  font-size: 13px;
  color: ${C.danger};
  background: rgba(210,59,47,0.07);
  border: 1px solid rgba(210,59,47,0.2);
  border-radius: 8px;
  margin-bottom: 16px;
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid ${C.line};
  margin: 0 0 24px;
`;

const SectionTitle = styled.h2`
  font-size: 16px;
  font-weight: 700;
  color: ${C.ink};
  margin-bottom: 16px;
`;

const NoComments = styled.p`
  font-size: 14px;
  color: ${C.muted};
  padding: 8px 0;
  margin-bottom: 24px;
`;

const CommentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid ${C.line};
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 24px;
`;

const CommentItem = styled.div`
  padding: 14px 16px;
  border-bottom: 1px solid ${C.line};
  &:last-child { border-bottom: none; }
`;

const CommentMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
`;

const AuthorAvatar = styled.span`
  width: 26px; height: 26px; border-radius: 50%;
  display: grid; place-items: center;
  font-size: 11px; font-weight: 700;
  color: #ffffff;
  background: var(--color-primary, #1E293B);
  flex-shrink: 0;
`;

const AuthorName = styled.span`font-size: 13px; font-weight: 700; color: ${C.ink};`;
const CommentTime = styled.span`font-size: 12px; color: ${C.mutedSoft};`;

const CommentActions = styled.div`
  margin-left: auto;
  display: flex;
  gap: 4px;
`;

const CommentActionBtn = styled.button`
  padding: 3px 8px; font-size: 11.5px; font-weight: 500; border-radius: 6px; cursor: pointer;
  color: ${C.muted}; background: transparent; border: 1px solid transparent;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  &:hover { background: ${C.paper2}; color: ${C.ink}; border-color: ${C.line}; }
  &.danger:hover { color: ${C.danger}; border-color: ${C.danger}; background: rgba(210,59,47,0.07); }
`;

const CommentBody = styled.p`
  font-size: 13.5px;
  color: ${C.ink};
  line-height: 1.55;
  white-space: pre-wrap;
`;

const EditForm = styled.div`display: flex; flex-direction: column; gap: 8px;`;
const EditActions = styled.div`display: flex; gap: 6px;`;

const AddCommentForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const AddCommentActions = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const PostCommentBtn = styled.button`
  padding: 9px 20px; font-size: 13.5px; font-weight: 700; border-radius: 8px; cursor: pointer;
  color: #ffffff; background: var(--color-accent, #EF4444); border: 1px solid rgba(0,0,0,0.1);
  transition: filter 0.15s, transform 0.12s;
  &:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
  &:disabled { opacity: 0.5; cursor: default; }
`;

const SaveBtn = styled.button`
  padding: 6px 14px; font-size: 13px; font-weight: 600; border-radius: 7px; cursor: pointer;
  color: #ffffff; background: var(--color-accent, #EF4444); border: 1px solid rgba(0,0,0,0.1);
  &:disabled { opacity: 0.5; cursor: default; }
`;

const CancelEditBtn = styled.button`
  padding: 6px 12px; font-size: 13px; font-weight: 500; border-radius: 7px; cursor: pointer;
  color: ${C.muted}; background: ${C.paper2}; border: 1px solid ${C.line};
`;

/* Shared modal styles */
const ModalOverlay = styled.div`
  position: fixed; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center; padding: 20px;
  background: rgba(14,20,15,0.45); backdrop-filter: blur(4px);
`;

const ModalDialog = styled.div`
  position: relative; width: 100%; max-width: 440px;
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 16px;
  padding: 28px 26px 24px; box-shadow: 0 40px 90px -40px rgba(14,20,15,0.5);
`;

const ModalClose = styled.button`
  position: absolute; top: 12px; right: 12px; width: 30px; height: 30px;
  display: grid; place-items: center; font-size: 20px; line-height: 1;
  color: ${C.mutedSoft}; background: transparent; border: none; border-radius: 8px; cursor: pointer;
  &:hover { background: ${C.paper2}; color: ${C.ink}; }
`;

const ModalTitle = styled.h3`
  font-size: 18px; font-weight: 800; letter-spacing: -0.4px; color: ${C.ink}; margin: 0 0 16px;
`;

const FieldGroup = styled.div`
  margin-bottom: 16px;
  label {
    display: block; font-size: 12px; font-weight: 600; color: ${C.muted};
    margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.06em;
  }
`;

const StyledInput = styled.input`
  width: 100%; padding: 10px 12px; font-size: 14px;
  color: ${C.ink}; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 8px; outline: none;
  &:focus { border-color: var(--color-accent, #EF4444); box-shadow: 0 0 0 3px rgba(239,68,68,0.15); }
`;

const StyledSelect = styled.select`
  width: 100%; padding: 10px 12px; font-size: 14px; font-weight: 500;
  color: ${C.ink}; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 8px; outline: none; cursor: pointer;
  &:focus { border-color: var(--color-accent, #EF4444); box-shadow: 0 0 0 3px rgba(239,68,68,0.15); }
`;

const StyledTextarea = styled.textarea`
  width: 100%; padding: 10px 12px; font-size: 14px;
  color: ${C.ink}; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 8px; outline: none;
  resize: vertical; font-family: inherit; line-height: 1.5;
  &:focus { border-color: var(--color-accent, #EF4444); box-shadow: 0 0 0 3px rgba(239,68,68,0.15); }
`;

const ModalActions = styled.div`
  display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;
`;

const CancelBtn = styled.button`
  padding: 9px 16px; font-size: 13.5px; font-weight: 600; border-radius: 8px; cursor: pointer;
  color: ${C.muted}; background: ${C.paper2}; border: 1px solid ${C.line};
  &:hover { background: ${C.paper}; color: ${C.ink}; }
`;

const SubmitBtn = styled.button`
  display: inline-flex; align-items: center; justify-content: center;
  padding: 9px 20px; font-size: 13.5px; font-weight: 700; border-radius: 8px; cursor: pointer;
  color: #ffffff; background: var(--color-accent, #EF4444); border: 1px solid rgba(0,0,0,0.1);
  transition: filter 0.15s, transform 0.12s;
  &:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
  &:disabled { opacity: 0.5; cursor: default; }
`;

const ErrorLine = styled.p`
  font-size: 13px; color: ${C.danger}; margin-bottom: 8px;
`;
