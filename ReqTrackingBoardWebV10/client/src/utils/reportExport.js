import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { formatDate } from './helpers';
import { REPORT_CHART_IDS } from '../constants/chartColors';

const PDF_FONT_FAMILY = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
/** A4 portrait content width at 96dpi (210mm) */
const PDF_CONTENT_WIDTH_PX = 794;
const PDF_CHART_MAX_WIDTH = 340;
const PDF_CHART_MAX_HEIGHT = 230;
const PDF_PAGE_MARGIN_MM = 10;
const PDF_FORMAT = 'a4';
const PDF_ORIENTATION = 'portrait';
const WORD_CHART_MAX_WIDTH = 300;
const WORD_CHART_MAX_HEIGHT = 220;
const MARKDOWN_CHART_MAX_WIDTH = 320;
const MARKDOWN_CHART_MAX_HEIGHT = 240;
let pdfFontsReady = false;

import { buildExportFilename } from './exportPrefix.js';

function downloadBlob(content, filename, mimeType) {
  const blob = content instanceof Blob
    ? content
    : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildStatusLines(obj) {
  if (Array.isArray(obj)) {
    return obj.map(({ name, count }) => `${name}: ${count}`).join(', ');
  }
  return Object.entries(obj || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
}

async function ensurePdfFonts() {
  if (pdfFontsReady) return;
  if (!document.querySelector('link[data-pdf-font="noto"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700&display=swap';
    link.setAttribute('data-pdf-font', 'noto');
    document.head.appendChild(link);
  }
  try {
    await Promise.all([
      document.fonts.load('400 16px "Noto Sans KR"'),
      document.fonts.load('600 16px "Noto Sans KR"'),
      document.fonts.load('700 16px "Noto Sans KR"'),
      document.fonts.load('400 16px "Malgun Gothic"'),
    ]);
  } catch {
    /* fall back to system fonts */
  }
  await document.fonts.ready;
  await new Promise((resolve) => setTimeout(resolve, 400));
  pdfFontsReady = true;
}

function applyPdfFontFamily(root) {
  root.style.fontFamily = PDF_FONT_FAMILY;
  root.querySelectorAll('h1,h2,h3,h4,p,li,th,td,span,strong').forEach((node) => {
    node.style.fontFamily = PDF_FONT_FAMILY;
  });
}

function preloadImages(container) {
  const imgs = container.querySelectorAll('img');
  return Promise.all([...imgs].map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    });
  }));
}

function normalizeChartEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return { dataUrl: entry, width: null, height: null };
  return entry;
}

async function fitChartImage(dataUrl, maxWidth, maxHeight) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.naturalWidth;
      let height = img.naturalHeight;
      const ratio = width / height;

      if (width > maxWidth) {
        width = maxWidth;
        height = width / ratio;
      }
      if (height > maxHeight) {
        height = maxHeight;
        width = height * ratio;
      }

      width = Math.round(width);
      height = Math.round(height);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve({ dataUrl: canvas.toDataURL('image/png'), width, height });
    };
    img.onerror = () => resolve({ dataUrl, width: maxWidth, height: Math.round(maxWidth * 0.65) });
    img.src = dataUrl;
  });
}

async function prepareExportChartImages(chartImages, maxWidth, maxHeight) {
  const prepared = {};
  for (const id of REPORT_CHART_IDS) {
    if (!chartImages[id]) continue;
    prepared[id] = await fitChartImage(chartImages[id], maxWidth, maxHeight);
  }
  return prepared;
}

async function prepareWordChartImages(chartImages) {
  return prepareExportChartImages(chartImages, WORD_CHART_MAX_WIDTH, WORD_CHART_MAX_HEIGHT);
}

async function preparePdfChartImages(chartImages) {
  return prepareExportChartImages(chartImages, PDF_CHART_MAX_WIDTH, PDF_CHART_MAX_HEIGHT);
}

