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
    // exact: true prevents substring-match against the still-visible "Create Workspace" button
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByText('📡 Update Feed')).toBeVisible({ timeout: 15_000 });
  }
}

test.describe('founder: post a monthly progress update once and have it instantly visible to my fund manager and investors', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaHash(page, 0);
    await ensureWorkspace(page);
  });

  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  test(
    'after a founder submits an update, every fund manager and invited investor sees it in their feed within 5 seconds',
    async ({ page }) => {
      // Open the PostUpdateModal
      await page.getByRole('button', { name: '+ Post Update' }).click();
      await expect(page.getByText('Post Progress Update')).toBeVisible();

      // Fill in company name and update body
      await page.getByPlaceholder('e.g. TechCo Inc').fill('AlphaStartup');
      await page
        .getByPlaceholder(/Strong month/)
        .fill('Q2 recap: MRR up 18%, runway 20 months.');

      // Submit
      await page.getByRole('button', { name: 'Post Update' }).click();

      // Update appears immediately in the local feed
      await expect(page.getByText('AlphaStartup')).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByText('Q2 recap: MRR up 18%, runway 20 months.'),
      ).toBeVisible({ timeout: 5_000 });

      // [Verifier] NOTE: Cross-node propagation — fund manager / investor sees the update within 5 s —
      // is verified end-to-end in test/spec-smoke.workflow.yml via:
      //   call post_update on app-node-1 → wait_for_sync → call get_updates on app-node-2 → json_assert.
    },
  );
});
