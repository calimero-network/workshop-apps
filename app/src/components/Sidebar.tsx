import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { C, useTheme, MoonIcon } from '../theme';
import { useMero, CalimeroLogo, type GroupMember } from '@calimero-network/mero-react';
import type { LobbyRecord } from '../hooks/useChatLobby';
import MemberPopup from './MemberPopup';

const MAX_NAME_LEN = 20;
const DOCS_URL = 'https://docs.calimero.network';

interface SidebarProps {
  // Workspace selector
  workspaces: LobbyRecord[];
  selectedNamespaceId: string | null;
  onSelectWorkspace: (nsId: string) => void;
  onCreateWorkspace: () => void;
  workspaceAlias?: string;

  // Member directory
  members: GroupMember[];
  selfIdentity: string | null;
  onInvite: () => void;

  // Admin actions
  viewerIsAdmin: boolean;
  onSetMemberRole: (identity: string, role: 'Admin' | 'Member') => Promise<void>;
  onRemoveMember: (identity: string) => Promise<void>;

  // Layout
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

function initialOf(label: string): string {
  const ch = label.trim().charAt(0);
  return ch ? ch.toUpperCase() : '?';
}

export default function Sidebar({
  workspaces,
  selectedNamespaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  workspaceAlias,
  members,
  selfIdentity,
  onInvite,
  viewerIsAdmin,
  onSetMemberRole,
  onRemoveMember,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const navigate = useNavigate();
  const { logout } = useMero();
  const { theme, toggle: toggleTheme } = useTheme();

  const [popupMember, setPopupMember] = useState<
    { identity: string; alias?: string; role?: string; online: boolean; isSelf: boolean } | null
  >(null);

  const memberCount = members.length + (selfIdentity ? 1 : 0);

  const backToLanding = () => { logout(); navigate('/', { replace: true }); };
  const openDocs = () => window.open(DOCS_URL, '_blank', 'noopener,noreferrer');

  /* Collapsed rail */
  if (collapsed) {
    return (
      <Rail>
        <RailBtn onClick={onToggleCollapse} title="Expand sidebar" aria-label="Expand sidebar">
          <Chevron dir="right" />
        </RailBtn>
        <span className="logo"><CalimeroLogo size={22} color={C.greenInk} /></span>
        <RailBtn onClick={onInvite} title="Invite member" aria-label="Invite member"><PlusIcon /></RailBtn>
        <div className="spacer" />
        <RailBtn onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme"><MoonIcon filled={theme === 'dark'} /></RailBtn>
        <RailBtn onClick={openDocs} title="Docs" aria-label="Docs"><BookIcon /></RailBtn>
        <RailBtn className="danger" onClick={backToLanding} title="Log out" aria-label="Log out"><LogoutIcon /></RailBtn>
      </Rail>
    );
  }

  return (
    <Root>
      {/* Workspace header */}
      <Header>
        <div className="info">
          <h2 title={workspaceAlias || 'Ranked Vote'}>{workspaceAlias || 'Ranked Vote'}</h2>
          <span className="count">{memberCount} member{memberCount === 1 ? '' : 's'}</span>
        </div>
        <IconBtn onClick={onToggleCollapse} title="Collapse sidebar" aria-label="Collapse sidebar">
          <Chevron dir="left" />
        </IconBtn>
      </Header>

      <Scroll>
        {/* Workspace list */}
        <Block>
          <Label>Workspaces</Label>
          {workspaces.map((ws) => (
            <Row
              key={ws.namespaceId}
              $active={ws.namespaceId === selectedNamespaceId}
              onClick={() => onSelectWorkspace(ws.namespaceId)}
              title={ws.alias || ws.namespaceId}
            >
              {ws.alias || shortenId(ws.namespaceId)}
            </Row>
          ))}
          <AddRow onClick={onCreateWorkspace} title="Create a new workspace">+ New workspace</AddRow>
        </Block>

        {/* Members */}
        <Block>
          <Label>Members</Label>

          {/* Self */}
          {selfIdentity && (
            <MemberRow
              $clickable
              title="View your identity"
              onClick={() => setPopupMember({ identity: selfIdentity, alias: undefined, role: 'You', online: true, isSelf: true })}
            >
              <Avatar $online>
                {initialOf(shortenId(selfIdentity))}
              </Avatar>
              <span className="name">{shortenId(selfIdentity)}</span>
              <span className="you">you</span>
            </MemberRow>
          )}

          {/* Other members */}
          {members.map((m) => {
            const label = m.name || shortenId(m.identity);
            return (
              <MemberRow
                key={m.identity}
                $clickable
                title="View identity"
                onClick={() => setPopupMember({ identity: m.identity, alias: m.name, role: m.role, online: false, isSelf: false })}
              >
                <Avatar $online={false}>{initialOf(label)}</Avatar>
                <span className="name">{label}</span>
                <KeyHint aria-hidden>↗</KeyHint>
              </MemberRow>
            );
          })}
        </Block>

        {/* Actions */}
        <ActionBar>
          <PrimaryBtn onClick={onInvite}>Invite</PrimaryBtn>
        </ActionBar>
      </Scroll>

      {/* Footer */}
      <Footer>
        <div className="links">
          <a href={DOCS_URL} target="_blank" rel="noreferrer">Docs ↗</a>
          <button onClick={backToLanding}>Back to landing</button>
          <ThemeToggle onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-label="Toggle theme">
            <MoonIcon filled={theme === 'dark'} size={16} />
          </ThemeToggle>
        </div>
        <LogoutBtn onClick={backToLanding}><LogoutIcon /> Log out</LogoutBtn>
      </Footer>

      {popupMember && (
        <MemberPopup
          identity={popupMember.identity}
          alias={popupMember.alias}
          role={popupMember.role}
          online={popupMember.online}
          isSelf={popupMember.isSelf}
          canManage={viewerIsAdmin}
          onSetRole={(role) => onSetMemberRole(popupMember.identity, role)}
          onRemove={() => onRemoveMember(popupMember.identity)}
          onClose={() => setPopupMember(null)}
        />
      )}
    </Root>
  );
}

/* ── icons ── */
function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
  );
}
const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
);
const BookIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
);
const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
);

