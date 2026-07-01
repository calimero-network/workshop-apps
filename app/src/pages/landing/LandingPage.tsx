import React, { useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { ConnectButton, CalimeroLogo } from '@calimero-network/mero-react';
import { APP_DISPLAY_NAME, APP_DESCRIPTION } from '../../config';

/**
 * Landing page — vector knowledge base marketing page.
 *
 * Sections: hero (purple/cyan palette + LivePreview animation)
 *   → how it works → features → FAQ → CTA → footer
 */

/* ── Brand palette — white + near-black + purple/cyan accents ──────────────── */
const C = {
  purple: '#7C3AED',
  purpleLight: 'rgba(124,58,237,0.14)',
  purpleBorder: 'rgba(124,58,237,0.4)',
  purpleText: '#6D28D9',
  cyan: '#22D3EE',
  cyanLight: 'rgba(34,211,238,0.12)',
  cyanBorder: 'rgba(34,211,238,0.4)',
  green: '#A4FF11',
  greenDeep: '#4e7a06',
  ink: '#0e140f',
  ink2: '#151c16',
  paper: '#ffffff',
  paper2: '#f7f5ff',  // faint purple tint
  line: '#e7e2f7',
  lineDark: 'rgba(124,58,237,0.12)',
  muted: '#5a5270',
  mutedSoft: '#9490aa',
} as const;

const FEATURES = [
  {
    icon: '🔍',
    title: 'Semantic similarity search',
    body: 'Find the most relevant knowledge chunks instantly using cosine similarity across embedding vectors — no keyword matching, pure semantic understanding.',
  },
  {
    icon: '🏷️',
    title: 'Tags & named collections',
    body: 'Curate your knowledge base with tags and organize entries into named collections. Every change syncs to all teammates in real time via Calimero CRDT.',
  },
  {
    icon: '📊',
    title: 'Visual knowledge map',
    body: 'Explore the shape of your team\'s knowledge at a glance — a 2D scatter plot shows how entries cluster by semantic similarity, colored by collection.',
  },
];

const FAQS: [string, string][] = [
  ['What is a vector knowledge base?', 'A vector knowledge base stores text chunks alongside their numerical embedding vectors. Similarity search finds related chunks by comparing angles in that high-dimensional space — called cosine similarity.'],
  ['What are embedding vectors?', 'Embeddings are lists of floating-point numbers produced by a language model that encode the semantic meaning of a piece of text. Similar texts produce similar vectors.'],
  ['Where does my data live?', 'On your own Calimero node. There is no central database — all knowledge chunks and their embeddings are stored in CRDT collections that sync peer-to-peer between your team\'s nodes.'],
  ['What is a context?', 'A context is a shared, encrypted workspace that peers join by invitation. Everyone in a context sees the same state in real time, synced directly between nodes without a server.'],
  ['How do teammates join?', 'Connect your node, then share an invitation code. Anyone you invite joins the workspace instantly and sees the full knowledge base — no accounts, no sign-up friction.'],
  ['Is the data encrypted?', 'Yes. Calimero contexts are encrypted by default. Only nodes that hold a valid invitation can join and read the state — your knowledge stays in your control.'],
];

/* ── Scroll-reveal hook ─────────────────────────────────────────────────────── */
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
function R({ v = 'up', d = 0, className, style, id, children }: {
  v?: RVariant; d?: number; className?: string; style?: React.CSSProperties; id?: string; children: React.ReactNode;
}) {
  const ref = useReveal<HTMLDivElement>();
  return <RBox ref={ref} $v={v} $d={d} className={className} style={style} id={id}>{children}</RBox>;
}

const STEPS = [
  { k: '01', t: 'Connect your node', d: 'Point the app at the Calimero node you run. Your embeddings and knowledge stay on your infrastructure.' },
  { k: '02', t: 'Add knowledge chunks', d: 'Paste text and its embedding vector. The chunk is stored in a CRDT collection and synced to all teammates instantly.' },
  { k: '03', t: 'Search semantically', d: 'Submit a query vector. The system ranks all entries by cosine similarity and returns the top-K most relevant chunks.' },
  { k: '04', t: 'Visualize the map', d: 'Explore a 2D scatter plot of your entire knowledge base. Clusters reveal semantic relationships at a glance.' },
];

/* ── Animated Live Preview — vector KB workflow ─────────────────────────────── */
type Frame =
  | { kind: 'entry'; text: string; dim: number; tags: string[]; author: string }
  | { kind: 'tag'; entry: string; added: string }
  | { kind: 'search'; scores: { text: string; score: number }[] };

const FRAMES: Frame[] = [
  { kind: 'entry', text: 'Transformers use self-attention mechanisms to relate positions across the sequence…', dim: 384, tags: ['ml', 'architecture'], author: 'alice' },
  { kind: 'entry', text: 'BERT is a deeply bidirectional transformer pre-trained on masked language modeling…', dim: 384, tags: ['nlp', 'ml'], author: 'bob' },
  { kind: 'tag', entry: 'Transformers use self-attention…', added: 'attention' },
  { kind: 'search', scores: [
    { text: 'Transformers use self-attention mechanisms…', score: 0.97 },
    { text: 'BERT is a deeply bidirectional transformer…', score: 0.89 },
  ]},
];

function LivePreview() {
  const [phase, setPhase] = useState<Frame | null>(null);
  const [entries, setEntries] = useState<Array<{ text: string; dim: number; tags: string[]; author: string }>>([]);
  const [searchResults, setSearchResults] = useState<{ text: string; score: number }[] | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    const run = () => {
      setPhase(null);
      setEntries([]);
      setSearchResults(null);
      setSyncing(false);

      let t = 400;
      FRAMES.forEach((frame, i) => {
        at(t, () => {
          setSyncing(true);
          setPhase(frame);
        });
        at(t + 400, () => {
          setSyncing(false);
          if (frame.kind === 'entry') {
            setEntries((prev) => [...prev, { text: frame.text, dim: frame.dim, tags: frame.tags, author: frame.author }]);
          }
          if (frame.kind === 'tag') {
            setEntries((prev) =>
              prev.map((e) =>
                e.text.startsWith(frame.entry.slice(0, 20))
                  ? { ...e, tags: [...e.tags, frame.added] }
                  : e,
              ),
            );
          }
          if (frame.kind === 'search') {
            setSearchResults(frame.scores);
          }
          if (i === FRAMES.length - 1) setPhase(null);
        });
        t += 1800;
      });
    };

    run();
    const loop = setInterval(run, t + 1600);
    return () => { timers.forEach(clearTimeout); clearInterval(loop); };
  }, []);

  return (
    <Preview aria-hidden="true">
      {/* Title bar */}
      <div className="bar">
        <s style={{ background: '#ff5f56' }} />
        <s style={{ background: '#ffbd2e' }} />
        <s style={{ background: C.green }} />
        <span><CalimeroLogo size={12} color={C.cyan} /> {APP_DISPLAY_NAME.toLowerCase()} · your node</span>
        <em className={syncing ? 'on' : ''}>● {syncing ? 'syncing' : 'live'}</em>
      </div>

      {/* Body */}
      <div className="body">
        {/* Status line */}
        {phase && (
          <div className="status-line">
            {phase.kind === 'entry' && (
              <><span className="op add">+ entry</span><span className="dim">dim:{phase.dim}</span></>
            )}
            {phase.kind === 'tag' && (
              <><span className="op tag">~ tags</span><span className="dim">+{phase.added}</span></>
            )}
            {phase.kind === 'search' && (
              <><span className="op search">⌕ search</span><span className="dim">cosine similarity</span></>
            )}
          </div>
        )}

        {/* Search results mode */}
        {searchResults && (
          <div className="results">
            <div className="results-label">Search results</div>
            {searchResults.map((r, i) => (
              <div key={i} className="result-row">
                <span className="score">{(r.score * 100).toFixed(0)}%</span>
                <span className="result-text">{r.text.slice(0, 48)}…</span>
              </div>
            ))}
          </div>
        )}

        {/* Entry list */}
        {!searchResults && entries.length > 0 && (
          <div className="entries">
            {entries.map((e, i) => (
              <div key={i} className="entry-row">
                <div className="entry-text">{e.text.slice(0, 55)}…</div>
                <div className="entry-meta">
                  <span className="dim-badge">dim:{e.dim}</span>
                  {e.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                  <span className="author">{e.author}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {entries.length === 0 && !searchResults && (
          <div className="empty-hint">Waiting for entries…</div>
        )}

        {/* Peer row */}
        <div className="peers">
          <i>A</i><i>B</i><b>+ you</b>
        </div>
      </div>
    </Preview>
  );
}

/* ── FAQ row ─────────────────────────────────────────────────────────────────── */
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

/* ── Page ─────────────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Root>
      {/* ── Header ────────────────────────────────────────────────── */}
      <Header>
        <Brand>
          <span className="mark"><CalimeroLogo size={22} color={C.purpleText} /></span>
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

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <Hero>
        <PurpleGlow />
        <CyanGlow />
        <Grid />
        <HeroInner>
          <Eyebrow>
            <CalimeroLogo size={13} color={C.purpleText} /> Powered by Calimero
          </Eyebrow>
          <H1>{APP_DISPLAY_NAME}</H1>
          <Lede>{APP_DESCRIPTION}</Lede>
          <Cta>
            <ConnectButton />
            <GhostBtn onClick={() => window.open('https://docs.calimero.network', '_blank', 'noopener,noreferrer')}>
              Learn more
            </GhostBtn>
          </Cta>
          <TrustRow>
            <span>Cosine similarity search</span><i />
            <span>Real-time CRDT sync</span><i />
            <span>Self-sovereign</span>
          </TrustRow>
        </HeroInner>
        <PreviewWrap><LivePreview /></PreviewWrap>
      </Hero>

      {/* ── How it works ─────────────────────────────────────────── */}
      <Section id="how" $alt>
        <Inner>
          <R v="up">
            <Kicker>How it works</Kicker>
            <H2>Build a shared vector knowledge base — in four moves</H2>
            <Sub>No central server, no vector database subscription. Your embeddings stay on your node.</Sub>
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

      {/* ── Features ─────────────────────────────────────────────── */}
      <Section id="features">
        <Inner>
          <R v="up">
            <Kicker>Why it's different</Kicker>
            <H2>Vector search. Decentralized. Yours.</H2>
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

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <Section id="faq" $alt>
        <Inner style={{ maxWidth: 760 }}>
          <R v="up">
            <Kicker>FAQ</Kicker>
            <H2>Embeddings, nodes &amp; your data</H2>
          </R>
          <FaqList>
            {FAQS.map(([q, a], i) => (
              <R v="left" d={i * 0.06} key={q}><Faq q={q} a={a} /></R>
            ))}
          </FaqList>
        </Inner>
      </Section>

      {/* ── Final CTA ────────────────────────────────────────────── */}
      <CtaBand>
        <R v="zoom">
          <h2>Connect your node and start building.</h2>
          <p>Your embeddings. Your knowledge. Your control — no third-party vector DB.</p>
          <div className="btn"><ConnectButton /></div>
        </R>
      </CtaBand>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <Footer>
        <div className="top">
          <div className="brand">
            <span className="wm">
              <span className="mk"><CalimeroLogo size={18} color={C.cyan} /></span>
              {' '}{APP_DISPLAY_NAME}
            </span>
            <p>Private. Semantic. Decentralized.</p>
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
const fadeSlide = keyframes`from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}`;

/* ════════════════════════ layout ════════════════════════ */
const Root = styled.div`
  position: fixed; inset: 0;
  overflow-y: auto; overflow-x: hidden;
  background: ${C.paper}; color: ${C.ink};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px; line-height: 1.6;
  -webkit-font-smoothing: antialiased;
`;

const Header = styled.header`
  position: sticky; top: 0; z-index: 50;
  display: flex; align-items: center; gap: 24px;
  padding: 12px clamp(18px, 5vw, 56px);
  background: rgba(255,255,255,0.84); backdrop-filter: saturate(160%) blur(14px);
  border-bottom: 1px solid ${C.line};
  .cta { margin-left: auto; }
`;
const Brand = styled.div`
  display: flex; align-items: center; gap: 9px;
  .mark { display: flex; }
  .wm { font-size: 15px; letter-spacing: -0.3px; color: ${C.ink}; font-weight: 700; }
`;
const Nav = styled.nav`
  display: flex; gap: 26px; margin-left: auto;
  a { font-size: 13px; font-weight: 500; color: ${C.muted}; cursor: pointer; text-decoration: none; transition: color 0.18s; &:hover { color: ${C.ink}; } }
  & + .cta { margin-left: 0; }
  @media (max-width: 880px) { display: none; }
`;

/* Hero */
const Hero = styled.section`
  position: relative; overflow: hidden;
  display: grid; grid-template-columns: 1.05fr 0.95fr;
  gap: clamp(24px, 5vw, 64px); align-items: center;
  padding: clamp(56px, 8vw, 104px) clamp(18px, 5vw, 56px) clamp(64px, 9vw, 110px);
  background: radial-gradient(1200px 480px at 75% -10%, ${C.paper2} 0%, rgba(255,255,255,0) 60%), ${C.paper};
  @media (max-width: 940px) { grid-template-columns: 1fr; }
  @media (max-width: 560px) { padding: 40px 18px 56px; gap: 30px; }
`;
const PurpleGlow = styled.div`
  position: absolute; width: 480px; height: 480px; border-radius: 50%;
  top: -160px; right: -100px;
  background: radial-gradient(circle, rgba(124,58,237,0.38), rgba(124,58,237,0) 68%);
  filter: blur(28px); animation: ${float} 11s ease-in-out infinite; pointer-events: none;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;
const CyanGlow = styled.div`
  position: absolute; width: 320px; height: 320px; border-radius: 50%;
  bottom: -80px; left: 30%;
  background: radial-gradient(circle, rgba(34,211,238,0.22), rgba(34,211,238,0) 68%);
  filter: blur(24px); animation: ${drift} 14s ease-in-out infinite; pointer-events: none;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;
const Grid = styled.div`
  position: absolute; inset: 0;
  background-image: linear-gradient(${C.line} 1px, transparent 1px), linear-gradient(90deg, ${C.line} 1px, transparent 1px);
  background-size: 46px 46px;
  mask-image: radial-gradient(680px 380px at 30% 30%, #000 0%, transparent 75%);
  opacity: 0.5; pointer-events: none;
`;
const HeroInner = styled.div`position: relative; z-index: 1; max-width: 580px;`;
const Eyebrow = styled.div`
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 11px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase;
  color: ${C.purpleText}; background: ${C.purpleLight}; border: 1px solid ${C.purpleBorder};
  padding: 5px 11px; border-radius: 999px;
`;
const H1 = styled.h1`
  margin: 20px 0 16px;
  font-size: clamp(36px, 6vw, 58px); line-height: 1.03; letter-spacing: -1.6px; font-weight: 800; color: ${C.ink};
`;
const Lede = styled.p`font-size: 16px; color: ${C.muted}; max-width: 500px; margin-bottom: 26px;`;
const Cta = styled.div`display: flex; gap: 12px; align-items: center; flex-wrap: wrap;`;
const GhostBtn = styled.button`
  padding: 11px 18px; border-radius: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
  &:hover { background: ${C.paper2}; border-color: ${C.purpleBorder}; transform: translateY(-1px); }
`;
const TrustRow = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 30px;
  span { font-size: 12px; font-weight: 500; color: ${C.muted}; }
  i { width: 4px; height: 4px; border-radius: 50%; background: ${C.purple}; }
`;

/* Live preview */
const PreviewWrap = styled.div`
  position: relative; z-index: 1;
  animation: ${float} 9s ease-in-out infinite;
  @media (max-width: 940px) { animation: none; }
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

const Preview = styled.div`
  border: 1px solid rgba(124,58,237,0.3); border-radius: 14px;
  background: #0d0b14;
  box-shadow: 0 30px 70px -30px rgba(124,58,237,0.4);
  overflow: hidden;

  .bar {
    display: flex; align-items: center; gap: 7px;
    padding: 11px 14px; border-bottom: 1px solid rgba(124,58,237,0.15);
    background: #120f1e;
    s { width: 10px; height: 10px; border-radius: 50%; }
    span { margin-left: 8px; display: inline-flex; align-items: center; gap: 7px; font-size: 11.5px; color: #7a6fa0; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
    em { margin-left: auto; font-style: normal; font-size: 10.5px; font-family: ui-monospace, monospace; color: #7a6fa0; transition: color 0.3s; }
    em.on { color: ${C.cyan}; }
  }

  .body { padding: 14px; min-height: 240px; display: flex; flex-direction: column; gap: 10px; }

  .status-line {
    display: flex; align-items: center; gap: 8px;
    font-size: 11px; font-family: ui-monospace, monospace;
    padding: 5px 8px; border-radius: 6px; background: rgba(124,58,237,0.1);
    border: 1px solid rgba(124,58,237,0.2);
    animation: ${fadeSlide} 0.25s ease both;
  }
  .op { font-weight: 700; }
  .op.add { color: ${C.cyan}; }
  .op.tag { color: #a78bfa; }
  .op.search { color: #fbbf24; }
  .dim { color: #6b6585; font-size: 10px; }

  .entries { display: flex; flex-direction: column; gap: 7px; }
  .entry-row { padding: 8px 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(124,58,237,0.12); border-radius: 8px; animation: ${fadeSlide} 0.28s ease both; }
  .entry-text { font-size: 11px; color: #ccc5e0; line-height: 1.5; margin-bottom: 5px; }
  .entry-meta { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  .dim-badge { font-size: 10px; color: ${C.cyan}; background: rgba(34,211,238,0.1); border: 1px solid rgba(34,211,238,0.2); border-radius: 4px; padding: 1px 5px; font-family: ui-monospace, monospace; }
  .tag { font-size: 10px; color: #a78bfa; background: rgba(124,58,237,0.12); border: 1px solid rgba(124,58,237,0.2); border-radius: 4px; padding: 1px 5px; }
  .author { font-size: 10px; color: #6b6585; margin-left: auto; }

  .results { animation: ${fadeSlide} 0.28s ease both; }
  .results-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #fbbf24; margin-bottom: 7px; font-family: ui-monospace, monospace; }
  .result-row { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
  .score { font-size: 11px; font-weight: 700; color: ${C.cyan}; font-family: ui-monospace, monospace; min-width: 36px; }
  .result-text { font-size: 11px; color: #ccc5e0; line-height: 1.45; }

  .empty-hint { font-size: 11px; color: #4a4460; text-align: center; padding: 20px 0; }

  .peers { display: flex; align-items: center; gap: 0; margin-top: auto; }
  .peers i { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 9px; font-weight: 700; color: #0d0b14; background: linear-gradient(135deg, ${C.purple}, #a78bfa); border: 1.5px solid #0d0b14; margin-left: -5px; }
  .peers i:first-child { margin-left: 0; }
  .peers b { margin-left: 8px; font-size: 10px; font-weight: 600; color: #6b6585; }
`;

/* Sections */
const Section = styled.section<{ $alt?: boolean }>`
  padding: clamp(58px, 8vw, 104px) clamp(18px, 5vw, 56px);
  background: ${(p) => (p.$alt ? C.paper2 : C.paper)};
  border-top: 1px solid ${C.line};
  scroll-margin-top: 76px;
  @media (max-width: 560px) { padding: 46px 18px; }
`;
const Inner = styled.div`max-width: 1040px; margin: 0 auto;`;

const RBox = styled.div<{ $v: RVariant; $d: number }>`
  opacity: 0; will-change: opacity, transform;
  transform: ${(p) => p.$v === 'zoom' ? 'scale(0.9)' : p.$v === 'drop' ? 'translateY(-46px)' : p.$v === 'left' ? 'translateX(-44px)' : 'translateY(30px)'};
  transition:
    opacity 0.7s ${(p) => p.$d}s cubic-bezier(0.22,1,0.36,1),
    transform 0.72s ${(p) => p.$d}s ${(p) => p.$v === 'drop' ? 'cubic-bezier(0.2,0.85,0.3,1.25)' : 'cubic-bezier(0.22,1,0.36,1)'};
  &.is-visible { opacity: 1; transform: none; }
  @media (prefers-reduced-motion: reduce) { opacity: 1; transform: none; transition: none; }
`;

const Kicker = styled.div`font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: ${C.purpleText}; margin-bottom: 12px;`;
const H2 = styled.h2`font-size: clamp(24px, 3.4vw, 33px); line-height: 1.12; letter-spacing: -0.9px; font-weight: 700; color: ${C.ink}; max-width: 720px;`;
const Sub = styled.p`margin-top: 13px; font-size: 14.5px; color: ${C.muted}; max-width: 600px;`;

const Pipeline = styled.div`
  position: relative; margin-top: 52px;
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px;
  .track { position: absolute; top: 19px; left: 6%; right: 6%; height: 2px; background: linear-gradient(90deg, ${C.line}, rgba(124,58,237,0.4), ${C.line}); }
  .pulse { position: absolute; top: 14px; width: 12px; height: 12px; border-radius: 50%; background: ${C.purple}; box-shadow: 0 0 0 5px ${C.purpleLight}; animation: ${travel} 4.2s ease-in-out infinite; }
  .stage { position: relative; text-align: left; }
  .dot { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; background: ${C.paper}; border: 1px solid ${C.line}; box-shadow: 0 6px 16px -8px rgba(14,20,15,0.3); margin-bottom: 14px; }
  .dot b { font-size: 13px; font-weight: 700; color: ${C.purpleText}; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
  .stage h4 { font-size: 15px; font-weight: 700; color: ${C.ink}; margin-bottom: 6px; letter-spacing: -0.2px; }
  .stage p { font-size: 13px; color: ${C.muted}; }
  @media (max-width: 760px) { grid-template-columns: 1fr 1fr; .track, .pulse { display: none; } }
  @media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
`;

const Cards = styled.div`
  margin-top: 40px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px;
  @media (max-width: 820px) { grid-template-columns: 1fr; }
`;
const Card = styled.div`
  padding: 24px 22px; border: 1px solid ${C.line}; border-radius: 14px; background: ${C.paper}; height: 100%;
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
  .ic { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 11px; background: ${C.purpleLight}; font-size: 20px; margin-bottom: 14px; }
  h3 { font-size: 16px; font-weight: 700; letter-spacing: -0.3px; color: ${C.ink}; margin-bottom: 7px; }
  p { font-size: 13.5px; color: ${C.muted}; }
  &:hover { transform: translateY(-3px); border-color: ${C.purpleBorder}; box-shadow: 0 18px 40px -24px rgba(124,58,237,0.25); }
`;

const FaqList = styled.div`margin-top: 34px; border-top: 1px solid ${C.line};`;
const FaqRow = styled.div<{ $open: boolean }>`
  border-bottom: 1px solid ${C.line};
  button { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 2px; background: none; border: none; cursor: pointer; text-align: left; font-size: 15px; font-weight: 600; letter-spacing: -0.2px; color: ${C.ink}; i { font-style: normal; flex-shrink: 0; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 7px; font-size: 16px; color: ${C.purpleText}; background: ${C.purpleLight}; } }
  .ans { overflow: hidden; max-height: ${(p) => (p.$open ? '240px' : '0')}; transition: max-height 0.32s ease; }
  .ans p { padding: 0 2px 20px; font-size: 14px; color: ${C.muted}; max-width: 660px; }
`;

const CtaBand = styled.section`
  position: relative; overflow: hidden; text-align: center;
  padding: clamp(58px, 8vw, 92px) 24px;
  background: radial-gradient(700px 280px at 50% 120%, rgba(124,58,237,0.28), transparent 70%), #0d0b14;
  border-top: 1px solid ${C.lineDark};
  h2 { font-size: clamp(24px, 3.6vw, 34px); font-weight: 700; letter-spacing: -0.8px; color: #fff; }
  p { margin: 12px 0 24px; font-size: 14.5px; color: ${C.mutedSoft}; }
  .btn { display: inline-flex; }
  &::after { content: ''; position: absolute; width: 360px; height: 360px; border-radius: 50%; left: -120px; bottom: -180px; background: radial-gradient(circle, rgba(34,211,238,0.2), transparent 68%); filter: blur(24px); animation: ${drift} 12s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) { &::after { animation: none; } }
`;

const Footer = styled.footer`
  background: #0d0b14; color: ${C.mutedSoft};
  padding: 54px clamp(18px, 5vw, 56px) 30px;
  .top { max-width: 1040px; margin: 0 auto; display: grid; grid-template-columns: 1.3fr 2fr; gap: 40px; }
  @media (max-width: 760px) { .top { grid-template-columns: 1fr; gap: 28px; } }
  .brand .wm { display: inline-flex; align-items: center; gap: 9px; font-size: 15px; font-weight: 700; color: #fff; }
  .brand .mk { display: flex; }
  .brand p { margin-top: 10px; font-size: 13px; max-width: 280px; }
  .cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  @media (max-width: 560px) { .cols { grid-template-columns: 1fr 1fr; gap: 20px 24px; } }
  .cols h5 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #fff; margin-bottom: 12px; }
  .cols a { display: block; font-size: 13px; color: ${C.mutedSoft}; text-decoration: none; margin-bottom: 9px; cursor: pointer; transition: color 0.16s; &:hover { color: ${C.cyan}; } }
  .bottom { max-width: 1040px; margin: 36px auto 0; padding-top: 20px; border-top: 1px solid rgba(124,58,237,0.15); display: flex; justify-content: space-between; gap: 12px; font-size: 12px; flex-wrap: wrap; }
`;
