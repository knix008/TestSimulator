// Dashboards (GET/POST/PATCH/DELETE /dashboards): a grid of gadgets the user places, moves (drag the
// title bar), resizes (drag the corner grip; also from the gadget's menu with the keyboard) and configures
// (a form popup per gadget type). The layout is saved to the dashboard: { columns, gadgets: [{ id, type,
// config, col, row, w, h }] }. Every layout change is one Undo/Redo step.
import { escapeHtml } from '../../ui/dom.js';
import { icon } from '../../icons.js';
import { renderIconRef } from '../../ui/iconref.js';
import { stepperHtml, bindSteppers } from '../../stepper.js';
import { openPicker, closePicker, dropButtonHtml } from '../backlog/picker.js';
import { quoted } from '../backlog/jql-util.js';
import { bindTooltip, palette } from './charts.js';
import { BREAKDOWN_FIELDS, isoDay, REF_REPORTS, REPORTS, refChipHtml, shortDate } from './defs.js';
import { renderMarkdown } from './markdown.js';
import { L, E } from './texts.js';

export const GADGETS = {
  filterResults: { icon: 'list', w: 2, h: 2 },
  pie: { icon: 'percent', w: 1, h: 2 },
  createdVsResolved: { icon: 'routeCurved', w: 2, h: 2, report: 'createdResolved' },
  cfd: { icon: 'layers', w: 2, h: 2, report: 'cfd' },
  control: { icon: 'speed', w: 2, h: 2, report: 'control' },
  throughput: { icon: 'viewReports', w: 1, h: 2, report: 'throughput' },
  workload: { icon: 'user', w: 1, h: 2, report: 'workload' },
  version: { icon: 'calendar', w: 2, h: 2, report: 'version' },
  assignedToMe: { icon: 'flag', w: 1, h: 2 },
  activity: { icon: 'recent', w: 1, h: 2 },
  markdown: { icon: 'notes', w: 1, h: 1 },
};
const ROW_H = 132;
const GAP = 10;
const uid = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clone = (v) => JSON.parse(JSON.stringify(v));

/** Places gadgets without overlaps: clamps to the columns and pushes overlapping ones down (the pinned one keeps its place). */
export function pack(gadgets, columns, pinned = null) {
  const list = gadgets.map((g) => ({ ...g, w: Math.max(1, Math.min(columns, g.w ?? 1)), h: Math.max(1, Math.min(6, g.h ?? 1)) }));
  for (const g of list) { g.col = Math.max(0, Math.min(columns - g.w, Math.round(g.col ?? 0))); g.row = Math.max(0, Math.round(g.row ?? 0)); }
  const hit = (a, b) => a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;
  const order = [...list].sort((a, b) => (a.id === pinned ? -1 : b.id === pinned ? 1 : a.row - b.row || a.col - b.col));
  const placed = [];
  for (const g of order) {
    while (placed.some((p) => hit(p, g))) g.row++;
    placed.push(g);
  }
  return list;
}

export class Dashboards {
  constructor(host, view) {
    this.host = host;
    this.view = view;
    this.api = view.api;
    this.list = [];
    this.dash = null;
    this.state = 'loading';
    this.cache = new Map();
    this.untips = [];
    this.saving = Promise.resolve();
    host.innerHTML = '<div class="db-root"><div class="db-bar"></div><div class="db-scroll"><div class="db-grid"></div></div></div>';
    this.root = host.firstElementChild;
    this.el = { bar: this.root.querySelector('.db-bar'), grid: this.root.querySelector('.db-grid'), scroll: this.root.querySelector('.db-scroll') };
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.el.grid.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    bindSteppers(this.el.bar, (key, value) => { if (key === 'columns') this.setColumns(value); });
    this.load();
  }

  get ctx() { return this.view.ctx; }
  get project() { return this.view.project; }
  get gadgets() { return this.dash?.layout?.gadgets ?? []; }
  get columns() { return Math.min(4, Math.max(1, Number(this.dash?.layout?.columns) || 3)); }

  destroy() { closePicker(); this.clearTips(); this.root.remove(); }
  clearTips() { for (const off of this.untips) off(); this.untips = []; }

  async load(selectId = this.view.prefs.dashboardId) {
    try {
      const list = await this.api.dashboards();
      this.list = Array.isArray(list) ? list : list?.items ?? [];
      this.dash = this.list.find((d) => d.id === selectId) ?? this.list.find((d) => d.mine) ?? this.list[0] ?? null;
      if (this.dash) this.dash = this.normalise(this.dash);
      this.view.prefs.dashboardId = this.dash?.id ?? null;
      this.view.savePrefs();
      this.state = 'ready';
    } catch (error) {
      this.state = 'error';
      this.error = error;
    }
    this.renderAll();
  }

  async reload() { this.cache.clear(); await this.load(this.dash?.id); }
  refreshGadgets() { this.cache.clear(); this.renderGrid(); }

