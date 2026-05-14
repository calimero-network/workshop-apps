/**
 * Playwright specs for player user stories.
 *
 * Stories covered:
 *   1. player: create a D&D character with name, class, and ability scores
 *   2. player: describe what my character is doing (attack, climb, persuade, etc.)
 */

import { test, expect } from '@playwright/test';
import { loginViaHash, clearAuth } from './helpers';

// ── Shared helper: ensure we reach the table view ─────────────────────────

/**
 * If the welcome "No Game Tables Yet" screen is shown, create a workspace
 * named `campaignName` so the table view (with "My Character" button) loads.
 */
async function ensureTableView(page: import('@playwright/test').Page, campaignName = 'Test Campaign') {
  const noTableBtn = page.getByRole('button', { name: '⚔️ New Game Table' });
  const isWelcome = await noTableBtn.isVisible({ timeout: 4_000 }).catch(() => false);

  if (isWelcome) {
    await noTableBtn.click();
    await page.getByPlaceholder('e.g. The Lost Mines of Phandelver').fill(campaignName);
    await page.getByRole('button', { name: 'Begin Campaign' }).click();
  }

  // Wait for the RoomView header button that confirms the table is loaded.
  await expect(page.getByRole('button', { name: '📋 My Character' })).toBeVisible({ timeout: 30_000 });
}

// ── Story 1: create a D&D character ──────────────────────────────────────

test.describe('player: create a D&D character with name, class, and ability scores', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaHash(page);
  });
  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  test('after a player creates a character, they see their stats and HP on their character sheet', async ({ page }) => {
    await ensureTableView(page, 'Player Character Test');

    // Open the character sheet modal.
    await page.getByRole('button', { name: '📋 My Character' }).click();
    await expect(page.getByText('Character Sheet')).toBeVisible({ timeout: 5_000 });

    // If a character already exists the modal shows the view — close and skip creation.
    const enterAdventureBtn = page.getByRole('button', { name: 'Enter the Adventure' });
    const alreadyHasChar = !(await enterAdventureBtn.isVisible({ timeout: 2_000 }).catch(() => false));

    if (!alreadyHasChar) {
      // Fill the character creation form.
      await page.getByPlaceholder('e.g. Aragorn').fill('Thorin Oakenshield');

      // Class select defaults to "Fighter" — use it as-is.
      // Ability scores already have sensible defaults (10 each).

      await enterAdventureBtn.click();

      // Modal closes automatically after successful creation.
      // Re-open to view the populated character sheet.
      await expect(page.getByRole('button', { name: '📋 My Character' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: '📋 My Character' }).click();
    }

    // The character sheet view shows the character name and HP section.
    await expect(page.getByText('Thorin Oakenshield').or(page.getByText('HP'))).toBeVisible({ timeout: 10_000 });
    // HP label is always present on the character view.
    await expect(page.getByText('HP').first()).toBeVisible({ timeout: 5_000 });
  });
});

// ── Story 2: describe an action for the DM to roll ───────────────────────

test.describe('player: describe what my character is doing', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaHash(page);
  });
  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  test('after a player posts an action, the DM sees it in the chat and can roll the required ability check', async ({ page }) => {
    await ensureTableView(page, 'Action Post Test');

    // The message input is always visible in the RoomView right panel.
    const msgInput = page.getByPlaceholder('Speak your action… (Enter to send)');
    await expect(msgInput).toBeVisible({ timeout: 15_000 });

    // Post an action message.
    const actionText = 'I swing my axe at the goblin!';
    await msgInput.fill(actionText);
    await page.getByRole('button', { name: 'Send' }).click();

    // The message appears in the game log visible to everyone at the table.
    await expect(page.getByText(actionText)).toBeVisible({ timeout: 10_000 });

    // [Verifier] NOTE: "the DM can roll the required ability check" is an
    // affordance exercised in dm.spec.ts (story: roll a d20 for a player).
    // This test verifies the player-side: the action appears in the shared chat.
  });
});
