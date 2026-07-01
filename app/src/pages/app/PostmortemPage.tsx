import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { C } from '../../theme';
import { APP_ROUTE } from '../../config';
import { type Incident, type Postmortem } from '../../types/incidents';

/**
 * PostmortemPage — write or view the postmortem for a resolved incident.
 *
 * Rules:
 *  - A postmortem can only be written for a resolved incident.
 *  - If a postmortem exists: show it in view mode with an Edit button.
 *  - If not: show the write form (only for resolved incidents).
 *
 * Shell pass: placeholder data. Client wired in next pass.
 */

// ── Placeholder data ───────────────────────────────────────────────────────
const PLACEHOLDER_INCIDENT: Incident | null = null;
const PLACEHOLDER_POSTMORTEM: Postmortem | null = null;

export default function PostmortemPage() {
  const { id } = useParams<{ id: string }>();

  // Shell pass: no real data yet
  const incident = PLACEHOLDER_INCIDENT;
  const postmortem = PLACEHOLDER_POSTMORTEM;
  const loading = false;

  const [editing, setEditing] = useState(false);

  if (loading) {
    return <LoadingPage>Loading postmortem…</LoadingPage>;
  }

  if (!incident) {
    return (
      <NotFound>
        <h2>Incident not found</h2>
        <BackLink to={APP_ROUTE}>← Back to dashboard</BackLink>
      </NotFound>
    );
  }

  if (incident.status !== 'resolved') {
    return (
      <NotAllowed>
        <NotAllowedIcon aria-hidden="true">🔒</NotAllowedIcon>
        <h2>Incident not yet resolved</h2>
        <p>Postmortems can only be written after an incident is resolved.</p>
        <BackLink to={`${APP_ROUTE}/incident/${id}`}>← Back to incident</BackLink>
      </NotAllowed>
    );
  }

  if (postmortem && !editing) {
    return <PostmortemView incident={incident} postmortem={postmortem} onEdit={() => setEditing(true)} />;
  }

  return (
    <PostmortemForm
      incident={incident}
      existing={postmortem}
      onClose={() => setEditing(false)}
    />
  );
}

/* ── View mode ────────────────────────────────────────────────────────────── */
function PostmortemView({
  incident,
  postmortem,
  onEdit,
}: {
  incident: Incident;
  postmortem: Postmortem;
  onEdit: () => void;
}) {
  return (
    <Page>
      <BackLink to={`${APP_ROUTE}/incident/${incident.id}`}>← Back to incident</BackLink>

      <PageHeader>
        <div>
          <PageSuper>Postmortem</PageSuper>
          <PageTitle>{incident.title}</PageTitle>
        </div>
        <EditPostBtn
          data-testid="action-edit_postmortem"
          onClick={onEdit}
        >
          Edit Postmortem
        </EditPostBtn>
      </PageHeader>

      <ByLine>Written by {postmortem.author}</ByLine>

      <Sections>
        <PostSection>
          <SectionLabel>Timeline</SectionLabel>
          <SectionContent>{postmortem.timeline}</SectionContent>
        </PostSection>

        <PostSection>
          <SectionLabel>Root Cause</SectionLabel>
          <SectionContent>{postmortem.root_cause}</SectionContent>
        </PostSection>

        <PostSection>
          <SectionLabel>Action Items</SectionLabel>
          <SectionContent>{postmortem.action_items}</SectionContent>
        </PostSection>
      </Sections>
    </Page>
  );
}

/* ── Write / edit form ────────────────────────────────────────────────────── */
function PostmortemForm({
  incident,
  existing,
  onClose,
}: {
  incident: Incident;
  existing: Postmortem | null;
  onClose: () => void;
}) {
  const [timeline, setTimeline] = useState(existing?.timeline ?? '');
  const [rootCause, setRootCause] = useState(existing?.root_cause ?? '');
  const [actionItems, setActionItems] = useState(existing?.action_items ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = existing !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!timeline.trim() || !rootCause.trim() || !actionItems.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // Client wiring in next pass
      if (isEdit) {
        // edit_postmortem(...)
      } else {
        // create_postmortem(...)
      }
      if (isEdit) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save postmortem.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <BackLink to={`${APP_ROUTE}/incident/${incident.id}`}>← Back to incident</BackLink>

      <PageHeader>
        <div>
          <PageSuper>{isEdit ? 'Edit Postmortem' : 'Write Postmortem'}</PageSuper>
          <PageTitle>{incident.title}</PageTitle>
        </div>
      </PageHeader>

      <FormCard onSubmit={handleSubmit}>
        <FieldGroup>
          <label htmlFor="pm-timeline">
            Timeline
            <FieldHint>What happened, in chronological order</FieldHint>
          </label>
          <StyledTextarea
            id="pm-timeline"
            data-testid="field-timeline"
            rows={5}
            placeholder="14:32 — alerts fired; 14:45 — acknowledged; 15:10 — resolved…"
            value={timeline}
            onChange={(e) => setTimeline(e.target.value)}
            required
          />
        </FieldGroup>

        <FieldGroup>
          <label htmlFor="pm-root">
            Root Cause
            <FieldHint>What caused the incident?</FieldHint>
          </label>
          <StyledTextarea
            id="pm-root"
            data-testid="field-root_cause"
            rows={5}
            placeholder="The connection pool max was set to 50 but load spikes required 200…"
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            required
          />
        </FieldGroup>

        <FieldGroup>
          <label htmlFor="pm-actions">
            Action Items
            <FieldHint>Concrete follow-ups to prevent recurrence</FieldHint>
          </label>
          <StyledTextarea
            id="pm-actions"
            data-testid="field-action_items"
            rows={5}
            placeholder="1. Increase pool max to 200; 2. Add pool-size alerting; 3. Schedule load test…"
            value={actionItems}
            onChange={(e) => setActionItems(e.target.value)}
            required
          />
        </FieldGroup>

        {error && <ErrorLine>{error}</ErrorLine>}

        <FormActions>
          {isEdit && (
            <CancelBtn type="button" onClick={onClose}>Cancel</CancelBtn>
          )}
          <SubmitBtn
            type="submit"
            data-testid={isEdit ? 'action-edit_postmortem' : 'action-create_postmortem'}
            disabled={
              !timeline.trim() || !rootCause.trim() || !actionItems.trim() || saving
            }
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Publish Postmortem'}
          </SubmitBtn>
        </FormActions>
      </FormCard>
    </Page>
  );
}

