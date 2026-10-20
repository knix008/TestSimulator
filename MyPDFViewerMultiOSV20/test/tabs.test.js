import { describe, it, expect } from 'vitest';
import {
  documentKey, tabLabel, findTabByFile, neighborTabId, nextTabId, anyTabDirty,
  tabScrollOverflow, tabScrollStep, tabRevealScroll,
} from '../src/lib/tabs.js';

describe('documentKey', () => {
  it('prefers an absolute path when one exists', () => {
    expect(documentKey({ path: 'C:/docs/a.pdf', name: 'a.pdf', size: 10 }))
      .toBe('path:C:/docs/a.pdf');
  });

  it('falls back to name and size for web / URL downloads', () => {
    expect(documentKey({ name: 'report.pdf', size: 2048 })).toBe('name:report.pdf::2048');
  });

  it('returns empty when there is no file', () => {
    expect(documentKey(null)).toBe('');
    expect(documentKey(undefined)).toBe('');
  });

  it('treats an empty path as a nameless download', () => {
    expect(documentKey({ path: '', name: 'a.pdf', size: 12 })).toBe('name:a.pdf::12');
  });

  it('uses 0 when size is missing', () => {
    expect(documentKey({ name: 'a.pdf' })).toBe('name:a.pdf::0');
  });
});

describe('tabLabel', () => {
  it('uses the file name', () => {
    expect(tabLabel({ name: 'notes.pdf' })).toBe('notes.pdf');
  });

  it('returns empty when the file is missing', () => {
    expect(tabLabel(null)).toBe('');
    expect(tabLabel({})).toBe('');
    expect(tabLabel(undefined)).toBe('');
  });
});

describe('findTabByFile', () => {
  const tabs = [
    { id: '1', key: 'path:/a.pdf', name: 'a.pdf' },
    { id: '2', key: 'name:b.pdf::9', name: 'b.pdf' },
  ];

  it('finds a tab by the same path', () => {
    expect(findTabByFile(tabs, { path: '/a.pdf', name: 'a.pdf' })?.id).toBe('1');
  });

  it('finds a nameless download by name and size', () => {
    expect(findTabByFile(tabs, { name: 'b.pdf', size: 9 })?.id).toBe('2');
  });

  it('returns null when nothing matches', () => {
    expect(findTabByFile(tabs, { path: '/missing.pdf' })).toBe(null);
    expect(findTabByFile(tabs, null)).toBe(null);
    expect(findTabByFile([], { path: '/a.pdf' })).toBe(null);
    expect(findTabByFile(undefined, { path: '/a.pdf' })).toBe(null);
  });

  it('does not confuse two downloads that only share a name', () => {
    expect(findTabByFile(tabs, { name: 'b.pdf', size: 99 })).toBe(null);
  });
});

describe('neighborTabId', () => {
  const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('prefers the tab to the right, then the left', () => {
    expect(neighborTabId(tabs, 'a')).toBe('b');
    expect(neighborTabId(tabs, 'b')).toBe('c');
    expect(neighborTabId(tabs, 'c')).toBe('b');
  });

  it('returns the first tab when the id is unknown', () => {
    expect(neighborTabId(tabs, 'missing')).toBe('a');
  });

  it('returns null for an empty list', () => {
    expect(neighborTabId([], 'a')).toBe(null);
    expect(neighborTabId(undefined, 'a')).toBe(null);
  });

  it('returns null when the only tab is the one being closed', () => {
    expect(neighborTabId([{ id: 'only' }], 'only')).toBe(null);
  });
});

describe('nextTabId', () => {
  const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('walks forward and wraps', () => {
    expect(nextTabId(tabs, 'a', 1)).toBe('b');
    expect(nextTabId(tabs, 'c', 1)).toBe('a');
  });

  it('walks backward and wraps', () => {
    expect(nextTabId(tabs, 'a', -1)).toBe('c');
    expect(nextTabId(tabs, 'b', -1)).toBe('a');
  });

  it('returns null when there are no tabs', () => {
    expect(nextTabId([], 'a', 1)).toBe(null);
  });

  it('stays on the only tab', () => {
    expect(nextTabId([{ id: 'only' }], 'only', 1)).toBe('only');
    expect(nextTabId([{ id: 'only' }], 'only', -1)).toBe('only');
  });

  it('starts from the first tab when the id is unknown', () => {
    expect(nextTabId(tabs, 'missing', 1)).toBe('b');
    expect(nextTabId(tabs, 'missing', -1)).toBe('c');
  });

  it('defaults to walking forward', () => {
    expect(nextTabId(tabs, 'a')).toBe('b');
  });
});

