/**
 * PipelineSidebar — workspace selector, member list, and navigation tabs.
 * Adapted from the foundation Sidebar; rooms section removed; pipeline-specific tabs added.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { C, useTheme, MoonIcon } from '../theme';
import { useMero, CalimeroLogo, type GroupMember } from '@calimero-network/mero-react';
import type { LobbyRecord } from '../hooks/useChatLobby';
import MemberPopup from './MemberPopup';

const MAX_NAME_LEN = 20;
const DOCS_URL = 'https://docs.calimero.network';

export type PipelineView = 'board' | 'closed';

interface PipelineSidebarProps {
  workspaces: LobbyRecord[];
  selectedNamespaceId: string | null;
  onSelectWorkspace: (nsId: string) => void;
  onCreateWorkspace: () => void;
  workspaceAlias?: string;

  members: GroupMember[];
  selfIdentity: string | null;
  onlineMembers: Set<string>;
  memberNames: Record<string, string>;
  onSetName: (name: string) => Promise<void>;

  onInvite: () => void;
  viewerIsAdmin: boolean;
  onSetMemberRole: (identity: string, role: 'Admin' | 'Member') => Promise<void>;
  onRemoveMember: (identity: string) => Promise<void>;

  activeView: PipelineView;
  onSelectView: (view: PipelineView) => void;

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

export default function PipelineSidebar({
  workspaces,
  selectedNamespaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  workspaceAlias,
  members,
  selfIdentity,
  onlineMembers,
  memberNames,
  onSetName,
  onInvite,
  viewerIsAdmin,
  onSetMemberRole,
  onRemoveMember,
  activeView,
  onSelectView,
  collapsed,
  onToggleCollapse,
}: PipelineSidebarProps) {
  const navigate = useNavigate();
  const { logout } = useMero();
  const { theme, toggle: toggleTheme } = useTheme();

  const persistedName = (selfIdentity && memberNames[selfIdentity]) || '';
  const [draftName, setDraftName] = useState(persistedName);
  const [popupMember, setPopupMember] = useState<
    { identity: string; alias?: string; role?: string; online: boolean; isSelf: boolean } | null
  >(null);

  useEffect(() => { setDraftName(persistedName); }, [persistedName]);

  const commitName = async () => {
    const trimmed = draftName.trim().slice(0, MAX_NAME_LEN);
    setDraftName(trimmed);
    if (trimmed === persistedName) return;
    try { await onSetName(trimmed); } catch { /* keep draft */ }
  };

  const renderMemberLabel = (identity: string, alias?: string) =>
    memberNames[identity] || alias || shortenId(identity);

  const memberCount = members.length + (selfIdentity ? 1 : 0);
  const backToLanding = () => { logout(); navigate('/', { replace: true }); };
  const openDocs = () => window.open(DOCS_URL, '_blank', 'noopener,noreferrer');

  if (collapsed) {
    return (
      <Rail>
        <RailBtn onClick={onToggleCollapse} title="Expand sidebar" aria-label="Expand sidebar">
          <Chevron dir="right" />
        </RailBtn>
        <span className="logo"><CalimeroLogo size={22} color={C.greenInk} /></span>
        <RailBtn onClick={() => onSelectView('board')} title="Pipeline board" aria-label="Pipeline board">
          <BoardIcon />
        </RailBtn>
        <RailBtn onClick={() => onSelectView('closed')} title="Closed deals" aria-label="Closed deals">
          <TrophyIcon />
        </RailBtn>
        <div className="spacer" />
        <RailBtn onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
          <MoonIcon filled={theme === 'dark'} />
        </RailBtn>
        <RailBtn onClick={openDocs} title="Docs" aria-label="Docs"><BookIcon /></RailBtn>
        <RailBtn className="danger" onClick={backToLanding} title="Log out" aria-label="Log out"><LogoutIcon /></RailBtn>
      </Rail>
    );
  }

  return (
    <Root>
      <Header>
        <div className="info">
          <h2 title={workspaceAlias || 'deal-flow'}>{workspaceAlias || 'deal-flow'}</h2>
          <span className="count">{memberCount} member{memberCount === 1 ? '' : 's'}</span>
        </div>
        <IconBtn onClick={onToggleCollapse} title="Collapse sidebar" aria-label="Collapse sidebar">
          <Chevron dir="left" />
        </IconBtn>
      </Header>

      <Scroll>
        {/* View navigation */}
        <Block>
          <Label>Views</Label>
          <NavRow $active={activeView === 'board'} onClick={() => onSelectView('board')}>
            <BoardIcon /> Pipeline Board
          </NavRow>
          <NavRow $active={activeView === 'closed'} onClick={() => onSelectView('closed')}>
            <TrophyIcon /> Closed Deals
          </NavRow>
        </Block>

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

          {selfIdentity && (
            <MemberRow>
              <Avatar
                $online
                $clickable
                title="View your identity"
                onClick={() => setPopupMember({ identity: selfIdentity, alias: persistedName || undefined, role: 'You', online: true, isSelf: true })}
              >
                {initialOf(draftName || shortenId(selfIdentity))}
              </Avatar>
              <NameInput
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                  if (e.key === 'Escape') { setDraftName(persistedName); (e.currentTarget as HTMLInputElement).blur(); }
                }}
                maxLength={MAX_NAME_LEN}
                placeholder={shortenId(selfIdentity)}
                aria-label="Your display name"
              />
              <span className="you">you</span>
            </MemberRow>
          )}

          {members.map((m) => {
            const online = onlineMembers.has(m.identity);
            const label = renderMemberLabel(m.identity, m.name);
            const alias = memberNames[m.identity] || m.name;
            return (
              <MemberRow
                key={m.identity}
                $clickable
                title="View identity"
                onClick={() => setPopupMember({ identity: m.identity, alias, role: m.role, online, isSelf: false })}
              >
                <Avatar $online={online}>{initialOf(label)}</Avatar>
                <span className="name">{label}</span>
                <KeyHint aria-hidden>↗</KeyHint>
              </MemberRow>
            );
          })}

          <InviteBtn onClick={onInvite}>Invite teammate</InviteBtn>
        </Block>
      </Scroll>

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

