// Dashboard: what is in the catalog — totals, photos per year and month,
// cameras, lenses, ISO and focal lengths, file types, ratings and labels.
// Every chart is a single series (one hue); values are printed next to the
// bars, so the numbers are readable without the colour.
import { AUTO_CATEGORIES, LABEL_COLORS, LABELS, photoDate } from '../catalog/catalog.js';
import { extensionOf } from '../formats/types.js';
import { t } from '../i18n.js';
import { app, openSource } from '../store.js';
import { formatBytes, formatNumber } from '../util/format.js';
import { clear, debounce, h } from './dom.js';
import { icon } from './icons.js';

function tile(label, value, sub) {
  return h('div.stat-tile', h('div.stat-label', label), h('div.stat-value', value), sub ? h('div.stat-sub', sub) : null);
}

/** Horizontal bars with the value printed at the end; rows click through to the photos. */
function barList(title, entries, { onPick, color, limit = 10 } = {}) {
  const top = entries.slice(0, limit);
  const max = Math.max(1, ...top.map(([, n]) => n));
  const rest = entries.slice(limit).reduce((s, [, n]) => s + n, 0);
  const rows = top.map(([label, n, swatch]) => {
    const row = h('button.bar-row', { type: 'button', title: `${label}: ${formatNumber(n)}` },
      h('span.bar-label', swatch ? h('span.swatch', { style: { background: swatch } }) : null, label),
      h('span.bar-track', h('span.bar-fill', { style: { width: `${(n / max) * 100}%`, background: color ?? '' } })),
      h('span.bar-value', formatNumber(n)));
    if (onPick) row.addEventListener('click', () => onPick(label));
    else row.disabled = true;
    return row;
  });
  if (rest) rows.push(h('div.bar-row.other', h('span.bar-label', t('dash.other')), h('span.bar-track'), h('span.bar-value', formatNumber(rest))));
  return h('section.dash-card', h('h3', title), entries.length ? rows : h('div.cat-empty', t('dash.noData')));
}

/** Vertical bars over time (years or months), with a hover tooltip. */
function timeline(title, entries, onPick) {
  const max = Math.max(1, ...entries.map(([, n]) => n));
  const tip = h('div.chart-tip', { hidden: true });
  const chart = h('div.timeline', entries.map(([label, n, key]) => {
    const bar = h('button.time-bar', { type: 'button', 'aria-label': `${label}: ${n}` }, h('span.time-fill', { style: { height: `${(n / max) * 100}%` } }), h('span.time-label', label));
    bar.addEventListener('pointerenter', () => { tip.hidden = false; tip.textContent = `${label} · ${formatNumber(n)}`; });
    bar.addEventListener('pointermove', (e) => { const r = chart.getBoundingClientRect(); tip.style.left = `${e.clientX - r.left + 12}px`; tip.style.top = `${e.clientY - r.top - 28}px`; });
    bar.addEventListener('pointerleave', () => { tip.hidden = true; });
    bar.addEventListener('click', () => onPick?.(key));
    return bar;
  }), tip);
  return h('section.dash-card.wide', h('h3', title), entries.length ? chart : h('div.cat-empty', t('dash.noData')));
}

