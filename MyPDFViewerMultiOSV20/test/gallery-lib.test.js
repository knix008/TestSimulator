// Gallery, favorites, history, highlights and direct printing — the logic
// behind the panels, without the React tree.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  registerOpened, addPaths, removeFromGallery, setFavorite, isFavorite, favoritesOf, inGallery,
  forgetOpened, forgetAllOpened, recentlyOpened, sortGallery, filterGallery, normalizeGallery,
  seedGallery, clampTileSize, normalizeGalleryView, samePath, GALLERY_MAX, TILE_MIN, TILE_MAX,
} from '../src/lib/gallery.js';
import { getThumb, setThumb, deleteThumb, subscribeThumb, peekThumb, __resetThumbs } from '../src/lib/thumb-store.js';
import { listHighlights, splitHighlightDeletes, pdfRefFromId } from '../src/lib/highlights.js';
import { resolveLandscape, choosePrinter, clampCopies, PRINT_ORIENTATIONS } from '../src/lib/print.js';
import { framePages, createDesktopApi } from '../src/lib/desktop-bridge.js';
import { startFolderCandidates } from '../src/lib/folders.js';
import { normalize, DEFAULT_SETTINGS } from '../src/lib/settings.js';
import { writeWorkspaceIntoPdf, removePdfAnnotations } from '../src/lib/pdf-write.js';
import { buildPdf } from './fixtures/pdf.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.resolve(import.meta.dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs'),
).href;

const A = 'C:\\Docs\\a.pdf';
const B = 'C:\\Docs\\b.pdf';

describe('gallery: opened files are registered by themselves', () => {
  it('adds a new file to the front and moves a known one there', () => {
    let g = registerOpened([], { path: A, size: 10 }, 1000);
    g = registerOpened(g, { path: B, size: 20 }, 2000);
    expect(g.map((x) => x.name)).toEqual(['b.pdf', 'a.pdf']);
    expect(g[0]).toMatchObject({ dir: 'C:\\Docs', size: 20, addedAt: 2000, openedAt: 2000 });
    g = registerOpened(g, { path: 'c:/docs/A.PDF', size: 11 }, 3000);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ size: 11, addedAt: 1000, openedAt: 3000 });
  });

  it('keeps the star when a favorite is opened again', () => {
    let g = setFavorite(registerOpened([], { path: A }, 1), { path: A }, true);
    g = registerOpened(g, { path: A }, 5);
    expect(g[0].favorite).toBe(true);
  });

  it('ignores entries without a path (a web download)', () => {
    expect(registerOpened([], { name: 'x.pdf', path: null })).toEqual([]);
  });

  it('caps the list', () => {
    let g = [];
    for (let i = 0; i < GALLERY_MAX + 5; i++) g = registerOpened(g, { path: `C:\\d\\${i}.pdf` }, i);
    expect(g).toHaveLength(GALLERY_MAX);
    expect(g[0].name).toBe(`${GALLERY_MAX + 4}.pdf`);
  });
});

describe('gallery: adding and removing by hand', () => {
  it('adds new paths once, case-insensitively, without touching known ones', () => {
    const g = registerOpened([], { path: A }, 1);
    const r = addPaths(g, [B, 'c:\\docs\\B.pdf', A, '', 7], 9);
    expect(r.added).toBe(1);
    expect(r.list.map((x) => x.name)).toEqual(['b.pdf', 'a.pdf']);
    expect(r.list[0].openedAt).toBeUndefined();
    expect(inGallery(r.list, 'C:/Docs/B.pdf')).toBe(true);
  });

  it('removes only the entry', () => {
    const g = addPaths([], [A, B]).list;
    expect(removeFromGallery(g, 'c:/docs/a.pdf').map((x) => x.path)).toEqual([B]);
  });
});

describe('favorites', () => {
  it('stars and unstars, and starring an unknown file adds it', () => {
    let g = addPaths([], [A]).list;
    g = setFavorite(g, { path: A }, true);
    expect(isFavorite(g, A)).toBe(true);
    g = setFavorite(g, { path: B, name: 'b.pdf' }, true);
    expect(favoritesOf(g).map((x) => x.name).sort()).toEqual(['a.pdf', 'b.pdf']);
    g = setFavorite(g, { path: A }, false);
    expect(isFavorite(g, A)).toBe(false);
    expect(g.find((x) => x.path === A).favorite).toBeUndefined();
    expect(setFavorite(g, { path: 'C:\\none.pdf' }, false)).toBe(g);
  });
});

describe('history: recently opened', () => {
  const g = [
    { path: A, name: 'a.pdf', dir: '', size: 0, addedAt: 1, openedAt: 10 },
    { path: B, name: 'b.pdf', dir: '', size: 0, addedAt: 2, openedAt: 30 },
    { path: 'C:\\c.pdf', name: 'c.pdf', dir: '', size: 0, addedAt: 3 },
  ];

  it('lists opened files, newest first', () => {
    expect(recentlyOpened(g).map((x) => x.name)).toEqual(['b.pdf', 'a.pdf']);
    expect(recentlyOpened(g, 1)).toHaveLength(1);
  });

  it('forgets one or all without dropping the gallery entries', () => {
    const one = forgetOpened(g, 'c:/docs/b.pdf');
    expect(recentlyOpened(one).map((x) => x.name)).toEqual(['a.pdf']);
    expect(one).toHaveLength(3);
    expect(forgetOpened(g, 'C:\\nope.pdf')).toBe(g);
    const all = forgetAllOpened(g);
    expect(recentlyOpened(all)).toEqual([]);
    expect(all).toHaveLength(3);
  });
});