/* ── Icons ── */
function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
  );
}
const BoardIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="10" rx="1" />
  </svg>
);
const TrophyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="8 21 12 17 16 21" /><line x1="12" y1="17" x2="12" y2="11" />
    <path d="M7 4H17v6a5 5 0 0 1-10 0V4z" /><path d="M7 4H5.5A2.5 2.5 0 0 0 3 6.5V7a4 4 0 0 0 4 4" />
    <path d="M17 4h1.5A2.5 2.5 0 0 1 21 6.5V7a4 4 0 0 1-4 4" />
  </svg>
);
const BookIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);
const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

/* ── Styles ── */
const sidebarFont = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased;`;

const Root = styled.div`
  width: 264px; flex-shrink: 0;
  display: flex; flex-direction: column;
  background: ${C.paper}; border-right: 1px solid ${C.line};
  ${sidebarFont}
`;
const Rail = styled.div`
  width: 56px; flex-shrink: 0;
  display: flex; flex-direction: column;
  align-items: center; gap: 8px; padding: 12px 0;
  background: ${C.paper}; border-right: 1px solid ${C.line};
  ${sidebarFont}
  .logo { display: flex; margin: 4px 0 6px; }
  .spacer { flex: 1; }
`;
const RailBtn = styled.button`
  width: 38px; height: 38px; display: grid; place-items: center;
  color: ${C.ink}; background: transparent; border: 1px solid transparent;
  border-radius: 10px; cursor: pointer;
  transition: background 0.14s, color 0.14s, border-color 0.14s;
  &:hover { background: ${C.paper2}; border-color: ${C.line}; }
  &.danger:hover { color: ${C.danger}; background: rgba(210,59,47,0.08); border-color: rgba(210,59,47,0.25); }
