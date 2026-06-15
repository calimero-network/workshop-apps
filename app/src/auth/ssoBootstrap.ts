/**
 * SSO + invitation bootstrap — runs ONCE before React mounts (see index.tsx).
 *
 * Two jobs:
 *  1. Desktop auth-skip: when this app is opened from the Calimero desktop
 *     (Tauri) app, the desktop passes the already-authenticated session in the
 *     URL hash (#access_token=…&refresh_token=…&node_url=…&application_id=…).
 *     We persist those into the exact localStorage keys mero-react reads, so
 *     MeroProvider sees an authenticated session on first render and the user
 *     skips the manual connect/accept steps entirely.
 *  2. Web invitation capture: a shared link is `?invitation=<encoded>`. We stash
 *     it (the join flow consumes it after auth) and strip it from the URL.
 *
 * Both are best-effort and never throw into the render path.
 */
import { setNodeUrl, setApplicationId } from '@calimero-network/mero-react';

// mero-react's localStorage keys (STORAGE_KEYS in the package). Writing these
// directly is how the desktop session is injected without a login round-trip.
const K = {
  accessToken: 'mero:access_token',
  refreshToken: 'mero:refresh_token',
  expiresAt: 'mero:expires_at',
  contextId: 'mero:context_id',
  contextIdentity: 'mero:context_identity',
} as const;

const INVITATION_KEY = 'pending-invitation';

/** True when running inside the Calimero desktop (Tauri) shell. */
export const IS_DESKTOP =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Run the SSO + invitation bootstrap. Call once, before ReactDOM.render. */
export function bootstrapSsoAndInvitation(): void {
  if (typeof window === 'undefined') return;
  try { persistAuthHash(); } catch { /* never block boot on a bad hash */ }
  try { captureInvitation(); } catch { /* never block boot on a bad query */ }
}

/** Desktop auth-skip: lift tokens from the URL hash into mero-react storage. */
function persistAuthHash(): void {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return;

  const p = new URLSearchParams(hash);
  const accessToken = p.get('access_token');
  const refreshToken = p.get('refresh_token');
  const nodeUrl = p.get('node_url')?.trim();
  const applicationId = (p.get('application_id') ?? p.get('app-id') ?? '').trim();
  const contextId = p.get('context_id');
  const contextIdentity = p.get('context_identity');
  const expiresAt = p.get('expires_at');

  // node URL + app id can arrive even without tokens (cold desktop open).
  if (nodeUrl) setNodeUrl(nodeUrl);
  if (applicationId) setApplicationId(applicationId);

  if (accessToken && refreshToken) {
    localStorage.setItem(K.accessToken, accessToken);
    localStorage.setItem(K.refreshToken, refreshToken);
    localStorage.setItem(K.expiresAt, expiresAt ?? String(Date.now() + 3600_000));
    if (contextId) localStorage.setItem(K.contextId, contextId);
    if (contextIdentity) localStorage.setItem(K.contextIdentity, contextIdentity);
    // Strip the hash so MeroProvider doesn't reprocess it and so tokens don't
    // linger in the address bar / history.
    window.history.replaceState({}, '', window.location.pathname + window.location.search);
  }
}

/** Web invitation: stash `?invitation=` for the join flow, then clean the URL. */
function captureInvitation(): void {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('invitation');
  if (!raw) return;
  localStorage.setItem(INVITATION_KEY, raw);
  params.delete('invitation');
  const qs = params.toString();
  window.history.replaceState(
    {}, '',
    window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash,
  );
}

/** Consume a captured invitation (returns it once, then clears it). */
export function takePendingInvitation(): string | null {
  const v = localStorage.getItem(INVITATION_KEY);
  if (v) localStorage.removeItem(INVITATION_KEY);
  return v;
}

/** Peek at a captured invitation without consuming it (e.g. to show a banner). */
export function peekPendingInvitation(): string | null {
  return localStorage.getItem(INVITATION_KEY);
}
