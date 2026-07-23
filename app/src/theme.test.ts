import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getStoredTheme } from './theme';
import { THEME_DEFAULT_MODE } from './config';

// node env has no localStorage; stub a minimal Map-backed one so we can
// exercise the stored-value branches of getStoredTheme.
function stubStorage(value?: string) {
  (globalThis as any).localStorage = {
    getItem: () => (value === undefined ? null : value),
    setItem: () => {},
    removeItem: () => {},
  };
}

describe('getStoredTheme', () => {
  const original = (globalThis as any).localStorage;
  afterEach(() => { (globalThis as any).localStorage = original; });

  it('seeds the configured default mode when no choice is stored', () => {
    stubStorage(undefined);
    expect(getStoredTheme()).toBe(THEME_DEFAULT_MODE);
  });

  it('the configured default mode is a valid theme', () => {
    expect(['light', 'dark']).toContain(THEME_DEFAULT_MODE);
  });

  it('a stored light preference wins over the default', () => {
    stubStorage('light');
    expect(getStoredTheme()).toBe('light');
  });

  it('a stored dark preference wins', () => {
    stubStorage('dark');
    expect(getStoredTheme()).toBe('dark');
  });

  it('falls back to the default mode for a garbage stored value', () => {
    stubStorage('chartreuse');
    expect(getStoredTheme()).toBe(THEME_DEFAULT_MODE);
  });
});
