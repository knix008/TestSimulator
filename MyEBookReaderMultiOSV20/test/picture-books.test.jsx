// Folders and ZIP archives of pictures (comics, scanned books) opened as one
// book: which files are pages and in what order, the book they make, how the
// folder panel lists them, and what the installer offers for them.
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/i18n.js';
import { setLanguage } from '../src/i18n.js';
import FolderTree from '../src/components/FolderTree.jsx';
import { pictureFilesOf, openPictureFolder } from '../src/lib/ebook/picturefolder.js';
import { openPictureFolderBook } from '../src/lib/ebook/book.js';
import {
  toFolderEntries, classifyEntry, isZipName, isShelfPath, sortFolderEntries,
} from '../src/lib/folders.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

// A 1×1 PNG.
const PNG = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
));

describe('the pages of a picture folder', () => {
  it('are its pictures, in reading order — 2 before 10, chapter by chapter', () => {
    const files = pictureFilesOf([
      { name: 'p10.jpg' }, { name: 'p2.jpg' }, { name: 'p1.png' },
      { name: 'notes.txt' }, { name: 'ch10/001.jpg' }, { name: 'ch2/001.jpg' },
      { name: 'scan.TGA' }, { name: 'shot.dng' }, { name: 'page.psd' },
    ]);
    expect(files.map((f) => f.name)).toEqual([
      'ch2/001.jpg', 'ch10/001.jpg', 'p1.png', 'p2.jpg', 'p10.jpg', 'page.psd', 'scan.TGA', 'shot.dng',
    ]);
  });

  it('leave out macOS resource forks and hidden files', () => {
    const files = pictureFilesOf([
      { name: '__MACOSX/a/._1.jpg' }, { name: '._2.jpg' }, { name: '.hidden/3.jpg' }, { name: '4.jpg' },
    ]);
    expect(files.map((f) => f.name)).toEqual(['4.jpg']);
  });
});

describe('a picture folder as a book', () => {
  it('has a page per picture, named after its file, with the first as the cover', () => {
    const book = openPictureFolder({ name: 'My Comic', pages: [{ name: '1.png', bytes: PNG }, { name: 'ch1/2.png', bytes: PNG }] });
    expect(book.format).toBe('pictures');
    expect(book.reflowable).toBe(false);
    expect(book.meta).toMatchObject({ title: 'My Comic', pages: 2 });
    expect(book.toc.map((e) => e.label)).toEqual(['1.png', '2.png']);
    expect(book.coverPath).toBe('1.png');
    expect(book.resource('ch1/2.png')).toMatchObject({ mime: 'image/png' });
    expect(book.resource('missing.png')).toBeNull();
    const section = book.loadSection(1, { resolveSrc: (p) => `blob:${p}` });
    expect(section).toMatchObject({ kind: 'image', src: 'blob:ch1/2.png', title: '2.png' });
    expect(() => book.loadSection(5)).toThrow(/no page 6/);
  });

  it('refuses a folder with no pictures', () => {
    expect(() => openPictureFolder({ name: 'Empty', pages: [] })).toThrow(/no pictures/);
  });

  it('is a fixed-layout book known by the folder path', () => {
    const book = openPictureFolderBook({ name: 'Vol.01', path: 'C:\\Comics\\Vol.01', pages: [{ name: '1.png', bytes: PNG }] });
    expect(book.reflowable).toBe(false);
    expect(book.formatLabel).toBe('Pictures');
    expect(book.filePath).toBe('C:\\Comics\\Vol.01');
    expect(book.fileSize).toBe(PNG.length);
    expect(book.sectionCount).toBe(1);
    book.destroy();
  });
});

