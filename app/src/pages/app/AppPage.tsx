import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { C } from '../../theme';
import { APP_DISPLAY_NAME } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useStandup, StandupEntry, Comment } from '../../hooks/useStandup';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

/**
 * Async standup dashboard — the app's single authenticated screen.
 *
 * Two tabs share one workspace + one `useStandup` instance:
 *  - Dashboard: post/edit your own standup, see everyone's latest update with
 *    blockers highlighted, and comment on any entry.
 *  - History: browse standups by date, grouped by author.
 * Keeps the workspace resolution (bootstrap/join), the Invite/Join wiring, and
 * the welcome gate from the neutral foundation untouched.
 */

type Tab = 'dashboard' | 'history';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AppPage() {
  const { logout } = useMero();
  const ws = useWorkspace();
  const standup = useStandup({
    contextId: ws.contextId,
    executorPublicKey: ws.executorPublicKey,
  });

  const [tab, setTab] = useState<Tab>('dashboard');
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // Composer state — shared between "post new" and "edit existing".
  const [editingId, setEditingId] = useState<string | null>(null);
  const [doneItems, setDoneItems] = useState('');
  const [blockers, setBlockers] = useState('');
  const [plannedItems, setPlannedItems] = useState('');
  const [date, setDate] = useState(todayStr());

  const resetComposer = useCallback(() => {
    setEditingId(null);
    setDoneItems('');
    setBlockers('');
    setPlannedItems('');
    setDate(todayStr());
  }, []);

  const startEdit = useCallback((entry: StandupEntry) => {
    setEditingId(entry.id);
    setDoneItems(entry.done_items);
    setBlockers(entry.blockers);
    setPlannedItems(entry.planned_items);
    setDate(entry.date);
    setTab('dashboard');
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doneItems.trim() && !blockers.trim() && !plannedItems.trim()) return;
    if (editingId) {
      await standup.editStandup(editingId, doneItems.trim(), blockers.trim(), plannedItems.trim());
    } else {
      await standup.postStandup(doneItems.trim(), blockers.trim(), plannedItems.trim(), date);
    }
    resetComposer();
  };

  // The dashboard always shows each teammate's most recent standup.
  const latestByAuthor = useMemo(() => {
    const map = new Map<string, StandupEntry>();
    for (const s of standup.standups) {
      const cur = map.get(s.author);
      if (!cur || s.created_at > cur.created_at) map.set(s.author, s);
    }
    return Array.from(map.values()).sort((a, b) => b.created_at - a.created_at);
  }, [standup.standups]);

  // No workspace yet (fresh web session): offer create-or-join.
  if (!ws.ready && !ws.loading) {
    return (
      <Empty>
        <Card>
          <h2>Welcome to {APP_DISPLAY_NAME}</h2>
          <p>Create a team workspace to start, or join one you were invited to.</p>
          <Row>
            <Primary data-testid="create-workspace-btn" onClick={() => ws.bootstrap()}>Create workspace</Primary>
            <Secondary data-testid="open-join-btn" onClick={() => setShowJoin(true)}>Join with invitation</Secondary>
          </Row>
          {ws.error && <ErrLine>{describeError(ws.error)}</ErrLine>}
        </Card>
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
    <Page data-testid="workspace-ready">
      <Bar>
        <h1>{APP_DISPLAY_NAME}</h1>
        <Tabs>
          <TabBtn type="button" $active={tab === 'dashboard'} onClick={() => setTab('dashboard')}>Dashboard</TabBtn>
          <TabBtn type="button" $active={tab === 'history'} onClick={() => setTab('history')}>History</TabBtn>
        </Tabs>
        <div className="actions">
          <Secondary data-testid="open-invite-btn" onClick={() => setShowInvite(true)}>Invite</Secondary>
          <Secondary data-testid="open-join-btn" onClick={() => setShowJoin(true)}>Join</Secondary>
          <Secondary onClick={logout}>Sign out</Secondary>
        </div>
      </Bar>

      {tab === 'dashboard' ? (
        <>
          <Form onSubmit={submit}>
            <label>
              Done today
              <textarea
                data-testid="field-done_items"
                placeholder="What did you finish?"
                rows={2}
                value={doneItems}
                onChange={(e) => setDoneItems(e.target.value)}
              />
            </label>
            <label>
              Blockers
              <textarea
                data-testid="field-blockers"
                placeholder="Anything blocking you?"
                rows={2}
                value={blockers}
                onChange={(e) => setBlockers(e.target.value)}
              />
            </label>
            <label>
              Planned next
              <textarea
                data-testid="field-planned_items"
                placeholder="What's next?"
                rows={2}
                value={plannedItems}
                onChange={(e) => setPlannedItems(e.target.value)}
              />
            </label>
            {!editingId && (
              <label className="dateField">
                Date
                <input
                  data-testid="field-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            )}
            <Row>
              <Primary
                type="submit"
                data-testid={editingId ? 'action-edit_standup' : 'action-post_standup'}
                disabled={!standup.ready || (!doneItems.trim() && !blockers.trim() && !plannedItems.trim())}
              >
                {editingId ? 'Save changes' : 'Post standup'}
              </Primary>
              {editingId && (
                <Secondary type="button" onClick={resetComposer}>Cancel</Secondary>
              )}
            </Row>
          </Form>

          {standup.error && <ErrLine>{describeError(standup.error)}</ErrLine>}

          <List>
            {latestByAuthor.length === 0 && !standup.loading && (
              <Hint>No standups yet — post the first update above.</Hint>
            )}
            {latestByAuthor.map((entry) => (
              <StandupCard
                key={entry.id}
                entry={entry}
                isOwner={entry.author === ws.executorPublicKey}
                onEdit={() => startEdit(entry)}
                onDelete={() => standup.deleteStandup(entry.id)}
                addComment={standup.addComment}
                getComments={standup.getComments}
                contextId={ws.contextId}
              />
            ))}
          </List>
        </>
      ) : (
        <HistoryView
          getStandupsByDate={standup.getStandupsByDate}
          addComment={standup.addComment}
          getComments={standup.getComments}
          contextId={ws.contextId}
          currentAuthor={ws.executorPublicKey}
          onEdit={startEdit}
          onDelete={standup.deleteStandup}
        />
      )}

      {showInvite && (
        <InviteModal onInvite={ws.invite} onClose={() => setShowInvite(false)} />
      )}
      {showJoin && (
        <JoinModal
          onJoin={async (code) => { await ws.join(code); setShowJoin(false); }}
          onClose={() => setShowJoin(false)}
        />
      )}
    </Page>
  );
}

/* ── one standup entry: fields + owner actions + live comment thread ──────── */
function StandupCard({
  entry,
  isOwner,
  onEdit,
  onDelete,
  addComment,
  getComments,
  contextId,
}: {
  entry: StandupEntry;
  isOwner: boolean;
  onEdit: () => void;
  onDelete: () => void;
  addComment: (standupId: string, body: string) => Promise<void>;
  getComments: (standupId: string) => Promise<Comment[]>;
  contextId: string | null;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);

  const refreshComments = useCallback(async () => {
    setComments(await getComments(entry.id));
  }, [getComments, entry.id]);

  useEffect(() => { void refreshComments(); }, [refreshComments]);
  // Comments aren't part of `useStandup`'s own refresh — re-fetch this card's
  // thread on every sync event too, so replies from peers appear live.
  useSubscription(contextId ? [contextId] : [], () => { void refreshComments(); });

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || posting) return;
    setPosting(true);
    try {
      await addComment(entry.id, body.trim());
      setBody('');
      await refreshComments();
    } finally {
      setPosting(false);
    }
  };

  const hasBlockers = entry.blockers.trim().length > 0;
  const authorLabel = entry.author.slice(0, 8);

  return (
    <Entry data-testid={`item-standup-${entry.id}`} $blocked={hasBlockers}>
      <div className="head">
        <span className="author">{authorLabel}</span>
        <span className="date">{entry.date}</span>
        {isOwner && (
          <div className="ownerActions">
            <button type="button" onClick={onEdit} aria-label="Edit standup">✎</button>
            <button
              type="button"
              data-testid={`action-delete_standup-${entry.id}`}
              onClick={onDelete}
              aria-label="Delete standup"
            >×</button>
          </div>
        )}
      </div>

      <Fields>
        <div>
          <dt>Done</dt>
          <dd>{entry.done_items || '—'}</dd>
        </div>
        {hasBlockers && (
          <div className="blocked">
            <dt>Blocked on</dt>
            <dd>{entry.blockers}</dd>
          </div>
        )}
        <div>
          <dt>Planned next</dt>
          <dd>{entry.planned_items || '—'}</dd>
        </div>
      </Fields>

      <Comments>
        {comments.map((c) => (
          <CommentRow key={c.id} data-testid={`item-comment-${c.id}`}>
            <span className="who">{c.author.slice(0, 6)}</span>
            <p>{c.body}</p>
          </CommentRow>
        ))}
        <CommentForm onSubmit={submitComment}>
          <input
            data-testid={`field-body-${entry.id}`}
            placeholder="Offer help or a fix…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button
            type="submit"
            data-testid={`action-add_comment-${entry.id}`}
            disabled={!body.trim() || posting}
          >Send</button>
        </CommentForm>
      </Comments>
    </Entry>
  );
}

/* ── browse standups by date, grouped by author ────────────────────────────── */
function HistoryView({
  getStandupsByDate,
  addComment,
  getComments,
  contextId,
  currentAuthor,
  onEdit,
  onDelete,
}: {
  getStandupsByDate: (date: string) => Promise<StandupEntry[]>;
  addComment: (standupId: string, body: string) => Promise<void>;
  getComments: (standupId: string) => Promise<Comment[]>;
  contextId: string | null;
  currentAuthor: string | null;
  onEdit: (entry: StandupEntry) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [date, setDate] = useState(todayStr());
  const [entries, setEntries] = useState<StandupEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      setEntries(await getStandupsByDate(d));
    } finally {
      setLoading(false);
    }
  }, [getStandupsByDate]);

  useEffect(() => { void load(date); }, [date, load]);
  useSubscription(contextId ? [contextId] : [], () => { void load(date); });

  const byAuthor = useMemo(() => {
    const map = new Map<string, StandupEntry[]>();
    for (const e of entries) {
      const list = map.get(e.author) ?? [];
      list.push(e);
      map.set(e.author, list);
    }
    return Array.from(map.entries());
  }, [entries]);

  return (
    <HistoryWrap>
      <DateBar>
        <label htmlFor="history-date">Browse by date</label>
        <input
          id="history-date"
          data-testid="field-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </DateBar>

      {!loading && entries.length === 0 && <Hint>No standups posted on {date}.</Hint>}

      {byAuthor.map(([author, list]) => (
        <AuthorGroup key={author}>
          <h4>{author.slice(0, 8)}</h4>
          {list.map((entry) => (
            <StandupCard
              key={entry.id}
              entry={entry}
              isOwner={entry.author === currentAuthor}
              onEdit={() => onEdit(entry)}
              onDelete={() => onDelete(entry.id)}
              addComment={addComment}
              getComments={getComments}
              contextId={contextId}
            />
          ))}
        </AuthorGroup>
      ))}
    </HistoryWrap>
  );
}

