# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: anyone.spec.ts >> anyone at the table: see all messages, rolls, and game events in one live feed >> the chat and game log show messages, rolls, HP changes, and turn updates in chronological order, updating live
- Location: e2e/anyone.spec.ts:82:3

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
  2   |  * Playwright specs for "anyone at the table" user stories.
  3   |  *
  4   |  * Stories covered:
  5   |  *   1. anyone: chat with the group in a shared message feed
  6   |  *   2. anyone: see all messages, rolls, and game events in one live feed
  7   |  */
  8   | 
  9   | import { test, expect, type Browser, type Page } from '@playwright/test';
  10  | import { loginViaHash, clearAuth } from './helpers';
  11  | 
  12  | // ── Shared helper ─────────────────────────────────────────────────────────
  13  | 
  14  | async function ensureTableView(page: Page, campaignName: string): Promise<void> {
  15  |   const noTableBtn = page.getByRole('button', { name: '⚔️ New Game Table' });
  16  |   const isWelcome = await noTableBtn.isVisible({ timeout: 4_000 }).catch(() => false);
  17  |   if (isWelcome) {
  18  |     await noTableBtn.click();
  19  |     await page.getByPlaceholder('e.g. The Lost Mines of Phandelver').fill(campaignName);
  20  |     await page.getByRole('button', { name: 'Begin Campaign' }).click();
  21  |   }
> 22  |   await expect(page.getByRole('button', { name: '📋 My Character' })).toBeVisible({ timeout: 30_000 });
      |                                                                       ^ Error: expect(locator).toBeVisible() failed
  23  | }
  24  | 
  25  | // ── Story 1: shared chat message feed ─────────────────────────────────────
  26  | 
  27  | test.describe('anyone at the table: chat with the group in a shared message feed', () => {
  28  |   test.beforeEach(async ({ page }) => {
  29  |     await loginViaHash(page);
  30  |   });
  31  |   test.afterEach(async ({ page }) => {
  32  |     await clearAuth(page);
  33  |   });
  34  | 
  35  |   test('after a player posts a message, every other player sees it in the chat within 5s', async ({ browser }: { browser: Browser }) => {
  36  |     // Two browser contexts simulate two separate players.
  37  |     const ctxA = await browser.newContext();
  38  |     const ctxB = await browser.newContext();
  39  |     const pageA = await ctxA.newPage();
  40  |     const pageB = await ctxB.newPage();
  41  | 
  42  |     try {
  43  |       // Node-0 creates the game table.
  44  |       await loginViaHash(pageA, 0);
  45  |       await ensureTableView(pageA, 'Shared Chat Test');
  46  | 
  47  |       // Node-1 joins (requires live Calimero sync; falls back to same node for dev).
  48  |       await loginViaHash(pageB, 1);
  49  | 
  50  |       // Player A posts a message.
  51  |       const msgInput = pageA.getByPlaceholder('Speak your action… (Enter to send)');
  52  |       await expect(msgInput).toBeVisible({ timeout: 15_000 });
  53  | 
  54  |       const sharedMsg = 'I loot the chest — any traps?';
  55  |       await msgInput.fill(sharedMsg);
  56  |       await pageA.getByRole('button', { name: 'Send' }).click();
  57  | 
  58  |       // Player A sees it immediately.
  59  |       await expect(pageA.getByText(sharedMsg)).toBeVisible({ timeout: 5_000 });
  60  | 
  61  |       // Player B (same namespace, different context) sees the message via P2P sync.
  62  |       // In a single-node dev run both contexts share the same node so sync is instant.
  63  |       // [Verifier] NOTE: true cross-node propagation requires a live 2-node merod setup.
  64  |       await expect(pageB.getByText(sharedMsg)).toBeVisible({ timeout: 5_000 });
  65  |     } finally {
  66  |       await ctxA.close();
  67  |       await ctxB.close();
  68  |     }
  69  |   });
  70  | });
  71  | 
  72  | // ── Story 2: live unified game feed ───────────────────────────────────────
  73  | 
  74  | test.describe('anyone at the table: see all messages, rolls, and game events in one live feed', () => {
  75  |   test.beforeEach(async ({ page }) => {
  76  |     await loginViaHash(page);
  77  |   });
  78  |   test.afterEach(async ({ page }) => {
  79  |     await clearAuth(page);
  80  |   });
  81  | 
  82  |   test('the chat and game log show messages, rolls, HP changes, and turn updates in chronological order, updating live', async ({ page }) => {
  83  |     await ensureTableView(page, 'Live Feed Test');
  84  | 
  85  |     const msgInput = page.getByPlaceholder('Speak your action… (Enter to send)');
  86  |     await expect(msgInput).toBeVisible({ timeout: 15_000 });
  87  | 
  88  |     // Post a chat message — appears in the log as a chat bubble.
  89  |     const chatMsg = 'We head north toward the ruins.';
  90  |     await msgInput.fill(chatMsg);
  91  |     await page.getByRole('button', { name: 'Send' }).click();
  92  | 
  93  |     // The message appears in the right-side game-log panel.
  94  |     await expect(page.getByText(chatMsg)).toBeVisible({ timeout: 10_000 });
  95  | 
  96  |     // The DM (same user in this single-node test) rolls an NPC to add a roll event.
  97  |     const dmControls = page.getByText('🎲 DM Controls');
  98  |     if (await dmControls.isVisible({ timeout: 5_000 }).catch(() => false)) {
  99  |       await page.getByPlaceholder('NPC / monster name').fill('Skeleton');
  100 |       await page.getByPlaceholder('Reason').fill('initiative');
  101 |       await page.getByRole('button', { name: '🎲 Roll NPC' }).click();
  102 | 
  103 |       // An NPC roll event appears immediately below the chat message (chronological).
  104 |       await expect(page.getByText('NPC ROLL').first()).toBeVisible({ timeout: 5_000 });
  105 |     }
  106 | 
  107 |     // The log contains both the chat entry and the game event in the same panel.
  108 |     await expect(page.getByText(chatMsg)).toBeVisible({ timeout: 5_000 });
  109 |     // The adventure-begins placeholder text is gone (events have replaced it).
  110 |     await expect(page.getByText('The adventure begins!')).not.toBeVisible();
  111 |   });
  112 | });
  113 | 
```