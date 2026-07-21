import React, { useState } from 'react';
import styled from 'styled-components';
import { C } from '../../theme';
import { APP_DISPLAY_NAME } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import { DisplayNamesProvider } from '../../components/MemberLabel';
import { DisplayNameGate } from '../../components/DisplayNameGate';
import WorkspaceChrome from '../../components/WorkspaceChrome';
import SettingsPanel from '../../components/SettingsPanel';
import RoomGate from '../../components/RoomGate';
import LobbyView from '../../components/LobbyView';
import BoardView from '../../components/BoardView';

/**
 * Rooms-topology app view: chrome + a lobby/gate/domain switch. The active
 * room (a Ludo match) IS the base workspace context (ws.contextId resolves to
 * it, or to the directory while in the lobby). No active match -> LobbyView
 * (open matches + group leaderboard); match active but not seated 4/4 ->
 * RoomGate (waiting room); started -> BoardView (the live game).
 */
export default function AppPage() {
  const ws = useWorkspace();

  const [wsName, setWsName] = useState('My friend group');
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // No namespace yet (fresh web session): offer create-or-join, verbatim from
  // single/multi. workspace-ready renders once the NAMESPACE exists (below) -
  // NOT once a room is active - so the base e2e helpers work unchanged.
  if (!ws.namespaceId && !ws.loading) {
    return (
      <Empty>
        <Card>
          <h2>Welcome to {APP_DISPLAY_NAME}</h2>
          <p>Gather your friend group to start hosting Ludo matches, or join a group you were invited to.</p>
          <NameField
            data-testid="field-workspace-name"
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            placeholder="Workspace name"
            maxLength={64}
            aria-label="Workspace name"
          />
          <Row>
            <Primary data-testid="create-workspace-btn" onClick={() => { void ws.bootstrap(wsName).catch(() => {}); }}>Create workspace</Primary>
            <Secondary data-testid="open-join-btn" onClick={() => setShowJoin(true)}>Join with invitation</Secondary>
          </Row>
          {ws.error && <ErrLine>{describeError(ws.error)}</ErrLine>}
        </Card>
        {showJoin && (
          <JoinModal onJoin={async (code) => { await ws.join(code); setShowJoin(false); }} onClose={() => setShowJoin(false)} />
        )}
      </Empty>
    );
  }

  return (
    <DisplayNamesProvider namespaceId={ws.namespaceId} contextId={ws.contextId} selfIdentity={ws.executorPublicKey}>
      <Page data-testid="workspace-ready">
        <WorkspaceChrome
          ws={ws}
          onOpenInvite={() => setShowInvite(true)}
          onOpenJoin={() => setShowJoin(true)}
          onOpenSettings={() => setShowSettings(true)}
        />
        <Content>
          {ws.activeRoomId && (
            <RoomBar>
              <LeaveBtn data-testid="leave-room-btn" onClick={() => ws.selectRoom(null)}>&larr; Lobby</LeaveBtn>
            </RoomBar>
          )}
          {!ws.activeRoomId ? (
            <LobbyView ws={ws} />
          ) : !ws.started ? (
            <RoomGate ws={ws} />
          ) : (
            <BoardView ws={ws} />
          )}
          <DisplayNameGate injected={ws.injectedContext} />
        </Content>

        {showInvite && <InviteModal onInvite={ws.invite} onClose={() => setShowInvite(false)} />}
        {showJoin && <JoinModal onJoin={async (code) => { await ws.join(code); setShowJoin(false); }} onClose={() => setShowJoin(false)} />}
        {showSettings && <SettingsPanel ws={ws} onClose={() => setShowSettings(false)} />}
      </Page>
    </DisplayNamesProvider>
  );
}

const Page = styled.div`max-width: 960px; margin: 0 auto; padding: 28px 20px 64px; width: 100%;`;
const Content = styled.div`position: relative;`;
const RoomBar = styled.div`display: flex; justify-content: flex-end; margin-bottom: 12px;`;
const LeaveBtn = styled.button`
  padding: 7px 14px; font-size: 12.5px; font-weight: 600; border-radius: 9px; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  &:hover { background: ${C.paper2}; border-color: ${C.green}; }
`;
const ErrLine = styled.p`margin: 8px 0; font-size: 13px; color: ${C.danger};`;
const Empty = styled.div`flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px;`;
const Card = styled.div`
  max-width: 420px; text-align: center; padding: 32px 28px; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 18px;
  h2 { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; color: ${C.ink}; margin-bottom: 8px; }
  p { font-size: 14px; color: ${C.muted}; margin-bottom: 22px; line-height: 1.55; }
`;
const Row = styled.div`display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;`;
const NameField = styled.input`
  width: 100%; margin-bottom: 16px; padding: 10px 12px; font-size: 14px; text-align: center;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 10px; outline: none;
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
