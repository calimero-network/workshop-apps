import { test, expect, type Page } from '@playwright/test';
import { loginViaHash, clearAuth } from './helpers';

// ---------------------------------------------------------------------------
// Local helpers — workspace setup + counter value reader
// ---------------------------------------------------------------------------

/** Navigate through the "Create Workspace" flow if no workspace exists yet. */
async function setupWorkspace(page: Page): Promise<void> {
  const incrementBtn = page.locator('[data-testid="increment-button"]');
  const isReady = await incrementBtn.isVisible({ timeout: 4_000 }).catch(() => false);
  if (isReady) return;

  await page.getByRole('button', { name: 'Create Workspace' }).click();
  await page.getByPlaceholder('Workspace name (e.g. Design Team)').fill('Test');
  await page.getByRole('button', { name: 'Create' }).click();
  await incrementBtn.waitFor({ timeout: 20_000 });
}

/** Wait for the loading placeholder ('…') to clear and return the numeric total. */
async function readCounterValue(page: Page): Promise<number> {
  const el = page.locator('[data-testid="counter-value"]');
  await expect(el).toHaveText(/^\d+$/, { timeout: 8_000 });
  return parseInt((await el.textContent()) ?? '0', 10);
}

// ---------------------------------------------------------------------------
// Story: participant — increment the shared counter by 1 with a single tap
// Criterion: after a participant taps the increment button, the counter value
//            increases by 1 and all participants see the new total within 2s
// ---------------------------------------------------------------------------

test.describe('participant: increment the shared counter by 1 with a single tap', () => {
  test('after tapping increment the counter value increases by 1', async ({ page }) => {
    await loginViaHash(page, 0);
    await setupWorkspace(page);

    const before = await readCounterValue(page);
    await page.locator('[data-testid="increment-button"]').click();

    await expect(page.locator('[data-testid="counter-value"]')).toHaveText(
      String(before + 1),
      { timeout: 5_000 },
    );

    await clearAuth(page);
  });

  test('all participants see the new total within 2s', async ({ browser }) => {
    // [Verifier] NOTE: this test exercises the cross-node sync criterion.
    // Node 0 creates the workspace; node 1 joins via the namespace invitation.
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // --- Node 0: set up workspace and generate an invitation ---
      await loginViaHash(pageA, 0);
      await setupWorkspace(pageA);

      await pageA.getByRole('button', { name: 'Invite member' }).click();
      await pageA.getByRole('button', { name: 'Generate Invitation' }).click();
      const invitePre = pageA.locator('pre');
      await invitePre.waitFor({ timeout: 15_000 });
      const inviteJson = await invitePre.textContent();
      await pageA.getByRole('button', { name: 'Close' }).click();

      // --- Node 1: join workspace via invitation ---
      await loginViaHash(pageB, 1);
      await pageB.getByRole('button', { name: 'Join with Invitation' }).click();
      await pageB.getByPlaceholder('{"invitation": ...}').fill(inviteJson!);
      await pageB.getByRole('button', { name: 'Join' }).click();
      await pageB.locator('[data-testid="increment-button"]').waitFor({ timeout: 25_000 });

      // --- Node 0 increments ---
      const before = await readCounterValue(pageA);
      await pageA.locator('[data-testid="increment-button"]').click();
      await expect(pageA.locator('[data-testid="counter-value"]')).toHaveText(
        String(before + 1),
        { timeout: 5_000 },
      );

      // --- Node 1 sees the same total without a manual refresh within 2s ---
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
  });
});

// ---------------------------------------------------------------------------
// Story: participant — see who made the last increment and when
// Criterion: the counter display always shows the name of the participant who
//            last incremented and the timestamp of that action
// ---------------------------------------------------------------------------

test.describe('participant: see who made the last increment and when', () => {
  test('the counter display always shows last incrementer name and timestamp', async ({ page }) => {
    await loginViaHash(page, 0);
    await setupWorkspace(page);

    // Perform an increment so the activity row is populated
    await page.locator('[data-testid="increment-button"]').click();

    // Both the "by <id>" and the timestamp must be visible
    await expect(page.locator('[data-testid="last-by"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="last-at"]')).toBeVisible({ timeout: 5_000 });

    await clearAuth(page);
  });
});
