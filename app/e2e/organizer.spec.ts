import { test, expect, type Page } from '@playwright/test';
import { loginViaHash, clearAuth } from './helpers';

// ─── local setup helpers ───────────────────────────────────────────────────

/**
 * After loginViaHash the app lands on /group-vote.
 * If no workspace exists the page shows "No workspaces yet"; create one.
 * If a workspace already exists the sidebar's "+ Vote" button is visible; return early.
 */
async function ensureWorkspace(page: Page): Promise<void> {
  const voteBtn = page.getByRole('button', { name: '+ Vote' });
  try {
    await voteBtn.waitFor({ state: 'visible', timeout: 8_000 });
    return; // workspace already present
  } catch {}
  // No workspace — create one
  await page.getByText('No workspaces yet').waitFor({ state: 'visible', timeout: 8_000 });
  await page.getByRole('button', { name: 'Create Workspace' }).click();
  await page.getByPlaceholder('Workspace name (e.g. Design Team)').fill('Test WS');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(voteBtn).toBeVisible({ timeout: 15_000 });
}

/**
 * Open the "+ Vote" modal, fill title + two options, submit.
 * Waits for the vote to appear in the sidebar before returning.
 */
async function createVote(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: '+ Vote' }).click();
  await page.getByPlaceholder('e.g. Where should we have lunch?').fill(title);
  await page.getByPlaceholder('Option 1').fill('Thai');
  await page.getByPlaceholder('Option 2').fill('Sushi');
  await page.getByRole('button', { name: 'Create Vote' }).click();
  await expect(page.locator(`[data-testid="sidebar-vote-${title}"]`)).toBeVisible({ timeout: 10_000 });
}

// ─── Story: start a new vote ───────────────────────────────────────────────

test.describe('organizer: start a new vote and add options for everyone to rank', () => {
  test(
    'after the organizer creates a vote with a title and options, every invited participant sees the vote appear in their list within 5s',
    async ({ browser }) => {
      const ctxA = await browser.newContext();
      const ctxB = await browser.newContext();
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      try {
        // ── Node 0 (organizer): log in and create a workspace ──
        await loginViaHash(pageA, 0);
        await ensureWorkspace(pageA);

        // ── Node 0: generate a recursive namespace invitation ──
        await pageA.getByRole('button', { name: 'Invite' }).click();
        await pageA.getByRole('button', { name: 'Generate Invitation' }).click();
        const inviteJson = await pageA.locator('pre').textContent({ timeout: 10_000 });
        await pageA.getByRole('button', { name: 'Close' }).click();

        // ── Node 1 (participant): log in and join workspace via invitation ──
        await loginViaHash(pageB, 1);
        await pageB.getByText('No workspaces yet').waitFor({ state: 'visible', timeout: 10_000 });
        await pageB.getByRole('button', { name: 'Join with Invitation' }).click();
        await pageB.getByPlaceholder('{"invitation": ...}').fill(inviteJson!);
        await pageB.getByRole('button', { name: 'Join' }).click();
        // Wait for node 1's sidebar to materialise (workspace sync complete)
        await expect(pageB.getByRole('button', { name: '+ Vote' })).toBeVisible({ timeout: 20_000 });

        // ── Node 0: create a vote ──
        const voteTitle = `E2E-Vote-${Date.now()}`;
        await createVote(pageA, voteTitle);

        // ── Node 1: vote must appear in the sidebar within 5 s ──
        await expect(
          pageB.locator(`[data-testid="sidebar-vote-${voteTitle}"]`),
        ).toBeVisible({ timeout: 5_000 });
      } finally {
        await ctxA.close();
        await ctxB.close();
      }
    },
  );
});

// ─── Story: close the vote ─────────────────────────────────────────────────

test.describe("organizer: close the vote when we're ready to decide", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaHash(page, 0);
    await ensureWorkspace(page);
  });

  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  test(
    'after the organizer closes the vote, the system rejects any new submissions or edits to existing rankings',
    async ({ page }) => {
      // Create a fresh vote so its status starts as "open"
      const voteTitle = `Close-Test-${Date.now()}`;
      await createVote(page, voteTitle);

      // Open the vote detail view
      await page.locator(`[data-testid="sidebar-vote-${voteTitle}"]`).click();
      await expect(page.getByRole('heading', { name: voteTitle })).toBeVisible({ timeout: 5_000 });

      // Status badge should read "Open"
      await expect(page.getByText('Open', { exact: true })).toBeVisible();

      // The organizer closes the vote
      await page.getByRole('button', { name: 'Close Vote' }).click();

      // Status badge must change to "Closed"
      await expect(page.getByText('Closed', { exact: true })).toBeVisible({ timeout: 10_000 });

      // Both ranking-submission buttons must be gone (isOpen is false — UI refuses further input)
      await expect(page.getByRole('button', { name: 'Submit Ranking' })).not.toBeVisible();
      await expect(page.getByRole('button', { name: 'Update Ranking' })).not.toBeVisible();
    },
  );
});
