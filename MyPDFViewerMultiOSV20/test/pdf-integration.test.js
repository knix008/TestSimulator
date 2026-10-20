import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildPdf, pdfWithJunkPrefix } from './fixtures/pdf.js';
import { looksLikePdf } from '../src/lib/workspace.js';
import { getPageText, searchDocument, getDocumentInfo, getOutline, destToLocation, getPageLinks } from '../src/lib/pdf.js';

const workerSrc = pathToFileURL(
  path.resolve(import.meta.dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs'),
).href;
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const fontsUrl = pathToFileURL(
  path.resolve(import.meta.dirname, '..', 'public', 'pdfjs', 'standard_fonts') + path.sep,
).href;

async function open(bytes) {
  const task = pdfjsLib.getDocument({
    data: bytes.slice(),
    disableWorker: true,
    useSystemFonts: true,
    isEvalSupported: false,
    standardFontDataUrl: fontsUrl,
  });
  return task.promise;
}

describe('real pdf.js against a generated fixture', () => {
  it('opens a single-page document and reads its text', async () => {
    const bytes = buildPdf({ pages: [{ text: 'Hello World' }], title: 'Sample', author: 'Tester' });
    expect(looksLikePdf(bytes)).toBe(true);
    const doc = await open(bytes);
    expect(doc.numPages).toBe(1);
    const page = await doc.getPage(1);
    const text = await getPageText(page);
    expect(text.replace(/\s+/g, ' ')).toContain('Hello World');
    const info = await getDocumentInfo(doc);
    expect(info.title).toBe('Sample');
    expect(info.author).toBe('Tester');
    await doc.destroy();
  });

  it('opens a multi-page document and searches across pages', async () => {
    const bytes = buildPdf({
      pages: [
        { text: 'Alpha page one' },
        { text: 'Bravo unique-token here' },
        { text: 'Charlie page three' },
      ],
    });
    const doc = await open(bytes);
    expect(doc.numPages).toBe(3);
    const hits = await searchDocument(doc, 'unique-token');
    expect(hits).toHaveLength(1);
    expect(hits[0].page).toBe(2);
    expect(hits[0].match.toLowerCase()).toBe('unique-token');
    expect(await searchDocument(doc, 'page')).toHaveLength(2);
    await doc.destroy();
  });

  it('reads an outline when the fixture includes one', async () => {
    const bytes = buildPdf({ pages: [{ text: 'Chapter One' }], withOutline: true });
    const doc = await open(bytes);
    const outline = await getOutline(doc);
    expect(outline.length).toBeGreaterThanOrEqual(1);
    expect(outline[0].title).toContain('Chapter One');
    const loc = await destToLocation(doc, outline[0].dest);
    expect(loc?.page).toBe(1);
    expect(loc?.pdfTop).toBe(792);
    await doc.destroy();
  });

  it('exposes in-page TOC dest and URI links from annotations', async () => {
    const bytes = buildPdf({
      pages: [{ text: 'Contents' }, { text: 'Chapter body' }],
      withLinks: true,
    });
    const doc = await open(bytes);
    const page = await doc.getPage(1);
    const links = await getPageLinks(page, page.getViewport({ scale: 1 }));
    expect(links.length).toBeGreaterThanOrEqual(2);
    const destLink = links.find((l) => l.dest);
    const uriLink = links.find((l) => l.url);
    expect(destLink).toBeTruthy();
    expect(uriLink?.url).toContain('example.com');
    const loc = await destToLocation(doc, destLink.dest);
    expect(loc?.page).toBe(2);
    expect(loc?.pdfTop).toBe(720);
    expect(destLink.rect.width).toBeGreaterThan(0);
    expect(destLink.rect.height).toBeGreaterThan(0);
    await doc.destroy();
  });

  it('still opens a PDF that has junk bytes before %PDF-', async () => {
    const bytes = pdfWithJunkPrefix(buildPdf({ pages: [{ text: 'Preamble' }] }));
    expect(looksLikePdf(bytes)).toBe(true);
    const doc = await open(bytes);
    expect(doc.numPages).toBe(1);
    const text = await getPageText(await doc.getPage(1));
    expect(text).toContain('Preamble');
    await doc.destroy();
  });

  it('reports page size in PDF points (US Letter)', async () => {
    const doc = await open(buildPdf());
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    expect(vp.width).toBe(612);
    expect(vp.height).toBe(792);
    await doc.destroy();
  });
});
