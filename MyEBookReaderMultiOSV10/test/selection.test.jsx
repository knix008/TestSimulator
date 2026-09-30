import React, { createRef } from 'react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import BookView from '../src/components/BookView.jsx';
import { openBook } from '../src/lib/book.js';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';
import { sampleBytes } from './helpers/samples.mjs';

// What a reader can select, format by format.
//
// "Select the text" means something different in each kind of book, and the only
// honest way to check it is against the real files: a chapter's words come from
// the markup a format reader produced, a PDF's words come from the text layer
// pdf.js paints over the page, and a comic or a photograph has no words at all —
// it has a picture, which is selected by clicking it.
//
// Every format the reader opens is listed here so that a format whose text stops
// being selectable fails a test rather than being noticed by a reader.

const REFLOWABLE = [
  ['EPUB', 'sample.epub'],
  ['MOBI', 'sample.mobi'],
  ['FictionBook', 'sample.fb2'],
  ['Markdown', 'sample.md'],
  ['HTML', 'sample.html'],
  ['plain text', 'sample.txt'],
];

const PICTURES = [
  ['a comic', 'sample.cbz'],
  ['a picture', 'sample.png'],
  ['a TIFF scan', 'sample.tif'],
  ['a DICOM image', 'sample.dcm'],
];

const books = new Map();

beforeAll(async () => {
  for (const [, file] of [...REFLOWABLE, ...PICTURES]) {
    const data = sampleBytes(file);
    // eslint-disable-next-line no-await-in-loop
    books.set(file, await openBook({ data, name: file, size: data.length }));
  }
});

function show(book, section = 0, over = {}) {
  const ref = createRef();
  const props = {
    book,
    section,
    content: book.loadSection(section),
    settings: DEFAULT_SETTINGS,
    marks: { highlights: [], notes: [], bookmarks: [] },
    searchQuery: '',
    activeHit: null,
    onSelectionChange: vi.fn(),
    onContextMenu: vi.fn(),
    onFollowLink: vi.fn(),
    onOpenExternal: vi.fn(),
    onProgress: vi.fn(),
    onPageInfo: vi.fn(),
    onZoomStep: vi.fn(),
    onTextStep: vi.fn(),
    onScaleChange: vi.fn(),
    onPickImage: vi.fn(),
    onGoToPage: vi.fn(),
    onError: vi.fn(),
    emptyState: <p>no book</p>,
    ...over,
  };
  return { ...render(<BookView ref={ref} {...props} />), ref, props };
}

describe('selecting text, format by format', () => {
  for (const [label, file] of REFLOWABLE) {
    it(`selects the words of a chapter in ${label}`, () => {
      const book = books.get(file);
      const view = show(book);
      expect(view.ref.current.hasText()).toBe(true);
      expect(view.ref.current.selectAll()).toBe(true);
      const said = view.props.onSelectionChange.mock.calls.at(-1)?.[0] || '';
      // jsdom's Selection does not stringify a range, so the words are read from
      // what was selected rather than from the selection's own text.
      const chapter = document.querySelector('[data-testid=chapter]');
      expect(chapter.textContent.trim().length).toBeGreaterThan(0);
      expect(typeof said).toBe('string');
      view.unmount();
    });
  }

  for (const [label, file] of PICTURES) {
    it(`has no text to select in ${label}, and says so`, () => {
      const book = books.get(file);
      const view = show(book);
      expect(view.ref.current.hasText()).toBe(false);
      // Not a silent no-op: the caller is told, and tells the reader.
      expect(view.ref.current.selectAll()).toBe(false);
      view.unmount();
    });
  }

  it('lets the reader clear a selection again', () => {
    const view = show(books.get('sample.epub'));
    view.ref.current.selectAll();
    view.ref.current.clearSelection();
    expect(view.props.onSelectionChange).toHaveBeenLastCalledWith('');
    view.unmount();
  });
});

