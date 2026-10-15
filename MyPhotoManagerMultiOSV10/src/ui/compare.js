// Compare: 2–4 photos side by side with linked zoom and pan, their shooting
// data (differences highlighted) and rating / delete per photo.
import { decodeImage } from '../formats/decode.js';
import { formatExposure } from '../formats/exif.js';
import { kindOf } from '../formats/types.js';
import { t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { app, deleteItems } from '../store.js';
import { formatBytes, formatDateTime, formatDims } from '../util/format.js';
import { h } from './dom.js';
import { icon } from './icons.js';

export async function openCompare(items) {
  const list = items.filter((item) => !item.isDir && kindOf(item.name) && kindOf(item.name) !== 'video').slice(0, 4);
  if (list.length < 2) return;
  let scale = null; // null = fit
  let offset = { x: 0, y: 0 };
  const panels = [];
  const grid = h(`div.compare-grid.n${list.length}`);
  const close = () => { root.remove(); document.removeEventListener('keydown', keys, true); };
  const bar = h('div.compare-bar',
    h('span.compare-title', t('compare.title', { n: list.length })),
    h('button.tool', { type: 'button', title: t('view.fit'), html: icon('fit'), onclick: () => { scale = null; offset = { x: 0, y: 0 }; apply(); } }),
    h('button.tool', { type: 'button', title: t('view.actual'), html: icon('actual'), onclick: () => { scale = 1; apply(); } }),
    h('button.tool', { type: 'button', title: t('view.zoomIn'), html: icon('zoomIn'), onclick: () => zoomBy(1.25) }),
    h('button.tool', { type: 'button', title: t('view.zoomOut'), html: icon('zoomOut'), onclick: () => zoomBy(0.8) }),
    h('div.tool-spacer'),
    h('button.btn', { type: 'button', onclick: close }, t('common.close')));
  const root = h('div.compare', bar, grid);
  document.body.append(root);

  const values = (item) => {
    const record = app.catalog.get(item.path) ?? {};
    const m = record.meta ?? {};
    return {
      [t('prop.dimensions')]: formatDims(record.width, record.height),
      [t('prop.size')]: formatBytes(item.size),
      [t('exif.taken')]: formatDateTime(m.taken),
      [t('exif.camera')]: m.camera ?? '',
      [t('exif.lens')]: m.lens ?? '',
      [t('exif.exposure')]: [m.exposure ? formatExposure(m.exposure) : '', m.fNumber ? `f/${m.fNumber}` : '', m.iso ? `ISO ${m.iso}` : ''].filter(Boolean).join(' '),
      [t('exif.focal')]: m.focal ? `${m.focal} mm` : '',
    };
  };
  const all = list.map(values);

  for (const [i, item] of list.entries()) {
    const view = h('div.compare-view');
    const info = h('table.prop-table.small', Object.entries(all[i]).map(([k, v]) => h(`tr${all.some((other) => other[k] !== v) ? '.diff' : ''}`, h('th', k), h('td', v))));
    const stars = h('div.prop-stars');
    const drawStars = () => {
      const rating = app.catalog.get(item.path)?.rating ?? 0;
      stars.replaceChildren(...[1, 2, 3, 4, 5].map((n) => h(`button.star${rating >= n ? '.on' : ''}`, { type: 'button', html: icon(rating >= n ? 'starFill' : 'star'), onclick: () => { app.catalog.setRating([item.path], rating === n ? 0 : n); drawStars(); } })));
    };
    drawStars();
    const panel = h('div.compare-panel', h('div.compare-name', item.name), view, h('div.compare-foot', stars,
      h('button.tool', { type: 'button', title: t('file.delete'), html: icon('trash'), onclick: async () => { await deleteItems([item.path]); panel.classList.add('deleted'); } })), info);
    grid.append(panel);
    const entry = { item, view, el: null, width: 0, height: 0 };
    panels.push(entry);
    load(entry);
  }

  async function load(entry) {
    const kind = kindOf(entry.item.name);
    let el;
    if (kind === 'native' || kind === 'svg') {
      const url = await fs.objectUrl(entry.item.path);
      el = h('img.viewer-media', { crossOrigin: 'anonymous', src: url, alt: '', draggable: false });
      try { await el.decode(); } catch { /* the panel stays empty if the file cannot be shown */ }
      URL.revokeObjectURL(url);
      entry.width = el.naturalWidth; entry.height = el.naturalHeight;
    } else {
      const decoded = await decodeImage(await fs.read(entry.item.path), entry.item.name);
      el = document.createElement('canvas');
      el.width = decoded.source.width; el.height = decoded.source.height;
      el.getContext('2d').drawImage(decoded.source, 0, 0);
      el.className = 'viewer-media';
      entry.width = el.width; entry.height = el.height;
    }
    entry.el = el;
    entry.view.append(el);
    apply();
  }

  function fitOf(entry) {
    return Math.min(1, (entry.view.clientWidth - 4) / entry.width, (entry.view.clientHeight - 4) / entry.height);
  }

  function apply() {
    for (const entry of panels) {
      if (!entry.el) continue;
      const k = scale ?? fitOf(entry);
      entry.el.style.width = `${entry.width}px`;
      entry.el.style.height = `${entry.height}px`;
      entry.el.style.transform = `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${k})`;
    }
  }

  function zoomBy(f) {
    const base = scale ?? Math.min(...panels.filter((p) => p.el).map(fitOf));
    scale = Math.max(0.05, Math.min(16, base * f));
    apply();
  }

  grid.addEventListener('wheel', (event) => { event.preventDefault(); zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  grid.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    const start = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    grid.setPointerCapture(event.pointerId);
    const move = (e) => { offset = { x: start.ox + e.clientX - start.x, y: start.oy + e.clientY - start.y }; apply(); };
    const up = () => { grid.removeEventListener('pointermove', move); grid.removeEventListener('pointerup', up); };
    grid.addEventListener('pointermove', move);
    grid.addEventListener('pointerup', up);
  });
  new ResizeObserver(apply).observe(grid);
  const keys = (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
  };
  document.addEventListener('keydown', keys, true);
}
