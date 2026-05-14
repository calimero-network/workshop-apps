import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Constants (re-exported so helpers.ts / global-teardown.ts can import) ──

export const MPK_PATH = path.resolve(__dirname, '..', '..', 'logic', 'res', 'dnd-online-table-0.1.0.mpk');
export const APP_ROUTE = '/dnd-online-table';
export const NODE_COUNT = parseInt(process.env.NODE_COUNT ?? '3', 10);
export const BASE_P2P_PORT = 13428;
export const BASE_RPC_PORT = 13528;

/** Written by globalSetup; read by helpers.ts and globalTeardown. */
export const AUTH_STATE_PATH = path.resolve(__dirname, '.auth-state.json');
export const PIDS_PATH = path.resolve(__dirname, '.node-pids.json');

// ── Utilities ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollReady(url: string, maxAttempts = 30, intervalMs = 1_000): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // connection refused — node not yet ready
    }
    await sleep(intervalMs);
  }
  console.warn(`[e2e setup] Node at ${url} did not become ready within ${maxAttempts}s`);
}

// ── Global Setup ──────────────────────────────────────────────────────────

export default async function globalSetup(): Promise<void> {
  const nodes = Array.from({ length: NODE_COUNT }, (_, i) => ({
    nodeIndex: i,
    rpcPort: BASE_RPC_PORT + i,
    serverUrl: `http://localhost:${BASE_RPC_PORT + i}`,
  }));

  if (process.env.SKIP_NODE_SETUP === '1') {
    // Pre-booted nodes (CI / dev mode). Just ensure auth-state exists.
    if (!fs.existsSync(AUTH_STATE_PATH)) {
      fs.writeFileSync(AUTH_STATE_PATH, JSON.stringify(nodes, null, 2), 'utf-8');
    }
    return;
  }

  const merodBin = process.env.MEROD_BINARY ?? 'merod';
  const pids: number[] = [];

  for (const { nodeIndex, rpcPort } of nodes) {
    const dataDir = path.resolve(__dirname, `.merod-data-${nodeIndex}`);
    fs.mkdirSync(dataDir, { recursive: true });

    const proc: ChildProcess = spawn(
      merodBin,
      [
        '--node-name', `app-node-${nodeIndex + 1}`,
        '--home', dataDir,
        'run',
        '--swarm-port', String(BASE_P2P_PORT + nodeIndex),
        '--server-port', String(rpcPort),
      ],
      { detached: false, stdio: 'ignore' },
    );

    if (proc.pid !== undefined) pids.push(proc.pid);
  }

  // Persist PIDs so teardown can kill them.
  fs.writeFileSync(PIDS_PATH, JSON.stringify(pids), 'utf-8');

  // Wait for all nodes to respond.
  await Promise.all(
    nodes.map(({ serverUrl }) =>
      pollReady(`${serverUrl}/health`),
    ),
  );

  // Persist node info for helpers.ts.
  fs.writeFileSync(AUTH_STATE_PATH, JSON.stringify(nodes, null, 2), 'utf-8');
}
