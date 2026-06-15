import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useMero, ConnectButton } from '@calimero-network/mero-react';
import { APP_DISPLAY_NAME, APP_DESCRIPTION, APP_ROUTE, THEME } from '../../config';

/**
 * One-page marketing landing — the app's front door.
 *
 * BUILD AGENT: customize the copy for the specific app — the headline, the
 * sub-headline, and the three feature cards (FEATURES below). Keep the
 * structure, the animations, and the auth wiring:
 *   - already authenticated (incl. desktop SSO skip) → go straight to the app
 *   - otherwise → animated hero + features + a ConnectButton CTA
 * Pull real product features from the spec; don't ship the placeholder copy.
 */

const FEATURES = [
  { icon: ‘\uD83C\uDFCB’, title: ‘Log every session’, body: ‘Record your activity, duration, and notes so the whole club can see you putting in the work.’ },
  { icon: ‘\uD83D\uDCE3’, title: ‘Cheer each other on’, body: "React to a friend’s workout with a cheer \u2014 instant motivation that syncs to everyone in seconds." },
  { icon: ‘\uD83C\uDFAF’, title: ‘Hit weekly goals together’, body: ‘The club creator sets a shared weekly target; a live progress bar keeps the whole group accountable.’ },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useMero();

  // Desktop auth-skip lands here already authenticated → straight into the app.
  useEffect(() => {
    if (isAuthenticated) navigate(APP_ROUTE);
  }, [isAuthenticated, navigate]);

  return (
    <Page>
      <Glow aria-hidden />
      <Hero>
        <Badge>Powered by Calimero</Badge>
        <Title>{APP_DISPLAY_NAME}</Title>
        <Subtitle>{APP_DESCRIPTION}</Subtitle>
        <Cta>
          <ConnectButton />
          <GhostBtn onClick={() => window.open('https://docs.calimero.network', '_blank', 'noopener,noreferrer')}>
            Learn more
          </GhostBtn>
        </Cta>
      </Hero>

      <Features>
        {FEATURES.map((f, i) => (
          <Card key={f.title} style={{ animationDelay: `${0.15 * i + 0.2}s` }}>
            <CardIcon>{f.icon}</CardIcon>
            <CardTitle>{f.title}</CardTitle>
            <CardBody>{f.body}</CardBody>
          </Card>
        ))}
      </Features>

      <Footer>Connect your Calimero node, create a club, and invite your crew — it takes under a minute.</Footer>
    </Page>
  );
}

// ── animations ──────────────────────────────────────────────────────────
const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
`;
const drift = keyframes`
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.55; }
  50%      { transform: translate(-50%, -54%) scale(1.15); opacity: 0.8; }
`;

const Page = styled.div`
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3rem;
  padding: 4rem 1.5rem;
  overflow: hidden;
  background: radial-gradient(1200px 600px at 50% -10%, color-mix(in srgb, var(--color-accent, ${THEME.accentColor}) 18%, transparent), transparent),
              var(--color-primary, ${THEME.primaryColor});
  color: #f4f7f2;
`;

const Glow = styled.div`
  position: absolute;
  top: 0; left: 50%;
  width: 70vw; height: 70vw;
  max-width: 760px; max-height: 760px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--color-accent, ${THEME.accentColor}) 45%, transparent), transparent 60%);
  filter: blur(40px);
  animation: ${drift} 9s ease-in-out infinite;
  pointer-events: none;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

const Hero = styled.header`
  position: relative;
  text-align: center;
  max-width: 720px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  animation: ${fadeUp} 0.7s ease both;
`;

const Badge = styled.span`
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-accent, ${THEME.accentColor}) 22%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent, ${THEME.accentColor}) 45%, transparent);
`;

const Title = styled.h1`
  font-size: clamp(2.5rem, 6vw, 4.25rem);
  font-weight: 800;
  line-height: 1.05;
  margin: 0;
  background: linear-gradient(90deg, #fff, color-mix(in srgb, var(--color-accent, ${THEME.accentColor}) 70%, #fff));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
`;

const Subtitle = styled.p`
  font-size: clamp(1rem, 2.2vw, 1.25rem);
  line-height: 1.6;
  color: #cfd8cd;
  margin: 0;
  max-width: 560px;
`;

const Cta = styled.div`
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 0.5rem;
`;

const GhostBtn = styled.button`
  padding: 0.6rem 1.2rem;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  color: #f4f7f2;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.25);
  transition: background 0.15s, border-color 0.15s;
  &:hover { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.5); }
`;

const Features = styled.section`
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.25rem;
  width: 100%;
  max-width: 920px;
`;

const Card = styled.div`
  text-align: left;
  padding: 1.5rem;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(6px);
  animation: ${fadeUp} 0.7s ease both;
  transition: transform 0.2s, border-color 0.2s;
  &:hover { transform: translateY(-4px); border-color: color-mix(in srgb, var(--color-accent, ${THEME.accentColor}) 55%, transparent); }
`;

const CardIcon = styled.div`font-size: 1.75rem; margin-bottom: 0.6rem;`;
const CardTitle = styled.h3`font-size: 1.1rem; font-weight: 700; margin: 0 0 0.4rem;`;
const CardBody = styled.p`font-size: 0.92rem; line-height: 1.55; color: #c2ccbf; margin: 0;`;

const Footer = styled.footer`
  position: relative;
  font-size: 0.85rem;
  color: #9fb09a;
  animation: ${fadeUp} 0.7s ease both;
  animation-delay: 0.7s;
`;
