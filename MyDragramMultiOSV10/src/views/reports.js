// Shape reports (Visio "Shape Reports"): an inventory of the shapes by master,
// the shape data (with totals of number fields), the connections between
// shapes, the pages, the layers and all the text. A report is plain data
// (reportModel: title, blocks of kpis / bars / donut / table / note) that the
// view draws here and export/report-export.js writes as HTML, Markdown, Word
// and PDF, so what is exported is what is shown.
import { icon } from '../icons.js';
import { escapeHtml } from '../ui/dom.js';
import { valueAxis } from '../ui/axes.js';
import { dataKeys, findShape, formatLength, isConnector, isGroup, statistics, topLevel } from '../domain/diagram.js';
import { masterById } from '../domain/stencils.js';

export const REPORTS = [
  ['inventory', 'reportInventory'],
  ['shapeData', 'reportData'],
  ['connections', 'reportConnections'],
  ['pages', 'reportPages'],
  ['layers', 'reportLayers'],
  ['text', 'reportText'],
];

const label = (shape, lang) => {
  if (!shape) return '';
  const text = String(shape.text ?? '').split('\n')[0].trim();
  return shape.name || text || (isConnector(shape) ? '' : masterById(shape.master).name[lang === 'en' ? 'en' : 'ko']);
};

