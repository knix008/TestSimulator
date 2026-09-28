import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  coverName, galleryStore, setGalleryStore, electronGalleryStore, COVER_HOST, SAVE_DELAY,
} from '../src/lib/gallerystore.js';
import { windowOf } from '../src/components/Gallery.jsx';

// The shelf's storage is the reason a hundred thousand books are possible at
// all: the index is one file, the covers are one file each, and neither is
// loaded because of the other.

afterEach(() => {
  setGalleryStore(null);
  vi.useRealTimers();
});

describe('cover names', () => {
  it('are stable, short and safe to use as a file name', () => {
    const name = coverName('C:/books/dune.epub');
    expect(name).toMatch(/^[a-z0-9]+\.png$/);
    expect(name).toBe(coverName('C:/books/dune.epub'));
    expect(name.length).toBeLessThan(24);
  });

  it('differ for different books', () => {
    const names = new Set([
      coverName('/a/one.epub'), coverName('/a/two.epub'), coverName('/b/one.epub'),
      coverName('one.epub'), coverName(''),
    ]);
    expect(names.size).toBe(5);
  });

  it('cope with anything a path can hold', () => {
    expect(coverName('/책/몽테크리스토 백작.epub')).toMatch(/^[a-z0-9]+\.png$/);
    expect(coverName(null)).toMatch(/^[a-z0-9]+\.png$/);
  });
});

describe('the desktop shelf', () => {
  let api;

  beforeEach(() => {
    api = {
      isElectron: true,
      gallery: {
        load: vi.fn(async () => JSON.stringify([{ path: '/a.epub', title: 'A' }])),
        save: vi.fn(async () => true),
        putCover: vi.fn(async () => true),
        clear: vi.fn(async () => true),
      },
    };
    window.electronAPI = api;
    vi.resetModules();
  });

  afterEach(() => {
    delete window.electronAPI;
  });

  /** The store, built against the fake bridge rather than the real one. */
  async function store() {
    return electronGalleryStore(api);
  }

  it('reads the index as text and parses it once', async () => {
    const shelf = await store();
    expect(shelf.kind).toBe('electron');
    await expect(shelf.load()).resolves.toEqual([{ path: '/a.epub', title: 'A' }]);
    expect(api.gallery.load).toHaveBeenCalled();
  });

  it('gives back an empty shelf rather than throwing on a damaged index', async () => {
    api.gallery.load = vi.fn(async () => '{ this is not json');
    const shelf = await store();
    await expect(shelf.load()).resolves.toEqual([]);
  });

  it('writes the index once the changes stop, not once per change', async () => {
    vi.useFakeTimers();
    const shelf = await store();
    shelf.write([{ path: '/1' }]);
    shelf.write([{ path: '/1' }, { path: '/2' }]);
    shelf.write([{ path: '/1' }, { path: '/2' }, { path: '/3' }]);
    expect(api.gallery.save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SAVE_DELAY + 20);
    expect(api.gallery.save).toHaveBeenCalledTimes(1);
    expect(JSON.parse(api.gallery.save.mock.calls[0][0])).toHaveLength(3);
  });

  it('puts a cover in its own file and points the page at it', async () => {
    const shelf = await store();
    const url = await shelf.putCover('/books/dune.epub', 'data:image/png;base64,QUJD');
    expect(api.gallery.putCover).toHaveBeenCalledWith(coverName('/books/dune.epub'), 'QUJD');
    expect(url).toBe(`${COVER_HOST}/${coverName('/books/dune.epub')}`);
  });

  it('knows a shelved book cover by its name alone — no loading', async () => {
    const shelf = await store();
    expect(shelf.coverSrc({ path: '/books/dune.epub', cover: true }))
      .toBe(`${COVER_HOST}/${coverName('/books/dune.epub')}`);
    expect(shelf.coverSrc({ path: '/books/dune.epub', cover: '' })).toBe('');
  });
});

describe('the fallback shelf', () => {
  it('keeps books and covers in memory when there is nowhere to put them', async () => {
    const shelf = setGalleryStore(null) || galleryStore();
    expect(['memory', 'indexeddb']).toContain(shelf.kind);
    await shelf.write([{ path: '/x.epub' }]);
    await expect(shelf.load()).resolves.toHaveLength(1);
    await shelf.putCover('/x.epub', 'data:image/png;base64,AA');
    await expect(shelf.loadCover({ path: '/x.epub', cover: true })).resolves.toBe('data:image/png;base64,AA');
    await shelf.clear();
    await expect(shelf.load()).resolves.toHaveLength(0);
  });

  it('can be swapped for one a test brings', async () => {
    const fake = { kind: 'fake', load: async () => [{ path: '/f' }] };
    expect(setGalleryStore(fake)).toBe(fake);
    expect(galleryStore()).toBe(fake);
  });
});

describe('which rows are worth drawing', () => {
  it('draws only what the view can show, plus a little either side', () => {
    const win = windowOf(0, 800, 50, 100000);
    expect(win.first).toBe(0);
    expect(win.last).toBeLessThan(40);
    expect(win.above).toBe(0);
    // Everything below stands in as one blank block, so the scrollbar is right.
    expect(win.above + (win.last - win.first) * 50 + win.below).toBe(100000 * 50);
  });

  it('follows the scroll into the middle of a long list', () => {
    const win = windowOf(500000, 800, 50, 100000);
    expect(win.first).toBeGreaterThan(9990);
    expect(win.last - win.first).toBeLessThan(40);
    expect(win.above).toBe(win.first * 50);
  });

  it('never leaves a shortened list blank', () => {
    // A search cuts the shelf to three rows while it is scrolled far down.
    const win = windowOf(500000, 800, 50, 3);
    expect(win.first).toBe(0);
    expect(win.last).toBe(3);
    expect(win.below).toBe(0);
  });

  it('has nothing to draw for an empty list', () => {
    expect(windowOf(0, 800, 50, 0)).toEqual({ first: 0, last: 0, above: 0, below: 0 });
  });
});
