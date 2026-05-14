import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import type { Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── App-level constants ────────────────────────────────────────────────────

/** Primary route this app serves after authentication. */
export const APP_ROUTE = '/dnd-online-table';

/** Path written by globalSetup with per-node connection info. */
const AUTH_STATE_PATH = path.resolve(__dirname, '.auth-state.json');

// ── Types ─────────────────────────────────────────────────────────────────

interface NodeInfo {
  nodeIndex: number;
  rpcPort: number;
  serverUrl: string;
}

// ── Internal helpers ───────────────────────────────────────────────────────

function readNodes(): NodeInfo[] {
  if (!fs.existsSync(AUTH_STATE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(AUTH_STATE_PATH, 'utf-8')) as NodeInfo[];
  } catch {
    return [];
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Inject Calimero auth into localStorage and navigate to the app's main
 * route so the test starts as an authenticated user.
 *
 * @param page       Playwright page.
 * @param nodeIndex  0-based index of which merod node to connect to (default 0).
 */
export async function loginViaHash(page: Page, nodeIndex = 0): Promise<void> {
  const nodes = readNodes();
  const node: NodeInfo = nodes[nodeIndex] ?? {
    nodeIndex,
    rpcPort: 13528 + nodeIndex,
    serverUrl: `http://localhost:${13528 + nodeIndex}`,
  };

  // Navigate to root so we can write localStorage before React mounts.
  await page.goto('http://localhost:5173/');

  // Inject the Calimero node URL that mero-react uses to establish its connection.
  await page.evaluate((serverUrl: string) => {
    localStorage.setItem('calimero:nodeUrl', serverUrl);
    localStorage.setItem('calimero:authenticated', 'true');
  }, node.serverUrl);

  // Navigate to the app route and confirm we landed there.
  await page.goto(`http://localhost:5173${APP_ROUTE}`);
  await page.waitForURL(`**${APP_ROUTE}**`, { timeout: 15_000 });
}

/**
 * Clear all Calimero auth from localStorage (call in afterEach to isolate tests).
 */
export async function clearAuth(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
  });
}
