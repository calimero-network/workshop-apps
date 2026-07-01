import React, { useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { ConnectButton, CalimeroLogo } from '@calimero-network/mero-react';
import { APP_DISPLAY_NAME, APP_DESCRIPTION } from '../../config';

/**
 * Landing page — Incident Command marketing page.
 *
 * Design: "sharp-operational" — dark navy header, white body, red accents.
 * Mirrors a command-center aesthetic (Datadog / PagerDuty feel).
 *
 * Sections: hero → how-it-works → features → FAQ → CTA → footer.
 * LivePreview: animated incident board showing alerts being declared,
 * acknowledged, and resolved in real time.
 */

/* ── Palette ────────────────────────────────────────────────────────────────
   Hardcoded per spec (landing is intentionally not themed).
   Primary: #1E293B (dark slate navy)  Accent: #EF4444 (red)             */
const C = {
  red: '#EF4444',
  redHover: '#DC2626',
  redDeep: '#991B1B',
  redInk: '#7F1D1D',
  ink: '#0F172A',
  ink2: '#1E293B',
  paper: '#ffffff',
  paper2: '#F8FAFC',
  line: '#E2E8F0',
  lineDark: 'rgba(239,68,68,0.16)',
  muted: '#64748B',
  mutedSoft: '#94A3B8',
} as const;

const FEATURES = [
  {
    icon: '🚨',
    title: 'Declare in seconds',
    body: 'Flag incidents with severity levels (critical → low) and alert your whole team the moment something breaks — no tickets, no lag.',
  },
  {
    icon: '💬',
    title: 'Live response threads',
    body: 'Every incident gets a shared, real-time comment thread. Post updates, @-mention responders, and keep everyone in sync without side channels.',
  },
  {
    icon: '📋',
    title: 'Built-in postmortems',
    body: 'Write timeline, root cause, and action items directly in the app, permanently linked to the incident — so your team always learns from what happened.',
  },
];

const FAQS: [string, string][] = [
  ['What is a node?', 'A node (merod) is the runtime that stores your incident data and runs the app logic. You control it — locally or on your own infrastructure — so your data never leaves your hands.'],
  ['Where does incident data live?', 'On your own node, as CRDT collections that merge conflict-free across your team\'s peers. There is no central database — your incident history is yours.'],
  ['What is a context?', 'A context is the shared, encrypted space your response team works in. Everyone in the context sees the same live incident board, synced directly between nodes.'],
  ['How do teammates join?', 'Connect your node, then share an invitation link with your team. Anyone you invite joins the context and sees the live incident board instantly — no accounts required.'],
  ['Can I use this for real on-call rotations?', 'Absolutely. The on-call badge is always visible to the team, and the dashboard sorts by severity so the most critical incidents are always at the top.'],
  ['Is it really decentralized?', 'Yes. State is peer-to-peer CRDT data on the nodes that participate. Your incident history travels with your node — no cloud database, no vendor lock-in.'],
];

const STEPS = [
  { k: '01', t: 'Connect your node', d: 'Point the app at the Calimero node you control. Your team\'s identity and incident data stay on your infrastructure.' },
  { k: '02', t: 'Open a workspace', d: 'Create or join a shared, encrypted context. Incident state syncs in real time, conflict-free, across all peers.' },
  { k: '03', t: 'Invite your team', d: 'Share a link. Responders join instantly and see the live incident board — no accounts, no onboarding friction.' },
  { k: '04', t: 'Declare, resolve, learn', d: 'Flag incidents, coordinate response in real-time threads, then write postmortems that stay with your team forever.' },
];

/* ── Scroll-reveal hook ─────────────────────────────────────────────────── */
function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { el.classList.add('is-visible'); obs.disconnect(); }
      },
      { threshold: 0.14 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

type RVariant = 'up' | 'zoom' | 'drop' | 'left';
function R({
  v = 'up', d = 0, className, style, id, children,
}: {
  v?: RVariant; d?: number; className?: string; style?: React.CSSProperties; id?: string; children: React.ReactNode;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <RBox ref={ref} $v={v} $d={d} className={className} style={style} id={id}>{children}</RBox>
  );
}

/* ── FAQ row ────────────────────────────────────────────────────────────── */
function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <FaqRow $open={open}>
      <button onClick={() => setOpen((o) => !o)}>
        <span>{q}</span>
        <i aria-hidden="true">{open ? '−' : '+'}</i>
      </button>
      <div className="ans"><p>{a}</p></div>
    </FaqRow>
  );
}

