# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: anyone.spec.ts >> anyone at the table: chat with the group in a shared message feed >> after a player posts a message, every other player sees it in the chat within 5s
- Location: e2e/anyone.spec.ts:35:3

# Error details

```
Error: page.evaluate: Execution context was destroyed, most likely because of a navigation
```

# Test source

```ts
  1  | import { fileURLToPath } from 'url';
  2  | import path from 'path';
  3  | import fs from 'fs';
  4  | import type { Page } from '@playwright/test';
  5  | 
  6  | const __dirname = path.dirname(fileURLToPath(import.meta.url));
  7  | 
  8  | // ── App-level constants ────────────────────────────────────────────────────
  9  | 
  10 | /** Primary route this app serves after authentication. */
  11 | export const APP_ROUTE = '/dnd-online-table';
  12 | 
  13 | /** Path written by globalSetup with per-node connection info. */
  14 | const AUTH_STATE_PATH = path.resolve(__dirname, '.auth-state.json');
  15 | 
  16 | // ── Types ─────────────────────────────────────────────────────────────────
  17 | 
  18 | interface NodeInfo {
  19 |   nodeIndex: number;
  20 |   rpcPort: number;
  21 |   serverUrl: string;
  22 | }
  23 | 
  24 | // ── Internal helpers ───────────────────────────────────────────────────────
  25 | 
  26 | function readNodes(): NodeInfo[] {
  27 |   if (!fs.existsSync(AUTH_STATE_PATH)) return [];
  28 |   try {
  29 |     return JSON.parse(fs.readFileSync(AUTH_STATE_PATH, 'utf-8')) as NodeInfo[];
  30 |   } catch {
  31 |     return [];
  32 |   }
  33 | }
  34 | 
  35 | // ── Public API ────────────────────────────────────────────────────────────
  36 | 
  37 | /**
  38 |  * Inject Calimero auth into localStorage and navigate to the app's main
  39 |  * route so the test starts as an authenticated user.
  40 |  *
  41 |  * @param page       Playwright page.
  42 |  * @param nodeIndex  0-based index of which merod node to connect to (default 0).
  43 |  */
  44 | export async function loginViaHash(page: Page, nodeIndex = 0): Promise<void> {
  45 |   const nodes = readNodes();
  46 |   const node: NodeInfo = nodes[nodeIndex] ?? {
  47 |     nodeIndex,
  48 |     rpcPort: 13528 + nodeIndex,
  49 |     serverUrl: `http://localhost:${13528 + nodeIndex}`,
  50 |   };
  51 | 
  52 |   // Navigate to root so we can write localStorage before React mounts.
  53 |   await page.goto('http://localhost:5173/');
  54 | 
  55 |   // Inject the Calimero node URL that mero-react uses to establish its connection.
> 56 |   await page.evaluate((serverUrl: string) => {
     |              ^ Error: page.evaluate: Execution context was destroyed, most likely because of a navigation
  57 |     localStorage.setItem('calimero:nodeUrl', serverUrl);
  58 |     localStorage.setItem('calimero:authenticated', 'true');
  59 |   }, node.serverUrl);
  60 | 
  61 |   // Navigate to the app route and confirm we landed there.
  62 |   await page.goto(`http://localhost:5173${APP_ROUTE}`);
  63 |   await page.waitForURL(`**${APP_ROUTE}**`, { timeout: 15_000 });
  64 | }
  65 | 
  66 | /**
  67 |  * Clear all Calimero auth from localStorage (call in afterEach to isolate tests).
  68 |  */
  69 | export async function clearAuth(page: Page): Promise<void> {
  70 |   await page.evaluate(() => {
  71 |     localStorage.clear();
  72 |   });
  73 | }
  74 | 
```