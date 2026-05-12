/**
 * Shared helpers for trip-splitter Playwright e2e tests.
 *
 * loginViaHash(page, nodeIndex)
 *   Sets Calimero auth credentials in localStorage for the given node
 *   (0-based) then navigates to APP_ROUTE and waits for it to load.
 *
 * clearAuth(page)
 *   Clears localStorage so the next test starts from a clean slate.
 */

import { type Page } from '@playwright/test';
import fs from 'fs';
import { FIXTURE_PATH, type NodeFixture } from './global-setup';

/** The main app route as defined in studio.config.json metadata.route. */
export const APP_ROUTE = '/trip-splitter';

function loadFixture(nodeIndex: number): NodeFixture {
  const raw = fs.readFileSync(FIXTURE_PATH, 'utf-8');
  const fixtures: NodeFixture[] = JSON.parse(raw) as NodeFixture[];
  const fixture = fixtures[nodeIndex];
  if (!fixture) {
    throw new Error(
      `No fixture for node index ${nodeIndex}. ` +
        `NODE_COUNT may be too small (currently ${fixtures.length}).`,
    );
  }
  return fixture;
}

/**
 * Authenticate as node `nodeIndex` and navigate to the trip-splitter page.
 *
 * The Calimero MeroProvider reads the node URL and admin token from
 * localStorage keys.  We write them directly rather than going through
 * the ConnectButton UI so that tests are fast and deterministic.
 */
export async function loginViaHash(page: Page, nodeIndex = 0): Promise<void> {
  const { rpcUrl, adminToken } = loadFixture(nodeIndex);

  // Land on the root first so we have a same-origin context to set storage.
  await page.goto('/');

  await page.evaluate(
    ([url, token]: [string, string]) => {
      localStorage.setItem('calimero:nodeUrl', url);
      localStorage.setItem('calimero:adminToken', token);
    },
    [rpcUrl, adminToken] as [string, string],
  );

  // Navigate to the app and wait for the URL to stabilise.
  await page.goto(APP_ROUTE);
  await page.waitForURL(`**${APP_ROUTE}**`, { timeout: 15_000 });
}

/** Remove all Calimero auth state so the next test starts clean. */
export async function clearAuth(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.clear());
}
