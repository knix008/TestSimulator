import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isBookFileName, isHiddenName, folderLabel, sortFolderEntries, classifyEntry, toFolderEntries,
} from '../src/lib/folders.js';
import folderList from '../electron/folder-list.js';
import { SAMPLES_DIR } from './helpers/samples.mjs';
import { makeZip } from './helpers/zip.mjs';

const { readLevel, OPENABLE_EXTENSIONS, isBookName, extensionOf } = folderList;

describe('library file names', () => {
  it('accepts every format the reader opens', () => {
    for (const name of ['a.epub', 'a.pdf', 'a.djvu', 'a.djv', 'a.mobi', 'a.azw3', 'a.fb2', 'a.cbz', 'a.md', 'a.html', 'a.txt', 'a.ebkr']) {
      expect(isBookFileName(name), name).toBe(true);
    }
  });

  it('accepts the picture formats the reader shows', () => {
    for (const name of ['a.jpg', 'a.png', 'a.gif', 'a.webp', 'a.tif', 'a.tiff', 'a.dcm']) {
      expect(isBookFileName(name), name).toBe(true);
    }
  });

  it('rejects everything else', () => {
    for (const name of ['a.docx', 'a.zip', 'a.mp3', 'noextension', '']) {
      expect(isBookFileName(name), name).toBe(false);
    }
  });

  it('lists a compressed file as an archive, not as a book', () => {
    expect(classifyEntry('pack.zip')).toBe('archive');
    expect(classifyEntry('notes.tar.gz')).toBe('archive');
    expect(classifyEntry('a.epub')).toBe('book');
  });

  it('spots a hidden name', () => {
    expect(isHiddenName('.git')).toBe(true);
    expect(isHiddenName('book.epub')).toBe(false);
  });

  it('labels a folder by its last component', () => {
    expect(folderLabel('C:\\books\\sci-fi\\')).toBe('sci-fi');
    expect(folderLabel('/home/me/books')).toBe('books');
    expect(folderLabel('')).toBe('');
  });
});

describe('classifyEntry / toFolderEntries', () => {
  it('classifies folders and books', () => {
    expect(classifyEntry('sub', { kind: 'dir' })).toBe('dir');
    expect(classifyEntry('a.epub', {})).toBe('book');
    expect(classifyEntry('a.docx', {})).toBeNull();
    expect(classifyEntry('.hidden', { kind: 'dir' })).toBeNull();
  });

  it('keeps folders first, then names in order', () => {
    const rows = toFolderEntries([
      { name: 'b.epub', path: '/b.epub' },
      { name: 'Alpha', path: '/Alpha', kind: 'dir' },
      { name: 'a.pdf', path: '/a.pdf' },
      { name: 'note.docx', path: '/note.docx' },
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Alpha', 'a.pdf', 'b.epub']);
    expect(rows[1].format).toBe('pdf');
  });

  it('sorts with folders before files', () => {
    const sorted = sortFolderEntries([{ name: 'z', kind: 'book' }, { name: 'a', kind: 'dir' }]);
    expect(sorted[0].kind).toBe('dir');
  });

  it('copes with nothing', () => {
    expect(toFolderEntries(null)).toEqual([]);
  });
});

describe('electron/folder-list (the main process listing)', () => {
  it('agrees with the renderer about which files are books', () => {
    for (const ext of OPENABLE_EXTENSIONS) {
      expect(isBookFileName(`a.${ext}`), ext).toBe(true);
    }
  });

  it('extracts an extension the same way', () => {
    expect(extensionOf('A.EPUB')).toBe('epub');
    expect(extensionOf('noext')).toBe('');
    expect(isBookName('x.cbz')).toBe(true);
  });

  it('lists the sample folder', () => {
    const rows = readLevel(fs, path, SAMPLES_DIR);
    const names = rows.map((r) => r.name);
    expect(names).toContain('sample.epub');
    expect(names).toContain('sample.cbz');
    expect(rows.every((r) => r.kind === 'book' || r.kind === 'dir' || r.kind === 'archive')).toBe(true);
    expect(rows.find((r) => r.name === 'sample.epub').size).toBeGreaterThan(0);
  });

  it('shows a zip beside the books, so it can be opened in place', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ebk-archive-'));
    try {
      fs.writeFileSync(path.join(dir, 'pack.zip'), makeZip([{ name: 'a.txt', data: 'hello' }]));
      fs.writeFileSync(path.join(dir, 'note.txt'), 'hi');
      const rows = readLevel(fs, path, dir);
      expect(rows.map((r) => r.name)).toEqual(['pack.zip', 'note.txt']);
      expect(rows[0].kind).toBe('archive');
      expect(rows[1].kind).toBe('book');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns nothing for a path that is not a folder', () => {
    expect(readLevel(fs, path, path.join(SAMPLES_DIR, 'sample.epub'))).toEqual([]);
    expect(readLevel(fs, path, path.join(SAMPLES_DIR, 'does-not-exist'))).toEqual([]);
    expect(readLevel(fs, path, '')).toEqual([]);
    expect(readLevel(fs, path, null)).toEqual([]);
  });
});
