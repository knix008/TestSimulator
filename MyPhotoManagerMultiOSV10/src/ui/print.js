// Print and contact sheets. Pages are drawn on canvases (the same pictures go
// to the printer, or are saved as JPEG/PNG images).
import { baseName, joinPath } from '../catalog/catalog.js';
import { decodeImage } from '../formats/decode.js';
import { canvasToBlob } from '../formats/canvas.js';
import { kindOf } from '../formats/types.js';
import { plural, t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { invoke, isDesktop } from '../platform/native.js';
import { app, reload } from '../store.js';
import { thumbs } from '../thumbs/thumbs.js';
import { formatDate } from '../util/format.js';
import { field, openDialog, progressDialog, selectEl, toast } from './dialog.js';
import { h } from './dom.js';

const PAGES = { a4: [210, 297], letter: [215.9, 279.4], a3: [297, 420], '4x6': [101.6, 152.4] };
const DPI = 150;
const mm = (v) => Math.round((v / 25.4) * DPI);

async function pictureOf(item, maxSize) {
  const kind = kindOf(item.name);
  if (kind === 'video') {
    const thumb = await thumbs.get(item, 5);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = thumb.url;
    await img.decode();
    return img;
  }
  if (kind === 'native' || kind === 'svg') {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = await fs.url(item.path);
    await img.decode();
    return img;
  }
  return (await decodeImage(await fs.read(item.path), item.name, { maxSize })).source;
}

/** Draws the pages: returns canvases. */
export async function renderPages(items, options, progress) {
  const [pw, ph] = PAGES[options.page] ?? PAGES.a4;
  const portrait = options.orientation === 'portrait';
  const W = mm(portrait ? pw : ph);
  const H = mm(portrait ? ph : pw);
  const margin = mm(options.margin);
  const header = options.title ? mm(12) : 0;
  const captionLines = (options.name ? 1 : 0) + (options.date ? 1 : 0);
  const captionH = captionLines ? mm(4.2) * captionLines + mm(1) : 0;
  const cols = Math.max(1, options.columns);
  const rows = Math.max(1, options.rows);
  const perPage = cols * rows;
  const gap = mm(options.gap);
  const cellW = (W - margin * 2 - gap * (cols - 1)) / cols;
  const cellH = (H - margin * 2 - header - gap * (rows - 1)) / rows;
  const pages = [];
  for (let start = 0; start < items.length; start += perPage) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const c = canvas.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#111';
    if (options.title) {
      c.font = `bold ${mm(5)}px sans-serif`;
      c.textBaseline = 'top';
      c.fillText(options.title, margin, margin);
      c.font = `${mm(3)}px sans-serif`;
      c.textAlign = 'right';
      c.fillText(`${pages.length + 1} / ${Math.ceil(items.length / perPage)}`, W - margin, margin + mm(1.5));
      c.textAlign = 'left';
    }
    const slice = items.slice(start, start + perPage);
    for (const [i, item] of slice.entries()) {
      progress?.update(start + i, items.length, item.name);
      const x = margin + (i % cols) * (cellW + gap);
      const y = margin + header + Math.floor(i / cols) * (cellH + gap);
      const boxH = cellH - captionH;
      try {
        const picture = await pictureOf(item, Math.max(cellW, boxH) * 1.5);
        const w = picture.naturalWidth ?? picture.width;
        const hgt = picture.naturalHeight ?? picture.height;
        const k = options.fill ? Math.max(cellW / w, boxH / hgt) : Math.min(cellW / w, boxH / hgt);
        const dw = w * k;
        const dh = hgt * k;
        c.save();
        c.beginPath();
        c.rect(x, y, cellW, boxH);
        c.clip();
        c.imageSmoothingQuality = 'high';
        c.drawImage(picture, x + (cellW - dw) / 2, y + (boxH - dh) / 2, dw, dh);
        c.restore();
        if (options.border) { c.strokeStyle = '#bbb'; c.lineWidth = 1; c.strokeRect(x + (cellW - Math.min(dw, cellW)) / 2, y + (boxH - Math.min(dh, boxH)) / 2, Math.min(dw, cellW), Math.min(dh, boxH)); }
      } catch {
        c.fillStyle = '#eee';
        c.fillRect(x, y, cellW, boxH);
      }
      c.fillStyle = '#222';
      c.font = `${mm(3)}px sans-serif`;
      c.textBaseline = 'top';
      c.textAlign = 'center';
      let ty = y + boxH + mm(1);
      const fitText = (text) => { let s = text; while (s.length > 3 && c.measureText(s).width > cellW) s = `${s.slice(0, -2)}…`; return s; };
      if (options.name) { c.fillText(fitText(item.name), x + cellW / 2, ty); ty += mm(4.2); }
      if (options.date) {
        const record = app.catalog.get(item.path);
        c.fillStyle = '#666';
        c.fillText(fitText(formatDate(record?.meta?.taken ?? item.modified)), x + cellW / 2, ty);
      }
      c.textAlign = 'left';
    }
    pages.push(canvas);
  }
  return pages;
}

