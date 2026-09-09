// Export the merged Markdown to Markdown / HTML / PDF / Word (.docx).
// Shared by the Web and Electron builds; platform.js handles the actual write.
import {
  toStandaloneHtml, buildMergedMarkdownDocument, documentExportBaseName,
  sanitizeExportName, splitDocument, getFigures, PAGE_CONTENT_PX, DEFAULT_EXPORT_SETTINGS,
  runningHeaderText, runningFooterText,
} from './markdown';
import { imageDisplaySrc } from './images';
import {
  saveText, exportPdf as platformExportPdf, computeTocPageMap, printDocument as platformPrint,
  canWriteInPlace, writeTextTo,
} from './platform';

// Resolve the export base name: user-provided name wins, else first heading.
function baseNameFor(markdown, baseName) {
  return sanitizeExportName(baseName) || documentExportBaseName(markdown);
}

// ── Fitting images to the page ────────────────────────────
// A4 content box at 96dpi (the width is shared with markdown.js, which uses it
// to fit wide code blocks), with a little height held back for a caption.
const PAGE_W_PX = PAGE_CONTENT_PX;
const PAGE_H_PX = Math.round((297 - 36) * 96 / 25.4) - 100; // ≈ 887

// Reads the intrinsic pixel size of every image in the document. Runs in the
// renderer, where data: URIs decode straight from memory.
async function measureImages(markdown) {
  const srcs = [...new Set(getFigures(markdown).map((f) => imageDisplaySrc(f.src)).filter(Boolean))];
  const sizes = new Map();
  await Promise.all(srcs.map((src) => new Promise((resolve) => {
    const probe = new Image();
    probe.onload = () => { sizes.set(src, { w: probe.naturalWidth, h: probe.naturalHeight }); resolve(); };
    probe.onerror = () => resolve();
    probe.src = src;
  })));
  return sizes;
}

