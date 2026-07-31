import { describe, it, expect } from 'vitest';
import raw from '../../../studio.config.json';
import { CAP_PRESETS, DEFAULT_MEMBER_CAPS } from './CapabilityPresetSelect';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const cssPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'theme.generated.css');

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

describe('generated theme cascade', () => {
  const css = readFileSync(cssPath, 'utf-8');
  it('never overrides the canonical green outside the base blocks', () => {
    const presetBlocks = css.split(/:root\[data-theme-preset/).slice(1).join('');
    expect(/--c-green\s*:/.test(presetBlocks)).toBe(false);
  });
  it('declares the layout metrics so an unknown layoutPreset still resolves', () => {
    const base = css.slice(css.indexOf(':root {'), css.indexOf('}'));
    expect(base).toContain('--c-app-max');
    expect(base).toContain('--c-app-rail');
  });
});
