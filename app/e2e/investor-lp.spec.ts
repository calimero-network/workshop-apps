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

test.describe('investor/LP: follow specific companies I care about and see their updates in real-time', () => {
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
    'an investor can select which companies to follow; the feed shows only updates from followed companies',
    async ({ page }) => {
      // Post an update from TechCo Inc
      await page.getByRole('button', { name: '+ Post Update' }).click();
      await page.getByPlaceholder('e.g. TechCo Inc').fill('TechCo Inc');
      await page
        .getByPlaceholder(/Strong month/)
        .fill('TechCo: MRR growing fast, team expanding.');
      await page.getByRole('button', { name: 'Post Update' }).click();
      await expect(page.getByText('TechCo: MRR growing fast, team expanding.')).toBeVisible({
        timeout: 10_000,
      });

      // Post an update from BetaCorp
      await page.getByRole('button', { name: '+ Post Update' }).click();
      await page.getByPlaceholder('e.g. TechCo Inc').fill('BetaCorp');
      await page
        .getByPlaceholder(/Strong month/)
        .fill('BetaCorp: EU expansion underway.');
      await page.getByRole('button', { name: 'Post Update' }).click();
      await expect(page.getByText('BetaCorp: EU expansion underway.')).toBeVisible({
        timeout: 10_000,
      });

      // Both updates are visible in the unfiltered feed
      await expect(page.getByText('TechCo: MRR growing fast, team expanding.')).toBeVisible();
      await expect(page.getByText('BetaCorp: EU expansion underway.')).toBeVisible();

      // Filter to TechCo Inc only via the company dropdown
      await page.getByRole('combobox').selectOption('TechCo Inc');
      await expect(page.getByText('TechCo: MRR growing fast, team expanding.')).toBeVisible();
      await expect(page.getByText('BetaCorp: EU expansion underway.')).not.toBeVisible();

      // Switch filter to BetaCorp — only BetaCorp updates show
      await page.getByRole('combobox').selectOption('BetaCorp');
      await expect(page.getByText('BetaCorp: EU expansion underway.')).toBeVisible();
      await expect(page.getByText('TechCo: MRR growing fast, team expanding.')).not.toBeVisible();

      // Clear filter — all updates reappear
      await page.getByRole('combobox').selectOption('');
      await expect(page.getByText('TechCo: MRR growing fast, team expanding.')).toBeVisible();
      await expect(page.getByText('BetaCorp: EU expansion underway.')).toBeVisible();
    },
  );

  // The Follow button (follow_company mutation) only renders on updates authored by a DIFFERENT user
  // (UpdateFeed.tsx: !isOwn && !isFollowed). On a single node every posted update shares the same
  // executor key, so the button is never shown. A proper test requires two nodes in the same
  // workspace: node-0 posts, node-1 (investor) clicks Follow.  Cross-node follow_company is
  // covered by test/spec-smoke.workflow.yml. Surfacing the gap here so the frontend team can add
  // a data-testid or a dedicated follow UI that doesn't depend on authorship.
  test.fixme(
    'investor clicks Follow on another company\'s update and sees the "Following" badge',
    async ({ page }) => {
      // [Verifier] NOTE: Follow button only appears on !isOwn updates (UpdateFeed.tsx line 156).
      // Single-node tests cannot produce a non-own update; multi-node setup needs workspace
      // sharing via invitation flow across browser contexts.
      // follow_company round-trip is verified in test/spec-smoke.workflow.yml.
    },
  );
});
