// Export the merged Markdown to Markdown / HTML / PDF / Word (.docx).
// Shared by the Web and Electron builds; platform.js handles the actual write.
import {
  toStandaloneHtml, buildMergedMarkdownDocument, documentExportBaseName,
  sanitizeExportName, DEFAULT_EXPORT_SETTINGS,
} from './markdown';
import { saveText, exportPdf as platformExportPdf, computeTocPageMap } from './platform';

// Resolve the export base name: user-provided name wins, else first heading.
function baseNameFor(markdown, baseName) {
  return sanitizeExportName(baseName) || documentExportBaseName(markdown);
}

// Resolve real TOC page numbers by paginating the document once (Electron only).
// We render the same A4 layout the export uses, learn which page each heading
// lands on, then bake those numbers into the index. Returns null when the index
// is off or pagination is unavailable (web), leaving the TOC without numbers.
async function resolveTocPageMap(markdown, base, s) {
  if (!s.tocPage || s.tocPageNumbers === false) return null;
  const measureHtml = toStandaloneHtml(markdown, base, { ...s, forWord: false, tocPageNumbers: true, tocPageMap: null });
  return computeTocPageMap(measureHtml);
}

export async function exportMarkdown(markdown, baseName, opts = {}) {
  const base = baseNameFor(markdown, baseName);
  return saveText({
    defaultName: `${base}.md`,
    content: buildMergedMarkdownDocument(markdown, { ...opts, title: base }),
    filters: [{ name: 'Markdown', extensions: ['md'] }],
    defaultDir: opts.defaultDir,
  });
}

export async function exportHtml(markdown, settings = {}, baseName) {
  const s = { ...DEFAULT_EXPORT_SETTINGS, ...settings };
  const base = baseNameFor(markdown, baseName);
  const pageMap = await resolveTocPageMap(markdown, base, s);
  return saveText({
    defaultName: `${base}.html`,
    content: toStandaloneHtml(markdown, base, { ...s, tocPageNumbers: !!pageMap, tocPageMap: pageMap }),
    filters: [{ name: 'HTML', extensions: ['html'] }],
    defaultDir: s.defaultDir,
  });
}

export async function exportPdf(markdown, settings = {}, baseName) {
  const s = { ...DEFAULT_EXPORT_SETTINGS, ...settings, tocPageNumbers: settings.tocPage !== false };
  const base = baseNameFor(markdown, baseName);
  // Bake the page numbers from a pagination pass so they are present even if the
  // live paged.js fill during printing misses; the print pass still fills any
  // remaining empty entries and renders the header/footer margin boxes.
  const pageMap = await resolveTocPageMap(markdown, base, s);
  return platformExportPdf({
    html: toStandaloneHtml(markdown, base, { ...s, tocPageMap: pageMap }),
    defaultName: `${base}.pdf`,
    // `paged` engine renders TOC page numbers + header/footer via CSS;
    // `fallback` templates are used if paged.js is unavailable.
    pdfOptions: { paged: true, fallback: pdfHeaderFooterOptions(s) },
    defaultDir: s.defaultDir,
  });
}

export async function exportWord(markdown, settings = {}, baseName) {
  const s = { ...DEFAULT_EXPORT_SETTINGS, ...settings };
  const base = baseNameFor(markdown, baseName);
  // Word cannot run the paged.js layout, so resolve the TOC page numbers up
  // front and bake them into the index as static, right-aligned text.
  const pageMap = await resolveTocPageMap(markdown, base, s);
  // Word opens an MHT ("Single File Web Page") saved as .doc and reliably
  // renders the cover, the index (page breaks) and images. Base64 images are
  // emitted as separate MIME parts (Word does not render inline data: images).
  const html = toStandaloneHtml(markdown, base, { ...s, forWord: true, tocPageNumbers: !!pageMap, tocPageMap: pageMap });
  return saveText({
    defaultName: `${base}.doc`,
    content: buildWordMht(html),
    filters: [{ name: 'Word Document', extensions: ['doc'] }],
    defaultDir: s.defaultDir,
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
  const boundary = '----=_NextPart_MyMeeting';
  const baseUrl = 'file:///C:/mymeeting/';
  const CRLF = '\r\n';
  let idx = 0;
  const images = [];

  const htmlOut = html.replace(/src="data:(image\/[a-z0-9.+-]+);base64,([^"]+)"/gi, (_m, mime, data) => {
    idx += 1;
    const name = `image${String(idx).padStart(3, '0')}.${MIME_EXT[mime.toLowerCase()] || 'png'}`;
    images.push({ name, mime, data: data.replace(/\s+/g, '') });
    return `src="${name}"`;
  });

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
  if (!s.headerText && !s.footerText && !s.showPageNumber) {
    return { displayHeaderFooter: false, margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } };
  }
  const family = s.fontFamily ? `'${s.fontFamily}', sans-serif` : 'sans-serif';

  const top = { left: '', center: '', right: '' };
  const bottom = { left: '', center: '', right: '' };
  if (s.headerText) top[s.headerAlign] = esc(s.headerText);
  if (s.footerText) bottom[s.footerAlign] = esc(s.footerText);
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
