import { describe, it, expect } from 'vitest';
import { peerArrivals, describeArrivals } from './useArrivalAnnouncer';

const SELF = 'me';

describe('peerArrivals', () => {
  it('reports an item written by someone else that has not been seen', () => {
    const fresh = peerArrivals([{ id: 'a', author: 'them' }], new Set(), SELF);
    expect(fresh).toEqual(['a']);
  });

  it('stays silent for the user\'s own writes, which notify() already covered', () => {
    const fresh = peerArrivals([{ id: 'a', author: SELF }], new Set(), SELF);
    expect(fresh).toEqual([]);
  });

  it('announces an item once, not on every subsequent sync tick', () => {
    const items = [{ id: 'a', author: 'them' }];
    expect(peerArrivals(items, new Set(), SELF)).toEqual(['a']);
    expect(peerArrivals(items, new Set(['a']), SELF)).toEqual([]);
  });

  it('reports only the delta when a list grows', () => {
    const items = [
      { id: 'a', author: 'them' },
      { id: 'b', author: 'them' },
      { id: 'c', author: SELF },
    ];
    expect(peerArrivals(items, new Set(['a']), SELF)).toEqual(['b']);
  });

  // An unauthored row cannot be attributed, and guessing "from another member"
  // would be wrong as often as right.
  it('ignores an item with no author rather than guessing', () => {
    expect(peerArrivals([{ id: 'a' }], new Set(), SELF)).toEqual([]);
  });

  it('treats every item as a peer item when the user has no identity yet', () => {
    expect(peerArrivals([{ id: 'a', author: 'them' }], new Set(), null)).toEqual(['a']);
  });
});

describe('describeArrivals', () => {
  it('is singular for one and plural beyond', () => {
    expect(describeArrivals(1, 'item')).toBe('1 new item from another member');
    expect(describeArrivals(3, 'item')).toBe('3 new items from another member');
  });

  it('uses the entity name the app was reshaped around', () => {
    expect(describeArrivals(2, 'trip')).toBe('2 new trips from another member');
  });
});