/** A report as plain data. `app` gives doc(), t, language(), settings(). */
export function reportModel(app, id = 'inventory') {
  const t = app.t;
  const lang = app.language();
  const doc = app.doc().doc;
  const pages = doc.pages;
  const stats = statistics(doc);
  const count = (v) => String(Math.round(v * 100) / 100);
  const bars = (title, items, format = count) => ({
    type: 'bars', title, empty: t('report.none'),
    axis: valueAxis(Math.max(1, ...items.map((item) => item.value)), 'count', { language: lang }, 4, 5),
    items: items.map((item) => ({ label: item.label, value: item.value, tone: item.tone ?? null, text: format(item.value), second: null, secondText: '' })),
  });
  const blocks = [];
  if (id === 'inventory') {
    blocks.push({ type: 'kpis', items: [
      { label: t('report.pages'), value: String(stats.pages) }, { label: t('report.shapes'), value: String(stats.shapes) }, { label: t('report.connectors'), value: String(stats.connectors) },
      { label: t('report.groups'), value: String(stats.groups) }, { label: t('report.withData'), value: String(stats.data) }, { label: t('report.comments'), value: String(stats.comments) },
    ] });
    const byMaster = [...stats.byMaster.entries()].map(([master, value]) => ({ label: masterById(master).name[lang === 'en' ? 'en' : 'ko'], value })).sort((a, b) => b.value - a.value);
    blocks.push(bars(t('report.byMaster'), byMaster.slice(0, 20)));
    const byCat = new Map();
    for (const [master, value] of stats.byMaster) { const cat = masterById(master).cat ?? 'custom'; byCat.set(cat, (byCat.get(cat) ?? 0) + value); }
    blocks.push(bars(t('report.byStencil'), [...byCat.entries()].map(([cat, value]) => ({ label: t(`stencil.${cat}`, null, cat), value })).sort((a, b) => b.value - a.value)));
    blocks.push({ type: 'table', title: t('report.inventoryTable'), empty: t('report.none'), columns: [{ label: t('report.master') }, { label: t('report.count'), align: 'right' }], rows: byMaster.map((item) => [item.label, String(item.value)]) });
  } else if (id === 'shapeData') {
    const keys = dataKeys(pages);
    const rows = [];
    const sums = new Map();
    for (const page of pages) for (const shape of page.shapes) {
      if (!shape.data?.length) continue;
      rows.push([page.name, label(shape, lang), ...keys.map((key) => shape.data.find((f) => f.key === key)?.value ?? '')]);
      for (const f of shape.data) { const v = Number(f.value); if (f.value !== '' && Number.isFinite(v)) sums.set(f.key, (sums.get(f.key) ?? 0) + v); }
    }
    blocks.push({ type: 'kpis', items: [{ label: t('report.withData'), value: String(rows.length) }, { label: t('report.fieldCount'), value: String(keys.length) }, ...[...sums.entries()].slice(0, 4).map(([key, v]) => ({ label: t('report.total', { name: key }), value: count(v) }))] });
    if (sums.size) blocks.push(bars(t('report.numberTotals'), [...sums.entries()].map(([key, value]) => ({ label: key, value }))));
    blocks.push({ type: 'table', title: t('report.dataTable'), empty: t('report.noData'), columns: [{ label: t('field.page') }, { label: t('field.name') }, ...keys.map((key) => ({ label: key }))], rows });
  } else if (id === 'connections') {
    const rows = [];
    const degree = new Map();
    for (const page of pages) for (const shape of page.shapes) {
      if (!isConnector(shape)) continue;
      const a = shape.from.id ? topLevel(page, shape.from.id) : null;
      const b = shape.to.id ? topLevel(page, shape.to.id) : null;
      rows.push([page.name, a ? label(a, lang) : t('report.free'), b ? label(b, lang) : t('report.free'), String(shape.text ?? '').replace(/\n/g, ' '), t(`route.${shape.route}`)]);
      for (const s of [a, b]) if (s) degree.set(s.id, { shape: s, n: (degree.get(s.id)?.n ?? 0) + 1 });
    }
    blocks.push({ type: 'kpis', items: [{ label: t('report.connectors'), value: String(rows.length) }, { label: t('report.glued'), value: String(rows.filter((r) => r[1] !== t('report.free') && r[2] !== t('report.free')).length) }] });
    blocks.push(bars(t('report.mostConnected'), [...degree.values()].sort((x, y) => y.n - x.n).slice(0, 12).map((item) => ({ label: label(item.shape, lang), value: item.n }))));
    blocks.push({ type: 'table', title: t('report.connectionTable'), empty: t('report.none'), columns: [{ label: t('field.page') }, { label: t('report.from') }, { label: t('report.to') }, { label: t('field.text') }, { label: t('report.route') }], rows });
  } else if (id === 'pages') {
    const rows = pages.map((page) => [page.name, page.background ? t('common.yes') : '', `${formatLength(page.width, doc.units)} × ${formatLength(page.height, doc.units)}`, String(page.shapes.filter((s) => !isConnector(s) && !isGroup(s)).length), String(page.shapes.filter(isConnector).length), String(page.layers.length), page.backgroundId ? pages.find((p) => p.id === page.backgroundId)?.name ?? '' : '']);
    blocks.push(bars(t('report.shapesPerPage'), pages.map((page) => ({ label: page.name, value: page.shapes.filter((s) => !isGroup(s)).length }))));
    blocks.push({ type: 'table', title: t('report.pageTable'), empty: t('report.none'), columns: [{ label: t('field.page') }, { label: t('page.backgroundPage') }, { label: t('report.size') }, { label: t('report.shapes'), align: 'right' }, { label: t('report.connectors'), align: 'right' }, { label: t('report.layers'), align: 'right' }, { label: t('page.background') }], rows });
  } else if (id === 'layers') {
    const rows = [];
    for (const page of pages) {
      for (const layer of page.layers) rows.push([page.name, layer.name, String(page.shapes.filter((s) => s.layers?.includes(layer.id)).length), layer.visible ? t('common.yes') : t('common.no'), layer.print ? t('common.yes') : t('common.no'), layer.locked ? t('common.yes') : t('common.no')]);
      const none = page.shapes.filter((s) => !s.layers?.length && !isGroup(s)).length;
      rows.push([page.name, t('report.noLayer'), String(none), '', '', '']);
    }
    blocks.push({ type: 'note', text: t('report.layersHint') });
    blocks.push({ type: 'table', title: '', empty: t('report.none'), columns: [{ label: t('field.page') }, { label: t('report.layer') }, { label: t('report.shapes'), align: 'right' }, { label: t('layer.visible'), align: 'center' }, { label: t('layer.print'), align: 'center' }, { label: t('layer.locked'), align: 'center' }], rows });
  } else if (id === 'text') {
    const rows = [];
    for (const page of pages) for (const shape of page.shapes) if (String(shape.text ?? '').trim()) rows.push([page.name, isConnector(shape) ? t('shape.connector') : masterById(shape.master).name[lang === 'en' ? 'en' : 'ko'], String(shape.text).replace(/\n/g, ' / ')]);
    blocks.push({ type: 'note', text: t('report.textHint', { count: rows.length }) });
    blocks.push({ type: 'table', title: '', empty: t('report.none'), columns: [{ label: t('field.page') }, { label: t('field.master') }, { label: t('field.text') }], rows });
  }
  const now = new Date();
  return {
    id, title: t(`report.${id}`), project: doc.title || '', date: now.toLocaleDateString(lang === 'en' ? 'en-US' : 'ko-KR'), language: lang, blocks,
    labels: { item: t('report.exportItem'), value: t('report.exportValue'), date: t('report.exportDate'), generated: t('report.exportGenerated') },
  };
}

