import { describe, it, expect, vi } from 'vitest';
import {
  getPageText, searchDocument, getOutline, destToPage, destToLocation, getPageLinks,
  getPageComments, getDocumentComments, getDocumentInfo, getPageImageRegions, OPS,
} from '../src/lib/pdf.js';

function pageWithItems(items) {
  return {
    getTextContent: async () => ({ items }),
    cleanup: vi.fn(),
  };
}

function docFromPages(pages) {
  return {
    numPages: pages.length,
    getPage: async (n) => pages[n - 1],
  };
}

describe('getPageText', () => {
  it('concatenates items and inserts a newline on hasEOL', async () => {
    const page = pageWithItems([
      { str: 'Hello', hasEOL: false },
      { str: ' ', hasEOL: false },
      { str: 'World', hasEOL: true },
      { str: 'Next', hasEOL: false },
    ]);
    expect(await getPageText(page)).toBe('Hello World\nNext');
  });

  it('skips non-string items', async () => {
    const page = pageWithItems([{ str: 12 }, { str: 'ok' }, {}]);
    expect(await getPageText(page)).toBe('ok');
  });

  it('returns an empty string for an empty page', async () => {
    expect(await getPageText(pageWithItems([]))).toBe('');
  });
});

describe('searchDocument', () => {
  const pages = [
    pageWithItems([{ str: 'The Quick Brown Fox', hasEOL: true }]),
    pageWithItems([{ str: 'jumps over the lazy fox', hasEOL: false }]),
  ];
  const doc = docFromPages(pages);

  it('returns nothing for a blank query', async () => {
    expect(await searchDocument(doc, '   ')).toEqual([]);
    expect(await searchDocument(doc, '')).toEqual([]);
  });

  it('is case-insensitive and reports page / snippet / match', async () => {
    const hits = await searchDocument(doc, 'FOX');
    expect(hits).toHaveLength(2);
    expect(hits[0].page).toBe(1);
    expect(hits[0].pageHit).toBe(0);
    expect(hits[0].match.toLowerCase()).toBe('fox');
    expect(hits[0].snippet.toLowerCase()).toContain('fox');
    expect(hits[1].page).toBe(2);
    expect(hits[1].pageHit).toBe(0);
  });

  it('finds overlapping-adjacent occurrences by advancing past each match', async () => {
    const one = docFromPages([pageWithItems([{ str: 'aaa' }])]);
    const hits = await searchDocument(one, 'aa');
    expect(hits).toHaveLength(1);
  });

  it('reports progress and stops when aborted', async () => {
    const ticks = [];
    const controller = new AbortController();
    const many = docFromPages(Array.from({ length: 4 }, (_, i) => {
      return pageWithItems([{ str: i === 0 ? 'needle here' : 'nothing' }]);
    }));
    const hits = await searchDocument(many, 'needle', {
      onProgress: (p) => {
        ticks.push(p);
        if (p.done >= 1) controller.abort();
      },
      signal: controller.signal,
    });
    expect(hits).toHaveLength(1);
    expect(ticks[0]).toEqual({ done: 0, total: 4 });
  });

  it('caps the hit list at 2000', async () => {
    const text = Array(2500).fill('x').join(' ');
    const huge = docFromPages([pageWithItems([{ str: text }])]);
    const hits = await searchDocument(huge, 'x');
    expect(hits.length).toBeLessThanOrEqual(2001);
  });
});

