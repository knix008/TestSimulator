// Report → PDF. Korean text would need an embedded font, so each A4 page is
// drawn on a canvas (system fonts) and the pages go into the PDF as JPEG images.
// pdfFromJpegs() — the PDF bytes — is pure (unit-tested in Node); the drawing
// functions below it need the DOM (canvas, Image) and run only in the app.
import { chartSvg, REPORT_FONT, TONES } from './report-export.js';

const ascii = (text) => Uint8Array.from(text, (ch) => ch.charCodeAt(0) & 0xff);
const pdfTextString = (text) => `<FEFF${[...String(text)].map((ch) => {
  const code = ch.codePointAt(0);
  if (code < 0x10000) return code.toString(16).padStart(4, '0');
  const v = code - 0x10000;
  return ((0xd800 | (v >> 10)).toString(16) + (0xdc00 | (v & 0x3ff)).toString(16)).toUpperCase();
}).join('').toUpperCase()}>`;

/**
 * A PDF with one page per JPEG: [{ jpeg: Uint8Array, width, height }] (pixels),
 * each image stretched over a page of pageWidth × pageHeight points (A4 default).
 */
export function pdfFromJpegs(pages, { title = '', pageWidth = 595.28, pageHeight = 841.89 } = {}) {
  const chunks = [];
  let length = 0;
  const offsets = [];
  const push = (part) => {
    const bytes = typeof part === 'string' ? ascii(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (n, ...parts) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    for (const part of parts) push(part);
    push('\nendobj\n');
  };
  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary marker
  const W = pageWidth.toFixed(2);
  const H = pageHeight.toFixed(2);
  const pageIds = pages.map((_, i) => 4 + i * 3);
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  object(3, `<< /Title ${pdfTextString(title)} /Producer (MyWorkPlan) /Creator (MyWorkPlan) >>`);
  pages.forEach((page, i) => {
    const id = pageIds[i];
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
    object(id + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    object(id + 2, `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`, page.jpeg, '\nendstream');
  });
  const count = 4 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

// ───────────────────────── drawing (DOM)

// A4 at 144 dpi: 2 px per PDF point.
const PAGE_W = 1190;
const PAGE_H = 1684;
const MARGIN = 84;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = PAGE_H - MARGIN - 36;
const font = (size, weight = 400) => `${weight} ${size}px ${REPORT_FONT}`;
const C = { text: '#111827', muted: '#6b7280', faint: '#9ca3af', line: '#e5e7eb', head: '#eef2f7', band: '#fafbfc', accent: '#2f6fde' };

async function svgImage(svg) {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  return image;
}

async function canvasBytes(canvas, type, quality) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  if (blob) return new Uint8Array(await blob.arrayBuffer());
  const data = canvas.toDataURL(type, quality).split(',')[1];
  return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
}

/** Lines of text that fit a width (breaks at spaces, or anywhere in CJK / long words). */
function wrap(ctx, text, width) {
  const lines = [];
  for (const paragraph of String(text ?? '').split(/\r?\n/)) {
    let line = '';
    for (const ch of paragraph) {
      const next = line + ch;
      if (ctx.measureText(next).width <= width || !line) { line = next; continue; }
      const space = line.lastIndexOf(' ');
      if (ch !== ' ' && space > 0 && space > line.length - 20) {
        lines.push(line.slice(0, space));
        line = line.slice(space + 1) + ch;
      } else {
        lines.push(line);
        line = ch === ' ' ? '' : ch;
      }
    }
    lines.push(line);
  }
  return lines;
}

function fitText(ctx, text, width) {
  let s = String(text ?? '');
  if (ctx.measureText(s).width <= width) return s;
  while (s && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1);
  return `${s}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The report laid out on A4 canvases (one per page). */
export async function renderReportPages(model, { onProgress } = {}) {
  const pages = [];
  let ctx;
  let y = 0;
  const newPage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.textBaseline = 'alphabetic';
    pages.push(canvas);
    y = MARGIN;
  };
  const ensure = (h) => { if (y + h > BOTTOM && y > MARGIN + 1) newPage(); };
  newPage();

  // Header.
  ctx.fillStyle = C.accent;
  ctx.font = font(20, 700);
  ctx.fillText('MYWORKPLAN', MARGIN, y + 20);
  ctx.fillStyle = C.text;
  ctx.font = font(44, 700);
  for (const text of wrap(ctx, model.title, CONTENT_W)) { y += 58; ctx.fillText(text, MARGIN, y + 20); }
  ctx.fillStyle = C.muted;
  ctx.font = font(24);
  y += 64;
  ctx.fillText(fitText(ctx, [model.project, model.date].filter(Boolean).join(' · '), CONTENT_W), MARGIN, y);
  y += 22;
  ctx.fillStyle = C.accent;
  ctx.fillRect(MARGIN, y, CONTENT_W, 4);
  y += 44;

  const heading = (title, following) => {
    if (!title) return;
    ensure(56 + following);
    ctx.fillStyle = '#1f2937';
    ctx.font = font(30, 700);
    ctx.fillText(fitText(ctx, title, CONTENT_W), MARGIN, y + 30);
    y += 52;
  };
  const note = (text) => {
    ctx.font = font(22);
    for (const line of wrap(ctx, text, CONTENT_W)) {
      ensure(32);
      ctx.fillStyle = C.muted;
      ctx.font = font(22);
      ctx.fillText(line, MARGIN, y + 22);
      y += 32;
    }
    y += 12;
  };
  const table = (data) => {
    if (!data.rows.length) { note(data.empty ?? ''); return; }
    const size = 20;
    const lineH = 28;
    const pad = 10;
    ctx.font = font(size, 700);
    const natural = data.columns.map((col, i) => {
      ctx.font = font(size, 700);
      let w = ctx.measureText(col.label).width;
      ctx.font = font(size);
      for (const row of data.rows.slice(0, 300)) w = Math.max(w, ctx.measureText(String(row[i] ?? '')).width);
      return Math.min(w + pad * 2, CONTENT_W * 0.45);
    });
    const total = natural.reduce((a, b) => a + b, 0);
    const widths = natural.map((w) => (w / total) * CONTENT_W);
    const xs = widths.reduce((acc, w, i) => [...acc, acc[i] + w], [MARGIN]);
    const drawRow = (cells, header, band) => {
      ctx.font = font(size, header ? 700 : 400);
      const wrapped = cells.map((cell, i) => wrap(ctx, cell, widths[i] - pad * 2));
      const h = Math.max(...wrapped.map((lines) => lines.length)) * lineH + pad * 2 - 6;
      return { h, draw: () => {
        if (header || band) { ctx.fillStyle = header ? C.head : C.band; ctx.fillRect(MARGIN, y, CONTENT_W, h); }
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(MARGIN, y, CONTENT_W, h);
        for (let i = 1; i < widths.length; i++) { ctx.beginPath(); ctx.moveTo(xs[i], y); ctx.lineTo(xs[i], y + h); ctx.stroke(); }
        ctx.fillStyle = C.text;
        ctx.font = font(size, header ? 700 : 400);
        wrapped.forEach((lines, i) => {
          const align = data.columns[i]?.align;
          ctx.textAlign = align === 'right' ? 'right' : align === 'center' ? 'center' : 'left';
          const x = align === 'right' ? xs[i + 1] - pad : align === 'center' ? (xs[i] + xs[i + 1]) / 2 : xs[i] + pad;
          lines.forEach((line, k) => ctx.fillText(line, x, y + pad + 18 + k * lineH));
        });
        ctx.textAlign = 'left';
        y += h;
      } };
    };
    const header = () => drawRow(data.columns.map((col) => col.label), true, false);
    let head = header();
    ensure(head.h * 2);
    head.draw();
    data.rows.forEach((row, r) => {
      const line = drawRow(row.map((cell) => String(cell ?? '')), false, r % 2 === 1);
      if (y + line.h > BOTTOM) { newPage(); head = header(); head.draw(); }
      line.draw();
    });
    y += 28;
  };

  const total = model.blocks.length;
  for (const [index, block] of model.blocks.entries()) {
    onProgress?.(index, total);
    if (block.type === 'note') { note(block.text); continue; }
    if (block.type === 'kpis') {
      const cols = 3;
      const gap = 18;
      const cardW = (CONTENT_W - gap * (cols - 1)) / cols;
      const cardH = 104;
      block.items.forEach((item, i) => {
        if (i % cols === 0) { if (i) y += cardH + gap; ensure(cardH); }
        const x = MARGIN + (i % cols) * (cardW + gap);
        roundRect(ctx, x, y, cardW, cardH, 14);
        ctx.fillStyle = C.band;
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = C.muted;
        ctx.font = font(20);
        ctx.fillText(fitText(ctx, item.label, cardW - 36), x + 18, y + 36);
        ctx.fillStyle = TONES[item.tone] ?? C.text;
        ctx.font = font(30, 700);
        ctx.fillText(fitText(ctx, item.value, cardW - 36), x + 18, y + 80);
      });
      y += cardH + 40;
      continue;
    }
    if (block.type === 'table') { heading(block.title, 90); table(block); continue; }
    const chart = chartSvg(block);
    if (!chart) continue;
    let scale = Math.min(block.type === 'donut' ? 1.6 : 2, CONTENT_W / chart.width);
    if (chart.height * scale > BOTTOM - MARGIN - 60) scale = (BOTTOM - MARGIN - 60) / chart.height;
    const w = chart.width * scale;
    const h = chart.height * scale;
    heading(block.title, h);
    ensure(h);
    const image = await svgImage(chart.svg);
    ctx.drawImage(image, MARGIN + (CONTENT_W - w) / 2, y, w, h);
    y += h + 24;
    if (block.note) note(block.note);
  }

  // Footers: "project · report" and "n / N".
  pages.forEach((canvas, i) => {
    const c = canvas.getContext('2d');
    c.font = font(18);
    c.fillStyle = C.faint;
    c.textAlign = 'left';
    c.fillText(fitText(c, [model.project, model.title].filter(Boolean).join(' · '), CONTENT_W - 200), MARGIN, PAGE_H - MARGIN + 30);
    c.textAlign = 'right';
    c.fillText(`${i + 1} / ${pages.length}`, PAGE_W - MARGIN, PAGE_H - MARGIN + 30);
    c.textAlign = 'left';
  });
  onProgress?.(total, total);
  return pages;
}

/** The report as PDF bytes. */
export async function reportToPdf(model, { onProgress } = {}) {
  const canvases = await renderReportPages(model, { onProgress });
  const pages = [];
  for (const canvas of canvases) pages.push({ jpeg: await canvasBytes(canvas, 'image/jpeg', 0.9), width: canvas.width, height: canvas.height });
  return pdfFromJpegs(pages, { title: [model.title, model.project].filter(Boolean).join(' — ') });
}

/** Chart blocks rendered as PNG for the Word document: { [blockIndex]: { png, width, height } }. */
export async function chartPngs(model, scale = 2) {
  const out = {};
  for (const [index, block] of model.blocks.entries()) {
    const chart = chartSvg(block);
    if (!chart) continue;
    const image = await svgImage(chart.svg);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(chart.width * scale);
    canvas.height = Math.round(chart.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    out[index] = { png: await canvasBytes(canvas, 'image/png'), width: chart.width, height: chart.height };
  }
  return out;
}
