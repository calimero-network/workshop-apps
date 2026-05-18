/**
 * Playwright global setup for team-todo e2e tests.
 *
 * Responsibilities:
 *  1. Wait for the two local merod nodes to be healthy.
 *  2. Complete the OAuth-style login for each node via a real Chromium browser
 *     (so MeroProvider receives valid JWTs and stores them in localStorage).
 *  3. Create a shared "e2e-workspace" on node-0 so every spec has something to
 *     interact with right away.
 *  4. Persist per-node localStorage snapshots to app/e2e/.auth/state.json so
 *     each test can restore auth without re-doing the OAuth round-trip.
 *
 * Pre-conditions (handled by CI / the developer before running `pnpm test:e2e`):
 *   - merod nodes are already running  (pnpm merod:start)
 *   - the .mpk bundle is installed     (pnpm merod:install)
 *   - the Vite dev server is running   (playwright.config.ts webServer block handles this)
 *
 * Node URLs default to the Calimero dev-mode defaults and can be overridden
 * via environment variables:
 *   MEROD_NODE_0=http://localhost:2528
 *   MEROD_NODE_1=http://localhost:2529
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { chromium, type Browser, type Page } from '@playwright/test';

// ESM __dirname shim — MUST stay at the top; Playwright runs this as an ES module.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AUTH_DIR = path.resolve(__dirname, '.auth');
export const STATE_FILE = path.resolve(AUTH_DIR, 'state.json');

const APP_BASE = 'http://localhost:5173';
const APP_ROUTE = '/team-todo';

/** Default RPC ports for two local merod nodes started by `pnpm merod:start`. */
const NODE_URLS: string[] = [
  (process.env['MEROD_NODE_0'] ?? 'http://localhost:2528').trim(),
  (process.env['MEROD_NODE_1'] ?? 'http://localhost:2529').trim(),
];

/** mero-react localStorage keys (from @calimero-network/mero-react STORAGE_KEYS). */
const MERO_LS_KEYS = [
  'mero:access_token',
  'mero:refresh_token',
  'mero:expires_at',
  'mero:node_url',
  'mero:application_id',
  'mero:context_id',
  'mero:context_identity',
];

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

async function waitForHealth(nodeUrl: string, maxMs = 90_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    for (const suffix of ['/health', '/admin/health']) {
      try {
        const r = await fetch(`${nodeUrl}${suffix}`, { signal: AbortSignal.timeout(2_000) });
        if (r.ok) return;
      } catch {
        // not ready
      }
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`[setup] Merod node ${nodeUrl} did not become healthy within ${maxMs / 1000}s`);
}

// ---------------------------------------------------------------------------
// Browser-based OAuth login
// ---------------------------------------------------------------------------

/**
 * Completes the full ConnectButton → LoginModal → merod-auth → callback flow
 * for the given node URL. In merod dev mode the auth server issues tokens
 * immediately without any interactive approval screen.
 *
 * Returns the mero-react localStorage snapshot for the authenticated session.
 */
