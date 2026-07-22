import React, { useState } from 'react';
import styled from 'styled-components';
import { C } from '../../theme';
import { APP_DISPLAY_NAME } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useItems } from '../../hooks/useItems';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import { DisplayNamesProvider, MemberLabel } from '../../components/MemberLabel';
import { DisplayNameGate } from '../../components/DisplayNameGate';
import WorkspaceChrome from '../../components/WorkspaceChrome';
import SettingsPanel from '../../components/SettingsPanel';
import UnitRail from '../../components/UnitRail';

/**
 * Multi-topology app view: chrome + a sibling-unit rail + the active unit's
 * CRUD. Each unit is an independent context (instance) of the one service.
 *
 * BUILD AGENT: reshape `useItems` -> your domain hook and the form/list -> your
 * entity, exactly as in the single scaffold. Keep the workspace gating, the
 * UnitRail, the WorkspaceChrome wiring, and the live list - these make the app
 * multi-user + multi-space out of the box. A "unit" is a board/project/trip/...
 * - rename the copy, not the structure.
 */
export default function AppPage() {
  const ws = useWorkspace();
  const items = useItems({ contextId: ws.contextId, executorPublicKey: ws.executorPublicKey });

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [wsName, setWsName] = useState('My workspace');
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guard here too: pressing Enter submits the form even while the Add button
    // is disabled, so without this a not-ready add() could throw unhandled.
    if (!title.trim() || !items.ready) return;
    try {
      await items.add(title.trim(), body.trim());
      setTitle('');
      setBody('');
    } catch { /* surfaced via items.error */ }
  };

  // No namespace yet (fresh web session): offer create-or-join. workspace-ready
  // renders once the NAMESPACE exists (below), so the base e2e helpers work.
  if (!ws.namespaceId && !ws.loading) {
    return (
      <Empty>
        <Card>
          <h2>Welcome to {APP_DISPLAY_NAME}</h2>
          <p>Create a workspace to start, or join one you were invited to.</p>
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

  // Namespace still resolving (initial load / SSO callback lookup): don't render
  // the workspace-ready chrome with a null namespace - wait for it to settle.
  if (!ws.namespaceId) {
    return <Empty><Card><p>Loading your workspace…</p></Card></Empty>;
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
        <Layout>
          {/* A callback/SSO session is pinned to the injected context, so unit
              switching/creation is disabled there (see useWorkspace switchNamespace
              /leaveWorkspace) - don't show a rail that can't change the view. */}
          {!ws.injectedContext && <UnitRail ws={ws} />}
          <Content>
            {!ws.activeUnitId ? (
              <Hint>Create or pick a space in the rail to get started.</Hint>
            ) : (
              <>
                <Form onSubmit={submit}>
                  <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
                  <input placeholder="Details (optional)" value={body} onChange={(e) => setBody(e.target.value)} />
                  <Primary type="submit" disabled={!title.trim() || !items.ready}>Add</Primary>
                </Form>
                {items.error && <ErrLine>{describeError(items.error)}</ErrLine>}
                <List>
                  {items.items.length === 0 && !items.loading && <Hint>No items yet - add the first one above.</Hint>}
                  {items.items.map((item) => (
                    <ItemRow key={item.id}>
                      <div className="text">
                        <strong>{item.title}</strong>
                        {item.body && <span>{item.body}</span>}
                        <Byline><MemberLabel memberId={item.author} /></Byline>
                      </div>
                      <button onClick={() => items.remove(item.id)} aria-label="Delete">x</button>
                    </ItemRow>
                  ))}
                </List>
              </>
            )}
            <DisplayNameGate injected={ws.injectedContext} />
          </Content>
        </Layout>

        {showInvite && <InviteModal onInvite={ws.invite} onClose={() => setShowInvite(false)} />}
        {showJoin && <JoinModal onJoin={async (code) => { await ws.join(code); setShowJoin(false); }} onClose={() => setShowJoin(false)} />}
        {showSettings && <SettingsPanel ws={ws} onClose={() => setShowSettings(false)} />}
      </Page>
    </DisplayNamesProvider>
  );
}

const Page = styled.div`max-width: 960px; margin: 0 auto; padding: 28px 20px 64px; width: 100%;`;
const Layout = styled.div`
  display: flex; gap: 20px; position: relative;
  @media (max-width: 640px) { flex-direction: column; }
`;
const Content = styled.div`flex: 1; min-width: 0; position: relative;`;
const Byline = styled.span`font-size: 11.5px; color: ${C.mutedSoft};`;
const Form = styled.form`
  display: flex; gap: 8px; margin-bottom: 22px; flex-wrap: wrap;
  input { flex: 1; min-width: 160px; padding: 10px 12px; font-size: 14px; color: ${C.ink}; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 10px; outline: none; &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); } }
`;
const List = styled.div`display: flex; flex-direction: column; gap: 10px;`;
const ItemRow = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 16px; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 12px;
  .text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .text strong { font-size: 15px; color: ${C.ink}; }
  .text span { font-size: 13px; color: ${C.muted}; }
  button { flex-shrink: 0; width: 30px; height: 30px; font-size: 20px; line-height: 1; color: ${C.mutedSoft}; background: transparent; border: none; border-radius: 8px; cursor: pointer; &:hover { background: ${C.paper}; color: ${C.danger}; } }
`;
const Hint = styled.p`font-size: 14px; color: ${C.muted}; padding: 8px 2px;`;
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
  color: ${C.accentInk}; background: ${C.accent}; border: 1px solid var(--c-accent);
  transition: filter 0.18s, transform 0.15s;
  &:hover:not(:disabled) { filter: brightness(1.06); transform: translateY(-1px); }
  &:disabled { opacity: 0.55; cursor: default; }
`;
const Secondary = styled.button`
  padding: 10px 16px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  transition: background 0.15s, border-color 0.15s;
  &:hover { background: ${C.paper2}; border-color: ${C.green}; }
`;