  normalise(d) {
    const layout = typeof d.layout === 'string' ? JSON.parse(d.layout || '{}') : clone(d.layout ?? {});
    const columns = Math.min(4, Math.max(1, Number(layout.columns) || 3));
    // A layout written without sizes (the core's samples: one gadget per cell) is read as cells two rows high.
    const sized = (layout.gadgets ?? []).some((g) => g.h != null || g.w != null);
    const gadgets = (layout.gadgets ?? []).map((g) => (sized
      ? { id: g.id ?? uid(), type: g.type, config: g.config ?? {}, col: g.col ?? 0, row: g.row ?? 0, w: g.w ?? GADGETS[g.type]?.w ?? 1, h: g.h ?? GADGETS[g.type]?.h ?? 2 }
      : { id: g.id ?? uid(), type: g.type, config: g.config ?? {}, col: g.col ?? 0, row: (g.row ?? 0) * 2, w: 1, h: 2 }));
    return { ...d, layout: { columns, gadgets: pack(gadgets, columns) } };
  }

  // ───────────────────────── rendering

  renderAll() { this.renderBar(); this.renderGrid(); }

  renderBar() {
    const d = this.dash;
    const own = Boolean(d?.mine);
    // which dashboard shows is picked in the left panel's sidebar (sidebar.js); here its name and its tools
    this.view.onSideChange?.();
    this.el.bar.innerHTML = `<span class="db-name" title="${escapeHtml(d ? d.name : L('noDashboard'))}">${d ? renderIconRef(d.icon, { size: 18, fallback: 'b:chart' }) : icon('layout')}<b>${escapeHtml(d ? d.name : L('noDashboard'))}</b></span>
      <button class="small-button" data-dact="new" title="${escapeHtml(L('dashNewTip'))}">${icon('plus')}<span>${escapeHtml(L('dashNew'))}</span></button>
      ${d && own ? `<button class="small-button" data-dact="rename" title="${escapeHtml(L('dashRename'))}">${icon('edit')}<span>${escapeHtml(L('dashRename'))}</span></button>
      <button class="small-button ${d.shared ? 'active' : ''}" data-dact="share" aria-pressed="${Boolean(d.shared)}" title="${escapeHtml(L(d.shared ? 'dashUnshareTip' : 'dashShareTip'))}">${icon(d.shared ? 'globe' : 'lock')}<span>${escapeHtml(L(d.shared ? 'dashShared' : 'dashPrivate'))}</span></button>
      <button class="small-button danger" data-dact="delete" title="${escapeHtml(L('dashDelete'))}">${icon('trash')}<span>${escapeHtml(L('dashDelete'))}</span></button>` : ''}
      <span class="grow"></span>
      ${d && own ? `${dropButtonHtml({ id: 'addGadget', iconHtml: icon('plus'), label: L('gadgetAdd'), tip: L('gadgetAddTip'), cls: 'primary-drop' })}
      <span class="db-cols" title="${escapeHtml(L('dashColumns'))}">${icon('columns')}${stepperHtml({ key: 'columns', value: this.columns, min: 1, max: 4, step: 1, label: L('dashColumns') })}</span>` : ''}
      <button class="small-button" data-dact="refresh" title="${escapeHtml(L('refreshTip'))}" ${d ? '' : 'disabled'}>${icon('refresh')}<span>${escapeHtml(L('refresh'))}</span></button>`;
  }

