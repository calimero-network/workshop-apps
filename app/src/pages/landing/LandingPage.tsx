import React, { useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { ConnectButton, CalimeroLogo } from '@calimero-network/mero-react';
import { APP_DISPLAY_NAME, APP_DESCRIPTION } from '../../config';

/**
 * One-page marketing landing — the app's front door.
 *
 * White, professional Calimero aesthetic (neon green on paper + near-black),
 * mirroring Calimero Studio's landing. Scroll-reveal animations, an animated
 * live preview, a features grid and a FAQ about nodes / contexts / data.
 *
 * BUILD AGENT: customize the copy for the specific app — the headline, the
 * sub-headline, the three FEATURES, and the FAQ answers. Keep the structure,
 * the animations, the brand palette (C) and the auth wiring:
 *   - already authenticated (incl. desktop SSO skip) → go straight to the app
 *   - otherwise → animated landing + a ConnectButton CTA
 * Pull real product features from the spec; don't ship the placeholder copy.
 */

/* ── sprint-retro brand palette — violet + pink on white + near-black ──────── */
const C = {
  green: '#7C3AED',   // brand primary (key name kept from the foundation palette)
  greenHover: '#6D28D9',
  greenDeep: '#5B21B6',
  greenInk: '#6D28D9',
  pink: '#EC4899',    // accent — votes / "you"
  ink: '#1a1626',
  ink2: '#241d33',
  paper: '#ffffff',
  paper2: '#f7f5fb',
  line: '#ece8f3',
  lineDark: 'rgba(124,58,237,0.16)',
  muted: '#6b6480',
  mutedSoft: '#9a93ad',
} as const;

/* ConnectButton + its login popup use the default mero-react theme — its default
   button + dark login modal keep proper internal contrast, so we don't override
   the theme here (doing so broke the modal's contrast). */

const FEATURES = [
  { icon: '🗂️', title: 'Three columns, one board', body: 'Capture what went well, what to improve and the action items — everyone adds to the same live board.' },
  { icon: '⬆️', title: 'Vote on what matters', body: 'Upvote the cards that resonate, one vote each, so the team surfaces the most important themes first.' },
  { icon: '✅', title: 'Track the follow-through', body: 'Turn discussion into action items and check them off — synced live across every teammate.' },
];

const FAQS: [string, string][] = [
  ['How do my teammates join a retro?', 'Create a retro and share the invitation link. Anyone you invite joins the same board — their cards, votes and updates sync live within seconds. No accounts, no sign-up.'],
  ['Where do the cards and votes live?', 'On your own Calimero node, as CRDT collections that merge conflict-free across peers. There is no central server holding your team’s retrospective.'],
  ['What is a context?', 'A context is the shared, encrypted space your retro runs in. Everyone in it sees the same columns, cards and vote counts in real time, synced directly between nodes.'],
  ['Can two people add cards at the same time?', 'Yes. Cards, votes and done-states are CRDTs, so simultaneous edits from different teammates merge automatically — no locks, no lost updates.'],
  ['Do I need crypto or a wallet?', 'No. You connect with a node identity. There is no token, no wallet and no gas — just your node and the people you invite.'],
  ['Is it really decentralized?', 'Yes. The board is peer-to-peer CRDT data on the nodes taking part. Take your node offline and your retro goes with it; bring it back and it re-syncs.'],
];

/* ── scroll-reveal hook + wrapper (variants: up / zoom / drop / left) ──────── */
function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-visible');
          obs.disconnect();
        }
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
  v = 'up',
  d = 0,
  className,
  style,
  id,
  children,
}: {
  v?: RVariant;
  d?: number;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  children: React.ReactNode;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <RBox ref={ref} $v={v} $d={d} className={className} style={style} id={id}>
      {children}
    </RBox>
  );
}

const STEPS = [
  { k: '01', t: 'Connect your node', d: 'Point the app at the Calimero node you control. Your identity and keys stay on your machine.' },
  { k: '02', t: 'Start a retro', d: 'Create a board with three columns and share the invite link with your team.' },
  { k: '03', t: 'Add & vote together', d: 'Everyone drops cards into columns and upvotes the themes that matter — live, within seconds.' },
  { k: '04', t: 'Track action items', d: 'Turn decisions into action items and check them off as they ship. No central server, ever.' },
];

/* ── animated live preview: a retro board fills with cards + votes, loops ──── */
const COLS = [
  { label: 'Went well', accent: '#10b981' },
  { label: 'To improve', accent: '#f59e0b' },
  { label: 'Actions', accent: C.green },
];

type Step =
  | { t: 'add'; id: number; col: number; text: string; mine?: boolean }
  | { t: 'vote'; id: number }
  | { t: 'done'; id: number };