// Pins each image to a size that fits the page, as explicit width/height
// attributes. This is what keeps pictures inside the margins:
//   • Word ignores the `img{max-width:100%}` stylesheet rule entirely and prints
//     at the image's native pixel size, so a screenshot runs off the page;
//   • Chromium/paged.js honour max-width but cannot shrink an over-TALL image,
//     which then spills past the bottom margin.
// A `width="60%"` set by the figure size control is resolved against the page
// width here, so the chosen size is what gets printed.
function fitImages(html, sizes) {
  if (!sizes.size) return html;
  return html.replace(/<img\b([^>]*?)\/?>/gi, (whole, attrs) => {
    const m = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    const nat = m && sizes.get(m[1] ?? m[2]);
    if (!nat || !nat.w || !nat.h) return whole;
    const pct = /\bwidth\s*=\s*["']?(\d+)%/i.exec(attrs);
    let w = pct ? PAGE_W_PX * (Number(pct[1]) / 100) : Math.min(nat.w, PAGE_W_PX);
    let h = w * (nat.h / nat.w);
    if (h > PAGE_H_PX) { h = PAGE_H_PX; w = h * (nat.w / nat.h); }
    if (w > PAGE_W_PX) { w = PAGE_W_PX; h = w * (nat.h / nat.w); }
    const rest = attrs
      .replace(/\swidth\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\sheight\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
    // The attributes are what Word obeys; `height:auto` lets a browser keep the
    // aspect ratio if `max-width` shrinks the picture further.
    return `<img${rest} width="${Math.round(w)}" height="${Math.round(h)}"`
      + ` style="max-width:100%;height:auto">`;
  });
}

// Resolve real page numbers by paginating the document once (Electron only). We
// render the same A4 layout the export uses, learn which page each heading and
// each figure lands on, then bake those numbers into the index pages. Returns
// null when both index pages are off or pagination is unavailable (web),
// leaving the indexes without numbers.
async function resolvePageMap(markdown, base, s, sizes) {
  // Only the index blocks the document actually carries need page numbers.
  const doc = splitDocument(markdown);
  const wantToc = !!doc.toc && s.tocPageNumbers !== false;
  const wantFigures = !!doc.figures && s.figurePageNumbers !== false;
  if (!wantToc && !wantFigures) return null;
  // Measure the *fitted* layout — page numbers resolved against oversized
  // images would land on the wrong pages.
  const measureHtml = fitImages(toStandaloneHtml(markdown, base, {
    ...s, forWord: false, tocPageNumbers: true, figurePageNumbers: true,
    tocPageMap: null, figurePageMap: null,
  }), sizes);
  return computeTocPageMap(measureHtml);
}

export async function exportMarkdown(markdown, baseName) {
  const base = baseNameFor(markdown, baseName);
  return saveText({
    defaultName: `${base}.md`,
    content: buildMergedMarkdownDocument(markdown),
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
}

// Save over the .md the document already lives in — no dialog, same bytes an
// export would write. Returns the path, or null when the runtime cannot write
// in place (the web build), so the caller can fall back to exportMarkdown().
export async function saveMarkdownTo(markdown, filePath) {
  if (!canWriteInPlace || !filePath) return null;
  return writeTextTo(filePath, buildMergedMarkdownDocument(markdown));
}

export async function exportHtml(markdown, settings = {}, baseName) {
  const s = { ...DEFAULT_EXPORT_SETTINGS, ...settings };
  const base = baseNameFor(markdown, baseName);
  const sizes = await measureImages(markdown);
  const pageMap = await resolvePageMap(markdown, base, s, sizes);
  return saveText({
    defaultName: `${base}.html`,
    content: fitImages(toStandaloneHtml(markdown, base, {
      ...s,
      tocPageNumbers: !!pageMap, tocPageMap: pageMap,
      figurePageNumbers: !!pageMap, figurePageMap: pageMap,
    }), sizes),
    filters: [{ name: 'HTML', extensions: ['html'] }],
  });
}

export async function exportPdf(markdown, settings = {}, baseName) {
  const s = {
    ...DEFAULT_EXPORT_SETTINGS, ...settings,
    tocPageNumbers: settings.tocPage !== false,
    figurePageNumbers: settings.figurePage !== false,
  };
  const base = baseNameFor(markdown, baseName);
  // Bake the page numbers from a pagination pass so they are present even if the
  // live paged.js fill during printing misses; the print pass still fills any
  // remaining empty entries and renders the header/footer margin boxes.
  const sizes = await measureImages(markdown);
  const pageMap = await resolvePageMap(markdown, base, s, sizes);
  return platformExportPdf({
    html: fitImages(
      toStandaloneHtml(markdown, base, { ...s, tocPageMap: pageMap, figurePageMap: pageMap }),
      sizes,
    ),
    defaultName: `${base}.pdf`,
    // `paged` engine renders TOC page numbers + header/footer via CSS;
    // `fallback` templates are used if paged.js is unavailable.
    pdfOptions: { paged: true, fallback: pdfHeaderFooterOptions(s) },
  });
}

// Print the document as the preview lays it out. Deliberately the very same
// HTML the PDF export renders — cover, contents with resolved page numbers,
// figure index, header/footer and page breaks — so the paper matches the screen
// and the PDF. No file is written; the print dialog decides where it goes.
export async function printDocument(markdown, settings = {}, baseName) {
  const s = {
    ...DEFAULT_EXPORT_SETTINGS, ...settings,
    tocPageNumbers: settings.tocPage !== false,
    figurePageNumbers: settings.figurePage !== false,
  };
  const base = baseNameFor(markdown, baseName);
  const sizes = await measureImages(markdown);
  const pageMap = await resolvePageMap(markdown, base, s, sizes);
  return platformPrint({
    html: fitImages(
      toStandaloneHtml(markdown, base, { ...s, tocPageMap: pageMap, figurePageMap: pageMap }),
      sizes,
    ),
    pdfOptions: { paged: true, fallback: pdfHeaderFooterOptions(s) },
  });
}

export async function exportWord(markdown, settings = {}, baseName) {
  const s = { ...DEFAULT_EXPORT_SETTINGS, ...settings };
  const base = baseNameFor(markdown, baseName);
  // Word cannot run the paged.js layout, so resolve the index page numbers up
  // front and bake them in as static, right-aligned text.
  const sizes = await measureImages(markdown);
  const pageMap = await resolvePageMap(markdown, base, s, sizes);
  // Word opens an MHT ("Single File Web Page") saved as .doc and reliably
  // renders the cover, the index (page breaks) and images. Base64 images are
  // emitted as separate MIME parts (Word does not render inline data: images).
  const html = fitImages(toStandaloneHtml(markdown, base, {
    ...s, forWord: true,
    tocPageNumbers: !!pageMap, tocPageMap: pageMap,
    figurePageNumbers: !!pageMap, figurePageMap: pageMap,
  }), sizes);
  return saveText({
    defaultName: `${base}.doc`,
    content: buildWordMht(html),
    filters: [{ name: 'Word Document', extensions: ['doc'] }],
  });
}

// ── Word MHT (multipart/related) builder ──────────────────
const MIME_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/bmp': 'bmp', 'image/svg+xml': 'svg', 'image/tiff': 'tif', 'image/x-icon': 'ico', 'image/avif': 'avif',
};

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}

const wrap76 = (b64) => b64.replace(/(.{76})/g, '$1\r\n');

function buildWordMht(html) {
  const boundary = '----=_NextPart_MarkDownMerge';
  const baseUrl = 'file:///C:/markdownmerge/';
  const CRLF = '\r\n';
  let idx = 0;
  const images = [];

  // Both quote styles: raw <img src='data:…'> written by hand in the Markdown
  // passes through marked untouched, and Word needs every image as a MIME part.
  const htmlOut = html.replace(
    /src=("|')data:(image\/[a-z0-9.+-]+);base64,([^"']+)\1/gi,
    (_m, _q, mime, data) => {
      idx += 1;
      const name = `image${String(idx).padStart(3, '0')}.${MIME_EXT[mime.toLowerCase()] || 'png'}`;
      images.push({ name, mime, data: data.replace(/\s+/g, '') });
      return `src="${name}"`;
    },
  );

  let out = 'MIME-Version: 1.0' + CRLF;
  out += `Content-Type: multipart/related; type="text/html"; boundary="${boundary}"` + CRLF + CRLF;
  out += `--${boundary}` + CRLF;
  out += 'Content-Type: text/html; charset="utf-8"' + CRLF;
  out += 'Content-Transfer-Encoding: base64' + CRLF;
  out += `Content-Location: ${baseUrl}document.html` + CRLF + CRLF;
  out += wrap76(utf8ToBase64(htmlOut)) + CRLF;
  for (const img of images) {
    out += `--${boundary}` + CRLF;
    out += `Content-Type: ${img.mime}` + CRLF;
    out += 'Content-Transfer-Encoding: base64' + CRLF;
    out += `Content-Location: ${baseUrl}${img.name}` + CRLF + CRLF;
    out += wrap76(img.data) + CRLF;
  }
  out += `--${boundary}--` + CRLF;
  return out;
}

// ── Electron printToPDF header/footer templates ───────────
// Chromium requires explicit font-size and non-zero page margins for the
// header/footer to render. We lay out three cells (left/center/right) and drop
// the header text, footer text and page-number counter into the chosen slots.
function pdfHeaderFooterOptions(s) {
  const headerText = runningHeaderText(s);
  const footerText = runningFooterText(s);
  if (!headerText && !footerText && !s.showPageNumber) {
    return { displayHeaderFooter: false, margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } };
  }
  const family = s.fontFamily ? `'${s.fontFamily}', sans-serif` : 'sans-serif';

  const top = { left: '', center: '', right: '' };
  const bottom = { left: '', center: '', right: '' };
  if (headerText) top[s.headerAlign] = esc(headerText);
  if (footerText) bottom[s.footerAlign] = esc(footerText);
  if (s.showPageNumber) {
    const [row, col] = s.pageNumberPos.split('-');
    (row === 'top' ? top : bottom)[col] = '<span class="pageNumber"></span>';
  }

  return {
    displayHeaderFooter: true,
    headerTemplate: rowTemplate(top, family),
    footerTemplate: rowTemplate(bottom, family),
    margins: { top: 0.7, bottom: 0.7, left: 0.6, right: 0.6 },
  };
}

function rowTemplate(cells, family) {
  return `<div style="width:100%;font-size:9px;color:#555;padding:0 12mm;font-family:${family};">
    <div style="display:flex;width:100%;">
      <span style="flex:1;text-align:left;">${cells.left}</span>
      <span style="flex:1;text-align:center;">${cells.center}</span>
      <span style="flex:1;text-align:right;">${cells.right}</span>
    </div></div>`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
