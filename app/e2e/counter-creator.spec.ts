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
// Story: counter creator — reset the counter back to zero
// Criterion: after the creator clicks reset, the counter returns to 0 and all
//            participants see the reset reflected within 2s
// ---------------------------------------------------------------------------

test.describe('counter creator: reset the counter back to zero', () => {
  test('after the creator clicks reset the counter returns to 0', async ({ page }) => {
    // Node 0 is the creator because they initialise the workspace/counter context
    await loginViaHash(page, 0);
    await setupWorkspace(page);

    // Ensure the counter is > 0 before reset
    await page.locator('[data-testid="increment-button"]').click();
    await expect(page.locator('[data-testid="counter-value"]')).toHaveText(/^[1-9]\d*$/, {
      timeout: 5_000,
    });

    // Reset button is creator-only; it must be visible for node 0
    const resetBtn = page.locator('[data-testid="reset-button"]');
    await expect(resetBtn).toBeVisible({ timeout: 5_000 });
    await resetBtn.click();

    await expect(page.locator('[data-testid="counter-value"]')).toHaveText('0', {
      timeout: 5_000,
    });

    await clearAuth(page);
  });

  test('all participants see the reset reflected within 2s', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // --- Node 0 (creator): set up workspace and invite node 1 ---
      await loginViaHash(pageA, 0);
      await setupWorkspace(pageA);

      await pageA.getByRole('button', { name: 'Invite member' }).click();
      await pageA.getByRole('button', { name: 'Generate Invitation' }).click();
      const invitePre = pageA.locator('pre');
      await invitePre.waitFor({ timeout: 15_000 });
      const inviteJson = await invitePre.textContent();
      await pageA.getByRole('button', { name: 'Close' }).click();

      // --- Node 1 (member): join ---
      await loginViaHash(pageB, 1);
      await pageB.getByRole('button', { name: 'Join with Invitation' }).click();
      await pageB.getByPlaceholder('{"invitation": ...}').fill(inviteJson!);
      await pageB.getByRole('button', { name: 'Join' }).click();
      await pageB.locator('[data-testid="increment-button"]').waitFor({ timeout: 25_000 });

      // --- Node 0 increments to make counter > 0, then resets ---
      await pageA.locator('[data-testid="increment-button"]').click();
      await expect(pageA.locator('[data-testid="counter-value"]')).toHaveText(/^[1-9]\d*$/, {
        timeout: 5_000,
      });

      const resetBtn = pageA.locator('[data-testid="reset-button"]');
      await expect(resetBtn).toBeVisible({ timeout: 5_000 });
      await resetBtn.click();
      await expect(pageA.locator('[data-testid="counter-value"]')).toHaveText('0', {
        timeout: 5_000,
      });

      // --- Node 1 sees the reset within 2s ---
      await expect(pageB.locator('[data-testid="counter-value"]')).toHaveText('0', {
        timeout: 2_000,
      });
    } finally {
      await clearAuth(pageA);
      await clearAuth(pageB);
      await ctxA.close();
      await ctxB.close();
    }
  });
});
