import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { C, useTheme, MoonIcon } from '../theme';
import { useMero, CalimeroLogo, type GroupMember } from '@calimero-network/mero-react';
import type { WorkspaceRecord } from '../hooks/useIncidentWorkspace';
import MemberPopup from './MemberPopup';

const MAX_NAME_LEN = 20;
const DOCS_URL = 'https://docs.calimero.network';

// Accept the old RoomSummary-typed props as `never[]` for compat with unused imports
// but the component ignores them. Incident nav is driven by activeView.

interface SidebarProps {
  // Workspace selector
  workspaces: WorkspaceRecord[];
  selectedNamespaceId: string | null;
  onSelectWorkspace: (nsId: string) => void;
  onCreateWorkspace: () => void;
  workspaceAlias?: string;

  // Member directory
  members: GroupMember[];
  selfIdentity: string | null;
  onlineMembers: Set<string>;          // kept for signature compat; unused (no presence in spec)
  memberNames: Record<string, string>; // kept for signature compat; unused
  onSetName: (name: string) => Promise<void>; // kept for compat; unused

  // Room props kept for backwards compat (ChatPage passes empty arrays) — ignored
  rooms: unknown[];
  selectedRoomId: string | null;
  onSelectRoom: (room: unknown) => void;
  onCreateRoom: () => void;

  onInvite: () => void;

  // Admin actions
  viewerIsAdmin: boolean;
  onSetMemberRole: (identity: string, role: 'Admin' | 'Member') => Promise<void>;
  onRemoveMember: (identity: string) => Promise<void>;

  // Layout
  collapsed: boolean;
  onToggleCollapse: () => void;

  // Incident-command nav
  activeView?: 'dashboard' | 'detail' | 'postmortem' | 'oncall';
  onSetActiveView?: (view: 'dashboard' | 'detail' | 'postmortem' | 'oncall') => void;
  onCallName?: string | null;
  openIncidentCount?: number;
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
  activeView = 'dashboard',
  onSetActiveView,
  onCallName,
  openIncidentCount = 0,
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

  const navTo = (view: 'dashboard' | 'detail' | 'postmortem' | 'oncall') => {
    onSetActiveView?.(view);
  };

  /* Collapsed rail */
  if (collapsed) {
    return (
      <Rail>
        <RailBtn onClick={onToggleCollapse} title="Expand sidebar" aria-label="Expand sidebar">
          <Chevron dir="right" />
        </RailBtn>
        <span className="logo"><CalimeroLogo size={22} color={C.greenInk} /></span>
        <RailBtn onClick={() => navTo('dashboard')} title="Dashboard" aria-label="Dashboard"><DashIcon /></RailBtn>
        <RailBtn onClick={() => navTo('oncall')} title="On-Call" aria-label="On-Call"><OnCallIcon /></RailBtn>
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
          <h2 title={workspaceAlias || 'Incident Command'}>{workspaceAlias || 'Incident Command'}</h2>
          <span className="count">{memberCount} member{memberCount === 1 ? '' : 's'}</span>
        </div>
        <IconBtn onClick={onToggleCollapse} title="Collapse sidebar" aria-label="Collapse sidebar">
          <Chevron dir="left" />
        </IconBtn>
      </Header>

      {/* On-call badge */}
      {onCallName && (
        <OnCallBadge>
          <OnCallDot />
          <span>On-call: <strong>{onCallName}</strong></span>
        </OnCallBadge>
      )}

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

        {/* Incident navigation */}
        <Block>
          <Label>Views</Label>
          <NavRow $active={activeView === 'dashboard'} onClick={() => navTo('dashboard')}>
            <DashIcon />
            <span>Incident Dashboard</span>
            {openIncidentCount > 0 && <NavBadge>{openIncidentCount}</NavBadge>}
          </NavRow>
          <NavRow $active={activeView === 'oncall'} onClick={() => navTo('oncall')}>
            <OnCallIcon />
            <span>On-Call Schedule</span>
          </NavRow>
        </Block>

        {/* Members */}
        <Block>
          <Label>Members</Label>
          {selfIdentity && (
            <MemberRow
              $clickable
              onClick={() => setPopupMember({ identity: selfIdentity, role: 'You', online: true, isSelf: true })}
            >
              <Avatar $online><span>{initialOf(shortenId(selfIdentity))}</span></Avatar>
              <span className="name">{shortenId(selfIdentity)}</span>
              <YouBadge>you</YouBadge>
            </MemberRow>
          )}
          {members.map((m) => {
            const label = m.name || shortenId(m.identity);
            return (
              <MemberRow
                key={m.identity}
                $clickable
                onClick={() => setPopupMember({ identity: m.identity, alias: m.name || undefined, role: m.role, online: false, isSelf: false })}
              >
                <Avatar $online={false}><span>{initialOf(label)}</span></Avatar>
                <span className="name">{label}</span>
                <KeyHint aria-hidden>↗</KeyHint>
              </MemberRow>
            );
          })}

          <ActionRow>
            <InviteBtn onClick={onInvite}>+ Invite</InviteBtn>
          </ActionRow>
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

/* ── icons ── */
function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
  );
}
function DashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}
function OnCallIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.5 12 19.79 19.79 0 0 1 1.48 3.46 2 2 0 0 1 3.5 1.24h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.91A16 16 0 0 0 16 17l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
const BookIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
);
const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
);

