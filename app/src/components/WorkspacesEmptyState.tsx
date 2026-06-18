import React from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { C } from '../theme';
import { useMero, CalimeroLogo } from '@calimero-network/mero-react';
import { APP_DISPLAY_NAME } from '../config';

/**
 * Modern empty-state shown when the authenticated user has no workspaces yet.
 *
 * Matches the landing aesthetic (white/paper + neon-green accent) and provides
 * exit affordances on top of the two primary actions:
 *   - Documentation → opens the Calimero docs
 *   - Back to landing → signs out and returns to the public landing page
 *     (the route guard won't show landing to an authenticated user otherwise)
 *   - Log out → signs out and returns to the landing page (and stops there)
 */

const DOCS_URL = 'https://docs.calimero.network';


interface Props {
  onCreateWorkspace: () => void;
  onJoin: () => void;
}

export default function WorkspacesEmptyState({ onCreateWorkspace, onJoin }: Props) {
  const navigate = useNavigate();
  const { logout } = useMero();

  const backToLanding = () => { logout(); navigate('/', { replace: true }); };
  const openDocs = () => window.open(DOCS_URL, '_blank', 'noopener,noreferrer');

  return (
    <Root>
      <Glow aria-hidden />
      <Grid aria-hidden />

      <TopBar>
        <Brand>
          <CalimeroLogo size={22} color={C.greenInk} />
          <span className="wm">{APP_DISPLAY_NAME}</span>
        </Brand>
        <div className="actions">
          <GhostBtn onClick={openDocs}>Docs ↗</GhostBtn>
          <GhostBtn onClick={backToLanding}>Log out</GhostBtn>
        </div>
      </TopBar>

      <Center>
        <Card>
          <IconBadge aria-hidden>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.greenInk} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="14" rx="2.5" />
              <path d="M3 9h18" />
              <path d="M8 14h5" />
            </svg>
          </IconBadge>
          <h1>No workspaces yet</h1>
          <p>Create your first workspace to start collaborating, or join an existing one with an invitation link.</p>

          <Actions>
            <PrimaryBtn onClick={onCreateWorkspace}>Create workspace</PrimaryBtn>
            <SecondaryBtn onClick={onJoin}>Join with invitation</SecondaryBtn>
          </Actions>

          <Divider><span>or</span></Divider>

          <BackLink onClick={backToLanding}>← Back to landing</BackLink>
        </Card>

        <Footnote>
          Workspaces live on your node. Need help? <a href={DOCS_URL} target="_blank" rel="noreferrer">Read the docs ↗</a>
        </Footnote>
      </Center>
    </Root>
  );
}

/* ── animations ── */
const float = keyframes`0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(14px,-18px) scale(1.05);}`;
const fadeUp = keyframes`from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:none;}`;

/* ── layout ── */
const Root = styled.div`
  position: fixed;
  inset: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: radial-gradient(1100px 480px at 75% -10%, rgba(164,255,17,0.12) 0%, transparent 60%), ${C.paper};
  color: ${C.ink};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
`;
const Glow = styled.div`
  position: absolute;
  width: 420px; height: 420px;
  border-radius: 50%;
  top: -150px; right: -90px;
  background: radial-gradient(circle, rgba(164,255,17,0.45), rgba(164,255,17,0) 68%);
  filter: blur(28px);
  animation: ${float} 11s ease-in-out infinite;
  pointer-events: none;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;
const Grid = styled.div`
  position: absolute;
  inset: 0;
  background-image: linear-gradient(${C.line} 1px, transparent 1px), linear-gradient(90deg, ${C.line} 1px, transparent 1px);
  background-size: 46px 46px;
  mask-image: radial-gradient(620px 360px at 30% 20%, #000 0%, transparent 75%);
  opacity: 0.45;
  pointer-events: none;
`;

const TopBar = styled.header`
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px clamp(16px, 4vw, 40px);
  border-bottom: 1px solid ${C.line};
  background: ${C.paper};
  .actions { display: flex; gap: 8px; }
`;
const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
  .wm { font-size: 15px; font-weight: 700; letter-spacing: -0.3px; color: ${C.ink}; }
`;

const Center = styled.div`
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 32px 20px;
`;
const Card = styled.div`
  width: 100%;
  max-width: 460px;
  text-align: center;
  padding: clamp(28px, 5vw, 44px) clamp(22px, 4vw, 40px);
  background: ${C.paper};
  border: 1px solid ${C.line};
  border-radius: 20px;
  box-shadow: 0 30px 70px -34px rgba(14,20,15,0.32);
  animation: ${fadeUp} 0.5s ease both;
  h1 { font-size: clamp(22px, 3.4vw, 27px); font-weight: 800; letter-spacing: -0.6px; color: ${C.ink}; margin: 0 0 10px; }
  p { font-size: 14.5px; line-height: 1.6; color: ${C.muted}; margin: 0 auto; max-width: 360px; }
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;
const IconBadge = styled.div`
  width: 56px; height: 56px;
  margin: 0 auto 18px;
  display: grid; place-items: center;
  border-radius: 16px;
  background: rgba(164,255,17,0.16);
  border: 1px solid rgba(164,255,17,0.4);
`;
const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 24px;
`;

const baseBtn = `
  width: 100%;
  padding: 13px 18px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.1px;
  border-radius: 11px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.2s, background 0.18s, border-color 0.18s;
`;
const PrimaryBtn = styled.button`
  ${baseBtn}
  color: ${C.onAccent};
  background: ${C.green};
  border: 1px solid #93e60c;
  box-shadow: 0 1px 0 rgba(0,0,0,0.04);
  &:hover { background: ${C.greenHover}; box-shadow: 0 10px 28px rgba(164,255,17,0.4); transform: translateY(-1px); }
`;
const SecondaryBtn = styled.button`
  ${baseBtn}
  color: ${C.ink};
  background: ${C.paper};
  border: 1px solid ${C.line};
  &:hover { background: ${C.paper2}; border-color: ${C.lineDark}; transform: translateY(-1px); }
`;
const GhostBtn = styled.button`
  padding: 8px 13px;
  font-size: 13px;
  font-weight: 600;
  color: ${C.ink};
  background: transparent;
  border: 1px solid ${C.line};
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  &:hover { background: ${C.paper2}; border-color: ${C.lineDark}; }
`;
const Divider = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 18px 0 4px;
  color: ${C.mutedSoft};
  font-size: 12px;
  &::before, &::after { content: ''; flex: 1; height: 1px; background: ${C.line}; }
`;
const BackLink = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 600;
  color: ${C.greenDeep};
  padding: 6px 8px;
  border-radius: 8px;
  transition: background 0.15s;
  &:hover { background: rgba(164,255,17,0.12); }
`;
const Footnote = styled.p`
  font-size: 12.5px;
  color: ${C.mutedSoft};
  text-align: center;
  a { color: ${C.greenDeep}; font-weight: 600; text-decoration: none; }
  a:hover { text-decoration: underline; }
`;