async function loginViaOAuth(
  browser: Browser,
  nodeUrl: string,
): Promise<Record<string, string>> {
  const context = await browser.newContext({ baseURL: APP_BASE });
  const page = await context.newPage();

  try {
    await page.goto('/');

    // ── Step 1: Open the ConnectButton modal ──────────────────────────────
    // The ConnectButton renders "Connect" when not authenticated.
    const connectBtn = page
      .getByRole('button', { name: /^connect$/i })
      .first();
    await connectBtn.waitFor({ state: 'visible', timeout: 20_000 });
    await connectBtn.click();

    // ── Step 2: Fill in the node URL in the LoginModal ───────────────────
    // LoginModal renders a single <input> for the node URL.
    const urlInput = page.getByRole('textbox').first();
    await urlInput.waitFor({ state: 'visible', timeout: 10_000 });
    await urlInput.fill(nodeUrl);

    // Click the "Connect" button inside the modal (the last one on the page).
    const modalConnect = page.getByRole('button', { name: /^connect$/i }).last();
    await modalConnect.click();

    // ── Step 3: Wait for merod auth → callback → app redirect ────────────
    // connectToNode() redirects to merod /admin/auth which immediately
    // redirects back to APP_BASE/#access_token=...&refresh_token=...
    // MeroProvider reads the hash and navigates to APP_ROUTE.
    await page.waitForURL(`**${APP_ROUTE}`, { timeout: 60_000 });

    // ── Step 4: Snapshot localStorage ────────────────────────────────────
    const snapshot = await page.evaluate((keys: string[]) => {
      const out: Record<string, string> = {};
      for (const k of keys) {
        const v = window.localStorage.getItem(k);
        if (v) out[k] = v;
      }
      return out;
    }, MERO_LS_KEYS);

    return snapshot;
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Workspace bootstrap
// ---------------------------------------------------------------------------

/**
 * Creates a shared workspace ("e2e-workspace") on node-0 so every spec starts
 * with a ready TodoListView. If a workspace already exists the step is skipped.
 */
async function ensureWorkspace(page: Page): Promise<void> {
  // If the welcome screen is visible, create a workspace
  const noWorkspace = page.getByText('No workspaces yet');
  const createBtn = page.getByRole('button', { name: 'Create Workspace' });

  if (await noWorkspace.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await createBtn.click();

    // CreateWorkspaceModal
    const nameInput = page.getByPlaceholder('Workspace name (e.g. Design Team)');
    await nameInput.fill('e2e-workspace');
    await page.getByRole('button', { name: 'Create' }).click();

    // Wait for the task input to appear (TodoListView loaded)
    await page.getByTestId('new-task-input').waitFor({ state: 'visible', timeout: 30_000 });
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default async function globalSetup(): Promise<void> {
  // Ensure auth directory exists
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  // Wait for all nodes
  for (const nodeUrl of NODE_URLS) {
    console.log(`[setup] Waiting for merod at ${nodeUrl}…`);
    await waitForHealth(nodeUrl);
    console.log(`[setup] ✓ ${nodeUrl} healthy`);
  }

  const browser = await chromium.launch({ headless: !process.env['PWDEBUG'] });
  const nodes: Array<{ nodeUrl: string; localStorage: Record<string, string> }> = [];

  try {
    for (const nodeUrl of NODE_URLS) {
      console.log(`[setup] Authenticating with node ${nodeUrl}…`);
      const ls = await loginViaOAuth(browser, nodeUrl);
      nodes.push({ nodeUrl, localStorage: ls });
      console.log(`[setup] ✓ Auth tokens stored for ${nodeUrl}`);
    }

    // ── Create shared workspace on node-0 ──────────────────────────────────
    if (nodes[0] && Object.keys(nodes[0].localStorage).length > 0) {
      console.log('[setup] Ensuring e2e-workspace exists on node-0…');
      const ctx0 = await browser.newContext({ baseURL: APP_BASE });
      const page0 = await ctx0.newPage();
      try {
        // Inject node-0 auth
        await page0.goto('/');
        await page0.evaluate((ls: Record<string, string>) => {
          for (const [k, v] of Object.entries(ls)) {
            window.localStorage.setItem(k, v);
          }
        }, nodes[0].localStorage);
        await page0.reload();
        await page0.waitForURL(`**${APP_ROUTE}`, { timeout: 15_000 });
        await ensureWorkspace(page0);
        // Re-snapshot (workspace selection key may have been added)
        const updated = await page0.evaluate((keys: string[]) => {
          const out: Record<string, string> = {};
          for (const k of keys) {
            const v = window.localStorage.getItem(k);
            if (v) out[k] = v;
          }
          return out;
        }, [...MERO_LS_KEYS, 'team-todo:selectedNamespaceId']);
        nodes[0].localStorage = updated;
      } finally {
        await ctx0.close();
      }
      console.log('[setup] ✓ Workspace ready');
    }
  } finally {
    await browser.close();
  }

  // Persist auth state
  fs.writeFileSync(STATE_FILE, JSON.stringify({ nodes }, null, 2));
  console.log(`[setup] Auth state saved → ${STATE_FILE}`);
}
