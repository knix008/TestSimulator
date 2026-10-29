'use strict';

// Report export: document model -> .docx / .xlsx / .pdf / .pptx / .md / .html / .csv, zero dependencies.
//
//   exportDocument(model, format, opts)        -> Buffer
//   exportWithInfo(model, format, opts)        -> { buffer, mimeType, extension, warnings }
//   exportReportHtml(html, format, opts)       -> Buffer   (HTML from core/platform/reports.js)
//   exportReport(kind, analysis, format, opts) -> { buffer, fileName, mimeType, extension, warnings }
//
// opts (all optional): lang 'en'|'ko', creator, date, and for PDF fontPath, boldFontPath,
// fontFace, searchSystemFonts (false = only fontPath), compress (false = readable streams);
// for XLSX summarySheet (false = tables only); for exportReportHtml csv (use this CSV text as is);
// for exportReport glossary (true = a glossary of the report's terms at the end, core/report-glossary.js).

const model = require('./model');
const { toDocx, MIME: DOCX_MIME } = require('./docx');
const { toXlsx, MIME: XLSX_MIME } = require('./xlsx');
const { renderPdf } = require('./pdf');
const { toPptx, MIME: PPTX_MIME } = require('./pptx');
const { toMarkdown } = require('./markdown');

const FORMATS = {
  docx: { mimeType: DOCX_MIME, extension: '.docx', label: { en: 'Word document', ko: 'Word 문서' } },
  xlsx: { mimeType: XLSX_MIME, extension: '.xlsx', label: { en: 'Excel workbook', ko: 'Excel 통합 문서' } },
  pdf: { mimeType: 'application/pdf', extension: '.pdf', label: { en: 'PDF document', ko: 'PDF 문서' } },
  pptx: { mimeType: PPTX_MIME, extension: '.pptx', label: { en: 'PowerPoint presentation', ko: 'PowerPoint 프레젠테이션' } },
  md: { mimeType: 'text/markdown; charset=utf-8', extension: '.md', label: { en: 'Markdown', ko: 'Markdown' } },
  html: { mimeType: 'text/html; charset=utf-8', extension: '.html', label: { en: 'Web page', ko: '웹 페이지' } },
  csv: { mimeType: 'text/csv; charset=utf-8', extension: '.csv', label: { en: 'CSV (comma separated)', ko: 'CSV(쉼표 구분)' } },
};

function formatOf(format) {
  const f = String(format || '').toLowerCase().replace(/^\./, '');
  if (!FORMATS[f]) throw new Error(`Unknown export format: ${format} (expected ${Object.keys(FORMATS).join(', ')})`);
  return f;
}

/** Render a model; returns the bytes plus mime type, file extension and warnings ({code, message:{en,ko}}). */
function exportWithInfo(doc, format, opts = {}) {
  const f = formatOf(format);
  let buffer;
  let warnings = [];
  switch (f) {
    case 'docx': buffer = toDocx(doc, opts); break;
    case 'xlsx': buffer = toXlsx(doc, opts); break;
    case 'pdf': { const r = renderPdf(doc, opts); buffer = r.buffer; warnings = r.warnings; break; }
    case 'pptx': buffer = toPptx(doc, opts); break;
    // Markdown here keeps its pictures inside (data: URIs); markdownFiles() writes them apart.
    case 'md': buffer = Buffer.from(toMarkdown(doc, { embedImages: true }).text, 'utf8'); break;
    case 'html': buffer = Buffer.from(model.toHtml(doc), 'utf8'); break;
    default: buffer = Buffer.from(model.toCsv(doc), 'utf8'); break;
  }
  return { buffer, mimeType: FORMATS[f].mimeType, extension: FORMATS[f].extension, warnings };
}

/** Render a model to a Buffer in 'docx' | 'xlsx' | 'pdf' | 'html' | 'csv'. */
function exportDocument(doc, format, opts = {}) {
  const r = exportWithInfo(doc, format, opts);
  if (typeof opts.onWarning === 'function') for (const w of r.warnings) opts.onWarning(w);
  return r.buffer;
}

