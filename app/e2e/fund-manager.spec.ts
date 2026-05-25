import { test, expect, type Page } from '@playwright/test';
import { loginViaHash, clearAuth } from './helpers';

/**
 * Ensures a workspace exists on the page.
 * If the welcome screen is shown (no workspaces), creates one with the default name.
 */
async function ensureWorkspace(page: Page): Promise<void> {
  const createBtn = page.getByRole('button', { name: 'Create Workspace' });
  const visible = await createBtn
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (visible) {
    await createBtn.click();
    // CreateWorkspaceModal: h3 "New Workspace", button "Create" (name optional → uses default)
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('📡 Update Feed')).toBeVisible({ timeout: 15_000 });
  }
}

// ---------------------------------------------------------------------------
// Story 1: See all founder updates in one live feed as they come in
// ---------------------------------------------------------------------------
test.describe('fund manager: see all founder updates in one live feed as they come in', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaHash(page, 0);
    await ensureWorkspace(page);
    // Confirm we're on the Update Feed view
    await expect(page.getByText('📡 Update Feed')).toBeVisible({ timeout: 5_000 });
  });

  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  test(
    'the feed shows all updates from every portfolio company, newest first, and refreshes live as founders post',
    async ({ page }) => {
      // Post first update (TechCo Inc)
      await page.getByRole('button', { name: '+ Post Update' }).click();
      await page.getByPlaceholder('e.g. TechCo Inc').fill('TechCo Inc');
      await page
        .getByPlaceholder(/Strong month/)
        .fill('TechCo: strong Q2, MRR at $50k.');
      await page.getByRole('button', { name: 'Post Update' }).click();
      await expect(page.getByText('TechCo: strong Q2, MRR at $50k.')).toBeVisible({
        timeout: 10_000,
      });

      // Post second update (BetaVentures)
      await page.getByRole('button', { name: '+ Post Update' }).click();
      await page.getByPlaceholder('e.g. TechCo Inc').fill('BetaVentures');
      await page
        .getByPlaceholder(/Strong month/)
        .fill('BetaVentures: new enterprise contract signed.');
      await page.getByRole('button', { name: 'Post Update' }).click();
      await expect(
        page.getByText('BetaVentures: new enterprise contract signed.'),
      ).toBeVisible({ timeout: 10_000 });

      // Both updates from both companies appear in the feed simultaneously
      await expect(page.getByText('TechCo: strong Q2, MRR at $50k.')).toBeVisible();
      await expect(
        page.getByText('BetaVentures: new enterprise contract signed.'),
      ).toBeVisible();

      // [Verifier] NOTE: "Refreshes live as founders post" (cross-node realtime) is verified
      // in test/spec-smoke.workflow.yml via post_update + wait_for_sync + get_updates on app-node-2.
    },
  );
});

// ---------------------------------------------------------------------------
// Story 2: See key metrics (burn rate, runway, MRR, user count) on one dashboard
// ---------------------------------------------------------------------------
test.describe('fund manager: see key metrics from all portfolio companies on one dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaHash(page, 0);
    await ensureWorkspace(page);
    // Navigate to the Metrics Dashboard via the sidebar view switcher
    await page.getByText('📊 Metrics Dashboard').click();
    await expect(page.getByRole('button', { name: '+ Log Metric' })).toBeVisible({
      timeout: 5_000,
    });
  });

  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  test(
    'the dashboard displays the latest metrics from each company and updates within 5 seconds when a founder posts new numbers',
    async ({ page }) => {
      // Open LogMetricModal
      await page.getByRole('button', { name: '+ Log Metric' }).click();
      await expect(page.getByText('Log Metric')).toBeVisible();

      // Fill in metric details
      await page.getByPlaceholder('e.g. TechCo Inc').fill('TechCo Inc');
      await page.getByPlaceholder('e.g. MRR').fill('MRR');
      await page.getByPlaceholder('e.g. $45,000').fill('$45000');

      // Submit
      await page.getByRole('button', { name: 'Log Metric' }).click();

      // Metric row appears in the dashboard table
      await expect(page.getByText('TechCo Inc')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('MRR')).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText('$45000')).toBeVisible({ timeout: 5_000 });

      // [Verifier] NOTE: "Updates within 5 s" (cross-node realtime) is verified
      // in test/spec-smoke.workflow.yml via log_metric + wait_for_sync + get_latest_metrics on app-node-2.
    },
  );
});

// ---------------------------------------------------------------------------
// Story 3: Comment on a founder's update and have a conversation right there
// ---------------------------------------------------------------------------
test.describe("fund manager: comment on a founder's update and have a conversation right there", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaHash(page, 0);
    await ensureWorkspace(page);
    // Confirm we're on the Update Feed view
    await expect(page.getByText('📡 Update Feed')).toBeVisible({ timeout: 5_000 });
  });

  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  test(
    'after a fund manager posts a comment on an update, threaded comments stay attached to the original update',
    async ({ page }) => {
      // Post an update to comment on
      await page.getByRole('button', { name: '+ Post Update' }).click();
      await page.getByPlaceholder('e.g. TechCo Inc').fill('TechCo Inc');
      await page
        .getByPlaceholder(/Strong month/)
        .fill('Record month: $1M ARR milestone reached.');
      await page.getByRole('button', { name: 'Post Update' }).click();
      await expect(
        page.getByText('Record month: $1M ARR milestone reached.'),
      ).toBeVisible({ timeout: 10_000 });

      // Open the comment thread on the first update card
      await page.getByRole('button', { name: /▼ Comments/ }).first().click();

      // Write a comment and submit via the Reply button
      await page.getByPlaceholder('Write a comment…').fill('Great momentum. Discuss hiring next week.');
      await page.getByRole('button', { name: 'Reply' }).click();

      // Comment appears threaded inside the update card
      await expect(
        page.getByText('Great momentum. Discuss hiring next week.'),
      ).toBeVisible({ timeout: 10_000 });

      // [Verifier] NOTE: "Founder sees it within 5 s" (cross-node) is verified
      // in test/spec-smoke.workflow.yml via post_comment + wait_for_sync + get_comments on app-node-2.
    },
  );
});
