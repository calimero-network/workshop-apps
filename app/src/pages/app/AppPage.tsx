import React, { useState } from 'react';
import styled from 'styled-components';
import { NavLink, Outlet } from 'react-router-dom';
import { useMero } from '@calimero-network/mero-react';
import { C } from '../../theme';
import { APP_DISPLAY_NAME, APP_ROUTE } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import { DisplayNamesProvider } from '../../components/MemberLabel';
import { DisplayNameGate } from '../../components/DisplayNameGate';

/**
 * Workspace shell for IncidentFlow.
 *
 * Renders the workspace create/join gate, the top bar (nav +
 * Invite/Join/Sign out), and an <Outlet/> for the three spec views
 * (DashboardView / IncidentDetailView / PostmortemsView routed in App.tsx).
 * The views are wired to the incident-tracker service via `useIncidents` /
 * `useComments` / `usePostmortems`, which wrap the generated
 * `IncidentTrackerClient` the same way `useItems` wraps `ServiceClient`.
 *
 * Keep: workspace resolution (bootstrap/join), the Invite/Join wiring, and the
 * `workspace-ready` testid the e2e collaboration helpers wait on.
 */
export default function AppPage() {
  const { logout } = useMero();
  const ws = useWorkspace();

  const [wsName, setWsName] = useState('My response team');
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // No workspace yet (fresh web session): offer create-or-join.
  if (!ws.ready && !ws.loading) {
    return (
      <Empty>
        <Card>
          <h2>Welcome to {APP_DISPLAY_NAME}</h2>
          <p>Create your team's incident tracker, or join one you were invited to.</p>
          <NameField
            data-testid="field-workspace-name"
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            placeholder="Team name"
            maxLength={64}
            aria-label="Team name"
          />
          <Row>
            <Primary data-testid="create-workspace-btn" onClick={() => ws.bootstrap(wsName)}>Create workspace</Primary>
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
    <DisplayNamesProvider
      namespaceId={ws.namespaceId}
      contextId={ws.contextId}
      selfIdentity={ws.executorPublicKey}
    >
      <Page data-testid="workspace-ready">
        <Bar>
          <h1>{APP_DISPLAY_NAME}</h1>
          <Tabs>
            <NavLink to={APP_ROUTE} end>Dashboard</NavLink>
            <NavLink to={`${APP_ROUTE}/postmortems`}>Postmortems</NavLink>
          </Tabs>
          <div className="actions">
            <Secondary data-testid="open-invite-btn" onClick={() => setShowInvite(true)}>Invite</Secondary>
            <Secondary data-testid="open-join-btn" onClick={() => setShowJoin(true)}>Join</Secondary>
            <Secondary onClick={logout}>Sign out</Secondary>
          </div>
        </Bar>

        <Content>
          <Outlet context={ws} />

          {/* Blocks the content (not the top bar) until a name is set. Never
              shown on the injected/SSO path (desktop + e2e). */}
          <DisplayNameGate injected={ws.injectedContext} />
        </Content>

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
    </DisplayNamesProvider>
  );
}

const Page = styled.div`
  max-width: 920px;
  margin: 0 auto;
  padding: 28px 20px 64px;
  width: 100%;
`;
const Bar = styled.header`
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: ${C.ink}; }
  .actions { display: flex; gap: 8px; margin-left: auto; }
`;
const Tabs = styled.nav`
  display: flex;
  gap: 4px;
  a {
    padding: 8px 14px;
    font-size: 13.5px;
    font-weight: 600;
    color: ${C.muted};
    text-decoration: none;
    border-radius: 9px;
    transition: background 0.15s, color 0.15s;
    &:hover { background: ${C.paper2}; color: ${C.ink}; }
    &.active { background: ${C.paper2}; color: ${C.ink}; }
  }
`;
// Positioning context for the display-name gate overlay: it covers the content
// but leaves the top bar (Sign out) reachable.
const Content = styled.div`position: relative;`;
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

export const Primary = styled.button`
  display: inline-flex; align-items: center; justify-content: center;
  padding: 10px 18px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c;
  transition: background 0.18s, transform 0.15s;
  &:hover:not(:disabled) { background: ${C.greenHover}; transform: translateY(-1px); }
  &:disabled { opacity: 0.55; cursor: default; }
`;
export const Secondary = styled.button`
  padding: 10px 16px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  transition: background 0.15s, border-color 0.15s;
  &:hover { background: ${C.paper2}; border-color: ${C.green}; }
`;