/* ── Live preview: animated incident board ──────────────────────────────── */
type AlertItem = { id: number; sev: 'CRITICAL' | 'HIGH' | 'MEDIUM'; title: string; status: 'OPEN' | 'ACK' | 'RESOLVED'; };

const SEV_COLOR: Record<AlertItem['sev'], string> = {
  CRITICAL: '#EF4444',
  HIGH: '#F97316',
  MEDIUM: '#EAB308',
};

const STATUS_LABEL: Record<AlertItem['status'], string> = {
  OPEN: '● OPEN',
  ACK: '● ACK',
  RESOLVED: '✓ RESOLVED',
};

const STATUS_COLOR: Record<AlertItem['status'], string> = {
  OPEN: '#EF4444',
  ACK: '#F97316',
  RESOLVED: '#22C55E',
};

const ONCALL = 'alice';

function LivePreview() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

    const run = () => {
      setAlerts([]);

      // t=0.6s: CRITICAL incident declared
      at(600, () => {
        setAlerts([{ id: 1, sev: 'CRITICAL', title: 'DB connection pool', status: 'OPEN' }]);
        setPulse(true);
        at(400, () => setPulse(false));
      });

      // t=1.8s: HIGH incident appears
      at(1800, () => {
        setAlerts((p) => [...p, { id: 2, sev: 'HIGH', title: 'Auth service errors', status: 'OPEN' }]);
        setPulse(true);
        at(400, () => setPulse(false));
      });

      // t=3.2s: CRITICAL acknowledged
      at(3200, () => {
        setAlerts((p) => p.map((a) => (a.id === 1 ? { ...a, status: 'ACK' as const } : a)));
        setPulse(true);
        at(350, () => setPulse(false));
      });

      // t=4.8s: MEDIUM incident appears
      at(4800, () => {
        setAlerts((p) => [...p, { id: 3, sev: 'MEDIUM', title: 'Cache miss spike', status: 'OPEN' }]);
        setPulse(true);
        at(350, () => setPulse(false));
      });

      // t=6.2s: CRITICAL resolved (removed from board)
      at(6200, () => {
        setAlerts((p) => p.filter((a) => a.id !== 1));
        setPulse(true);
        at(350, () => setPulse(false));
      });

      // t=7.6s: HIGH acknowledged
      at(7600, () => {
        setAlerts((p) => p.map((a) => (a.id === 2 ? { ...a, status: 'ACK' as const } : a)));
        setPulse(true);
        at(350, () => setPulse(false));
      });
    };

    run();
    const loop = window.setInterval(run, 9800);
    return () => { timers.forEach(window.clearTimeout); window.clearInterval(loop); };
  }, []);

  return (
    <Preview aria-hidden="true">
      {/* Title bar */}
      <div className="bar">
        <s style={{ background: '#ff5f56' }} />
        <s style={{ background: '#ffbd2e' }} />
        <s style={{ background: C.red }} />
        <span>
          <CalimeroLogo size={12} color={C.red} />
          {' '}{APP_DISPLAY_NAME.toLowerCase()} · incident board
        </span>
        <em className={pulse ? 'on' : ''}>● {pulse ? 'syncing' : 'live'}</em>
      </div>

      {/* On-call strip */}
      <div className="oncall-strip">
        <span className="dot" aria-hidden>🔴</span>
        <span>On call: <strong>{ONCALL}</strong></span>
      </div>

      {/* Incident rows */}
      <div className="board">
        <div className="board-header">
          <span>Active Incidents</span>
          <span className="count">{alerts.length}</span>
        </div>
        <div className="rows">
          {alerts.length === 0 ? (
            <div className="empty">No active incidents</div>
          ) : (
            alerts.map((a) => (
              <div key={a.id} className="alert-row">
                <span className="sev" style={{ background: SEV_COLOR[a.sev] }}>{a.sev}</span>
                <span className="title">{a.title}</span>
                <span className="status" style={{ color: STATUS_COLOR[a.status] }}>
                  {STATUS_LABEL[a.status]}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </Preview>
  );
}

/* ── Main export ────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Root>
      {/* ── Header ────────────────────────────────────────────── */}
      <Header>
        <Brand>
          <span className="mark"><CalimeroLogo size={22} color={C.red} /></span>
          <span className="wm">{APP_DISPLAY_NAME}</span>
        </Brand>
        <Nav>
          <a href="#how" onClick={go('how')}>How it works</a>
          <a href="#features" onClick={go('features')}>Features</a>
          <a href="#faq" onClick={go('faq')}>FAQ</a>
          <a href="https://docs.calimero.network" target="_blank" rel="noreferrer">Docs ↗</a>
          <a href="https://github.com/calimero-network" target="_blank" rel="noreferrer">GitHub ↗</a>
        </Nav>
        <div className="cta"><ConnectButton /></div>
      </Header>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <Hero>
        <Glow />
        <Grid />
        <HeroInner>
          <Eyebrow>
            <CalimeroLogo size={12} color={C.redDeep} /> Powered by Calimero
          </Eyebrow>
          <H1>Incident response,<br />owned by your team.</H1>
          <Lede>
            Declare, coordinate, and resolve incidents in real time — with a shared, decentralized workspace your team controls completely.
          </Lede>
          <Cta>
            <ConnectButton />
            <GhostBtn onClick={() => window.open('https://docs.calimero.network', '_blank', 'noopener,noreferrer')}>
              Learn more
            </GhostBtn>
          </Cta>
          <TrustRow>
            <span>Real-time CRDT sync</span><i />
            <span>Peer-to-peer</span><i />
            <span>No central server</span>
          </TrustRow>
        </HeroInner>
        <PreviewWrap><LivePreview /></PreviewWrap>
      </Hero>

      {/* ── How it works ──────────────────────────────────────── */}
      <Section id="how" $alt>
        <Inner>
          <R v="up">
            <Kicker>How it works</Kicker>
            <H2>From alert to resolution — without a central war room</H2>
            <Sub>Connect your node, invite your team, and you&apos;re coordinating incident response in seconds.</Sub>
          </R>
          <Pipeline>
            <span className="track" />
            <span className="pulse" />
            {STEPS.map((s, i) => (
              <R v="drop" d={0.12 + i * 0.12} key={s.k}>
                <div className="stage">
                  <div className="dot"><b>{s.k}</b></div>
                  <h4>{s.t}</h4>
                  <p>{s.d}</p>
                </div>
              </R>
            ))}
          </Pipeline>
        </Inner>
      </Section>

      {/* ── Features ──────────────────────────────────────────── */}
      <Section id="features">
        <Inner>
          <R v="up">
            <Kicker>Why it&apos;s different</Kicker>
            <H2>Incident management built on the Calimero network</H2>
          </R>
          <Cards>
            {FEATURES.map((f, i) => (
              <R v="drop" d={i * 0.12} key={f.title}>
                <Card>
                  <span className="ic">{f.icon}</span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </Card>
              </R>
            ))}
          </Cards>
        </Inner>
      </Section>

      {/* ── FAQ ───────────────────────────────────────────────── */}
      <Section id="faq" $alt>
        <Inner style={{ maxWidth: 760 }}>
          <R v="up">
            <Kicker>FAQ</Kicker>
            <H2>Nodes, contexts &amp; your incident data</H2>
          </R>
          <FaqList>
            {FAQS.map(([q, a], i) => (
              <R v="left" d={i * 0.06} key={q}><Faq q={q} a={a} /></R>
            ))}
          </FaqList>
        </Inner>
      </Section>

      {/* ── Final CTA ─────────────────────────────────────────── */}
      <CtaBand>
        <R v="zoom">
          <h2>Your team. Your data. Your incident command.</h2>
          <p>Connect your node in seconds — and start responding together.</p>
          <div className="btn"><ConnectButton /></div>
        </R>
      </CtaBand>

      {/* ── Footer ────────────────────────────────────────────── */}
      <Footer>
        <div className="top">
          <div className="brand">
            <span className="wm"><span className="mk"><CalimeroLogo size={18} color={C.red} /></span> {APP_DISPLAY_NAME}</span>
            <p>Decentralized incident management for teams that own their data.</p>
          </div>
          <div className="cols">
            <div>
              <h5>App</h5>
              <a href="#how" onClick={go('how')}>How it works</a>
              <a href="#features" onClick={go('features')}>Features</a>
              <a href="#faq" onClick={go('faq')}>FAQ</a>
            </div>
            <div>
              <h5>Calimero</h5>
              <a href="https://calimero.network" target="_blank" rel="noreferrer">Website</a>
              <a href="https://docs.calimero.network" target="_blank" rel="noreferrer">Docs</a>
              <a href="https://github.com/calimero-network/core" target="_blank" rel="noreferrer">Core node</a>
            </div>
            <div>
              <h5>Community</h5>
              <a href="https://github.com/calimero-network" target="_blank" rel="noreferrer">GitHub</a>
              <a href="https://x.com/CalimeroNetwork" target="_blank" rel="noreferrer">X / Twitter</a>
              <a href="https://discord.gg/calimero" target="_blank" rel="noreferrer">Discord</a>
            </div>
          </div>
        </div>
        <div className="bottom">
          <span>Built on Calimero</span>
          <span>Self-sovereign by design</span>
        </div>
      </Footer>
    </Root>
  );
}

