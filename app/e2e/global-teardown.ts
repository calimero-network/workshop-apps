/**
 * Playwright global teardown for team-todo e2e tests.
 *
 * Cleans up the auth-state snapshot written by global-setup.ts.
 * Merod node lifecycle (start / stop) is intentionally left to the external
 * `pnpm merod:stop` script so CI can share the nodes across test suites.
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// ESM __dirname shim — required because Playwright runs this as an ES module.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STATE_FILE = path.resolve(__dirname, '.auth', 'state.json');

export default async function globalTeardown(): Promise<void> {
  if (fs.existsSync(STATE_FILE)) {
    fs.rmSync(STATE_FILE, { force: true });
  }
}
