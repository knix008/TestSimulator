// The data visualizer window (ImHex): bytes of the document drawn as a picture in a pixel format (8-bit grey,
// RGB, RGBA, 565, 1-bit, 4-bit palette), as a digram (which byte follows which) or as an entropy map. Clicking a
// pixel selects its bytes in the hex view. The pixels come from src/domain/visual.js.
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { bytesPerPixel, pixelOffset, renderPixels, VISUAL_MODES } from '../domain/visual.js';

const MAX = 4 << 20;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let v = null;

export function resetVisualizer() { v = null; }

export function visualizerBody(c) {
  const g = (v ??= { mode: 'gray8', width: 256, zoom: 2, source: 'selection', data: null, base: 0, image: null, block: 256, loading: false });
  if (!g.data && !g.loading) load(c);
  const modes = VISUAL_MODES.map(([id]) => [id, t(`visual.mode.${id}`)]);
  const info = g.data ? t('visual.info', { from: g.base.toString(16).toUpperCase(), n: g.data.length.toLocaleString(), w: g.image?.width ?? 0, h: g.image?.height ?? 0 }) : t('props.loading');
  const html = `<div class="tw-line">${c.sel('vis-mode', modes, g.mode, t('visual.mode'), 'image')}
      <label class="tw-field" title="${esc(t('visual.width'))}">${icon('columns')}<input type="number" min="1" max="4096" data-tw="vis-width" value="${g.width}" ${g.mode === 'digram' ? 'disabled' : ''} aria-label="${esc(t('visual.width'))}" /></label>
      ${c.sel('vis-zoom', [[1, '1×'], [2, '2×'], [4, '4×'], [8, '8×']], g.zoom, t('visual.zoom'), 'zoomIn')}
      ${c.sel('vis-source', [['selection', t('visual.fromSelection')], ['caret', t('visual.fromCaret')], ['all', t('scope.all')]], g.source, t('visual.source'), 'selectAll')}
      <span class="grow"></span>${c.btn('vis-refresh', t('visual.refresh'), 'refresh', 'primary')}</div>
    <p class="tw-message muted">${icon('info')}<span data-vis-info>${esc(info)}</span></p>${c.errorLine()}
    <div class="vis-wrap"><canvas class="vis-canvas" data-vis-canvas title="${esc(t('visual.clickHint'))}"></canvas></div>`;
  return { icon: 'image', title: t('tool.visualizer'), html };
}

async function load(c) {
  const g = v;
  g.loading = true;
  try {
    const where = await c.call('visualRange', { source: g.source, max: MAX });
    const r = await c.call('core', { method: 'read', args: { id: 'active', offset: where.offset, length: where.length } });
    g.base = where.offset;
    g.data = fromB64(r.data);
    g.image = renderPixels(g.data, g.mode, g.width, { block: g.block });
  } catch (error) { c.setError(error); g.data = new Uint8Array(0); }
  g.loading = false;
  c.redraw();
}

/** Puts the pixels on the canvas (after each draw of the window). */
export function visualizerPaint(root) {
  const canvas = root.querySelector('[data-vis-canvas]');
  if (!canvas || !v?.image) return;
  const { width, height, rgba } = v.image;
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width * v.zoom}px`;
  canvas.style.height = `${height * v.zoom}px`;
  const ctx2d = canvas.getContext('2d');
  ctx2d.putImageData(new ImageData(rgba, width, height), 0, 0);
}

export async function visualizerClick(c, target, event) {
  const act = target.closest('[data-tw-act]')?.dataset.twAct;
  if (act === 'vis-refresh') { v.data = null; v.image = null; c.redraw(); return true; }
  const canvas = target.closest('[data-vis-canvas]');
  if (canvas && v?.image) {
    const box = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - box.left) / box.width) * v.image.width);
    const y = Math.floor(((event.clientY - box.top) / box.height) * v.image.height);
    if (v.mode === 'digram') {
      // a digram cell: find where byte y is followed by byte x
      const at = v.data.findIndex((b, i) => b === y && v.data[i + 1] === x);
      if (at >= 0) await c.call('select', { offset: v.base + at, length: 2 });
      return true;
    }
    const o = pixelOffset(v.mode, v.image.width, x, y, v.data.length, { block: v.block });
    if (o != null) {
      const per = v.mode === 'entropy' ? v.block : Math.max(1, Math.ceil(bytesPerPixel(v.mode)));
      await c.call('select', { offset: v.base + o, length: Math.min(per, v.data.length - o) });
    }
    return true;
  }
  return false;
}

export function visualizerChange(c, el) {
  const key = el.dataset.tw;
  if (!['vis-mode', 'vis-width', 'vis-zoom', 'vis-source'].includes(key) || !v) return false;
  if (key === 'vis-mode') v.mode = el.value;
  if (key === 'vis-width') v.width = Math.max(1, Math.min(4096, Number(el.value) || 256));
  if (key === 'vis-zoom') v.zoom = Number(el.value);
  if (key === 'vis-source') { v.source = el.value; v.data = null; c.redraw(); return true; }
  if (v.data) v.image = renderPixels(v.data, v.mode, v.width, { block: v.block });
  c.redraw();
  return true;
}
