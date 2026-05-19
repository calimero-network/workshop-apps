import { test, expect, type Page } from '@playwright/test';
import { loginViaHash, clearAuth } from './helpers';

// ─── local setup helpers ───────────────────────────────────────────────────

async function ensureWorkspace(page: Page): Promise<void> {
  const voteBtn = page.getByRole('button', { name: '+ Vote' });
  try {
    await voteBtn.waitFor({ state: 'visible', timeout: 8_000 });
    return;
  } catch {}
  await page.getByText('No workspaces yet').waitFor({ state: 'visible', timeout: 8_000 });
  await page.getByRole('button', { name: 'Create Workspace' }).click();
  await page.getByPlaceholder('Workspace name (e.g. Design Team)').fill('Test WS');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(voteBtn).toBeVisible({ timeout: 15_000 });
}

async function createVote(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: '+ Vote' }).click();
  await page.getByPlaceholder('e.g. Where should we have lunch?').fill(title);
  await page.getByPlaceholder('Option 1').fill('Thai');
  await page.getByPlaceholder('Option 2').fill('Sushi');
  await page.getByRole('button', { name: 'Create Vote' }).click();
  await expect(page.locator(`[data-testid="sidebar-vote-${title}"]`)).toBeVisible({ timeout: 10_000 });
}

// ─── Story: see the live results ──────────────────────────────────────────

test.describe('participant: see the live results and how the group is ranking the options', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaHash(page, 0);
    await ensureWorkspace(page);
  });

  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  test(
    'the results view always shows the current ranking, updating live as new votes and changes come in',
    async ({ page }) => {
      // Create a vote and open its detail view
      const voteTitle = `Results-Test-${Date.now()}`;
      await createVote(page, voteTitle);
      await page.locator(`[data-testid="sidebar-vote-${voteTitle}"]`).click();
      await expect(page.getByRole('heading', { name: voteTitle })).toBeVisible({ timeout: 5_000 });

      // LIVE RESULTS section is always present on the vote detail page
      await expect(page.getByText('LIVE RESULTS')).toBeVisible();

      // Initially the results panel shows the no-votes placeholder
      await expect(page.getByText('No votes yet. Be the first to rank!')).toBeVisible();

      // Submit a ranking — the live results must update immediately (no page reload needed)
      await page.getByRole('button', { name: 'Submit Ranking' }).click();
      await expect(page.getByRole('button', { name: 'Update Ranking' })).toBeVisible({ timeout: 10_000 });

      // No-votes placeholder is gone; the live tally now shows a result row
      await expect(page.getByText('No votes yet. Be the first to rank!')).not.toBeVisible();
      // Header reflects 1 submitted vote — confirms results updated live
      await expect(page.getByText('1 vote submitted')).toBeVisible({ timeout: 5_000 });
    },
  );
});