  renderGrid() {
    this.clearTips();
    const grid = this.el.grid;
    if (this.state === 'loading') { grid.innerHTML = `<div class="rp-state">${icon('hourglass', 'icon big')}<span>${escapeHtml(L('loading'))}</span></div>`; return; }
    if (this.state === 'error') { grid.innerHTML = `<div class="rp-state">${icon('error', 'icon big')}<span>${escapeHtml(`${L('loadFailed')}: ${this.error?.message ?? ''}`)}</span></div>`; return; }
    if (!this.dash) {
      grid.style.gridTemplateColumns = '';
      grid.innerHTML = `<div class="rp-empty">${icon('layout', 'icon big')}<b>${escapeHtml(L('noDashboardTitle'))}</b><p class="muted">${escapeHtml(L('noDashboardText'))}</p><button class="button primary" data-dact="new">${icon('plus')}<span>${escapeHtml(L('dashNew'))}</span></button></div>`;
      return;
    }
    const cols = this.columns;
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    grid.style.gridAutoRows = `${ROW_H}px`;
    grid.style.gap = `${GAP}px`;
    grid.classList.toggle('narrow-grid', this.view.root.classList.contains('tiny'));
    const own = Boolean(this.dash.mine);
    if (!this.gadgets.length) {
      grid.innerHTML = `<div class="rp-empty db-empty" style="grid-column: 1 / -1">${icon('plus', 'icon big')}<b>${escapeHtml(L('noGadgets'))}</b><p class="muted">${escapeHtml(L('noGadgetsText'))}</p></div>`;
      return;
    }
    grid.innerHTML = this.gadgets.map((g) => `<article class="db-gadget" data-gadget="${escapeHtml(g.id)}" data-type="${escapeHtml(g.type)}" style="${this.placeStyle(g)}" aria-label="${escapeHtml(this.titleOf(g))}">
      <header class="db-ghead ${own ? 'movable' : ''}" title="${escapeHtml(own ? L('gadgetMoveTip') : this.titleOf(g))}">${icon(GADGETS[g.type]?.icon ?? 'dot')}<b>${escapeHtml(this.titleOf(g))}</b>
        <span class="grow"></span>
        <button class="icon-button" data-gact="refresh" title="${escapeHtml(L('refresh'))}">${icon('refresh', 'icon tiny')}</button>
        ${own ? `<button class="icon-button" data-gact="config" title="${escapeHtml(L('gadgetConfig'))}">${icon('gear', 'icon tiny')}</button>
        <button class="icon-button" data-gact="menu" title="${escapeHtml(L('gadgetMenu'))}" aria-haspopup="listbox">${icon('menu', 'icon tiny')}</button>` : ''}
      </header>
      <div class="db-gbody"><div class="rp-state small">${icon('hourglass')}<span>${escapeHtml(L('loading'))}</span></div></div>
      ${own ? `<span class="db-grip" title="${escapeHtml(L('gadgetResizeTip'))}">${icon('grip', 'icon tiny')}</span>` : ''}
    </article>`).join('');
    if (this.view.root.classList.contains('tiny')) for (const el of grid.querySelectorAll('.db-gadget')) el.style.gridColumn = '1 / -1';
    for (const g of this.gadgets) this.fillGadget(g);
  }

  placeStyle(g) { return `grid-column: ${g.col + 1} / span ${g.w}; grid-row: ${g.row + 1} / span ${g.h};`; }

  titleOf(g) { return g.config?.title?.trim() || L(`g_${g.type}`); }

  /** Redraws the charts in the gadgets at their new sizes (from the cached data). */
  relayout() {
    if (!this.dash) return;
    const tiny = this.view.root.classList.contains('tiny');
    for (const g of this.gadgets) {
      const el = this.el.grid.querySelector(`[data-gadget="${CSS.escape(g.id)}"]`);
      if (!el) continue;
      el.style.gridColumn = tiny ? '1 / -1' : `${g.col + 1} / span ${g.w}`;
      const cached = this.cache.get(g.id);
      if (cached?.data && cached.chart) this.drawGadget(g, el.querySelector('.db-gbody'), cached.data);
    }
  }

  // ───────────────────────── gadget content

  scopeOf(g) {
    const c = g.config ?? {};
    if (c.boardId) return { boardId: c.boardId };
    if (c.projectId) return { projectId: c.projectId };
    return this.view.scope();
  }

  rangeOf(g) {
    const n = Number(g.config?.days) || (g.type === 'control' ? 90 : g.type === 'throughput' ? 84 : 30);
    const to = Date.now();
    return { from: isoDay(to - n * 86400000), to: isoDay(to) };
  }

  jqlOf(g) {
    const c = g.config ?? {};
    if (c.filterId) { const f = this.view.savedFilters?.find((x) => x.id === c.filterId); if (f) return f.jql; }
    return c.jql?.trim() || `project = ${quoted(this.project.key)}`;
  }

  async fillGadget(g) {
    const el = this.el.grid.querySelector(`[data-gadget="${CSS.escape(g.id)}"] .db-gbody`);
    if (!el) return;
    const c = g.config ?? {};
    try {
      let data;
      const spec = GADGETS[g.type];
      const key = JSON.stringify([g.type, c]);
      const cached = this.cache.get(g.id);
      if (cached && cached.key === key) data = cached.data;
      else {
        if (spec?.report) {
          const q = { ...this.scopeOf(g), ...(['workload', 'version'].includes(spec.report) ? {} : this.rangeOf(g)) };
          if (spec.report === 'throughput') q.interval = c.interval ?? 'week';
          if (spec.report === 'version') {
            q.versionId = c.versionId ?? this.view.lookups.versionsOf(this.project.id).find((v) => !v.released)?.id ?? this.view.lookups.versionsOf(this.project.id).at(-1)?.id;
            if (!q.versionId) { el.innerHTML = this.stateHtml(L('noVersionsText')); return; }
          }
          data = await REPORTS[spec.report].fetch(this.api, q);
        } else if (g.type === 'pie') {
          data = await REPORTS.breakdown.fetch(this.api, { jql: this.jqlOf(g), field: c.field ?? 'status' });
        } else if (g.type === 'filterResults' || g.type === 'assignedToMe' || g.type === 'activity') {
          const jql = g.type === 'assignedToMe' ? 'assignee = currentUser() AND resolution is EMPTY ORDER BY priority DESC, updated DESC'
            : g.type === 'activity' ? `${(c.jql?.trim() || `project = ${quoted(this.project.key)}`).replace(/\border\s+by\b[\s\S]*$/i, '')} ORDER BY updated DESC`
              : this.jqlOf(g);
          data = await this.api.issues({ jql, limit: Math.max(1, Math.min(50, Number(c.limit) || 10)) });
          await this.view.lookups.forRows(data.items ?? []);
        } else if (g.type === 'markdown') {
          data = { text: c.text ?? L('markdownDefault') };
        }
        this.cache.set(g.id, { key, data, chart: Boolean(spec?.report || g.type === 'pie') });
      }
      this.drawGadget(g, el, data);
      this.showReference(g, el, data);
    } catch (error) {
      el.innerHTML = this.stateHtml(`${L('loadFailed')}: ${error.message ?? error.code}`, 'error');
    }
  }