const Page = styled.div`
  max-width: 720px;
  margin: 0 auto;
  padding: 28px 20px 64px;
  width: 100%;
`;
const Bar = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: ${C.ink}; }
  .actions { display: flex; gap: 8px; }
`;
const Tabs = styled.div`display: flex; gap: 4px; padding: 4px; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 10px;`;
const TabBtn = styled.button<{ $active: boolean }>`
  padding: 7px 14px; font-size: 13px; font-weight: 600; border-radius: 7px; border: none; cursor: pointer;
  color: ${(p) => (p.$active ? C.onAccent : C.muted)};
  background: ${(p) => (p.$active ? C.green : 'transparent')};
  transition: background 0.15s, color 0.15s;
`;
const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 22px;
  padding: 16px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 12px;
  label {
    display: flex; flex-direction: column; gap: 6px;
    font-size: 12px; font-weight: 600; color: ${C.muted};
  }
  label.dateField { max-width: 200px; }
  textarea, input[type='date'] {
    font-family: inherit;
    resize: vertical;
    padding: 9px 11px; font-size: 14px;
    color: ${C.ink}; background: ${C.paper};
    border: 1px solid ${C.line}; border-radius: 9px; outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
  }
`;
const Row = styled.div`display: flex; gap: 10px; align-items: center; flex-wrap: wrap;`;
const List = styled.div`display: flex; flex-direction: column; gap: 12px;`;
const Hint = styled.p`font-size: 14px; color: ${C.muted}; padding: 8px 2px;`;
const ErrLine = styled.p`margin: 8px 0; font-size: 13px; color: ${C.danger};`;

