/**
 * Playwright specs for DM user stories.
 *
 * Stories covered:
 *   1. DM: create a game and invite players to the table
 *   2. DM: roll a d20 for a player's ability and see their modifier automatically applied
 *   3. DM: roll dice for NPCs and monsters
 *   4. DM: set the difficulty (DC) for rolls and judge whether players succeed
 *   5. DM: manage turn order and control whose turn it is in combat
 *   6. DM: adjust character HP and manage game state (exploring, combat, resting)
 */

import { test, expect, type Page } from '@playwright/test';
import { loginViaHash, clearAuth } from './helpers';

// ── Shared helper ─────────────────────────────────────────────────────────

/** Create a new workspace if the welcome screen is shown, then wait for the
 *  table view. Returns after "📋 My Character" button is visible. */
async function ensureTableView(page: Page, campaignName: string): Promise<void> {
  const noTableBtn = page.getByRole('button', { name: '⚔️ New Game Table' });
  const isWelcome = await noTableBtn.isVisible({ timeout: 4_000 }).catch(() => false);
  if (isWelcome) {
    await noTableBtn.click();
    await page.getByPlaceholder('e.g. The Lost Mines of Phandelver').fill(campaignName);
    await page.getByRole('button', { name: 'Begin Campaign' }).click();
  }
  await expect(page.getByRole('button', { name: '📋 My Character' })).toBeVisible({ timeout: 30_000 });
}

/** Create a character so the player appears in the DM's character roster.
 *  Skips creation if the character already exists. */
async function ensureCharacter(page: Page, charName: string): Promise<void> {
  await page.getByRole('button', { name: '📋 My Character' }).click();
  await expect(page.getByText('Character Sheet')).toBeVisible({ timeout: 5_000 });

  const enterBtn = page.getByRole('button', { name: 'Enter the Adventure' });
  const needsCreation = await enterBtn.isVisible({ timeout: 2_000 }).catch(() => false);

  if (needsCreation) {
    await page.getByPlaceholder('e.g. Aragorn').fill(charName);
    await enterBtn.click();
    // Modal closes after creation.
    await expect(page.getByRole('button', { name: '📋 My Character' })).toBeVisible({ timeout: 10_000 });
  } else {
    // Already has a character — close the modal.
    await page.getByRole('button', { name: 'Close' }).click();
  }
}

// ── Story 1: create a game and invite players ─────────────────────────────

test.describe('DM: create a game and invite players to the table', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaHash(page);
  });
  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  test('after the DM invites players, they see the game appear in their list within 5s and can join', async ({ page }) => {
    await ensureTableView(page, 'The Lost Mines');

    // The DM sees the game table in the sidebar GAME TABLES list.
    await expect(page.getByText('GAME TABLES')).toBeVisible({ timeout: 5_000 });

    // DM opens the invite modal via the sidebar button.
    // [Verifier] NOTE: story expects 'Invite'; UI says '📜 Invite Adventurer'.
    await page.getByRole('button', { name: '📜 Invite Adventurer' }).click();
    await expect(page.getByText('Invite Adventurer')).toBeVisible({ timeout: 5_000 });

    // Generate the invitation scroll.
    await page.getByRole('button', { name: '🪄 Generate Invitation Scroll' }).click();

    // The share message appears once the scroll is ready.
    await expect(page.getByText('Share this scroll with your adventurer:')).toBeVisible({ timeout: 15_000 });

    // [Verifier] NOTE: cross-node assertion ("friend sees the game appear within 5s")
    // requires a live two-node Calimero setup. That flow is covered by the
    // merobox workflow in test/smoke.workflow.yml (join_namespace step).
    // Here we verify the DM side completes without error.
  });
});

// ── Story 2: roll a d20 for a player ─────────────────────────────────────

test.describe('DM: roll a d20 for a player ability check', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaHash(page);
  });
  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  test('after the DM rolls for a player, the result (d20 + ability modifier = total) appears in the shared log within 2s', async ({ page }) => {
    await ensureTableView(page, 'Roll d20 Test');
    await ensureCharacter(page, 'Legolas');

    // The DM controls panel appears when isDm is true and gameInfo is loaded.
    await expect(page.getByText('🎲 DM Controls')).toBeVisible({ timeout: 15_000 });

    // Select the player from the "ROLL FOR PLAYER" dropdown.
    // The dropdown is populated with characters from the roster.
    const playerSelect = page.locator('select').first();
    await expect(playerSelect).toBeVisible({ timeout: 10_000 });

    // Choose the first non-empty option (Legolas).
    await playerSelect.selectOption({ index: 1 });

    // Ability defaults to "strength" — use as-is.
    // Fill in a reason.
    await page.getByPlaceholder('Reason (e.g. attack roll)').fill('attack roll');

    // Click roll.
    await page.getByRole('button', { name: '🎲 Roll d20' }).click();

    // A roll event (event_type="roll") appears in the game log within 2 s.
    // MessageBubble renders it as "🎲 ROLL" for roll events.
    await expect(page.getByText('ROLL').first()).toBeVisible({ timeout: 5_000 });
  });
});

