// Printing the model: pictures from one or more directions laid out on A4
// sheets, with the model's details at the top. The sheets are drawn on a
// canvas as JPEGs and go either straight to a printer the user picked
// (desktop: src-tauri/src/print.rs) or through the system print window
// (a hidden frame with one picture per page).
import { buildPrintHtml } from './print-html.js';

export const PRINT_LAYOUTS = ['view', 'views4', 'views6', 'sheets'];
export const PRINT_ORIENTATIONS = ['auto', 'portrait', 'landscape'];

// The views each layout prints (VIEW_PRESETS names; null = the view as it is).
export const LAYOUT_VIEWS = {
  view: [null],
  views4: ['front', 'right', 'top', 'iso'],
  views6: ['front', 'back', 'left', 'right', 'top', 'iso'],
  sheets: ['front', 'right', 'top', 'iso'],
};

// A4 at 150 dpi.
const A4 = { portrait: [1240, 1754], landscape: [1754, 1240] };
const MARGIN = 70;

export function clampCopies(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(99, Math.max(1, v)) : 1;
}

export function choosePrinter(picked, { printers = [], default: def } = {}) {
  if (picked && printers.includes(picked)) return picked;
  if (def && printers.includes(def)) return def;
  return printers[0] || '';
}

// Portrait or landscape: "auto" turns the sheet to suit the layout.
export function resolveLandscape(orientation, layout) {
  if (orientation === 'landscape') return true;
  if (orientation === 'portrait') return false;
  return layout === 'view' || layout === 'views6';
}

// Rows × columns for a number of pictures on one sheet.
export function gridFor(n, landscape) {
  if (n <= 1) return [1, 1];
  if (n <= 4) return [2, 2];
  return landscape ? [2, 3] : [3, 2];
}

// The shots to take: { direction, width, height } per picture.
export function shotsFor(layout, landscape) {
  const views = LAYOUT_VIEWS[layout] || LAYOUT_VIEWS.view;
  const [pw, ph] = landscape ? A4.landscape : A4.portrait;
  const perSheet = layout === 'sheets' ? 1 : views.length;
  const [rows, cols] = gridFor(perSheet, landscape);
  const w = Math.round((pw - MARGIN * 2) / cols) - 20;
  const h = Math.round((ph - MARGIN * 2 - 230) / rows) - 50;
  return views.map((direction) => ({ direction, width: Math.max(200, w), height: Math.max(200, h) }));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawHeader(ctx, pw, info, pageText) {
  ctx.fillStyle = '#111';
  ctx.font = 'bold 40px "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  ctx.fillText(info.title || 'MyStableFast3D', MARGIN, MARGIN + 36);
  ctx.font = '22px "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  ctx.fillStyle = '#444';
  (info.lines || []).slice(0, 4).forEach((line, i) => ctx.fillText(line, MARGIN, MARGIN + 84 + i * 32));
  ctx.textAlign = 'right';
  ctx.fillStyle = '#888';
  ctx.fillText(pageText, pw - MARGIN, MARGIN + 36);
  ctx.textAlign = 'left';
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, MARGIN + 200);
  ctx.lineTo(pw - MARGIN, MARGIN + 200);
  ctx.stroke();
}

// Lays the pictures out on sheets. shots: [{ dataUrl, label }]. Returns
// JPEG data URLs, one per sheet.
export async function composeSheets({ shots, layout, landscape, info, includeInfo = true, footer = '' }) {
  const [pw, ph] = landscape ? A4.landscape : A4.portrait;
  const perSheet = layout === 'sheets' ? 1 : shots.length;
  const groups = [];
  for (let i = 0; i < shots.length; i += perSheet) groups.push(shots.slice(i, i + perSheet));
  const out = [];
  for (let g = 0; g < groups.length; g++) {
    const c = document.createElement('canvas');
    c.width = pw;
    c.height = ph;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, pw, ph);
    const top = includeInfo ? MARGIN + 230 : MARGIN;
    if (includeInfo) drawHeader(ctx, pw, info, groups.length > 1 ? `${g + 1} / ${groups.length}` : '');
    const [rows, cols] = gridFor(groups[g].length, landscape);
    const cellW = (pw - MARGIN * 2) / cols;
    const cellH = (ph - top - MARGIN - 40) / rows;
    for (let i = 0; i < groups[g].length; i++) {
      const shot = groups[g][i];
      const img = await loadImage(shot.dataUrl);
      const cx = MARGIN + (i % cols) * cellW;
      const cy = top + Math.floor(i / cols) * cellH;
      const room = { w: cellW - 20, h: cellH - 50 };
      const s = Math.min(room.w / img.width, room.h / img.height);
      const w = img.width * s;
      const h = img.height * s;
      const x = cx + (cellW - w) / 2;
      ctx.drawImage(img, x, cy, w, h);
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, cy, w, h);
      if (shot.label) {
        ctx.fillStyle = '#333';
        ctx.font = '22px "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(shot.label, cx + cellW / 2, cy + h + 32);
        ctx.textAlign = 'left';
      }
    }
    if (footer) {
      ctx.fillStyle = '#999';
      ctx.font = '18px "Segoe UI", sans-serif';
      ctx.fillText(footer, MARGIN, ph - MARGIN / 2);
    }
    out.push(c.toDataURL('image/jpeg', 0.92));
  }
  return out;
}

export function dataUrlBytes(dataUrl) {
  const bin = atob(String(dataUrl).split(',')[1] || '');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// u32 LE count, a u32 LE length per page, the pages (src-tauri print::split_pages).
export function framePages(pages) {
  const list = pages.map((p) => (typeof p === 'string' ? dataUrlBytes(p) : p));
  const total = 4 + list.length * 4 + list.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, list.length, true);
  let at = 4 + list.length * 4;
  list.forEach((b, i) => {
    view.setUint32(4 + i * 4, b.length, true);
    out.set(b, at);
    at += b.length;
  });
  return out;
}

// Through the system print window: the sheets in a hidden frame.
export async function printViaBrowser(pages, title) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
  const cleanup = () => frame.remove();
  await new Promise((resolve, reject) => {
    frame.onload = resolve;
    frame.onerror = reject;
    frame.srcdoc = buildPrintHtml(pages.map((src) => ({ src })), title);
    document.body.appendChild(frame);
  });
  const doc = frame.contentDocument;
  await Promise.all([...doc.images].map((img) => img.decode().catch(() => {})));
  const win = frame.contentWindow;
  win.addEventListener('afterprint', () => setTimeout(cleanup, 500), { once: true });
  setTimeout(cleanup, 10 * 60 * 1000);
  win.focus();
  win.print();
}
