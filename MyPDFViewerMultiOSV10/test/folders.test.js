import { describe, it, expect } from 'vitest';
import {
  classifyEntry, folderLabel, isHiddenName, isPdfName, sortFolderEntries, toFolderEntries,
} from '../src/lib/folders.js';
import { readLevel } from '../electron/folder-list.js';

describe('isPdfName / isHiddenName', () => {
  it('accepts only a last extension of exactly pdf', () => {
    expect(isPdfName('report.pdf')).toBe(true);
    expect(isPdfName('notes.PDF')).toBe(true);
    expect(isPdfName('notes.PDFVW')).toBe(false);
    expect(isPdfName('notes.pdfvw')).toBe(false);
    expect(isPdfName('archive.pdf.bak')).toBe(false);
    expect(isPdfName('mypdf.txt')).toBe(false);
    expect(isPdfName('guide.pdfx')).toBe(false);
    expect(isPdfName('shot.png')).toBe(false);
    expect(isPdfName('')).toBe(false);
  });

  it('treats dotfiles as hidden', () => {
    expect(isHiddenName('.git')).toBe(true);
    expect(isHiddenName('docs')).toBe(false);
  });
});

describe('folderLabel', () => {
  it('returns the last path segment on Windows and POSIX paths', () => {
    expect(folderLabel('C:/Docs/Reports')).toBe('Reports');
    expect(folderLabel('C:\\Docs\\Reports\\')).toBe('Reports');
    expect(folderLabel('/home/me/pdfs')).toBe('pdfs');
    expect(folderLabel('')).toBe('');
  });
});

describe('classifyEntry', () => {
  it('treats a .pdf name as a file even when flagged as a directory', () => {
    expect(classifyEntry('notes.pdf', { kind: 'dir', isDirectory: true })).toBe('pdf');
    expect(classifyEntry('pack.PDFVW', { isDirectory: true })).toBe('dir');
    expect(classifyEntry('invoices', { kind: 'dir' })).toBe('dir');
    expect(classifyEntry('.hidden.pdf', { kind: 'pdf' })).toBe(null);
  });
});

describe('toFolderEntries', () => {
  it('keeps folders and PDFs, drops hidden and other files, folders first', () => {
    const out = toFolderEntries([
      { name: 'z.pdf', path: '/z.pdf', kind: 'pdf', size: 3 },
      { name: 'readme.txt', path: '/readme.txt' },
      { name: '.cache', path: '/.cache', isDirectory: true },
      { name: 'alpha', path: '/alpha', kind: 'dir' },
      { name: 'b.PDF', path: '/b.PDF', size: 9 },
    ]);
    expect(out.map((e) => e.name)).toEqual(['alpha', 'b.PDF', 'z.pdf']);
    expect(out[0].kind).toBe('dir');
    expect(out[1].kind).toBe('pdf');
    expect(out[2].size).toBe(3);
  });

  it('returns an empty list for missing input', () => {
    expect(toFolderEntries(null)).toEqual([]);
    expect(sortFolderEntries(undefined)).toEqual([]);
  });

  it('keeps PDFs that sit inside a folder listing', () => {
    const out = toFolderEntries([
      { name: 'invoices', path: '/docs/invoices', kind: 'dir' },
      { name: 'jan.pdf', path: '/docs/invoices/jan.pdf', isDirectory: true },
      { name: 'feb.PDF', path: '/docs/invoices/feb.PDF' },
    ]);
    expect(out.filter((e) => e.kind === 'pdf').map((e) => e.name)).toEqual(['feb.PDF', 'jan.pdf']);
  });

  it('drops workspace files and names that only contain pdf', () => {
    const out = toFolderEntries([
      { name: 'notes.pdfvw', path: '/notes.pdfvw', kind: 'pdf' },
      { name: 'mypdf.txt', path: '/mypdf.txt' },
      { name: 'real.pdf', path: '/real.pdf' },
    ]);
    expect(out.map((e) => e.name)).toEqual(['real.pdf']);
  });
});

describe('readLevel', () => {
  it('lists folders and the PDF files inside them via stat', () => {
    const pathMod = { resolve: (p) => p, join: (...parts) => parts.join('/') };
    const root = '/docs';
    const invoices = '/docs/invoices';
    const pdf = '/docs/invoices/jan.pdf';
    const txt = '/docs/invoices/readme.txt';
    const dirs = new Set([root, invoices]);
    const files = new Map([[pdf, 80], [txt, 12]]);
    const listing = { [root]: ['invoices'], [invoices]: ['jan.pdf', 'readme.txt', '.cache'] };
    const fs = {
      existsSync: (p) => dirs.has(p) || files.has(p),
      statSync: (p) => ({
        isDirectory: () => dirs.has(p),
        isFile: () => files.has(p),
        size: files.get(p) || 0,
      }),
      readdirSync: (p) => listing[p] || [],
    };
    expect(readLevel(fs, pathMod, root).map((e) => e.name)).toEqual(['invoices']);
    expect(readLevel(fs, pathMod, invoices).map((e) => ({ name: e.name, kind: e.kind }))).toEqual([
      { name: 'jan.pdf', kind: 'pdf' },
    ]);
  });
});
