import styled, { keyframes } from 'styled-components';
import { C } from '../theme';

/**
 * SCAFFOLD-OWNED design floor. Every surface in the app is built from these, so
 * a preset's type scale, radius, spacing and motion reach the whole app rather
 * than only its palette.
 *
 * BUILD AGENT: import these instead of hand-rolling buttons, inputs, cards and
 * modals. Compose and extend them (`styled(Primary)`) for anything your product
 * needs. Never reintroduce a raw px font-size, px border-radius, hex or rgba -
 * they pin one preset's look onto all five.
 *
 * mero-ui components are deliberately NOT used here: they style themselves from
 * their own unprefixed --radius-*, --space-* and --font-* tokens, so they cannot
 * follow the active preset.
 */

/** The two shared breakpoints. A media query cannot read a custom property, so
 *  these are the constants every responsive rule interpolates. WIDE collapses
 *  multi-column grids, NARROW is the phone layout. */
export const WIDE = '(max-width: 960px)';
export const NARROW = '(max-width: 640px)';

const fadeIn = keyframes`from{opacity:0;}to{opacity:1;}`;
const pop = keyframes`from{opacity:0;transform:translateY(10px) scale(0.97);}to{opacity:1;transform:none;}`;
const spin = keyframes`to{transform:rotate(360deg);}`;

/** Accent-tinted fill, e.g. an icon badge behind a glyph. */
const accentWash = (pct: number) => `color-mix(in srgb, var(--c-accent) ${pct}%, transparent)`;

/** The one focus ring, replacing nine hand-copied copies. Green rather than
 *  accent: the focus ring is one of the four elements that stay on the brand
 *  thread in every preset (docs/architecture/theme-presets.md). */
export const focusRing = `
  &:focus-visible, &:focus {
    border-color: ${C.green};
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-green) 18%, transparent);
    outline: none;
  }
`;

/** WCAG 2.5.5 asks for a 44px minimum pointer target. Small icon buttons stay
 *  visually small and grow only their hit area, so nothing in the layout moves.
 *  The overlay is transparent and sits behind the glyph, never over a sibling,
 *  because it is centred on its own button. */
export const tapTarget = `
  position: relative;
  &::after {
    content: '';
    position: absolute;
    top: 50%; left: 50%;
    width: max(100%, 44px); height: max(100%, 44px);
    transform: translate(-50%, -50%);
  }
`;

const buttonBase = `
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 44px;
  padding: var(--c-space-3) var(--c-space-5);
  font-family: inherit;
  font-size: var(--c-text-base); font-weight: 600;
  border-radius: var(--c-radius-sm); cursor: pointer;
  transition: filter var(--c-duration-fast) var(--c-ease),
              background var(--c-duration-fast) var(--c-ease),
              border-color var(--c-duration-fast) var(--c-ease),
              box-shadow var(--c-duration-base) var(--c-ease);
  &:disabled { opacity: 0.6; cursor: default; }
`;

export const Primary = styled.button`
  ${buttonBase}
  color: ${C.accentInk}; background: ${C.accent}; border: 1px solid ${C.accent};
  &:hover:not(:disabled) { filter: brightness(1.06); box-shadow: 0 10px 28px ${accentWash(40)}; }
  ${focusRing}
`;

export const Secondary = styled.button`
  ${buttonBase}
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  &:hover:not(:disabled) { background: ${C.paper2}; border-color: ${C.lineAccent}; }
  ${focusRing}
`;

/** Panel surface: the app's cards, list rows and empty-state boxes. */
export const Card = styled.div`
  padding: var(--c-space-8) var(--c-space-7);
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: var(--c-radius-md);
  h2, h3 {
    font-family: var(--c-font-display);
    letter-spacing: var(--c-display-tracking);
    font-size: var(--c-text-lg); font-weight: 800;
    color: ${C.ink}; margin-bottom: var(--c-space-2);
  }
  p { font-size: var(--c-text-base); color: ${C.muted}; line-height: 1.55; }
`;

/** Centred single-card state, e.g. before a workspace exists. */
export const Empty = styled.div`
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: var(--c-space-6);
`;

export const Overlay = styled.div`
  position: fixed; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center;
  padding: var(--c-space-5);
  background: ${C.scrim}; backdrop-filter: blur(4px);
  animation: ${fadeIn} var(--c-duration-base) var(--c-ease) both;
`;

export const Dialog = styled.div`
  position: relative; width: 100%; max-width: 440px;
  background: ${C.paper};
  border: 1px solid ${C.line};
  border-radius: var(--c-radius-lg);
  padding: var(--c-space-7) var(--c-space-6) var(--c-space-6);
  box-shadow: 0 40px 90px -40px ${C.shadow};
  animation: ${pop} var(--c-duration-base) var(--c-ease) both;
  h3 {
    font-family: var(--c-font-display);
    letter-spacing: var(--c-display-tracking);
    font-size: var(--c-text-lg); font-weight: 800;
    color: ${C.ink}; margin: 0 0 var(--c-space-2);
  }
  .sub { font-size: var(--c-text-base); line-height: 1.55; color: ${C.muted}; margin: 0; }
  .hint { margin: var(--c-space-2) 0 0; font-size: var(--c-text-sm); color: ${C.mutedSoft}; text-align: center; }
`;

