import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isElectron, baseName, dirName, formatBytes,
  pathExists, readPath, writeTextTo, pickDirectory, showItemInFolder,
  readLocalState, writeLocalState, loadPersistedState, appInfo,
  copyText, downloadUrl, saveText, saveBinary,
} from '../src/lib/platform.js';

describe('runtime detection', () => {
  it('is not Electron in the jsdom test environment', () => {
    expect(isElectron).toBe(false);
  });
});

describe('baseName / dirName', () => {
  it('splits POSIX paths', () => {
    expect(baseName('/home/u/docs/a.pdf')).toBe('a.pdf');
    expect(dirName('/home/u/docs/a.pdf')).toBe('/home/u/docs');
  });

  it('splits Windows paths', () => {
    expect(baseName('C:\\Users\\me\\a.pdf')).toBe('a.pdf');
    expect(dirName('C:\\Users\\me\\a.pdf')).toBe('C:/Users/me');
  });

  it('handles a bare file name and empty input', () => {
    expect(baseName('only.pdf')).toBe('only.pdf');
    expect(dirName('only.pdf')).toBe('');
    expect(baseName('')).toBe('');
    expect(baseName(null)).toBe('');
    expect(dirName('')).toBe('');
    expect(dirName(null)).toBe('');
  });

  it('keeps Korean names', () => {
    expect(baseName('D:/자료/한글.pdf')).toBe('한글.pdf');
  });
});

describe('formatBytes', () => {
  it('formats B / KB / MB / GB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
  });

  it('returns empty for non-finite values', () => {
    expect(formatBytes(NaN)).toBe('');
    expect(formatBytes(Infinity)).toBe('');
    expect(formatBytes(undefined)).toBe('');
  });
});

describe('desktop-only operations on the web', () => {
  it('pathExists is always false', async () => {
    expect(await pathExists('C:/nope.pdf')).toBe(false);
  });

  it('readPath / writeTextTo throw', async () => {
    await expect(readPath('C:/a.pdf')).rejects.toThrow(/desktop app/);
    await expect(writeTextTo('C:/a.pdfvw', '{}')).rejects.toThrow(/desktop app/);
  });

  it('pickDirectory and showItemInFolder do nothing useful', async () => {
    expect(await pickDirectory()).toBe(null);
    expect(await showItemInFolder('C:/a.pdf')).toBe(false);
  });
});

describe('local state', () => {
  it('reads null when nothing is stored', () => {
    expect(readLocalState()).toBe(null);
  });

  it('round-trips a plain object', () => {
    writeLocalState({ theme: 'sky', n: 1 });
    expect(readLocalState()).toEqual({ theme: 'sky', n: 1 });
  });

  it('returns null for corrupt JSON', () => {
    localStorage.setItem('mypdfviewer-state', '{broken');
    expect(readLocalState()).toBe(null);
  });

  it('loadPersistedState falls back to localStorage on the web', async () => {
    writeLocalState({ theme: 'nord' });
    expect(await loadPersistedState()).toEqual({ theme: 'nord' });
  });
});

describe('appInfo', () => {
  it('reports the web runtime', async () => {
    const info = await appInfo();
    expect(info.version).toBe('1.0.0');
    expect(info.platform).toBe('web');
    expect(info).toHaveProperty('arch');
    expect(info).toHaveProperty('chrome');
  });
});

describe('clipboard / download / save (web)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('copyText uses navigator.clipboard.writeText', async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    await copyText('hello');
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('copyText throws when the clipboard API is missing', async () => {
    Object.assign(navigator, { clipboard: undefined });
    await expect(copyText('x')).rejects.toThrow(/clipboard is not available/);
  });

  it('downloadUrl concatenates streamed chunks and reports progress', async () => {
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3])];
    let i = 0;
    const reader = {
      read: async () => {
        if (i >= chunks.length) return { done: true, value: undefined };
        return { done: false, value: chunks[i++] };
      },
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: (h) => (h === 'content-length' ? '3' : null) },
      body: { getReader: () => reader },
    })));
    const ticks = [];
    const result = await downloadUrl('https://example.com/docs/file.pdf', {
      onProgress: (p) => ticks.push(p),
    });
    expect(result.name).toBe('file.pdf');
    expect(result.size).toBe(3);
    expect([...result.data]).toEqual([1, 2, 3]);
    expect(ticks[0]).toEqual({ done: 2, total: 3 });
    expect(ticks.at(-1)).toEqual({ done: 3, total: 3 });
  });

  it('downloadUrl throws on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })));
    await expect(downloadUrl('https://x/a.pdf')).rejects.toThrow(/HTTP 404/);
  });

  it('downloadUrl keeps a default name when the URL is unparseable', async () => {
    const reader = { read: async () => ({ done: true, value: undefined }) };
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: { get: () => null },
      body: { getReader: () => reader },
    })));
    const result = await downloadUrl('not a url');
    expect(result.name).toBe('download.pdf');
    expect(result.size).toBe(0);
  });

  it('saveText / saveBinary trigger a download anchor on the web', async () => {
    const clicks = [];
    const original = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = original(tag);
      if (tag === 'a') el.click = () => clicks.push(el.download);
      return el;
    });
    await saveText({ defaultName: 'doc.txt', content: 'hi' });
    await saveBinary({ defaultName: 'pic.bin', bytes: new Uint8Array([1, 2]) });
    expect(clicks).toEqual(['doc.txt', 'pic.bin']);
  });
});
