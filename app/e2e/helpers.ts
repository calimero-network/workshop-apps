import { Page } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.resolve(__dirname, '..', '.playwright-data', 'pw-state.json');

// App-agnostic post-auth route — read from studio.config.json so this
// infra file is identical across the foundation and every generated app
// (no per-app patching). Foundation chat → "/chat".
function appRoute(): string {
  try {
    const cfgPath = path.resolve(__dirname, '..', '..', 'studio.config.json');
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
    return cfg?.metadata?.route || '/';
  } catch {
    return '/';
  }
}

interface NodeState {
  name: string;
  adminUrl: string;
  appId: string;
  accessToken: string;
  refreshToken: string;
}

interface SetupState {
  pids: number[];
  nodes: NodeState[];
}

function loadState(): SetupState {
  if (!existsSync(STATE_FILE)) {
    throw new Error('No setup state found. Did global-setup run?');
  }
  return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
}

/** Get node state by index (0 = node 1, 1 = node 2). */
export function getNode(index: number): NodeState {
  const state = loadState();
  if (index >= state.nodes.length) {
    throw new Error(`Node ${index} not found. Only ${state.nodes.length} nodes available.`);
  }
  return state.nodes[index];
}

/**
 * Navigate to the app with auth tokens in the URL hash for a specific node.
 * MeroProvider's parseAuthCallback picks these up automatically.
 *
 * On timeout, the error carries the browser's console errors and every
 * failed/4xx-5xx network call made during the handshake — the redirect is
 * gated on the app validating the session against the node, so a bare
 * waitForURL timeout says nothing about WHY (CORS, 401/403, unreachable).
 */
export async function loginViaHash(page: Page, nodeIndex = 0) {
  const node = getNode(nodeIndex);
  const hash = new URLSearchParams({
    access_token: node.accessToken,
    refresh_token: node.refreshToken,
    node_url: node.adminUrl,
    application_id: node.appId,
  }).toString();

  const diag: string[] = [];
  const onConsole = (m: any) => {
    if (m.type() === 'error') diag.push(`console.error: ${String(m.text()).slice(0, 300)}`);
  };
  const onRequestFailed = (r: any) =>
    diag.push(`request failed: ${r.method()} ${r.url()} — ${r.failure()?.errorText || 'unknown'}`);
  const onResponse = (r: any) => {
    if (r.status() >= 400) diag.push(`HTTP ${r.status()}: ${r.request().method()} ${r.url()}`);
  };
  page.on('console', onConsole);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);
  try {
    await page.goto(`/#${hash}`);
    await page.waitForURL(`**${appRoute()}`, { timeout: 30_000 });
  } catch (e) {
    const tail = diag.slice(-12).join('\n  ');
    throw new Error(
      `login handshake never reached ${appRoute()} (node ${node.adminUrl}).\n` +
      `  ${tail || 'no console/network errors captured during the wait'}\n` +
      `${(e as Error).message}`,
    );
  } finally {
    page.off('console', onConsole);
    page.off('requestfailed', onRequestFailed);
    page.off('response', onResponse);
  }
}

/** Clear all mero auth state. */
export async function clearAuth(page: Page) {
  try {
    const url = page.url();
    if (url === 'about:blank' || !url.startsWith('http')) return;
    await page.evaluate(() => {
      [
        // mero-js v2 stores the token as a single JSON blob under `mero-tokens`
        // — clearing it is what actually logs the test session out. The `mero:*`
        // keys hold node_url / application_id / context (still used).
        'mero-tokens',
        'mero:access_token', 'mero:refresh_token', 'mero:expires_at',
        'mero:node_url', 'mero:application_id', 'mero:context_id',
        'mero:context_identity',
        'pending-invitation',
      ].forEach((k) => localStorage.removeItem(k));
    });
  } catch { /* page may be closed */ }
}
