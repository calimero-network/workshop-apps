#!/usr/bin/env node
// Run calimero-abi-codegen for every service declared in studio.config.json.
// One ABI file per service crate, one generated client per service name.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, '..');
const ROOT_DIR = resolve(APP_DIR, '..');
const CONFIG_PATH = resolve(ROOT_DIR, 'studio.config.json');

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
if (!Array.isArray(config.services) || config.services.length === 0) {
  console.error('studio.config.json: services[] is empty or missing');
  process.exit(1);
}

const titleCase = (s) =>
  s.split(/[-_]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');

for (const svc of config.services) {
  const name = svc.name;
  const clientName = `${titleCase(name)}Client`;
  const abi = resolve(ROOT_DIR, 'logic', 'crates', name, 'res', 'abi.json');
  const out = resolve(APP_DIR, 'src', 'api', name);

  console.log(`[codegen] ${name} → ${clientName}`);
  const r = spawnSync(
    'calimero-abi-codegen',
    ['-i', abi, '-o', out, '--client-name', clientName],
    { stdio: 'inherit', shell: false },
  );
  if (r.status !== 0) {
    console.error(`[codegen] ${name} failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}
