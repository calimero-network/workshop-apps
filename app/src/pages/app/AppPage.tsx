import React, { useState } from 'react';
import styled from 'styled-components';
import { C } from '../../theme';
import { APP_DISPLAY_NAME } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useCrm } from '../../hooks/useCrm';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import { DisplayNamesProvider } from '../../components/MemberLabel';
import { DisplayNameGate } from '../../components/DisplayNameGate';
import WorkspaceChrome from '../../components/WorkspaceChrome';
import SettingsPanel from '../../components/SettingsPanel';
import ContactsView from './ContactsView';
import PipelineView from './PipelineView';

type ViewKey = 'contacts' | 'pipeline';
const NAV: { key: ViewKey; label: string; icon: string }[] = [
  { key: 'contacts', label: 'Contacts', icon: '👤' },
  { key: 'pipeline', label: 'Pipeline', icon: '📊' },
];

export default function AppPage() {
  const ws = useWorkspace();
  const crm = useCrm({ contextId: ws.contextId, executorPublicKey: ws.executorPublicKey });

  const [wsName, setWsName] = useState('My sales team');
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [view, setView] = useState<ViewKey>('contacts');

  // No workspace yet (fresh web session): offer create-or-join.
  if (!ws.ready && !ws.loading) {
    return (
      <Empty>
        <Card>
          <h2>Welcome to {APP_DISPLAY_NAME}</h2>
          <p>Create a workspace for your sales team, or join one you were invited to.</p>
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
        <WorkspaceChrome
          ws={ws}
          onOpenInvite={() => setShowInvite(true)}
          onOpenJoin={() => setShowJoin(true)}
          onOpenSettings={() => setShowSettings(true)}
        />

        <Content>
          <Body>
            <Sidebar>
              {NAV.map((n) => (
                <NavItem
                  key={n.key}
                  data-testid={`nav-${n.key}`}
                  $active={view === n.key}
                  onClick={() => setView(n.key)}
                >
                  <span className="ic">{n.icon}</span>{n.label}
                </NavItem>
              ))}
            </Sidebar>

            <Main>
              {view === 'contacts' ? (
                <ContactsView
                  contacts={crm.contacts}
                  addContact={crm.addContact}
                  interactions={crm.interactions}
                  selectedId={crm.selectedContactId}
                  onSelectContact={crm.selectContact}
                  logInteraction={crm.logInteraction}
                  editInteraction={crm.editInteraction}
                  deleteInteraction={crm.deleteInteraction}
                  selfIdentity={ws.executorPublicKey}
                />
              ) : (
                <PipelineView
                  contacts={crm.contacts}
                  deals={crm.deals}
                  createDeal={crm.createDeal}
                  updateDealStage={crm.updateDealStage}
                  setContractDetails={crm.setContractDetails}
                />
              )}
              {crm.error && <ErrLine>{describeError(crm.error)}</ErrLine>}
            </Main>
          </Body>

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
        {showSettings && (
          <SettingsPanel ws={ws} onClose={() => setShowSettings(false)} />
        )}
      </Page>
    </DisplayNamesProvider>
  );
}

const Page = styled.div`
  max-width: var(--c-app-max, 1100px);
  margin: 0 auto;
  padding: 28px 20px 64px;
  width: 100%;
`;
// Positioning context for the display-name gate overlay: it covers the content
// but leaves the chrome bar (Settings, etc.) reachable.
const Content = styled.div`position: relative;`;
const Body = styled.div`
  display: flex;
  gap: 22px;
  align-items: flex-start;
  @media (max-width: 760px) { flex-direction: column; }
`;
const Sidebar = styled.nav`
  flex: 0 0 var(--c-app-rail, 220px);
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: sticky;
  top: 12px;
  @media (max-width: 760px) { position: static; flex-direction: row; width: 100%; }
`;
const NavItem = styled.button<{ $active: boolean }>`
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; font-size: 14px; font-weight: 600; text-align: left;
  border-radius: 10px; cursor: pointer; border: 1px solid transparent;
  color: ${(p) => (p.$active ? C.accentInk : C.ink)};
  background: ${(p) => (p.$active ? C.accent : 'transparent')};
  transition: background 0.15s, border-color 0.15s;
  .ic { font-size: 15px; }
  &:hover { ${(p) => (p.$active ? '' : `background: ${C.paper2}; border-color: ${C.line};`)} }
`;
const Main = styled.div`flex: 1; min-width: 0;`;
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
