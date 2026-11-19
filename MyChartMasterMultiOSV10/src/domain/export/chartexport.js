// A chart as a file: pictures (PNG, JPEG, WebP, GIF, AVIF through a canvas; SVG as is), PDF (the picture on a
// page, the data on the pages after it), an interactive HTML page (tool tips, data table), Word and Markdown
// documents (picture + table). The SVG comes from render.js; raster formats need a DOM canvas (images.js).
import { chartDataTable, renderChart } from '../chart/render.js';
import { chartName } from '../chart/types.js';
import { encodeCanvas, imageMime, svgToCanvas } from './images.js';
import { exportDocument, toLines, textWidth } from './docexport.js';

/** Every export format: id → [extension, mime, kind]. */
export const CHART_FORMATS = {
  png: ['png', 'image/png', 'image'],
  jpg: ['jpg', 'image/jpeg', 'image'],
  webp: ['webp', 'image/webp', 'image'],
  gif: ['gif', 'image/gif', 'image'],
  avif: ['avif', 'image/avif', 'image'],
  svg: ['svg', 'image/svg+xml', 'vector'],
  pdf: ['pdf', 'application/pdf', 'document'],
  html: ['html', 'text/html', 'document'],
  docx: ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document'],
  markdown: ['md', 'text/markdown', 'document'],
};
export const CHART_FORMAT_IDS = Object.keys(CHART_FORMATS);
/** Formats that keep a transparent background (the export window offers it only for these). */
export const TRANSPARENT_FORMATS = new Set(['png', 'webp', 'gif', 'avif', 'svg', 'html']);

/** The chart as standalone SVG text (with hover titles), optionally at another size or on another background. */
export function chartSvg(doc, { width, height, background, language = 'ko', theme } = {}) {
  const o = doc.chart.options;
  const chart = background ? { ...doc.chart, options: { ...o, background } } : doc.chart;
  return renderChart({ table: doc.table, chart }, { width: width ?? o.width, height: height ?? o.height, language, theme, titles: true }).svg;
}

