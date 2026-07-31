import { describe, it, expect } from 'vitest';
import { truncateIdentity, membersToNameMap } from './MemberLabel';
import { shouldShowNameGate } from './DisplayNameGate';
import {
  displayNameByteLength,
  MAX_DISPLAY_NAME_BYTES,
} from '../hooks/useMemberDisplayName';

const NS = 'namespace-1';
const ME = '5jaQWAkC3ZrABCDEFuvwxyz1234';

describe('truncateIdentity (MemberLabel fallback)', () => {
  it('truncates a long base58 key to first8…last4', () => {
    expect(truncateIdentity(ME)).toBe('5jaQWAkC…1234');
  });
  it('renders short ids verbatim', () => {
    expect(truncateIdentity('alice')).toBe('alice');
    expect(truncateIdentity('0123456789012')).toBe('0123456789012'); // 13 chars
  });
});

describe('membersToNameMap', () => {
  it('maps only members that set a name', () => {
    const map = membersToNameMap([
      { identity: 'a', name: 'Alice' },
      { identity: 'b' },
      { identity: 'c', name: '' },
    ]);
    expect(map).toEqual({ a: 'Alice' });
  });
});

describe('displayNameByteLength (server caps at 64 BYTES)', () => {
  it('counts UTF-8 bytes, not code units', () => {
    expect(displayNameByteLength('abc')).toBe(3);
    // Each emoji is 4 UTF-8 bytes though it's 2 UTF-16 code units.
    expect(displayNameByteLength('😀')).toBe(4);
  });
  it('a short multibyte name can exceed the byte cap', () => {
    const name = '😀'.repeat(17); // 17 chars-ish, 68 bytes
    expect(name.length).toBeLessThanOrEqual(MAX_DISPLAY_NAME_BYTES);
    expect(displayNameByteLength(name)).toBeGreaterThan(MAX_DISPLAY_NAME_BYTES);
  });
});

describe('shouldShowNameGate suppression', () => {
  const base = {
    injected: false,
    namespaceId: NS,
    selfIdentity: ME,
    loading: false,
    effectiveName: null,
    dismissed: false,
    knownSet: false,
  };

  it('shows when there is no name and no injected context', () => {
    expect(shouldShowNameGate(base)).toBe(true);
  });
  it('is suppressed on the injected/SSO context (e2e + desktop)', () => {
    expect(shouldShowNameGate({ ...base, injected: true })).toBe(false);
  });
  it('is suppressed once a name is known', () => {
    expect(shouldShowNameGate({ ...base, effectiveName: 'Alice' })).toBe(false);
    expect(shouldShowNameGate({ ...base, knownSet: true })).toBe(false);
    expect(shouldShowNameGate({ ...base, dismissed: true })).toBe(false);
  });
  it('is suppressed while loading or before identity resolves', () => {
    expect(shouldShowNameGate({ ...base, loading: true })).toBe(false);
    expect(shouldShowNameGate({ ...base, selfIdentity: null })).toBe(false);
    expect(shouldShowNameGate({ ...base, namespaceId: null })).toBe(false);
  });
});