/**
 * Convert report HTML (core/platform/reports.js) and render it.
 * 'html' returns the original HTML unchanged; 'csv' returns opts.csv when given.
 */
function exportReportHtml(html, format, opts = {}) {
  const f = formatOf(format);
  if (f === 'html') return Buffer.from(String(html), 'utf8');
  if (f === 'csv' && typeof opts.csv === 'string') return Buffer.from(opts.csv, 'utf8');
  return exportDocument(model.fromHtml(html), f, opts);
}

/**
 * Build one report kind with core/platform/reports.js and export it.
 * @returns {{buffer:Buffer, fileName:string, mimeType:string, extension:string, warnings:object[]}}
 */
function exportReport(kind, analysis, format, opts = {}) {
  const f = formatOf(format);
  const reports = require('../platform/reports');
  const built = reports.build(kind, analysis, opts);
  if (opts.glossary) {
    const glossary = require('../report-glossary');
    const entries = glossary.glossaryOfHtml(built.html, opts.lang);
    built.html = glossary.addGlossaryHtml(built.html, opts.lang, entries);
    built.csv = glossary.addGlossaryCsv(built.csv, entries, opts.lang);
  }
  let r;
  if (f === 'html') r = { buffer: Buffer.from(built.html, 'utf8'), warnings: [] };
  else if (f === 'csv') r = { buffer: Buffer.from(built.csv, 'utf8'), warnings: [] };
  else r = exportWithInfo(model.fromHtml(built.html), f, opts);
  return { buffer: r.buffer, warnings: r.warnings, fileName: `${built.fileName}${FORMATS[f].extension}`, mimeType: FORMATS[f].mimeType, extension: FORMATS[f].extension };
}

const CHART_HEADING = { ko: '요약 차트', en: 'Summary charts' };

/** The report charts (chart.js) at the top of a document model. */
function addCharts(doc, charts, lang = 'ko') {
  if (!charts || !charts.length) return doc;
  const blocks = [{ type: 'h2', text: CHART_HEADING[lang] || CHART_HEADING.en }, ...charts.map((c) => ({ type: 'image', png: c.png, rgb: c.rgb, width: c.width, height: c.height, alt: c.alt, name: c.id }))];
  return { ...doc, blocks: [...blocks, ...(doc.blocks || [])] };
}

/** The same charts in report HTML, after the title and meta line (data: URIs). */
function addChartsHtml(html, charts, lang = 'ko') {
  if (!charts || !charts.length) return html;
  const figs = charts.map((c) => `<figure style="margin:10px 0"><img src="data:image/png;base64,${c.png.toString('base64')}" width="${c.width}" height="${c.height}" alt="${String(c.alt).replace(/"/g, '&quot;')}" style="max-width:100%;height:auto"></figure>`).join('');
  const section = `<h2>${CHART_HEADING[lang] || CHART_HEADING.en}</h2>${figs}`;
  const at = String(html).search(/<div class="meta">[\s\S]*?<\/div>/);
  if (at < 0) return String(html).replace(/<\/body>/i, () => `${section}</body>`);
  const end = String(html).indexOf('</div>', at) + 6;
  return `${html.slice(0, end)}${section}${html.slice(end)}`;
}

/**
 * Markdown of a model with its pictures either inside (embedImages) or as
 * files: { text, images: [{ path, png }] } (paths relative to the .md).
 */
function markdownFiles(doc, { embedImages = true, imageDir = 'images' } = {}) {
  return toMarkdown(doc, { embedImages, imageDir });
}

module.exports = {
  FORMATS: Object.keys(FORMATS), formats: FORMATS, exportDocument, exportWithInfo, exportReportHtml, exportReport,
  fromHtml: model.fromHtml, normalize: model.normalize, toDocx, toXlsx, toPptx, toMarkdown,
  addCharts, addChartsHtml, markdownFiles,
  toPdf: (doc, opts) => renderPdf(doc, opts).buffer, renderPdf,
};
