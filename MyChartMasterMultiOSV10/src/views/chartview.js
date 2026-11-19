// The chart workspace of one tab: the chart gallery (left), the chart on its stage with the data grid under (or
// beside) it, and the inspector (right). Panels fold to slim rails and resize with splitters; their sizes are
// settings. The chart is drawn by domain/chart/render.js and scaled to fit the stage (or to the zoom).
import { escapeHtml } from '../ui/dom.js';
import { icon } from '../icons.js';
import { CHART_GROUPS, CHART_TYPES } from '../domain/chart/types.js';
import { renderChart } from '../domain/chart/render.js';
import { DataGrid } from './datagrid.js';
import { Inspector } from './inspector.js';

export class ChartView {
  /** api: see app.js viewApi. */
  constructor(host, api) {
    this.host = host;
    this.api = api;
    this.query = '';
    const t = api.t;
    host.innerHTML = `<div class="ch-view">
      <aside class="pane pane-left ch-gallery" aria-label="${escapeHtml(t('gallery.title'))}">
        <div class="pane-head">${icon('chartGallery')}<span class="pane-title">${escapeHtml(t('gallery.title'))}</span><span class="grow"></span>${this.foldButton('left')}</div>
        <div class="pane-body"><label class="ch-search">${icon('search')}<input type="search" data-gallery-search placeholder="${escapeHtml(t('gallery.search'))}" aria-label="${escapeHtml(t('gallery.search'))}" spellcheck="false" /></label><div class="ch-types"></div></div>
      </aside>
      <div class="pane-rail rail-left">${this.foldButton('left')}<span class="rail-title">${escapeHtml(t('gallery.title'))}</span></div>
      <div class="splitter side-split" data-split="left" title="${escapeHtml(t('tip.splitter'))}"></div>
      <section class="ch-center">
        <div class="ch-stage-wrap">
          <div class="ch-stage-bar"></div>
          <div class="ch-stage" tabindex="-1"><div class="ch-canvas"></div><div class="ch-tip" hidden></div></div>
        </div>
        <div class="splitter grid-split" data-split="bottom" title="${escapeHtml(t('tip.splitter'))}"></div>
        <div class="pane pane-grid">
          <div class="pane-head">${icon('dataGrid')}<span class="pane-title">${escapeHtml(t('grid.title'))}</span><span class="ch-grid-tools"></span><span class="grow"></span>${this.foldButton('bottom')}</div>
          <div class="pane-body ch-grid-body"></div>
        </div>
      </section>
      <div class="splitter map-split" data-split="right" title="${escapeHtml(t('tip.splitter'))}"></div>
      <aside class="pane pane-right ch-inspector" aria-label="${escapeHtml(t('inspector.panel'))}">
        <div class="pane-head">${icon('inspector')}<span class="pane-title">${escapeHtml(t('inspector.panel'))}</span><span class="grow"></span>${this.foldButton('right')}</div>
        <div class="pane-body ch-inspector-body"></div>
      </aside>
      <div class="pane-rail rail-right">${this.foldButton('right')}<span class="rail-title">${escapeHtml(t('inspector.panel'))}</span></div>
    </div>`;
    this.root = host.querySelector('.ch-view');
    this.stage = host.querySelector('.ch-stage');
    this.canvas = host.querySelector('.ch-canvas');
    this.tip = host.querySelector('.ch-tip');
    this.grid = new DataGrid(host.querySelector('.ch-grid-body'), api.grid);
    this.inspector = new Inspector(host.querySelector('.ch-inspector-body'), api.inspector);
    this.bind();
    this.resizer = new ResizeObserver(() => this.fit());
    this.resizer.observe(this.stage);
  }

  foldButton(which) {
    const t = this.api.t;
    const key = { left: 'action.leftPanel', right: 'action.rightPanel', bottom: 'action.bottomPanel' }[which];
    return `<button class="icon-button pane-fold" data-fold="${which}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon({ left: 'panelLeft', right: 'panelRight', bottom: 'panelBottom' }[which])}</button>`;
  }

  destroy() {
    this.resizer.disconnect();
    this.grid.destroy();
    this.host.innerHTML = '';
  }

