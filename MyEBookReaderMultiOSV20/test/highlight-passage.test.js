// A highlight covers the passage the user selected — one entry however many
// lines it spans — and highlights saved line by line before that change are
// still listed and deleted as one passage.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { highlightFromSelection, annotationBoxes, HIGHLIGHT_COLOR } from '../src/lib/view.js';
import { listHighlights, splitHighlightDeletes, groupPassages, pdfRefFromId } from '../src/lib/highlights.js';
import { writeWorkspaceIntoPdf, removePdfAnnotations } from '../src/lib/pdf-write.js';
import { buildPdf } from './fixtures/pdf.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.resolve(import.meta.dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs'),
).href;

const threeLines = {
  page: 2,
  text: 'The quick brown fox jumps over the lazy dog',
  rects: [
    { x: 0.10, y: 0.20, w: 0.60, h: 0.02 },
    { x: 0.10, y: 0.23, w: 0.70, h: 0.02 },
    { x: 0.10, y: 0.26, w: 0.25, h: 0.02 },
  ],
};

async function savedHighlights(bytes) {
  const doc = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  const annots = (await (await doc.getPage(1)).getAnnotations()).filter((a) => a.subtype === 'Highlight');
  await doc.destroy();
  return annots;
}

describe('one selection, one highlight', () => {
  it('keeps every line of the selection in a single highlight', () => {
    const h = highlightFromSelection(threeLines, { id: 'h1' });
    expect(h).toMatchObject({ id: 'h1', page: 2, kind: 'highlight', color: HIGHLIGHT_COLOR, text: threeLines.text });
    expect(h.rects).toHaveLength(3);
    expect(h.rect.x).toBeCloseTo(0.10);
    expect(h.rect.y).toBeCloseTo(0.20);
    expect(h.rect.w).toBeCloseTo(0.70);
    expect(h.rect.h).toBeCloseTo(0.08);
  });

  it('paints a box per line, and the single box of an older highlight', () => {
    expect(annotationBoxes(highlightFromSelection(threeLines, { id: 'h1' }))).toHaveLength(3);
    expect(annotationBoxes({ rect: { x: 0, y: 0, w: 1, h: 1 } })).toHaveLength(1);
    expect(annotationBoxes({})).toEqual([]);
  });

  it('ignores an empty selection', () => {
    expect(highlightFromSelection({ page: 1, rects: [] })).toBeNull();
    expect(highlightFromSelection({ page: 1, rects: [{ x: 0, y: 0, w: 0, h: 0.1 }] })).toBeNull();
    expect(highlightFromSelection(null)).toBeNull();
  });

  it('is one row in the Highlights panel', () => {
    const h = highlightFromSelection(threeLines, { id: 'h1' });
    const list = listHighlights([h], []);
    expect(list).toHaveLength(1);
    expect(splitHighlightDeletes(list).workspaceIds).toEqual(new Set(['h1']));
  });

  it('is saved as one PDF highlight with a quad per line', async () => {
    const h = { ...highlightFromSelection({ ...threeLines, page: 1 }, { id: 'h1' }) };
    const bytes = await writeWorkspaceIntoPdf(buildPdf({ pages: [{ text: 'Hello World' }] }), { annotations: [h] });
    const annots = await savedHighlights(bytes);
    expect(annots).toHaveLength(1);
    // pdf.js hands quads over flat: 8 numbers per line.
    expect(annots[0].quadPoints.length / 8).toBe(3);
  });
});

describe('highlights saved line by line before', () => {
  const lines = [
    { id: '10R', source: 'pdf', page: 1, fracY: 0.20, text: 'same passage' },
    { id: '11R', source: 'pdf', page: 1, fracY: 0.23, text: 'same passage' },
    { id: '12R', source: 'pdf', page: 1, fracY: 0.26, text: 'same passage' },
    { id: '13R', source: 'pdf', page: 1, fracY: 0.70, text: 'same passage' },
    { id: '14R', source: 'pdf', page: 1, fracY: 0.73, text: 'another one' },
  ];

  it('are grouped into the passage they came from', () => {
    const g = groupPassages(lines);
    expect(g.map((x) => x.ids)).toEqual([['10R', '11R', '12R'], ['13R'], ['14R']]);
  });

  it('are deleted together', () => {
    const { pdfRefs } = splitHighlightDeletes([groupPassages(lines)[0]]);
    expect(pdfRefs.map((r) => r.num)).toEqual([10, 11, 12]);
  });

  it('come out of the PDF together', async () => {
    // Three line-by-line highlights of one passage, as the app used to save them.
    const old = threeLines.rects.map((r, i) => ({
      id: `old${i}`, page: 1, kind: 'highlight', rect: r, text: threeLines.text,
    }));
    const bytes = await writeWorkspaceIntoPdf(buildPdf({ pages: [{ text: 'Hello World' }] }), { annotations: old });
    const before = await savedHighlights(bytes);
    expect(before).toHaveLength(3);
    const items = listHighlights([], before.map((a, i) => ({
      id: a.id, kind: 'highlight', page: 1, fracY: threeLines.rects[i].y, text: a.contentsObj.str,
    })));
    expect(items).toHaveLength(1);
    const { pdfRefs } = splitHighlightDeletes(items);
    expect(pdfRefs.every((r) => pdfRefFromId(`${r.num}R`))).toBe(true);
    const { bytes: after, removed } = await removePdfAnnotations(bytes, pdfRefs);
    expect(removed).toBe(3);
    expect(await savedHighlights(after)).toHaveLength(0);
  });
});
