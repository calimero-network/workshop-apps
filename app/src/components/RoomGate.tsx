import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { C } from '../theme';
import type { UseWorkspaceReturn } from '../hooks/useWorkspace';
import { describeError } from '../utils/errors';
import InviteModal from './InviteModal';

interface Props {
  ws: UseWorkspaceReturn;
}

/**
 * SCAFFOLD-OWNED start gate: shown while the active room hasn't met its
 * member threshold. Grounded in the battleships match-gate view - the invite
 * reuses the base InviteModal (it mints a namespace invite - a restricted
 * room still lives inside the shared namespace; an owner adding one specific
 * identity to the room instead uses Settings -> Members). Once `ws.started`,
 * the parent (AppPage) swaps this out for the domain view - this component
 * never checks `started` itself.
 *
 * `joinPhase === 'failed'` must render a retry, never an endless spinner - a
 * restricted room you weren't added to fails on the very first click.
 */
export default function RoomGate({ ws }: Props): React.ReactElement {
  const [showInvite, setShowInvite] = useState(false);
  const busy = ws.joinPhase === 'connecting' || ws.joinPhase === 'joining' || ws.joinPhase === 'syncing';
  const failed = ws.joinPhase === 'failed';

  return (
    <Wrap data-testid="room-gate">
      {busy && <Spinner aria-hidden="true" />}
      <h2>Waiting for players</h2>
      <Count data-testid="room-gate-count">{ws.memberCount}/{ws.minMembers}</Count>
      <p>The match starts the moment all {ws.minMembers} seats are filled - everyone's tokens go home together.</p>
      {failed && (
        <>
          {ws.error && <ErrLine role="alert">{describeError(ws.error)}</ErrLine>}
          {ws.activeRoomId && (
            <RetryBtn data-testid="room-join-retry-btn" onClick={() => void ws.joinRoom(ws.activeRoomId as string)}>
              Retry
            </RetryBtn>
          )}
        </>
      )}
      <InviteBtn data-testid="room-invite-btn" onClick={() => setShowInvite(true)}>Invite friends</InviteBtn>
      {showInvite && <InviteModal onInvite={ws.invite} onClose={() => setShowInvite(false)} />}
    </Wrap>
  );
}

const spin = keyframes`to { transform: rotate(360deg); }`;

const Wrap = styled.div`
  max-width: 420px; margin: 40px auto; text-align: center; padding: 32px 28px;
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 18px;
  h2 { font-size: 18px; font-weight: 800; letter-spacing: -0.3px; color: ${C.ink}; margin: 12px 0 6px; }
  p { font-size: 13.5px; color: ${C.muted}; line-height: 1.55; margin-bottom: 22px; }
`;
const ErrLine = styled.p`font-size: 12.5px; color: ${C.danger}; margin: -14px 0 16px;`;
const RetryBtn = styled.button`
  padding: 9px 16px; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; margin-bottom: 10px;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  &:hover { background: ${C.paper2}; border-color: ${C.green}; }
`;
const Spinner = styled.span`
  display: inline-block; width: 26px; height: 26px;
  border: 3px solid ${C.line}; border-top-color: ${C.green}; border-radius: 50%;
  animation: ${spin} 0.7s linear infinite;
`;
const Count = styled.div`font-size: 26px; font-weight: 800; color: ${C.greenInk}; letter-spacing: -0.5px;`;
const InviteBtn = styled.button`
  display: inline-flex; align-items: center; justify-content: center;
  padding: 10px 18px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c;
  transition: background 0.18s, transform 0.15s;
  &:hover { background: ${C.greenHover}; transform: translateY(-1px); }
`;