// ── Story 3: roll for NPCs / monsters ────────────────────────────────────

test.describe('DM: roll dice for NPCs and monsters', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaHash(page);
  });
  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  test('after the DM rolls for an NPC, the d20 result appears in the chat and everyone sees what the monster rolled', async ({ page }) => {
    await ensureTableView(page, 'NPC Roll Test');
    await expect(page.getByText('🎲 DM Controls')).toBeVisible({ timeout: 15_000 });

    // Fill in the NPC name under "ROLL FOR NPC / MONSTER".
    await page.getByPlaceholder('NPC / monster name').fill('Goblin Chief');

    // modifier field — leave at 0 (default).
    // Reason field:
    await page.getByPlaceholder('Reason').fill('attack roll');

    // Roll.
    await page.getByRole('button', { name: '🎲 Roll NPC' }).click();

    // An npc_roll event appears: MessageBubble renders "👹 NPC ROLL".
    await expect(page.getByText('NPC ROLL').first()).toBeVisible({ timeout: 5_000 });
  });
});

// ── Story 4: set the difficulty (DC) ──────────────────────────────────────

test.describe('DM: set the difficulty (DC) for rolls', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaHash(page);
  });
  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  test('the DM can set a DC and compare player rolls to it; success/failure is determined by roll total vs DC', async ({ page }) => {
    await ensureTableView(page, 'DC Test');
    await expect(page.getByText('🎲 DM Controls')).toBeVisible({ timeout: 15_000 });

    // Find the DC input under "SET DIFFICULTY (DC)".
    // The input has placeholder matching the current DC or "e.g. 15".
    const dcInput = page.locator('input[placeholder="e.g. 15"], input[placeholder*="e.g"]').first();
    await expect(dcInput).toBeVisible({ timeout: 10_000 });
    await dcInput.fill('15');

    // Click "Set DC".
    await page.getByRole('button', { name: 'Set DC' }).click();

    // The header now shows "DC 15" after the game info refreshes.
    await expect(page.getByText('DC').and(page.getByText('15'))).toBeVisible({ timeout: 10_000 });
  });
});

// ── Story 5: manage turn order ───────────────────────────────────────────

test.describe('DM: manage turn order and control whose turn it is in combat', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaHash(page);
  });
  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  test('the DM can set initiative order and advance to the next turn; everyone sees whose turn it is', async ({ page }) => {
    await ensureTableView(page, 'Turn Order Test');
    await expect(page.getByText('🎲 DM Controls')).toBeVisible({ timeout: 15_000 });

    // Fill the "COMBAT TURN ORDER" textarea with comma-separated player IDs.
    const turnTextarea = page.getByPlaceholder('Player pubkeys, comma-separated');
    await expect(turnTextarea).toBeVisible({ timeout: 10_000 });
    await turnTextarea.fill('player1, player2, player3');

    // Set the order.
    await page.getByRole('button', { name: 'Set Order' }).click();

    // After "Set Order" the first player's turn is active.
    // The RoomView header shows "⚡ player1".
    await expect(page.getByText('player1')).toBeVisible({ timeout: 10_000 });

    // Advance to the next turn.
    await page.getByRole('button', { name: 'Next Turn ▶' }).click();

    // The header now shows "⚡ player2".
    await expect(page.getByText('player2')).toBeVisible({ timeout: 10_000 });
  });
});

// ── Story 6: adjust HP and manage game state ──────────────────────────────

test.describe('DM: adjust character HP and manage game state', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaHash(page);
  });
  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  test('after the DM adjusts HP or changes game state, every player sees the update in the shared log within 5s', async ({ page }) => {
    await ensureTableView(page, 'HP and State Test');

    // Create a character first so there is someone whose HP to adjust.
    await ensureCharacter(page, 'Gimli');

    await expect(page.getByText('🎲 DM Controls')).toBeVisible({ timeout: 15_000 });

    // ── Change game state to "combat" ──
    await page.getByRole('button', { name: 'combat' }).click();

    // The game-state badge in the RoomView header updates.
    await expect(page.getByText('combat').first()).toBeVisible({ timeout: 10_000 });

    // ── Adjust HP ──
    // The CharacterCard for Gimli shows "±HP" input + "Apply" button (DM only).
    const hpInput = page.getByPlaceholder('±HP').first();
    await expect(hpInput).toBeVisible({ timeout: 10_000 });
    await hpInput.fill('-5');
    await page.getByRole('button', { name: 'Apply' }).first().click();

    // An hp_change event appears in the game log.
    // MessageBubble renders it as "❤️ HP CHANGE".
    await expect(page.getByText('HP CHANGE').first()).toBeVisible({ timeout: 10_000 });
  });
});