function renderChartBlock(id, entry, labels, { fixedSize = false } = {}) {
  const chart = normalizeChartEntry(entry);
  if (!chart) return '';

  const title = escapeHtml(labels.chartTitles[id]);
  let imgTag;

  if (fixedSize && chart.width && chart.height) {
    imgTag = `<img src="${chart.dataUrl}" alt="${title}" width="${chart.width}" height="${chart.height}" style="width:${chart.width}px;height:${chart.height}px;display:block;border:1px solid #e2e8f0;" />`;
  } else {
    imgTag = `<img src="${chart.dataUrl}" alt="${title}" style="max-width:100%;height:auto;border:1px solid #e2e8f0;" />`;
  }

  return `
    <div style="margin-bottom:0;page-break-inside:avoid;">
      <h3 style="font-size:12pt;font-weight:600;margin:0 0 8px;color:#475569;">${title}</h3>
      ${imgTag}
    </div>`;
}

function chartSectionHtml(chartImages, labels, { fixedSize = false } = {}) {
  if (!chartImages || !Object.keys(chartImages).length) return '';

  const ids = REPORT_CHART_IDS.filter((id) => chartImages[id]);
  if (!ids.length) return '';

  if (fixedSize) {
    const rows = [];
    for (let i = 0; i < ids.length; i += 2) {
      const left = renderChartBlock(ids[i], chartImages[ids[i]], labels, { fixedSize: true });
      const right = ids[i + 1]
        ? renderChartBlock(ids[i + 1], chartImages[ids[i + 1]], labels, { fixedSize: true })
        : '&nbsp;';
      rows.push(`
        <tr>
          <td style="width:50%;vertical-align:top;padding:0 12px 20px 0;border:none;">${left}</td>
          <td style="width:50%;vertical-align:top;padding:0 0 20px 12px;border:none;">${right}</td>
        </tr>`);
    }
    return `
  <h2>${escapeHtml(labels.charts)}</h2>
  <table style="width:100%;border:none;border-collapse:collapse;margin-top:8px;">
    <tbody>${rows.join('')}</tbody>
  </table>`;
  }

  const blocks = ids.map((id) => renderChartBlock(id, chartImages[id], labels)).join('');
  return `
  <h2>${escapeHtml(labels.charts)}</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">${blocks}</div>`;
}

