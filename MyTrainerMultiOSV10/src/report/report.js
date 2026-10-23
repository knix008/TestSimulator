// The results report: one list of blocks, many outputs.
//   blocks: { kind: 'heading', text, level } · { kind: 'text', text } · { kind: 'kv', rows: [[k, v]] }
//           { kind: 'table', head: [...], rows: [[...]] } · { kind: 'image', name, dataUrl, width, height, caption }
//   • pages (layoutPages + drawPage): laid out in points on the chosen paper — the print preview, printing and PDF
//   • toPdf: the drawn pages as JPEG pictures in a PDF (Korean text needs no embedded font)
//   • toDocx: a Word document (headings, tables, the pictures embedded)
//   • toMarkdown / toCsv: text with the pictures as PNG files next to it (images/…)

import { zipBlob } from '../platform/zip.js';

export const PAPERS = { a4: [595.28, 841.89], letter: [612, 792], a3: [841.89, 1190.55] };
export const defaultReportSettings = () => ({ paper: 'a4', landscape: false, margin: 15, sections: null });
const MM = 72 / 25.4;
const FONT = 'system-ui, "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const COLORS = { text: '#1d2433', muted: '#667085', line: '#d9dfea', head: '#eef2f8', accent: '#3a6cf0' };

/** The blocks of the sections that are switched on (a section starts at a level-1 heading with an id). */
export function selectedBlocks(report, sections) {
  if (!sections) return report.blocks;
  const out = [];
  let on = true;
  for (const block of report.blocks) {
    if (block.kind === 'heading' && block.level === 1 && block.section) on = sections[block.section] !== false;
    if (on) out.push(block);
  }
  return out;
}

// ───────────────────────── page layout (points)