  /** Everything again (another tab, settings, language). */
  refresh() {
    this.applyLayout();
    this.renderGallery();
    this.renderStageBar();
    this.renderGridTools();
    this.drawChart();
    this.grid.refresh();
    this.inspector.render();
  }

  /** After a change of data or chart: the chart, the grid and (unless typing in it) the inspector. */
  update({ inspector = true, grid = true } = {}) {
    this.renderGallery();
    this.renderStageBar();
    this.drawChart();
    if (grid) this.grid.refresh();
    if (inspector) this.inspector.render();
    this.renderGridTools();
  }

  applyLayout() {
    const s = this.api.settings();
    const r = this.root;
    r.dataset.layout = s.paneLayout;
    r.classList.toggle('fold-left', !s.showLeftPanel);
    r.classList.toggle('fold-right', !s.showRightPanel);
    r.classList.toggle('fold-bottom', !s.showBottomPanel);
    r.style.setProperty('--left-width', `${s.leftWidth}px`);
    r.style.setProperty('--right-width', `${s.rightWidth}px`);
    r.style.setProperty('--bottom-height', `${s.bottomHeight}px`);
    r.style.setProperty('--grid-width', `${s.gridWidth}px`);
    r.style.setProperty('--row-height', `${s.rowHeight}px`);
    for (const b of r.querySelectorAll('[data-fold]')) {
      const open = { left: s.showLeftPanel, right: s.showRightPanel, bottom: s.showBottomPanel }[b.dataset.fold];
      b.setAttribute('aria-expanded', String(open));
    }
  }

  renderGallery() {
    const doc = this.api.doc();
    const L = this.api.language();
    const t = this.api.t;
    const q = this.query.trim().toLowerCase();
    const box = this.host.querySelector('.ch-types');
    const html = CHART_GROUPS.map((g) => {
      const items = CHART_TYPES.filter((c) => c.group === g.id && (!q || `${c.ko} ${c.en} ${c.id}`.toLowerCase().includes(q)));
      if (!items.length) return '';
      return `<section class="ch-group"><h4>${icon(g.icon)}<span>${escapeHtml(g[L])}</span></h4><div class="ch-type-grid">${items.map((c) => `<button type="button" class="ch-type ${doc?.chart.type === c.id ? 'active' : ''}" data-chart-type="${c.id}" aria-pressed="${doc?.chart.type === c.id}" title="${escapeHtml(`${c[L]} — ${c[`${L}Desc`]}`)}">${icon(c.icon)}<span>${escapeHtml(c[L])}</span></button>`).join('')}</div></section>`;
    }).join('');
    box.innerHTML = html || `<p class="ins-hint">${escapeHtml(t('gallery.none'))}</p>`;
  }

  renderStageBar() {
    const t = this.api.t;
    const doc = this.api.doc();
    const s = this.api.settings();
    const bar = this.host.querySelector('.ch-stage-bar');
    if (!doc) { bar.innerHTML = ''; return; }
    const o = doc.chart.options;
    const zoom = s.textZoom ? `${s.textZoom}%` : t('zoom.fit');
    const btn = (cmd, glyph, label, extra = '') => `<button class="small-button ${extra}" data-command="${cmd}" title="${escapeHtml(this.api.tip(cmd))}">${icon(glyph)}${label ? `<span>${escapeHtml(label)}</span>` : ''}</button>`;
    bar.innerHTML = `
      <span class="ch-size" title="${escapeHtml(t('inspector.size'))}">${icon('chartSize')}<span>${o.width} × ${o.height}px</span></span>
      <span class="ch-zoom">${btn('zoomOut', 'zoomOut', '')}<button class="small-button ch-zoom-value" data-command="zoomFit" title="${escapeHtml(this.api.tip('zoomFit'))}">${escapeHtml(zoom)}</button>${btn('zoomIn', 'zoomIn', '')}</span>
      <span class="grow"></span>
      ${btn('toggleLabels', 'dataLabelsToggle', t('stage.labels'), o.dataLabels ? 'on' : '')}
      ${btn('cycleLegend', 'legendIcon', `${t('inspector.legend')}: ${t(`pos.${o.legend}`)}`)}
      ${btn('paletteMenu', 'palette', t('inspector.palette'))}
      ${btn('copyImage', 'copyImage', t('stage.copy'))}
      ${btn('exportChart', 'exportChart', t('stage.export'), 'primary')}`;
  }