describe('getOutline / destToPage / getDocumentInfo', () => {
  it('returns [] when the document has no outline', async () => {
    expect(await getOutline({ getOutline: async () => null })).toEqual([]);
    expect(await getOutline({ getOutline: async () => { throw new Error('no'); } })).toEqual([]);
  });

  it('walks a nested outline and assigns ids / levels', async () => {
    const tree = await getOutline({
      getOutline: async () => ([
        { title: 'Ch 1', dest: 'd1', items: [{ title: '1.1', dest: ['p'], items: [] }] },
        { title: '', dest: null, url: 'https://x', items: [] },
      ]),
    });
    expect(tree).toHaveLength(2);
    expect(tree[0].id).toBe('o0');
    expect(tree[0].level).toBe(0);
    expect(tree[0].items[0].level).toBe(1);
    expect(tree[0].items[0].title).toBe('1.1');
    expect(tree[1].title).toBe('');
    expect(tree[1].url).toBe('https://x');
  });

  it('resolves a named or explicit destination to a 1-based page', async () => {
    const doc = {
      getDestination: async (name) => (name === 'ch1' ? [{ id: 2 }] : null),
      getPageIndex: async (ref) => (ref.id === 2 ? 2 : 0),
    };
    expect(await destToPage(doc, 'ch1')).toBe(3);
    expect(await destToPage(doc, [{ id: 2 }])).toBe(3);
    expect(await destToPage(doc, 'missing')).toBe(null);
    expect(await destToPage({ getDestination: async () => { throw new Error('x'); } }, 'z')).toBe(null);
  });

  it('reads XYZ / FitH page and pdf-space Y from a destination', async () => {
    const doc = {
      getDestination: async (name) => (name === 'sec' ? [{ id: 1 }, { name: 'XYZ' }, 0, 420, null] : null),
      getPageIndex: async (ref) => (ref.id === 1 ? 4 : 0),
    };
    const xyz = await destToLocation(doc, 'sec');
    expect(xyz).toEqual({ page: 5, pdfTop: 420, name: 'XYZ' });
    const fit = await destToLocation(doc, [{ id: 1 }, 'FitH', 200]);
    expect(fit).toEqual({ page: 5, pdfTop: 200, name: 'FitH' });
    expect(await destToLocation(doc, null)).toBe(null);
    expect(await destToLocation(doc, 0)).toBe(null);
  });

  it('reads metadata fields and falls back to empty strings', async () => {
    const info = await getDocumentInfo({
      getMetadata: async () => ({
        info: {
          Title: 'T', Author: 'A', Subject: 'S', Keywords: 'K',
          Creator: 'C', Producer: 'P', CreationDate: 'D1', ModDate: 'D2',
          PDFFormatVersion: '1.7', IsEncrypted: true,
        },
        metadata: { get: () => 'ignored' },
      }),
    });
    expect(info.title).toBe('T');
    expect(info.encrypted).toBe(true);
    expect(info.version).toBe('1.7');
    expect(await getDocumentInfo({ getMetadata: async () => { throw new Error('x'); } })).toEqual({});
  });

  it('uses dc:title when Info.Title is missing', async () => {
    const info = await getDocumentInfo({
      getMetadata: async () => ({
        info: {},
        metadata: { get: (k) => (k === 'dc:title' ? 'From XMP' : '') },
      }),
    });
    expect(info.title).toBe('From XMP');
  });
});

