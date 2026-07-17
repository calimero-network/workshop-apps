import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { useMero } from '@calimero-network/mero-react';
import { C } from '../../theme';
import { APP_DISPLAY_NAME } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useChessGame } from '../../hooks/useChessGame';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import { DisplayNamesProvider } from '../../components/MemberLabel';
import { DisplayNameGate } from '../../components/DisplayNameGate';
import GameLobbyView from './GameLobbyView';
import ChessBoardView from './ChessBoardView';
import MoveHistoryView from './MoveHistoryView';

/**
 * AppPage — the live-chess match screen.
 *
 * Composes the three spec views over the single shared `chess-game` context:
 *  - Welcome gate (no workspace yet): create a match (host, plays White) or
 *    join one via invitation (plays Black).
 *  - `GameLobbyView`: workspace exists but `create_game` hasn't run yet — the
 *    host waits for their friend to show up in the namespace's member list,
 *    then starts the match with that friend's real identity.
 *  - `ChessBoardView` + `MoveHistoryView`: the live match once it's active
 *    (or finished).
 * Keeps the workspace resolution (bootstrap/join), the Invite/Join wiring,
 * and the display-name gate exactly as the foundation provides them.
 */
export default function AppPage() {
  const { logout } = useMero();
  const ws = useWorkspace();
  const chess = useChessGame({
    contextId: ws.contextId,
    executorPublicKey: ws.executorPublicKey,
  });

  const [matchName, setMatchName] = useState('My chess match');
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [isHost, setIsHost] = useState(false);

  const handleCreate = () => {
    setIsHost(true);
    void ws.bootstrap(matchName);
  };

  const handleJoin = async (code: string) => {
    await ws.join(code);
    setIsHost(false);
    setShowJoin(false);
  };

  const myColor: 'white' | 'black' | null = useMemo(() => {
    if (!chess.game || !ws.executorPublicKey) return null;
    if (chess.game.white_player === ws.executorPublicKey) return 'white';
    if (chess.game.black_player === ws.executorPublicKey) return 'black';
    return null;
  }, [chess.game, ws.executorPublicKey]);

  const gameStarted = chess.game !== null && chess.game.status !== 'pending';

  // No workspace yet (fresh web session): offer create-or-join.
  if (!ws.ready && !ws.loading) {
    return (
      <Empty>
        <Card>
          <h2>Welcome to {APP_DISPLAY_NAME}</h2>
          <p>Create a new match and invite a friend, or join a match you were invited to.</p>
          <NameField
            data-testid="field-workspace-name"
            value={matchName}
            onChange={(e) => setMatchName(e.target.value)}
            placeholder="Match name"
            maxLength={64}
            aria-label="Match name"
          />
          <Row>
            <Primary data-testid="create-workspace-btn" onClick={handleCreate}>Create match</Primary>
            <Secondary data-testid="open-join-btn" onClick={() => setShowJoin(true)}>Join with invitation</Secondary>
          </Row>
          {ws.error && <ErrLine>{describeError(ws.error)}</ErrLine>}
        </Card>
        {showJoin && (
          <JoinModal onJoin={handleJoin} onClose={() => setShowJoin(false)} />
        )}
      </Empty>
    );
  }

  return (
    <DisplayNamesProvider
      namespaceId={ws.namespaceId}
      contextId={ws.contextId}
      selfIdentity={ws.executorPublicKey}
    >
      <Page data-testid="workspace-ready">
        <Bar>
          <h1>{APP_DISPLAY_NAME}</h1>
          <div className="actions">
            <Secondary data-testid="open-invite-btn" onClick={() => setShowInvite(true)}>Invite</Secondary>
            <Secondary data-testid="open-join-btn" onClick={() => setShowJoin(true)}>Join</Secondary>
            <Secondary onClick={logout}>Sign out</Secondary>
          </div>
        </Bar>

        <Content>
          {!chess.game ? (
            <Hint>Loading game…</Hint>
          ) : gameStarted ? (
            <>
              <ChessBoardView
                game={chess.game}
                myColor={myColor}
                onSubmitMove={chess.submitMove}
                onResign={chess.resign}
              />
              <MoveHistoryView moves={chess.moves} />
            </>
          ) : (
            <GameLobbyView
              namespaceId={ws.namespaceId}
              isHost={isHost}
              creating={chess.creating}
              error={chess.error}
              onStart={(opponentIdentity) => { void chess.createGame(opponentIdentity); }}
            />
          )}

          {/* Blocks the content (not the top bar) until a name is set. Never
              shown on the injected/SSO path (desktop + e2e). */}
          <DisplayNameGate injected={ws.injectedContext} />
        </Content>

        {showInvite && (
          <InviteModal onInvite={ws.invite} onClose={() => setShowInvite(false)} />
        )}
        {showJoin && (
          <JoinModal onJoin={handleJoin} onClose={() => setShowJoin(false)} />
        )}
      </Page>
    </DisplayNamesProvider>
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
  margin-bottom: 24px;
  h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: ${C.ink}; }
  .actions { display: flex; gap: 8px; }
`;
// Positioning context for the display-name gate overlay: it covers the content
// but leaves the top bar (Sign out) reachable.
const Content = styled.div`position: relative;`;
const Hint = styled.p`font-size: 14px; color: ${C.muted}; padding: 8px 2px; text-align: center;`;
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
const NameField = styled.input`
  width: 100%;
  margin-bottom: 16px;
  padding: 10px 12px; font-size: 14px; text-align: center;
  color: ${C.ink}; background: ${C.paper};
  border: 1px solid ${C.line}; border-radius: 10px; outline: none;
  &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
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
