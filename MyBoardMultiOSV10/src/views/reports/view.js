// The reports view (registered as 'reports'): a report picker (cumulative flow, control chart, throughput,
// created vs resolved, workload, version burn-up, breakdown) with a date range and each report's own options,
// hover tooltips, a summary, the data table and export (PNG, SVG, CSV copy and file); and the dashboards
// (dashboards.js) behind the second tab.
import { escapeHtml } from '../../ui/dom.js';
import { icon } from '../../icons.js';
import { renderIconRef } from '../../ui/iconref.js';
import { getLanguage } from '../../i18n.js';
import { openPicker, closePicker, dropButtonHtml } from '../backlog/picker.js';
import { JqlEditor } from '../backlog/jql-editor.js';
import { Lookups } from '../backlog/lookups.js';
import { quoted } from '../backlog/jql-util.js';
import { copyText, saveFile, safeName, toCsv } from '../backlog/download.js';
import { bindTooltip, palette, svgFile, svgToPng } from './charts.js';
import { BREAKDOWN_FIELDS, isoDay, REF_REPORTS, REPORT_IDS, REPORTS, refChipHtml } from './defs.js';
import { Dashboards } from './dashboards.js';
import { L, E } from './texts.js';

const PREFS_KEY = 'myboard.reports.v1';
const RANGES = [7, 14, 30, 60, 90, 180, 365];
const DEFAULT_RANGE = { cfd: 30, control: 90, throughput: 84, createdResolved: 30, workload: 0, version: 0, breakdown: 0 };
const loadPrefs = () => { try { return JSON.parse(globalThis.localStorage?.getItem(PREFS_KEY) ?? '{}') ?? {}; } catch { return {}; } };
const storePrefs = (p) => { try { globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode */ } };

export class ReportsView {
  constructor(host, ctx, { onSideChange = null } = {}) {
    this.host = host;
    this.ctx = ctx;
    this.onSideChange = onSideChange;   // the left panel's sidebar redraws (sidebar.js)
    this.api = ctx.api;
    this.lookups = new Lookups(ctx.api);
    const prefs = loadPrefs();
    this.prefs = {
      tab: prefs.tab === 'dashboards' ? 'dashboards' : 'reports',
      report: REPORTS[prefs.report] ? prefs.report : 'cfd',
      options: prefs.options && typeof prefs.options === 'object' ? prefs.options : {},
      dashboardId: prefs.dashboardId ?? null,
    };
    this.range = {};
    this.state = 'idle';
    this.data = null;
    this.chart = null;
    this.seq = 0;
    this.mount();
  }

  get doc() { return this.ctx.workspace; }
  get project() { return this.doc?.project ?? null; }
  get board() { return this.doc?.board ?? null; }
  get live() { return Boolean(this.project && !this.doc?.demo && this.ctx.app?.state?.core?.status === 'ready'); }
  get lang() { return getLanguage(); }
  get cx() { return { lookups: this.lookups, L, lang: this.lang }; }

  scope() { return this.board ? { boardId: this.board.id } : { projectId: this.project.id }; }
  opts(id = this.prefs.report) { return (this.prefs.options[id] ??= {}); }
  savePrefs() { storePrefs(this.prefs); }