  /** Board-scoped report gadgets: the reference (rightmost) column chip in the title bar. */
  showReference(g, body, data) {
    const head = body.closest('.db-gadget')?.querySelector('.db-ghead');
    if (!head) return;
    head.querySelector('.rp-ref-chip')?.remove();
    const spec = GADGETS[g.type];
    if (!spec?.report || !REF_REPORTS.has(spec.report) || !data?.referenceColumn) return;
    head.querySelector('.grow')?.insertAdjacentHTML('beforebegin', refChipHtml(data.referenceColumn, L, { size: 12 }));
  }

  stateHtml(text, glyph = 'info') { return `<div class="rp-state small">${icon(glyph)}<span>${escapeHtml(text)}</span></div>`; }

  drawGadget(g, el, data) {
    const spec = GADGETS[g.type];
    const lk = this.view.lookups;
    const tipHost = el;
    if (spec?.report || g.type === 'pie') {
      const id = spec?.report ?? 'breakdown';
      if (this.view.isEmpty(id, data)) { el.innerHTML = this.stateHtml(L(id === 'control' ? 'noCompleted' : 'noData')); return; }
      const width = Math.max(160, el.clientWidth - 8);
      const legendH = id === 'breakdown' && width >= 380 ? 0 : 26;
      const height = Math.max(110, el.clientHeight - legendH - 6);
      const opts = { ...(g.config ?? {}), chart: 'pie', metric: g.config?.metric };
      const chart = REPORTS[id].draw(data, opts, { width, height }, palette(this.view.root), this.view.cx);
      el.innerHTML = `<div class="db-chart">${chart.svg}</div>${chart.legend ?? ''}`;
      const holder = el.querySelector('.db-chart');
      const prev = this.untips.findIndex((x) => x.id === g.id);
      if (prev >= 0) { this.untips[prev](); this.untips.splice(prev, 1); }
      const off = bindTooltip(holder, () => chart.tips);
      off.id = g.id;
      this.untips.push(off);
      el.dataset.count = String(chart.counts ? Object.values(chart.counts)[0] : '');
      return;
    }
    if (g.type === 'markdown') { el.innerHTML = `<div class="db-md">${renderMarkdown(data.text)}</div>`; return; }
    const items = data.items ?? [];
    if (!items.length) { el.innerHTML = this.stateHtml(L(g.type === 'assignedToMe' ? 'nothingAssigned' : 'noIssues')); return; }
    const lang = this.view.lang;
    el.innerHTML = `<ul class="db-issues">${items.map((r) => {
      const ty = lk.types.get(r.typeId);
      const st = lk.statuses.get(r.statusId);
      const pr = lk.priorities.get(r.priorityId);
      const right = g.type === 'activity' ? `<small class="muted">${escapeHtml(shortDate(r.updatedAt, lang))}</small>` : st ? `<span class="bl-lozenge ${st.category}">${escapeHtml(st.name)}</span>` : '';
      return `<li><button class="db-issue" data-open-issue="${escapeHtml(r.id)}" title="${escapeHtml(`${r.key} ${r.summary}`)}">${renderIconRef(ty?.icon, { size: 15, fallback: 'b:task' })}${pr ? renderIconRef(pr.icon, { size: 13 }) : ''}<b>${escapeHtml(r.key)}</b><span>${escapeHtml(r.summary)}</span>${right}</button></li>`;
    }).join('')}</ul>${data.total > items.length ? `<p class="db-more muted">${escapeHtml(L('moreIssues', { n: data.total - items.length, total: data.total }))}</p>` : ''}`;
    void tipHost;
  }

  // ───────────────────────── actions

  onClick(event) {
    const t = event.target;
    const drop = t.closest('[data-drop]');
    if (drop) { event.stopPropagation(); return this.openDrop(drop); }
    const dact = t.closest('[data-dact]');
    if (dact && !dact.disabled) return this.dashAction(dact.dataset.dact);
    const gact = t.closest('[data-gact]');
    if (gact) { const id = gact.closest('[data-gadget]')?.dataset.gadget; return this.gadgetAction(gact.dataset.gact, id, gact); }
    const issue = t.closest('[data-open-issue]');
    if (issue) return this.ctx.openIssue?.(issue.dataset.openIssue);
    return undefined;
  }

