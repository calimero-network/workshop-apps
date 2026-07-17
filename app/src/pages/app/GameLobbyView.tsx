import React, { useEffect } from 'react';
import styled from 'styled-components';
import { useGroupMembers } from '@calimero-network/mero-react';
import { C } from '../../theme';
import { MemberLabel } from '../../components/MemberLabel';
import { describeError } from '../../utils/errors';

/**
 * GameLobbyView — shown once the shared workspace/context exists but the
 * `Game` is still in its `"pending"` placeholder state (`create_game` hasn't
 * been called yet).
 *
 * The backend's `create_game(opponent)` takes the opponent's real identity
 * (their base58 executor id), not a free-text name — so the host can't create
 * the match until their invited friend has actually joined the shared
 * context. Namespace membership changes don't ding the SSE channel
 * (documented mero-react gap), so we poll `useGroupMembers` on a short
 * interval while the host is waiting. Once the friend appears in the member
 * list, the host picks them to start the game as White; the friend becomes
 * Black.
 */
interface GameLobbyViewProps {
  namespaceId: string | null;
  isHost: boolean;
  creating: boolean;
  error: Error | null;
  onStart: (opponentIdentity: string) => void;
}

export default function GameLobbyView({
  namespaceId,
  isHost,
  creating,
  error,
  onStart,
}: GameLobbyViewProps) {
  const { members, refetch } = useGroupMembers(namespaceId);

  useEffect(() => {
    if (!namespaceId || !isHost) return;
    const id = setInterval(() => { void refetch(); }, 5000);
    return () => clearInterval(id);
  }, [namespaceId, isHost, refetch]);

  const opponent = members[0] ?? null;

  return (
    <Card data-testid="game-lobby">
      <h2>Game lobby</h2>
      {isHost ? (
        opponent ? (
          <>
            <p>
              <MemberLabel memberId={opponent.identity} showYou={false} /> has joined — start the
              match whenever you&apos;re ready. You&apos;ll play White.
            </p>
            <Primary
              data-testid="action-create_game"
              onClick={() => onStart(opponent.identity)}
              disabled={creating}
            >
              {creating ? 'Starting…' : 'Start game'}
            </Primary>
          </>
        ) : (
          <p>Waiting for your opponent to join — share an invite code above.</p>
        )
      ) : (
        <p>You&apos;re in the workspace. Waiting for the host to start the game…</p>
      )}
      {error && <ErrLine>{describeError(error)}</ErrLine>}
    </Card>
  );
}

const Card = styled.div`
  max-width: 460px;
  margin: 48px auto;
  text-align: center;
  padding: 32px 28px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 18px;
  h2 { font-size: 19px; font-weight: 800; color: ${C.ink}; margin-bottom: 12px; }
  p { font-size: 14px; color: ${C.muted}; line-height: 1.55; margin-bottom: 16px; }
`;
const Primary = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 11px 20px;
  font-size: 13.5px;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  color: ${C.onAccent};
  background: ${C.green};
  border: 1px solid #93e60c;
  transition: background 0.18s, transform 0.15s;
  &:hover:not(:disabled) { background: ${C.greenHover}; transform: translateY(-1px); }
  &:disabled { opacity: 0.55; cursor: default; }
`;
const ErrLine = styled.p`color: ${C.danger} !important;`;
