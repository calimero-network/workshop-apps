import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useMero } from '@calimero-network/mero-react';
import { C } from '../../theme';
import { APP_DISPLAY_NAME } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useStandup, StandupEntry, Comment, UseStandupReturn } from '../../hooks/useStandup';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

type View = 'dashboard' | 'history' | 'form';
type FormMode = { kind: 'new' } | { kind: 'edit'; entry: StandupEntry };

function abbrevKey(key: string): string {
  if (key.length <= 16) return key;
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ── StandupCard ─────────────────────────────────────────────────────────── */

interface StandupCardProps {
  entry: StandupEntry;
  isOwn: boolean;
  onEdit: (entry: StandupEntry) => void;
  standup: UseStandupReturn;
}

function StandupCard({ entry, isOwn, onEdit, standup }: StandupCardProps) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    try {
      setComments(await standup.getComments(entry.id));
    } finally {
      setCommentsLoading(false);
    }
  }, [entry.id, standup]);

  useEffect(() => {
    if (commentsOpen) { void loadComments(); }
  }, [commentsOpen, loadComments]);

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = commentBody.trim();
    if (!body) return;
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      await standup.addComment(entry.id, body);
      setCommentBody('');
      await loadComments();
    } catch (err) {
      setCommentError(describeError(err));
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this standup?')) return;
    setDeleting(true);
    try {
      await standup.deleteStandup(entry.id);
    } finally {
      setDeleting(false);
    }
  };

  const hasBlockers = entry.blockers.trim().length > 0;

  return (
    <SCard
      data-testid={`item-StandupEntry-${entry.id}`}
      $hasBlocker={hasBlockers}
    >
      <SCardHeader>
        <div className="meta">
          <AuthorBadge>{abbrevKey(entry.author)}</AuthorBadge>
          <DateBadge>{entry.date}</DateBadge>
        </div>
        {isOwn && (
          <div className="actions">
            <SmBtn onClick={() => onEdit(entry)} aria-label="Edit standup">✎ Edit</SmBtn>
            <SmBtn
              onClick={handleDelete}
              disabled={deleting}
              aria-label="Delete standup"
              data-testid="action-delete_standup"
              $danger
            >
              {deleting ? '…' : '× Delete'}
            </SmBtn>
          </div>
        )}
      </SCardHeader>

      <SCardBody>
        <SField>
          <SFieldLabel>✅ Done</SFieldLabel>
          <SFieldText>{entry.done_items || '—'}</SFieldText>
        </SField>
        <SField $blocker={hasBlockers}>
          <SFieldLabel>🚧 Blockers</SFieldLabel>
          <SFieldText className={hasBlockers ? 'blocker' : 'none'}>
            {hasBlockers ? entry.blockers : 'None'}
          </SFieldText>
        </SField>
        <SField>
          <SFieldLabel>📋 Planned</SFieldLabel>
          <SFieldText>{entry.planned_items || '—'}</SFieldText>
        </SField>
      </SCardBody>

      <SCardFooter>
        <CommentToggle
          onClick={() => setCommentsOpen((o) => !o)}
          aria-expanded={commentsOpen}
        >
          💬 Comments {commentsOpen ? '▲' : '▼'}
        </CommentToggle>
      </SCardFooter>

      {commentsOpen && (
        <CommentSection>
          {commentsLoading && <Hint>Loading comments…</Hint>}
          {!commentsLoading && comments.length === 0 && (
            <Hint>No comments yet — be the first to help!</Hint>
          )}
          {comments.map((c) => (
            <CommentRow key={c.id} data-testid="item-Comment">
              <span className="author">{abbrevKey(c.author)}</span>
              <span className="body">{c.body}</span>
            </CommentRow>
          ))}
          <CommentForm onSubmit={submitComment}>
            <CommentInput
              placeholder="Add a comment…"
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              data-testid="field-body"
              rows={2}
            />
            <SmPrimary
              type="submit"
              disabled={!commentBody.trim() || commentSubmitting}
              data-testid="action-add_comment"
            >
              {commentSubmitting ? '…' : 'Post'}
            </SmPrimary>
          </CommentForm>
          {commentError && <ErrLine>{commentError}</ErrLine>}
        </CommentSection>
      )}
    </SCard>
  );
}

/* ── DashboardView ───────────────────────────────────────────────────────── */