export const DialogClose = styled.button`
  ${tapTarget}
  position: absolute; top: var(--c-space-3); right: var(--c-space-3);
  width: 30px; height: 30px;
  display: grid; place-items: center;
  font-size: var(--c-text-lg); line-height: 1;
  color: ${C.mutedSoft}; background: transparent; border: none;
  border-radius: var(--c-radius-sm); cursor: pointer;
  transition: background var(--c-duration-fast) var(--c-ease), color var(--c-duration-fast) var(--c-ease);
  &:hover { background: ${C.paper2}; color: ${C.ink}; }
  ${focusRing}
`;

export const IconBadge = styled.div`
  width: 48px; height: 48px;
  margin-bottom: var(--c-space-4);
  display: grid; place-items: center;
  border-radius: var(--c-radius-md);
  background: ${accentWash(16)};
  border: 1px solid ${accentWash(40)};
`;

/** Right-aligned button row, e.g. Cancel / Confirm in a dialog. */
export const Actions = styled.div`
  display: flex; gap: var(--c-space-3); justify-content: flex-end;
  margin-top: var(--c-space-4);
  flex-wrap: wrap;
`;

/** Labelled input or textarea. Monospace is opt-in via the `$mono` prop, for
 *  invite codes and other machine-readable strings. */
export const Field = styled.div<{ $mono?: boolean }>`
  margin: var(--c-space-6) 0 var(--c-space-3);
  label {
    display: block; font-size: var(--c-text-sm); font-weight: 600;
    color: ${C.muted}; margin-bottom: var(--c-space-2);
  }
  input, textarea {
    width: 100%;
    font-family: ${(p) => (p.$mono ? 'var(--c-font-mono)' : 'inherit')};
    font-size: var(--c-text-sm); line-height: 1.5;
    color: ${C.ink}; background: ${C.paper2};
    border: 1px solid ${C.line}; border-radius: var(--c-radius-sm);
    padding: var(--c-space-2) var(--c-space-3);
    outline: none;
    transition: border-color var(--c-duration-fast) var(--c-ease), box-shadow var(--c-duration-fast) var(--c-ease);
    &::placeholder { color: ${C.mutedSoft}; font-family: inherit; }
    &:disabled { opacity: 0.6; }
    ${focusRing}
  }
  textarea { resize: vertical; min-height: 84px; word-break: break-all; }
`;

export const ErrLine = styled.p`
  margin: var(--c-space-3) 0 0;
  font-size: var(--c-text-sm);
  color: ${C.danger};
`;

export const Hint = styled.p`
  font-size: var(--c-text-base);
  color: ${C.muted};
  padding: var(--c-space-2) 0;
`;

/** Inline busy indicator sized to sit inside a Primary. The rotation period is a
 *  loop, not a UI transition, so it does not read a duration token. */
export const Spinner = styled.span`
  width: 15px; height: 15px;
  border: 2px solid color-mix(in srgb, var(--c-accent-ink) 30%, transparent);
  border-top-color: ${C.accentInk};
  border-radius: 50%;
  animation: ${spin} 0.6s linear infinite;
  @media (prefers-reduced-motion: reduce) { animation-duration: 1.8s; }
`;

const shimmer = keyframes`from{background-position:200% 0;}to{background-position:-200% 0;}`;

/** Placeholder row shown while a list loads, so the page has its final shape
 *  before the data lands rather than jumping when it does.
 *
 *  BUILD AGENT: render `count` of these wherever your list is loading, sized to
 *  the row it stands in for. */
export const Skeleton = styled.div<{ $h?: string }>`
  height: ${(p) => p.$h || 'var(--c-space-12)'};
  border-radius: var(--c-radius-md);
  background: linear-gradient(
    90deg,
    ${C.paper2} 25%,
    color-mix(in srgb, var(--c-ink) 7%, var(--c-paper2)) 37%,
    ${C.paper2} 63%
  );
  background-size: 200% 100%;
  animation: ${shimmer} 1.4s ease-in-out infinite;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;

/** An empty list is the first thing a new user sees, so it invites the first
 *  action rather than reporting an absence.
 *
 *  BUILD AGENT: rewrite `title` and `body` in the app's own voice and name the
 *  real object ("No trips planned yet", not "No items yet"). Pass the primary
 *  action as children. */
export const EmptyState = styled.div`
  display: flex; flex-direction: column; align-items: center; text-align: center;
  gap: var(--c-space-2);
  padding: var(--c-space-10) var(--c-space-6);
  border: 1px dashed ${C.line};
  border-radius: var(--c-radius-md);
  color: ${C.muted};
  h3 {
    font-family: var(--c-font-display);
    letter-spacing: var(--c-display-tracking);
    font-size: var(--c-text-lg); font-weight: 700; color: ${C.ink};
  }
  p { font-size: var(--c-text-base); max-width: 42ch; }
  > *:last-child:not(p):not(h3) { margin-top: var(--c-space-3); }
`;