describe('the folder panel', () => {
  it('lists pictures and ZIP archives besides books, numbers in names in order', () => {
    expect(classifyEntry('comic.ZIP', { kind: 'file' })).toBe('zip');
    expect(classifyEntry('001.jpg', { kind: 'file' })).toBe('image');
    expect(classifyEntry('notes.txt', { kind: 'file' })).toBeNull();
    expect(isZipName('a.zip')).toBe(true);
    expect(isZipName('a.zip.txt')).toBe(false);
    const out = toFolderEntries([
      { name: 'p10.jpg', path: '/c/p10.jpg', kind: 'file', size: 3 },
      { name: 'p2.jpg', path: '/c/p2.jpg', kind: 'file', size: 2 },
      { name: 'vol.zip', path: '/c/vol.zip', kind: 'file', size: 9 },
      { name: 'read.txt', path: '/c/read.txt', kind: 'file' },
      { name: 'ch1', path: '/c/ch1', kind: 'dir' },
    ]);
    expect(out.map((e) => [e.kind, e.name])).toEqual([
      ['dir', 'ch1'], ['image', 'p2.jpg'], ['image', 'p10.jpg'], ['zip', 'vol.zip'],
    ]);
    expect(sortFolderEntries([{ name: 'b10', kind: 'pdf' }, { name: 'b9', kind: 'pdf' }]).map((e) => e.name)).toEqual(['b9', 'b10']);
  });

  it('puts books, archives and folders on the shelf, not single pictures or text', () => {
    expect(isShelfPath('C:\\b\\x.epub')).toBe(true);
    expect(isShelfPath('C:\\b\\comic.zip')).toBe(true);
    expect(isShelfPath('C:\\b\\One Piece Vol.01')).toBe(true);
    expect(isShelfPath('C:\\b\\001.jpg')).toBe(false);
    expect(isShelfPath('C:\\b\\readme.md')).toBe(false);
    expect(isShelfPath('')).toBe(false);
  });

  it('starts a folder of pictures with a row that opens them all as a book', async () => {
    await setLanguage('en');
    const onOpenFolderBook = vi.fn();
    const onOpenFile = vi.fn();
    const loadFolder = vi.fn(async (dir) => {
      if (dir === '/c') return [{ name: 'comic', path: '/c/comic', kind: 'dir' }];
      if (dir === '/c/comic') {
        return [
          { name: '1.jpg', path: '/c/comic/1.jpg', kind: 'image', size: 1 },
          { name: '2.jpg', path: '/c/comic/2.jpg', kind: 'image', size: 1 },
        ];
      }
      return [];
    });
    const { getByText, getByTitle } = render(
      <FolderTree root="/c" desktop currentPath="" loadFolder={loadFolder} onOpenFile={onOpenFile} onOpenFolderBook={onOpenFolderBook} />,
    );
    await waitFor(() => expect(getByText('comic')).toBeTruthy());
    fireEvent.click(getByText('comic'));
    await waitFor(() => expect(getByText('2 pictures — view as a book')).toBeTruthy());
    fireEvent.click(getByText('2 pictures — view as a book'));
    expect(onOpenFolderBook).toHaveBeenCalledWith('/c/comic');
    fireEvent.click(getByTitle('/c/comic/2.jpg'));
    expect(onOpenFile).toHaveBeenCalledWith('/c/comic/2.jpg');
  });
});

describe('the desktop side of folders and archives', () => {
  const lib = read('src-tauri', 'src', 'lib.rs');
  const bridge = read('src', 'lib', 'desktop-bridge.js');
  const hooks = read('src-tauri', 'windows', 'hooks.nsh');
  const conf = JSON.parse(read('src-tauri', 'tauri.conf.json'));

  it('extracts archives and lists folders deeply through registered commands', () => {
    for (const cmd of ['fs_extract_zip', 'fs_list_files_deep']) {
      expect(bridge).toContain(`'${cmd}'`);
      expect(lib).toMatch(new RegExp(`^      ${cmd},$`, 'm'));
    }
    expect(lib).toContain('unzip::prune(');
    expect(lib).toContain('"isDir": meta.is_dir()');
  });

  it('offers Markdown, text and ZIP in "Open with", each with its own bundled icon', () => {
    for (const [ext, id] of [['.md', 'MD'], ['.markdown', 'MD'], ['.mdown', 'MD'], ['.txt', 'TXT'], ['.text', 'TXT'], ['.zip', 'ZIP']]) {
      expect(hooks).toContain(`!insertmacro MP_OfferExt "${ext}" "\${MP_${id}_PROGID}"`);
      expect(hooks).toContain(`!insertmacro MP_WithdrawExt "${ext}" "\${MP_${id}_PROGID}"`);
    }
    for (const icon of ['markdown.ico', 'text.ico', 'zip.ico']) {
      expect(hooks).toContain(`"${icon}"`);
      expect(conf.bundle.resources[`icons/${icon}`]).toBe(icon);
      expect(fs.existsSync(path.join(root, 'src-tauri', 'icons', icon))).toBe(true);
    }
    // Offered only: the installer never makes them ours by default.
    expect(hooks).not.toMatch(/WriteRegStr HKCU "Software\\Classes\\\.(md|txt|zip)" ""/);
  });
});
