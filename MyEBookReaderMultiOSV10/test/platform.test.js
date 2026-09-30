import { describe, it, expect, vi } from 'vitest';
import {
  isElectron, ACCEPT_BOOKS, baseName, dirName, formatBytes, readLocalState,
  writeLocalState, loadPersistedState, appInfo, copyText, openExternal, printHtml,
  fileUrlToPath, droppedFileUrls, droppedPath,
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

describe('what a drop hands over', () => {
  it('reads a Windows path out of a file URL', () => {
    expect(fileUrlToPath('file:///C:/Books/a%20book.epub')).toBe('C:\\Books\\a book.epub');
    expect(fileUrlToPath('file:///D:/%ED%95%9C%EA%B8%80.epub')).toBe('D:\\한글.epub');
  });

  it('reads a POSIX path out of a file URL', () => {
    expect(fileUrlToPath('file:///home/reader/a%20book.epub')).toBe('/home/reader/a book.epub');
    expect(fileUrlToPath('file://localhost/home/reader/b.epub')).toBe('/home/reader/b.epub');
  });

  it('reads a network share out of a file URL', () => {
    expect(fileUrlToPath('file://server/share/book.epub')).toBe('\\\\server\\share\\book.epub');
  });

  it('refuses anything that is not a file', () => {
    expect(fileUrlToPath('https://example.com/book.epub')).toBe('');
    expect(fileUrlToPath('')).toBe('');
    expect(fileUrlToPath(null)).toBe('');
    expect(fileUrlToPath('file://')).toBe('');
  });

  it('takes the file list an application offers instead of the files themselves', () => {
    const transfer = {
      getData: (type) => (type === 'text/uri-list'
        ? '# a comment\r\nfile:///C:/Books/one.epub\r\nfile:///C:/Books/two.epub\r\n'
        : ''),
    };
    expect(droppedFileUrls(transfer)).toEqual(['C:\\Books\\one.epub', 'C:\\Books\\two.epub']);
  });

  it('falls back to plain text, and drops anything that is not a file', () => {
    const transfer = {
      getData: (type) => (type === 'text/plain'
        ? 'https://example.com/x\nfile:///C:/Books/one.epub\nfile:///C:/Books/one.epub'
        : ''),
    };
    // The same file twice is one file.
    expect(droppedFileUrls(transfer)).toEqual(['C:\\Books\\one.epub']);
  });

  it('survives a data transfer that refuses to be read', () => {
    expect(droppedFileUrls(null)).toEqual([]);
    expect(droppedFileUrls({ getData: () => { throw new Error('no'); } })).toEqual([]);
  });
});