/* ── styles ── */
const sidebarFont = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased;`;

const Root = styled.div`
  width: 264px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: ${C.paper};
  border-right: 1px solid ${C.line};
  ${sidebarFont}
`;
const Rail = styled.div`
  width: 56px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  background: ${C.paper};
  border-right: 1px solid ${C.line};
  ${sidebarFont}
  .logo { display: flex; margin: 4px 0 6px; }
  .spacer { flex: 1; }
`;
const RailBtn = styled.button`
  width: 38px; height: 38px;
  display: grid; place-items: center;
  color: ${C.ink};
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.14s, color 0.14s, border-color 0.14s;
  &:hover { background: ${C.paper2}; border-color: ${C.line}; }
  &.danger:hover { color: ${C.danger}; background: rgba(210,59,47,0.08); border-color: rgba(210,59,47,0.25); }
`;
const Header = styled.div`
  padding: 14px 14px 14px 16px;
  border-bottom: 1px solid ${C.line};
  display: flex;
  align-items: center;
  gap: 8px;
  .info { min-width: 0; flex: 1; }
  h2 {
    font-size: 15px; font-weight: 800; letter-spacing: -0.4px; color: ${C.ink};
    margin: 0 0 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .count { font-size: 12.5px; color: ${C.mutedSoft}; }
`;
const IconBtn = styled.button`
  flex-shrink: 0;
  width: 32px; height: 32px;
  display: grid; place-items: center;
  color: ${C.muted};
  background: transparent;
  border: 1px solid ${C.line};
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.14s, color 0.14s, border-color 0.14s;
  &:hover { background: ${C.paper2}; color: ${C.ink}; border-color: ${C.lineDark}; }
`;
const Scroll = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  min-height: 0;
`;
const Block = styled.div`
  padding: 10px 8px;
  border-bottom: 1px solid ${C.line};
`;
const Label = styled.div`
  font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
  color: ${C.mutedSoft}; margin: 0 0 8px; padding-left: 8px;
`;
const Row = styled.div<{ $active?: boolean }>`
  padding: 7px 10px; border-radius: 9px; cursor: pointer; font-size: 13px;
  font-weight: ${(p) => (p.$active ? 600 : 500)};
  color: ${(p) => (p.$active ? C.greenInk : C.muted)};
  background: ${(p) => (p.$active ? 'rgba(164,255,17,0.16)' : 'transparent')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  transition: background 0.14s, color 0.14s;
  &:hover { background: ${(p) => (p.$active ? 'rgba(164,255,17,0.2)' : C.paper2)}; color: ${C.ink}; }
`;
const AddRow = styled.div`
  margin-top: 2px; padding: 7px 10px; border-radius: 9px; cursor: pointer;
  font-size: 12.5px; font-weight: 600; color: ${C.greenDeep};
  transition: background 0.14s;
  &:hover { background: rgba(164,255,17,0.12); }
`;
const MemberRow = styled.div<{ $clickable?: boolean }>`
  padding: 5px 8px; border-radius: 9px; margin-bottom: 1px;
  display: flex; align-items: center; gap: 9px;
  cursor: ${(p) => (p.$clickable ? 'pointer' : 'default')};
  .name { flex: 1; font-size: 13px; color: ${C.muted}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .you { margin-left: auto; font-size: 10.5px; font-weight: 600; color: ${C.greenDeep}; background: rgba(164,255,17,0.14); padding: 2px 7px; border-radius: 999px; }
  &:hover { background: ${C.paper2}; }
`;
const KeyHint = styled.span`
  margin-left: auto; font-size: 11px; color: ${C.mutedSoft}; opacity: 0; transition: opacity 0.14s;
  ${MemberRow}:hover & { opacity: 0.75; }
`;
const Avatar = styled.span<{ $online?: boolean }>`
  position: relative; width: 24px; height: 24px; flex-shrink: 0;
  display: grid; place-items: center; border-radius: 50%;
  font-size: 11px; font-weight: 700; color: ${(p) => (p.$online ? C.onAccent : C.ink)};
  background: ${(p) => (p.$online ? `linear-gradient(135deg, ${C.green}, #cde88a)` : C.paper2)};
  border: 1px solid ${(p) => (p.$online ? 'transparent' : C.line)};
`;
const ActionBar = styled.div`
  padding: 10px 12px; display: flex; gap: 8px; border-bottom: 1px solid ${C.line};
`;
const baseBtn = `
  flex: 1; padding: 9px 10px; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer;
  transition: background 0.16s, box-shadow 0.18s, transform 0.14s, border-color 0.16s;
`;
const PrimaryBtn = styled.button`
  ${baseBtn}
  color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c;
  &:hover { background: ${C.greenHover}; box-shadow: 0 8px 22px rgba(164,255,17,0.4); transform: translateY(-1px); }
`;
const Footer = styled.div`
  flex-shrink: 0;
  padding: 12px;
  border-top: 1px solid ${C.line};
  display: flex;
  flex-direction: column;
  gap: 10px;
  .links { display: flex; align-items: center; gap: 14px; padding: 0 2px; }
  .links a, .links button {
    font-size: 12.5px; font-weight: 600; color: ${C.muted};
    background: none; border: none; padding: 0; cursor: pointer; text-decoration: none;
    transition: color 0.14s;
  }
  .links a:hover, .links button:hover { color: ${C.greenDeep}; }
`;
const ThemeToggle = styled.button`
  margin-left: auto;
  display: grid; place-items: center;
  width: 28px; height: 28px; border-radius: 8px;
  color: ${C.muted}; background: transparent; border: 1px solid ${C.line};
  cursor: pointer; transition: color 0.14s, border-color 0.14s, background 0.14s;
  &:hover { color: ${C.greenDeep}; border-color: ${C.lineDark}; background: ${C.paper2}; }
`;
const LogoutBtn = styled.button`
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  width: 100%; padding: 9px 12px;
  font-size: 13px; font-weight: 600; color: ${C.ink};
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 10px; cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  &:hover { background: rgba(210,59,47,0.06); border-color: rgba(210,59,47,0.3); color: ${C.danger}; }
`;