describe('gallery views: sort, filter, tile size', () => {
  const g = [
    { path: 'C:\\x\\Zeta.pdf', name: 'Zeta.pdf', dir: 'C:\\x', size: 5, addedAt: 3, openedAt: 1 },
    { path: 'C:\\y\\alpha.pdf', name: 'alpha.pdf', dir: 'C:\\y', size: 9, addedAt: 1, openedAt: 5, favorite: true },
    { path: 'C:\\x\\Mid.pdf', name: 'Mid.pdf', dir: 'C:\\x', size: 1, addedAt: 2 },
  ];

  it('sorts by name, size, added and opened', () => {
    expect(sortGallery(g, 'name', 'asc').map((x) => x.name)).toEqual(['alpha.pdf', 'Mid.pdf', 'Zeta.pdf']);
    expect(sortGallery(g, 'size', 'desc').map((x) => x.size)).toEqual([9, 5, 1]);
    expect(sortGallery(g, 'added', 'desc').map((x) => x.addedAt)).toEqual([3, 2, 1]);
    expect(sortGallery(g, 'opened', 'desc')[0].name).toBe('alpha.pdf');
  });

  it('filters favorites and by a name or folder fragment', () => {
    expect(filterGallery(g, { only: 'favorites' }).map((x) => x.name)).toEqual(['alpha.pdf']);
    expect(filterGallery(g, { query: 'zet' }).map((x) => x.name)).toEqual(['Zeta.pdf']);
    expect(filterGallery(g, { query: 'c:\\x' })).toHaveLength(2);
  });

  it('clamps the tile size and the view name', () => {
    expect(clampTileSize(10)).toBe(TILE_MIN);
    expect(clampTileSize(9999)).toBe(TILE_MAX);
    expect(clampTileSize('abc')).toBe(168);
    expect(normalizeGalleryView('details')).toBe('details');
    expect(normalizeGalleryView('grid')).toBe('tiles');
  });
});

describe('gallery in settings', () => {
  it('starts an old settings file from its recent files', () => {
    const s = normalize({ recentFiles: [{ path: A, name: 'a.pdf', openedAt: 5 }] });
    expect(s.gallery).toHaveLength(1);
    expect(s.gallery[0]).toMatchObject({ path: A, openedAt: 5 });
  });

  it('keeps a gallery the user emptied empty', () => {
    expect(normalize({ gallery: [], recentFiles: [{ path: A, name: 'a.pdf' }] }).gallery).toEqual([]);
  });

  it('cleans what it reads', () => {
    const g = normalizeGallery([{ path: A, favorite: 'yes', thumb: 'x' }, { path: 'c:/docs/a.pdf' }, { name: 'nope' }]);
    expect(g).toHaveLength(1);
    expect(g[0].favorite).toBeUndefined();
    expect(g[0].thumb).toBeUndefined();
    expect(seedGallery(null)).toEqual([]);
    expect(DEFAULT_SETTINGS.galleryView).toBe('tiles');
    expect(samePath('C:\\A\\b.pdf', 'c:/a/B.PDF')).toBe(true);
  });
});

describe('first-page pictures', () => {
  beforeEach(() => __resetThumbs());

  it('stores, notifies and forgets a picture per path', async () => {
    const seen = vi.fn();
    const off = subscribeThumb('C:\\Docs\\a.pdf', seen);
    await setThumb(A, 'data:image/jpeg;base64,AAA');
    expect(seen).toHaveBeenCalledWith('data:image/jpeg;base64,AAA');
    expect(await getThumb('c:/docs/A.pdf')).toBe('data:image/jpeg;base64,AAA');
    expect(peekThumb(A)).toBe('data:image/jpeg;base64,AAA');
    await deleteThumb(A);
    expect(seen).toHaveBeenLastCalledWith('');
    expect(await getThumb(A)).toBe('');
    off();
  });

  it('refuses anything that is not a picture', async () => {
    await setThumb(A, 'javascript:alert(1)');
    expect(await getThumb(A)).toBe('');
  });
});