function wrap(ctx, text, width) {
  const lines = [];
  for (const paragraph of String(text ?? '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/(\s+)/)) {
      const next = line + word;
      if (ctx.measureText(next).width <= width || !line.trim()) {
        // A single word wider than the line: cut it by characters.
        if (ctx.measureText(next).width > width && !line.trim()) {
          let piece = '';
          for (const ch of next) { if (ctx.measureText(piece + ch).width > width && piece) { lines.push(piece); piece = ''; } piece += ch; }
          line = piece;
        } else line = next;
      } else { lines.push(line.trimEnd()); line = word.trimStart(); }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

function ellipsize(ctx, text, width) {
  const s = String(text ?? '');
  if (ctx.measureText(s).width <= width) return s;
  let out = s;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > width) out = out.slice(0, -1);
  return `${out}…`;
}

/**
 * Lays the blocks out on pages: [{ items: [{ type, ... in points }] }]. `measure` is a 2D context used to
 * measure text; `images` maps a name to a loaded image (for its aspect ratio).
 */
export function layoutPages(report, settings, measure) {
  const [pw, ph] = PAPERS[settings.paper] ?? PAPERS.a4;
  const [width, height] = settings.landscape ? [ph, pw] : [pw, ph];
  const margin = (settings.margin ?? 15) * MM;
  const top = margin + 18; const bottom = height - margin - 16;
  const left = margin; const contentWidth = width - 2 * margin;
  const pages = [];
  let page = null; let y = 0;
  const newPage = () => { page = { width, height, margin, items: [] }; pages.push(page); y = top; };
  const room = (h) => { if (y + h > bottom && page.items.length) newPage(); };
  const font = (size, weight = 400) => { measure.font = `${weight} ${size}px ${FONT}`; };
  newPage();
  for (const block of selectedBlocks(report, settings.sections)) {
    if (block.kind === 'heading') {
      const size = block.level === 1 ? 15 : 11.5;
      font(size, 700);
      room(size * 1.4 + 24);
      y += block.level === 1 ? (page.items.length ? 12 : 0) : 6;
      page.items.push({ type: 'text', x: left, y: y + size, text: block.text, size, weight: 700, color: block.level === 1 ? COLORS.accent : COLORS.text });
      y += size * 1.35;
      if (block.level === 1) { page.items.push({ type: 'line', x1: left, y1: y, x2: left + contentWidth, y2: y, color: COLORS.line }); y += 6; } else y += 2;
    } else if (block.kind === 'text') {
      font(9.5);
      for (const line of wrap(measure, block.text, contentWidth)) { room(13.5); page.items.push({ type: 'text', x: left, y: y + 10, text: line, size: 9.5, color: block.muted ? COLORS.muted : COLORS.text }); y += 13.5; }
      y += 3;
    } else if (block.kind === 'kv') {
      font(9);
      const labelWidth = Math.min(contentWidth * 0.38, Math.max(...block.rows.map(([k]) => measure.measureText(String(k)).width), 40) + 14);
      for (const [k, v] of block.rows) {
        const lines = wrap(measure, v, contentWidth - labelWidth);
        const h = lines.length * 12.5 + 4;
        room(h);
        page.items.push({ type: 'text', x: left, y: y + 10, text: String(k), size: 9, color: COLORS.muted });
        lines.forEach((line, i) => page.items.push({ type: 'text', x: left + labelWidth, y: y + 10 + i * 12.5, text: line, size: 9, color: COLORS.text }));
        y += h;
        page.items.push({ type: 'line', x1: left, y1: y - 1, x2: left + contentWidth, y2: y - 1, color: COLORS.line });
      }
      y += 6;
    } else if (block.kind === 'table') {
      let size = 8.5;
      const columns = block.head.length;
      const natural = () => block.head.map((h, c) => Math.min(200, Math.max(...[h, ...block.rows.map((r) => r[c])].map((v) => measure.measureText(String(v ?? '')).width)) + 10));
      font(size, 700);
      let widths = natural();
      while (widths.reduce((a, b) => a + b, 0) > contentWidth && size > 6.5) { size -= 0.5; font(size, 700); widths = natural(); }
      const total = widths.reduce((a, b) => a + b, 0);
      widths = widths.map((w) => (w * contentWidth) / Math.max(total, contentWidth * (columns > 3 ? 1 : 0.7)));
      const rowH = size * 1.55;
      const header = () => {
        page.items.push({ type: 'rect', x: left, y, w: widths.reduce((a, b) => a + b, 0), h: rowH, color: COLORS.head });
        let x = left;
        font(size, 700);
        block.head.forEach((h, c) => { page.items.push({ type: 'text', x: x + 4, y: y + rowH * 0.7, text: ellipsize(measure, h, widths[c] - 8), size, weight: 700, color: COLORS.text }); x += widths[c]; });
        y += rowH;
      };
      room(rowH * 2);
      header();
      font(size);
      for (const row of block.rows) {
        if (y + rowH > bottom) { newPage(); header(); font(size); }
        let x = left;
        row.forEach((cell, c) => { page.items.push({ type: 'text', x: x + 4, y: y + rowH * 0.7, text: ellipsize(measure, cell, widths[c] - 8), size, color: COLORS.text, align: typeof cell === 'number' ? 'right' : 'left', w: widths[c] - 8 }); x += widths[c]; });
        y += rowH;
        page.items.push({ type: 'line', x1: left, y1: y, x2: left + widths.reduce((a, b) => a + b, 0), y2: y, color: COLORS.line });
      }
      y += 8;
    } else if (block.kind === 'image') {
      const scale = Math.min(1, contentWidth / block.width, ((bottom - top) * 0.6) / block.height);
      const w = block.width * scale; const h = block.height * scale;
      room(h + (block.caption ? 16 : 6));
      page.items.push({ type: 'image', name: block.name, x: left + (contentWidth - w) / 2, y, w, h });
      y += h + 4;
      if (block.caption) { page.items.push({ type: 'text', x: left + contentWidth / 2, y: y + 9, text: block.caption, size: 8.5, color: COLORS.muted, align: 'center' }); y += 14; }
      y += 6;
    }
  }
  pages.forEach((p, i) => {
    p.items.push({ type: 'text', x: left, y: margin + 8, text: report.title, size: 7.5, color: COLORS.muted });
    p.items.push({ type: 'text', x: width - margin, y: margin + 8, text: report.date, size: 7.5, color: COLORS.muted, align: 'right', w: 0 });
    p.items.push({ type: 'text', x: width / 2, y: height - margin + 4, text: `${i + 1} / ${pages.length}`, size: 7.5, color: COLORS.muted, align: 'center' });
  });
  return pages;
}

/** Draws one page on a 2D context at `scale` pixels per point (white paper). images: name → loaded image. */
export function drawPage(ctx, page, scale, images) {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, page.width, page.height);
  for (const item of page.items) {
    if (item.type === 'rect') { ctx.fillStyle = item.color; ctx.fillRect(item.x, item.y, item.w, item.h); }
    else if (item.type === 'line') { ctx.strokeStyle = item.color; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(item.x1, item.y1); ctx.lineTo(item.x2, item.y2); ctx.stroke(); }
    else if (item.type === 'image') { const img = images.get(item.name); if (img) ctx.drawImage(img, item.x, item.y, item.w, item.h); }
    else if (item.type === 'text') {
      ctx.font = `${item.weight ?? 400} ${item.size}px ${FONT}`;
      ctx.fillStyle = item.color;
      ctx.textBaseline = 'alphabetic';
      if (item.align === 'right') { ctx.textAlign = 'right'; ctx.fillText(item.text, item.x + (item.w ?? 0), item.y); }
      else if (item.align === 'center') { ctx.textAlign = 'center'; ctx.fillText(item.text, item.x, item.y); }
      else { ctx.textAlign = 'left'; ctx.fillText(item.text, item.x, item.y); }
    }
  }
  ctx.restore();
}

/** The report's pictures as loaded images (name → HTMLImageElement). */
export async function loadImages(report) {
  const map = new Map();
  await Promise.all(report.blocks.filter((b) => b.kind === 'image').map((b) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { map.set(b.name, img); resolve(); };
    img.onerror = () => resolve();
    img.src = b.dataUrl;
  })));
  return map;
}

