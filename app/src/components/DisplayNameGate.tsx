/**
 * DisplayNameGate: a blocking "Set your name" overlay shown the first time a
 * member enters a workspace without a display name. State-driven: it appears
 * whenever the active namespace has no name for the current member (just
 * created, just joined, or an older nameless workspace).
 *
 * Rendered INSIDE the workspace body (absolute inset-0), NOT over the top bar,
 * so Sign out stays reachable as an escape hatch.
 *
 * SUPPRESSED when the identity came from an injected/SSO callback context
 * (desktop launch + the e2e harness, which pins context via the URL hash),
 * those flows must never hit a manual gate.
 *
 * Ported from mero-drive's display-name system (member metadata).
 */
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import { Card as BaseCard, Primary, ErrLine, focusRing } from './primitives';
import {
  useMemberDisplayName,
  MAX_DISPLAY_NAME_BYTES,
} from '../hooks/useMemberDisplayName';
import { useDisplayNames } from './MemberLabel';

// localStorage marker recording that a name is already set for a (namespace,
// member). Bridges a mero-react rehydration gap where useMemberMetadata can
// return null on a cold load even though the name IS set server-side. Without
// it the gate re-appears on every refresh. Written only once we KNOW a name
// exists (a save, or any observed name), and names can't be cleared today, so
// it never suppresses the gate wrongly.
const NAME_SET_PREFIX = 'mero-name-set:';

function nameSetMarkerKey(
  ns: string | null | undefined,
  id: string | null | undefined,
): string | null {
  return ns && id ? `${NAME_SET_PREFIX}${ns}:${id}` : null;
}

function rememberNameSet(key: string | null): void {
  if (!key) return;
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* storage unavailable, in-memory dismissal still applies this session */
  }
}

/** Pure visibility rule, extracted so the suppression logic is unit-testable
 *  without a live node. The gate is hidden unless the member genuinely needs
 *  to pick a name. */
export function shouldShowNameGate(s: {
  injected: boolean;
  namespaceId: string | null;
  selfIdentity: string | null;
  loading: boolean;
  effectiveName: string | null;
  dismissed: boolean;
  knownSet: boolean;
}): boolean {
  if (s.injected) return false;
  if (!s.namespaceId || !s.selfIdentity) return false;
  if (s.loading) return false;
  if (s.effectiveName !== null) return false;
  if (s.dismissed || s.knownSet) return false;
  return true;
}

export function DisplayNameGate({ injected }: { injected: boolean }) {
  const { namespaceId, selfIdentity, refresh } = useDisplayNames();
  const { name, loading, error, setName } = useMemberDisplayName(
    namespaceId,
    selfIdentity,
    selfIdentity,
  );

  // Self is excluded from the namespace member rows, so the metadata hook is
  // the only live source for the caller's own name; the localStorage marker
  // below bridges the cold-load case where that hook returns null on refresh.
  const effectiveName = name;

  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [knownSet, setKnownSet] = useState(false);

  const markerKey = nameSetMarkerKey(namespaceId, selfIdentity);

  // Re-arm dismissal + re-read the persisted marker when the active
  // (namespace, member) changes.
  useEffect(() => {
    setDismissed(false);
    setDraft('');
    if (!markerKey) {
      setKnownSet(false);
      return;
    }
    try {
      setKnownSet(localStorage.getItem(markerKey) === '1');
    } catch {
      setKnownSet(false);
    }
  }, [markerKey]);

  // Persist the marker the moment a real name is observed from any source.
  useEffect(() => {
    if (markerKey && effectiveName !== null) {
      rememberNameSet(markerKey);
      setKnownSet(true);
    }
  }, [markerKey, effectiveName]);

  if (
    !shouldShowNameGate({
      injected,
      namespaceId,
      selfIdentity,
      loading,
      effectiveName,
      dismissed,
      knownSet,
    })
  ) {
    return null;
  }

  const trimmed = draft.trim();
  // Byte length is the real limit; setName enforces it and surfaces a clear
  // "Name is too long" error, so canSave only pre-filters empty/saving.
  const canSave = trimmed.length > 0 && !saving;

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await setName(trimmed);
      // The provider holds its own copy of self's name (folded into the render
      // map); refresh it now so the byline shows the new name immediately
      // instead of the truncated key until the next poll.
      refresh();
      rememberNameSet(markerKey);
      setDismissed(true);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay
      role="dialog"
      aria-modal="true"
      aria-labelledby="name-gate-title"
      data-testid="display-name-gate"
    >
      <Card>
        <h2 id="name-gate-title">Set your name</h2>
        <p>
          Members of this workspace see this name instead of your raw key. You
          can change it later.
        </p>
        <input
          type="text"
          data-testid="field-display-name"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setSaveError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onSave();
          }}
          placeholder="Your display name"
          maxLength={MAX_DISPLAY_NAME_BYTES}
          autoFocus
          disabled={saving}
        />
        {error && <ErrLine role="alert">Couldn&apos;t load: {error.message}</ErrLine>}
        {saveError && <ErrLine role="alert">{saveError}</ErrLine>}
        <Actions>
          <Primary
            data-testid="action-set-display-name"
            onClick={() => void onSave()}
            disabled={!canSave}
          >
            {saving ? 'Saving…' : 'Continue'}
          </Primary>
        </Actions>
      </Card>
    </Overlay>
  );
}

const Overlay = styled.div`
  position: absolute; inset: 0; z-index: 40;
  display: flex; align-items: center; justify-content: center;
  padding: var(--c-space-6);
  background: ${C.scrim};
  backdrop-filter: blur(3px);
`;
const Card = styled(BaseCard)`
  width: 100%; max-width: 420px;
  padding: var(--c-space-6) var(--c-space-6);
  box-shadow: 0 18px 48px ${C.shadow};
  h2 { margin-bottom: var(--c-space-2); }
  p { margin-bottom: var(--c-space-4); }
  input {
    width: 100%;
    padding: var(--c-space-2) var(--c-space-3);
    font-family: inherit; font-size: var(--c-text-base);
    color: ${C.ink}; background: ${C.paper};
    border: 1px solid ${C.line}; border-radius: var(--c-radius-sm); outline: none;
    ${focusRing}
    &:disabled { opacity: 0.55; }
  }
`;
const Actions = styled.div`
  display: flex; justify-content: flex-end; margin-top: var(--c-space-4);
`;
