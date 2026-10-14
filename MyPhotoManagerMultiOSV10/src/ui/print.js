// Print and contact sheets. The settings are on the left and a live preview of
// the pages on the right; Print sends the pages straight to the chosen printer
// (desktop, no second preview), or saves them as PDF / JPEG / PNG.
// Pages are drawn on canvases: the preview at low resolution, the output at
// print resolution.
import { baseName, joinPath } from '../catalog/catalog.js';
import { buildPdf } from '../create/pdf.js';
import { decodeImage } from '../formats/decode.js';
import { canvasToBlob } from '../formats/canvas.js';
import { kindOf } from '../formats/types.js';
import { plural, t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { chooseSavePath, errorText, invoke, isDesktop } from '../platform/native.js';
import { app, reload } from '../store.js';
import { thumbs } from '../thumbs/thumbs.js';
import { formatDate } from '../util/format.js';
import { field, openDialog, progressDialog, selectEl, toast } from './dialog.js';
import { debounce, h } from './dom.js';

/** Paper sizes in millimetres (portrait). */
export const PAPERS = {
  a3: [297, 420], a4: [210, 297], a5: [148, 210], b5: [176, 250], letter: [215.9, 279.4], legal: [215.9, 355.6], tabloid: [279.4, 431.8],
  '4x6': [101.6, 152.4], '5x7': [127, 177.8], '8x10': [203.2, 254], custom: null,
};
const PAPER_LABELS = { a3: 'A3', a4: 'A4', a5: 'A5', b5: 'B5', letter: 'Letter', legal: 'Legal', tabloid: 'Tabloid', '4x6': '4×6 in', '5x7': '5×7 in', '8x10': '8×10 in' };
export const PRINT_DPI = 300;

export const DEFAULT_PRINT = Object.freeze({
  paper: 'a4', width: 210, height: 297, orientation: 'auto', columns: 1, rows: 1, gap: 4,
  marginTop: 10, marginBottom: 10, marginLeft: 10, marginRight: 10,
  fit: 'fit', autoRotate: true, border: false, name: false, date: false, rating: false,
  title: '', footer: '', pageNumbers: true, copies: 1, color: true, duplex: 'none', printer: '', output: 'print',
});

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

/** Paper size in mm (width, height) for the options, turned to the orientation. */
export function paperSize(options, items = []) {
  const base = options.paper === 'custom' ? [Number(options.width) || 210, Number(options.height) || 297] : PAPERS[options.paper] ?? PAPERS.a4;
  const [pw, ph] = [Math.min(...base), Math.max(...base)];
  let landscape = options.orientation === 'landscape';
  if (options.orientation === 'auto') {
    // One picture per page: follow the picture; a grid: follow the grid.
    const cols = Math.max(1, options.columns);
    const rows = Math.max(1, options.rows);
    if (cols * rows === 1 && items[0]?.width) landscape = items[0].width > items[0].height;
    else landscape = cols > rows;
  }
  return landscape ? [ph, pw] : [pw, ph];
}

/** Draws the pages at `dpi`: returns canvases. `pictures` caches decoded pictures between previews. */
export async function renderPages(items, options, { dpi = PRINT_DPI, progress, pictures = new Map() } = {}) {
  const mm = (v) => Math.round((v / 25.4) * dpi);
  const [pwMm, phMm] = paperSize(options, items.map((i) => app.catalog.get(i.path) ?? {}));
  const W = mm(pwMm);
  const H = mm(phMm);
  const m = { top: mm(options.marginTop), bottom: mm(options.marginBottom), left: mm(options.marginLeft), right: mm(options.marginRight) };
  const header = options.title ? mm(10) : 0;
  const footer = options.footer || options.pageNumbers ? mm(7) : 0;
  const captionLines = (options.name ? 1 : 0) + (options.date ? 1 : 0) + (options.rating ? 1 : 0);
  const captionH = captionLines ? mm(4.2) * captionLines + mm(1) : 0;
  const cols = Math.max(1, Number(options.columns) || 1);
  const rows = Math.max(1, Number(options.rows) || 1);
  const perPage = cols * rows;
  const gap = mm(options.gap);
  const cellW = (W - m.left - m.right - gap * (cols - 1)) / cols;
  const cellH = (H - m.top - m.bottom - header - footer - gap * (rows - 1)) / rows;
  const total = Math.ceil(items.length / perPage);
  const pages = [];
  for (let start = 0; start < items.length; start += perPage) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const c = canvas.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#111';
    c.textBaseline = 'top';
    if (options.title) {
      c.font = `bold ${mm(5)}px sans-serif`;
      c.fillText(options.title, m.left, m.top);
    }
    if (footer) {
      c.font = `${mm(3)}px sans-serif`;
      c.fillStyle = '#555';
      if (options.footer) c.fillText(options.footer, m.left, H - m.bottom - mm(4));
      if (options.pageNumbers) { c.textAlign = 'right'; c.fillText(`${pages.length + 1} / ${total}`, W - m.right, H - m.bottom - mm(4)); c.textAlign = 'left'; }
    }
    const slice = items.slice(start, start + perPage);
    for (const [i, item] of slice.entries()) {
      progress?.update(start + i, items.length, item.name);
      const x = m.left + (i % cols) * (cellW + gap);
      const y = m.top + header + Math.floor(i / cols) * (cellH + gap);
      const boxH = cellH - captionH;
      try {
        const key = `${item.path}@${Math.round(Math.max(cellW, boxH))}`;
        let picture = pictures.get(key);
        if (!picture) { picture = await pictureOf(item, Math.max(cellW, boxH) * 1.2); pictures.set(key, picture); }
        let w = picture.naturalWidth ?? picture.width;
        let hgt = picture.naturalHeight ?? picture.height;
        // Auto-rotate: a landscape picture in a portrait cell (or the reverse) is turned 90°.
        const turn = options.autoRotate && (w > hgt) !== (cellW > boxH) && Math.abs(w - hgt) > 2 && Math.abs(cellW - boxH) > 2;
        if (turn) [w, hgt] = [hgt, w];
        const k = options.fit === 'fill' ? Math.max(cellW / w, boxH / hgt) : Math.min(cellW / w, boxH / hgt);
        const dw = w * k;
        const dh = hgt * k;
        c.save();
        c.beginPath();
        c.rect(x, y, cellW, boxH);
        c.clip();
        c.imageSmoothingQuality = 'high';
        c.translate(x + cellW / 2, y + boxH / 2);
        if (turn) c.rotate(Math.PI / 2);
        const [drawW, drawH] = turn ? [dh, dw] : [dw, dh];
        c.drawImage(picture, -drawW / 2, -drawH / 2, drawW, drawH);
        c.restore();
        if (options.border) { c.strokeStyle = '#999'; c.lineWidth = Math.max(1, mm(0.2)); c.strokeRect(x + (cellW - Math.min(dw, cellW)) / 2, y + (boxH - Math.min(dh, boxH)) / 2, Math.min(dw, cellW), Math.min(dh, boxH)); }
      } catch {
        c.fillStyle = '#eee';
        c.fillRect(x, y, cellW, boxH);
      }
      c.fillStyle = '#222';
      c.font = `${mm(3)}px sans-serif`;
      c.textAlign = 'center';
      let ty = y + boxH + mm(1);
      const fitText = (text) => { let s = text; while (s.length > 3 && c.measureText(s).width > cellW) s = `${s.slice(0, -2)}…`; return s; };
      const record = app.catalog.get(item.path);
      if (options.name) { c.fillText(fitText(item.name), x + cellW / 2, ty); ty += mm(4.2); }
      if (options.date) { c.fillStyle = '#666'; c.fillText(fitText(formatDate(record?.meta?.taken ?? item.modified)), x + cellW / 2, ty); ty += mm(4.2); }
      if (options.rating) { c.fillStyle = '#c08a00'; c.fillText('★'.repeat(record?.rating ?? 0) || '—', x + cellW / 2, ty); }
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
  const saved = { ...DEFAULT_PRINT, ...(app.settings.print ?? {}) };
  const o = { ...saved, columns: single ? 1 : saved.columns > 1 || saved.rows > 1 ? saved.columns : 4, rows: single ? 1 : saved.columns > 1 || saved.rows > 1 ? saved.rows : 5, title: single ? '' : (app.state.source.title ?? baseName(app.state.source.path ?? '') ?? '') };

  // ── controls (each change redraws the preview)
  const num = (key, min, max, step = 1) => { const input = h('input.input', { type: 'number', min, max, step, value: o[key], dataset: { key } }); input.addEventListener('input', () => { o[key] = Number(input.value); later(); }); return input; };
  const check = (key, label) => { const box = h('input', { type: 'checkbox', checked: Boolean(o[key]), dataset: { key } }); box.addEventListener('change', () => { o[key] = box.checked; later(); }); return h('label.check', box, label); };
  const choose = (key, options) => { const select = selectEl(options, o[key], (v) => { o[key] = v === 'true' ? true : v === 'false' ? false : v; sync(); later(); }); select.dataset.key = key; return select; };
  const text = (key) => { const input = h('input.input', { type: 'text', value: o[key], dataset: { key } }); input.addEventListener('input', () => { o[key] = input.value; later(); }); return input; };

  const printerSelect = choose('printer', [['', t('print.defaultPrinter')]]);
  if (isDesktop()) {
    invoke('list_printers').then((printers) => {
      printerSelect.replaceChildren(...[['', t('print.defaultPrinter')], ...printers.map((p) => [p.name, p.default ? `${p.name} ★` : p.name])].map(([v, label]) => h('option', { value: v, selected: v === o.printer }, label)));
    }).catch(() => {});
  }
  const paper = choose('paper', [...Object.keys(PAPER_LABELS).map((id) => [id, PAPER_LABELS[id]]), ['custom', t('print.customPaper')]]);
  const customRow = h('div.field-row', field(t('print.paperWidth'), num('width', 50, 1200)), field(t('print.paperHeight'), num('height', 50, 1200)));
  const layoutPreset = selectEl([['', t('print.layoutPreset')], ['1x1', t('print.onePerPage')], ['2x2', '2 × 2'], ['3x3', '3 × 3'], ['4x5', t('print.contactSheet')], ['2x4', t('print.wallet')]], '', (v) => {
    if (!v) return;
    const [c, r] = v.split('x').map(Number);
    o.columns = c; o.rows = r;
    controls.querySelector('[data-key=columns]').value = c;
    controls.querySelector('[data-key=rows]').value = r;
    later();
  });
  const sync = () => { customRow.hidden = o.paper !== 'custom'; };
  const controls = h('div.print-controls',
    isDesktop() ? h('fieldset.print-group', h('legend', t('print.printer')), field(t('print.printer'), printerSelect),
      h('div.field-row', field(t('print.copies'), num('copies', 1, 99)), field(t('print.color'), choose('color', [[true, t('print.colorColor')], [false, t('print.colorGray')]])), field(t('print.duplex'), choose('duplex', [['none', t('print.duplexNone')], ['long', t('print.duplexLong')], ['short', t('print.duplexShort')]])))) : '',
    h('fieldset.print-group', h('legend', t('print.paper')),
      h('div.field-row', field(t('print.page'), paper), field(t('print.orientation'), choose('orientation', [['auto', t('create.auto')], ['portrait', t('print.portrait')], ['landscape', t('print.landscape')]]))),
      customRow),
    h('fieldset.print-group', h('legend', t('print.layout')),
      field(t('print.layoutPreset'), layoutPreset),
      h('div.field-row', field(t('print.columns'), num('columns', 1, 12)), field(t('print.rows'), num('rows', 1, 16)), field(t('print.gap'), num('gap', 0, 30))),
      h('div.field-row', field(t('print.fitMode'), choose('fit', [['fit', t('print.fitWhole')], ['fill', t('print.fill')]]))),
      check('autoRotate', t('print.autoRotate')), check('border', t('print.border'))),
    h('fieldset.print-group', h('legend', t('print.margins')),
      h('div.field-row', field(t('print.marginTop'), num('marginTop', 0, 60)), field(t('print.marginBottom'), num('marginBottom', 0, 60))),
      h('div.field-row', field(t('print.marginLeft'), num('marginLeft', 0, 60)), field(t('print.marginRight'), num('marginRight', 0, 60)))),
    h('fieldset.print-group', h('legend', t('print.captions')),
      check('name', t('print.captionName')), check('date', t('print.captionDate')), check('rating', t('print.captionRating')),
      field(t('print.heading'), text('title')), field(t('print.footer'), text('footer')), check('pageNumbers', t('print.pageNumbers'))),
    h('fieldset.print-group', h('legend', t('print.output')),
      field(t('print.output'), choose('output', [...(isDesktop() ? [['print', t('print.toPrinter')]] : [['print', t('print.toPrinterBrowser')]]), ['pdf', 'PDF'], ['jpeg', t('print.toJpeg')], ['png', t('print.toPng')]]))));
  sync();

  // ── preview (right)
  const pageCanvas = h('canvas.print-preview-page');
  const pageLabel = h('span.print-page-label', '');
  const info = h('div.print-preview-info', '');
  let preview = [];
  let index = 0;
  const pictures = new Map();
  const showPage = () => {
    const page = preview[index];
    pageLabel.textContent = preview.length ? t('view.page', { n: index + 1, total: preview.length }) : '';
    if (!page) return;
    pageCanvas.width = page.width;
    pageCanvas.height = page.height;
    pageCanvas.getContext('2d').drawImage(page, 0, 0);
  };
  let drawToken = 0;
  const redraw = async () => {
    const mine = ++drawToken;
    const pages = await renderPages(list, o, { dpi: 42, pictures });
    if (mine !== drawToken) return;
    preview = pages;
    index = Math.min(index, pages.length - 1);
    const [w, hh] = paperSize(o, list.map((i) => app.catalog.get(i.path) ?? {}));
    info.textContent = `${Math.round(w)} × ${Math.round(hh)} mm · ${plural('print.pages', pages.length)}`;
    showPage();
  };
  const later = debounce(redraw, 200);
  const nav = h('div.print-preview-nav',
    h('button.btn.small', { type: 'button', id: 'print-prev', onclick: () => { if (index > 0) { index -= 1; showPage(); } } }, '<'),
    pageLabel,
    h('button.btn.small', { type: 'button', id: 'print-next', onclick: () => { if (index < preview.length - 1) { index += 1; showPage(); } } }, '>'));
  const previewBox = h('div.print-preview', h('div.print-preview-paper', pageCanvas), nav, info);
  redraw();

  const ok = await openDialog({
    title: plural('print.title', list.length), width: 1000, id: 'print-dialog',
    body: h('div.print-layout', controls, previewBox),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('print.run'), value: true, primary: true }],
  });
  if (!ok) return;
  app.settings.print = { ...o, title: '' };
  app.saveSettings();
  const progress = progressDialog(t('print.preparing'));
  let pages;
  try { pages = await renderPages(list, o, { progress }); } finally { progress.close(); }
  try {
    await outputPages(pages, o);
  } catch (error) {
    toast(t('print.failed', { error: errorText(error) }), 'error', 8000);
  }
}

