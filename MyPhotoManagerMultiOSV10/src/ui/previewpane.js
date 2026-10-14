// Preview pane: a larger picture of the focused item with its histogram and
// the main shooting data.
import { formatExposure } from '../formats/exif.js';
import { kindOf } from '../formats/types.js';
import { t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { app, focusedItem, viewItem } from '../store.js';
import { thumbs } from '../thumbs/thumbs.js';
import { formatDateTime, formatDims } from '../util/format.js';
import { clear, debounce, h } from './dom.js';
import { drawHistogram, histogramOf } from './histogram.js';

export function createPreviewPane() {
  const el = h('div.pane-body.preview-pane');
  let token = 0;

  async function render() {
    const item = focusedItem();
    const mine = ++token;
    clear(el);
    if (!item || item.isDir) { el.append(h('div.prop-empty', t('prop.nothingSelected'))); return; }
    const frame = h('div.preview-frame');
    const canvas = h('canvas.preview-histogram', { width: 256, height: 90 });
    const record = app.catalog.get(item.path) ?? {};
    const m = record.meta ?? {};
    const info = h('div.preview-info',
      h('div.preview-name', item.name),
      h('div', [formatDims(record.width, record.height), formatDateTime(m.taken ?? item.modified)].filter(Boolean).join(' · ')),
      h('div', [m.camera, m.exposure ? formatExposure(m.exposure) : '', m.fNumber ? `f/${m.fNumber}` : '', m.iso ? `ISO ${m.iso}` : '', m.focal ? `${m.focal} mm` : ''].filter(Boolean).join('  ')));
    el.append(frame, canvas, info);
    frame.addEventListener('dblclick', () => viewItem(item.path));
    const kind = kindOf(item.name);
    if (kind === 'video') {
      frame.append(h('video', { src: await fs.url(item.path), controls: true, muted: true, preload: 'metadata' }));
      return;
    }
    // Native formats load directly; others use the (larger) cached thumbnail.
    let src = null;
    if (kind === 'native' || kind === 'svg') src = await fs.url(item.path);
    else src = (await thumbs.get(item, 10))?.url;
    if (mine !== token || !src) return;
    const img = h('img', { crossOrigin: 'anonymous', src, alt: item.name, decoding: 'async' });
    frame.append(img);
    img.addEventListener('load', () => { if (mine === token) drawHistogram(canvas, histogramOf(img)); }, { once: true });
  }

  const later = debounce(() => { if (el.isConnected) render(); }, 120);
  app.on('selection', later);
  app.on('info', (path) => { if (path === app.state.focus) later(); });
  return { el, render };
}