const SCRIPT: Step[] = [
  { t: 'add', id: 1, col: 0, text: 'Shipped on time 🚀' },
  { t: 'add', id: 2, col: 1, text: 'CI kept flaking' },
  { t: 'vote', id: 2 },
  { t: 'add', id: 3, col: 0, text: 'Pairing went great', mine: true },
  { t: 'vote', id: 1 },
  { t: 'add', id: 4, col: 2, text: 'Add a deploy retry' },
  { t: 'vote', id: 4 },
  { t: 'done', id: 4 },
];

type PCard = { id: number; col: number; text: string; votes: number; done: boolean; mine: boolean };

function LivePreview() {
  const [cards, setCards] = useState<PCard[]>([]);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    let i = 0;
    let flashTimer = 0;
    const flash = () => {
      setPulse(true);
      window.clearTimeout(flashTimer);
      flashTimer = window.setTimeout(() => setPulse(false), 340);
    };
    const tick = () => {
      if (i >= SCRIPT.length) { setCards([]); i = 0; return; } // one blank beat, then loop
      const step = SCRIPT[i];
      if (step.t === 'add') {
        setCards((p) => [...p, { id: step.id, col: step.col, text: step.text, votes: 0, done: false, mine: !!step.mine }]);
      } else if (step.t === 'vote') {
        setCards((p) => p.map((c) => (c.id === step.id ? { ...c, votes: c.votes + 1 } : c)));
      } else {
        setCards((p) => p.map((c) => (c.id === step.id ? { ...c, done: true } : c)));
      }
      flash();
      i += 1;
    };
    const loop = window.setInterval(tick, 1150);
    return () => { window.clearInterval(loop); window.clearTimeout(flashTimer); };
  }, []);

  return (
    <Preview aria-hidden="true">
      <div className="bar">
        <s style={{ background: '#ff5f56' }} />
        <s style={{ background: '#ffbd2e' }} />
        <s style={{ background: C.green }} />
        <span><CalimeroLogo size={13} color={C.green} /> {APP_DISPLAY_NAME.toLowerCase()} · your node</span>
        <em className={pulse ? 'on' : ''}>● {pulse ? 'syncing' : 'live'}</em>
      </div>
      <div className="board">
        {COLS.map((col, ci) => (
          <div className="col" key={col.label}>
            <h6><i style={{ background: col.accent }} /> {col.label}</h6>
            <div className="stack">
              {cards.filter((c) => c.col === ci).map((c) => (
                <div key={c.id} className={`card ${c.mine ? 'mine' : ''} ${c.done ? 'done' : ''}`}>
                  <p>{c.done ? '✓ ' : ''}{c.text}</p>
                  <span className="v">▲ {c.votes}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Preview>
  );
}

/* ── FAQ row ───────────────────────────────────────────────────────────────── */
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

export default function LandingPage() {
  // Auth redirects (incl. desktop SSO skip) are handled by <RedirectIfAuthed>
  // in App.tsx, which waits for the async auth probe before navigating.

  // Real href keeps anchors keyboard-focusable; onClick upgrades to smooth scroll.
  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Root>
      {/* ── header ─────────────────────────────────────────────── */}
      <Header>
        <Brand>
          <span className="mark"><CalimeroLogo size={24} color={C.greenInk} /></span>
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

      {/* ── hero ───────────────────────────────────────────────── */}
      <Hero>
        <Glow />
        <Grid />
        <HeroInner>
          <Eyebrow>
            <CalimeroLogo size={13} color={C.greenDeep} /> Powered by Calimero
          </Eyebrow>
          <H1>Sprint retros your whole team runs together.</H1>
          <Lede>{APP_DESCRIPTION}</Lede>
          <Cta>
            <ConnectButton />
            <GhostBtn onClick={() => window.open('https://docs.calimero.network', '_blank', 'noopener,noreferrer')}>
              Learn more
            </GhostBtn>
          </Cta>
          <TrustRow>
            <span>Live in seconds</span><i />
            <span>One vote per card</span><i />
            <span>Private by design</span>
          </TrustRow>
        </HeroInner>
        <PreviewWrap><LivePreview /></PreviewWrap>
      </Hero>

      {/* ── how it works ───────────────────────────────────────── */}
      <Section id="how" $alt>
        <Inner>
          <R v="up">
            <Kicker>How it works</Kicker>
            <H2>From your node to a shared app — in four moves</H2>
            <Sub>No accounts, no servers, no setup friction. Connect a node and you’re collaborating.</Sub>
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

      {/* ── features ───────────────────────────────────────────── */}
      <Section id="features">
        <Inner>
          <R v="up">
            <Kicker>Why it’s different</Kicker>
            <H2>Built on the Calimero network</H2>
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

      {/* ── FAQ ────────────────────────────────────────────────── */}
      <Section id="faq" $alt>
        <Inner style={{ maxWidth: 760 }}>
          <R v="up">
            <Kicker>FAQ</Kicker>
            <H2>Nodes, contexts &amp; your data</H2>
          </R>
          <FaqList>
            {FAQS.map(([q, a], i) => (
              <R v="left" d={i * 0.06} key={q}><Faq q={q} a={a} /></R>
            ))}
          </FaqList>
        </Inner>
      </Section>

      {/* ── final CTA ──────────────────────────────────────────── */}
      <CtaBand>
        <R v="zoom">
          <h2>Connect your node to get started.</h2>
          <p>It takes seconds — your data never leaves your control.</p>
          <div className="btn"><ConnectButton /></div>
        </R>
      </CtaBand>

      {/* ── footer ─────────────────────────────────────────────── */}
      <Footer>
        <div className="top">
          <div className="brand">
            <span className="wm"><span className="mk"><CalimeroLogo size={20} color={C.green} /></span> {APP_DISPLAY_NAME}</span>
            <p>Private. Real-time. Yours.</p>
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
const rowIn = keyframes`from{opacity:0;transform:translateY(8px) scale(0.97);}to{opacity:1;transform:none;}`;

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
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: saturate(160%) blur(14px);
  border-bottom: 1px solid ${C.line};
  .cta { margin-left: auto; }
`;
const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
  .mark { display: flex; }
  .wm { font-size: 15px; letter-spacing: -0.3px; color: ${C.ink}; font-weight: 700; }
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
  background: radial-gradient(1200px 480px at 75% -10%, #efe7ff 0%, rgba(255, 255, 255, 0) 60%), ${C.paper};
  @media (max-width: 940px) { grid-template-columns: 1fr; }
  @media (max-width: 560px) { padding: 40px 18px 56px; gap: 30px; }
`;
const Glow = styled.div`
  position: absolute;
  width: 420px;
  height: 420px;
  border-radius: 50%;
  top: -140px;
  right: -80px;
  background: radial-gradient(circle, rgba(124, 58, 237, 0.42), rgba(236, 72, 153, 0) 68%);
  filter: blur(26px);
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
  color: ${C.greenDeep};
  background: rgba(124, 58, 237, 0.12);
  border: 1px solid rgba(124, 58, 237, 0.34);
  padding: 5px 11px;
  border-radius: 999px;
`;
const H1 = styled.h1`
  margin: 20px 0 16px;
  font-size: clamp(36px, 6vw, 58px);
  line-height: 1.03;
  letter-spacing: -1.6px;
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
  &:hover { background: ${C.paper2}; border-color: ${C.lineDark}; transform: translateY(-1px); }
`;
const TrustRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 30px;
  span { font-size: 12px; font-weight: 500; color: ${C.muted}; }
  i { width: 4px; height: 4px; border-radius: 50%; background: ${C.green}; }
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
  border: 1px solid ${C.line};
  border-radius: 14px;
  background: ${C.ink};
  box-shadow: 0 30px 70px -30px rgba(26, 22, 38, 0.55);
  overflow: hidden;
  .bar {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 11px 14px;
    border-bottom: 1px solid ${C.lineDark};
    background: ${C.ink2};
    s { width: 10px; height: 10px; border-radius: 50%; }
    span {
      margin-left: 8px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: 11.5px;
      color: ${C.mutedSoft};
      font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    }
    em {
      margin-left: auto;
      font-style: normal;
      font-size: 10.5px;
      font-family: ui-monospace, 'SF Mono', Menlo, monospace;
      color: ${C.mutedSoft};
      transition: color 0.3s;
    }
    em.on { color: ${C.pink}; }
  }
  .board { padding: 14px; min-height: 230px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; align-items: start; }
  .col h6 {
    display: flex; align-items: center; gap: 6px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
    color: ${C.mutedSoft}; margin-bottom: 9px;
  }
  .col h6 i { width: 7px; height: 7px; border-radius: 2px; flex-shrink: 0; }
  .stack { display: flex; flex-direction: column; gap: 7px; }
  .card {
    animation: ${rowIn} 0.34s cubic-bezier(0.22, 1, 0.36, 1) both;
    display: flex; flex-direction: column; gap: 6px;
    padding: 7px 8px; border-radius: 9px;
    background: rgba(255, 255, 255, 0.05); border: 1px solid ${C.lineDark};
  }
  .card p { font-size: 11px; line-height: 1.35; color: #ddd6f5; }
  .card .v {
    align-self: flex-start; font-size: 10px; font-weight: 700; color: ${C.pink};
    background: rgba(236, 72, 153, 0.14); border: 1px solid rgba(236, 72, 153, 0.32);
    border-radius: 999px; padding: 1px 7px;
  }
  .card.mine { background: rgba(124, 58, 237, 0.16); border-color: rgba(124, 58, 237, 0.5); }
  .card.mine p { color: #efeaff; }
  .card.done p { text-decoration: line-through; opacity: 0.6; }
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
    p.$v === 'zoom'
      ? 'scale(0.9)'
      : p.$v === 'drop'
        ? 'translateY(-46px)'
        : p.$v === 'left'
          ? 'translateX(-44px)'
          : 'translateY(30px)'};
  transition:
    opacity 0.7s ${(p) => p.$d}s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.72s ${(p) => p.$d}s
      ${(p) => (p.$v === 'drop' ? 'cubic-bezier(0.2, 0.85, 0.3, 1.25)' : 'cubic-bezier(0.22, 1, 0.36, 1)')};
  &.is-visible { opacity: 1; transform: none; }
  @media (prefers-reduced-motion: reduce) { opacity: 1; transform: none; transition: none; }
`;

const Kicker = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${C.greenDeep};
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

/* pipeline */
const Pipeline = styled.div`
  position: relative;
  margin-top: 52px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 22px;
  .track { position: absolute; top: 19px; left: 6%; right: 6%; height: 2px; background: linear-gradient(90deg, ${C.line}, #cdb8f5, ${C.line}); }
  .pulse { position: absolute; top: 14px; width: 12px; height: 12px; border-radius: 50%; background: ${C.green}; box-shadow: 0 0 0 5px rgba(124, 58, 237, 0.25); animation: ${travel} 4.2s ease-in-out infinite; }
  .stage { position: relative; text-align: left; }
  .dot { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; background: ${C.paper}; border: 1px solid ${C.line}; box-shadow: 0 6px 16px -8px rgba(14, 20, 15, 0.3); margin-bottom: 14px; }
  .dot b { font-size: 13px; font-weight: 700; color: ${C.greenDeep}; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
  .stage h4 { font-size: 15px; font-weight: 700; color: ${C.ink}; margin-bottom: 6px; letter-spacing: -0.2px; }
  .stage p { font-size: 13px; color: ${C.muted}; }
  @media (max-width: 760px) {
    grid-template-columns: 1fr 1fr;
    .track, .pulse { display: none; }
  }
  @media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
`;

/* feature cards */
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
  .ic { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 11px; background: rgba(124, 58, 237, 0.14); font-size: 20px; margin-bottom: 14px; }
  h3 { font-size: 16px; font-weight: 700; letter-spacing: -0.3px; color: ${C.ink}; margin-bottom: 7px; }
  p { font-size: 13.5px; color: ${C.muted}; }
  &:hover { transform: translateY(-3px); border-color: rgba(124, 58, 237, 0.55); box-shadow: 0 18px 40px -24px rgba(26, 22, 38, 0.4); }
`;

/* faq */
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
    i { font-style: normal; flex-shrink: 0; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 7px; font-size: 16px; color: ${C.greenInk}; background: rgba(124, 58, 237, 0.14); }
  }
  .ans { overflow: hidden; max-height: ${(p) => (p.$open ? '240px' : '0')}; transition: max-height 0.32s ease; }
  .ans p { padding: 0 2px 20px; font-size: 14px; color: ${C.muted}; max-width: 660px; }
`;

/* final CTA */
const CtaBand = styled.section`
  position: relative;
  overflow: hidden;
  text-align: center;
  padding: clamp(58px, 8vw, 92px) 24px;
  background: radial-gradient(700px 280px at 50% 120%, rgba(236, 72, 153, 0.22), transparent 70%), ${C.ink};
  border-top: 1px solid ${C.lineDark};
  h2 { font-size: clamp(24px, 3.6vw, 34px); font-weight: 700; letter-spacing: -0.8px; color: ${C.paper}; }
  p { margin: 12px 0 24px; font-size: 14.5px; color: ${C.mutedSoft}; }
  .btn { display: inline-flex; }
  &::after { content: ''; position: absolute; width: 360px; height: 360px; border-radius: 50%; left: -120px; bottom: -180px; background: radial-gradient(circle, rgba(124, 58, 237, 0.32), transparent 68%); filter: blur(24px); animation: ${drift} 12s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) { &::after { animation: none; } }
`;

/* footer */
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
  .cols a { display: block; font-size: 13px; color: ${C.mutedSoft}; text-decoration: none; margin-bottom: 9px; cursor: pointer; transition: color 0.16s; &:hover { color: ${C.green}; } }
  .bottom { max-width: 1040px; margin: 36px auto 0; padding-top: 20px; border-top: 1px solid ${C.lineDark}; display: flex; justify-content: space-between; gap: 12px; font-size: 12px; flex-wrap: wrap; }
`;
