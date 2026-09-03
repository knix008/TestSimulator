// Export the merged Markdown to Markdown / HTML / PDF / Word (.docx).
// Shared by the Web and Electron builds; platform.js handles the actual write.
import {
  toStandaloneHtml, buildMergedMarkdownDocument, documentExportBaseName,
  sanitizeExportName, DEFAULT_EXPORT_SETTINGS,
} from './markdown';
import { saveText, exportPdf as platformExportPdf } from './platform';

// Resolve the export base name: user-provided name wins, else first heading.
function baseNameFor(markdown, baseName) {
  return sanitizeExportName(baseName) || documentExportBaseName(markdown);
}

export async function exportMarkdown(markdown, baseName, opts = {}) {
  const base = baseNameFor(markdown, baseName);
  return saveText({
    defaultName: `${base}.md`,
    content: buildMergedMarkdownDocument(markdown, { ...opts, title: base }),
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
}

export async function exportHtml(markdown, settings = {}, baseName) {
  const base = baseNameFor(markdown, baseName);
  return saveText({
    defaultName: `${base}.html`,
    content: toStandaloneHtml(markdown, base, settings),
    filters: [{ name: 'HTML', extensions: ['html'] }],
  });
}

export async function exportPdf(markdown, settings = {}, baseName) {
  // TOC page numbers are resolved by paged.js during PDF rendering.
  const s = { ...DEFAULT_EXPORT_SETTINGS, ...settings, tocPageNumbers: settings.tocPage !== false };
  const base = baseNameFor(markdown, baseName);
  return platformExportPdf({
    html: toStandaloneHtml(markdown, base, s),
    defaultName: `${base}.pdf`,
    // `paged` engine renders TOC page numbers + header/footer via CSS;
    // `fallback` templates are used if paged.js is unavailable.
    pdfOptions: { paged: true, fallback: pdfHeaderFooterOptions(s) },
  });
}

export async function exportWord(markdown, settings = {}, baseName) {
  const base = baseNameFor(markdown, baseName);
  // Word opens an MHT ("Single File Web Page") saved as .doc and reliably
  // renders the cover, the index (page breaks) and images. Base64 images are
  // emitted as separate MIME parts (Word does not render inline data: images).
  const html = toStandaloneHtml(markdown, base, { ...settings, forWord: true });
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
