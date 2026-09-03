// Export the merged Markdown to Markdown / HTML / PDF / Word (.docx).
// Shared by the Web and Electron builds; platform.js handles the actual write.
import {
  toStandaloneHtml, buildMergedMarkdownDocument, documentExportBaseName,
  sanitizeExportName, DEFAULT_EXPORT_SETTINGS,
} from './markdown';
import { saveText, saveBlob, exportPdf as platformExportPdf } from './platform';

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
  const html = toStandaloneHtml(markdown, base, settings);
  // Lazy-loaded so the docx converter stays out of the initial bundle.
  const { asBlob } = await import('html-docx-js-typescript');
  const out = await asBlob(html);
  const blob = out instanceof Blob ? out : new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  return saveBlob({
    defaultName: `${base}.docx`,
    blob,
    filters: [{ name: 'Word', extensions: ['docx'] }],
  });
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