/** Sends the finished pages where the options say (printer, PDF, images). */
async function outputPages(pages, o) {
  if (o.output === 'print') return printPages(pages, o);
  const folder = app.state.source.type === 'folder' ? app.state.source.path : null;
  if (o.output === 'pdf') {
    const [w, hh] = [pages[0].width, pages[0].height].map((px) => (px / PRINT_DPI) * 72);
    const jpegs = [];
    for (const page of pages) jpegs.push(new Uint8Array(await (await canvasToBlob(page, 'image/jpeg', 0.92)).arrayBuffer()));
    const bytes = buildPdf(jpegs.map((jpeg) => ({ jpeg, pageWidth: w, pageHeight: hh, fit: 'fill' })), { title: o.title || 'MyPhotoManager' });
    return saveBytes(bytes, 'print.pdf', folder, [{ name: 'PDF', extensions: ['pdf'] }]);
  }
  const ext = o.output === 'png' ? 'png' : 'jpg';
  for (const [i, canvas] of pages.entries()) {
    const blob = await canvasToBlob(canvas, o.output === 'png' ? 'image/png' : 'image/jpeg', 0.92);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const fileName = `contact-sheet-${String(i + 1).padStart(2, '0')}.${ext}`;
    if (folder && fs.caps.write) await fs.write(joinPath(folder, fileName), bytes);
    else downloadBlob(blob, fileName);
  }
  toast(plural('print.saved', pages.length), 'success');
  if (folder) await reload();
  return undefined;
}