  openDrop(button) {
    if (button.dataset.drop === 'dash') {
      const row = (d) => ({ value: d.id, label: d.name, detail: d.mine ? (d.shared ? L('dashShared') : '') : L('dashOthers'), icon: renderIconRef(d.icon, { size: 16, fallback: 'b:chart' }) });
      const mine = this.list.filter((d) => d.mine);
      const others = this.list.filter((d) => !d.mine);
      return openPicker(button, {
        items: [...(mine.length ? [{ group: L('dashMine') }, ...mine.map(row)] : []), ...(others.length ? [{ group: L('dashSharedGroup') }, ...others.map(row)] : []), ...(this.list.length ? [{ separator: true }] : []), { value: '__new', label: L('dashNew'), icon: icon('plus') }],
        value: this.dash?.id, width: 240,
        onPick: (v) => { if (v === '__new') this.dashAction('new'); else { this.cache.clear(); this.load(v); } },
      });
    }
    if (button.dataset.drop === 'addGadget') {
      return openPicker(button, { items: Object.keys(GADGETS).map((type) => ({ value: type, label: L(`g_${type}`), detail: L(`gd_${type}`), icon: icon(GADGETS[type].icon) })), width: 300, onPick: (type) => this.addGadget(type) });
    }
    return undefined;
  }

  async dashAction(act) {
    const d = this.dash;
    try {
      if (act === 'new') return await this.createDashboard();
      if (act === 'refresh') return this.refreshGadgets();
      if (!d) return undefined;
      if (act === 'rename') {
        const out = await this.ctx.popups.open('prompt', { icon: 'edit', title: L('dashRename'), label: L('dashName'), value: d.name });
        const name = out?.value?.trim();
        if (!name || name === d.name) return undefined;
        const before = d.name;
        await this.patch({ name });
        this.ctx.history.record({ label: L('opDashRename', { name }), undo: () => this.patchById(d.id, { name: before }), redo: () => this.patchById(d.id, { name }) });
      } else if (act === 'share') {
        const shared = !d.shared;
        await this.patch({ shared });
        this.ctx.notify('info', L(shared ? 'dashNowShared' : 'dashNowPrivate', { name: d.name }));
      } else if (act === 'delete') {
        const choice = await this.ctx.app.ask({ icon: 'trash', title: L('dashDelete'), message: L('dashDeleteAsk', { name: d.name }), buttons: [{ id: 'cancel', label: L('cancel') }, { id: 'delete', label: L('delete'), icon: 'trash', danger: true, primary: true }] });
        if (choice !== 'delete') return undefined;
        await this.api.del(`/dashboards/${encodeURIComponent(d.id)}`);
        let copy = { name: d.name, icon: d.icon, shared: d.shared, layout: d.layout };
        this.ctx.history.record({
          label: L('opDashDelete', { name: d.name }),
          undo: async () => { const row = await this.api.post('/dashboards', copy); copy = { ...copy, id: row.id }; await this.load(row.id); },
          redo: async () => { if (copy.id) await this.api.del(`/dashboards/${encodeURIComponent(copy.id)}`); await this.load(); },
        });
        this.ctx.notify('success', L('dashDeleted', { name: d.name }));
        this.view.prefs.dashboardId = null;
        await this.load(null);
      }
    } catch (error) {
      this.ctx.showError(E('dashFailed'), error);
    }
    return undefined;
  }

  /** New dashboard with starter gadgets for the current project. */
  async createDashboard(name = null) {
    if (name == null) {
      const out = await this.ctx.popups.open('prompt', { icon: 'plus', title: L('dashNew'), label: L('dashName'), value: L('dashDefaultName', { key: this.project.key }) });
      name = out?.value?.trim();
      if (!name) return null;
    }
    const key = this.project.key;
    const gadgets = pack([
      { id: uid(), type: 'assignedToMe', config: {}, col: 0, row: 0, w: 1, h: 2 },
      { id: uid(), type: 'pie', config: { jql: `project = ${quoted(key)}`, field: 'status' }, col: 1, row: 0, w: 1, h: 2 },
      { id: uid(), type: 'createdVsResolved', config: { days: 30 }, col: 2, row: 0, w: 1, h: 2 },
      { id: uid(), type: 'filterResults', config: { jql: `project = ${quoted(key)} AND statusCategory != done ORDER BY priority DESC`, limit: 8 }, col: 0, row: 2, w: 2, h: 2 },
      { id: uid(), type: 'markdown', config: { text: L('markdownDefault') }, col: 2, row: 2, w: 1, h: 2 },
    ], 3);
    let row = await this.api.post('/dashboards', { name, icon: 'b:chart', layout: { columns: 3, gadgets } });
    this.ctx.notify('success', L('dashCreated', { name }));
    this.ctx.history.record({
      label: L('opDashCreate', { name }),
      undo: async () => { await this.api.del(`/dashboards/${encodeURIComponent(row.id)}`); await this.load(null); },
      redo: async () => { row = await this.api.post('/dashboards', { name, icon: 'b:chart', layout: { columns: 3, gadgets } }); await this.load(row.id); },
    });
    await this.load(row.id);
    return row;
  }