const Entry = styled.div<{ $blocked: boolean }>`
  padding: 14px 16px; background: ${C.paper2};
  border: 1px solid ${(p) => (p.$blocked ? C.danger : C.line)};
  border-radius: 12px;
  .head {
    display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
    .author { font-size: 13px; font-weight: 700; color: ${C.ink}; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
    .date { font-size: 12px; color: ${C.mutedSoft}; }
    .ownerActions { margin-left: auto; display: flex; gap: 4px; }
    .ownerActions button {
      width: 28px; height: 28px; font-size: 15px; line-height: 1;
      color: ${C.mutedSoft}; background: transparent; border: none; border-radius: 7px; cursor: pointer;
      &:hover { background: ${C.paper}; color: ${C.ink}; }
    }
  }
`;
const Fields = styled.dl`
  display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px;
  dt { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: ${C.mutedSoft}; }
  dd { font-size: 14px; color: ${C.ink}; white-space: pre-wrap; margin-top: 2px; }
  .blocked {
    padding: 8px 10px; background: rgba(210, 59, 47, 0.08);
    border: 1px solid rgba(210, 59, 47, 0.35); border-radius: 8px;
    dt { color: ${C.danger}; } dd { color: ${C.danger}; }
  }
`;
const Comments = styled.div`margin-top: 12px; padding-top: 10px; border-top: 1px solid ${C.line}; display: flex; flex-direction: column; gap: 8px;`;
const CommentRow = styled.div`
  display: flex; gap: 8px; align-items: baseline;
  .who { flex-shrink: 0; font-size: 11px; font-weight: 700; color: ${C.greenInk}; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
  p { font-size: 13px; color: ${C.ink}; }
`;
const CommentForm = styled.form`
  display: flex; gap: 8px;
  input {
    flex: 1; padding: 8px 10px; font-size: 13px;
    color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 8px; outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
  }
  button {
    padding: 8px 14px; font-size: 12.5px; font-weight: 600; border-radius: 8px; cursor: pointer;
    color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c;
    &:disabled { opacity: 0.55; cursor: default; }
  }
`;