/* ════════════════════════ keyframes ════════════════════════ */
const float = keyframes`0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(14px,-18px) scale(1.05);}`;
const drift = keyframes`0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(-22px,14px) scale(1.07);}`;
const travel = keyframes`0%{left:0;opacity:0;}8%{opacity:1;}92%{opacity:1;}100%{left:100%;opacity:0;}`;
const rowIn = keyframes`from{opacity:0;transform:translateY(7px) scale(0.97);}to{opacity:1;transform:none;}`;

/* ════════════════════════ layout ════════════════════════ */
const Root = styled.div`
  position: fixed;
  inset: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: ${C.paper};
  color: ${C.ink};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
`;

const Header = styled.header`
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px clamp(18px, 5vw, 56px);
  background: rgba(255, 255, 255, 0.90);
  backdrop-filter: saturate(160%) blur(14px);
  border-bottom: 2px solid ${C.red};
  .cta { margin-left: auto; }
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
  .mark { display: flex; }
  .wm { font-size: 15px; letter-spacing: -0.3px; color: ${C.ink}; font-weight: 800; }
`;

const Nav = styled.nav`
  display: flex;
  gap: 26px;
  margin-left: auto;
  a {
    font-size: 13px;
    font-weight: 500;
    color: ${C.muted};
    cursor: pointer;
    text-decoration: none;
    transition: color 0.18s;
    &:hover { color: ${C.ink}; }
  }
  & + .cta { margin-left: 0; }
  @media (max-width: 880px) { display: none; }
`;