/* ── styles ── */
const sidebarFont = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased;`;

const Root = styled.div`
  width: 264px; flex-shrink: 0; display: flex; flex-direction: column;
  background: ${C.paper}; border-right: 1px solid ${C.line}; ${sidebarFont}
`;
const Rail = styled.div`
  width: 56px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center;
  gap: 8px; padding: 12px 0; background: ${C.paper}; border-right: 1px solid ${C.line};
  ${sidebarFont}
  .logo { display: flex; margin: 4px 0 6px; }
  .spacer { flex: 1; }
`;
const RailBtn = styled.button`
  width: 38px; height: 38px; display: grid; place-items: center; color: ${C.ink};
  background: transparent; border: 1px solid transparent; border-radius: 10px; cursor: pointer;
  transition: background 0.14s, color 0.14s, border-color 0.14s;
  &:hover { background: ${C.paper2}; border-color: ${C.line}; }
  &.danger:hover { color: ${C.danger}; background: rgba(220,38,38,0.08); border-color: rgba(220,38,38,0.25); }
`;
const Header = styled.div`
  padding: 14px 14px 14px 16px; border-bottom: 1px solid ${C.line};
  display: flex; align-items: center; gap: 8px;
  .info { min-width: 0; flex: 1; }
  h2 { font-size: 15px; font-weight: 800; letter-spacing: -0.4px; color: ${C.ink};
    margin: 0 0 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .count { font-size: 12.5px; color: ${C.mutedSoft}; }
`;
const OnCallBadge = styled.div`
  display: flex; align-items: center; gap: 7px;
  padding: 8px 14px; border-bottom: 1px solid ${C.line};
  font-size: 12px; color: #15803d; background: rgba(22,163,74,0.06);
`;
const OnCallDot = styled.span`
  width: 7px; height: 7px; border-radius: 50%; background: #16A34A; flex-shrink: 0;
  box-shadow: 0 0 0 3px rgba(22,163,74,0.2);
`;
const IconBtn = styled.button`
  flex-shrink: 0; width: 32px; height: 32px; display: grid; place-items: center;
  color: ${C.muted}; background: transparent; border: 1px solid ${C.line};
  border-radius: 9px; cursor: pointer;
  transition: background 0.14s, color 0.14s, border-color 0.14s;
  &:hover { background: ${C.paper2}; color: ${C.ink}; border-color: ${C.lineDark}; }
`;
const Scroll = styled.div`
  flex: 1; display: flex; flex-direction: column; overflow-y: auto; min-height: 0;
`;
const Block = styled.div`
  padding: 10px 8px; border-bottom: 1px solid ${C.line};
`;
const Label = styled.div`
  font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
  color: ${C.mutedSoft}; margin: 0 0 8px; padding-left: 8px;
`;
const Row = styled.div<{ $active?: boolean }>`
  padding: 7px 10px; border-radius: 9px; cursor: pointer; font-size: 13px;
  font-weight: ${(p) => (p.$active ? 600 : 500)};
  color: ${(p) => (p.$active ? '#DC2626' : C.muted)};
  background: ${(p) => (p.$active ? 'rgba(220,38,38,0.1)' : 'transparent')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  transition: background 0.14s, color 0.14s;
  &:hover { background: ${(p) => (p.$active ? 'rgba(220,38,38,0.14)' : C.paper2)}; color: ${C.ink}; }
`;
const AddRow = styled.div`
  margin-top: 2px; padding: 7px 10px; border-radius: 9px; cursor: pointer;
  font-size: 12.5px; font-weight: 600; color: ${C.greenDeep};
  transition: background 0.14s;
  &:hover { background: rgba(164,255,17,0.12); }
`;
const NavRow = styled.div<{ $active?: boolean }>`
  padding: 8px 10px; border-radius: 9px; cursor: pointer; margin-bottom: 2px;
  display: flex; align-items: center; gap: 8px; font-size: 13px;
  font-weight: ${(p) => (p.$active ? 700 : 500)};
  color: ${(p) => (p.$active ? '#DC2626' : C.muted)};
  background: ${(p) => (p.$active ? 'rgba(220,38,38,0.1)' : 'transparent')};
  transition: background 0.14s, color 0.14s;
  &:hover { background: ${(p) => (p.$active ? 'rgba(220,38,38,0.14)' : C.paper2)}; color: ${C.ink}; }
  span { flex: 1; }
`;
const NavBadge = styled.span`
  flex-shrink: 0; min-width: 18px; height: 18px; border-radius: 999px; font-size: 10px; font-weight: 800;
  background: #DC2626; color: #fff; display: grid; place-items: center; padding: 0 5px;
`;
const MemberRow = styled.div<{ $clickable?: boolean }>`
  padding: 5px 8px; border-radius: 9px; margin-bottom: 1px;
  display: flex; align-items: center; gap: 9px;
  cursor: ${(p) => (p.$clickable ? 'pointer' : 'default')};
  .name { flex: 1; font-size: 13px; color: ${C.muted}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &:hover { background: ${C.paper2}; }
`;
const KeyHint = styled.span`
  margin-left: auto; font-size: 11px; color: ${C.mutedSoft}; opacity: 0; transition: opacity 0.14s;
  ${MemberRow}:hover & { opacity: 0.75; }
`;
const YouBadge = styled.span`
  margin-left: auto; font-size: 10.5px; font-weight: 600; color: ${C.greenDeep};
  background: rgba(164,255,17,0.14); padding: 2px 7px; border-radius: 999px;
`;
const Avatar = styled.span<{ $online?: boolean }>`
  position: relative; width: 24px; height: 24px; flex-shrink: 0;
  display: grid; place-items: center; border-radius: 50%;
  font-size: 11px; font-weight: 700; color: ${(p) => (p.$online ? C.onAccent : C.ink)};
  background: ${(p) => (p.$online ? `linear-gradient(135deg, ${C.green}, #cde88a)` : C.paper2)};
  border: 1px solid ${(p) => (p.$online ? 'transparent' : C.line)};
`;
const ActionRow = styled.div`
  padding: 8px 0 4px; display: flex; gap: 8px;
`;
const InviteBtn = styled.button`
  flex: 1; padding: 8px 10px; font-size: 13px; font-weight: 600; border-radius: 9px; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  transition: background 0.16s, border-color 0.16s;
  &:hover { background: ${C.paper2}; border-color: ${C.lineDark}; }
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
  .links a:hover, .links button:hover { color: ${C.greenDeep}; }
`;
const ThemeToggle = styled.button`
  margin-left: auto; display: grid; place-items: center; width: 28px; height: 28px;
  border-radius: 8px; color: ${C.muted}; background: transparent; border: 1px solid ${C.line};
  cursor: pointer; transition: color 0.14s, border-color 0.14s, background 0.14s;
  &:hover { color: ${C.greenDeep}; border-color: ${C.lineDark}; background: ${C.paper2}; }
`;
const LogoutBtn = styled.button`
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  width: 100%; padding: 9px 12px; font-size: 13px; font-weight: 600; color: ${C.ink};
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 10px; cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  &:hover { background: rgba(220,38,38,0.06); border-color: rgba(220,38,38,0.3); color: ${C.danger}; }
`;
