import React, { createContext, useContext, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { useMero } from '@calimero-network/mero-react';
import { C } from '../../theme';
import { APP_DISPLAY_NAME, APP_ROUTE } from '../../config';
import { useWorkspace, type UseWorkspaceReturn } from '../../hooks/useWorkspace';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';

import DashboardPage from './DashboardPage';
import IncidentDetailPage from './IncidentDetailPage';
import PostmortemPage from './PostmortemPage';
import HistoryPage from './HistoryPage';

/**
 * Workspace context — shared with all sub-pages so they can read contextId /
 * executorPublicKey without calling useWorkspace again (which would create a
 * new state instance). Sub-pages import `useWs()` from here.
 */
export interface WsCtxValue {
  contextId: string | null;
  executorPublicKey: string | null;
}
const WsContext = createContext<WsCtxValue>({ contextId: null, executorPublicKey: null });
export function useWs(): WsCtxValue {
  return useContext(WsContext);
}

/**
 * App shell — workspace gate + persistent top nav + nested routes.
 *
 * Structure:
 *  /incident-command           → DashboardPage
 *  /incident-command/history   → HistoryPage
 *  /incident-command/incident/:id             → IncidentDetailPage
 *  /incident-command/incident/:id/postmortem  → PostmortemPage
 */
export default function AppPage() {
  const { logout } = useMero();
  const ws: UseWorkspaceReturn = useWorkspace();
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // ── Workspace gate ─────────────────────────────────────────────────────────
  if (!ws.ready && !ws.loading) {
    return (
      <GateBg>
        <GateCard>
          <AlertIcon aria-hidden="true">🚨</AlertIcon>
          <h2>Welcome to {APP_DISPLAY_NAME}</h2>
          <p>Create a workspace to start incident tracking, or join one you were invited to.</p>
          <GateRow>
            <PrimaryBtn onClick={() => ws.bootstrap()}>Create workspace</PrimaryBtn>
            <SecondaryBtn onClick={() => setShowJoin(true)}>Join with invitation</SecondaryBtn>
          </GateRow>
          {ws.error && <ErrLine>{describeError(ws.error)}</ErrLine>}
        </GateCard>
        {showJoin && (
          <JoinModal
            onJoin={async (code) => { await ws.join(code); setShowJoin(false); }}
            onClose={() => setShowJoin(false)}
          />
        )}
      </GateBg>
    );
  }

  if (ws.loading) {
    return (
      <GateBg>
        <LoadingText>Connecting to workspace…</LoadingText>
      </GateBg>
    );
  }

  return (
    <WsContext.Provider value={{ contextId: ws.contextId, executorPublicKey: ws.executorPublicKey }}>
      <Shell>
        {/* ── Top nav ──────────────────────────────────────────────────────── */}
        <TopNav>
          <NavLeft>
            <BrandLink to={APP_ROUTE}>
              <BrandIcon aria-hidden="true">🚨</BrandIcon>
              <BrandName>{APP_DISPLAY_NAME}</BrandName>
            </BrandLink>
            <NavLinks>
              <StyledNavLink to={APP_ROUTE} end>Dashboard</StyledNavLink>
              <StyledNavLink to={`${APP_ROUTE}/history`}>History</StyledNavLink>
            </NavLinks>
          </NavLeft>
          <NavRight>
            <SecondaryBtn onClick={() => setShowInvite(true)}>Invite</SecondaryBtn>
            <SecondaryBtn onClick={() => setShowJoin(true)}>Join</SecondaryBtn>
            <SecondaryBtn onClick={logout}>Sign out</SecondaryBtn>
          </NavRight>
        </TopNav>

        {/* ── Page content ─────────────────────────────────────────────────── */}
        <Content>
          <Routes>
            <Route index element={<DashboardPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="incident/:id" element={<IncidentDetailPage />} />
            <Route path="incident/:id/postmortem" element={<PostmortemPage />} />
            {/* Fallback within the app — redirect to dashboard */}
            <Route path="*" element={<Navigate to={APP_ROUTE} replace />} />
          </Routes>
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
      </Shell>
    </WsContext.Provider>
  );
}

/* ── Styled components ─────────────────────────────────────────────────────── */

const Shell = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: ${C.paper};
`;

const TopNav = styled.nav`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 clamp(16px, 3vw, 32px);
  height: 56px;
  background: var(--color-primary, #1E293B);
  border-bottom: 2px solid var(--color-accent, #EF4444);
  flex-shrink: 0;
`;

const NavLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 28px;
`;

const NavRight = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const BrandLink = styled(Link)`
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
`;

const BrandIcon = styled.span`
  font-size: 20px;
  line-height: 1;
`;

const BrandName = styled.span`
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: #ffffff;
  white-space: nowrap;
`;

const NavLinks = styled.div`
  display: flex;
  gap: 4px;
  @media (max-width: 560px) { display: none; }
`;

const StyledNavLink = styled(NavLink)`
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  border-radius: 7px;
  transition: color 0.15s, background 0.15s;
  &:hover { color: #ffffff; background: rgba(255,255,255,0.1); }
  &.active { color: #ffffff; background: rgba(255,255,255,0.15); font-weight: 600; }
`;

const Content = styled.main`
  flex: 1;
  max-width: 960px;
  width: 100%;
  margin: 0 auto;
  padding: 28px 20px 64px;
`;

/* Gate (no workspace yet) */
const GateBg = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: ${C.paper};
`;

const GateCard = styled.div`
  max-width: 440px;
  width: 100%;
  text-align: center;
  padding: 36px 32px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 18px;
  h2 {
    font-size: 21px;
    font-weight: 800;
    letter-spacing: -0.5px;
    color: ${C.ink};
    margin: 12px 0 10px;
  }
  p {
    font-size: 14px;
    color: ${C.muted};
    line-height: 1.55;
    margin-bottom: 24px;
  }
`;

const AlertIcon = styled.div`
  font-size: 36px;
  line-height: 1;
`;

const GateRow = styled.div`
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
`;

const LoadingText = styled.p`
  font-size: 15px;
  color: ${C.muted};
`;

const ErrLine = styled.p`
  margin-top: 14px;
  font-size: 13px;
  color: ${C.danger};
`;

export const PrimaryBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 18px;
  font-size: 13.5px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  color: #ffffff;
  background: var(--color-accent, #EF4444);
  border: 1px solid rgba(0,0,0,0.12);
  transition: filter 0.15s, transform 0.12s;
  &:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
  &:disabled { opacity: 0.5; cursor: default; }
`;

export const SecondaryBtn = styled.button`
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 7px;
  cursor: pointer;
  color: rgba(255,255,255,0.8);
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.15);
  transition: background 0.15s, color 0.15s;
  &:hover { background: rgba(255,255,255,0.2); color: #ffffff; }
`;