`;
const Header = styled.div`
  padding: 14px 14px 14px 16px; border-bottom: 1px solid ${C.line};
  display: flex; align-items: center; gap: 8px;
  .info { min-width: 0; flex: 1; }
  h2 { font-size: 15px; font-weight: 800; letter-spacing: -0.4px; color: ${C.ink}; margin: 0 0 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .count { font-size: 12.5px; color: ${C.mutedSoft}; }
`;
const IconBtn = styled.button`
  flex-shrink: 0; width: 32px; height: 32px; display: grid; place-items: center;
  color: ${C.muted}; background: transparent; border: 1px solid ${C.line}; border-radius: 9px; cursor: pointer;
  transition: background 0.14s, color 0.14s, border-color 0.14s;
  &:hover { background: ${C.paper2}; color: ${C.ink}; border-color: ${C.lineDark}; }
`;
const Scroll = styled.div`flex: 1; display: flex; flex-direction: column; overflow-y: auto; min-height: 0;`;
const Block = styled.div`padding: 10px 8px; border-bottom: 1px solid ${C.line};`;
const Label = styled.div`
  font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
  color: ${C.mutedSoft}; margin: 0 0 8px; padding-left: 8px;
`;
const NavRow = styled.div<{ $active?: boolean }>`
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; border-radius: 9px; cursor: pointer;
  font-size: 13px; font-weight: ${(p) => (p.$active ? 700 : 500)};
  color: ${(p) => (p.$active ? 'var(--color-primary, #2563EB)' : C.muted)};
  background: ${(p) => (p.$active ? 'rgba(37,99,235,0.08)' : 'transparent')};
  transition: background 0.14s, color 0.14s;
  &:hover { background: ${(p) => (p.$active ? 'rgba(37,99,235,0.1)' : C.paper2)}; color: ${(p) => p.$active ? 'var(--color-primary, #2563EB)' : C.ink}; }
`;
const Row = styled.div<{ $active?: boolean }>`
  padding: 7px 10px; border-radius: 9px; cursor: pointer; font-size: 13px;
  font-weight: ${(p) => (p.$active ? 600 : 500)};
  color: ${(p) => (p.$active ? 'var(--color-primary, #2563EB)' : C.muted)};
  background: ${(p) => (p.$active ? 'rgba(37,99,235,0.08)' : 'transparent')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  transition: background 0.14s, color 0.14s;
  &:hover { background: ${(p) => p.$active ? 'rgba(37,99,235,0.1)' : C.paper2}; color: ${C.ink}; }
`;
const AddRow = styled.div`
  margin-top: 2px; padding: 7px 10px; border-radius: 9px; cursor: pointer;
  font-size: 12.5px; font-weight: 600; color: var(--color-primary, #2563EB);
  transition: background 0.14s;
  &:hover { background: rgba(37,99,235,0.06); }
`;
const MemberRow = styled.div<{ $clickable?: boolean }>`
  padding: 5px 8px; border-radius: 9px; margin-bottom: 1px;
  display: flex; align-items: center; gap: 9px;
  cursor: ${(p) => (p.$clickable ? 'pointer' : 'default')};
  .name { flex: 1; font-size: 13px; color: ${C.muted}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .you { margin-left: auto; font-size: 10.5px; font-weight: 600; color: var(--color-primary, #2563EB); background: rgba(37,99,235,0.1); padding: 2px 7px; border-radius: 999px; }
  &:hover { background: ${C.paper2}; }
`;
const KeyHint = styled.span`
  margin-left: auto; font-size: 11px; color: ${C.mutedSoft}; opacity: 0; transition: opacity 0.14s;
  ${MemberRow}:hover & { opacity: 0.75; }
`;
const Avatar = styled.span<{ $online?: boolean; $clickable?: boolean }>`
  position: relative; width: 24px; height: 24px; flex-shrink: 0;
  display: grid; place-items: center; border-radius: 50%;
  font-size: 11px; font-weight: 700;
  color: ${(p) => (p.$online ? '#fff' : C.ink)};
  cursor: ${(p) => (p.$clickable ? 'pointer' : 'inherit')};
  background: ${(p) => (p.$online ? 'linear-gradient(135deg, var(--color-primary, #2563EB), #60a5fa)' : C.paper2)};
  border: 1px solid ${(p) => (p.$online ? 'transparent' : C.line)};
  &::after {
    content: ''; position: absolute; right: -1px; bottom: -1px;
    width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid ${C.paper};
    background: ${(p) => (p.$online ? 'var(--color-accent, #10B981)' : C.off)};
  }
`;
const NameInput = styled.input`
  flex: 1; min-width: 0; background: transparent; border: none; outline: none;
  color: ${C.ink}; font-size: 13px; font-weight: 600;
  padding: 4px 6px; border-radius: 7px;
  transition: background 0.14s, box-shadow 0.14s;
  &::placeholder { color: ${C.mutedSoft}; font-weight: 500; }
  &:focus { background: ${C.paper2}; box-shadow: inset 0 0 0 1px ${C.line}; }
`;
const InviteBtn = styled.button`
  margin-top: 6px; width: 100%; padding: 7px 10px; border-radius: 9px;
  border: 1px dashed ${C.line}; background: transparent;
  color: var(--color-primary, #2563EB); font-size: 12.5px; font-weight: 600;
  cursor: pointer; text-align: left;
  transition: background 0.14s, border-color 0.14s;
  &:hover { background: rgba(37,99,235,0.06); border-color: var(--color-primary, #2563EB); }
`;
const Footer = styled.div`
  flex-shrink: 0; padding: 12px; border-top: 1px solid ${C.line};
  display: flex; flex-direction: column; gap: 10px;
  .links { display: flex; align-items: center; gap: 14px; padding: 0 2px; }
  .links a, .links button {
    font-size: 12.5px; font-weight: 600; color: ${C.muted};
    background: none; border: none; padding: 0; cursor: pointer; text-decoration: none;
    transition: color 0.14s;
  }
  .links a:hover, .links button:hover { color: var(--color-primary, #2563EB); }
`;
const ThemeToggle = styled.button`
  margin-left: auto; display: grid; place-items: center;
  width: 28px; height: 28px; border-radius: 8px;
  color: ${C.muted}; background: transparent; border: 1px solid ${C.line};
  cursor: pointer; transition: color 0.14s, border-color 0.14s, background 0.14s;
  &:hover { color: var(--color-primary, #2563EB); border-color: ${C.lineDark}; background: ${C.paper2}; }
`;
const LogoutBtn = styled.button`
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  width: 100%; padding: 9px 12px;
  font-size: 13px; font-weight: 600; color: ${C.ink};
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 10px; cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  &:hover { background: rgba(210,59,47,0.06); border-color: rgba(210,59,47,0.3); color: ${C.danger}; }
`;