const HistoryWrap = styled.div`display: flex; flex-direction: column; gap: 20px;`;
const DateBar = styled.div`
  display: flex; align-items: center; gap: 10px;
  label { font-size: 13px; font-weight: 600; color: ${C.muted}; }
  input {
    padding: 8px 11px; font-size: 14px; color: ${C.ink}; background: ${C.paper2};
    border: 1px solid ${C.line}; border-radius: 9px; outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
  }
`;
const AuthorGroup = styled.div`
  display: flex; flex-direction: column; gap: 10px;
  h4 { font-size: 12px; font-weight: 700; color: ${C.mutedSoft}; text-transform: uppercase; letter-spacing: 0.06em; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
`;

const Empty = styled.div`
  flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px;
`;
const Card = styled.div`
  max-width: 420px; text-align: center;
  padding: 32px 28px; background: ${C.paper2};
  border: 1px solid ${C.line}; border-radius: 18px;
  h2 { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; color: ${C.ink}; margin-bottom: 8px; }
  p { font-size: 14px; color: ${C.muted}; margin-bottom: 22px; line-height: 1.55; }
`;

const Primary = styled.button`
  display: inline-flex; align-items: center; justify-content: center;
  padding: 10px 18px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c;
  transition: background 0.18s, transform 0.15s;
  &:hover:not(:disabled) { background: ${C.greenHover}; transform: translateY(-1px); }
  &:disabled { opacity: 0.55; cursor: default; }
`;
const Secondary = styled.button`
  padding: 10px 16px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  transition: background 0.15s, border-color 0.15s;
  &:hover { background: ${C.paper2}; border-color: ${C.green}; }
`;