export async function printDialog(items) {
  const list = items.filter((item) => !item.isDir && kindOf(item.name));
  if (!list.length) return;
  const single = list.length === 1;
  const page = selectEl([['a4', 'A4'], ['letter', 'Letter'], ['a3', 'A3'], ['4x6', '4×6 in']], 'a4');
  const orientation = selectEl([['portrait', t('print.portrait')], ['landscape', t('print.landscape')]], 'portrait');
  const columns = h('input.input', { type: 'number', min: 1, max: 12, value: single ? 1 : 4 });
  const rows = h('input.input', { type: 'number', min: 1, max: 16, value: single ? 1 : 5 });
  const margin = h('input.input', { type: 'number', min: 0, max: 40, value: 10 });
  const gap = h('input.input', { type: 'number', min: 0, max: 20, value: 4 });
  const title = h('input.input', { type: 'text', value: single ? '' : (app.state.source.title ?? baseName(app.state.source.path ?? '') ?? '') });
  const name = h('input', { type: 'checkbox', checked: !single });
  const date = h('input', { type: 'checkbox', checked: false });
  const fill = h('input', { type: 'checkbox', checked: false });
  const border = h('input', { type: 'checkbox', checked: false });
  const output = selectEl([['print', t('print.toPrinter')], ['jpeg', t('print.toJpeg')], ['png', t('print.toPng')]], 'print');
  const ok = await openDialog({
    title: plural('print.title', list.length), width: 560,
    body: h('div',
      h('div.field-row', field(t('print.page'), page), field(t('print.orientation'), orientation)),
      h('div.field-row', field(t('print.columns'), columns), field(t('print.rows'), rows), field(t('print.margin'), margin), field(t('print.gap'), gap)),
      field(t('print.heading'), title),
      h('label.check', name, t('print.captionName')), h('label.check', date, t('print.captionDate')), h('label.check', fill, t('print.fill')), h('label.check', border, t('print.border')),
      field(t('print.output'), output)),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('print.run'), value: true, primary: true }],
  });
  if (!ok) return;
  const options = { page: page.value, orientation: orientation.value, columns: Number(columns.value), rows: Number(rows.value), margin: Number(margin.value), gap: Number(gap.value), title: title.value.trim(), name: name.checked, date: date.checked, fill: fill.checked, border: border.checked };
  const progress = progressDialog(t('print.preparing'));
  let pages;
  try { pages = await renderPages(list, options, progress); } finally { progress.close(); }
  if (output.value === 'print') return printPages(pages);
  // Save the sheets next to the photos (or download in a read-only browser folder).
  const folder = app.state.source.type === 'folder' ? app.state.source.path : null;
  const ext = output.value === 'png' ? 'png' : 'jpg';
  for (const [i, canvas] of pages.entries()) {
    const blob = await canvasToBlob(canvas, output.value === 'png' ? 'image/png' : 'image/jpeg', 0.92);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const fileName = `contact-sheet-${String(i + 1).padStart(2, '0')}.${ext}`;
    if (folder && fs.caps.write) await fs.write(joinPath(folder, fileName), bytes);
    else downloadBlob(blob, fileName);
  }
  toast(plural('print.saved', pages.length), 'success');
  if (folder) await reload();
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function printPages(pages) {
  document.getElementById('print-root')?.remove();
  const root = h('div#print-root');
  for (const canvas of pages) root.append(h('img.print-page', { src: canvas.toDataURL('image/jpeg', 0.92), alt: '' }));
  document.body.append(root);
  await Promise.all([...root.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));
  const cleanup = () => setTimeout(() => root.remove(), 500);
  window.addEventListener('afterprint', cleanup, { once: true });
  if (isDesktop()) await invoke('print_window').catch(() => window.print());
  else window.print();
}
