import { describe, it, expect, beforeEach } from 'vitest';
import { applyThemeAttributes } from './config';

// node env has no DOM (see vitest.config.ts); stub only the documentElement
// methods applyThemeAttributes and these tests use.
const attrs = new Map<string, string>();
(globalThis as any).document = {
  documentElement: {
    setAttribute: (name: string, value: string) => attrs.set(name, value),
    getAttribute: (name: string) => (attrs.has(name) ? attrs.get(name)! : null),
    removeAttribute: (name: string) => attrs.delete(name),
    hasAttribute: (name: string) => attrs.has(name),
  },
};

describe('applyThemeAttributes', () => {
  beforeEach(() => {
    for (const a of ['density', 'radius', 'motion', 'display']) {
      document.documentElement.removeAttribute(`data-${a}`);
    }
  });

  it('sets only the axes that are present', () => {
    applyThemeAttributes({ density: 'roomy' });
    expect(document.documentElement.getAttribute('data-density')).toBe('roomy');
    expect(document.documentElement.hasAttribute('data-radius')).toBe(false);
  });

  it('never writes the string "undefined"', () => {
    applyThemeAttributes({});
    for (const a of ['density', 'radius', 'motion', 'display']) {
      expect(document.documentElement.getAttribute(`data-${a}`)).not.toBe('undefined');
    }
  });

  it('sets every axis when all are present', () => {
    applyThemeAttributes({ density: 'compact', radius: 'sharp', motion: 'crisp', display: 'editorial' });
    expect(document.documentElement.getAttribute('data-motion')).toBe('crisp');
    expect(document.documentElement.getAttribute('data-display')).toBe('editorial');
  });
});