describe('anyTabDirty', () => {
  it('is true when the live document is dirty', () => {
    expect(anyTabDirty([{ id: 'a', dirty: false }], true, 'a')).toBe(true);
  });

  it('is true when a parked tab is dirty', () => {
    expect(anyTabDirty([
      { id: 'a', dirty: false },
      { id: 'b', dirty: true },
    ], false, 'a')).toBe(true);
  });

  it('is false when every tab is clean', () => {
    expect(anyTabDirty([
      { id: 'a', dirty: false },
      { id: 'b', dirty: false },
    ], false, 'a')).toBe(false);
    expect(anyTabDirty([], false, null)).toBe(false);
    expect(anyTabDirty(undefined, false, null)).toBe(false);
  });

  it('does not treat a parked clean flag as dirty when the live tab is clean', () => {
    expect(anyTabDirty([{ id: 'a', dirty: true }], false, 'a')).toBe(false);
  });
});

describe('tabScrollOverflow', () => {
  it('is hidden when the strip fits', () => {
    expect(tabScrollOverflow(null)).toEqual({ overflowing: false, left: false, right: false });
    expect(tabScrollOverflow({ scrollWidth: 200, clientWidth: 200, scrollLeft: 0 }))
      .toEqual({ overflowing: false, left: false, right: false });
  });

  it('enables left / right once the strip overflows', () => {
    expect(tabScrollOverflow({ scrollWidth: 800, clientWidth: 240, scrollLeft: 0 }))
      .toEqual({ overflowing: true, left: false, right: true });
    expect(tabScrollOverflow({ scrollWidth: 800, clientWidth: 240, scrollLeft: 200 }))
      .toEqual({ overflowing: true, left: true, right: true });
    expect(tabScrollOverflow({ scrollWidth: 800, clientWidth: 240, scrollLeft: 560 }))
      .toEqual({ overflowing: true, left: true, right: false });
  });

  it('ignores a 1px leftover so a fit strip does not grow buttons', () => {
    expect(tabScrollOverflow({ scrollWidth: 241, clientWidth: 240, scrollLeft: 0 }))
      .toEqual({ overflowing: false, left: false, right: false });
    expect(tabScrollOverflow({ scrollWidth: 800, clientWidth: 240, scrollLeft: 1 }))
      .toEqual({ overflowing: true, left: false, right: true });
  });

  it('treats missing metrics as a fit strip', () => {
    expect(tabScrollOverflow({})).toEqual({ overflowing: false, left: false, right: false });
  });
});

describe('tabScrollStep', () => {
  it('moves by most of the visible width, at least 120px', () => {
    expect(tabScrollStep({ clientWidth: 400 }, 1)).toBe(280);
    expect(tabScrollStep({ clientWidth: 400 }, -1)).toBe(-280);
    expect(tabScrollStep({ clientWidth: 80 }, 1)).toBe(120);
    expect(tabScrollStep(null, 1)).toBe(120);
  });

  it('defaults to scrolling right and treats a non-negative dir as forward', () => {
    expect(tabScrollStep({ clientWidth: 400 })).toBe(280);
    expect(tabScrollStep({ clientWidth: 400 }, 0)).toBe(280);
    expect(tabScrollStep({ clientWidth: Number.NaN }, 1)).toBe(120);
  });
});

describe('tabRevealScroll', () => {
  const scroller = (left, width) => ({ scrollLeft: left, clientWidth: width });
  const tab = (offset, width) => ({ offsetLeft: offset, offsetWidth: width });

  it('returns null when the tab is already in view', () => {
    expect(tabRevealScroll(scroller(0, 200), tab(20, 80))).toBe(null);
    expect(tabRevealScroll(null, tab(0, 80))).toBe(null);
    expect(tabRevealScroll(scroller(0, 200), null)).toBe(null);
    expect(tabRevealScroll(scroller(0, 200), tab(0, 0))).toBe(null);
  });

  it('scrolls left when the active tab sits before the viewport', () => {
    expect(tabRevealScroll(scroller(200, 240), tab(10, 80))).toBe(2);
    expect(tabRevealScroll(scroller(200, 240), tab(0, 80))).toBe(0);
  });

  it('scrolls right when the active tab sits past the viewport', () => {
    expect(tabRevealScroll(scroller(0, 200), tab(180, 80))).toBe(68);
  });
});