/* ── Styled components ─────────────────────────────────────────────────────── */

const Page = styled.div`width: 100%;`;

const LoadingPage = styled.div`
  padding: 48px 0; font-size: 14px; color: ${C.muted};
`;

const NotFound = styled.div`
  padding: 64px 0; text-align: center;
  h2 { font-size: 20px; font-weight: 700; color: ${C.ink}; margin-bottom: 16px; }
`;

const NotAllowed = styled.div`
  padding: 64px 0; text-align: center;
  h2 { font-size: 20px; font-weight: 700; color: ${C.ink}; margin: 12px 0 8px; }
  p { font-size: 14px; color: ${C.muted}; margin-bottom: 20px; }
`;

const NotAllowedIcon = styled.div`font-size: 40px; line-height: 1;`;

const BackLink = styled(Link)`
  display: inline-block; font-size: 13px; font-weight: 500; color: ${C.muted};
  text-decoration: none; margin-bottom: 20px;
  &:hover { color: ${C.ink}; }
`;

const PageHeader = styled.div`
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; margin-bottom: 20px; flex-wrap: wrap;
`;

const PageSuper = styled.div`
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em;
  color: ${C.mutedSoft}; margin-bottom: 6px;
`;

const PageTitle = styled.h1`
  font-size: clamp(18px, 3vw, 24px); font-weight: 800; letter-spacing: -0.5px; color: ${C.ink};
`;

const ByLine = styled.p`
  font-size: 13px; color: ${C.muted}; margin-bottom: 28px;
`;

const EditPostBtn = styled.button`
  padding: 9px 16px; font-size: 13px; font-weight: 600; border-radius: 8px; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  transition: background 0.15s, border-color 0.15s;
  &:hover { background: ${C.paper2}; border-color: ${C.muted}; }
`;

const Sections = styled.div`
  display: flex; flex-direction: column; gap: 28px;
`;

const PostSection = styled.div`
  border: 1px solid ${C.line}; border-radius: 12px; overflow: hidden;
`;

const SectionLabel = styled.div`
  padding: 12px 16px;
  font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  color: ${C.muted};
  background: ${C.paper2};
  border-bottom: 1px solid ${C.line};
`;

const SectionContent = styled.pre`
  padding: 16px; font-size: 14px; color: ${C.ink}; line-height: 1.6;
  font-family: inherit; white-space: pre-wrap; word-break: break-word;
  margin: 0;
`;

/* Form */
const FormCard = styled.form`
  display: flex; flex-direction: column; gap: 0;
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 14px;
  padding: 28px 24px;
`;

const FieldGroup = styled.div`
  margin-bottom: 22px;
  label {
    display: block; font-size: 13px; font-weight: 700; color: ${C.ink}; margin-bottom: 4px;
  }
`;

const FieldHint = styled.span`
  display: block; font-size: 11.5px; font-weight: 400; color: ${C.muted}; margin-bottom: 8px;
`;

const StyledTextarea = styled.textarea`
  width: 100%; padding: 11px 13px; font-size: 14px;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  border-radius: 8px; outline: none; resize: vertical; font-family: inherit; line-height: 1.55;
  &:focus { border-color: var(--color-accent, #EF4444); box-shadow: 0 0 0 3px rgba(239,68,68,0.15); }
`;

const ErrorLine = styled.p`
  font-size: 13px; color: ${C.danger}; margin-bottom: 12px;
`;

const FormActions = styled.div`
  display: flex; gap: 10px; justify-content: flex-end; margin-top: 6px;
`;

const CancelBtn = styled.button`
  padding: 9px 16px; font-size: 13.5px; font-weight: 600; border-radius: 8px; cursor: pointer;
  color: ${C.muted}; background: ${C.paper}; border: 1px solid ${C.line};
  &:hover { background: ${C.paper2}; color: ${C.ink}; }
`;

const SubmitBtn = styled.button`
  display: inline-flex; align-items: center; justify-content: center;
  padding: 10px 22px; font-size: 13.5px; font-weight: 700; border-radius: 8px; cursor: pointer;
  color: #ffffff; background: var(--color-accent, #EF4444); border: 1px solid rgba(0,0,0,0.1);
  transition: filter 0.15s, transform 0.12s;
  &:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
  &:disabled { opacity: 0.5; cursor: default; }
`;
