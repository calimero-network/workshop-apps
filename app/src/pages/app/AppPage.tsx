import React, { useState } from 'react';
import styled from 'styled-components';
import { C } from '../../theme';
import { APP_DISPLAY_NAME } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useItems } from '../../hooks/useItems';
import { useFeedback } from '../../components/Feedback';
import { useArrivalAnnouncer } from '../../hooks/useArrivalAnnouncer';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import { DisplayNamesProvider, MemberLabel } from '../../components/MemberLabel';
import { DisplayNameGate } from '../../components/DisplayNameGate';
import WorkspaceChrome from '../../components/WorkspaceChrome';
import { Card, Empty, Primary, Secondary, ErrLine, Hint, NARROW, focusRing, tapTarget, Skeleton, EmptyState } from '../../components/primitives';
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
  const { notify } = useFeedback();
  const ws = useWorkspace();
  const items = useItems({ contextId: ws.contextId, executorPublicKey: ws.executorPublicKey });

  // A peer's row must reach a screen reader; notify() only covers your own writes.
  useArrivalAnnouncer(items.items, ws.executorPublicKey);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [wsName, setWsName] = useState('My workspace');
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guard here too: pressing Enter submits the form even while the Add button
    // is disabled, so without this a not-ready add() could throw unhandled.
    if (!title.trim() || !items.ready || saving) return;
    setSaving(true);
    try {
      await items.add(title.trim(), body.trim());
      setTitle('');
      setBody('');
      notify('Item added');
    } catch (err) {
      notify(describeError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await items.remove(id);
      notify('Item removed');
    } catch (err) {
      notify(describeError(err), 'error');
    }
  };

  // No namespace yet (fresh web session): offer create-or-join. workspace-ready
  // renders once the NAMESPACE exists (below), so the base e2e helpers work.
  if (!ws.namespaceId && !ws.loading) {
    return (
      <Empty>
        <Card>
          <h2>Welcome to {APP_DISPLAY_NAME}</h2>
          <p>Create a workspace to start, or join one you were invited to.</p>
          <WorkspaceNameField
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
                  <Primary type="submit" disabled={!title.trim() || !items.ready || saving}>{saving ? 'Adding…' : 'Add'}</Primary>
                </Form>
                {items.error && <ErrLine>{describeError(items.error)}</ErrLine>}
                <List>
                  {items.loading && items.items.length === 0 && (
                    <>
                      <Skeleton /><Skeleton /><Skeleton />
                    </>
                  )}
                  {items.items.length === 0 && !items.loading && (
                    <EmptyState>
                      <h3>Nothing here yet</h3>
                      <p>Add the first one using the form above and everyone in this workspace sees it straight away.</p>
                    </EmptyState>
                  )}
                  {items.items.map((item) => (
                    <ItemRow key={item.id}>
                      <div className="text">
                        <strong>{item.title}</strong>
                        {item.body && <span>{item.body}</span>}
                        <Byline><MemberLabel memberId={item.author} /></Byline>
                      </div>
                      <button onClick={() => void remove(item.id)} aria-label="Delete">x</button>
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

const Page = styled.div`
  max-width: var(--c-app-max); margin: 0 auto;
  padding: var(--c-space-7) var(--c-space-5) var(--c-space-16);
  width: 100%;
`;
const Layout = styled.div`
  display: flex; gap: var(--c-space-5); position: relative;
  @media ${NARROW} { flex-direction: column; }
`;
const Content = styled.div`flex: 1; min-width: 0; position: relative;`;
const Byline = styled.span`font-size: var(--c-text-sm); color: ${C.mutedSoft};`;
const Form = styled.form`
  display: flex; gap: var(--c-space-2); margin-bottom: var(--c-space-6); flex-wrap: wrap;
  input {
    flex: 1; min-width: 160px;
    padding: var(--c-space-2) var(--c-space-3);
    font-family: inherit; font-size: var(--c-text-base);
    color: ${C.ink}; background: ${C.paper2};
    border: 1px solid ${C.line}; border-radius: var(--c-radius-sm); outline: none;
    ${focusRing}
  }
  @media ${NARROW} { flex-direction: column; align-items: stretch; }
`;
const List = styled.div`display: flex; flex-direction: column; gap: var(--c-space-3);`;
const ItemRow = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: var(--c-space-3);
  padding: var(--c-space-4) var(--c-space-4); background: ${C.paper2};
  border: 1px solid ${C.line}; border-radius: var(--c-radius-md);
  .text { display: flex; flex-direction: column; gap: var(--c-space-1); min-width: 0; }
  .text strong { font-size: var(--c-text-base); color: ${C.ink}; }
  .text span { font-size: var(--c-text-base); color: ${C.muted}; }
  button {
    ${tapTarget}
    flex-shrink: 0; width: 30px; height: 30px;
    font-size: var(--c-text-lg); line-height: 1;
    color: ${C.mutedSoft}; background: transparent; border: none;
    border-radius: var(--c-radius-sm); cursor: pointer;
    transition: background var(--c-duration-fast) var(--c-ease), color var(--c-duration-fast) var(--c-ease);
    &:hover { background: ${C.paper}; color: ${C.danger}; }
    ${focusRing}
  }
`;
const Row = styled.div`display: flex; gap: var(--c-space-3); justify-content: center; flex-wrap: wrap;`;
const WorkspaceNameField = styled.input`
  width: 100%; margin-bottom: var(--c-space-4);
  padding: var(--c-space-2) var(--c-space-3);
  font-family: inherit; font-size: var(--c-text-base); text-align: center;
  color: ${C.ink}; background: ${C.paper};
  border: 1px solid ${C.line}; border-radius: var(--c-radius-sm); outline: none;
  ${focusRing}
`;