export class ReportsView {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    host.classList.add('reports-view');
    host.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-report]');
      if (tab) { app.doc().view.report = tab.dataset.report; this.render(); app.renderToolbarState(); return; }
      const action = event.target.closest('[data-report-action]');
      if (action?.dataset.reportAction === 'export') app.run('exportReport', { element: action });
      if (action?.dataset.reportAction === 'copy') app.run('copyReport');
    });
    host.addEventListener('contextmenu', (event) => { event.preventDefault(); app.contextMenu(event, 'report', {}); });
  }

  get report() { return this.app.doc().view.report ?? 'inventory'; }

  render() {
    const t = this.app.t;
    const id = REPORTS.some(([r]) => r === this.report) ? this.report : 'inventory';
    const model = reportModel(this.app, id);
    this.host.innerHTML = `
      <nav class="report-tabs" role="tablist">${REPORTS.map(([report, glyph]) => `<button class="report-tab ${report === id ? 'active' : ''}" data-report="${report}" role="tab" aria-selected="${report === id}" title="${escapeHtml(t(`report.${report}`))}">${icon(glyph)}<span>${escapeHtml(t(`report.${report}`))}</span></button>`).join('')}</nav>
      <div class="report-page">
        <div class="report-title">${icon(REPORTS.find(([r]) => r === id)?.[1] ?? 'viewReports')}<h2>${escapeHtml(model.title)}</h2><span class="muted">${escapeHtml(model.project)} · ${escapeHtml(model.date)}</span><span class="grow"></span>
          <button class="small-button" data-report-action="export" title="${escapeHtml(t('tip.exportReport'))}">${icon('exportReport')}<span>${escapeHtml(t('action.exportReport'))}</span></button>
          <button class="small-button" data-report-action="copy" title="${escapeHtml(t('action.copyReport'))}">${icon('copyReport')}<span>${escapeHtml(t('action.copyReport'))}</span></button></div>
        ${this.blocks(model.blocks)}
      </div>`;
  }

  blocks(blocks) {
    const out = [];
    let cards = [];
    const flush = () => { if (cards.length) out.push(`<div class="report-cards">${cards.join('')}</div>`); cards = []; };
    for (const block of blocks) {
      if (block.type === 'kpis') { flush(); out.push(`<div class="kpis">${block.items.map((item) => `<div class="kpi ${item.tone ?? ''}"><div><small>${escapeHtml(item.label)}</small><b>${escapeHtml(item.value)}</b></div></div>`).join('')}</div>`); }
      else if (block.type === 'note') { flush(); out.push(`<p class="muted">${escapeHtml(block.text)}</p>`); }
      else if (block.type === 'bars') cards.push(`<section class="card"><h3>${icon('viewReports')}${escapeHtml(block.title)}</h3>${this.barChart(block)}</section>`);
      else if (block.type === 'table') { flush(); out.push(`<section class="card wide">${block.title ? `<h3>${icon('table')}${escapeHtml(block.title)}</h3>` : ''}${this.table(block)}</section>`); }
    }
    flush();
    return out.join('');
  }

  barChart(block) {
    if (!block.items.length) return `<div class="hbars"><div class="muted">${escapeHtml(block.empty ?? '')}</div></div>`;
    const axis = block.axis;
    const pct = (value) => `${Math.max(0, (value / axis.top) * 100)}%`;
    const grid = axis.ticks.slice(1).map((tick) => `<i class="hbar-grid" style="left:${tick.at * 100}%"></i>`).join('');
    const rows = block.items.map((item) => `<div class="hbar-row" title="${escapeHtml(`${item.label}: ${item.text}`)}"><span class="hbar-label">${escapeHtml(item.label)}</span>
      <span class="hbar-track">${grid}<i class="hbar" style="width:${pct(item.value)}"></i></span><span class="hbar-value">${escapeHtml(item.text)}</span></div>`).join('');
    const ruler = `<div class="hbar-row hbar-axis" aria-hidden="true"><span></span><span class="hbar-scale">${axis.ticks.map((tick, i) => `<i class="${i === 0 ? 'first' : i === axis.ticks.length - 1 ? 'last' : ''}" style="left:${tick.at * 100}%"><b>${escapeHtml(tick.text)}</b></i>`).join('')}</span><span></span></div>`;
    return `<div class="hbars">${rows}${ruler}</div>`;
  }

  table(block) {
    if (!block.rows.length) return `<div class="muted report-none">${icon('info')}${escapeHtml(block.empty ?? '')}</div>`;
    const align = (col) => (col?.align ? ` class="${col.align}"` : '');
    return `<table class="report-table"><thead><tr>${block.columns.map((col) => `<th${align(col)}>${escapeHtml(col.label)}</th>`).join('')}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((cell, i) => `<td${align(block.columns[i])}>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  /** The current report as text (Copy report). */
  text() { return this.host.querySelector('.report-page')?.innerText ?? ''; }
  update() { this.render(); }
  selectionChanged() {}
  destroy() { this.host.innerHTML = ''; this.host.className = 'view-host'; }
}

export { findShape };