  renderGridTools() {
    const t = this.api.t;
    const doc = this.api.doc();
    const box = this.host.querySelector('.ch-grid-tools');
    if (!doc) { box.innerHTML = ''; return; }
    const tool = (cmd, glyph) => `<button class="icon-button" data-command="${cmd}" title="${escapeHtml(this.api.tip(cmd))}" aria-label="${escapeHtml(this.api.tip(cmd))}" ${this.api.enabled(cmd) ? '' : 'disabled'}>${icon(glyph)}</button>`;
    box.innerHTML = `<span class="ch-grid-count">${escapeHtml(t('grid.count', { rows: doc.table.rows.length, cols: doc.table.columns.length }))}</span>
      ${tool('addRow', 'addRow')}${tool('addColumn', 'addColumn')}${tool('deleteRows', 'deleteRow')}${tool('deleteColumns', 'deleteColumn')}
      <span class="tool-sep"></span>${tool('sortAsc', 'sortAsc')}${tool('sortDesc', 'sortDesc')}${tool('transpose', 'transpose')}
      <span class="tool-sep"></span>${tool('pasteData', 'pasteData')}${tool('importData', 'importData')}${tool('dataStats', 'dataStats')}
      <label class="ch-grid-filter" title="${escapeHtml(t('grid.filterTip'))}">${icon('filter')}<input type="search" data-grid-filter value="${escapeHtml(this.api.gridFilter())}" placeholder="${escapeHtml(t('grid.filter'))}" spellcheck="false" /></label>`;
  }

  /** The chart's colours for the theme background option. */
  drawChart() {
    const doc = this.api.doc();
    if (!doc) { this.canvas.innerHTML = ''; return; }
    const o = doc.chart.options;
    const result = renderChart(doc, { width: o.width, height: o.height, language: this.api.language(), theme: this.api.theme(), animate: this.api.settings().animateCharts && this.animateNext });
    this.animateNext = false;
    this.last = result;
    this.canvas.innerHTML = result.svg;
    this.canvas.classList.toggle('transparent', o.background === 'transparent');
    // The selected series stands out.
    const sel = doc.selection?.series;
    if (sel != null) for (const el of this.canvas.querySelectorAll(`.mark[data-s="${sel}"]`)) el.classList.add('selected');
    this.fit();
  }

  /** Scales the picture to the stage (zoom 0 = fit) and centres it. */
  fit() {
    const svg = this.canvas.querySelector('svg');
    const doc = this.api.doc();
    if (!svg || !doc) return;
    const s = this.api.settings();
    const box = this.stage.getBoundingClientRect();
    const w = doc.chart.options.width;
    const h = doc.chart.options.height;
    const fitScale = Math.max(0.05, Math.min((box.width - 32) / w, (box.height - 32) / h));
    const scale = s.textZoom ? s.textZoom / 100 : fitScale;
    this.scale = scale;
    svg.style.width = `${Math.round(w * scale)}px`;
    svg.style.height = `${Math.round(h * scale)}px`;
    this.canvas.style.width = `${Math.round(w * scale)}px`;
    this.canvas.style.height = `${Math.round(h * scale)}px`;
    this.canvas.classList.toggle('scrolling', scale > fitScale + 0.001);
  }

  showTip(event, text) {
    if (!text || !this.api.settings().showTooltips) { this.tip.hidden = true; return; }
    this.tip.textContent = text;
    this.tip.hidden = false;
    const box = this.stage.getBoundingClientRect();
    const tw = this.tip.offsetWidth;
    const th = this.tip.offsetHeight;
    let x = event.clientX - box.left + this.stage.scrollLeft + 14;
    let y = event.clientY - box.top + this.stage.scrollTop + 14;
    if (x + tw > this.stage.scrollLeft + box.width - 6) x -= tw + 24;
    if (y + th > this.stage.scrollTop + box.height - 6) y -= th + 24;
    this.tip.style.left = `${x}px`;
    this.tip.style.top = `${y}px`;
  }

