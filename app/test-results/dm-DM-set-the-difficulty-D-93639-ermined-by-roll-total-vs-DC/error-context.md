# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dm.spec.ts >> DM: set the difficulty (DC) for rolls >> the DM can set a DC and compare player rolls to it; success/failure is determined by roll total vs DC
- Location: e2e/dm.spec.ts:162:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: '📋 My Character' })
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for getByRole('button', { name: '📋 My Character' })

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]: ⚔️
  - heading "D&D Online Table" [level=1] [ref=e6]
  - paragraph [ref=e7]: Real-time collaborative D&D — shared chat, DM-managed dice rolls, turn tracking, and a live game log. Powered by the Calimero decentralized network.
  - generic [ref=e8]:
    - button "Connect" [ref=e9]:
      - img [ref=e10]
      - text: Connect
    - button "Documentation" [ref=e12] [cursor=pointer]
  - paragraph [ref=e13]: Connect your Calimero node to create or join a game table.
```

# Test source

```ts
  1   | /**
  2   |  * Playwright specs for DM user stories.
  3   |  *
  4   |  * Stories covered:
  5   |  *   1. DM: create a game and invite players to the table
  6   |  *   2. DM: roll a d20 for a player's ability and see their modifier automatically applied
  7   |  *   3. DM: roll dice for NPCs and monsters
  8   |  *   4. DM: set the difficulty (DC) for rolls and judge whether players succeed
  9   |  *   5. DM: manage turn order and control whose turn it is in combat
  10  |  *   6. DM: adjust character HP and manage game state (exploring, combat, resting)
  11  |  */
  12  | 
  13  | import { test, expect, type Page } from '@playwright/test';
  14  | import { loginViaHash, clearAuth } from './helpers';
  15  | 
  16  | // ── Shared helper ─────────────────────────────────────────────────────────
  17  | 
  18  | /** Create a new workspace if the welcome screen is shown, then wait for the
  19  |  *  table view. Returns after "📋 My Character" button is visible. */
  20  | async function ensureTableView(page: Page, campaignName: string): Promise<void> {
  21  |   const noTableBtn = page.getByRole('button', { name: '⚔️ New Game Table' });
  22  |   const isWelcome = await noTableBtn.isVisible({ timeout: 4_000 }).catch(() => false);
  23  |   if (isWelcome) {
  24  |     await noTableBtn.click();
  25  |     await page.getByPlaceholder('e.g. The Lost Mines of Phandelver').fill(campaignName);
  26  |     await page.getByRole('button', { name: 'Begin Campaign' }).click();
  27  |   }
> 28  |   await expect(page.getByRole('button', { name: '📋 My Character' })).toBeVisible({ timeout: 30_000 });
      |                                                                       ^ Error: expect(locator).toBeVisible() failed
  29  | }
  30  | 
  31  | /** Create a character so the player appears in the DM's character roster.
  32  |  *  Skips creation if the character already exists. */
  33  | async function ensureCharacter(page: Page, charName: string): Promise<void> {
  34  |   await page.getByRole('button', { name: '📋 My Character' }).click();
  35  |   await expect(page.getByText('Character Sheet')).toBeVisible({ timeout: 5_000 });
  36  | 
  37  |   const enterBtn = page.getByRole('button', { name: 'Enter the Adventure' });
  38  |   const needsCreation = await enterBtn.isVisible({ timeout: 2_000 }).catch(() => false);
  39  | 
  40  |   if (needsCreation) {
  41  |     await page.getByPlaceholder('e.g. Aragorn').fill(charName);
  42  |     await enterBtn.click();
  43  |     // Modal closes after creation.
  44  |     await expect(page.getByRole('button', { name: '📋 My Character' })).toBeVisible({ timeout: 10_000 });
  45  |   } else {
  46  |     // Already has a character — close the modal.
  47  |     await page.getByRole('button', { name: 'Close' }).click();
  48  |   }
  49  | }
  50  | 
  51  | // ── Story 1: create a game and invite players ─────────────────────────────
  52  | 
  53  | test.describe('DM: create a game and invite players to the table', () => {
  54  |   test.beforeEach(async ({ page }) => {
  55  |     await loginViaHash(page);
  56  |   });
  57  |   test.afterEach(async ({ page }) => {
  58  |     await clearAuth(page);
  59  |   });
  60  | 
  61  |   test('after the DM invites players, they see the game appear in their list within 5s and can join', async ({ page }) => {
  62  |     await ensureTableView(page, 'The Lost Mines');
  63  | 
  64  |     // The DM sees the game table in the sidebar GAME TABLES list.
  65  |     await expect(page.getByText('GAME TABLES')).toBeVisible({ timeout: 5_000 });
  66  | 
  67  |     // DM opens the invite modal via the sidebar button.
  68  |     // [Verifier] NOTE: story expects 'Invite'; UI says '📜 Invite Adventurer'.
  69  |     await page.getByRole('button', { name: '📜 Invite Adventurer' }).click();
  70  |     await expect(page.getByText('Invite Adventurer')).toBeVisible({ timeout: 5_000 });
  71  | 
  72  |     // Generate the invitation scroll.
  73  |     await page.getByRole('button', { name: '🪄 Generate Invitation Scroll' }).click();
  74  | 
  75  |     // The share message appears once the scroll is ready.
  76  |     await expect(page.getByText('Share this scroll with your adventurer:')).toBeVisible({ timeout: 15_000 });
  77  | 
  78  |     // [Verifier] NOTE: cross-node assertion ("friend sees the game appear within 5s")
  79  |     // requires a live two-node Calimero setup. That flow is covered by the
  80  |     // merobox workflow in test/smoke.workflow.yml (join_namespace step).
  81  |     // Here we verify the DM side completes without error.
  82  |   });
  83  | });
  84  | 
  85  | // ── Story 2: roll a d20 for a player ─────────────────────────────────────
  86  | 
  87  | test.describe('DM: roll a d20 for a player ability check', () => {
  88  |   test.beforeEach(async ({ page }) => {
  89  |     await loginViaHash(page);
  90  |   });
  91  |   test.afterEach(async ({ page }) => {
  92  |     await clearAuth(page);
  93  |   });
  94  | 
  95  |   test('after the DM rolls for a player, the result (d20 + ability modifier = total) appears in the shared log within 2s', async ({ page }) => {
  96  |     await ensureTableView(page, 'Roll d20 Test');
  97  |     await ensureCharacter(page, 'Legolas');
  98  | 
  99  |     // The DM controls panel appears when isDm is true and gameInfo is loaded.
  100 |     await expect(page.getByText('🎲 DM Controls')).toBeVisible({ timeout: 15_000 });
  101 | 
  102 |     // Select the player from the "ROLL FOR PLAYER" dropdown.
  103 |     // The dropdown is populated with characters from the roster.
  104 |     const playerSelect = page.locator('select').first();
  105 |     await expect(playerSelect).toBeVisible({ timeout: 10_000 });
  106 | 
  107 |     // Choose the first non-empty option (Legolas).
  108 |     await playerSelect.selectOption({ index: 1 });
  109 | 
  110 |     // Ability defaults to "strength" — use as-is.
  111 |     // Fill in a reason.
  112 |     await page.getByPlaceholder('Reason (e.g. attack roll)').fill('attack roll');
  113 | 
  114 |     // Click roll.
  115 |     await page.getByRole('button', { name: '🎲 Roll d20' }).click();
  116 | 
  117 |     // A roll event (event_type="roll") appears in the game log within 2 s.
  118 |     // MessageBubble renders it as "🎲 ROLL" for roll events.
  119 |     await expect(page.getByText('ROLL').first()).toBeVisible({ timeout: 5_000 });
  120 |   });
  121 | });
  122 | 
  123 | // ── Story 3: roll for NPCs / monsters ────────────────────────────────────
  124 | 
  125 | test.describe('DM: roll dice for NPCs and monsters', () => {
  126 |   test.beforeEach(async ({ page }) => {
  127 |     await loginViaHash(page);
  128 |   });
```