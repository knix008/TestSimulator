// A highlight saved into the PDF must show up when the file is opened again:
// pdf.js has to find the annotation and draw it on the page canvas.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildPdf } from './fixtures/pdf.js';
import { writeWorkspaceIntoPdf } from '../src/lib/pdf-write.js';
import { HIGHLIGHT_COLOR } from '../src/lib/view.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.resolve(import.meta.dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs'),
).href;

async function open(bytes) {
  return pdfjsLib.getDocument({ data: bytes.slice(), disableWorker: true, isEvalSupported: false }).promise;
}

const highlight = {
  id: 'h1',
  page: 1,
  kind: 'highlight',
  rects: [{ x: 0.1, y: 0.2, w: 0.4, h: 0.05 }, { x: 0.1, y: 0.26, w: 0.3, h: 0.05 }],
  text: 'Hello World',
  color: HIGHLIGHT_COLOR,
};

describe('highlight saved into the PDF', () => {
  it('reopens as a Highlight annotation with its colour and quads', async () => {
    const saved = await writeWorkspaceIntoPdf(buildPdf({ pages: [{ text: 'Hello World' }] }), {
      annotations: [highlight],
    });
    const doc = await open(saved);
    const annots = await (await doc.getPage(1)).getAnnotations();
    const hl = annots.find((a) => a.subtype === 'Highlight');
    expect(hl).toBeTruthy();
    expect(hl.quadPoints?.length).toBeGreaterThan(0);
    expect(Array.from(hl.color)).toEqual([255, 214, 0]);
    expect(hl.hasAppearance).toBe(true);
    await doc.destroy();
  });

  it('is drawn on the page canvas, not only listed', async () => {
    const saved = await writeWorkspaceIntoPdf(buildPdf({ pages: [{ text: 'Hello World' }] }), {
      annotations: [highlight],
    });
    const doc = await open(saved);
    const page = await doc.getPage(1);
    const ops = await page.getOperatorList({ annotationMode: pdfjsLib.AnnotationMode.ENABLE_FORMS });
    const begins = ops.fnArray.filter((fn) => fn === pdfjsLib.OPS.beginAnnotation).length;
    expect(begins).toBe(1);
    await doc.destroy();
  });

  it('keeps earlier highlights when saving a second time', async () => {
    const first = await writeWorkspaceIntoPdf(buildPdf({ pages: [{ text: 'Hello World' }] }), {
      annotations: [highlight],
    });
    const second = await writeWorkspaceIntoPdf(first, {
      annotations: [{ ...highlight, id: 'h2', rects: [{ x: 0.5, y: 0.6, w: 0.2, h: 0.04 }] }],
    });
    const doc = await open(second);
    const annots = await (await doc.getPage(1)).getAnnotations();
    expect(annots.filter((a) => a.subtype === 'Highlight')).toHaveLength(2);
    await doc.destroy();
  });
});
