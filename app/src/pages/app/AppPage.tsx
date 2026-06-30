import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { useMero } from '@calimero-network/mero-react';
import { C } from '../../theme';
import { APP_DISPLAY_NAME } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useRetro, BoardCard } from '../../hooks/useRetro';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

/**
 * RetroBoard — the sprint-retro view: three columns (went well / to improve /
 * action items) with live cards, vote counts and action-item done state, all
 * driven by `useRetro` over the generated `RetroBoardClient`. `useSubscription`
 * inside the hook re-fetches on every sync event, so peers' cards/votes/toggles
 * appear within seconds. Toggle/delete are shown only to the card's author or
 * the facilitator (the backend gates them the same way).
 */

const COLUMNS = [
  { key: 'went_well', title: 'Went well', hint: 'What worked this sprint', accent: '#10b981' },
  { key: 'to_improve', title: 'To improve', hint: 'What slowed us down', accent: '#f59e0b' },
  { key: 'action_items', title: 'Action items', hint: 'What we’ll do next', accent: 'var(--color-primary)' },
] as const;

type ColumnKey = (typeof COLUMNS)[number]['key'];

export default function AppPage() {
  const { logout } = useMero();
  const ws = useWorkspace();
  const retro = useRetro({ contextId: ws.contextId, executorPublicKey: ws.executorPublicKey });

  const [drafts, setDrafts] = useState<Record<ColumnKey, string>>({
    went_well: '', to_improve: '', action_items: '',
  });
  const [retroName, setRetroName] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const byColumn = useMemo(() => {
    const out: Record<ColumnKey, BoardCard[]> = { went_well: [], to_improve: [], action_items: [] };
    for (const card of retro.cards) {
      if (card.column in out) out[card.column as ColumnKey].push(card);
    }
    // Highest-voted first, so the most important themes surface to the top.
    for (const key of Object.keys(out) as ColumnKey[]) {
      out[key].sort((a, b) => b.votes - a.votes);
    }
    return out;
  }, [retro.cards]);

  const submitCard = (column: ColumnKey) => {
    const text = drafts[column].trim();
    if (!text) return;
    void retro.addCard(column, text);
    setDrafts((d) => ({ ...d, [column]: '' }));
  };

  // No workspace yet (fresh web session): offer create-or-join.
  if (!ws.ready && !ws.loading) {
    return (
      <Empty>
        <Card>
          <h2>Welcome to {APP_DISPLAY_NAME}</h2>
          <p>Start a retro for your team, or join one you were invited to.</p>
          <Row>
            <Primary onClick={() => ws.bootstrap()}>Start a retro</Primary>
            <Secondary onClick={() => setShowJoin(true)}>Join with invitation</Secondary>
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

  // The context exists but the retro hasn't been named yet — the first member
  // names it and becomes the facilitator (create_retro). Members joining an
  // already-named retro skip straight to the board.
  if (retro.retro && !retro.retro.name) {
    return (
      <Empty>
        <Card>
          <h2>Name your retro</h2>
          <p>Give this retrospective a title so your team knows what it’s for.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = retroName.trim();
              if (name) void retro.createRetro(name);
            }}
          >
            <NameInput
              placeholder="e.g. Sprint 42 Retro"
              value={retroName}
              onChange={(e) => setRetroName(e.target.value)}
              autoFocus
            />
            <Row>
              <Primary type="submit" disabled={!retroName.trim()}>Create retro</Primary>
            </Row>
          </form>
          {retro.error && <ErrLine>{describeError(retro.error)}</ErrLine>}
        </Card>
      </Empty>
    );
  }

  return (
    <Page>
      <Bar>
        <div className="title">
          <h1>{retro.retro?.name || APP_DISPLAY_NAME}</h1>
          <span>Live sprint retrospective</span>
        </div>
        <div className="actions">
          <Secondary onClick={() => setShowInvite(true)}>Invite</Secondary>
          <Secondary onClick={() => setShowJoin(true)}>Join</Secondary>
          <Secondary onClick={logout}>Sign out</Secondary>
        </div>
      </Bar>

      {retro.error && <ErrLine>{describeError(retro.error)}</ErrLine>}

      <Board>
        {COLUMNS.map((col) => (
          <Column key={col.key} style={{ '--col-accent': col.accent } as React.CSSProperties}>
            <header>
              <div className="label">
                <span className="bar" />
                <h2>{col.title}</h2>
                <em>{byColumn[col.key].length}</em>
              </div>
              <p>{col.hint}</p>
            </header>

            <div className="cards">
              {byColumn[col.key].length === 0 && (
                <Hint>No cards yet — add the first one below.</Hint>
              )}
              {byColumn[col.key].map((card) => (
                <CardRow key={card.id} $done={card.done}>
                  <p className="text">{card.text}</p>
                  <div className="meta">
                    <span className="author">{card.author.slice(0, 8)}</span>
                    <div className="right">
                      {col.key === 'action_items' && card.mine && (
                        <button
                          className={`check ${card.done ? 'on' : ''}`}
                          onClick={() => retro.toggleDone(card.id)}
                          aria-pressed={card.done}
                          aria-label={card.done ? 'Mark not done' : 'Mark done'}
                        >
                          {card.done ? '✓ done' : 'mark done'}
                        </button>
                      )}
                      {col.key === 'action_items' && !card.mine && card.done && (
                        <span className="doneTag">✓ done</span>
                      )}
                      <button
                        className={`vote ${card.voted ? 'on' : ''}`}
                        onClick={() => retro.upvote(card.id)}
                        disabled={card.voted}
                        aria-label="Upvote"
                      >
                        ▲ {card.votes}
                      </button>
                      {card.mine && (
                        <button className="del" onClick={() => retro.removeCard(card.id)} aria-label="Delete">×</button>
                      )}
                    </div>
                  </div>
                </CardRow>
              ))}
            </div>

            <AddRow
              onSubmit={(e) => { e.preventDefault(); submitCard(col.key); }}
            >
              <input
                placeholder={`Add to ${col.title.toLowerCase()}…`}
                value={drafts[col.key]}
                onChange={(e) => setDrafts((d) => ({ ...d, [col.key]: e.target.value }))}
              />
              <button type="submit" disabled={!drafts[col.key].trim()} aria-label="Add card">+</button>
            </AddRow>
          </Column>
        ))}
      </Board>

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

const Page = styled.div`
  max-width: 1180px;
  margin: 0 auto;
  padding: 28px 20px 64px;
  width: 100%;
`;
const Bar = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  .title h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: ${C.ink}; }
  .title span { font-size: 13px; color: ${C.muted}; }
  .actions { display: flex; gap: 8px; }
`;

const Board = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  align-items: start;
  @media (max-width: 860px) { grid-template-columns: 1fr; }
`;
const Column = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 14px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 16px;
  header .label { display: flex; align-items: center; gap: 9px; }
  header .bar { width: 10px; height: 10px; border-radius: 3px; background: var(--col-accent); }
  header h2 { font-size: 15px; font-weight: 800; letter-spacing: -0.3px; color: ${C.ink}; }
  header em {
    margin-left: auto; font-style: normal; font-size: 12px; font-weight: 700;
    color: ${C.muted}; background: ${C.paper}; border: 1px solid ${C.line};
    border-radius: 999px; padding: 1px 9px;
  }
  header p { margin-top: 4px; font-size: 12px; color: ${C.mutedSoft}; }
  .cards { display: flex; flex-direction: column; gap: 10px; min-height: 24px; }
`;
const CardRow = styled.div<{ $done: boolean }>`
  padding: 12px 13px;
  background: ${C.paper};
  border: 1px solid ${C.line};
  border-left: 3px solid var(--col-accent);
  border-radius: 11px;
  opacity: ${(p) => (p.$done ? 0.62 : 1)};
  .text {
    font-size: 14px; line-height: 1.45; color: ${C.ink};
    text-decoration: ${(p) => (p.$done ? 'line-through' : 'none')};
  }
  .meta { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
  .author { font-size: 11.5px; font-weight: 600; color: ${C.mutedSoft}; }
  .right { display: flex; align-items: center; gap: 6px; margin-left: auto; }
  button { cursor: pointer; font-family: inherit; transition: background 0.15s, color 0.15s, border-color 0.15s; }
  .vote {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 12px; font-weight: 700; padding: 4px 9px; border-radius: 999px;
    color: ${C.muted}; background: ${C.paper2}; border: 1px solid ${C.line};
    &:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-accent); }
    &.on { color: #fff; background: var(--color-accent); border-color: var(--color-accent); }
    &:disabled { cursor: default; }
  }
  .check {
    font-size: 11.5px; font-weight: 700; padding: 4px 9px; border-radius: 999px;
    color: ${C.muted}; background: ${C.paper2}; border: 1px solid ${C.line};
    &:hover { border-color: var(--col-accent); color: var(--col-accent); }
    &.on { color: #fff; background: var(--col-accent); border-color: var(--col-accent); }
  }
  .doneTag {
    font-size: 11.5px; font-weight: 700; padding: 4px 9px; border-radius: 999px;
    color: #fff; background: var(--col-accent);
  }
  .del {
    width: 26px; height: 26px; font-size: 17px; line-height: 1; border-radius: 7px;
    color: ${C.mutedSoft}; background: transparent; border: none;
    &:hover { background: ${C.paper2}; color: ${C.danger}; }
  }
`;
const AddRow = styled.form`
  display: flex; gap: 8px; margin-top: auto;
  input {
    flex: 1; min-width: 0; padding: 9px 11px; font-size: 13px;
    color: ${C.ink}; background: ${C.paper};
    border: 1px solid ${C.line}; border-radius: 9px; outline: none;
    &::placeholder { color: ${C.mutedSoft}; }
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(124,58,237,0.18); }
  }
  button {
    flex-shrink: 0; width: 38px; font-size: 20px; font-weight: 600; line-height: 1; cursor: pointer;
    color: ${C.onAccent}; background: ${C.green}; border: 1px solid ${C.greenHover}; border-radius: 9px;
    transition: background 0.18s, transform 0.15s;
    &:hover:not(:disabled) { background: ${C.greenHover}; transform: translateY(-1px); }
    &:disabled { opacity: 0.5; cursor: default; }
  }
`;
const Hint = styled.p`font-size: 13px; color: ${C.mutedSoft}; padding: 4px 2px;`;
const ErrLine = styled.p`margin: 8px 0; font-size: 13px; color: ${C.danger};`;

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
const Row = styled.div`display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;`;

const NameInput = styled.input`
  width: 100%; margin-bottom: 16px; padding: 11px 13px; font-size: 14px;
  color: ${C.ink}; background: ${C.paper};
  border: 1px solid ${C.line}; border-radius: 10px; outline: none;
  &::placeholder { color: ${C.mutedSoft}; }
  &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(124,58,237,0.18); }
`;

const Primary = styled.button`
  display: inline-flex; align-items: center; justify-content: center;
  padding: 10px 18px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.onAccent}; background: ${C.green}; border: 1px solid ${C.greenHover};
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