function DashboardView({
  standup,
  executorPublicKey,
  onEdit,
}: {
  standup: UseStandupReturn;
  executorPublicKey: string | null;
  onEdit: (entry: StandupEntry) => void;
}) {
  // Latest standup per author, sorted by most recent first.
  const latestByAuthor = useMemo(() => {
    const map = new Map<string, StandupEntry>();
    for (const entry of standup.standups) {
      const existing = map.get(entry.author);
      if (!existing || entry.created_at > existing.created_at) {
        map.set(entry.author, entry);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.created_at - a.created_at);
  }, [standup.standups]);

  if (standup.loading) return <Hint style={{ padding: '20px' }}>Loading standups…</Hint>;
  if (latestByAuthor.length === 0) {
    return (
      <EmptyState>
        <span role="img" aria-label="standup">📋</span>
        <h3>No standups yet</h3>
        <p>Be the first to share what you're working on. Hit <strong>Post Standup</strong> to get started.</p>
      </EmptyState>
    );
  }

  return (
    <Content>
      <SectionLabel>Latest standup from each team member</SectionLabel>
      {latestByAuthor.map((entry) => (
        <StandupCard
          key={entry.id}
          entry={entry}
          isOwn={entry.author === executorPublicKey}
          onEdit={onEdit}
          standup={standup}
        />
      ))}
    </Content>
  );
}

/* ── HistoryView ─────────────────────────────────────────────────────────── */

function HistoryView({
  standup,
  executorPublicKey,
  onEdit,
}: {
  standup: UseStandupReturn;
  executorPublicKey: string | null;
  onEdit: (entry: StandupEntry) => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [entries, setEntries] = useState<StandupEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const load = useCallback(
    async (d: string) => {
      setLoading(true);
      setFetchError(null);
      try {
        setEntries(await standup.getStandupsByDate(d));
      } catch (err) {
        setFetchError(describeError(err));
      } finally {
        setLoading(false);
      }
    },
    [standup],
  );

  useEffect(() => { void load(date); }, [date, load]);

  return (
    <Content>
      <HistoryBar>
        <label htmlFor="history-date">Browse by date:</label>
        <DateInput
          id="history-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          data-testid="field-date"
        />
      </HistoryBar>
      {loading && <Hint>Loading…</Hint>}
      {fetchError && <ErrLine>{fetchError}</ErrLine>}
      {!loading && !fetchError && entries.length === 0 && (
        <EmptyState>
          <span role="img" aria-label="calendar">📅</span>
          <h3>No standups on {date}</h3>
          <p>Try selecting a different date.</p>
        </EmptyState>
      )}
      {entries.map((entry) => (
        <StandupCard
          key={entry.id}
          entry={entry}
          isOwn={entry.author === executorPublicKey}
          onEdit={onEdit}
          standup={standup}
        />
      ))}
    </Content>
  );
}

/* ── StandupFormView ─────────────────────────────────────────────────────── */

function StandupFormView({
  standup,
  formMode,
  onSuccess,
}: {
  standup: UseStandupReturn;
  formMode: FormMode;
  executorPublicKey: string | null;
  onSuccess: () => void;
}) {
  const isEdit = formMode.kind === 'edit';
  const existing = isEdit ? formMode.entry : null;

  // State initializes from existing entry (or blank for new).
  // The parent uses a `key` prop to force remount on mode change.
  const [doneItems, setDoneItems] = useState(existing?.done_items ?? '');
  const [blockers, setBlockers] = useState(existing?.blockers ?? '');
  const [plannedItems, setPlannedItems] = useState(existing?.planned_items ?? '');
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canSubmit = doneItems.trim().length > 0 || plannedItems.trim().length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setFormError(null);
    try {
      if (isEdit && existing) {
        await standup.editStandup(
          existing.id,
          doneItems.trim(),
          blockers.trim(),
          plannedItems.trim(),
        );
      } else {
        await standup.postStandup(
          doneItems.trim(),
          blockers.trim(),
          plannedItems.trim(),
          date,
        );
      }
      onSuccess();
    } catch (err) {
      setFormError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Content>
      <FormCard>
        <FormTitle>{isEdit ? '✎ Edit Standup' : '📋 Post Your Daily Standup'}</FormTitle>
        <FormSub>
          {isEdit
            ? `Update your standup — your changes are visible to the team immediately.`
            : `Share what you got done, what's blocking you, and what you're tackling next.`}
        </FormSub>
        <StandupForm onSubmit={submit}>
          <FormGroup>
            <FormLabel htmlFor="done-items">✅ What did you finish?</FormLabel>
            <StyledTextarea
              id="done-items"
              placeholder="Shipped the login flow, fixed the API timeout bug, reviewed PR #42…"
              value={doneItems}
              onChange={(e) => setDoneItems(e.target.value)}
              rows={3}
              data-testid="field-done_items"
            />
          </FormGroup>

          <FormGroup>
            <FormLabel htmlFor="blockers">🚧 Any blockers?</FormLabel>
            <StyledTextarea
              id="blockers"
              placeholder="Waiting on API keys from infra (leave blank if none)…"
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              rows={2}
              data-testid="field-blockers"
            />
          </FormGroup>

          <FormGroup>
            <FormLabel htmlFor="planned-items">📋 What's next?</FormLabel>
            <StyledTextarea
              id="planned-items"
              placeholder="Start dashboard layout, write unit tests for auth module…"
              value={plannedItems}
              onChange={(e) => setPlannedItems(e.target.value)}
              rows={3}
              data-testid="field-planned_items"
            />
          </FormGroup>

          {!isEdit && (
            <FormGroup>
              <FormLabel htmlFor="standup-date">📅 Date</FormLabel>
              <DateInput
                id="standup-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                data-testid="field-date"
              />
            </FormGroup>
          )}

          {formError && <ErrLine>{formError}</ErrLine>}

          <FormActions>
            <Primary
              type="submit"
              disabled={submitting || !canSubmit}
              data-testid={isEdit ? 'action-edit_standup' : 'action-post_standup'}
            >
              {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Post standup'}
            </Primary>
          </FormActions>
        </StandupForm>
      </FormCard>
    </Content>
  );
}

/* ── AppPage ─────────────────────────────────────────────────────────────── */

export default function AppPage() {
  const { logout } = useMero();
  const ws = useWorkspace();
  const standup = useStandup({
    contextId: ws.contextId,
    executorPublicKey: ws.executorPublicKey,
  });

  const [view, setView] = useState<View>('dashboard');
  const [formMode, setFormMode] = useState<FormMode>({ kind: 'new' });
  const [formKey, setFormKey] = useState(0);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const editEntry = (entry: StandupEntry) => {
    setFormMode({ kind: 'edit', entry });
    setFormKey((k) => k + 1);
    setView('form');
  };

  const goNewForm = () => {
    setFormMode({ kind: 'new' });
    setFormKey((k) => k + 1);
    setView('form');
  };

  // Welcome gate — no workspace context yet
  if (!ws.ready && !ws.loading) {
    return (
      <Empty>
        <GateCard>
          <h2>Welcome to {APP_DISPLAY_NAME}</h2>
          <p>Create a workspace for your team, or join one you were invited to.</p>
          <GateRow>
            <Primary onClick={() => ws.bootstrap()}>Create workspace</Primary>
            <Secondary onClick={() => setShowJoin(true)}>Join with invitation</Secondary>
          </GateRow>
          {ws.error && <ErrLine>{describeError(ws.error)}</ErrLine>}
        </GateCard>
        {showJoin && (
          <JoinModal
            onJoin={async (code) => { await ws.join(code); setShowJoin(false); }}
            onClose={() => setShowJoin(false)}
          />
        )}
      </Empty>
    );
  }

  return (
    <Page>
      <TopBar>
        <Brand>📋 {APP_DISPLAY_NAME}</Brand>
        <TabRow>
          <TabBtn $active={view === 'dashboard'} onClick={() => setView('dashboard')}>
            Dashboard
          </TabBtn>
          <TabBtn $active={view === 'history'} onClick={() => setView('history')}>
            History
          </TabBtn>
          <TabBtn $active={view === 'form'} onClick={goNewForm}>
            Post Standup
          </TabBtn>
        </TabRow>
        <BarActions>
          <Secondary onClick={() => setShowInvite(true)}>Invite</Secondary>
          <Secondary onClick={() => setShowJoin(true)}>Join</Secondary>
          <Secondary onClick={logout}>Sign out</Secondary>
        </BarActions>
      </TopBar>

      {standup.error && (
        <ErrLine style={{ margin: '12px 20px 0' }}>{describeError(standup.error)}</ErrLine>
      )}

      {view === 'dashboard' && (
        <DashboardView
          standup={standup}
          executorPublicKey={ws.executorPublicKey}
          onEdit={editEntry}
        />
      )}
      {view === 'history' && (
        <HistoryView
          standup={standup}
          executorPublicKey={ws.executorPublicKey}
          onEdit={editEntry}
        />
      )}
      {view === 'form' && (
        <StandupFormView
          key={formKey}
          standup={standup}
          formMode={formMode}
          executorPublicKey={ws.executorPublicKey}
          onSuccess={() => setView('dashboard')}
        />
      )}

      {showInvite && <InviteModal onInvite={ws.invite} onClose={() => setShowInvite(false)} />}
      {showJoin && (
        <JoinModal
          onJoin={async (code) => { await ws.join(code); setShowJoin(false); }}
          onClose={() => setShowJoin(false)}
        />
      )}
    </Page>
  );
}

/* ════════════════ Styled components ════════════════ */

const Page = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: ${C.paper};
`;

const TopBar = styled.header`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 20px;
  height: 56px;
  background: ${C.paper2};
  border-bottom: 1px solid ${C.line};
  position: sticky;
  top: 0;
  z-index: 10;
  flex-wrap: wrap;
  @media (max-width: 700px) {
    height: auto;
    padding: 10px 16px;
    gap: 10px;
  }
`;

const Brand = styled.div`
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.4px;
  color: var(--color-primary, ${C.ink});
  white-space: nowrap;
`;

const TabRow = styled.nav`
  display: flex;
  gap: 4px;
  flex: 1;
`;

const TabBtn = styled.button<{ $active: boolean }>`
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid ${(p) => (p.$active ? 'var(--color-primary, #1E40AF)' : 'transparent')};
  background: ${(p) => (p.$active ? 'rgba(30,64,175,0.08)' : 'transparent')};
  color: ${(p) => (p.$active ? 'var(--color-primary, #1E40AF)' : C.muted)};
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  &:hover { background: rgba(30,64,175,0.06); color: var(--color-primary, #1E40AF); }
`;

const BarActions = styled.div`
  display: flex;
  gap: 6px;
  margin-left: auto;
`;

const Content = styled.div`
  max-width: 760px;
  margin: 0 auto;
  padding: 24px 20px 64px;
  width: 100%;
`;

const SectionLabel = styled.p`
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${C.muted};
  margin-bottom: 14px;
`;

/* standup card */
const SCard = styled.div<{ $hasBlocker: boolean }>`
  border: 1px solid ${(p) => (p.$hasBlocker ? 'var(--color-accent, #F59E0B)' : C.line)};
  border-radius: 14px;
  background: ${C.paper2};
  margin-bottom: 14px;
  overflow: hidden;
  transition: box-shadow 0.2s, border-color 0.2s;
  ${(p) =>
    p.$hasBlocker &&
    `box-shadow: 0 0 0 3px rgba(245,158,11,0.12);`}
  &:hover { box-shadow: 0 4px 16px -8px rgba(0,0,0,0.15); }
`;

const SCardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid ${C.line};
  .meta { display: flex; align-items: center; gap: 8px; }
  .actions { display: flex; gap: 6px; }
`;

const AuthorBadge = styled.span`
  font-size: 12px;
  font-weight: 700;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  color: var(--color-primary, #1E40AF);
  background: rgba(30,64,175,0.08);
  border: 1px solid rgba(30,64,175,0.18);
  padding: 2px 8px;
  border-radius: 999px;
`;

const DateBadge = styled.span`
  font-size: 12px;
  color: ${C.muted};
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
`;

const SCardBody = styled.div`
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const SField = styled.div<{ $blocker?: boolean }>`
  padding: ${(p) => (p.$blocker ? '10px 12px' : '0')};
  background: ${(p) => (p.$blocker ? 'rgba(245,158,11,0.08)' : 'transparent')};
  border: ${(p) => (p.$blocker ? '1px solid rgba(245,158,11,0.28)' : 'none')};
  border-radius: ${(p) => (p.$blocker ? '8px' : '0')};
`;

const SFieldLabel = styled.div`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${C.muted};
  margin-bottom: 4px;
`;

const SFieldText = styled.p`
  font-size: 14px;
  color: ${C.ink};
  line-height: 1.55;
  white-space: pre-wrap;
  &.none { color: ${C.muted}; font-style: italic; }
  &.blocker { color: #92400e; font-weight: 500; }
`;

const SmBtn = styled.button<{ $danger?: boolean }>`
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid ${(p) => (p.$danger ? 'rgba(239,68,68,0.25)' : C.line)};
  background: ${(p) => (p.$danger ? 'rgba(239,68,68,0.06)' : C.paper)};
  color: ${(p) => (p.$danger ? '#dc2626' : C.ink)};
  transition: background 0.15s, border-color 0.15s;
  &:hover:not(:disabled) {
    background: ${(p) => (p.$danger ? 'rgba(239,68,68,0.12)' : C.paper2)};
    border-color: ${(p) => (p.$danger ? '#ef4444' : C.green)};
  }
  &:disabled { opacity: 0.5; cursor: default; }
`;

const SCardFooter = styled.div`
  padding: 0 16px;
  border-top: 1px solid ${C.line};
`;

const CommentToggle = styled.button`
  width: 100%;
  text-align: left;
  padding: 10px 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 600;
  color: ${C.muted};
  transition: color 0.15s;
  &:hover { color: ${C.ink}; }
`;

const CommentSection = styled.div`
  padding: 14px 16px;
  background: ${C.paper};
  border-top: 1px solid ${C.line};
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const CommentRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: flex-start;
  .author {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 700;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    color: var(--color-primary, #1E40AF);
    background: rgba(30,64,175,0.08);
    padding: 2px 7px;
    border-radius: 999px;
    margin-top: 2px;
  }
  .body {
    font-size: 13.5px;
    color: ${C.ink};
    line-height: 1.5;
  }
`;

const CommentForm = styled.form`
  display: flex;
  gap: 8px;
  align-items: flex-start;
`;

const CommentInput = styled.textarea`
  flex: 1;
  padding: 8px 10px;
  font-size: 13px;
  color: ${C.ink};
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 8px;
  resize: vertical;
  outline: none;
  font-family: inherit;
  line-height: 1.5;
  &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.15); }
`;

const SmPrimary = styled.button`
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  color: ${C.onAccent};
  background: ${C.green};
  border: 1px solid #93e60c;
  transition: background 0.15s, transform 0.15s;
  white-space: nowrap;
  &:hover:not(:disabled) { background: ${C.greenHover}; transform: translateY(-1px); }
  &:disabled { opacity: 0.5; cursor: default; }
`;

/* history */
const HistoryBar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  label {
    font-size: 14px;
    font-weight: 600;
    color: ${C.ink};
    white-space: nowrap;
  }
`;

const DateInput = styled.input`
  padding: 8px 12px;
  font-size: 13.5px;
  color: ${C.ink};
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 8px;
  outline: none;
  &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.15); }
`;

/* form */
const FormCard = styled.div`
  max-width: 600px;
  margin: 0 auto;
  padding: 28px 28px 32px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 16px;
`;

const FormTitle = styled.h2`
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.4px;
  color: ${C.ink};
  margin-bottom: 6px;
`;

const FormSub = styled.p`
  font-size: 13.5px;
  color: ${C.muted};
  margin-bottom: 22px;
  line-height: 1.55;
`;

const StandupForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 18px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FormLabel = styled.label`
  font-size: 13px;
  font-weight: 700;
  color: ${C.ink};
`;

const StyledTextarea = styled.textarea`
  padding: 10px 12px;
  font-size: 14px;
  color: ${C.ink};
  background: ${C.paper};
  border: 1px solid ${C.line};
  border-radius: 10px;
  resize: vertical;
  outline: none;
  font-family: inherit;
  line-height: 1.6;
  &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.15); }
`;

const FormActions = styled.div`
  display: flex;
  justify-content: flex-end;
`;

/* empty / gate */
const Empty = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: ${C.paper};
`;

const GateCard = styled.div`
  max-width: 440px;
  text-align: center;
  padding: 36px 32px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 18px;
  h2 { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; color: ${C.ink}; margin-bottom: 10px; }
  p { font-size: 14px; color: ${C.muted}; margin-bottom: 24px; line-height: 1.6; }
`;

const GateRow = styled.div`
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: ${C.muted};
  span { font-size: 40px; display: block; margin-bottom: 14px; }
  h3 { font-size: 17px; font-weight: 700; color: ${C.ink}; margin-bottom: 8px; }
  p { font-size: 14px; line-height: 1.6; max-width: 380px; margin: 0 auto; }
`;

/* buttons */
const Primary = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 700;
  border-radius: 10px;
  cursor: pointer;
  color: ${C.onAccent};
  background: ${C.green};
  border: 1px solid #93e60c;
  transition: background 0.18s, transform 0.15s;
  &:hover:not(:disabled) { background: ${C.greenHover}; transform: translateY(-1px); }
  &:disabled { opacity: 0.55; cursor: default; }
`;

const Secondary = styled.button`
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  color: ${C.ink};
  background: ${C.paper};
  border: 1px solid ${C.line};
  transition: background 0.15s, border-color 0.15s;
  &:hover { background: ${C.paper2}; border-color: ${C.green}; }
`;

const Hint = styled.p`
  font-size: 13.5px;
  color: ${C.muted};
  padding: 4px 2px;
`;

const ErrLine = styled.p`
  font-size: 13px;
  color: ${C.danger};
  margin: 0;
`;
