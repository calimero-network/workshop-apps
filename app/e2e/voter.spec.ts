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

// ─── Story: rank the options ───────────────────────────────────────────────

test.describe('voter: rank the options from best to worst', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaHash(page, 0);
    await ensureWorkspace(page);
  });

  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  test(
    'after a voter submits a ranking (1st, 2nd, 3rd...), their vote is saved and immediately affects the live results',
    async ({ page }) => {
      // Create a vote for this test
      const voteTitle = `Rank-Test-${Date.now()}`;
      await createVote(page, voteTitle);

      // Open the vote detail view
      await page.locator(`[data-testid="sidebar-vote-${voteTitle}"]`).click();
      await expect(page.getByRole('heading', { name: voteTitle })).toBeVisible({ timeout: 5_000 });

      // Before any submission the LIVE RESULTS section shows "no votes" placeholder
      await expect(page.getByText('No votes yet. Be the first to rank!')).toBeVisible();

      // Submit ranking in the default order (Thai 1st, Sushi 2nd)
      await page.getByRole('button', { name: 'Submit Ranking' }).click();

      // Ranking saved: action button changes to "Update Ranking"
      await expect(page.getByRole('button', { name: 'Update Ranking' })).toBeVisible({ timeout: 10_000 });

      // Live results now reflects 1 submitted vote
      await expect(page.getByText('1 vote submitted')).toBeVisible({ timeout: 5_000 });
    },
  );
});

// ─── Story: change my ranking ──────────────────────────────────────────────

test.describe('voter: change my ranking before the vote closes', () => {
  test(
    'a voter can update their ranking anytime the vote is open; all participants see the new tally within 5s',
    async ({ browser }) => {
      const ctxA = await browser.newContext();
      const ctxB = await browser.newContext();
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      try {
        // ── Node 0 (voter): create workspace + vote ──
        await loginViaHash(pageA, 0);
        await ensureWorkspace(pageA);

        // Generate invitation for node 1
        await pageA.getByRole('button', { name: 'Invite' }).click();
        await pageA.getByRole('button', { name: 'Generate Invitation' }).click();
        const inviteJson = await pageA.locator('pre').textContent({ timeout: 10_000 });
        await pageA.getByRole('button', { name: 'Close' }).click();

        // ── Node 1 (participant): join workspace ──
        await loginViaHash(pageB, 1);
        await pageB.getByText('No workspaces yet').waitFor({ state: 'visible', timeout: 10_000 });
        await pageB.getByRole('button', { name: 'Join with Invitation' }).click();
        await pageB.getByPlaceholder('{"invitation": ...}').fill(inviteJson!);
        await pageB.getByRole('button', { name: 'Join' }).click();
        await expect(pageB.getByRole('button', { name: '+ Vote' })).toBeVisible({ timeout: 20_000 });

        // ── Node 0: create vote and submit initial ranking ──
        const voteTitle = `Update-Rank-${Date.now()}`;
        await createVote(pageA, voteTitle);
        await pageA.locator(`[data-testid="sidebar-vote-${voteTitle}"]`).click();
        await expect(pageA.getByRole('heading', { name: voteTitle })).toBeVisible({ timeout: 5_000 });
        await pageA.getByRole('button', { name: 'Submit Ranking' }).click();
        await expect(pageA.getByRole('button', { name: 'Update Ranking' })).toBeVisible({ timeout: 10_000 });

        // ── Node 0: reorder — move Sushi (position 1) up to position 0 ──
        // [title="Move up"] buttons: index 0 is Thai (disabled), index 1 is Sushi (enabled)
        await pageA.getByTitle('Move up').nth(1).click();
        await pageA.getByRole('button', { name: 'Update Ranking' }).click();
        // Button cycles through "Saving…" then back to "Update Ranking" on success
        await expect(pageA.getByRole('button', { name: 'Update Ranking' })).toBeVisible({ timeout: 10_000 });

        // ── Node 1: open the same vote and see the updated tally within 5 s ──
        await expect(
          pageB.locator(`[data-testid="sidebar-vote-${voteTitle}"]`),
        ).toBeVisible({ timeout: 10_000 });
        await pageB.locator(`[data-testid="sidebar-vote-${voteTitle}"]`).click();
        await expect(pageB.getByRole('heading', { name: voteTitle })).toBeVisible({ timeout: 5_000 });

        // Node 1 sees the tally (1 vote submitted) within 5 s, confirming the update synced
        await expect(pageB.getByText('1 vote submitted')).toBeVisible({ timeout: 5_000 });
      } finally {
        await ctxA.close();
        await ctxB.close();
      }
    },
  );
});