async function saveBytes(bytes, name, folder, filters) {
  if (isDesktop()) {
    const target = await chooseSavePath(folder ? joinPath(folder, name) : name, filters);
    if (!target) return;
    await fs.write(target, bytes);
    toast(t('create.saved', { name: baseName(target) }), 'success');
    if (folder) await reload();
  } else {
    downloadBlob(new Blob([bytes]), name);
  }
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Puts the pages (alone) on the page and prints them: desktop = straight to the printer. */
async function printPages(pages, o) {
  document.getElementById('print-root')?.remove();
  const [wMm, hMm] = [pages[0].width, pages[0].height].map((px) => (px / PRINT_DPI) * 25.4);
  const root = h('div#print-root');
  const style = h('style', `@page { size: ${wMm}mm ${hMm}mm; margin: 0; }`);
  for (const canvas of pages) root.append(h('img.print-page', { src: canvas.toDataURL('image/jpeg', 0.92), alt: '', style: { width: `${wMm}mm`, height: `${hMm}mm` } }));
  document.body.append(style, root);
  await Promise.all([...root.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));
  const cleanup = () => setTimeout(() => { root.remove(); style.remove(); }, 500);
  try {
    if (isDesktop()) {
      document.body.classList.add('printing');
      const landscape = wMm > hMm;
      await invoke('print_direct', { options: { printer: o.printer, copies: Math.max(1, Number(o.copies) || 1), landscape, pageWidth: Math.min(wMm, hMm) / 25.4, pageHeight: Math.max(wMm, hMm) / 25.4, color: o.color !== false, duplex: o.duplex } });
      toast(plural('print.sent', pages.length), 'success');
    } else {
      window.addEventListener('afterprint', cleanup, { once: true });
      window.print();
      return;
    }
  } finally {
    document.body.classList.remove('printing');
    if (isDesktop()) cleanup();
  }
}
