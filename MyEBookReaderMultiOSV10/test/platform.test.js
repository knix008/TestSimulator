import { describe, it, expect, vi } from 'vitest';
import {
  isElectron, ACCEPT_BOOKS, baseName, dirName, formatBytes, readLocalState,
  writeLocalState, loadPersistedState, appInfo, copyText, openExternal, printHtml,
} from '../src/lib/platform.js';

describe('the runtime it is running in', () => {
  it('knows this is the web build under test', () => {
    expect(isElectron).toBe(false);
  });

  it('offers every book extension to the file picker', () => {
    expect(ACCEPT_BOOKS).toContain('.epub');
    expect(ACCEPT_BOOKS).toContain('.cbz');
    expect(ACCEPT_BOOKS).toContain('.ebkr');
  });

  it('reports a web runtime in the About information', async () => {
    const info = await appInfo();
    expect(info.platform).toBe('web');
    expect(info.version).toBeTruthy();
  });
});

describe('path helpers', () => {
  it('takes the file name off a path of either shape', () => {
    expect(baseName('C:\\books\\a.epub')).toBe('a.epub');
    expect(baseName('/home/me/a.epub')).toBe('a.epub');
    expect(baseName('')).toBe('');
  });

  it('takes the folder off a path, keeping its separator', () => {
    expect(dirName('C:\\books\\a.epub')).toBe('C:\\books');
    expect(dirName('/home/me/a.epub')).toBe('/home/me');
    expect(dirName('')).toBe('');
  });

  it('formats byte counts', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.00 GB');
    expect(formatBytes(NaN)).toBe('');
  });
});

describe('persisted state', () => {
  it('writes and reads the state', () => {
    writeLocalState({ theme: 'nord' });
    expect(readLocalState()).toEqual({ theme: 'nord' });
  });

  it('returns null when nothing is stored', () => {
    localStorage.clear();
    expect(readLocalState()).toBeNull();
  });

  it('survives unreadable storage', () => {
    localStorage.setItem('myebookreader-state', 'broken{');
    expect(readLocalState()).toBeNull();
  });

  it('loads from storage on the web', async () => {
    writeLocalState({ lang: 'en' });
    expect(await loadPersistedState()).toEqual({ lang: 'en' });
  });
});

describe('clipboard and links on the web', () => {
  it('uses the async clipboard API', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await copyText('copied');
    expect(writeText).toHaveBeenCalledWith('copied');
    vi.unstubAllGlobals();
  });

  it('opens a link in a new tab', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    await openExternal('https://example.com');
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    vi.unstubAllGlobals();
  });

  it('prints through a new window, and says so when it is blocked', async () => {
    vi.stubGlobal('open', vi.fn(() => null));
    await expect(printHtml({ html: '<p>x</p>', title: 't' })).rejects.toThrow(/pop-ups/i);
    vi.unstubAllGlobals();
  });
});