  bind() {
    const r = this.root;
    r.addEventListener('click', (event) => {
      const fold = event.target.closest('[data-fold]');
      if (fold) { this.api.onFold(fold.dataset.fold); return; }
      const type = event.target.closest('[data-chart-type]');
      if (type) { this.animateNext = true; this.api.onType(type.dataset.chartType); return; }
      const legend = event.target.closest('[data-legend]');
      if (legend && legend.dataset.legend !== '') { this.api.onLegend(Number(legend.dataset.legend)); return; }
      const markEl = event.target.closest('.ch-canvas .mark');
      if (markEl) { this.api.onMark({ series: markEl.dataset.s === '' ? null : Number(markEl.dataset.s), row: markEl.dataset.r === '' ? null : Number(markEl.dataset.r) }); return; }
      if (event.target.closest('.ch-stage') && !event.target.closest('.ch-canvas text')) this.api.onMark(null);
    });
    r.addEventListener('dblclick', (event) => {
      const title = event.target.closest('.chart-title, .chart-subtitle, .axis-title');
      if (title) this.api.onEditText(title.classList.contains('chart-title') ? 'title' : title.classList.contains('chart-subtitle') ? 'subtitle' : 'axis');
      else if (event.target.closest('.ch-canvas') && !event.target.closest('.mark')) this.api.onEditText('title');
    });
    r.addEventListener('input', (event) => {
      if (event.target.matches('[data-gallery-search]')) { this.query = event.target.value; this.renderGallery(); }
      if (event.target.matches('[data-grid-filter]')) this.api.onGridFilter(event.target.value);
    });
    this.stage.addEventListener('mousemove', (event) => {
      const el = event.target.closest('[data-tip]');
      this.showTip(event, el?.dataset.tip ?? '');
      for (const h of this.canvas.querySelectorAll('.mark.hover')) if (h !== el) h.classList.remove('hover');
      el?.classList.add('hover');
    });
    this.stage.addEventListener('mouseleave', () => { this.tip.hidden = true; for (const h of this.canvas.querySelectorAll('.mark.hover')) h.classList.remove('hover'); });
    this.stage.addEventListener('wheel', (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      this.api.onZoom(event.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    r.addEventListener('contextmenu', (event) => {
      if (event.target.closest('.ch-stage')) { event.preventDefault(); const m = event.target.closest('.mark'); this.api.onContext(event, 'chart', m ? { series: m.dataset.s === '' ? null : Number(m.dataset.s) } : {}); }
      else if (event.target.closest('[data-chart-type]')) { event.preventDefault(); this.api.onContext(event, 'type', { id: event.target.closest('[data-chart-type]').dataset.chartType }); }
    });
    // Splitters: drag to resize the panels (sizes are settings).
    r.addEventListener('mousedown', (event) => {
      const split = event.target.closest('[data-split]');
      if (!split || event.button !== 0) return;
      event.preventDefault();
      const which = split.dataset.split;
      const s = this.api.settings();
      const startX = event.clientX;
      const startY = event.clientY;
      const side = this.api.settings().paneLayout === 'grid-right';
      const start = { left: s.leftWidth, right: s.rightWidth, bottom: side ? s.gridWidth : s.bottomHeight }[which];
      document.body.classList.add(which === 'bottom' && !side ? 'row-resizing' : 'col-resizing');
      const move = (e) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const value = which === 'left' ? start + dx : which === 'right' ? start - dx : side ? start - dx : start - dy;
        const key = which === 'left' ? 'leftWidth' : which === 'right' ? 'rightWidth' : side ? 'gridWidth' : 'bottomHeight';
        const limited = Math.round(Math.max(which === 'bottom' ? (side ? 240 : 90) : which === 'left' ? 180 : 260, Math.min(which === 'bottom' && !side ? this.root.clientHeight - 160 : 900, value)));
        this.api.updateSettings({ [key]: limited }, { quiet: true });
        this.applyLayout();
      };
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.classList.remove('row-resizing', 'col-resizing'); this.api.onLayoutChanged(); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  }
}