  async patch(fields) { return this.patchById(this.dash.id, fields); }

  async patchById(id, fields) {
    const run = async () => {
      const current = this.list.find((x) => x.id === id) ?? this.dash;
      let row;
      try {
        row = await this.api.patch(`/dashboards/${encodeURIComponent(id)}`, { ...fields, rev: current?.rev });
      } catch (error) {
        if (error.status !== 409) throw error;
        // Changed elsewhere (another window): applied over the current row.
        row = await this.api.patch(`/dashboards/${encodeURIComponent(id)}`, { ...fields });
      }
      const at = this.list.findIndex((x) => x.id === id);
      if (at >= 0) this.list[at] = row;
      if (this.dash?.id === id) {
        const keepCache = fields.layout && !fields.name;
        this.dash = this.normalise(row);
        if (!keepCache) this.cache.clear();
        this.renderBar();
        if (fields.layout || fields.shared !== undefined || !keepCache) this.renderGrid();
      }
      return row;
    };
    this.saving = this.saving.then(run, run);
    return this.saving;
  }

  /** Saves a new layout as one undoable step. */
  async commitLayout(next, label) {
    const before = clone(this.dash.layout);
    const id = this.dash.id;
    const after = { columns: next.columns, gadgets: pack(next.gadgets, next.columns) };
    this.dash = { ...this.dash, layout: after };
    this.renderGrid();
    try {
      await this.patchById(id, { layout: after });
      this.ctx.history.record({ label, undo: () => this.patchById(id, { layout: before }), redo: () => this.patchById(id, { layout: after }) });
    } catch (error) {
      this.ctx.showError(E('dashFailed'), error);
      await this.load(id);
    }
  }

  async setColumns(n) {
    if (!this.dash || n === this.columns) return;
    await this.commitLayout({ columns: n, gadgets: this.gadgets }, L('opDashColumns', { n }));
    this.renderBar();
  }