/** The pages drawn as canvases at `dpi`. */
export async function renderPages(report, settings, dpi = 150) {
  const measure = document.createElement('canvas').getContext('2d');
  const pages = layoutPages(report, settings, measure);
  const images = await loadImages(report);
  const scale = dpi / 72;
  return pages.map((page) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(page.width * scale);
    canvas.height = Math.round(page.height * scale);
    drawPage(canvas.getContext('2d'), page, scale, images);
    canvas.page = page;
    return canvas;
  });
}

// ───────────────────────── PDF (pages as JPEG pictures)

const bytes = (text) => new TextEncoder().encode(text);
const dataUrlBytes = (url) => Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0));

/** A PDF of page canvases (each page a JPEG picture the size of the paper). */
export function toPdf(canvases, title = 'MyTrainer') {
  const objects = [];
  const add = (parts) => { objects.push(parts); return objects.length; };
  const catalog = add(null); const pagesId = add(null);
  const kids = [];
  for (const canvas of canvases) {
    const jpeg = dataUrlBytes(canvas.toDataURL('image/jpeg', 0.9));
    const { width, height } = canvas.page;
    const image = add([bytes(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, bytes('\nendstream')]);
    const draw = bytes(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} 0 0 cm /Im Do Q`);
    const content = add([bytes(`<< /Length ${draw.length} >>\nstream\n`), draw, bytes('\nendstream')]);
    kids.push(add([bytes(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${width.toFixed(2)} ${height.toFixed(2)}] /Resources << /XObject << /Im ${image} 0 R >> >> /Contents ${content} 0 R >>`)]));
  }
  objects[catalog - 1] = [bytes(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)];
  objects[pagesId - 1] = [bytes(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`)];
  const info = add([bytes(`<< /Title (${String(title).replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '')}) /Producer (MyTrainer) >>`)]);
  const chunks = [bytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  let offset = chunks[0].length;
  const offsets = [];
  objects.forEach((parts, i) => {
    offsets.push(offset);
    const head = bytes(`${i + 1} 0 obj\n`); const tail = bytes('\nendobj\n');
    for (const part of [head, ...parts, tail]) { chunks.push(part); offset += part.length; }
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
  chunks.push(bytes(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

// ───────────────────────── Word (.docx)

const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const run = (text, { bold = false, size = 20, color = null } = {}) => `<w:r><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="Malgun Gothic"/>${bold ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
const para = (inner, { spacingAfter = 80, align = null } = {}) => `<w:p><w:pPr><w:spacing w:after="${spacingAfter}"/>${align ? `<w:jc w:val="${align}"/>` : ''}</w:pPr>${inner}</w:p>`;

/** A Word document of the report (Uint8Array, .docx). */
export function toDocx(report, settings = defaultReportSettings()) {
  const [pw, ph] = PAPERS[settings.paper] ?? PAPERS.a4;
  const [w, h] = settings.landscape ? [ph, pw] : [pw, ph];
  const twip = (pt) => Math.round(pt * 20);
  const margin = twip((settings.margin ?? 15) * MM);
  const contentPt = w - 2 * (settings.margin ?? 15) * MM;
  const media = {}; const rels = [];
  let body = para(run(report.title, { bold: true, size: 36 }), { spacingAfter: 60 }) + para(run(report.date, { size: 18, color: '667085' }), { spacingAfter: 200 });
  const cell = (text, { head = false, width } = {}) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF2F8"/>' : ''}</w:tcPr>${para(run(text, { bold: head, size: 18 }), { spacingAfter: 0 })}</w:tc>`;
  const table = (head, rows, widths) => `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'bottom', 'insideH'].map((side) => `<w:${side} w:val="single" w:sz="4" w:color="D9DFEA"/>`).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((x) => `<w:gridCol w:w="${x}"/>`).join('')}</w:tblGrid>${head ? `<w:tr>${head.map((h, i) => cell(h, { head: true, width: widths[i] })).join('')}</w:tr>` : ''}${rows.map((r) => `<w:tr>${r.map((c, i) => cell(c, { width: widths[i] })).join('')}</w:tr>`).join('')}</w:tbl>${para('', { spacingAfter: 120 })}`;
  let imageId = 0;
  for (const block of selectedBlocks(report, settings.sections)) {
    if (block.kind === 'heading') body += para(run(block.text, { bold: true, size: block.level === 1 ? 30 : 24, color: block.level === 1 ? '3A6CF0' : null }), { spacingAfter: 100 });
    else if (block.kind === 'text') body += String(block.text).split('\n').map((line) => para(run(line, { size: 19, color: block.muted ? '667085' : null }))).join('');
    else if (block.kind === 'kv') { const total = twip(contentPt); body += table(null, block.rows.map(([k, v]) => [k, v]), [Math.round(total * 0.32), Math.round(total * 0.68)]); }
    else if (block.kind === 'table') { const total = twip(contentPt); body += table(block.head, block.rows.map((r) => r.map((c) => String(c ?? ''))), block.head.map(() => Math.round(total / block.head.length))); }
    else if (block.kind === 'image') {
      imageId += 1;
      const file = `image${imageId}.png`;
      media[`word/media/${file}`] = dataUrlBytes(block.dataUrl);
      rels.push(`<Relationship Id="rImg${imageId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${file}"/>`);
      const scale = Math.min(1, contentPt / block.width);
      const cx = Math.round(block.width * scale * 12700); const cy = Math.round(block.height * scale * 12700);
      body += para(`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${imageId}" name="${xml(block.name)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${imageId}" name="${file}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rImg${imageId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`, { align: 'center', spacingAfter: 40 });
      if (block.caption) body += para(run(block.caption, { size: 17, color: '667085' }), { align: 'center', spacingAfter: 160 });
    }
  }
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="${twip(w)}" w:h="${twip(h)}"${settings.landscape ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': document,
    'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`,
    ...media,
  };
  return zipBlob(files);
}

// ───────────────────────── Markdown · CSV (with the pictures as files)

const mdCell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** { 'report.md': text, 'images/…png': bytes } */
export function toMarkdown(report, settings = defaultReportSettings()) {
  const out = [`# ${report.title}`, '', `_${report.date}_`, ''];
  const files = {};
  for (const block of selectedBlocks(report, settings.sections)) {
    if (block.kind === 'heading') out.push(`${'#'.repeat(block.level + 1)} ${block.text}`, '');
    else if (block.kind === 'text') out.push(block.text, '');
    else if (block.kind === 'kv') out.push('| | |', '|---|---|', ...block.rows.map(([k, v]) => `| ${mdCell(k)} | ${mdCell(v)} |`), '');
    else if (block.kind === 'table') out.push(`| ${block.head.map(mdCell).join(' | ')} |`, `|${block.head.map(() => '---').join('|')}|`, ...block.rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`), '');
    else if (block.kind === 'image') { files[`images/${block.name}`] = dataUrlBytes(block.dataUrl); out.push(`![${block.caption ?? block.name}](images/${block.name})`, ''); }
  }
  return { 'report.md': out.join('\n'), ...files };
}

const csvCell = (s) => { const v = String(s ?? ''); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };

/** { 'report.csv': text (UTF-8 with BOM, opens in Excel), 'images/…png': bytes } — a section per block. */
export function toCsv(report, settings = defaultReportSettings()) {
  const lines = [csvCell(report.title), csvCell(report.date), ''];
  const files = {};
  for (const block of selectedBlocks(report, settings.sections)) {
    if (block.kind === 'heading') lines.push(csvCell(`${block.level === 1 ? '## ' : '# '}${block.text}`));
    else if (block.kind === 'text') lines.push(csvCell(block.text), '');
    else if (block.kind === 'kv') lines.push(...block.rows.map(([k, v]) => `${csvCell(k)},${csvCell(v)}`), '');
    else if (block.kind === 'table') lines.push(block.head.map(csvCell).join(','), ...block.rows.map((r) => r.map(csvCell).join(',')), '');
    else if (block.kind === 'image') { files[`images/${block.name}`] = dataUrlBytes(block.dataUrl); lines.push(`${csvCell(block.caption ?? block.name)},${csvCell(`images/${block.name}`)}`, ''); }
  }
  return { 'report.csv': `﻿${lines.join('\r\n')}`, ...files };
}
