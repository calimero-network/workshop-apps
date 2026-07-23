import { describe, it, expect } from 'vitest';
import raw from '../../../studio.config.json';
import { CAP_PRESETS, DEFAULT_MEMBER_CAPS } from './CapabilityPresetSelect';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const cssPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.css');

describe('studio.config version plumbing', () => {
  it('carries a non-empty appVersion the settings page can display', () => {
    expect(typeof (raw as { appVersion?: unknown }).appVersion).toBe('string');
    expect((raw as { appVersion: string }).appVersion.length).toBeGreaterThan(0);
  });
});

describe('capability presets', () => {
  it('Contributor equals the single/multi default (create context + invite)', () => {
    const contributor = CAP_PRESETS.find((p) => p.label === 'Contributor');
    expect(contributor?.mask).toBe(DEFAULT_MEMBER_CAPS);
  });
  it('Manager is a superset of Contributor', () => {
    const c = CAP_PRESETS.find((p) => p.label === 'Contributor')!.mask;
    const m = CAP_PRESETS.find((p) => p.label === 'Manager')!.mask;
    expect((m & c) === c).toBe(true);
    expect(m).toBeGreaterThan(c);
  });
});

describe('decoration tokens', () => {
  const css = readFileSync(cssPath, 'utf-8');
  it('declares a decoration radius for each named style', () => {
    for (const s of ['minimal', 'playful', 'editorial', 'technical']) {
      expect(css).toContain(`data-style='${s}'`);
    }
  });
  it('never overrides the canonical green in a data-style block', () => {
    const styleBlocks = css.split(/:root\[data-style/).slice(1).join('');
    expect(/--c-green\s*:/.test(styleBlocks)).toBe(false);
  });
});
