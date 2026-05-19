import { test, expect, Page } from '@playwright/test';
import { loginViaHash, clearAuth } from './helpers';

// ---------------------------------------------------------------------------
// Shared setup helpers (same pattern as sender.spec.ts — kept self-contained)
// ---------------------------------------------------------------------------

async function ensureConversation(page: Page, alias: string): Promise<void> {
  const compose = page.getByPlaceholder('Type a message...');
  if (await compose.isVisible({ timeout: 3_000 }).catch(() => false)) return;

  const welcomeBtn = page.getByRole('button', { name: 'New conversation' });
  if (await welcomeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await welcomeBtn.click();
  } else {
    await page.locator('[title="Start a new 1-on-1 conversation"]').click();
  }

  await page.getByPlaceholder('e.g. Chat with Alice').fill(alias);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(compose).toBeVisible({ timeout: 20_000 });
}

async function inviteAndJoin(pageA: Page, pageB: Page): Promise<void> {
  await pageA.getByRole('button', { name: 'Invite friend' }).click();
  await pageA.getByRole('button', { name: 'Generate Invitation' }).click();
  const inviteJson = await pageA.locator('pre').textContent({ timeout: 10_000 });
  await pageA.getByRole('button', { name: 'Close' }).click();

  await pageB.getByRole('button', { name: 'Join with invitation' }).click();
  await pageB.getByPlaceholder('{"invitation": ...}').fill(inviteJson!);
  await pageB.getByRole('button', { name: 'Join' }).click();
  await expect(pageB.getByPlaceholder('Type a message...')).toBeVisible({ timeout: 25_000 });
}

// ---------------------------------------------------------------------------
// Story: see new messages arrive live
// ---------------------------------------------------------------------------

test.describe('recipient: see new messages arrive live', () => {
  test(
    "whenever the sender posts a message, the recipient's screen updates live without needing to refresh",
    async ({ browser }) => {
      const ctxA = await browser.newContext();
      const ctxB = await browser.newContext();
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      try {
        await loginViaHash(pageA, 0);
        await loginViaHash(pageB, 1);

        await ensureConversation(pageA, 'Live Update Test');
        await inviteAndJoin(pageA, pageB);

        const messageText = 'Live message — no refresh needed';
        await pageA.getByPlaceholder('Type a message...').fill(messageText);
        await pageA.getByRole('button', { name: 'Send' }).click();

        // [Verifier] NOTE: "live without needing to refresh" is demonstrated by
        // asserting the message appears on pageB without any page.reload() or
        // navigation call between send and assertion.
        await expect(pageB.getByText(messageText)).toBeVisible({ timeout: 5_000 });
      } finally {
        await clearAuth(pageA).catch(() => {});
        await clearAuth(pageB).catch(() => {});
        await ctxA.close();
        await ctxB.close();
      }
    },
  );
});
