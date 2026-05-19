import { test, expect } from '@playwright/test';
import { loginViaHash, clearAuth } from './helpers';

// ---------------------------------------------------------------------------
// Story: see our full message history whenever I open the chat
// ---------------------------------------------------------------------------

test.describe('either user: see our full message history whenever I open the chat', () => {
  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  test(
    'every time a user opens the chat, all prior messages are visible in chronological order',
    async ({ page }) => {
      await loginViaHash(page, 0);

      // Ensure a conversation is active — create one if this is a fresh state
      const compose = page.getByPlaceholder('Type a message...');
      if (!(await compose.isVisible({ timeout: 3_000 }).catch(() => false))) {
        const welcomeBtn = page.getByRole('button', { name: 'New conversation' });
        if (await welcomeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await welcomeBtn.click();
        } else {
          // Main layout: sidebar "New conversation" div
          await page.locator('[title="Start a new 1-on-1 conversation"]').click();
        }
        await page.getByPlaceholder('e.g. Chat with Alice').fill('History Test');
        await page.getByRole('button', { name: 'Create' }).click();
        await expect(compose).toBeVisible({ timeout: 20_000 });
      }

      // Send three messages in order
      await compose.fill('First message');
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByText('First message')).toBeVisible({ timeout: 5_000 });

      await compose.fill('Second message');
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByText('Second message')).toBeVisible({ timeout: 5_000 });

      await compose.fill('Third message');
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByText('Third message')).toBeVisible({ timeout: 5_000 });

      // Reload the page — simulates "opening the chat" again.
      // Auth is persisted in localStorage so the app re-enters the chat view.
      await page.reload();

      // All prior messages must be visible after reload
      await expect(page.getByText('First message')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('Second message')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('Third message')).toBeVisible({ timeout: 10_000 });

      // Verify chronological order by comparing vertical (Y) positions in the viewport
      const firstBox  = await page.getByText('First message').first().boundingBox();
      const secondBox = await page.getByText('Second message').first().boundingBox();
      const thirdBox  = await page.getByText('Third message').first().boundingBox();

      expect(firstBox).not.toBeNull();
      expect(secondBox).not.toBeNull();
      expect(thirdBox).not.toBeNull();
      expect(firstBox!.y).toBeLessThan(secondBox!.y);
      expect(secondBox!.y).toBeLessThan(thirdBox!.y);
    },
  );
});
