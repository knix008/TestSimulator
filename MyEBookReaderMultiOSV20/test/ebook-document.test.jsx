// The e-book side of the reader: every format is recognised, opened, and
// handed to the viewer as a document with pdf.js's shape. jsdom does no
// layout, so the reflowable pages themselves are checked in the real app
// (see README, "Checking a change"); what is checked here is everything that
// does not need a browser to measure text.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '../src/i18n.js';
import { setLanguage } from '../src/i18n.js';
import Toolbar from '../src/components/Toolbar.jsx';
import { DEFAULT_SETTINGS, normalize } from '../src/lib/settings.js';
import {
  detectFormat, openBook, isBookName, BOOK_EXTENSIONS, EBOOK_EXTENSIONS,
} from '../src/lib/ebook/book.js';
import { openEbookDocument, imageSizeOf, pageAfterRelayout } from '../src/lib/ebook/document.js';
import { EbookViewport } from '../src/lib/ebook/viewport.js';
import {
  clampFontSize, stepFontSize, DEFAULT_FONT_SIZE, MIN_FONT_SIZE, MAX_FONT_SIZE,
} from '../src/lib/ebook/layout.js';
import { setDjvuWasmBytes } from '../src/lib/ebook/djvu.js';
import { isBookFileName, bookTitleOf, toFolderEntries } from '../src/lib/folders.js';
import { getPageImageRegions } from '../src/lib/pdf.js';
import { sampleBytes } from './helpers/samples.mjs';

const require = createRequire(import.meta.url);

// The same probe djvu-rs uses to pick its simd128 or scalar build.
const SIMD_PROBE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00, 0x0a, 0x16, 0x01, 0x14, 0x00, 0xfd, 0x0c,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0b,
]);

beforeAll(() => {
  const root = path.dirname(require.resolve('djvu-rs'));
  const variant = WebAssembly.validate(SIMD_PROBE) ? 'simd128' : 'scalar';
  setDjvuWasmBytes(readFileSync(path.join(root, variant, 'djvu_rs_bg.wasm')));
});

describe('format detection', () => {
  it.each([
    ['sample.epub', 'epub'],
    ['sample.mobi', 'mobi'],
    ['sample.azw3', 'mobi'],
    ['sample-dual.azw3', 'mobi'],
    ['sample-huff.mobi', 'mobi'],
    ['sample.fb2', 'fb2'],
    ['sample.cbz', 'cbz'],
    ['sample.djvu', 'djvu'],
    ['sample.txt', 'txt'],
    ['sample.md', 'md'],
    ['sample.html', 'html'],
    ['sample.png', 'image'],
    ['sample.tif', 'image'],
    ['sample.pdf', 'pdf'],
  ])('%s is read as %s', (name, format) => {
    expect(detectFormat(sampleBytes(name), name)).toBe(format);
  });

  it('trusts the bytes over a wrong extension', () => {
    expect(detectFormat(sampleBytes('sample.epub'), 'renamed.txt')).toBe('epub');
    expect(detectFormat(sampleBytes('sample.azw3'), 'book.epub')).toBe('mobi');
    expect(detectFormat(sampleBytes('sample.djvu'), 'scan.pdf')).toBe('djvu');
  });

  it('lists the Kindle family, DjVu and FB2 among the book extensions', () => {
    for (const ext of ['epub', 'mobi', 'azw', 'azw3', 'kf8', 'prc', 'djvu', 'djv', 'fb2', 'cbz', 'txt', 'md', 'html']) {
      expect(EBOOK_EXTENSIONS).toContain(ext);
    }
    expect(BOOK_EXTENSIONS[0]).toBe('pdf');
    expect(isBookName('Novel.AZW3')).toBe(true);
    expect(isBookName('notes.ebkvw')).toBe(false);
  });

  it('refuses a KFX book with a message that says what to do instead', async () => {
    const data = new TextEncoder().encode('CONT\u0002\u0000\u0000\u0000rest of a kfx container');
    await expect(openBook({ data, name: 'book.kfx' })).rejects.toThrow(/KFX.*AZW3 or MOBI/s);
  });

  it('refuses a binary file rather than showing it as text', async () => {
    const data = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00]);
    await expect(openBook({ data, name: 'setup.exe' })).rejects.toThrow(/not a book/);
  });

  it('opens a .fb2.zip as the FictionBook inside it', async () => {
    const { makeZip } = await import('./helpers/zip.mjs');
    const zipped = makeZip([{ name: 'story.fb2', data: Buffer.from(sampleBytes('sample.fb2')) }]);
    const book = await openBook({ data: new Uint8Array(zipped), name: 'story.fb2.zip' });
    expect(book.format).toBe('fb2');
    expect(book.sectionCount).toBeGreaterThan(0);
    book.destroy();
  });
});