export function createDashboard() {
  const el = h('div.dashboard');

  function render() {
    clear(el);
    const records = [...app.catalog.files.entries()].filter(([, r]) => r.indexed);
    const counts = app.catalog.counts();
    const total = records.length;
    const bytes = records.reduce((s, [, r]) => s + (r.size ?? 0), 0);
    const dated = records.map(([, r]) => photoDate(r)).filter(Boolean);
    const withGps = records.filter(([, r]) => r.meta?.lat != null).length;
    const folders = new Set(records.map(([p]) => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))))).size;

    el.append(h('div.dash-head', h('h2', t('dash.title')), h('p.dash-note', t('dash.note'))));
    el.append(h('div.stat-row',
      tile(t('dash.photos'), formatNumber(total), formatBytes(bytes)),
      tile(t('dash.folders'), formatNumber(folders)),
      tile(t('dash.span'), dated.length ? `${new Date(Math.min(...dated)).getFullYear()} – ${new Date(Math.max(...dated)).getFullYear()}` : '–'),
      tile(t('dash.rated'), formatNumber(total - counts.ratings[0]), total ? `${Math.round(((total - counts.ratings[0]) / total) * 100)}%` : ''),
      tile(t('dash.geotagged'), formatNumber(withGps), total ? `${Math.round((withGps / total) * 100)}%` : ''),
      tile(t('dash.keywords'), formatNumber(Object.keys(counts.keywords).length))));

    if (!total) {
      el.append(h('div.dash-empty', h('span', { html: icon('chart') }), h('p', t('dash.empty'))));
      return;
    }

    const byYear = new Map();
    const byMonth = new Map();
    for (const when of dated) {
      const d = new Date(when);
      byYear.set(d.getFullYear(), (byYear.get(d.getFullYear()) ?? 0) + 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
    }
    const years = [...byYear].sort((a, b) => a[0] - b[0]);
    const pickYear = (y) => openSource({ type: 'calendar', filters: [{ type: 'date', from: new Date(y, 0, 1).getTime(), to: new Date(y + 1, 0, 1).getTime() }], title: String(y) });
    el.append(timeline(t('dash.byYear'), years.map(([y, n]) => [String(y), n, y]), pickYear));
    const lastYear = years.length ? years[years.length - 1][0] : new Date().getFullYear();
    const months = Array.from({ length: 12 }, (_, m) => [new Date(lastYear, m, 1).toLocaleDateString(undefined, { month: 'short' }), byMonth.get(`${lastYear}-${String(m + 1).padStart(2, '0')}`) ?? 0, m]);
    el.append(timeline(t('dash.byMonth', { year: lastYear }), months, (m) => openSource({ type: 'calendar', filters: [{ type: 'date', from: new Date(lastYear, m, 1).getTime(), to: new Date(lastYear, m + 1, 1).getTime() }], title: `${lastYear}-${m + 1}` })));

    const grid = h('div.dash-grid');
    const auto = (key) => {
      const map = new Map();
      for (const [, r] of records) { const v = AUTO_CATEGORIES[key](r); if (v != null) map.set(v, (map.get(v) ?? 0) + 1); }
      return [...map].sort((a, b) => b[1] - a[1]);
    };
    const pickAuto = (key) => (value) => openSource({ type: 'filter', filters: [{ type: 'auto', key, value }], title: `${t(`auto.${key}`)}: ${value}` });
    grid.append(barList(t('auto.camera'), auto('camera'), { onPick: pickAuto('camera') }));
    grid.append(barList(t('auto.lens'), auto('lens'), { onPick: pickAuto('lens') }));
    const order = (list, keys) => list.sort((a, b) => keys.indexOf(a[0]) - keys.indexOf(b[0]));
    grid.append(barList(t('auto.iso'), auto('iso').sort((a, b) => Number.parseInt(a[0].replace(/\D/g, ''), 10) - Number.parseInt(b[0].replace(/\D/g, ''), 10)), { onPick: pickAuto('iso'), limit: 12 }));
    grid.append(barList(t('auto.focal'), auto('focal').sort((a, b) => Number.parseInt(a[0].replace(/\D/g, ''), 10) - Number.parseInt(b[0].replace(/\D/g, ''), 10)), { onPick: pickAuto('focal'), limit: 12 }));
    const types = new Map();
    for (const [path] of records) { const ext = extensionOf(path).toUpperCase() || '—'; types.set(ext, (types.get(ext) ?? 0) + 1); }
    grid.append(barList(t('dash.types'), [...types].sort((a, b) => b[1] - a[1])));
    grid.append(barList(t('catalog.ratings'), [5, 4, 3, 2, 1, 0].map((n) => [n ? '★'.repeat(n) : t('catalog.unrated'), counts.ratings[n]]), {
      limit: 6, onPick: (label) => { const n = label.startsWith('★') ? label.length : 0; openSource({ type: 'filter', filters: [{ type: 'rating', value: n }], title: label }); },
    }));
    grid.append(barList(t('catalog.labels'), order(LABELS.map((l) => [t(`label.${l}`), counts.labels[l], LABEL_COLORS[l]]), []), {
      onPick: (label) => { const l = LABELS.find((x) => t(`label.${x}`) === label); openSource({ type: 'filter', filters: [{ type: 'label', value: l }], title: label }); },
    }));
    const keywords = Object.entries(counts.keywords).sort((a, b) => b[1] - a[1]);
    grid.append(barList(t('catalog.keywords'), keywords, { onPick: (k) => openSource({ type: 'filter', filters: [{ type: 'keyword', value: k }], title: `#${k}` }) }));
    el.append(grid);
  }

  const later = debounce(() => { if (el.isConnected) render(); }, 400);
  app.on('catalog', later);
  return { el, render };
}