const esc = (text) => String(text ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/** A web page with the chart (tool tips on hover) and, below it, its data. */
export function chartHtml(doc, svg, { language = 'ko', includeData = true } = {}) {
  const title = doc.chart.title || chartName(doc.chart.type, language);
  const table = chartDataTable(doc);
  const data = includeData ? `<table><thead><tr>${table.columns.map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${table.rows.map((r) => `<tr>${r.cells.map((v, i) => `<td${table.columns[i].num ? ' class="num"' : ''}>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '';
  return `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
body{margin:0;padding:24px;font:14px 'Segoe UI','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif;background:#f4f6fa;color:#1f2937}
main{max-width:min(100%, ${doc.chart.options.width + 40}px);margin:0 auto}
.chart{background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(15,23,42,.08);padding:12px;overflow:auto}
.chart svg{display:block;width:100%;height:auto}
.mark{transition:opacity .15s}.chart svg:hover .mark{opacity:.75}.chart svg .mark:hover{opacity:1;filter:brightness(1.08)}
#tip{position:fixed;pointer-events:none;background:rgba(17,24,39,.92);color:#fff;padding:6px 10px;border-radius:7px;font-size:12.5px;white-space:pre-line;display:none;z-index:5}
table{border-collapse:collapse;margin-top:18px;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(15,23,42,.06)}
th,td{padding:5px 12px;border-bottom:1px solid #e5e7eb;text-align:left}th{background:#f1f5f9;font-weight:600}.num{text-align:right;font-variant-numeric:tabular-nums}
footer{margin-top:14px;color:#94a3b8;font-size:12px}
</style></head><body><main>
<div class="chart">${svg.replace(/<title>[^<]*<\/title>/g, '')}</div>
${data}
<footer>MyChartMaster · ${esc(new Date().toISOString().slice(0, 10))}</footer>
</main><div id="tip"></div>
<script>
const tip=document.getElementById('tip');
document.querySelectorAll('[data-tip]').forEach((el)=>{
  el.addEventListener('mousemove',(e)=>{tip.textContent=el.getAttribute('data-tip');tip.style.display='block';tip.style.left=(e.clientX+14)+'px';tip.style.top=(e.clientY+14)+'px';});
  el.addEventListener('mouseleave',()=>{tip.style.display='none';});
});
</script></body></html>
`;
}

// ───────────────────────── PDF with the picture

const PAGE = { A3: [841.89, 1190.55], A4: [595.28, 841.89], A5: [419.53, 595.28], Letter: [612, 792], Legal: [612, 1008], B4: [708.66, 1000.63], B5: [498.9, 708.66], Tabloid: [792, 1224] };

/**
 * A PDF: page 1 the picture (JPEG, fitted inside the margins, centred, a title above), then the data lines.
 * `jpeg` are the JPEG bytes, `pixels` its size.
 */
export function chartPdf({ jpeg, pixels, title = '', lines = [], paper = 'A4', orientation = 'landscape', margin = 36 }) {
  const [pw, ph] = PAGE[paper] ?? PAGE.A4;
  const W = orientation === 'portrait' ? pw : ph;
  const H = orientation === 'portrait' ? ph : pw;
  const M = margin;
  const hex = (s) => [...String(s)].map((ch) => { const c = ch.codePointAt(0); return c > 0xffff ? '003F' : c.toString(16).padStart(4, '0').toUpperCase(); }).join('');
  const parts = [];
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const catalog = add(null);
  const pagesObj = add(null);
  const descriptor = add('<< /Type /FontDescriptor /FontName /HYGoThic-Medium /Flags 6 /FontBBox [-6 -145 1003 880] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 880 /StemV 93 >>');
  const cidFont = add(`<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HYGoThic-Medium /CIDSystemInfo << /Registry (Adobe) /Ordering (Korea1) /Supplement 2 >> /FontDescriptor ${descriptor} 0 R /DW 1000 /W [1 95 500] >>`);
  const font = add(`<< /Type /Font /Subtype /Type0 /BaseFont /HYGoThic-Medium-UniKS-UCS2-H /Encoding /UniKS-UCS2-H /DescendantFonts [${cidFont} 0 R] >>`);
  // The image is binary: it is spliced in as bytes when the file is written.
  const image = add({ binary: jpeg, head: `<< /Type /XObject /Subtype /Image /Width ${pixels.width} /Height ${pixels.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>` });
  const kids = [];
  const page = (content, withImage) => {
    const stream = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /Font << /F1 ${font} 0 R >>${withImage ? ` /XObject << /Im1 ${image} 0 R >>` : ''} >> /Contents ${stream} 0 R >>`));
  };
  // Page 1: the picture.
  const titleH = title ? 26 : 0;
  const boxW = W - 2 * M;
  const boxH = H - 2 * M - titleH;
  const scale = Math.min(boxW / pixels.width, boxH / pixels.height);
  const iw = pixels.width * scale;
  const ih = pixels.height * scale;
  const ix = (W - iw) / 2;
  const iy = M + (boxH - ih) / 2;
  const ops = [`q ${iw.toFixed(2)} 0 0 ${ih.toFixed(2)} ${ix.toFixed(2)} ${iy.toFixed(2)} cm /Im1 Do Q`];
  if (title) ops.push(`BT /F1 14 Tf ${M} ${(H - M - 14).toFixed(2)} Td <${hex(title)}> Tj ET`);
  page(ops.join('\n'), true);
  // Data pages.
  if (lines.length) {
    const widest = Math.max(1, ...lines.map(textWidth));
    const size = Math.max(5.5, Math.min(10, ((W - 2 * M) / widest) * 2));
    const lead = size * 1.45;
    const per = Math.max(1, Math.floor((H - 2 * M) / lead));
    for (let i = 0; i < lines.length; i += per) page(lines.slice(i, i + per).map((line, k) => `BT /F1 ${size.toFixed(2)} Tf ${M} ${(H - M - (k + 1) * lead).toFixed(2)} Td <${hex(line)}> Tj ET`).join('\n'), false);
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title <FEFF${hex(title)}> /Producer (MyChartMaster) >>`);
  let length = 0;
  const offsets = [];
  const push = (part) => { parts.push(part); length += part.length; };
  const ascii = (s) => Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0xff);
  push(ascii('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'));
  objects.forEach((body, i) => {
    offsets.push(length);
    if (body && typeof body === 'object' && body.binary) {
      push(ascii(`${i + 1} 0 obj\n${body.head}\nstream\n`));
      push(body.binary);
      push(ascii('\nendstream\nendobj\n'));
    } else push(ascii(`${i + 1} 0 obj\n${body}\nendobj\n`));
  });
  const xref = length;
  push(ascii(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

const canvasBytes = (canvas, type, quality) => new Promise((resolve, reject) => canvas.toBlob(async (blob) => { if (!blob) { reject(new Error('export.canvas')); return; } resolve(new Uint8Array(await blob.arrayBuffer())); }, type, quality));

/**
 * The file for a format. options: { width, height, scale, background, includeData, language, theme, paper,
 * orientation, avif (desktop AVIF encoder), quality }. Returns { content: string | Uint8Array, ext, mime }.
 */
export async function exportChart(doc, format, options = {}) {
  const [ext, mime] = CHART_FORMATS[format] ?? CHART_FORMATS.png;
  const language = options.language ?? 'ko';
  const width = options.width ?? doc.chart.options.width;
  const height = options.height ?? doc.chart.options.height;
  const background = options.background && options.background !== 'chart' ? options.background : null;
  const svg = chartSvg(doc, { width, height, background, language, theme: options.theme });
  const title = doc.chart.title || chartName(doc.chart.type, language);
  if (format === 'svg') return { content: `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`, ext, mime };
  if (format === 'html') return { content: chartHtml(doc, svg, { language, includeData: options.includeData !== false }), ext, mime };
  const scale = Math.max(0.5, Math.min(6, Number(options.scale) || 2));
  const opaque = !TRANSPARENT_FORMATS.has(format);
  const effectiveBg = background ?? doc.chart.options.background;
  const fill = opaque && (effectiveBg === 'transparent' || effectiveBg === 'none') ? '#ffffff' : '';
  const canvas = await svgToCanvas(svg, { scale, background: fill });
  if (CHART_FORMATS[format]?.[2] === 'image') return { content: await encodeCanvas(canvas, format, { quality: options.quality ?? 0.92, avif: options.avif ?? null, transparent: !fill && (effectiveBg === 'transparent' || effectiveBg === 'none') }), ext, mime: imageMime(format) };
  const table = chartDataTable(doc);
  if (format === 'pdf') {
    const jpeg = await canvasBytes(canvas, 'image/jpeg', 0.95);
    const lines = options.includeData === false ? [] : toLines({ title, columns: table.columns, rows: table.rows });
    return { content: chartPdf({ jpeg, pixels: { width: canvas.width, height: canvas.height }, title, lines, paper: options.paper ?? 'A4', orientation: options.orientation ?? (width >= height ? 'landscape' : 'portrait') }), ext, mime };
  }
  const dataUrl = canvas.toDataURL('image/png');
  const document = { title, subtitle: doc.chart.subtitle, images: [{ dataUrl, caption: title, ext: 'png', mime: 'image/png' }], ...(options.includeData === false ? {} : table) };
  return { content: exportDocument(document, format, { lang: language }), ext, mime, document };
}
