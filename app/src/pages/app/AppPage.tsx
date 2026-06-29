import React, { useState } from 'react';
import styled from 'styled-components';
import { useMero } from '@calimero-network/mero-react';
import { C } from '../../theme';
import { APP_DISPLAY_NAME } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useKudos } from '../../hooks/useItems';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

/**
 * KudosFeed — live board where team members post and view appreciation notes.
 *
 * - Post form: recipient + message → postKudos
 * - Feed: newest first, each card shows recipient (accent), message, author (truncated key), timestamp
 * - Delete: only the author sees × on their own kudos (author === executorPublicKey)
 */
export default function AppPage() {
  const { logout } = useMero();
  const ws = useWorkspace();
  const kudos = useKudos({
    contextId: ws.contextId,
    executorPublicKey: ws.executorPublicKey,
  });

  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim() || !message.trim()) return;
    await kudos.postKudos(recipient.trim(), message.trim());
    setRecipient('');
    setMessage('');
  };

  // No workspace yet (fresh web session): offer create-or-join.
  if (!ws.ready && !ws.loading) {
    return (
      <Empty>
        <WelcomeCard>
          <WelcomeIcon aria-hidden="true">🎉</WelcomeIcon>
          <h2>Welcome to {APP_DISPLAY_NAME}</h2>
          <p>Create a workspace to start celebrating your team, or join one you were invited to.</p>
          <BtnRow>
            <Primary onClick={() => ws.bootstrap()}>Create workspace</Primary>
            <Secondary onClick={() => setShowJoin(true)}>Join with invitation</Secondary>
          </BtnRow>
          {ws.error && <ErrLine>{describeError(ws.error)}</ErrLine>}
        </WelcomeCard>
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
      <Bar>
        <h1>🎉 {APP_DISPLAY_NAME}</h1>
        <div className="actions">
          <Secondary onClick={() => setShowInvite(true)}>Invite</Secondary>
          <Secondary onClick={() => setShowJoin(true)}>Join</Secondary>
          <Secondary onClick={logout}>Sign out</Secondary>
        </div>
      </Bar>

      <PostForm onSubmit={submit}>
        <PostInputs>
          <input
            placeholder="Who deserves kudos? (name or @handle)"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            maxLength={80}
          />
          <input
            placeholder="Why do they deserve it?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={280}
          />
        </PostInputs>
        <Primary
          type="submit"
          disabled={!recipient.trim() || !message.trim() || !kudos.ready}
        >
          ✨ Give kudos
        </Primary>
      </PostForm>

      {kudos.error && <ErrLine>{describeError(kudos.error)}</ErrLine>}

      <Feed>
        {kudos.feed.length === 0 && !kudos.loading && (
          <Hint>No kudos yet — be the first to celebrate someone! 🎊</Hint>
        )}
        {kudos.feed.map((k) => (
          <KudosCard key={k.id}>
            <CardTop>
              <Recipient>🌟 {k.recipient}</Recipient>
              {k.author === ws.executorPublicKey && (
                <DeleteBtn
                  onClick={() => kudos.deleteKudos(k.id)}
                  aria-label="Delete this kudos"
                  title="Delete your kudos"
                >
                  ×
                </DeleteBtn>
              )}
            </CardTop>
            <Message>"{k.message}"</Message>
            <Meta>
              <span>
                From{' '}
                <AuthorKey title={k.author}>
                  {k.author === ws.executorPublicKey ? 'you' : `${k.author.slice(0, 8)}…`}
                </AuthorKey>
              </span>
              <Timestamp>{new Date(k.created_at).toLocaleString()}</Timestamp>
            </Meta>
          </KudosCard>
        ))}
      </Feed>

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

/* ── layout ── */
const Page = styled.div`
  max-width: 680px;
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
  h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: ${C.ink}; }
  .actions { display: flex; gap: 8px; }
`;

/* ── post form ── */
const PostForm = styled.form`
  display: flex;
  gap: 10px;
  margin-bottom: 26px;
  align-items: flex-end;
  flex-wrap: wrap;
`;

const PostInputs = styled.div`
  flex: 1;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  input {
    width: 100%;
    padding: 10px 14px;
    font-size: 14px;
    color: ${C.ink};
    background: ${C.paper2};
    border: 1px solid ${C.line};
    border-radius: 10px;
    outline: none;
    box-sizing: border-box;
    &:focus {
      border-color: var(--color-primary);
      box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.15);
    }
  }
`;

/* ── feed ── */
const Feed = styled.div`display: flex; flex-direction: column; gap: 12px;`;

const KudosCard = styled.div`
  padding: 18px 20px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 14px;
  transition: transform 0.18s, box-shadow 0.18s;
  &:hover { transform: translateY(-2px); box-shadow: 0 10px 28px -16px rgba(0, 0, 0, 0.15); }
`;

const CardTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
`;

const Recipient = styled.div`
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.3px;
  color: var(--color-accent);
`;

const Message = styled.p`
  font-size: 15px;
  color: ${C.ink};
  line-height: 1.55;
  margin-bottom: 14px;
  font-style: italic;
`;

const Meta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: ${C.muted};
  flex-wrap: wrap;
  gap: 4px;
`;

const AuthorKey = styled.span`
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 11px;
  color: ${C.mutedSoft};
  cursor: default;
`;

const Timestamp = styled.span`
  font-size: 11.5px;
  color: ${C.mutedSoft};
`;

const DeleteBtn = styled.button`
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  font-size: 18px;
  line-height: 1;
  color: ${C.mutedSoft};
  background: transparent;
  border: none;
  border-radius: 7px;
  cursor: pointer;
  display: grid;
  place-items: center;
  &:hover { background: ${C.paper}; color: ${C.danger}; }
`;

const Hint = styled.p`
  font-size: 14px;
  color: ${C.muted};
  padding: 8px 2px;
  text-align: center;
`;

const ErrLine = styled.p`margin: 8px 0; font-size: 13px; color: ${C.danger};`;

/* ── welcome / empty state ── */
const Empty = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  min-height: 60vh;
`;

const WelcomeCard = styled.div`
  max-width: 420px;
  text-align: center;
  padding: 36px 32px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 18px;
  h2 { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; color: ${C.ink}; margin-bottom: 8px; }
  p { font-size: 14px; color: ${C.muted}; margin-bottom: 22px; line-height: 1.55; }
`;

const WelcomeIcon = styled.div`
  font-size: 40px;
  margin-bottom: 12px;
`;

const BtnRow = styled.div`display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;`;

const Primary = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  font-size: 13.5px;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  color: #fff;
  background: var(--color-primary);
  border: none;
  transition: filter 0.18s, transform 0.15s;
  &:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
  &:disabled { opacity: 0.5; cursor: default; }
`;

const Secondary = styled.button`
  padding: 10px 16px;
  font-size: 13.5px;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  color: ${C.ink};
  background: ${C.paper};
  border: 1px solid ${C.line};
  transition: background 0.15s, border-color 0.15s;
  &:hover { background: ${C.paper2}; border-color: var(--color-primary); }
`;