  mount() {
    this.host.innerHTML = `<div class="rp-root" data-view="reports">
      <div class="rp-bar"></div>
      <div class="rp-body"></div>
    </div>`;
    this.root = this.host.firstElementChild;
    this.el = { bar: this.root.querySelector('.rp-bar'), body: this.root.querySelector('.rp-body') };
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('change', (e) => this.onChange(e));
    this.resizer = new ResizeObserver(() => { this.fit(); cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => { this.drawChart(); this.dashboards?.relayout(); }); });
    this.resizer.observe(this.root);
    globalThis.__myboardReports = this;
    // Changes made by the other views of this window (the issue detail panel, the board).
    this.onLocalEvent = (e) => { if (e.detail?.type) this.update({ event: e.detail }); };
    window.addEventListener('myboard:event', this.onLocalEvent);
    this.renderBar();
    if (!this.live) { this.renderOffline(); return; }
    this.prepare().then(() => this.show());
  }

  destroy() {
    window.removeEventListener('myboard:event', this.onLocalEvent);
    closePicker();
    this.resizer?.disconnect();
    this.untip?.();
    this.jql?.destroy();
    this.dashboards?.destroy();
    clearTimeout(this.liveTimer);
    clearTimeout(this.columnsTimer);
    if (globalThis.__myboardReports === this) globalThis.__myboardReports = null;
  }

  fit() {
    const w = this.root.clientWidth;
    this.root.classList.toggle('narrow', w < 860);
    this.root.classList.toggle('tiny', w < 560);
  }

  async prepare() {
    try {
      if (this.board) {
        this.boardData = await this.api.boardData(this.board.id);
        this.lookups.absorb(this.boardData);
      }
      await this.lookups.project(this.project.id);
      this.lookups.projects.set(this.project.id, this.project);
      await Promise.all([this.lookups.ensureUsers(), this.lookups.ensureProjects(),
        this.api.boards({ projectId: this.project.id }).then((list) => { this.boardsList = Array.isArray(list) ? list : list?.items ?? []; }).catch(() => { this.boardsList = []; }),
        this.api.filters().then((list) => { this.savedFilters = Array.isArray(list) ? list : list?.items ?? []; }).catch(() => { this.savedFilters = []; })]);
      this.columns = this.boardData?.columns ?? this.lookups.statusesOf(this.project.id).map((s) => ({ id: s.id, name: s.name, statusIds: [s.id] }));
    } catch (error) {
      this.prepareError = error;
    }
  }

  /** Board scope: the reference "done" column of the reports = the board's rightmost column. */
  get referenceColumn() { return this.board ? this.columns?.at(-1) ?? null : null; }

  /** The board's columns changed (reorder, add, rename, delete): re-read them, then redraw / reload. */
  async refreshColumns() {
    if (!this.board || !this.live) return;
    try {
      this.boardData = await this.api.boardData(this.board.id);
      this.lookups.absorb(this.boardData);
      this.columns = this.boardData?.columns ?? this.columns;
    } catch { /* keep the old columns */ }
    if (this.prefs.tab === 'reports') { this.renderControls(); this.load(); } else this.dashboards?.refreshGadgets();
  }

  /** The report / dashboard picker is the left panel's sidebar (sidebar.js); the bar above the page stays empty. */
  renderBar() {
    this.el.bar.innerHTML = '';
    this.el.bar.hidden = true;
    this.onSideChange?.();
  }

  /** Shows a report (the sidebar's report items). */
  pickReport(id) {
    if (!REPORTS[id]) return undefined;
    const same = this.prefs.tab === 'reports' && this.prefs.report === id;
    this.prefs.tab = 'reports';
    this.prefs.report = id;
    this.savePrefs();
    if (same) return undefined;
    this.data = null;
    this.onSideChange?.();
    return this.live ? this.show() : undefined;
  }

  /** Shows a dashboard (the sidebar's dashboard items); null = the last one / the first. */
  pickDashboard(id = null) {
    const wasTab = this.prefs.tab;
    this.prefs.tab = 'dashboards';
    if (id) this.prefs.dashboardId = id;
    this.savePrefs();
    this.onSideChange?.();
    if (!this.live) return undefined;
    if (wasTab === 'dashboards' && this.dashboards) { if (id && id !== this.dashboards.dash?.id) { this.dashboards.cache.clear(); return this.dashboards.load(id); } return undefined; }
    return this.show();
  }

  /** The sidebar's "new dashboard": opens the dashboards, then the name prompt. */
  async newDashboard() {
    if (!this.live) return;
    if (this.prefs.tab !== 'dashboards' || !this.dashboards) { this.prefs.tab = 'dashboards'; this.savePrefs(); this.show(); }
    await this.dashboards?.dashAction('new');
  }

  renderOffline() {
    const demo = this.doc?.demo;
    this.el.body.innerHTML = `<div class="rp-empty">${icon('database', 'icon big')}<b>${escapeHtml(L(demo ? 'demoTitle' : 'offlineTitle'))}</b><p class="muted">${escapeHtml(L(demo ? 'demoText' : 'offlineText'))}</p></div>`;
  }

  show() {
    this.untip?.();
    this.untip = null;
    this.jql?.destroy();
    this.jql = null;
    if (this.prefs.tab === 'dashboards') {
      this.el.body.innerHTML = '<div class="db-host"></div>';
      this.dashboards?.destroy();
      this.dashboards = new Dashboards(this.el.body.firstElementChild, this);
      return;
    }
    this.dashboards?.destroy();
    this.dashboards = null;
    this.el.body.innerHTML = `<div class="rp-main">
      <section class="rp-page">
        <header class="rp-head"><div class="rp-title">${icon(REPORTS[this.prefs.report].icon)}<div><h2>${escapeHtml(L(`r_${this.prefs.report}`))}</h2><p class="muted">${escapeHtml(L(`d_${this.prefs.report}`))}</p></div></div>
          <div class="rp-export">
            <button class="small-button" data-act="png" title="${escapeHtml(L('pngTip'))}">${icon('exportImage')}<span>PNG</span></button>
            <button class="small-button" data-act="svg" title="${escapeHtml(L('svgTip'))}">${icon('svgFile')}<span>SVG</span></button>
            <button class="small-button" data-act="copyCsv" title="${escapeHtml(L('copyCsvTip'))}">${icon('copy')}<span>${escapeHtml(L('copyCsv'))}</span></button>
            <button class="small-button" data-act="saveCsv" title="${escapeHtml(L('saveCsvTip'))}">${icon('csvFile')}<span>CSV</span></button>
          </div>
        </header>
        <div class="rp-controls"></div>
        <div class="rp-card"><div class="rp-chart" role="figure"></div><div class="rp-legend-host"></div></div>
        <div class="rp-summary"></div>
        <details class="rp-table"><summary>${icon('table')}<span>${escapeHtml(L('dataTable'))}</span></summary><div class="rp-table-body"></div></details>
      </section>
    </div>`;
    this.renderControls();
    this.untip = bindTooltip(this.el.body.querySelector('.rp-chart'), () => this.chart?.tips);
    this.load();
  }

  // ───────────────────────── controls

  rangeOf(id = this.prefs.report) {
    const o = this.opts(id);
    const daysBack = o.days ?? DEFAULT_RANGE[id];
    if (o.from && o.to) return { from: o.from, to: o.to, days: null };
    if (!daysBack) return null;
    const to = Date.now();
    return { from: isoDay(to - daysBack * 86400000), to: isoDay(to), days: daysBack };
  }

  renderControls() {
    const host = this.el.body.querySelector('.rp-controls');
    if (!host) return;
    const id = this.prefs.report;
    const o = this.opts();
    const parts = [];
    const range = this.rangeOf();
    if (range) {
      parts.push(dropButtonHtml({ id: 'range', iconHtml: icon('calendar'), label: range.days ? L('lastDays', { n: range.days }) : L('customRange'), tip: L('rangeTip') }));
      parts.push(`<label class="rp-date"><span>${escapeHtml(L('from'))}</span><input type="date" data-date="from" value="${range.from}" max="${range.to}" aria-label="${escapeHtml(L('from'))}" /></label>`);
      parts.push(`<label class="rp-date"><span>${escapeHtml(L('to'))}</span><input type="date" data-date="to" value="${range.to}" min="${range.from}" aria-label="${escapeHtml(L('to'))}" /></label>`);
    }
    const seg = (key, values, current) => `<span class="segmented rp-seg">${values.map(([v, glyph, label]) => `<button class="segment ${current === v ? 'active' : ''}" data-opt="${key}" data-value="${v}" aria-pressed="${current === v}" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span></button>`).join('')}</span>`;
    const cols = this.columns ?? [];
    const colNames = (ids) => (ids?.length ? cols.filter((c) => ids.includes(c.id)).map((c) => c.name).join(', ') : L('auto'));
    const ref = this.referenceColumn;
    if (ref && REF_REPORTS.has(id)) parts.push(refChipHtml(ref, L));
    switch (id) {
      case 'control':
        parts.push(dropButtonHtml({ id: 'startCols', iconHtml: icon('play'), label: `${L('startColumns')}: ${colNames(o.startColumnIds ?? this.data?.startColumnIds)}`, tip: L('startColumnsTip') }));
        parts.push(dropButtonHtml({ id: 'endCols', iconHtml: icon('stop'), label: `${L('endColumns')}: ${colNames(o.endColumnIds ?? (ref ? [ref.id] : this.data?.endColumnIds))}`, tip: L('endColumnsTip') }));
        parts.push(seg('metric', [['cycle', 'speed', L('cycleTime')], ['lead', 'clock', L('leadTime')]], o.metric ?? 'cycle'));
        break;
      case 'throughput':
        parts.push(seg('interval', [['week', 'calendar', L('perWeek')], ['day', 'clock', L('perDay')]], o.interval ?? 'week'));
        parts.push(seg('metric', [['count', 'list', L('completedIssues')], ['points', 'percent', L('storyPoints')]], o.metric ?? 'count'));
        break;
      case 'createdResolved':
        parts.push(seg('mode', [['cumulative', 'routeCurved', L('cumulative')], ['daily', 'calendar', L('daily')]], o.mode ?? 'cumulative'));
        break;
      case 'workload':
        parts.push(seg('metric', [['count', 'list', L('openIssues')], ['points', 'percent', L('storyPoints')], ['remaining', 'clock', L('remainingHours')]], o.metric ?? 'count'));
        break;
      case 'version': {
        const versions = this.lookups.versionsOf(this.project.id);
        const v = versions.find((x) => x.id === o.versionId) ?? versions.find((x) => !x.released) ?? versions.at(-1);
        if (v && o.versionId !== v.id) o.versionId = v.id;
        parts.push(dropButtonHtml({ id: 'version', iconHtml: icon(v?.released ? 'check' : 'calendar'), label: `${L('version')}: ${v?.name ?? L('noVersions')}`, tip: L('versionTip') }));
        break;
      }
      case 'breakdown':
        parts.push(dropButtonHtml({ id: 'field', iconHtml: icon('group'), label: `${L('field')}: ${L(`f_${o.field ?? 'status'}`)}`, tip: L('fieldTip') }));
        parts.push(seg('chart', [['pie', 'percent', L('pie')], ['bar', 'viewReports', L('bar')]], o.chart ?? 'pie'));
        break;
      default:
    }
    host.innerHTML = `<div class="rp-controls-row">${parts.join('')}</div>${id === 'breakdown' ? '<div class="rp-jql-row"><div class="rp-jql-host"></div><button class="button primary small" data-act="runJql" title="' + escapeHtml(L('runTip')) + '">' + icon('search') + '<span>' + escapeHtml(L('run')) + '</span></button></div>' : ''}`;
    if (id === 'breakdown') {
      const jql = o.jql ?? `project = ${quoted(this.project.key)}`;
      this.jql = new JqlEditor(host.querySelector('.rp-jql-host'), { api: this.api, value: jql, compact: true, onSubmit: (text) => { o.jql = text; this.savePrefs(); this.load(); } });
    }
  }

  onClick(event) {
    const t = event.target;
    const drop = t.closest('[data-drop]');
    if (drop && this.el.body.contains(drop) && !drop.closest('.db-host')) return this.openDrop(drop);
    const act = t.closest('[data-act]');
    if (act && !act.disabled && !act.closest('.db-host')) return this.onAct(act.dataset.act, act.dataset.value);
    const report = t.closest('[data-report]');
    if (report) return this.pickReport(report.dataset.report);
    const opt = t.closest('[data-opt]');
    if (opt && !opt.closest('.db-host')) { this.opts()[opt.dataset.opt] = opt.dataset.value; this.savePrefs(); this.renderControls(); return ['interval', 'mode'].includes(opt.dataset.opt) && this.prefs.report === 'throughput' ? this.load() : this.redraw(); }
    const toggle = t.closest('[data-toggle-series]');
    if (toggle && !toggle.closest('.db-host')) {
      const o = this.opts();
      const set = new Set(o.hidden ?? []);
      if (set.has(toggle.dataset.toggleSeries)) set.delete(toggle.dataset.toggleSeries); else set.add(toggle.dataset.toggleSeries);
      o.hidden = [...set];
      this.savePrefs();
      return this.drawChart();
    }
    return undefined;
  }

  onChange(event) {
    const input = event.target.closest('[data-date]');
    if (!input || input.closest('.db-host')) return;
    const o = this.opts();
    const range = this.rangeOf();
    const next = { from: range?.from, to: range?.to, [input.dataset.date]: input.value };
    if (!next.from || !next.to || next.from > next.to) { input.classList.add('invalid'); return; }
    o.from = next.from;
    o.to = next.to;
    o.days = null;
    this.savePrefs();
    this.renderControls();
    this.load();
  }

  onAct(act, value) {
    switch (act) {
      case 'tab': return value === 'dashboards' ? this.pickDashboard() : this.pickReport(this.prefs.report);
      case 'png': return this.exportPng();
      case 'svg': return this.exportSvg();
      case 'copyCsv': return this.copyCsv();
      case 'saveCsv': return this.saveCsv();
      case 'runJql': return this.jql?.submit();
      case 'retry': return this.load();
      default: return undefined;
    }
  }

  openDrop(button) {
    const id = button.dataset.drop;
    const o = this.opts();
    const cols = this.columns ?? [];
    switch (id) {
      case 'range': return openPicker(button, {
        items: [...RANGES.map((n) => ({ value: String(n), label: L('lastDays', { n }), icon: icon('calendar') })), { separator: true }, { value: 'custom', label: L('customRange'), icon: icon('edit') }],
        value: o.from ? 'custom' : String(this.rangeOf()?.days ?? ''),
        onPick: (v) => {
          if (v === 'custom') { const r = this.rangeOf(); o.from = r.from; o.to = r.to; o.days = null; this.savePrefs(); this.renderControls(); this.el.body.querySelector('[data-date="from"]')?.focus(); return; }
          o.days = Number(v); o.from = null; o.to = null; this.savePrefs(); this.renderControls(); this.load();
        },
      });
      case 'startCols':
      case 'endCols': {
        const key = id === 'startCols' ? 'startColumnIds' : 'endColumnIds';
        const ref = this.referenceColumn;
        const defaults = key === 'endColumnIds' && ref ? [ref.id] : this.data?.[key] ?? [];
        return openPicker(button, {
          items: cols.map((c) => ({ value: c.id, label: c.name, icon: c.icon ? renderIconRef(c.icon, { size: 16 }) : icon(c === ref ? 'check' : c.backlog ? 'list' : 'columns') })), multi: true, values: o[key] ?? defaults,
          // the rightmost column alone as the end = the default, kept as "follow the rightmost column"
          onPick: (values) => { o[key] = values.length && !(key === 'endColumnIds' && ref && values.length === 1 && values[0] === ref.id) ? values : null; this.savePrefs(); clearTimeout(this.pickTimer); this.pickTimer = setTimeout(() => this.load(), 250); },
          onClose: () => this.renderControls(),
        });
      }
      case 'version': return openPicker(button, {
        items: this.lookups.versionsOf(this.project.id).map((v) => ({ value: v.id, label: v.name, detail: v.released ? L('released') : v.releaseDate ?? '', icon: icon(v.released ? 'check' : 'calendar') })),
        value: o.versionId, onPick: (v) => { o.versionId = v; this.savePrefs(); this.renderControls(); this.load(); },
      });
      case 'field': return openPicker(button, {
        items: BREAKDOWN_FIELDS.map((f) => ({ value: f, label: L(`f_${f}`), icon: icon({ status: 'flag', assignee: 'user', reporter: 'user', priority: 'sort', type: 'layers', project: 'folder', epic: 'star', resolution: 'check', labels: 'tag', component: 'group' }[f]) })),
        value: o.field ?? 'status', onPick: (v) => { o.field = v; this.savePrefs(); this.renderControls(); this.load(); },
      });
      default: return undefined;
    }
  }

  // ───────────────────────── data and chart

  query(id = this.prefs.report) {
    const o = this.opts(id);
    const range = this.rangeOf(id);
    const q = { ...this.scope(), ...(range ? { from: range.from, to: range.to } : {}) };
    if (id === 'control') { if (o.startColumnIds?.length) q.startColumnIds = o.startColumnIds.join(','); if (o.endColumnIds?.length) q.endColumnIds = o.endColumnIds.join(','); }
    if (id === 'throughput') q.interval = o.interval ?? 'week';
    if (id === 'version') q.versionId = o.versionId;
    if (id === 'breakdown') { q.jql = o.jql ?? `project = ${quoted(this.project.key)}`; q.field = o.field ?? 'status'; }
    return q;
  }

  async load() {
    const id = this.prefs.report;
    const chartHost = this.el.body.querySelector('.rp-chart');
    if (!chartHost) return;
    if (id === 'version' && !this.opts().versionId) { this.data = null; this.state = 'empty'; this.drawState(L('noVersionsText')); return; }
    const seq = ++this.seq;
    this.state = 'loading';
    this.root.classList.add('busy');
    if (!this.data) this.drawState(L('loading'), 'hourglass');
    try {
      const data = await REPORTS[id].fetch(this.api, this.query(id));
      if (seq !== this.seq || id !== this.prefs.report) return;
      if (id === 'breakdown' && ['project', 'epic', 'component', 'resolution'].includes(data.field)) await this.lookups.ensureProjects();
      this.data = data;
      this.state = 'ready';
    } catch (error) {
      if (seq !== this.seq) return;
      this.data = null;
      this.state = 'error';
      this.drawState(`${L('loadFailed')}: ${error.message ?? error.code}`, 'error', true);
      this.root.classList.remove('busy');
      return;
    }
    this.root.classList.remove('busy');
    if (id === 'control') this.renderControls();
    this.redraw();
  }

  drawState(text, glyph = 'info', retry = false) {
    const host = this.el.body.querySelector('.rp-chart');
    if (!host) return;
    for (const el of host.querySelectorAll(':scope > :not(.rp-tip)')) el.remove();
    host.insertAdjacentHTML('afterbegin', `<div class="rp-state">${icon(glyph, 'icon big')}<span>${escapeHtml(text)}</span>${retry ? `<button class="small-button" data-act="retry">${icon('refresh')}<span>${escapeHtml(L('retry'))}</span></button>` : ''}</div>`);
    this.el.body.querySelector('.rp-legend-host').innerHTML = '';
    this.el.body.querySelector('.rp-summary').innerHTML = '';
    this.el.body.querySelector('.rp-table-body').innerHTML = '';
    this.chart = null;
  }

  redraw() { this.drawChart(); this.renderSummary(); this.renderTable(); }

  isEmpty(id, data) {
    if (!data) return true;
    switch (id) {
      case 'cfd': return !data.series.some((s) => s.values.some((v) => v > 0));
      case 'control': return !data.points.length;
      case 'throughput': return !data.buckets.length;
      case 'createdResolved': return !data.days.length;
      case 'workload': return !data.items.length;
      case 'version': return !data.burnup.length;
      case 'breakdown': return !data.items.length;
      default: return false;
    }
  }

  drawChart() {
    if (this.prefs.tab !== 'reports' || this.state !== 'ready' || !this.data) return;
    const id = this.prefs.report;
    const host = this.el.body.querySelector('.rp-chart');
    if (!host) return;
    if (this.isEmpty(id, this.data)) { this.drawState(L(id === 'control' ? 'noCompleted' : 'noData'), 'info'); this.renderSummary(); return; }
    const width = Math.max(260, Math.floor(host.clientWidth));
    const height = Math.max(220, Math.min(460, Math.round(width * 0.45)));
    const colors = palette(this.root);
    const chart = REPORTS[id].draw(this.data, this.opts(), { width, height }, colors, this.cx);
    chart.width = width;
    chart.height = chart.height ?? height;
    this.chart = chart;
    for (const el of host.querySelectorAll(':scope > :not(.rp-tip)')) el.remove();
    host.insertAdjacentHTML('afterbegin', chart.svg);
    this.el.body.querySelector('.rp-legend-host').innerHTML = chart.legend ?? '';
  }

  renderSummary() {
    const host = this.el.body.querySelector('.rp-summary');
    if (!host || !this.data) return;
    const items = REPORTS[this.prefs.report].summary?.(this.data, this.opts(), this.cx) ?? [];
    host.innerHTML = items.map((s) => `<div class="rp-stat" title="${escapeHtml(`${s.label}: ${s.value}`)}"><small>${escapeHtml(s.label)}</small><b>${escapeHtml(String(s.value))}</b></div>`).join('');
  }

  renderTable() {
    const host = this.el.body.querySelector('.rp-table-body');
    if (!host || !this.data) return;
    const rows = REPORTS[this.prefs.report].csv(this.data, this.opts(), this.cx);
    const [head, ...body] = rows;
    host.innerHTML = `<table><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${body.slice(0, 500).map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>${body.length > 500 ? `<p class="muted">${escapeHtml(L('tableCut', { n: body.length }))}</p>` : ''}`;
  }

  fileBase() { return safeName(`${this.project?.key ?? 'report'}-${L(`r_${this.prefs.report}`)}-${isoDay(Date.now())}`); }

  csvText() { return this.data ? toCsv(REPORTS[this.prefs.report].csv(this.data, this.opts(), this.cx)) : ''; }

  async copyCsv() {
    if (!this.data) return;
    const ok = await copyText(this.csvText());
    this.ctx.notify(ok ? 'success' : 'warning', L(ok ? 'csvCopied' : 'csvCopyFailed'));
  }

  async saveCsv() {
    if (!this.data) return;
    try { const name = await saveFile(`${this.fileBase()}.csv`, `﻿${this.csvText()}`, { mime: 'text/csv', type: 'csv' }); if (name) this.ctx.notify('success', L('saved', { name })); } catch (error) { this.ctx.showError(E('exportFailed'), error); }
  }

  async exportSvg() {
    if (!this.chart) return;
    try { const name = await saveFile(`${this.fileBase()}.svg`, svgFile(this.chart.svg), { mime: 'image/svg+xml', type: 'svg' }); if (name) this.ctx.notify('success', L('saved', { name })); } catch (error) { this.ctx.showError(E('exportFailed'), error); }
  }

  async exportPng() {
    if (!this.chart) return;
    try {
      const blob = await svgToPng(this.chart.svg, this.chart.width, this.chart.height);
      const name = await saveFile(`${this.fileBase()}.png`, blob, { mime: 'image/png', type: 'png' });
      if (name) this.ctx.notify('success', L('saved', { name }));
    } catch (error) { this.ctx.showError(E('exportFailed'), error); }
  }

  // ───────────────────────── shell

  update(ctx) {
    this.ctx = { ...this.ctx, ...ctx };
    if (ctx.settingsChanged) { closePicker(); this.renderBar(); if (this.live) { if (this.prefs.tab === 'reports') { this.show(); } else this.dashboards?.renderAll(); } return; }
    if (ctx.reload) { if (this.prefs.tab === 'reports') this.load(); else this.dashboards?.reload(); return; }
    const type = String(ctx.event?.type ?? '');
    if (!type) return;
    if (/^dashboard\./.test(type)) { this.dashboards?.onEvent(ctx.event); return; }
    // Column order / columns of the board (the board view announces board.updated; live: column.* too):
    // the reference column is the rightmost one, so every report may change.
    if (/^(board\.updated|column\.)/.test(type)) {
      const id = ctx.event?.id ?? ctx.event?.data?.boardId ?? ctx.event?.data?.board_id;
      if (type === 'board.updated' && id && this.board && id !== this.board.id) return;
      clearTimeout(this.columnsTimer);
      this.columnsTimer = setTimeout(() => this.refreshColumns(), 300);
      return;
    }
    if (!/^issue\./.test(type)) return;
    clearTimeout(this.liveTimer);
    this.liveTimer = setTimeout(() => { if (this.prefs.tab === 'reports') this.load(); else this.dashboards?.refreshGadgets(); }, 1500);
  }
}