describe('opening every reflowable format as a book', () => {
  it.each([
    ['sample.epub'], ['sample.mobi'], ['sample.azw3'], ['sample-huff.mobi'],
    ['sample.fb2'], ['sample.txt'], ['sample.md'], ['sample.html'],
  ])('%s has chapters with text', async (name) => {
    const book = await openBook({ data: sampleBytes(name), name });
    expect(book.reflowable).toBe(true);
    expect(book.sectionCount).toBeGreaterThan(0);
    const all = Array.from({ length: book.sectionCount }, (_, i) => book.sectionText(i)).join(' ');
    expect(all.trim().length).toBeGreaterThan(20);
    const first = book.loadSection(0);
    expect(typeof first.html).toBe('string');
    book.destroy();
  });
});

describe('fixed-layout books as documents', () => {
  it('turns every comic page into one page at the picture\'s proportions', async () => {
    const progress = vi.fn();
    const doc = await openEbookDocument({ data: sampleBytes('sample.cbz'), name: 'sample.cbz', onProgress: progress });
    expect(doc.isEbook).toBe(true);
    expect(doc.reflowable).toBe(false);
    expect(doc.fontSize).toBe(null);
    expect(doc.numPages).toBeGreaterThan(1);
    expect(progress).toHaveBeenCalled();
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    expect(vp.width).toBeGreaterThan(50);
    expect(vp.height).toBeGreaterThan(50);
    expect(page.rotate).toBe(0);
    expect(page.view).toEqual([0, 0, vp.width, vp.height]);
    expect((await page.getTextContent()).items).toEqual([]);
    expect(await page.getAnnotations()).toEqual([]);
    await expect(doc.getPage(doc.numPages + 1)).rejects.toThrow(/Invalid page/);
    await doc.destroy();
  });

  it('opens a DjVu with a page per scan and its OCR words as text', async () => {
    const doc = await openEbookDocument({ data: sampleBytes('sample.djvu'), name: 'sample.djvu' });
    expect(doc.format).toBe('djvu');
    expect(doc.formatLabel).toBe('DjVu');
    expect(doc.reflowable).toBe(false);
    expect(doc.numPages).toBeGreaterThan(0);
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    expect(vp.width).toBeGreaterThan(10);
    const content = await page.getTextContent();
    expect(Array.isArray(content.items)).toBe(true);
    for (const item of content.items) {
      expect(item.transform).toHaveLength(6);
      expect(typeof item.str).toBe('string');
    }
    await doc.destroy();
  });

  it('reports a whole-page picture to the image tool', async () => {
    const doc = await openEbookDocument({ data: sampleBytes('sample.png'), name: 'sample.png' });
    expect(doc.numPages).toBe(1);
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 2 });
    const regions = await getPageImageRegions(page, vp, { minSize: 4 });
    expect(regions).toHaveLength(1);
    expect(regions[0].rect.width).toBeCloseTo(vp.width, 0);
    expect(regions[0].frac).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    await doc.destroy();
  });

  it('describes itself through getMetadata like a PDF does', async () => {
    const doc = await openEbookDocument({ data: sampleBytes('sample.cbz'), name: 'Comic.cbz' });
    const { info } = await doc.getMetadata();
    expect(info.Title).toBe('Comic');
    expect(info.EbookFormat).toBe('Comic book');
    expect(info.Producer).toBe('');
    await doc.destroy();
  });
});

