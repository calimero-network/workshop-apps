import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { C } from '../theme';
import { NARROW } from './primitives';

/**
 * SCAFFOLD-OWNED mutation feedback: one visible notice plus one screen-reader
 * announcement, from a single call.
 *
 * BUILD AGENT: call `useFeedback()` after every write that succeeds or fails.
 * Do NOT use mero-ui's Toast: it hardcodes its own palette, so it renders the
 * same dark green box on all five presets, and it has no aria-live region.
 *
 *   const { notify } = useFeedback();
 *   await items.add(title); notify('Item added');
 *   catch (e) { notify(describeError(e), 'error'); }
 */

type Tone = 'success' | 'error';
type Note = { id: number; text: string; tone: Tone };

interface FeedbackApi {
  /** Visible notice plus a screen-reader announcement. For the user's own actions. */
  notify: (text: string, tone?: Tone) => void;
  /** Screen-reader only. For things that happen without the user doing anything,
   *  such as a peer's item arriving over sync, where a visible toast on every
   *  remote change would be noise. */
  announce: (text: string) => void;
}

const FeedbackContext = createContext<FeedbackApi>({ notify: () => {}, announce: () => {} });

export function useFeedback(): FeedbackApi {
  return useContext(FeedbackContext);
}

export function FeedbackProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [notes, setNotes] = useState<Note[]>([]);
  // Announced separately from `notes`: the live region must keep the text after
  // the notice animates out, or a screen reader can lose it mid-sentence.
  const [announced, setAnnounced] = useState('');
  const nextId = useRef(0);

  const notify = useCallback((text: string, tone: Tone = 'success') => {
    const id = nextId.current++;
    setNotes((prev) => [...prev, { id, text, tone }]);
    setAnnounced(text);
    window.setTimeout(() => setNotes((prev) => prev.filter((n) => n.id !== id)), 4000);
  }, []);

  const announce = useCallback((text: string) => setAnnounced(text), []);

  const api = useMemo(() => ({ notify, announce }), [notify, announce]);

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <Live role="status" aria-live="polite" aria-atomic="true">{announced}</Live>
      <Stack data-testid="feedback-stack">
        {/* One stable testid with the tone as an attribute: two notices of the
            same tone can coexist before the 4s dismiss, and a testid keyed on
            tone would resolve to several elements and fail strict mode. */}
        {notes.map((n) => (
          <Notice key={n.id} $tone={n.tone} data-testid="feedback-notice" data-tone={n.tone}>{n.text}</Notice>
        ))}
      </Stack>
    </FeedbackContext.Provider>
  );
}

const slideIn = keyframes`from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}`;

/** Visually hidden, still read aloud. */
const Live = styled.span`
  position: absolute; width: 1px; height: 1px;
  margin: -1px; padding: 0; border: 0;
  clip-path: inset(50%); overflow: hidden; white-space: nowrap;
`;

const Stack = styled.div`
  position: fixed; z-index: 200;
  right: var(--c-space-5); bottom: var(--c-space-5);
  display: flex; flex-direction: column; gap: var(--c-space-2);
  pointer-events: none;
  @media ${NARROW} { left: var(--c-space-4); right: var(--c-space-4); }
`;

const Notice = styled.div<{ $tone: Tone }>`
  max-width: 380px;
  padding: var(--c-space-3) var(--c-space-4);
  font-size: var(--c-text-base);
  color: ${C.ink};
  background: ${C.paper2};
  border: 1px solid ${(p) => (p.$tone === 'error' ? C.danger : C.line)};
  border-left: 3px solid ${(p) => (p.$tone === 'error' ? C.danger : C.accent)};
  border-radius: var(--c-radius-sm);
  box-shadow: 0 12px 32px -12px ${C.shadow};
  animation: ${slideIn} var(--c-duration-base) var(--c-ease) both;
`;
