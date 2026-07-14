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

// Persistent per-page tally of admin-api 4xx/5xx responses. A failure on an
// admin-api route (classically `POST /admin-api/namespaces` → 403) is a
// node-permission / token-scope mismatch, NOT an app-code bug — but the browser
// swallows it (the invite-code box just stays empty, or no workspace appears),
// so downstream the test only sees a selector/timeout. We record every such
// response for the whole test (not just the login handshake) and (a) emit a
// greppable `[admin-api-error]` marker into the test's captured output and
// (b) fold it into the workspace/invite helper failure messages, so the verify
// classifier can short-circuit it as infrastructural instead of flailing the
// verifier-writer on correct code.
const ADMIN_API_ERRORS = new WeakMap<Page, string[]>();

/** Start recording admin-api 4xx/5xx on a page for the whole test. Idempotent. */
export function logAdminApiErrors(page: Page) {
  if (ADMIN_API_ERRORS.has(page)) return;
  const errs: string[] = [];
  ADMIN_API_ERRORS.set(page, errs);
  page.on('response', (r) => {
    try {
      const url = r.url();
      if (r.status() >= 400 && /\/admin-api\//.test(url)) {
        const line = `${r.status()} ${r.request().method()} ${url.replace(/^https?:\/\/[^/]+/, '')}`;
        errs.push(line);
        console.error(`[admin-api-error] ${line}`);
      }
    } catch { /* response discarded */ }
  });
}

/** ` [admin-api-error] ...` one-line suffix for a failure message, or '' if none. */
function adminApiTail(page: Page): string {
  const errs = ADMIN_API_ERRORS.get(page) || [];
  return errs.length ? ` [admin-api-error] ${errs.slice(-3).join('; ')}` : '';
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
  logAdminApiErrors(page);
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

// ── Shared workspace / invite-join flow ────────────────────────────────
//
// Every generated app inherits the foundation's create-or-join workspace
// model (AppPage) + the Invite/Join modals. The multi-node collaboration
// story tests all need the SAME two moves: bootstrap a workspace on one node,
// then invite→join a second node. The LLM used to hand-roll this per spec
// file and got it subtly wrong every time — guessed button labels that don't
// exist, no ready-signal, no already-joined handling — which was the dominant
// source of verify flakiness (the "Join with invitation" 15s timeouts).
//
// These helpers encode the flow ONCE against stable data-testids the
// foundation ships (create-workspace-btn / open-invite-btn / open-join-btn /
// generate-invite-btn / invite-code-output / join-code-input /
// join-submit-btn / workspace-ready), with an accessible-name fallback so
// they still work on apps built before the testids existed. Story tests
// should import these instead of re-deriving the flow:
//
//   import { loginViaHash, createWorkspace, inviteAndJoin } from './helpers';

const READY = '[data-testid="workspace-ready"], [data-testid="open-invite-btn"]';

/** testid-or-text union locator (first match; tolerant of legacy apps). */
function ctl(page: Page, testid: string, text: string) {
  return page.locator(`[data-testid="${testid}"], button:has-text("${text}")`).first();
}

/**
 * Wait until the app has a live workspace (the item view is mounted). Keys on
 * the `workspace-ready` marker, falling back to the bar's Invite button which
 * only renders once a workspace exists.
 */
export async function waitForWorkspaceReady(page: Page, timeout = 45_000) {
  try {
    await page.locator(READY).first().waitFor({ state: 'visible', timeout });
  } catch (e) {
    // createWorkspace → POST /admin-api/namespaces failing (node/token scope)
    // is the classic cause of "workspace never appears" — name it on line 1.
    throw new Error(`workspace never became ready.${adminApiTail(page)}\n${(e as Error).message}`);
  }
}

/**
 * Ensure `page` is inside a workspace, creating one if it's sitting on the
 * create-or-join gate. Idempotent: a no-op when a workspace already exists.
 * Caller must have logged the page in first (loginViaHash).
 */
export async function createWorkspace(page: Page) {
  // Already in? done.
  if (await page.locator(READY).first().isVisible().catch(() => false)) return;
  const create = ctl(page, 'create-workspace-btn', 'Create workspace');
  // The gate may take a beat to render after the auth redirect.
  await create.waitFor({ state: 'visible', timeout: 30_000 });
  await create.click();
  await waitForWorkspaceReady(page);
}

/**
 * Full invite→join across two authenticated pages: bootstrap the inviter's
 * workspace, mint an invite code, and join it from `joinerPage`. Returns the
 * invite code. Deterministic (polls for the generated code + the joiner's
 * ready signal) and tolerant of a joiner that already converged onto the
 * namespace (mDNS auto-discovery) — in that case the join is a no-op.
 */
export async function inviteAndJoin(inviterPage: Page, joinerPage: Page): Promise<string> {
  await createWorkspace(inviterPage);

  // Inviter: open Invite, generate, read the code out of the readonly field.
  await ctl(inviterPage, 'open-invite-btn', 'Invite').click();
  await ctl(inviterPage, 'generate-invite-btn', 'Generate invite').click();
  const codeField = inviterPage
    .locator('[data-testid="invite-code-output"], textarea[readonly]')
    .first();
  await codeField.waitFor({ state: 'visible', timeout: 30_000 });
  // Poll until the async invitation call has populated the field.
  let code = '';
  try {
    await inviterPage.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel) as HTMLTextAreaElement | null;
        return !!el && el.value.trim().length > 0;
      },
      '[data-testid="invite-code-output"], textarea[readonly]',
      { timeout: 30_000 },
    );
  } catch (e) {
    // The invite call hits admin-api; a 403 there leaves the box empty.
    throw new Error(`invite code never populated.${adminApiTail(inviterPage)}\n${(e as Error).message}`);
  }
  code = (await codeField.inputValue()).trim();
  if (!code) throw new Error(`invite code never populated.${adminApiTail(inviterPage)}`);
  // Close the invite modal (Escape) so it doesn't overlay the joiner flow.
  await inviterPage.keyboard.press('Escape').catch(() => {});

  // Joiner: if it already auto-discovered the namespace, nothing to do.
  if (await joinerPage.locator(READY).first().isVisible().catch(() => false)) {
    // Still surface the code for callers that assert on it.
    return code;
  }
  await ctl(joinerPage, 'open-join-btn', 'Join').click();
  const input = joinerPage
    .locator('[data-testid="join-code-input"], #join-code, textarea')
    .first();
  await input.waitFor({ state: 'visible', timeout: 30_000 });
  await input.fill(code);
  await ctl(joinerPage, 'join-submit-btn', 'Join workspace').click();
  await waitForWorkspaceReady(joinerPage);
  return code;
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