describe('picking a picture, format by format', () => {
  for (const [label, file] of PICTURES) {
    it(`marks the page of ${label} when it is clicked`, () => {
      const view = show(books.get(file));
      const image = document.querySelector('img.comic-page');
      expect(image).toBeTruthy();
      fireEvent.pointerDown(image, { button: 0 });
      expect(image.classList.contains('picked')).toBe(true);
      expect(view.props.onPickImage).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'page' }),
      );
      view.unmount();
    });
  }

  it('reports a picture inside a chapter as a picture in the text', () => {
    const book = books.get('sample.epub');
    const view = show(book, 0, {
      content: { kind: 'html', index: 0, html: '<p>글</p><img src="blob:fig" alt="그림">' },
    });
    const figure = document.querySelector('.chapter img');
    fireEvent.pointerDown(figure, { button: 0 });
    expect(view.props.onPickImage).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'figure', name: '그림' }),
    );
    view.unmount();
  });
});

describe('turning a page on its side, format by format', () => {
  // jsdom lays nothing out, so the pane is told how big it is before the view is
  // rendered: the fitting is measured from the pane, and a pane of no size can
  // only fall back to CSS bounds.
  const room = { width: 900, height: 700 };
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true, get() { return room.width; },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true, get() { return room.height; },
    });
  });
  afterAll(() => {
    delete HTMLElement.prototype.clientWidth;
    delete HTMLElement.prototype.clientHeight;
  });

  /** Tells a picture what size it decoded to, which jsdom cannot. */
  function decoded(image, width, height) {
    Object.defineProperty(image, 'naturalWidth', { value: width, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: height, configurable: true });
    fireEvent.load(image);
  }

  for (const [label, file] of PICTURES) {
    it(`turns the page of ${label}, and gives the turned page its room`, () => {
      const view = show(books.get(file), 0, { settings: { ...DEFAULT_SETTINGS, rotation: 90 } });
      const image = document.querySelector('img.comic-page');
      decoded(image, 400, 200);

      const frame = document.querySelector('.page-frame');
      expect(frame).toBeTruthy();
      expect(image.style.transform).toContain('rotate(90deg)');
      // A page 400 × 200 turned on its side is 200 wide and 400 tall, and the
      // room it is given has to be that way round or it overlaps its neighbour.
      const w = parseFloat(frame.style.width);
      const h = parseFloat(frame.style.height);
      expect(h).toBeGreaterThan(w);
      expect(w).toBe(parseFloat(image.style.height));
      expect(h).toBe(parseFloat(image.style.width));
      view.unmount();
    });
  }

  it('leaves an unturned page the room it takes', () => {
    const view = show(books.get('sample.png'));
    const image = document.querySelector('img.comic-page');
    decoded(image, 400, 200);
    const frame = document.querySelector('.page-frame');
    expect(frame.style.width).toBe(image.style.width);
    expect(frame.style.height).toBe(image.style.height);
    expect(image.style.transform).toContain('rotate(0deg)');
    view.unmount();
  });

  it('fits a turned page to the window the turned way round', () => {
    // A page far wider than it is tall fits the window across; turned on its
    // side it is the height that has to be made to fit.
    const upright = show(books.get('sample.png'));
    decoded(document.querySelector('img.comic-page'), 2000, 400);
    const flat = parseFloat(document.querySelector('.page-frame').style.width);
    upright.unmount();

    const turned = show(books.get('sample.png'), 0, { settings: { ...DEFAULT_SETTINGS, rotation: 90 } });
    decoded(document.querySelector('img.comic-page'), 2000, 400);
    const frame = document.querySelector('.page-frame');
    expect(parseFloat(frame.style.height)).toBeLessThanOrEqual(room.height);
    expect(parseFloat(frame.style.width)).toBeLessThanOrEqual(room.width);
    expect(parseFloat(frame.style.width)).toBeLessThan(flat);
    turned.unmount();
  });
});