  async addGadget(type, config = null) {
    if (!this.dash || !GADGETS[type]) return null;
    const spec = GADGETS[type];
    const bottom = this.gadgets.reduce((m, g) => Math.max(m, g.row + g.h), 0);
    const g = { id: uid(), type, config: config ?? this.defaultConfig(type), col: 0, row: bottom, w: Math.min(spec.w, this.columns), h: spec.h };
    await this.commitLayout({ columns: this.columns, gadgets: [...this.gadgets, g] }, L('opGadgetAdd', { name: L(`g_${type}`) }));
    requestAnimationFrame(() => this.el.grid.querySelector(`[data-gadget="${CSS.escape(g.id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    return g;
  }

  defaultConfig(type) {
    const key = this.project.key;
    switch (type) {
      case 'filterResults': return { jql: `project = ${quoted(key)} AND statusCategory != done ORDER BY rank`, limit: 10 };
      case 'pie': return { jql: `project = ${quoted(key)}`, field: 'status' };
      case 'cfd': case 'createdVsResolved': return { days: 30 };
      case 'control': return { days: 90 };
      case 'throughput': return { days: 84, interval: 'week' };
      case 'assignedToMe': case 'activity': return { limit: 10 };
      case 'markdown': return { text: L('markdownDefault') };
      default: return {};
    }
  }

  async gadgetAction(act, id, button) {
    const g = this.gadgets.find((x) => x.id === id);
    if (!g) return undefined;
    if (act === 'refresh') { this.cache.delete(id); return this.fillGadget(g); }
    if (act === 'config') return this.configure(g);
    if (act === 'menu') {
      const cols = this.columns;
      return openPicker(button, {
        items: [
          { value: 'config', label: L('gadgetConfig'), icon: icon('gear') },
          { separator: true },
          { value: 'left', label: L('moveLeft'), icon: icon('chevronLeft'), disabled: g.col <= 0 },
          { value: 'right', label: L('moveRight'), icon: icon('chevronRight'), disabled: g.col + g.w >= cols },
          { value: 'up', label: L('moveUp'), icon: icon('chevronUp'), disabled: g.row <= 0 },
          { value: 'down', label: L('moveDown'), icon: icon('chevronDown') },
          { separator: true },
          { value: 'wider', label: L('wider'), icon: icon('distributeH'), disabled: g.w >= cols },
          { value: 'narrower', label: L('narrower'), icon: icon('distributeH'), disabled: g.w <= 1 },
          { value: 'taller', label: L('taller'), icon: icon('distributeV'), disabled: g.h >= 6 },
          { value: 'shorter', label: L('shorter'), icon: icon('distributeV'), disabled: g.h <= 1 },
          { separator: true },
          { value: 'remove', label: L('gadgetRemove'), icon: icon('trash'), danger: true },
        ],
        onPick: (v) => this.gadgetMenu(g, v),
      });
    }
    return undefined;
  }

  gadgetMenu(g, v) {
    if (v === 'config') return this.configure(g);
    if (v === 'remove') return this.commitLayout({ columns: this.columns, gadgets: this.gadgets.filter((x) => x.id !== g.id) }, L('opGadgetRemove', { name: this.titleOf(g) }));
    const delta = { left: [-1, 0, 0, 0], right: [1, 0, 0, 0], up: [0, -1, 0, 0], down: [0, 1, 0, 0], wider: [0, 0, 1, 0], narrower: [0, 0, -1, 0], taller: [0, 0, 0, 1], shorter: [0, 0, 0, -1] }[v];
    if (!delta) return undefined;
    return this.placeGadget(g.id, { col: g.col + delta[0], row: Math.max(0, g.row + delta[1]), w: g.w + delta[2], h: g.h + delta[3] }, ['left', 'right', 'up', 'down'].includes(v) ? 'move' : 'resize');
  }

  /** Moves / resizes one gadget (the others make room). */
  placeGadget(id, { col, row, w, h }, kind = 'move') {
    const g = this.gadgets.find((x) => x.id === id);
    if (!g) return undefined;
    const next = { ...g, col, row, w: Math.max(1, Math.min(this.columns, w)), h: Math.max(1, Math.min(6, h)) };
    if (next.col === g.col && next.row === g.row && next.w === g.w && next.h === g.h) return undefined;
    // Moving up past a gadget: it goes above it (pinned at the target row; the rest are pushed down).
    const gadgets = pack(this.gadgets.map((x) => (x.id === id ? next : x)), this.columns, id);
    return this.commitLayout({ columns: this.columns, gadgets }, L(kind === 'move' ? 'opGadgetMove' : 'opGadgetResize', { name: this.titleOf(g) }));
  }

  /** The gadget's settings in a form popup. */
  async configure(g) {
    const c = g.config ?? {};
    const lk = this.view.lookups;
    const fields = [{ name: 'title', type: 'text', label: L('cfgTitle'), value: c.title ?? '', placeholder: L(`g_${g.type}`), glyph: 'edit' }];
    const boards = this.view.boardsList ?? [];
    const scopeOptions = [{ value: '', label: L('cfgScopeCurrent'), glyph: 'columns' }, ...boards.map((b) => ({ value: `board:${b.id}`, label: b.name, glyph: 'columns' })), { value: `project:${this.project.id}`, label: L('cfgScopeProject', { name: this.project.name }), glyph: 'folder' }];
    const scopeValue = c.boardId ? `board:${c.boardId}` : c.projectId ? `project:${c.projectId}` : '';
    if (['filterResults', 'pie', 'activity'].includes(g.type)) {
      const filters = this.view.savedFilters ?? [];
      if (filters.length && g.type !== 'activity') fields.push({ name: 'filterId', type: 'select', label: L('cfgFilter'), value: c.filterId ?? '', options: [{ value: '', label: L('cfgFilterNone'), glyph: 'field' }, ...filters.map((f) => ({ value: f.id, label: f.name, glyph: f.favourite ? 'star' : 'filter' }))], glyph: 'filter' });
      fields.push({ name: 'jql', type: 'textarea', label: L('cfgJql'), value: c.jql ?? '', placeholder: `project = ${this.project.key}`, hint: L('cfgJqlHint'), glyph: 'search' });
    }
    if (g.type === 'pie') fields.push({ name: 'field', type: 'select', label: L('field'), value: c.field ?? 'status', options: BREAKDOWN_FIELDS.map((f) => ({ value: f, label: L(`f_${f}`), glyph: 'group' })), glyph: 'group', required: true });
    if (['cfd', 'control', 'throughput', 'createdVsResolved', 'workload'].includes(g.type)) fields.push({ name: 'scope', type: 'select', label: L('cfgScope'), value: scopeValue, options: scopeOptions, glyph: 'columns' });
    if (['cfd', 'control', 'throughput', 'createdVsResolved'].includes(g.type)) fields.push({ name: 'days', type: 'number', label: L('cfgDays'), value: c.days ?? this.defaultConfig(g.type).days ?? 30, min: 7, max: 365, step: 1, glyph: 'calendar', required: true });
    if (g.type === 'throughput') fields.push({ name: 'interval', type: 'select', label: L('cfgInterval'), value: c.interval ?? 'week', options: [{ value: 'week', label: L('perWeek'), glyph: 'calendar' }, { value: 'day', label: L('perDay'), glyph: 'clock' }], required: true });
    if (g.type === 'workload') fields.push({ name: 'metric', type: 'select', label: L('cfgMetric'), value: c.metric ?? 'count', options: [{ value: 'count', label: L('openIssues'), glyph: 'list' }, { value: 'points', label: L('storyPoints'), glyph: 'percent' }, { value: 'remaining', label: L('remainingHours'), glyph: 'clock' }], required: true });
    if (g.type === 'version') fields.push({ name: 'versionId', type: 'select', label: L('version'), value: c.versionId ?? '', options: [{ value: '', label: L('cfgVersionAuto'), glyph: 'sparkles' }, ...lk.versionsOf(this.project.id).map((v) => ({ value: v.id, label: v.name, glyph: v.released ? 'check' : 'calendar' }))] });
    if (['filterResults', 'assignedToMe', 'activity'].includes(g.type)) fields.push({ name: 'limit', type: 'number', label: L('cfgLimit'), value: c.limit ?? 10, min: 1, max: 50, step: 1, glyph: 'list', required: true });
    if (g.type === 'markdown') fields.push({ name: 'text', type: 'textarea', label: L('cfgText'), value: c.text ?? '', hint: L('cfgTextHint'), glyph: 'notes' });
    let values = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const out = await this.ctx.popups.open('form', { title: L('gadgetConfigTitle', { name: this.titleOf(g) }), icon: GADGETS[g.type].icon, fields, submitLabel: L('save') });
      if (!out?.values) return null;
      values = out.values;
      const jql = values.jql?.trim();
      if (!jql) break;
      const check = await this.api.validateJql(jql).catch((error) => ({ ok: false, error }));
      if (check.ok) break;
      this.ctx.notify('error', `${L('cfgJqlBad')}: ${check.error?.message ?? ''}`);
      for (const f of fields) if (f.name in values) f.value = values[f.name];
      values = null;
    }
    if (!values) return null;
    return this.applyConfig(g.id, values);
  }

  /** Applies form values (also used by tests) as one undoable step. */
  applyConfig(id, values) {
    const g = this.gadgets.find((x) => x.id === id);
    if (!g) return undefined;
    const config = { ...g.config };
    for (const [k, v] of Object.entries(values)) {
      if (k === 'scope') { delete config.boardId; delete config.projectId; const [kind, sid] = String(v || '').split(':'); if (kind === 'board') config.boardId = sid; else if (kind === 'project') config.projectId = sid; continue; }
      if (v === '' || v == null) delete config[k]; else config[k] = v;
    }
    this.cache.delete(id);
    return this.commitLayout({ columns: this.columns, gadgets: this.gadgets.map((x) => (x.id === id ? { ...x, config } : x)) }, L('opGadgetConfig', { name: this.titleOf(g) }));
  }

  // ───────────────────────── drag to move / resize

  cellSize() {
    const r = this.el.grid.getBoundingClientRect();
    const cols = this.columns;
    return { left: r.left, top: r.top, colW: (r.width - GAP * (cols - 1)) / cols, rowH: ROW_H };
  }

  onPointerDown(event) {
    if (event.button !== 0 || !this.dash?.mine) return;
    const card = event.target.closest('.db-gadget');
    if (!card) return;
    const grip = event.target.closest('.db-grip');
    const head = event.target.closest('.db-ghead');
    if (!grip && (!head || event.target.closest('button'))) return;
    if (this.view.root.classList.contains('tiny')) return;
    event.preventDefault();
    const g = this.gadgets.find((x) => x.id === card.dataset.gadget);
    const cs = this.cellSize();
    const startX = event.clientX;
    const startY = event.clientY;
    const ghost = document.createElement('div');
    ghost.className = 'db-ghost';
    ghost.style.cssText = this.placeStyle(g);
    this.el.grid.append(ghost);
    card.classList.add(grip ? 'resizing' : 'moving');
    let target = { col: g.col, row: g.row, w: g.w, h: g.h };
    const move = (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (grip) {
        target = { col: g.col, row: g.row, w: Math.max(1, Math.min(this.columns - g.col, g.w + Math.round(dx / (cs.colW + GAP)))), h: Math.max(1, Math.min(6, g.h + Math.round(dy / (cs.rowH + GAP)))) };
      } else {
        card.style.transform = `translate(${dx}px, ${dy}px)`;
        target = { col: Math.max(0, Math.min(this.columns - g.w, g.col + Math.round(dx / (cs.colW + GAP)))), row: Math.max(0, g.row + Math.round(dy / (cs.rowH + GAP))), w: g.w, h: g.h };
      }
      ghost.style.cssText = this.placeStyle(target);
    };
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      ghost.remove();
      card.classList.remove('moving', 'resizing');
      card.style.transform = '';
      this.placeGadget(g.id, target, grip ? 'resize' : 'move');
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  }

  /** A dashboard changed in another window (own changes do not come back). */
  onEvent(event) {
    if (event.type === 'dashboard.deleted' && event.id === this.dash?.id) { this.load(null); return; }
    if (event.type === 'dashboard.updated' && event.id === this.dash?.id && event.data) {
      this.dash = this.normalise({ ...event.data, mine: this.dash.mine });
      this.renderAll();
      return;
    }
    this.api.dashboards().then((list) => { this.list = Array.isArray(list) ? list : list?.items ?? []; this.renderBar(); }).catch(() => {});
  }
}
