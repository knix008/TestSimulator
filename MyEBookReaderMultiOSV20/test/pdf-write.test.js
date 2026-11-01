import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName } from 'pdf-lib';
import {
  rgbFromCss, fracRectToPdf, bytesToBase64, base64ToBytes, asciiFileName,
  suggestedPdfCopyName,
  attachmentRecord, workspaceHasPdfMarkup, writeWorkspaceIntoPdf,
} from '../src/lib/pdf-write.js';

async function blankPdf() {
  const doc = await PDFDocument.create();
  doc.addPage([400, 600]);
  doc.addPage([400, 600]);
  return doc.save();
}

describe('colour and rect conversion', () => {
  it('reads rgba and hex into 0..1 RGB', () => {
    expect(rgbFromCss('rgba(255, 214, 0, 0.42)')).toEqual([1, 214 / 255, 0]);
    expect(rgbFromCss('#ffd600')).toEqual([1, 214 / 255, 0]);
    expect(rgbFromCss('#fd0')).toEqual([1, 221 / 255, 0]);
  });

  it('flips a top-left fraction rect into PDF space', () => {
    const r = fracRectToPdf({ x: 0.1, y: 0.25, w: 0.2, h: 0.1 }, 400, 600);
    expect(r.x).toBeCloseTo(40);
    expect(r.w).toBeCloseTo(80);
    expect(r.h).toBeCloseTo(60);
    expect(r.y).toBeCloseTo(600 - 150 - 60);
  });
});

describe('bytes helpers', () => {
  it('round-trips attachment bytes through base64', () => {
    const src = new Uint8Array([0, 1, 2, 250, 255]);
    expect(base64ToBytes(bytesToBase64(src))).toEqual(src);
  });

  it('sanitises a file name for the PDF Filespec /F string', () => {
    expect(asciiFileName('memo/한글.txt')).toBe('memo___.txt');
  });

  it('suggests a different PDF name so the original is not overwritten', () => {
    expect(suggestedPdfCopyName('report.pdf')).toBe('report-annotated.pdf');
    expect(suggestedPdfCopyName('report-annotated.pdf')).toBe('report-annotated.pdf');
  });
});

describe('workspaceHasPdfMarkup', () => {
  it('is true when a comment, bookmark or attachment is present', () => {
    expect(workspaceHasPdfMarkup({})).toBe(false);
    expect(workspaceHasPdfMarkup({ annotations: [{ kind: 'note' }] })).toBe(true);
    expect(workspaceHasPdfMarkup({ bookmarks: [{ page: 1 }] })).toBe(true);
    expect(workspaceHasPdfMarkup({ attachments: [{ name: 'a.txt' }] })).toBe(true);
  });
});

describe('writeWorkspaceIntoPdf', () => {
  it('embeds a highlight, a sticky note, a bookmark and a file', async () => {
    const src = await blankPdf();
    const att = attachmentRecord({
      page: 1,
      name: 'note.txt',
      mime: 'text/plain',
      bytes: new TextEncoder().encode('hello'),
      y: 0.2,
    });
    const out = await writeWorkspaceIntoPdf(src, {
      annotations: [
        { id: 'h1', page: 1, kind: 'highlight', rect: { x: 0.1, y: 0.2, w: 0.4, h: 0.05 }, text: 'hi', color: 'rgba(255,214,0,0.42)' },
        { id: 'n1', page: 1, kind: 'note', rects: [{ x: 0.1, y: 0.4, w: 0.3, h: 0.06 }], text: 'remember this' },
      ],
      bookmarks: [{ id: 'b1', page: 2, label: 'Chapter two', y: 0.3 }],
      attachments: [att],
    });

    expect(out[0]).toBe(0x25); // %
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);

    const annots = doc.getPage(0).node.Annots();
    expect(annots).toBeTruthy();
    expect(annots.size()).toBeGreaterThanOrEqual(3);

    const kinds = [];
    for (let i = 0; i < annots.size(); i++) {
      const annot = doc.context.lookup(annots.get(i));
      kinds.push(annot.get(PDFName.of('Subtype'))?.toString());
    }
    expect(kinds).toEqual(expect.arrayContaining(['/Highlight', '/Text', '/FileAttachment']));

    const outlines = doc.catalog.lookup(PDFName.of('Outlines'));
    expect(outlines).toBeTruthy();
    expect(outlines.get(PDFName.of('Count')).asNumber()).toBe(1);
    const first = doc.context.lookup(outlines.get(PDFName.of('First')));
    expect(first.get(PDFName.of('Title')).decodeText()).toBe('Chapter two');
  });

  it('keeps the original page count when the workspace is empty', async () => {
    const src = await blankPdf();
    const out = await writeWorkspaceIntoPdf(src, {});
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).node.Annots()).toBeUndefined();
  });
});