describe('highlights panel', () => {
  const ws = [
    { id: 'w1', kind: 'highlight', page: 2, rects: [{ x: 0.1, y: 0.5, w: 0.2, h: 0.02 }], text: 'later on page 2' },
    { id: 'w2', kind: 'note', page: 1, rects: [{ x: 0, y: 0, w: 0.1, h: 0.1 }], text: 'a note' },
  ];
  const saved = [
    { id: '12R', kind: 'highlight', page: 1, fracY: 0.3, text: 'saved one', color: 'rgba(1,2,3,.4)' },
    { id: '13R', kind: 'underline', page: 1, fracY: 0.4, text: 'not a highlight' },
    { id: 'c0', kind: 'highlight', page: 1, fracY: 0.5, text: 'no object id' },
  ];

  it('lists saved and unsaved highlights in page order, nothing else', () => {
    const list = listHighlights(ws, saved);
    expect(list.map((h) => [h.source, h.id, h.page])).toEqual([['pdf', '12R', 1], ['workspace', 'w1', 2]]);
  });

  it('splits a delete into workspace ids and PDF objects', () => {
    const { workspaceIds, pdfRefs } = splitHighlightDeletes(listHighlights(ws, saved));
    expect([...workspaceIds]).toEqual(['w1']);
    expect(pdfRefs).toEqual([{ page: 1, num: 12, gen: 0 }]);
    expect(pdfRefFromId('7R2')).toEqual({ num: 7, gen: 2 });
    expect(pdfRefFromId('c3')).toBeNull();
  });

  it('cuts saved highlights out of the PDF', async () => {
    const withMarks = await writeWorkspaceIntoPdf(buildPdf({ pages: [{ text: 'Hello World' }] }), {
      annotations: [
        { id: 'h1', page: 1, kind: 'highlight', rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.05 }], text: 'one' },
        { id: 'h2', page: 1, kind: 'highlight', rects: [{ x: 0.1, y: 0.4, w: 0.3, h: 0.05 }], text: 'two' },
      ],
    });
    const read = async (bytes) => {
      const doc = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
      const a = (await (await doc.getPage(1)).getAnnotations()).filter((x) => x.subtype === 'Highlight');
      await doc.destroy();
      return a;
    };
    const before = await read(withMarks);
    expect(before).toHaveLength(2);
    const victim = before.find((a) => a.contentsObj.str === 'one');
    const { bytes, removed } = await removePdfAnnotations(withMarks, [{ page: 1, ...pdfRefFromId(victim.id) }]);
    expect(removed).toBe(1);
    const after = await read(bytes);
    expect(after.map((a) => a.contentsObj.str)).toEqual(['two']);
  });
});

describe('direct printing', () => {
  it('follows the pages for automatic orientation', () => {
    expect(resolveLandscape('auto', [{ landscape: true }, { landscape: true }, { landscape: false }])).toBe(true);
    expect(resolveLandscape('auto', [{ landscape: false }])).toBe(false);
    expect(resolveLandscape('auto', [])).toBe(false);
    expect(resolveLandscape('landscape', [])).toBe(true);
    expect(resolveLandscape('portrait', [{ landscape: true }])).toBe(false);
    expect(PRINT_ORIENTATIONS).toEqual(['auto', 'portrait', 'landscape']);
  });

  it('picks the remembered printer, else the default, else the first', () => {
    const list = { printers: ['P1', 'P2'], default: 'P2' };
    expect(choosePrinter('P1', list)).toBe('P1');
    expect(choosePrinter('Gone', list)).toBe('P2');
    expect(choosePrinter('', { printers: ['P1'], default: null })).toBe('P1');
    expect(choosePrinter('', { printers: [] })).toBe('');
  });

  it('clamps copies to 1–99', () => {
    expect([clampCopies(0), clampCopies('3'), clampCopies(150), clampCopies('x')]).toEqual([1, 3, 99, 1]);
  });

  it('frames the pages for the host and sends the job in headers', async () => {
    const f = framePages([new Uint8Array([1, 2]), new Uint8Array([9])]);
    expect(Array.from(f)).toEqual([2, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 1, 2, 9]);
    const call = vi.fn(async () => 2);
    const api = createDesktopApi({ call, listen: vi.fn() });
    await api.printTo({ images: [new Uint8Array([7])], printer: 'HP 7740 (보조)', copies: 150, landscape: true, title: '보고.pdf' });
    const [cmd, body, opts] = call.mock.calls[0];
    expect(cmd).toBe('print_pages');
    expect(Array.from(body)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 7]);
    expect(decodeURIComponent(opts.headers['x-printer'])).toBe('HP 7740 (보조)');
    expect(opts.headers['x-copies']).toBe('99');
    expect(opts.headers['x-landscape']).toBe('1');
    expect(decodeURIComponent(opts.headers['x-title'])).toBe('보고.pdf');
    await api.listPrinters();
    expect(call).toHaveBeenLastCalledWith('print_list_printers');
  });
});

describe('folder panel start', () => {
  it('prefers the last folder a file came from, then the last folder shown', () => {
    expect(startFolderCandidates({ lastDir: 'C:\\a', folderRoot: 'C:\\b' })).toEqual(['C:\\a', 'C:\\b']);
    expect(startFolderCandidates({ lastDir: ' ', folderRoot: 'C:\\b' })).toEqual(['C:\\b']);
    expect(startFolderCandidates({ lastDir: 'C:\\a', folderRoot: 'C:\\a' })).toEqual(['C:\\a']);
    expect(startFolderCandidates(null)).toEqual([]);
  });
});