function buildReportHtml(report, labels, chartImages, { pdf = false, fixedCharts = false } = {}) {
  const reqRows = report.requirements.map(r => `
    <tr>
      <td>${escapeHtml(r.reqId)}</td>
      <td>${escapeHtml(r.title)}</td>
      <td>${escapeHtml(r.status)}</td>
      <td>${escapeHtml(r.priority)}</td>
      <td>${r.testCount}</td>
      <td>${r.passed}</td>
      <td>${r.failed}</td>
    </tr>`).join('');

  const tcRows = report.testCases.map(tc => `
    <tr>
      <td>${escapeHtml(tc.tcId)}</td>
      <td>${escapeHtml(tc.reqId)}</td>
      <td>${escapeHtml(tc.title)}</td>
      <td>${escapeHtml(tc.status)}</td>
      <td>${escapeHtml(tc.result || '-')}</td>
      <td>${escapeHtml(tc.executedBy || '-')}</td>
    </tr>`).join('');

  const fontFamily = PDF_FONT_FAMILY;
  const imgRule = fixedCharts
    ? 'img { display: block; }'
    : 'img { max-width: 100%; height: auto; }';
  const fontLink = pdf
    ? '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700&display=swap">'
    : '';

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${escapeHtml(labels.title)}</title>${fontLink}
<style>
  body { font-family: ${fontFamily}; font-size: 11pt; color: #1e293b; line-height: 1.5; }
  h1 { font-size: 18pt; color: #1e3a5f; font-weight: 700; margin: 0 0 12px; font-family: ${fontFamily}; }
  h2 { font-size: 14pt; margin-top: 28px; margin-bottom: 12px; color: #1e3a5f; font-weight: 600; font-family: ${fontFamily}; }
  h3 { font-family: ${fontFamily}; }
  p, li, th, td { font-family: ${fontFamily}; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; page-break-inside: auto; }
  tr { page-break-inside: avoid; page-break-after: auto; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; word-break: break-word; }
  th { background: #f1f5f9; font-weight: 600; }
  ${imgRule}
</style>
</head>
<body>
  <h1>${escapeHtml(labels.title)}</h1>
  <p><strong>${escapeHtml(labels.generatedAt)}:</strong> ${escapeHtml(formatDate(report.generatedAt))}</p>
  <h2>${escapeHtml(labels.overview)}</h2>
  <ul>
    <li>${escapeHtml(labels.totalRequirements)}: ${report.totalRequirements}</li>
    <li>${escapeHtml(labels.totalTestCases)}: ${report.totalTestCases}</li>
    <li>Req by status: ${escapeHtml(buildStatusLines(report.reqByStatus))}</li>
    <li>TC by status: ${escapeHtml(buildStatusLines(report.tcByStatus))}</li>
  </ul>
  ${chartSectionHtml(chartImages, labels, { fixedSize: fixedCharts })}
  <h2>${escapeHtml(labels.reqSummary)}</h2>
  <table>
    <thead><tr>
      <th>${escapeHtml(labels.reqId)}</th><th>${escapeHtml(labels.reqTitle)}</th>
      <th>${escapeHtml(labels.status)}</th><th>${escapeHtml(labels.priority)}</th>
      <th>${escapeHtml(labels.testCases)}</th><th>${escapeHtml(labels.passed)}</th><th>${escapeHtml(labels.failed)}</th>
    </tr></thead>
    <tbody>${reqRows}</tbody>
  </table>
  <h2>${escapeHtml(labels.tcSummary)}</h2>
  <table>
    <thead><tr>
      <th>${escapeHtml(labels.tcId)}</th><th>${escapeHtml(labels.requirement)}</th>
      <th>${escapeHtml(labels.tcTitle)}</th><th>${escapeHtml(labels.status)}</th>
      <th>${escapeHtml(labels.result)}</th><th>${escapeHtml(labels.executedBy)}</th>
    </tr></thead>
    <tbody>${tcRows}</tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function exportReportMarkdown(report, labels, chartImages = {}) {
  const mdCharts = await prepareExportChartImages(
    chartImages,
    MARKDOWN_CHART_MAX_WIDTH,
    MARKDOWN_CHART_MAX_HEIGHT,
  );

  const lines = [
    `# ${labels.title}`,
    '',
    `**${labels.generatedAt}:** ${formatDate(report.generatedAt)}`,
    '',
    `## ${labels.overview}`,
    '',
    `- ${labels.totalRequirements}: ${report.totalRequirements}`,
    `- ${labels.totalTestCases}: ${report.totalTestCases}`,
    `- Req by status: ${buildStatusLines(report.reqByStatus)}`,
    `- TC by status: ${buildStatusLines(report.tcByStatus)}`,
    '',
    `## ${labels.charts}`,
    '',
  ];

  for (const id of REPORT_CHART_IDS) {
    const chart = mdCharts[id];
    if (!chart) continue;
    const title = labels.chartTitles[id];
    lines.push(`### ${title}`, '');
    lines.push(
      `<img src="charts/${id}.png" alt="${title}" width="${chart.width}" height="${chart.height}" />`,
      '',
    );
  }

  lines.push(
    `## ${labels.reqSummary}`,
    '',
    `| ${labels.reqId} | ${labels.reqTitle} | ${labels.status} | ${labels.priority} | ${labels.testCases} | ${labels.passed} | ${labels.failed} |`,
    '| --- | --- | --- | --- | --- | --- | --- |',
  );

  for (const r of report.requirements) {
    lines.push(`| ${r.reqId} | ${r.title} | ${r.status} | ${r.priority} | ${r.testCount} | ${r.passed} | ${r.failed} |`);
  }

  lines.push('', `## ${labels.tcSummary}`, '');
  lines.push(`| ${labels.tcId} | ${labels.requirement} | ${labels.tcTitle} | ${labels.status} | ${labels.result} | ${labels.executedBy} |`);
  lines.push('| --- | --- | --- | --- | --- | --- |');

  for (const tc of report.testCases) {
    lines.push(`| ${tc.tcId} | ${tc.reqId} | ${tc.title} | ${tc.status} | ${tc.result || '-'} | ${tc.executedBy || '-'} |`);
  }

  const zip = new JSZip();
  zip.file('summary_report.md', lines.join('\n'));
  const chartsFolder = zip.folder('charts');
  for (const id of REPORT_CHART_IDS) {
    const chart = mdCharts[id];
    if (!chart) continue;
    const base64 = chart.dataUrl.split(',')[1];
    chartsFolder.file(`${id}.png`, base64, { base64: true });
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const prefix = labels.filePrefix || '';
  downloadBlob(blob, buildExportFilename(prefix, 'summary_report', 'zip'), 'application/zip');
}

export async function exportReportWord(report, labels, chartImages = {}) {
  const wordCharts = await prepareWordChartImages(chartImages);
  const html = buildReportHtml(report, labels, wordCharts, { fixedCharts: true });
  const prefix = labels.filePrefix || '';
  downloadBlob('\ufeff' + html, buildExportFilename(prefix, 'summary_report', 'doc'), 'application/msword');
}

async function renderReportCanvas(container) {
  return html2canvas(container, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    width: PDF_CONTENT_WIDTH_PX,
    windowWidth: PDF_CONTENT_WIDTH_PX,
    onclone: (clonedDoc) => {
      const root = clonedDoc.querySelector('.pdf-export-root') || clonedDoc.body;
      applyPdfFontFamily(root);
    },
  });
}

function addCanvasPagesToPdf(doc, canvas, marginMm) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginMm * 2;
  const contentHeight = pageHeight - marginMm * 2;
  const sliceHeightPx = Math.floor((contentHeight / contentWidth) * canvas.width);

  let offsetY = 0;
  let pageIndex = 0;

  while (offsetY < canvas.height) {
    if (pageIndex > 0) doc.addPage();

    const heightPx = Math.min(sliceHeightPx, canvas.height - offsetY);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = heightPx;
    pageCanvas.getContext('2d').drawImage(
      canvas,
      0, offsetY, canvas.width, heightPx,
      0, 0, canvas.width, heightPx,
    );

    const imgHeightMm = (heightPx * contentWidth) / canvas.width;
    doc.addImage(
      pageCanvas.toDataURL('image/png'),
      'PNG',
      marginMm,
      marginMm,
      contentWidth,
      imgHeightMm,
    );

    offsetY += heightPx;
    pageIndex += 1;
  }
}

export async function exportReportPdf(report, labels, chartImages = {}) {
  await ensurePdfFonts();
  const pdfCharts = await preparePdfChartImages(chartImages);

  const container = document.createElement('div');
  container.className = 'pdf-export-root';
  container.innerHTML = buildReportHtml(report, labels, pdfCharts, { pdf: true, fixedCharts: true });
  Object.assign(container.style, {
    position: 'fixed',
    left: '-20000px',
    top: '0',
    width: `${PDF_CONTENT_WIDTH_PX}px`,
    padding: '32px',
    background: '#ffffff',
    boxSizing: 'border-box',
    fontFamily: PDF_FONT_FAMILY,
    color: '#1e293b',
    fontSize: '14px',
    lineHeight: '1.5',
  });
  document.body.appendChild(container);
  applyPdfFontFamily(container);
  await preloadImages(container);
  await document.fonts.ready;

  try {
    const canvas = await renderReportCanvas(container);
    const doc = new jsPDF({ orientation: PDF_ORIENTATION, unit: 'mm', format: PDF_FORMAT });
    addCanvasPagesToPdf(doc, canvas, PDF_PAGE_MARGIN_MM);
    doc.save(buildExportFilename(labels.filePrefix || '', 'summary_report', 'pdf'));
  } finally {
    document.body.removeChild(container);
  }
}