describe('reading position across a new layout', () => {
  const fakeDoc = (perSection) => {
    const sectionStart = [];
    let n = 0;
    for (const count of perSection) { sectionStart.push(n); n += count; }
    const sectionOf = (i) => {
      let s = 0;
      while (s + 1 < sectionStart.length && sectionStart[s + 1] <= i) s += 1;
      return s;
    };
    return {
      locate(page) {
        const s = sectionOf(page - 1);
        return { section: s, frac: (page - 1 - sectionStart[s]) / perSection[s] };
      },
      pageForLocation({ section, frac }) {
        return sectionStart[section] + Math.floor(frac * perSection[section]) + 1;
      },
    };
  };

  it('keeps the chapter and how far into it, not the page number', () => {
    const small = fakeDoc([2, 10, 4]);     // chapter 2 is pages 3–12
    const large = fakeDoc([4, 20, 8]);     // chapter 2 is pages 5–24
    expect(pageAfterRelayout(small, large, 8)).toBe(15);   // halfway through chapter 2
    expect(pageAfterRelayout(small, large, 1)).toBe(1);
    expect(pageAfterRelayout(small, large, 13)).toBe(25);  // start of chapter 3
  });

  it('leaves the page alone when a document cannot say where it is', () => {
    expect(pageAfterRelayout({}, {}, 7)).toBe(7);
  });
});

describe('page viewport', () => {
  it('maps page space like pdf.js: origin bottom-left, y up', () => {
    const vp = new EbookViewport({ viewBox: [0, 0, 600, 800], scale: 2 });
    expect(vp.width).toBe(1200);
    expect(vp.height).toBe(1600);
    expect(vp.convertToViewportPoint(0, 800)).toEqual([0, 0]);
    expect(vp.convertToViewportPoint(600, 0)).toEqual([1200, 1600]);
    expect(vp.convertToPdfPoint(1200, 0)).toEqual([600, 800]);
    expect(vp.rawDims).toEqual({ pageWidth: 600, pageHeight: 800, pageX: 0, pageY: 0 });
  });

  it('swaps width and height when turned a quarter', () => {
    const vp = new EbookViewport({ viewBox: [0, 0, 600, 800], scale: 1, rotation: 90 });
    expect(vp.width).toBe(800);
    expect(vp.height).toBe(600);
    expect(vp.clone({ rotation: 0 }).width).toBe(600);
  });
});

describe('picture sizes from file headers', () => {
  it('reads a PNG\'s size without decoding it', () => {
    const size = imageSizeOf(sampleBytes('sample.png'));
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });

  it('gives up on bytes that are not a picture', () => {
    expect(imageSizeOf(new TextEncoder().encode('just some words, not a picture'))).toBe(null);
    expect(imageSizeOf(null)).toBe(null);
  });
});

