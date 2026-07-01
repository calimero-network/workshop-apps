import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useMero, CalimeroLogo } from '@calimero-network/mero-react';
import { C } from '../../theme';
import { APP_DISPLAY_NAME, APP_ROUTE } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

/** NAV items matching the 5 spec views */
const NAV = [
  { label: 'Dashboard', to: APP_ROUTE, end: true, icon: <IconDash /> },
  { label: 'Search', to: `${APP_ROUTE}/search`, icon: <IconSearch /> },
  { label: 'Browse', to: `${APP_ROUTE}/browse`, icon: <IconBrowse /> },
  { label: 'Visualize', to: `${APP_ROUTE}/viz`, icon: <IconViz /> },
  { label: 'Collections', to: `${APP_ROUTE}/collections`, icon: <IconCollect /> },
];

export default function AppPage() {
  const { logout } = useMero();
  const ws = useWorkspace();
  const navigate = useNavigate();
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // ── Welcome gate: no workspace yet (first-run web) ─────────────────────────
  if (!ws.ready && !ws.loading) {
    return (
      <GateWrap>
        <GateCard>
          <LogoBadge>
            <CalimeroLogo size={28} color="var(--color-primary)" />
          </LogoBadge>
          <GateTitle>{APP_DISPLAY_NAME}</GateTitle>
          <GateSub>
            A collaborative vector knowledge base for your team.
            Create a workspace to start, or join one you were invited to.
          </GateSub>
          <GateRow>
            <PrimaryBtn onClick={() => void ws.bootstrap()}>
              Create workspace
            </PrimaryBtn>
            <SecondaryBtn onClick={() => setShowJoin(true)}>
              Join with invitation
            </SecondaryBtn>
          </GateRow>
          {ws.error && <ErrLine>{describeError(ws.error)}</ErrLine>}
        </GateCard>
        {showJoin && (
          <JoinModal
            onJoin={async (code) => { await ws.join(code); setShowJoin(false); navigate(APP_ROUTE); }}
            onClose={() => setShowJoin(false)}
          />
        )}
      </GateWrap>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (ws.loading) {
    return (
      <GateWrap>
        <LoadingDot />
      </GateWrap>
    );
  }

  // ── Main layout ─────────────────────────────────────────────────────────────
  return (
    <Shell>
      {/* Sidebar */}
      <Sidebar>
        <SidebarBrand>
          <CalimeroLogo size={18} color="var(--color-primary)" />
          <BrandText>{APP_DISPLAY_NAME}</BrandText>
        </SidebarBrand>

        <SidebarNav>
          {NAV.map((item) => (
            <NavItem key={item.to} to={item.to} end={item.end ?? false}>
              <NavIcon>{item.icon}</NavIcon>
              <span>{item.label}</span>
            </NavItem>
          ))}
        </SidebarNav>

        <SidebarFooter>
          <FooterBtn onClick={() => setShowInvite(true)} title="Invite teammate">
            <IconInvite />
            <span>Invite</span>
          </FooterBtn>
          <FooterBtn onClick={() => setShowJoin(true)} title="Join workspace">
            <IconJoin />
            <span>Join</span>
          </FooterBtn>
          <FooterBtn onClick={logout} title="Sign out" $danger>
            <IconSignOut />
            <span>Sign out</span>
          </FooterBtn>
        </SidebarFooter>
      </Sidebar>

      {/* Main content */}
      <Main>
        <Outlet />
      </Main>

      {/* Modals */}
      {showInvite && (
        <InviteModal onInvite={ws.invite} onClose={() => setShowInvite(false)} />
      )}
      {showJoin && (
        <JoinModal
          onJoin={async (code) => { await ws.join(code); setShowJoin(false); }}
          onClose={() => setShowJoin(false)}
        />
      )}
    </Shell>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────────── */
function IconDash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  );
}
function IconBrowse() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}
function IconViz() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="17" r="2" /><circle cx="17" cy="7" r="2" /><circle cx="17" cy="17" r="2" />
      <circle cx="7" cy="7" r="2" /><circle cx="12" cy="12" r="2" />
    </svg>
  );
}
function IconCollect() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function IconInvite() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  );
}
function IconJoin() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}
function IconSignOut() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

/* ── Styled components ──────────────────────────────────────────────────────── */
const Shell = styled.div`
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: ${C.paper};
`;

const SIDEBAR_W = '220px';

const Sidebar = styled.aside`
  width: ${SIDEBAR_W};
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: ${C.paper2};
  border-right: 1px solid ${C.line};
  overflow-y: auto;
`;

const SidebarBrand = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 16px 14px;
  border-bottom: 1px solid ${C.line};
`;

const BrandText = styled.span`
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: ${C.ink};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const SidebarNav = styled.nav`
  flex: 1;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const NavItem = styled(NavLink)<{ end?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 500;
  color: ${C.muted};
  text-decoration: none;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: ${C.paper};
    color: ${C.ink};
  }

  &.active {
    background: rgba(124, 58, 237, 0.12);
    color: var(--color-primary);
    font-weight: 600;
  }

  span { flex: 1; }
`;

const NavIcon = styled.span`
  display: flex;
  align-items: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
`;

const SidebarFooter = styled.div`
  padding: 8px;
  border-top: 1px solid ${C.line};
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const FooterBtn = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 9px;
  font-size: 12.5px;
  font-weight: 500;
  color: ${(p) => (p.$danger ? C.danger : C.muted)};
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: ${(p) => (p.$danger ? 'rgba(255,107,107,0.08)' : C.paper)};
    color: ${(p) => (p.$danger ? C.danger : C.ink)};
  }
`;

const Main = styled.main`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

/* ── Welcome gate ────────────────────────────────────────────────────────────── */
const GateWrap = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: ${C.paper};
  min-height: 100vh;
`;

const GateCard = styled.div`
  max-width: 440px;
  width: 100%;
  padding: 36px 32px 32px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 20px;
  box-shadow: 0 40px 80px -40px rgba(124, 58, 237, 0.18);
  text-align: center;
`;

const LogoBadge = styled.div`
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background: rgba(124, 58, 237, 0.12);
  border: 1px solid rgba(124, 58, 237, 0.3);
  margin: 0 auto 18px;
`;

const GateTitle = styled.h2`
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: ${C.ink};
  margin-bottom: 10px;
`;

const GateSub = styled.p`
  font-size: 14px;
  color: ${C.muted};
  line-height: 1.6;
  margin-bottom: 26px;
  max-width: 340px;
  margin-left: auto;
  margin-right: auto;
`;

const GateRow = styled.div`
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
`;

const PrimaryBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 11px 20px;
  font-size: 13.5px;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  color: #fff;
  background: var(--color-primary);
  border: none;
  transition: opacity 0.18s, transform 0.15s;
  &:hover { opacity: 0.88; transform: translateY(-1px); }
`;

const SecondaryBtn = styled.button`
  padding: 11px 18px;
  font-size: 13.5px;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  color: ${C.ink};
  background: ${C.paper};
  border: 1px solid ${C.line};
  transition: background 0.15s, border-color 0.15s;
  &:hover { border-color: var(--color-primary); }
`;

const ErrLine = styled.p`
  margin-top: 14px;
  font-size: 13px;
  color: ${C.danger};
`;

const LoadingDot = styled.div`
  width: 32px;
  height: 32px;
  border: 3px solid ${C.line};
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  @keyframes spin { to { transform: rotate(360deg); } }
`;
