/**
 * Playwright global setup for trip-splitter e2e tests.
 *
 * Nodes are bootstrapped externally by `merobox bootstrap run
 * test/spec-smoke.workflow.yml` before Playwright is invoked.
 * This file's only job is to write a fixtures.json so helpers.ts
 * can derive per-node connection info without duplicating port logic.
 *
 * Environment variables (all optional — defaults match the merobox
 * workflow's base_rpc_port: 12528):
 *   NODE_COUNT          Number of nodes (default 2, max 3)
 *   BASE_RPC_PORT       First node's RPC port (default 12528)
 *   NODE_0_RPC_URL      Override full URL for node 0
 *   NODE_1_RPC_URL      Override full URL for node 1
 *   NODE_2_RPC_URL      Override full URL for node 2
 *   NODE_0_TOKEN        Admin token for node 0 (default "dev-token")
 *   NODE_1_TOKEN        Admin token for node 1
 *   NODE_2_TOKEN        Admin token for node 2
 */

import path from 'path';
import fs from 'fs';

/** Compiled WASM bundle consumed by the merobox workflow. */
export const MPK_PATH = path.resolve(__dirname, '..', '..', 'logic', 'res', 'trip-splitter-0.1.0.mpk');

/** Fixture file shared between global-setup and helpers. */
export const FIXTURE_PATH = path.resolve(__dirname, 'fixtures.json');

/** How many merod nodes the suite needs (≤ 3). */
export const NODE_COUNT = Math.min(3, parseInt(process.env.NODE_COUNT ?? '2', 10));

const BASE_RPC_PORT = parseInt(process.env.BASE_RPC_PORT ?? '12528', 10);

export interface NodeFixture {
  rpcUrl: string;
  adminToken: string;
}

export default async function globalSetup(): Promise<void> {
  const fixtures: NodeFixture[] = Array.from({ length: NODE_COUNT }, (_, i) => ({
    rpcUrl: process.env[`NODE_${i}_RPC_URL`] ?? `http://localhost:${BASE_RPC_PORT + i}`,
    adminToken: process.env[`NODE_${i}_TOKEN`] ?? 'dev-token',
  }));
  fs.writeFileSync(FIXTURE_PATH, JSON.stringify(fixtures, null, 2));
}
