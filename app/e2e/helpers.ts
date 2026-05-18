/**
 * Shared helpers for team-todo Playwright e2e specs.
 *
 * loginViaHash  — restores a per-node localStorage snapshot (written by
 *                 global-setup.ts) into the page, then navigates to
 *                 /team-todo and waits for the task list to be ready.
 * clearAuth     — wipes localStorage so the next test starts clean.
 *
 * The function is called "loginViaHash" to match the Calimero foundation
 * naming convention even though this implementation injects localStorage
 * directly (the auth hash is consumed by MeroProvider on the first page
 * load; for subsequent test pages we restore the stored snapshot instead).
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import type { Page } from '@playwright/test';

// ESM __dirname shim — required because Playwright runs this as an ES module.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The app route defined in studio.config.json → metadata.route */
export const APP_ROUTE = '/team-todo';

/** Path to the compiled WASM bundle; used by merobox steps in CI. */
export const MPK_PATH = path.resolve(__dirname, '..', '..', 'logic', 'res', 'team-todo-0.1.0.mpk');

const STATE_FILE = path.resolve(__dirname, '.auth', 'state.json');

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

interface AuthState {
  nodes: Array<{
    nodeUrl: string;
    localStorage: Record<string, string>;
  }>;
}

function readState(): AuthState {
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error(
      `[helpers] Auth state file not found at ${STATE_FILE}.\n` +
      'Run the global setup first: the Playwright test runner calls it automatically\n' +
      'via globalSetup in playwright.config.ts.',
    );
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as AuthState;
}

/**
 * Restore the saved auth tokens for `nodeIndex` into the page's localStorage,
 * then navigate to the team-todo route and wait until the task-input is
 * visible (confirming MeroProvider authenticated successfully and the
 * TodoListView has rendered).
 *
 * @param page       - Playwright Page object
 * @param nodeIndex  - 0 = first merod node, 1 = second merod node (default 0)
 */
export async function loginViaHash(page: Page, nodeIndex = 0): Promise<void> {
  const state = readState();
  const node = state.nodes[nodeIndex];
  if (!node) {
    throw new Error(`[helpers] No auth state found for nodeIndex ${nodeIndex}.`);
  }

  // Navigate to the app root first (establishes the correct origin for
  // localStorage; about:blank shares nothing with localhost:5173).
  await page.goto('/');

  // Inject all saved mero-react localStorage keys atomically.
  await page.evaluate((ls: Record<string, string>) => {
    for (const [k, v] of Object.entries(ls)) {
      window.localStorage.setItem(k, v);
    }
  }, node.localStorage);

  // Reload so MeroProvider initialises with the injected tokens on its very
  // first render (callbackRef is populated from window.location.href at mount
  // time; a reload is the cleanest way to trigger that path).
  await page.reload();

  // MeroProvider: checkAuth succeeds → isAuthenticated=true → LoginPage
  // redirects to APP_ROUTE. Wait for that redirect.
  await page.waitForURL(`**${APP_ROUTE}`, { timeout: 20_000 });

  // Wait until TodoListView or the welcome screen is shown (i.e., the lobby
  // hook has finished its first data fetch). Either the task-input is visible
  // (workspace exists) or the "No workspaces yet" heading is visible.
  await Promise.race([
    page.getByTestId('new-task-input').waitFor({ state: 'visible', timeout: 20_000 }),
    page.getByText('No workspaces yet').waitFor({ state: 'visible', timeout: 20_000 }),
  ]);
}

/**
 * Clear all mero-react localStorage keys so the next test starts with a
 * fresh unauthenticated state.
 */
export async function clearAuth(page: Page): Promise<void> {
  await page.evaluate(() => {
    const meroKeys = Object.keys(window.localStorage).filter((k) =>
      k.startsWith('mero:') || k.startsWith('team-todo:'),
    );
    for (const k of meroKeys) {
      window.localStorage.removeItem(k);
    }
  });
}