/* hero */
const Hero = styled.section`
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: clamp(24px, 5vw, 64px);
  align-items: center;
  padding: clamp(56px, 8vw, 104px) clamp(18px, 5vw, 56px) clamp(64px, 9vw, 110px);
  background: radial-gradient(1200px 480px at 75% -10%, rgba(239,68,68,0.07) 0%, rgba(255,255,255,0) 60%), ${C.paper};
  @media (max-width: 940px) { grid-template-columns: 1fr; }
  @media (max-width: 560px) { padding: 40px 18px 56px; gap: 30px; }
`;

const Glow = styled.div`
  position: absolute;
  width: 440px;
  height: 440px;
  border-radius: 50%;
  top: -140px;
  right: -100px;
  background: radial-gradient(circle, rgba(239,68,68,0.3), rgba(239,68,68,0) 68%);
  filter: blur(30px);
  animation: ${float} 11s ease-in-out infinite;
  pointer-events: none;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

const Grid = styled.div`
  position: absolute;
  inset: 0;
  background-image: linear-gradient(${C.line} 1px, transparent 1px), linear-gradient(90deg, ${C.line} 1px, transparent 1px);
  background-size: 46px 46px;
  mask-image: radial-gradient(680px 380px at 30% 30%, #000 0%, transparent 75%);
  opacity: 0.5;
  pointer-events: none;
`;

const HeroInner = styled.div`
  position: relative;
  z-index: 1;
  max-width: 580px;
`;

const Eyebrow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${C.redDeep};
  background: rgba(239,68,68,0.10);
  border: 1px solid rgba(239,68,68,0.35);
  padding: 5px 11px;
  border-radius: 999px;
`;

const H1 = styled.h1`
  margin: 20px 0 16px;
  font-size: clamp(34px, 6vw, 56px);
  line-height: 1.04;
  letter-spacing: -1.8px;
  font-weight: 800;
  color: ${C.ink};
`;

const Lede = styled.p`
  font-size: 16px;
  color: ${C.muted};
  max-width: 500px;
  margin-bottom: 26px;
`;

const Cta = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
`;

const GhostBtn = styled.button`
  padding: 11px 18px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  color: ${C.ink};
  background: ${C.paper};
  border: 1px solid ${C.line};
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
  &:hover { background: ${C.paper2}; border-color: ${C.mutedSoft}; transform: translateY(-1px); }
`;

const TrustRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 30px;
  span { font-size: 12px; font-weight: 500; color: ${C.muted}; }
  i { width: 4px; height: 4px; border-radius: 50%; background: ${C.red}; }
`;

/* live preview */
const PreviewWrap = styled.div`
  position: relative;
  z-index: 1;
  animation: ${float} 9s ease-in-out infinite;
  @media (max-width: 940px) { animation: none; }
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

const Preview = styled.div`
  border: 1px solid rgba(239,68,68,0.25);
  border-top: 2px solid ${C.red};
  border-radius: 14px;
  background: ${C.ink};
  box-shadow: 0 30px 70px -30px rgba(15,23,42,0.6);
  overflow: hidden;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;

  .bar {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(239,68,68,0.2);
    background: ${C.ink2};
    s { width: 10px; height: 10px; border-radius: 50%; }
    span {
      margin-left: 8px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: 11px;
      color: ${C.mutedSoft};
    }
    em {
      margin-left: auto;
      font-style: normal;
      font-size: 10px;
      color: ${C.mutedSoft};
      transition: color 0.3s;
    }
    em.on { color: ${C.red}; }
  }

  .oncall-strip {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 14px;
    background: rgba(239,68,68,0.12);
    border-bottom: 1px solid rgba(239,68,68,0.2);
    font-size: 11px;
    color: #ddd;
    .dot { font-size: 9px; }
    strong { color: #fff; font-weight: 700; }
  }

  .board {
    padding: 12px 14px;
    min-height: 200px;
  }

  .board-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${C.mutedSoft};
    margin-bottom: 10px;
  }

  .count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    font-size: 10px;
    font-weight: 800;
    background: ${C.red};
    color: #fff;
  }

  .rows { display: flex; flex-direction: column; gap: 7px; }

  .alert-row {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 10px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 7px;
    animation: ${rowIn} 0.32s cubic-bezier(0.22,1,0.36,1) both;
  }

  .sev {
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: #fff;
    flex-shrink: 0;
  }

  .title {
    font-size: 11px;
    color: #e2e8f0;
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .status {
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .empty {
    font-size: 11px;
    color: ${C.mutedSoft};
    text-align: center;
    padding: 24px 0;
  }
`;

/* sections */
const Section = styled.section<{ $alt?: boolean }>`
  padding: clamp(58px, 8vw, 104px) clamp(18px, 5vw, 56px);
  background: ${(p) => (p.$alt ? C.paper2 : C.paper)};
  border-top: 1px solid ${C.line};
  scroll-margin-top: 76px;
  @media (max-width: 560px) { padding: 46px 18px; }
`;

const Inner = styled.div`max-width: 1040px; margin: 0 auto;`;

const RBox = styled.div<{ $v: RVariant; $d: number }>`
  opacity: 0;
  will-change: opacity, transform;
  transform: ${(p) =>
    p.$v === 'zoom' ? 'scale(0.9)'
    : p.$v === 'drop' ? 'translateY(-46px)'
    : p.$v === 'left' ? 'translateX(-44px)'
    : 'translateY(30px)'};
  transition:
    opacity 0.7s ${(p) => p.$d}s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.72s ${(p) => p.$d}s ${(p) =>
      p.$v === 'drop' ? 'cubic-bezier(0.2, 0.85, 0.3, 1.25)' : 'cubic-bezier(0.22, 1, 0.36, 1)'};
  &.is-visible { opacity: 1; transform: none; }
  @media (prefers-reduced-motion: reduce) { opacity: 1; transform: none; transition: none; }
`;

const Kicker = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${C.redDeep};
  margin-bottom: 12px;
`;

const H2 = styled.h2`
  font-size: clamp(24px, 3.4vw, 33px);
  line-height: 1.12;
  letter-spacing: -0.9px;
  font-weight: 700;
  color: ${C.ink};
  max-width: 720px;
`;

const Sub = styled.p`margin-top: 13px; font-size: 14.5px; color: ${C.muted}; max-width: 600px;`;

const Pipeline = styled.div`
  position: relative;
  margin-top: 52px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 22px;
  .track { position: absolute; top: 19px; left: 6%; right: 6%; height: 2px; background: linear-gradient(90deg, ${C.line}, rgba(239,68,68,0.4), ${C.line}); }
  .pulse { position: absolute; top: 14px; width: 12px; height: 12px; border-radius: 50%; background: ${C.red}; box-shadow: 0 0 0 5px rgba(239,68,68,0.22); animation: ${travel} 4.2s ease-in-out infinite; }
  .stage { position: relative; text-align: left; }
  .dot { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; background: ${C.paper}; border: 1px solid ${C.line}; box-shadow: 0 6px 16px -8px rgba(15,23,42,0.3); margin-bottom: 14px; }
  .dot b { font-size: 13px; font-weight: 700; color: ${C.redDeep}; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
  .stage h4 { font-size: 15px; font-weight: 700; color: ${C.ink}; margin-bottom: 6px; letter-spacing: -0.2px; }
  .stage p { font-size: 13px; color: ${C.muted}; }
  @media (max-width: 760px) {
    grid-template-columns: 1fr 1fr;
    .track, .pulse { display: none; }
  }
  @media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
`;

const Cards = styled.div`
  margin-top: 40px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  @media (max-width: 820px) { grid-template-columns: 1fr; }
`;

const Card = styled.div`
  padding: 24px 22px;
  border: 1px solid ${C.line};
  border-radius: 14px;
  background: ${C.paper};
  height: 100%;
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
  .ic { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 11px; background: rgba(239,68,68,0.10); font-size: 20px; margin-bottom: 14px; }
  h3 { font-size: 16px; font-weight: 700; letter-spacing: -0.3px; color: ${C.ink}; margin-bottom: 7px; }
  p { font-size: 13.5px; color: ${C.muted}; }
  &:hover { transform: translateY(-3px); border-color: rgba(239,68,68,0.45); box-shadow: 0 18px 40px -24px rgba(15,23,42,0.3); }
`;

const FaqList = styled.div`margin-top: 34px; border-top: 1px solid ${C.line};`;
const FaqRow = styled.div<{ $open: boolean }>`
  border-bottom: 1px solid ${C.line};
  button {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 2px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.2px;
    color: ${C.ink};
    i { font-style: normal; flex-shrink: 0; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 7px; font-size: 16px; color: ${C.redDeep}; background: rgba(239,68,68,0.10); }
  }
  .ans { overflow: hidden; max-height: ${(p) => (p.$open ? '240px' : '0')}; transition: max-height 0.32s ease; }
  .ans p { padding: 0 2px 20px; font-size: 14px; color: ${C.muted}; max-width: 660px; }
`;

const CtaBand = styled.section`
  position: relative;
  overflow: hidden;
  text-align: center;
  padding: clamp(58px, 8vw, 92px) 24px;
  background: radial-gradient(700px 280px at 50% 120%, rgba(239,68,68,0.20), transparent 70%), ${C.ink};
  border-top: 1px solid rgba(239,68,68,0.2);
  h2 { font-size: clamp(22px, 3.6vw, 32px); font-weight: 700; letter-spacing: -0.8px; color: ${C.paper}; }
  p { margin: 12px 0 24px; font-size: 14.5px; color: ${C.mutedSoft}; }
  .btn { display: inline-flex; }
  &::after {
    content: '';
    position: absolute;
    width: 360px;
    height: 360px;
    border-radius: 50%;
    left: -120px;
    bottom: -180px;
    background: radial-gradient(circle, rgba(239,68,68,0.25), transparent 68%);
    filter: blur(24px);
    animation: ${drift} 12s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) { &::after { animation: none; } }
`;

const Footer = styled.footer`
  background: ${C.ink};
  color: ${C.mutedSoft};
  padding: 54px clamp(18px, 5vw, 56px) 30px;
  .top { max-width: 1040px; margin: 0 auto; display: grid; grid-template-columns: 1.3fr 2fr; gap: 40px; }
  @media (max-width: 760px) { .top { grid-template-columns: 1fr; gap: 28px; } }
  .brand .wm { display: inline-flex; align-items: center; gap: 9px; font-size: 15px; font-weight: 700; color: ${C.paper}; }
  .brand .mk { display: flex; }
  .brand p { margin-top: 10px; font-size: 13px; max-width: 280px; }
  .cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  @media (max-width: 560px) { .cols { grid-template-columns: 1fr 1fr; gap: 20px 24px; } }
  .cols h5 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: ${C.paper}; margin-bottom: 12px; }
  .cols a { display: block; font-size: 13px; color: ${C.mutedSoft}; text-decoration: none; margin-bottom: 9px; cursor: pointer; transition: color 0.16s; &:hover { color: ${C.red}; } }
  .bottom { max-width: 1040px; margin: 36px auto 0; padding-top: 20px; border-top: 1px solid rgba(239,68,68,0.15); display: flex; justify-content: space-between; gap: 12px; font-size: 12px; flex-wrap: wrap; }
`;
