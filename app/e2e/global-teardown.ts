import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PIDS_PATH = path.resolve(__dirname, '.node-pids.json');
const AUTH_STATE_PATH = path.resolve(__dirname, '.auth-state.json');

export default async function globalTeardown(): Promise<void> {
  // Kill any merod nodes spawned by globalSetup.
  if (fs.existsSync(PIDS_PATH)) {
    let pids: number[] = [];
    try {
      pids = JSON.parse(fs.readFileSync(PIDS_PATH, 'utf-8')) as number[];
    } catch {
      // malformed — ignore
    }
    for (const pid of pids) {
      try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
    }
    fs.rmSync(PIDS_PATH, { force: true });
  }

  // Remove merod data directories left by this session.
  const e2eDir = path.resolve(__dirname);
  for (const entry of fs.readdirSync(e2eDir)) {
    if (entry.startsWith('.merod-data-')) {
      fs.rmSync(path.join(e2eDir, entry), { recursive: true, force: true });
    }
  }

  // Remove auth-state artifact.
  fs.rmSync(AUTH_STATE_PATH, { force: true });
}
