// What the Print button prints: the active document of the main window.
//   editor tab      -> its text as code (M files with syntax colours)
//   variable tab    -> the variable editor's grid as a table
//   figures tab     -> the current figure as an image (rendered for paper)
//   model tab       -> the whole diagram drawn for paper, and a plot of every scope with
//                      results (src/sim/printModel.js); the visible canvas only as a fallback
// Images carry save(format, transparent) → file bytes (이미지로 저장).
//   no document, or the focus in the Command Window -> the Command Window text
import { openPrintDialog } from './index.js';
import { pt } from './i18n';
import { toast } from '../lib/ui';
import { exportFigureBytes } from '../graphics/paint.js';
import { bytesToBase64, encodeCanvas } from '../graphics/encode.js';
import { simEditor } from '../sim/editorApi';
import { isMFile } from '../../core/lang/mext.js';
import { modelPrintImages } from '../sim/printModel';
import { figureTitle } from '../graphics/scene.js';
import { esc } from './printdoc';

/** The doc page of a kind that is shown (display != none). */
function shownPage(kind) {
  return [...document.querySelectorAll(`.doc-page[data-doc="${kind}"]`)].find((el) => el.style.display !== 'none' && el.offsetParent !== null) || null;
}

export function printCommandWindow() {
  const out = document.querySelector('[data-pane="cmd"] .cw-out') || document.querySelector('.cw-out');
  const runs = [];
  if (out) {
    for (const el of out.children) {
      if (el.classList.contains('cw-hint')) continue;
      const stream = [...el.classList].find((c) => /^cw-(?!hint|frames)\w+$/.test(c));
      let text = el.textContent || '';
      if (el.classList.contains('cw-frames')) text = [...el.children].map((c) => c.textContent).join('\n') + '\n';
      runs.push(stream && stream !== 'cw-out' ? { t: text, c: stream } : { t: text });
    }
  }
  if (!runs.some((r) => r.t.trim())) { toast(pt('nothing'), 'warn'); return Promise.resolve({ ok: false }); }
  return openPrintDialog({ title: pt('cmd_title'), kind: 'text', runs });
}

/** The current figure of a figure controller (window.__msmFigures by default). */
export async function printFigure(ctl = typeof window !== 'undefined' ? window.__msmFigures : null) {
  const fig = ctl && ctl.figure ? ctl.figure() : null;
  if (!fig) { toast(pt('figure_none'), 'warn'); return { ok: false }; }
  const { width, height } = ctl.sizeOf(fig);
  const out = await exportFigureBytes(fig, { format: 'png', width, height, scale: 3, background: 'white' }, ctl.paintOptions(fig));
  const title = figureTitle(fig, 'Figure {n}');
  const save = async (format, transparent) => (await exportFigureBytes(fig, { format, width, height, scale: 3, background: transparent ? 'none' : 'white' }, ctl.paintOptions(fig))).bytes;
  return openPrintDialog({
    title, kind: 'image', images: [{ dataUrl: `data:${out.mime};base64,${bytesToBase64(out.bytes)}`, widthPx: width, heightPx: height, caption: title, role: 'figure', save }],
    setup: width > height * 1.05 ? { landscape: true } : undefined,
  });
}

/** Mean luminance (0..1) of a canvas, sampled. */
function luminance(canvas) {
  try {
    const w = 64;
    const h = Math.max(1, Math.round((canvas.height / Math.max(1, canvas.width)) * 64));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(canvas, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    return sum / (d.length / 4);
  } catch { return 1; }
}

/** A model: the whole diagram for paper, then the scopes with results (the editor of doc, editorApi.js). */
async function printModel(doc) {
  const api = simEditor(doc.id);
  if (api && api.model) {
    const items = modelPrintImages(api);
    const images = items.map((im) => ({
      dataUrl: im.render({ scale: 3 }).toDataURL('image/png'), widthPx: im.width, heightPx: im.height, caption: im.caption, role: im.role,
      save: (format, transparent) => encodeCanvas(im.render({ scale: 3, transparent }), format, { transparent }),
    }));
    const d = items[0];
    return openPrintDialog({ title: doc.title, kind: 'image', images, setup: d.width > d.height * 1.05 ? { landscape: true } : undefined });
  }
  return printModelCanvas(doc);
}

function printModelCanvas(doc) {
  const page = shownPage('model');
  const canvases = page ? [...page.querySelectorAll('canvas')].filter((c) => c.width > 0 && c.height > 0 && c.offsetParent !== null) : [];
  const canvas = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!canvas) { toast(pt('model_none'), 'warn'); return Promise.resolve({ ok: false }); }
  let url;
  try { url = canvas.toDataURL('image/png'); } catch { toast(pt('model_none'), 'warn'); return Promise.resolve({ ok: false }); }
  const dark = luminance(canvas) < 0.45;
  return openPrintDialog({
    title: doc.title, kind: 'image', imageDataUrl: url, imageWidthPx: canvas.clientWidth || canvas.width, lightenable: dark,
    setup: { ...(canvas.width > canvas.height * 1.05 ? { landscape: true } : {}), ...(dark ? { lighten: true } : {}) },
  });
}

function printVariable(doc) {
  const page = shownPage('var');
  const table = page && page.querySelector('table');
  const pre = page && page.querySelector('pre');
  let inner = '';
  if (table) {
    const t = table.cloneNode(true);
    t.querySelectorAll('input, button, textarea').forEach((x) => x.replaceWith(document.createTextNode(x.value || x.textContent || '')));
    t.removeAttribute('style');
    t.className = 'msp-grid';
    t.querySelectorAll('[style]').forEach((x) => x.removeAttribute('style'));
    // Rows and columns past the data (the editing row) are left out when empty.
    t.querySelectorAll('tr').forEach((tr) => { if (![...tr.cells].some((c) => c.textContent.trim()) && tr.parentElement.tagName !== 'THEAD') tr.remove(); });
    inner = t.outerHTML;
  } else if (pre) inner = `<pre>${esc(pre.textContent)}</pre>`;
  if (!inner) { toast(pt('nothing'), 'warn'); return Promise.resolve({ ok: false }); }
  const head = page.querySelector('.ve-info, .ve-head-line, .pane-head');
  const caption = head && head.textContent.trim() ? `<p class="msp-caption">${esc(head.textContent.trim())}</p>` : '';
  return openPrintDialog({ title: doc.title, kind: 'html', html: `${caption}${inner}` });
}

/**
 * Prints what the user is looking at: doc = the active document of App
 * ({ id, kind, title, path }) or null; editorApi = the registered editor of
 * a file doc (getText).
 */
export function printActiveDocument({ doc, editorApi } = {}) {
  const inCmd = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-pane="cmd"]');
  if (!doc || inCmd) return printCommandWindow();
  if (doc.kind === 'file') {
    const text = editorApi && editorApi.editor ? editorApi.editor.getText() : '';
    const isM = isMFile(doc.title || doc.path || '');
    return openPrintDialog({ title: doc.title, kind: 'code', text, language: isM ? 'm' : '' });
  }
  if (doc.kind === 'figures') return printFigure();
  if (doc.kind === 'model') return printModel(doc);
  if (doc.kind === 'var') return printVariable(doc);
  return printCommandWindow();
}
