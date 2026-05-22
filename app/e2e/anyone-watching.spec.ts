import { test, expect, type Page } from '@playwright/test';
import { loginViaHash, clearAuth } from './helpers';

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

async function setupWorkspace(page: Page): Promise<void> {
  const incrementBtn = page.locator('[data-testid="increment-button"]');
  const isReady = await incrementBtn.isVisible({ timeout: 4_000 }).catch(() => false);
  if (isReady) return;

  await page.getByRole('button', { name: 'Create Workspace' }).click();
  await page.getByPlaceholder('Workspace name (e.g. Design Team)').fill('Test');
  await page.getByRole('button', { name: 'Create' }).click();
  await incrementBtn.waitFor({ timeout: 20_000 });
}

async function readCounterValue(page: Page): Promise<number> {
  const el = page.locator('[data-testid="counter-value"]');
  await expect(el).toHaveText(/^\d+$/, { timeout: 8_000 });
  return parseInt((await el.textContent()) ?? '0', 10);
}

// ---------------------------------------------------------------------------
// Story: anyone watching — see the current total update live on my screen
// Criterion: whenever any participant increments the counter, the displayed
//            total on all screens updates within 2s without requiring a manual
//            refresh
// ---------------------------------------------------------------------------

test.describe('anyone watching: see the current total update live on my screen', () => {
  test(
    'whenever any participant increments, the displayed total updates within 2s without manual refresh',
    async ({ browser }) => {
      const ctxA = await browser.newContext();
      const ctxB = await browser.newContext();
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      try {
        // --- Node 0 (participant): create workspace and issue invitation ---
        await loginViaHash(pageA, 0);
        await setupWorkspace(pageA);

        await pageA.getByRole('button', { name: 'Invite member' }).click();
        await pageA.getByRole('button', { name: 'Generate Invitation' }).click();
        const invitePre = pageA.locator('pre');
        await invitePre.waitFor({ timeout: 15_000 });
        const inviteJson = await invitePre.textContent();
        await pageA.getByRole('button', { name: 'Close' }).click();

        // --- Node 1 (watcher): join and land on the counter page ---
        await loginViaHash(pageB, 1);
        await pageB.getByRole('button', { name: 'Join with Invitation' }).click();
        await pageB.getByPlaceholder('{"invitation": ...}').fill(inviteJson!);
        await pageB.getByRole('button', { name: 'Join' }).click();
        await pageB.locator('[data-testid="increment-button"]').waitFor({ timeout: 25_000 });

        // Read the watcher's current value — from this point node 1 is NOT touched
        const before = await readCounterValue(pageB);

        // Node 0 increments; node 1 page is left untouched (no manual refresh)
        await pageA.locator('[data-testid="increment-button"]').click();

        // Watcher's screen must reflect the new total live within 2s
        await expect(pageB.locator('[data-testid="counter-value"]')).toHaveText(
          String(before + 1),
          { timeout: 2_000 },
        );
      } finally {
        await clearAuth(pageA);
        await clearAuth(pageB);
        await ctxA.close();
        await ctxB.close();
      }
    },
  );
});
