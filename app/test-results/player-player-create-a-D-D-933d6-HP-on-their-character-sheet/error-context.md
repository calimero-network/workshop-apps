# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: player.spec.ts >> player: create a D&D character with name, class, and ability scores >> after a player creates a character, they see their stats and HP on their character sheet
- Location: e2e/player.spec.ts:42:3

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
  2   |  * Playwright specs for player user stories.
  3   |  *
  4   |  * Stories covered:
  5   |  *   1. player: create a D&D character with name, class, and ability scores
  6   |  *   2. player: describe what my character is doing (attack, climb, persuade, etc.)
  7   |  */
  8   | 
  9   | import { test, expect } from '@playwright/test';
  10  | import { loginViaHash, clearAuth } from './helpers';
  11  | 
  12  | // ── Shared helper: ensure we reach the table view ─────────────────────────
  13  | 
  14  | /**
  15  |  * If the welcome "No Game Tables Yet" screen is shown, create a workspace
  16  |  * named `campaignName` so the table view (with "My Character" button) loads.
  17  |  */
  18  | async function ensureTableView(page: import('@playwright/test').Page, campaignName = 'Test Campaign') {
  19  |   const noTableBtn = page.getByRole('button', { name: '⚔️ New Game Table' });
  20  |   const isWelcome = await noTableBtn.isVisible({ timeout: 4_000 }).catch(() => false);
  21  | 
  22  |   if (isWelcome) {
  23  |     await noTableBtn.click();
  24  |     await page.getByPlaceholder('e.g. The Lost Mines of Phandelver').fill(campaignName);
  25  |     await page.getByRole('button', { name: 'Begin Campaign' }).click();
  26  |   }
  27  | 
  28  |   // Wait for the RoomView header button that confirms the table is loaded.
> 29  |   await expect(page.getByRole('button', { name: '📋 My Character' })).toBeVisible({ timeout: 30_000 });
      |                                                                       ^ Error: expect(locator).toBeVisible() failed
  30  | }
  31  | 
  32  | // ── Story 1: create a D&D character ──────────────────────────────────────
  33  | 
  34  | test.describe('player: create a D&D character with name, class, and ability scores', () => {
  35  |   test.beforeEach(async ({ page }) => {
  36  |     await loginViaHash(page);
  37  |   });
  38  |   test.afterEach(async ({ page }) => {
  39  |     await clearAuth(page);
  40  |   });
  41  | 
  42  |   test('after a player creates a character, they see their stats and HP on their character sheet', async ({ page }) => {
  43  |     await ensureTableView(page, 'Player Character Test');
  44  | 
  45  |     // Open the character sheet modal.
  46  |     await page.getByRole('button', { name: '📋 My Character' }).click();
  47  |     await expect(page.getByText('Character Sheet')).toBeVisible({ timeout: 5_000 });
  48  | 
  49  |     // If a character already exists the modal shows the view — close and skip creation.
  50  |     const enterAdventureBtn = page.getByRole('button', { name: 'Enter the Adventure' });
  51  |     const alreadyHasChar = !(await enterAdventureBtn.isVisible({ timeout: 2_000 }).catch(() => false));
  52  | 
  53  |     if (!alreadyHasChar) {
  54  |       // Fill the character creation form.
  55  |       await page.getByPlaceholder('e.g. Aragorn').fill('Thorin Oakenshield');
  56  | 
  57  |       // Class select defaults to "Fighter" — use it as-is.
  58  |       // Ability scores already have sensible defaults (10 each).
  59  | 
  60  |       await enterAdventureBtn.click();
  61  | 
  62  |       // Modal closes automatically after successful creation.
  63  |       // Re-open to view the populated character sheet.
  64  |       await expect(page.getByRole('button', { name: '📋 My Character' })).toBeVisible({ timeout: 10_000 });
  65  |       await page.getByRole('button', { name: '📋 My Character' }).click();
  66  |     }
  67  | 
  68  |     // The character sheet view shows the character name and HP section.
  69  |     await expect(page.getByText('Thorin Oakenshield').or(page.getByText('HP'))).toBeVisible({ timeout: 10_000 });
  70  |     // HP label is always present on the character view.
  71  |     await expect(page.getByText('HP').first()).toBeVisible({ timeout: 5_000 });
  72  |   });
  73  | });
  74  | 
  75  | // ── Story 2: describe an action for the DM to roll ───────────────────────
  76  | 
  77  | test.describe('player: describe what my character is doing', () => {
  78  |   test.beforeEach(async ({ page }) => {
  79  |     await loginViaHash(page);
  80  |   });
  81  |   test.afterEach(async ({ page }) => {
  82  |     await clearAuth(page);
  83  |   });
  84  | 
  85  |   test('after a player posts an action, the DM sees it in the chat and can roll the required ability check', async ({ page }) => {
  86  |     await ensureTableView(page, 'Action Post Test');
  87  | 
  88  |     // The message input is always visible in the RoomView right panel.
  89  |     const msgInput = page.getByPlaceholder('Speak your action… (Enter to send)');
  90  |     await expect(msgInput).toBeVisible({ timeout: 15_000 });
  91  | 
  92  |     // Post an action message.
  93  |     const actionText = 'I swing my axe at the goblin!';
  94  |     await msgInput.fill(actionText);
  95  |     await page.getByRole('button', { name: 'Send' }).click();
  96  | 
  97  |     // The message appears in the game log visible to everyone at the table.
  98  |     await expect(page.getByText(actionText)).toBeVisible({ timeout: 10_000 });
  99  | 
  100 |     // [Verifier] NOTE: "the DM can roll the required ability check" is an
  101 |     // affordance exercised in dm.spec.ts (story: roll a d20 for a player).
  102 |     // This test verifies the player-side: the action appears in the shared chat.
  103 |   });
  104 | });
  105 | 
```