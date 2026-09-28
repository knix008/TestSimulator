// Printing.
//
// Three kinds of book have to reach a printer, and each needs different work:
//   • reflowable text (EPUB, MOBI, FB2, Markdown, text) — the chosen chapters
//     are assembled into one print document whose @page rule carries the paper
//     size, orientation and margins the user picked;
//   • PDF — Electron's own window prints a PDF as a blank sheet, so the chosen
//     pages are rendered to images first;
//   • comics — the pages are images already.
//
// The same HTML that is sent to the printer drives the preview, so what the
// user sees is what comes out.
import { escapeHtml } from './html.js';

export const PAPER_SIZES = [
  { id: 'A4', label: 'A4', mm: [210, 297] },
  { id: 'Letter', label: 'Letter', mm: [215.9, 279.4] },
  { id: 'A5', label: 'A5', mm: [148, 210] },
  { id: 'B5', label: 'B5', mm: [176, 250] },
  { id: 'Legal', label: 'Legal', mm: [215.9, 355.6] },
  { id: 'A3', label: 'A3', mm: [297, 420] },
];

export function paperById(id) {
  return PAPER_SIZES.find((p) => p.id === id) || PAPER_SIZES[0];
}

/** The paper's size in mm, swapped for landscape. */
export function paperSizeMm(id, landscape) {
  const [w, h] = paperById(id).mm;
  return landscape ? [h, w] : [w, h];
}

export const PRINT_CSS = `
  html, body { margin: 0; background: #fff; color: #111; }
  body { font-family: var(--print-font, "Georgia", "Malgun Gothic", serif); }
  .chapter { page-break-after: always; break-after: page; }
  .chapter:last-child { page-break-after: auto; break-after: auto; }
  .chapter-title { font-size: 1.1em; opacity: 0.6; margin: 0 0 1em; }
  h1, h2, h3, h4 { line-height: 1.3; page-break-after: avoid; break-after: avoid; }
  p { orphans: 2; widows: 2; }
  img { max-width: 100%; height: auto; }
  pre { white-space: pre-wrap; background: #f4f4f4; padding: 0.6em; }
  blockquote { margin: 1em 1.5em; font-style: italic; }
  table { border-collapse: collapse; }
  td, th { border: 1px solid #bbb; padding: 0.3em 0.5em; }
  .sheet { page-break-after: always; break-after: page; display: flex; align-items: center; justify-content: center; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .sheet img { max-width: 100%; max-height: 100%; }
`;

/**
 * Builds the document that is printed (and previewed).
 *
 * @param {object} options
 *   - `chapters`   [{ label, html }] already-sanitized chapter HTML
 *   - `title`      document title, used for the print job's name
 *   - `paper`      paper id, `landscape`, `marginMm`
 *   - `fontFamily`, `fontSize` (px), `lineHeight`
 *   - `showTitles` print each chapter's name above it
 */
export function buildPrintHtml({
  chapters = [], title = '', paper = 'A4', landscape = false, marginMm = 14,
  fontFamily = '', fontSize = 12, lineHeight = 1.6, showTitles = true,
} = {}) {
  const [w, h] = paperSizeMm(paper, landscape);
  const margin = Math.max(0, Math.min(40, Number(marginMm) || 0));
  const body = chapters.map((chapter) => {
    const heading = showTitles && chapter.label
      ? `<p class="chapter-title">${escapeHtml(chapter.label)}</p>`
      : '';
    return `<section class="chapter">${heading}${chapter.html || ''}</section>`;
  }).join('\n');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title || 'Print')}</title>
<style>
  @page { size: ${w}mm ${h}mm; margin: ${margin}mm; }
  :root { --print-font: ${fontFamily ? `'${fontFamily}', ` : ''}"Georgia", "Malgun Gothic", serif; }
  body { font-size: ${Number(fontSize) || 12}pt; line-height: ${Number(lineHeight) || 1.6}; }
${PRINT_CSS}
</style></head>
<body>${body}</body></html>`;
}

/** The same, for a book made of page images (PDF pages, comic pages). */
export function buildImagePrintHtml({ images = [], title = '', paper = 'A4', landscape = false, marginMm = 8 } = {}) {
  const [w, h] = paperSizeMm(paper, landscape);
  const margin = Math.max(0, Math.min(40, Number(marginMm) || 0));
  const sheets = images.map((src) => `<div class="sheet"><img src="${src}" alt=""></div>`).join('\n');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title || 'Print')}</title>
<style>
  @page { size: ${w}mm ${h}mm; margin: ${margin}mm; }
  html, body { margin: 0; background: #fff; }
  .sheet { page-break-after: always; break-after: page; display: flex; align-items: center; justify-content: center; height: calc(${h}mm - ${margin * 2}mm); }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .sheet img { max-width: 100%; max-height: 100%; }
</style></head>
<body>${sheets}</body></html>`;
}

/**
 * Renders PDF pages to JPEG data URLs.
 * Electron prints a PDF shown in a window as blank paper, so the pages are
 * rasterised here and printed as images instead.
 */
export async function renderPdfPagesToImages({ doc, pages, rotation = 0, scale = 2, quality = 0.92, onProgress }) {
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    const number = pages[i];
    onProgress?.({ done: i, total: pages.length });
    const page = await doc.getPage(number);
    const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, background: '#ffffff' }).promise;
    out.push(canvas.toDataURL('image/jpeg', quality));
    page.cleanup();
  }
  onProgress?.({ done: pages.length, total: pages.length });
  return out;
}

/** Collects the chapters a print scope selects, as printable HTML. */
export function chaptersForPrint(book, pages, loadSection) {
  const out = [];
  for (const page of pages) {
    const index = page - 1;
    const section = book.sections[index];
    if (!section) continue;
    const loaded = loadSection(index);
    out.push({
      label: section.label && section.label !== String(page) ? `${page}. ${section.label}` : `${page}`,
      html: loaded?.html || '',
    });
  }
  return out;
}

/**
 * Replaces the book's own blob: image URLs with data: URLs.
 *
 * A blob URL belongs to the document that created it. Both the print preview
 * (which renders in its own popup window) and the actual print job (an offscreen
 * window loading a temporary file) are other documents, so an image left as a
 * blob URL simply would not appear. Only the pictures of the pages being printed
 * are converted, when they are printed.
 */
export async function inlineImages(html) {
  const source = String(html || '');
  const urls = [...new Set(
    [...source.matchAll(/src="(blob:[^"]+)"/g)].map((match) => match[1])
  )];
  if (!urls.length) return source;

  let out = source;
  for (const url of urls) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error || new Error('The image could not be read.'));
        reader.readAsDataURL(blob);
      });
      out = out.split(url).join(dataUrl);
    } catch {
      // A picture that cannot be read is left as it is: the rest still prints.
    }
  }
  return out;
}

/** A data URL is fine for the preview; the printer gets the same string. */
export function previewScale({ paper, landscape, boxWidth, boxHeight }) {
  const [w, h] = paperSizeMm(paper, landscape);
  const byWidth = (Number(boxWidth) || 1) / w;
  const byHeight = (Number(boxHeight) || 1) / h;
  return Math.max(0.05, Math.min(byWidth, byHeight));
}