describe('book font size', () => {
  it('clamps and steps the size by 2 px between the limits', () => {
    expect(DEFAULT_FONT_SIZE).toBe(18);
    expect(clampFontSize('x')).toBe(DEFAULT_FONT_SIZE);
    expect(clampFontSize(2)).toBe(MIN_FONT_SIZE);
    expect(clampFontSize(400)).toBe(MAX_FONT_SIZE);
    expect(stepFontSize(18, 1)).toBe(20);
    expect(stepFontSize(18, -1)).toBe(16);
    expect(stepFontSize(MAX_FONT_SIZE, 1)).toBe(MAX_FONT_SIZE);
    expect(stepFontSize(MIN_FONT_SIZE, -1)).toBe(MIN_FONT_SIZE);
  });

  it('is kept in the settings, separately from the UI font size', () => {
    expect(DEFAULT_SETTINGS.bookFontSize).toBe(18);
    expect(normalize({ bookFontSize: 99 }).bookFontSize).toBe(MAX_FONT_SIZE);
    expect(normalize({ bookFontSize: 22, fontSize: 13 }).bookFontSize).toBe(22);
  });

  const renderToolbar = (props) => {
    const noop = () => {};
    return render(
      <Toolbar
        settings={{ ...DEFAULT_SETTINGS, theme: 'dark' }}
        doc={{ numPages: 2 }}
        pageNumber={1}
        numPages={2}
        scale={1}
        hasSelection={false}
        dirty={false}
        history={{ canUndo: false, canRedo: false, undo: noop, redo: noop }}
        tool="text"
        onTool={noop}
        panel="none"
        onOpen={noop}
        onOpenUrl={noop}
        onOpenRecent={noop}
        onRemoveRecent={noop}
        onClearRecent={noop}
        onSave={noop}
        onSaveAs={noop}
        onCopyText={noop}
        onSelectPage={noop}
        onExtractImages={noop}
        onExportText={noop}
        onHighlight={noop}
        onComment={noop}
        onComments={noop}
        onBookmarks={noop}
        onBookmark={noop}
        onGoToPage={noop}
        onZoom={noop}
        onZoomMode={noop}
        onRotate={noop}
        onLayout={noop}
        onSearch={noop}
        onTogglePanel={noop}
        onTheme={noop}
        onLang={noop}
        onSettings={noop}
        onAbout={noop}
        onPrint={noop}
        {...props}
      />,
    );
  };

  it('shows aA, smaller, the size and larger — in that order — for a reflowable book', async () => {
    await setLanguage('en');
    const onBookFontSize = vi.fn();
    const { container } = renderToolbar({ bookFontSize: 18, onBookFontSize });
    const group = container.querySelector('[data-book-font]');
    expect(group).toBeTruthy();
    const parts = [...group.children].map((el) => el.textContent.trim() || el.getAttribute('aria-label'));
    expect(parts).toEqual(['aA', 'Smaller text', '18px', 'Larger text']);
    fireEvent.click(screen.getByRole('button', { name: 'Smaller text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Larger text' }));
    expect(onBookFontSize.mock.calls).toEqual([[-1], [1]]);
  });

  it('disables a step at either end of the range', () => {
    const { container } = renderToolbar({ bookFontSize: MAX_FONT_SIZE, onBookFontSize: () => {} });
    const [smaller, larger] = container.querySelectorAll('[data-book-font] button');
    expect(smaller.disabled).toBe(false);
    expect(larger.disabled).toBe(true);
  });

  it('is not there for a PDF or a fixed-layout book', () => {
    const { container } = renderToolbar({ bookFontSize: null });
    expect(container.querySelector('[data-book-font]')).toBe(null);
  });
});

describe('folder panel and shelf names', () => {
  it('lists e-books but not text files, pictures or workspaces', () => {
    expect(isBookFileName('a.epub')).toBe(true);
    expect(isBookFileName('b.AZW3')).toBe(true);
    expect(isBookFileName('c.djvu')).toBe(true);
    expect(isBookFileName('d.txt')).toBe(false);
    expect(isBookFileName('e.png')).toBe(false);
    expect(isBookFileName('f.ebkvw')).toBe(false);
    const list = toFolderEntries([
      { name: 'z.epub', path: '/z.epub', isFile: true },
      { name: 'Books', path: '/Books', isDirectory: true },
      { name: 'readme.txt', path: '/readme.txt', isFile: true },
      { name: 'a.pdf', path: '/a.pdf', isFile: true },
    ]);
    expect(list.map((e) => e.name)).toEqual(['Books', 'a.pdf', 'z.epub']);
  });

  it('shows a book\'s title without its extension', () => {
    expect(bookTitleOf('Moby Dick.epub')).toBe('Moby Dick');
    expect(bookTitleOf('Report.PDF')).toBe('Report');
    expect(bookTitleOf('Notes.md')).toBe('Notes');
    expect(bookTitleOf('notes.txt')).toBe('notes');
    expect(bookTitleOf('setup.exe')).toBe('setup.exe');
    expect(bookTitleOf('work.ebkvw')).toBe('work.ebkvw');
  });
});