describe('getPageImageRegions', () => {
  it('returns [] when the operator list cannot be read', async () => {
    expect(await getPageImageRegions({ getOperatorList: async () => { throw new Error('x'); } }, { transform: [1, 0, 0, 1, 0, 0] })).toEqual([]);
  });

  it('replays save / transform / paint / restore to place the image', async () => {
    const page = {
      getOperatorList: async () => ({
        fnArray: [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore],
        argsArray: [
          null,
          [80, 0, 0, 60, 10, 20],
          ['Im1'],
          null,
        ],
      }),
    };
    const identity = { transform: [1, 0, 0, 1, 0, 0] };
    const regions = await getPageImageRegions(page, identity, { minSize: 1 });
    expect(regions).toHaveLength(1);
    expect(regions[0].name).toBe('Im1');
    expect(regions[0].inline).toBe(false);
    expect(regions[0].id).toMatch(/^Im1#/);
    expect(regions[0].rect.width).toBeCloseTo(80);
    expect(regions[0].rect.height).toBeCloseTo(60);
    expect(regions[0].rect.x).toBeCloseTo(10);
    expect(regions[0].rect.y).toBeCloseTo(20);
  });

  it('filters images smaller than minSize and names inline paints', async () => {
    const page = {
      getOperatorList: async () => ({
        fnArray: [OPS.paintInlineImageXObject, OPS.paintImageXObject],
        argsArray: [
          [{ width: 2 }],
          ['Tiny'],
        ],
      }),
    };
    const viewport = { transform: [4, 0, 0, 4, 0, 0] };
    const keep = await getPageImageRegions(page, viewport, { minSize: 1 });
    expect(keep.some((r) => r.inline)).toBe(true);
    const drop = await getPageImageRegions(page, { transform: [1, 0, 0, 1, 0, 0] }, { minSize: 24 });
    expect(drop).toEqual([]);
  });
});

describe('getPageLinks', () => {
  const viewport = {
    convertToViewportRectangle: (r) => [r[0], 800 - r[3], r[2], 800 - r[1]],
  };

  it('keeps dest / url / named-action links and converts their rects', async () => {
    const page = {
      getAnnotations: async () => ([
        { annotationType: 2, id: 'L1', dest: 'ch2', rect: [10, 700, 200, 730], title: 'Ch 2' },
        { subtype: 'Link', id: 'L2', url: 'https://ex.test', rect: [10, 650, 80, 670] },
        { annotationType: 2, id: 'L3', action: 'NextPage', rect: [10, 600, 40, 620] },
        { annotationType: 3, id: 'skip-widget', dest: 'x', rect: [0, 0, 10, 10] },
        { annotationType: 2, id: 'skip-empty', rect: [0, 0, 10, 10] },
      ]),
    };
    const links = await getPageLinks(page, viewport);
    expect(links).toHaveLength(3);
    expect(links[0]).toMatchObject({ id: 'L1', dest: 'ch2', title: 'Ch 2' });
    expect(links[0].rect.x).toBe(10);
    expect(links[0].rect.width).toBe(190);
    expect(links[1].url).toBe('https://ex.test');
    expect(links[2].action).toBe('NextPage');
  });

  it('returns [] when annotations cannot be read and uses unsafeUrl / raw rects', async () => {
    expect(await getPageLinks({ getAnnotations: async () => { throw new Error('x'); } }, viewport)).toEqual([]);
    const links = await getPageLinks({
      getAnnotations: async () => ([{ subtype: 'Link', unsafeUrl: 'https://a', rect: [5, 5, 15, 25] }]),
    }, {});
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe('https://a');
    expect(links[0].rect).toEqual({ x: 5, y: 5, width: 10, height: 20 });
  });
});

describe('getPageComments', () => {
  const viewport = {
    convertToViewportRectangle: (r) => [r[0], 800 - r[3], r[2], 800 - r[1]],
  };

  it('keeps highlight / sticky comments with their region and text', async () => {
    const page = {
      getAnnotations: async () => ([
        {
          annotationType: 9, subtype: 'Highlight', id: 'H1',
          rect: [10, 700, 120, 720],
          quadPoints: [10, 700, 120, 700, 10, 720, 120, 720],
          contentsObj: { str: 'check this' },
          titleObj: { str: 'Ada' },
          color: [1, 1, 0],
        },
        { annotationType: 2, id: 'L', dest: 'x', rect: [0, 0, 10, 10] },
        {
          annotationType: 1, subtype: 'Text', id: 'N1',
          rect: [40, 500, 60, 520],
          contents: 'a note',
          title: 'Bob',
        },
      ]),
    };
    const comments = await getPageComments(page, viewport);
    expect(comments).toHaveLength(2);
    expect(comments[0]).toMatchObject({ id: 'H1', kind: 'highlight', text: 'check this', author: 'Ada' });
    expect(comments[0].rects[0].width).toBeGreaterThan(0);
    expect(comments[1]).toMatchObject({ id: 'N1', kind: 'text', text: 'a note', author: 'Bob' });
  });

  it('returns [] when annotations cannot be read', async () => {
    expect(await getPageComments({ getAnnotations: async () => { throw new Error('x'); } }, viewport)).toEqual([]);
  });

  it('walks every page so the comments tool can list them', async () => {
    const page = (id, text, y = 100) => ({
      getViewport: () => ({
        height: 800,
        convertToViewportRectangle: (r) => r,
      }),
      getAnnotations: async () => ([
        { annotationType: 1, subtype: 'Text', id, rect: [10, y, 30, y + 20], contents: text },
      ]),
    });
    const comments = await getDocumentComments(docFromPages([
      page('A', 'first', 80),
      page('B', 'second', 400),
    ]));
    expect(comments).toHaveLength(2);
    expect(comments[0]).toMatchObject({ id: 'A', page: 1, text: 'first' });
    expect(comments[1]).toMatchObject({ id: 'B', page: 2, text: 'second' });
    expect(comments[0].fracY).toBeCloseTo(80 / 800);
    expect(comments[1].fracY).toBeCloseTo(400 / 800);
  });
});
