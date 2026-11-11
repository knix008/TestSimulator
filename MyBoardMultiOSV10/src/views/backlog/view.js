// The backlog / search view (registered as 'backlog'): the project's issues as a ranked list grouped by
// board column (or status, epic, assignee), with a basic search (drop-down filters) and an advanced one
// (JQL with live validation and autocomplete), sortable and choosable columns, paging, saved filters,
// CSV export, multi-select with bulk changes, rank by drag and keyboard, inline create, an epics and
// versions panel, Undo/Redo of every change, and live updates from other users.
import { escapeHtml } from '../../ui/dom.js';
import { icon } from '../../icons.js';
import { renderIconRef } from '../../ui/iconref.js';
import { getLanguage } from '../../i18n.js';
import { openPicker, closePicker, dropButtonHtml } from './picker.js';
import { JqlEditor } from './jql-editor.js';
import { andJql, basicJql, quoted, SORT_FIELD, splitOrder, withOrder } from './jql-util.js';
import { Lookups } from './lookups.js';
import { saveFile, safeName } from './download.js';
import { L, E } from './texts.js';

const PREFS_KEY = 'myboard.backlog.v1';
const COLUMNS = {
  type: { w: '30px', icon: 'layers' },
  key: { w: '96px', icon: 'key' },
  summary: { w: 'minmax(200px, 1fr)', icon: 'notes', fixed: true },
  status: { w: '136px', icon: 'flag' },
  assignee: { w: '150px', icon: 'user' },
  reporter: { w: '140px', icon: 'user' },
  priority: { w: '104px', icon: 'sort' },
  labels: { w: '150px', icon: 'tag' },
  epic: { w: '150px', icon: 'star' },
  points: { w: '64px', icon: 'percent' },
  due: { w: '100px', icon: 'calendar' },
  created: { w: '100px', icon: 'clock' },
  updated: { w: '100px', icon: 'clock' },
};
const DEFAULT_COLUMNS = ['type', 'key', 'summary', 'status', 'assignee', 'priority', 'labels', 'epic', 'points', 'due'];
const PAGE_SIZES = [25, 50, 100, 200];
const GROUPS = { column: 'columns', status: 'flag', epic: 'star', assignee: 'user', none: 'list' };

const loadPrefs = () => { try { return JSON.parse(globalThis.localStorage?.getItem(PREFS_KEY) ?? '{}') ?? {}; } catch { return {}; } };
const storePrefs = (prefs) => { try { globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ } };

const fmtDate = (value) => {
  if (value == null || value === '') return '';
  const d = typeof value === 'number' ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(getLanguage() === 'en' ? 'en-US' : 'ko-KR', { year: '2-digit', month: 'short', day: 'numeric' });
};
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const initials = (name) => String(name ?? '?').split(/\s+/).map((w) => [...w][0] ?? '').join('').slice(0, 2).toUpperCase() || '?';

export class BacklogView {
  constructor(host, ctx) {
    this.host = host;
    this.ctx = ctx;
    this.api = ctx.api;
    this.lookups = new Lookups(ctx.api);
    const prefs = loadPrefs();
    this.prefs = {
      columns: Array.isArray(prefs.columns) && prefs.columns.length ? prefs.columns.filter((c) => COLUMNS[c]) : [...DEFAULT_COLUMNS],
      group: GROUPS[prefs.group] ? prefs.group : 'column',
      pageSize: PAGE_SIZES.includes(prefs.pageSize) ? prefs.pageSize : 50,
      side: prefs.side !== false,
      collapsed: Array.isArray(prefs.collapsed) ? prefs.collapsed : [],
    };
    if (!this.prefs.columns.includes('summary')) this.prefs.columns.splice(Math.min(2, this.prefs.columns.length), 0, 'summary');
    this.mode = 'basic';
    this.filters = { projects: [], types: [], statuses: [], assignees: [], priorities: [], labels: [], text: '', hideDone: false };
    this.side = { epic: null, version: null };
    this.order = [];
    this.page = 0;
    this.items = [];
    this.total = 0;
    this.state = 'loading';
    this.error = null;
    this.selected = new Set();
    this.anchor = null;
    this.cursor = null;
    this.savedFilters = [];
    this.filter = null;
    this.epicCounts = null;
    this.creating = false;
    this.createType = null;
    this.seq = 0;
    this.lastJql = '';
    this.labelsList = [];
    this.mount();
  }

  get doc() { return this.ctx.workspace; }
  get project() { return this.doc?.project ?? null; }
  get board() { return this.doc?.board ?? null; }
  get live() { return Boolean(this.project && !this.doc?.demo && this.ctx.app?.state?.core?.status === 'ready'); }

  // ───────────────────────── layout

  mount() {
    this.host.innerHTML = `<div class="bl-root" data-view="backlog">
      <div class="bl-bar"></div>
      <div class="bl-search"></div>
      <div class="bl-bulk" hidden></div>
      <div class="bl-main">
        <aside class="bl-side"></aside>
        <section class="bl-list" tabindex="0" aria-label="${escapeHtml(L('listLabel'))}" role="grid" aria-multiselectable="true">
          <div class="bl-table"><div class="bl-head" role="row"></div><div class="bl-body"></div><div class="bl-create"></div></div>
        </section>
      </div>
      <div class="bl-foot"></div>
    </div>`;
    this.root = this.host.firstElementChild;
    this.el = Object.fromEntries(['bar', 'search', 'bulk', 'side', 'list', 'head', 'body', 'create', 'foot'].map((k) => [k, this.root.querySelector(`.bl-${k}`)]));
    this.bindEvents();
    this.resizer = new ResizeObserver(() => this.fit());
    this.resizer.observe(this.root);
    globalThis.__myboardBacklog = this;
    if (!this.live) { this.state = this.doc?.demo ? 'demo' : 'offline'; this.renderAll(); return; }
    this.filters.projects = [this.project.key];
    this.renderAll();
    this.load();
  }

  destroy() {
    closePicker();
    this.resizer?.disconnect();
    this.editor?.destroy();
    if (globalThis.__myboardBacklog === this) globalThis.__myboardBacklog = null;
  }

  fit() {
    const w = this.root.clientWidth;
    this.root.classList.toggle('narrow', w < 820);
    this.root.classList.toggle('tiny', w < 560);
  }

  savePrefs() { storePrefs(this.prefs); }

  // ───────────────────────── data

  async load() {
    this.state = 'loading';
    this.renderList();
    try {
      if (this.board) {
        this.boardData = await this.api.boardData(this.board.id);
        this.lookups.absorb(this.boardData);
      } else {
        await this.lookups.project(this.project.id);
      }
      this.lookups.projects.set(this.project.id, this.project);
      await Promise.all([this.lookups.ensureUsers(), this.lookups.ensureProjects(), this.loadFilters(), this.loadLabels()]);
      this.renderAll();
      await this.search();
    } catch (error) {
      this.state = 'error';
      this.error = error;
      this.renderList();
    }
  }

  async loadFilters() {
    try { const list = await this.api.filters(); this.savedFilters = Array.isArray(list) ? list : list?.items ?? []; } catch { this.savedFilters = []; }
  }

  async loadLabels() {
    try {
      const out = await this.api.get('/reports/breakdown', { jql: `project = ${quoted(this.project.key)}`, field: 'labels' });
      this.labelsList = (out?.items ?? []).map((x) => x.key).filter(Boolean).sort();
    } catch { this.labelsList = []; }
  }

  /** The query without the side panel's epic/version and without ORDER BY. */
  baseWhere() {
    if (this.mode === 'jql') return splitOrder(this.editor?.value ?? this.jqlText ?? '').where;
    return basicJql(this.filters);
  }

  sideClause() {
    const parts = [];
    if (this.side.epic === '') parts.push('epic is EMPTY');
    else if (this.side.epic) parts.push(`epic = ${quoted(this.side.epic)}`);
    if (this.side.version) parts.push(`fixVersion = ${quoted(this.side.version)}`);
    return parts.join(' AND ');
  }

  effectiveOrder() {
    if (this.mode === 'jql') {
      const own = splitOrder(this.editor?.value ?? this.jqlText ?? '').order;
      if (own.length) return own;
    }
    return this.order.length ? this.order : [{ field: 'rank', dir: 'asc' }];
  }

  /** The query the list shows (what CSV export and saved filters use). */
  currentJql() {
    return withOrder(andJql(this.baseWhere(), this.sideClause()), this.effectiveOrder());
  }

  rankable() {
    const order = this.effectiveOrder();
    return order.length === 1 && order[0].field.toLowerCase() === 'rank' && order[0].dir === 'asc';
  }

  async search({ keepPage = false, quiet = false } = {}) {
    if (!this.live) return;
    if (!keepPage) this.page = 0;
    const jql = this.currentJql();
    const seq = ++this.seq;
    if (!quiet) { this.state = 'loading'; this.renderFoot(); this.root.classList.add('busy'); }
    try {
      const out = await this.api.issues({ jql, limit: this.prefs.pageSize, offset: this.page * this.prefs.pageSize });
      if (seq !== this.seq) return;
      this.items = out?.items ?? [];
      this.total = out?.total ?? this.items.length;
      if (this.page > 0 && !this.items.length && this.total) { this.page = Math.floor((this.total - 1) / this.prefs.pageSize); return this.search({ keepPage: true, quiet }); }
      await this.lookups.forRows(this.items);
      this.lastJql = jql;
      this.state = 'ready';
      this.error = null;
      const ids = new Set(this.items.map((i) => i.id));
      for (const id of [...this.selected]) if (!ids.has(id)) this.selected.delete(id);
    } catch (error) {
      if (seq !== this.seq) return;
      this.state = 'error';
      this.error = error;
    } finally {
      if (seq === this.seq) this.root.classList.remove('busy');
    }
    this.renderList();
    this.renderBulk();
    this.renderFoot();
    this.loadEpicCounts();
    return undefined;
  }

  async loadEpicCounts() {
    const where = this.baseWhere();
    const key = where;
    if (this.epicKey === key && this.epicCounts) { this.renderSide(); return; }
    this.epicKey = key;
    try {
      const out = await this.api.get('/reports/breakdown', { jql: where || `project = ${quoted(this.project.key)}`, field: 'epic' });
      if (this.epicKey !== key) return;
      this.epicCounts = new Map((out?.items ?? []).map((x) => [x.key ?? '', x.count]));
      this.epicTotal = out?.total ?? 0;
    } catch { this.epicCounts = null; }
    this.renderSide();
  }

  // ───────────────────────── rendering

  renderAll() {
    this.renderBar();
    this.renderSearch();
    this.renderBulk();
    this.renderSide();
    this.renderList();
    this.renderFoot();
    this.fit();
  }

  renderBar() {
    const live = this.live;
    const filterLabel = this.filter ? this.filter.name : L('filters');
    this.el.bar.innerHTML = `
      <span class="segmented bl-mode" role="tablist">
        <button class="segment ${this.mode === 'basic' ? 'active' : ''}" data-act="mode" data-value="basic" role="tab" aria-selected="${this.mode === 'basic'}" title="${escapeHtml(L('modeBasicTip'))}">${icon('filter')}<span>${escapeHtml(L('modeBasic'))}</span></button>
        <button class="segment ${this.mode === 'jql' ? 'active' : ''}" data-act="mode" data-value="jql" role="tab" aria-selected="${this.mode === 'jql'}" title="${escapeHtml(L('modeJqlTip'))}">${icon('field')}<span>${escapeHtml(L('modeJql'))}</span></button>
      </span>
      ${dropButtonHtml({ id: 'filters', iconHtml: icon(this.filter?.favourite ? 'star' : 'save'), label: filterLabel, tip: L('filtersTip'), cls: this.filter ? 'on' : '' })}
      <span class="grow"></span>
      ${dropButtonHtml({ id: 'group', iconHtml: icon(GROUPS[this.prefs.group]), label: `${L('groupBy')}: ${L(`group_${this.prefs.group}`)}`, tip: L('groupTip') })}
      ${dropButtonHtml({ id: 'columns', iconHtml: icon('table'), label: L('columns'), tip: L('columnsTip') })}
      <button class="small-button bl-tool" data-act="side" aria-pressed="${this.prefs.side}" title="${escapeHtml(L('sideTip'))}">${icon('panelLeft')}<span>${escapeHtml(L('side'))}</span></button>
      <button class="small-button bl-tool" data-act="export" ${live ? '' : 'disabled'} title="${escapeHtml(L('exportTip'))}">${icon('csvFile')}<span>${escapeHtml(L('exportCsv'))}</span></button>
      <button class="button primary small bl-tool" data-act="create" ${live ? '' : 'disabled'} title="${escapeHtml(L('createTip'))}">${icon('plus')}<span>${escapeHtml(L('create'))}</span></button>`;
    this.el.bar.querySelector('[data-act="side"]').classList.toggle('active', this.prefs.side);
  }

  renderSearch() {
    if (this.mode === 'jql') {
      if (!this.el.search.querySelector('.mbv-jql')) {
        this.el.search.innerHTML = `<div class="bl-jql-row"><div class="bl-jql-host"></div><button class="button primary small" data-act="run" title="${escapeHtml(L('runTip'))}">${icon('search')}<span>${escapeHtml(L('run'))}</span></button></div><div class="bl-chips"></div>`;
        this.editor = new JqlEditor(this.el.search.querySelector('.bl-jql-host'), { api: this.api, value: this.jqlText ?? '', onSubmit: () => this.search(), onChange: (text) => { this.jqlText = text; } });
      }
      this.renderChips();
      return;
    }
    this.editor?.destroy();
    this.editor = null;
    const f = this.filters;
    const lk = this.lookups;
    const nameList = (values, fn) => (values.length ? values.map(fn).join(', ') : L('any'));
    const user = (v) => (v === 'me' ? L('me') : v === '' ? L('unassigned') : lk.usersList().find((u) => u.username === v)?.displayName ?? v);
    this.el.search.innerHTML = `<div class="bl-basic">
      <label class="search-box bl-text">${icon('search')}<input type="search" data-input="text" value="${escapeHtml(f.text)}" placeholder="${escapeHtml(L('textPlaceholder'))}" aria-label="${escapeHtml(L('textPlaceholder'))}" /></label>
      ${dropButtonHtml({ id: 'f:projects', iconHtml: icon('folder'), label: `${L('fProject')}: ${nameList(f.projects, (k) => k)}`, cls: f.projects.length ? 'on' : '' })}
      ${dropButtonHtml({ id: 'f:types', iconHtml: icon('layers'), label: `${L('fType')}: ${nameList(f.types, (x) => x)}`, cls: f.types.length ? 'on' : '' })}
      ${dropButtonHtml({ id: 'f:statuses', iconHtml: icon('flag'), label: `${L('fStatus')}: ${nameList(f.statuses, (x) => x)}`, cls: f.statuses.length ? 'on' : '' })}
      ${dropButtonHtml({ id: 'f:assignees', iconHtml: icon('user'), label: `${L('fAssignee')}: ${nameList(f.assignees, user)}`, cls: f.assignees.length ? 'on' : '' })}
      ${dropButtonHtml({ id: 'f:priorities', iconHtml: icon('sort'), label: `${L('fPriority')}: ${nameList(f.priorities, (x) => x)}`, cls: f.priorities.length ? 'on' : '' })}
      ${dropButtonHtml({ id: 'f:labels', iconHtml: icon('tag'), label: `${L('fLabels')}: ${nameList(f.labels, (x) => x)}`, cls: f.labels.length ? 'on' : '' })}
      <label class="inline-check bl-hide-done" title="${escapeHtml(L('hideDoneTip'))}"><input type="checkbox" data-input="hideDone" ${f.hideDone ? 'checked' : ''} />${icon('eye')}<span>${escapeHtml(L('hideDone'))}</span></label>
      <button class="small-button" data-act="clear" title="${escapeHtml(L('clearTip'))}">${icon('filterClear')}<span>${escapeHtml(L('clear'))}</span></button>
    </div><div class="bl-chips"></div>`;
    this.renderChips();
  }

  renderChips() {
    const host = this.el.search.querySelector('.bl-chips');
    if (!host) return;
    const chips = [];
    if (this.side.epic != null) {
      const epic = [...this.lookups.epics.values()].find((e) => e.key === this.side.epic);
      chips.push(`<span class="bl-chip">${icon('star')}<span>${escapeHtml(L('epic'))}: ${escapeHtml(this.side.epic === '' ? L('noEpic') : `${this.side.epic} ${epic?.summary ?? ''}`)}</span><button class="icon-button" data-act="unside" data-value="epic" title="${escapeHtml(L('removeFilter'))}">${icon('close', 'icon tiny')}</button></span>`);
    }
    if (this.side.version) chips.push(`<span class="bl-chip">${icon('tag')}<span>${escapeHtml(L('version'))}: ${escapeHtml(this.side.version)}</span><button class="icon-button" data-act="unside" data-value="version" title="${escapeHtml(L('removeFilter'))}">${icon('close', 'icon tiny')}</button></span>`);
    host.innerHTML = chips.join('');
    host.hidden = !chips.length;
  }

  renderBulk() {
    const n = this.selected.size;
    this.el.bulk.hidden = n === 0;
    if (!n) { this.el.bulk.innerHTML = ''; return; }
    this.el.bulk.innerHTML = `<span class="bl-bulk-count">${icon('selectAll')}<b>${escapeHtml(L('selected', { n }))}</b></span>
      ${dropButtonHtml({ id: 'b:transition', iconHtml: icon('flag'), label: L('bTransition') })}
      ${dropButtonHtml({ id: 'b:assign', iconHtml: icon('user'), label: L('bAssign') })}
      ${dropButtonHtml({ id: 'b:priority', iconHtml: icon('sort'), label: L('bPriority') })}
      ${dropButtonHtml({ id: 'b:labels', iconHtml: icon('tag'), label: L('bLabels') })}
      <button class="small-button danger" data-act="bulkDelete" title="${escapeHtml(L('bDeleteTip'))}">${icon('trash')}<span>${escapeHtml(L('bDelete'))}</span></button>
      <span class="grow"></span>
      <button class="small-button" data-act="deselect" title="${escapeHtml(L('deselectTip'))}">${icon('deselect')}<span>${escapeHtml(L('deselect'))}</span></button>`;
  }

  renderSide() {
    const side = this.el.side;
    this.root.classList.toggle('no-side', !this.prefs.side);
    if (!this.prefs.side) { side.innerHTML = ''; return; }
    if (!this.live) { side.innerHTML = ''; return; }
    const epics = [...this.lookups.epics.values()].filter((e) => e.projectId === this.project.id);
    const counts = this.epicCounts;
    const count = (k) => (counts ? `<i class="bl-side-count">${counts.get(k) ?? 0}</i>` : '');
    const item = (kind, value, active, glyph, label, extra = '', tip = label) => `<button class="bl-side-item ${active ? 'active' : ''}" data-side="${kind}" data-value="${escapeHtml(value)}" title="${escapeHtml(tip)}" aria-pressed="${active}">${glyph}<span>${escapeHtml(label)}</span>${extra}</button>`;
    const versions = this.lookups.versionsOf(this.project.id);
    side.innerHTML = `<div class="bl-side-head">${icon('star')}<span>${escapeHtml(L('epics'))}</span><button class="icon-button" data-act="side" title="${escapeHtml(L('sideHide'))}">${icon('panelLeftClose')}</button></div>
      <div class="bl-side-list">
        ${item('epic', '*', this.side.epic == null, icon('list'), L('allIssues'), counts ? `<i class="bl-side-count">${this.epicTotal ?? ''}</i>` : '')}
        ${epics.map((e) => item('epic', e.key, this.side.epic === e.key, `<span class="bl-epic-dot" style="background:${escapeHtml(e.color || '#7e4fd8')}"></span>`, e.summary, count(e.id), `${e.key} ${e.summary}`)).join('')}
        ${item('epic', '', this.side.epic === '', icon('dot'), L('noEpic'), count(''))}
      </div>
      <div class="bl-side-head">${icon('tag')}<span>${escapeHtml(L('versions'))}</span></div>
      <div class="bl-side-list">
        ${item('version', '*', !this.side.version, icon('list'), L('allVersions'))}
        ${versions.length ? versions.map((v) => item('version', v.name, this.side.version === v.name, icon(v.released ? 'check' : 'calendar'), v.name, v.released ? `<i class="badge ok">${escapeHtml(L('released'))}</i>` : v.releaseDate ? `<small>${escapeHtml(fmtDate(v.releaseDate))}</small>` : '')).join('') : `<p class="muted bl-side-empty">${escapeHtml(L('noVersions'))}</p>`}
      </div>`;
  }

  /** Groups of the rows: [{ id, name, glyph, rows, kind }] in board / status order. */
  groups() {
    const mode = this.prefs.group;
    const items = this.items;
    const lk = this.lookups;
    if (mode === 'none') return [{ id: 'all', name: L('allIssues'), glyph: icon('list'), rows: items }];
    const out = [];
    const byKey = new Map();
    const add = (id, name, glyph, extra = {}) => { const g = { id, name, glyph, rows: [], ...extra }; out.push(g); byKey.set(id, g); return g; };
    if (mode === 'column' && this.boardData?.columns?.length) {
      for (const c of this.boardData.columns) add(`col:${c.id}`, c.name, icon(c.backlog ? 'list' : c.done ? 'check' : 'columns'), { columnId: c.id, backlog: c.backlog, done: c.done, statusIds: c.statusIds });
      const other = add('col:other', L('notOnBoard'), icon('question'), { other: true });
      for (const row of items) {
        const g = out.find((x) => x.statusIds?.includes(row.statusId)) ?? other;
        g.rows.push(row);
      }
      return out.filter((g) => g.rows.length || !g.other);
    }
    const keyOf = {
      column: (r) => r.statusId, status: (r) => r.statusId, epic: (r) => r.epicId ?? '', assignee: (r) => r.assigneeId ?? '',
    }[mode] ?? ((r) => r.statusId);
    for (const row of items) {
      const k = keyOf(row);
      let g = byKey.get(k);
      if (!g) {
        if (mode === 'epic') { const e = lk.epicOf(k); g = add(k, e ? `${e.key} ${e.summary}` : L('noEpic'), e ? `<span class="bl-epic-dot" style="background:${escapeHtml(e.color || '#7e4fd8')}"></span>` : icon('dot'), { sort: e ? e.key : '~' }); }
        else if (mode === 'assignee') { const u = lk.users.get(k); g = add(k, u ? lk.userName(k) : L('unassigned'), u ? renderIconRef(u.avatar, { size: 18, fallback: `l:${initials(lk.userName(k))}` }) : icon('user'), { sort: u ? lk.userName(k) : '~' }); }
        else { const s = lk.statuses.get(k); g = add(k, s?.name ?? '?', `<span class="bl-cat-dot ${s?.category ?? 'todo'}"></span>`, { statusId: k, sort: `${s?.projectId === this.project.id ? 0 : 1}${String(s?.position ?? 99).padStart(3, '0')}` }); }
      }
      g.rows.push(row);
    }
    if (mode === 'status' || mode === 'column') out.sort((a, b) => a.sort.localeCompare(b.sort));
    else out.sort((a, b) => String(a.sort).localeCompare(String(b.sort)));
    return out;
  }

  gridTemplate() { return `44px ${this.prefs.columns.map((c) => COLUMNS[c].w).join(' ')}`; }

  renderList() {
    const { head, body, create } = this.el;
    this.el.list.style.setProperty('--bl-grid', this.gridTemplate());
    const order = this.effectiveOrder();
    head.innerHTML = `<span class="bl-cell bl-check-cell"><input type="checkbox" data-act="selectAll" aria-label="${escapeHtml(L('selectAll'))}" title="${escapeHtml(L('selectAll'))}" ${this.items.length && this.items.every((i) => this.selected.has(i.id)) ? 'checked' : ''} /></span>` + this.prefs.columns.map((c) => {
      const field = SORT_FIELD[c];
      const sorted = field && order[0]?.field?.toLowerCase() === field.toLowerCase() ? order[0].dir : '';
      return `<span class="bl-cell bl-h-${c} ${field ? 'sortable' : ''} ${sorted ? 'sorted' : ''}" role="columnheader" ${field ? `data-sort="${c}" tabindex="0" aria-sort="${sorted === 'desc' ? 'descending' : sorted ? 'ascending' : 'none'}"` : ''} title="${escapeHtml(field ? L('sortTip', { name: L(`col_${c}`) }) : L(`col_${c}`))}">${c === 'type' ? icon('layers', 'icon tiny') : `<span>${escapeHtml(L(`col_${c}`))}</span>`}${sorted ? icon(sorted === 'desc' ? 'arrowDown' : 'chevronUp', 'icon tiny') : ''}</span>`;
    }).join('');
    if (this.state === 'demo' || this.state === 'offline') {
      body.innerHTML = this.emptyHtml(this.state === 'demo' ? 'demoTitle' : 'offlineTitle', this.state === 'demo' ? 'demoText' : 'offlineText', 'database');
      create.innerHTML = '';
      return;
    }
    if (this.state === 'error') {
      body.innerHTML = `${this.emptyHtml('errorTitle', null, 'error', this.error?.message ?? '')}<div class="bl-empty-actions"><button class="small-button" data-act="retry">${icon('refresh')}<span>${escapeHtml(L('retry'))}</span></button></div>`;
      create.innerHTML = '';
      return;
    }
    if (this.state === 'loading' && !this.items.length) {
      body.innerHTML = `<div class="bl-loading">${Array.from({ length: 6 }, () => '<div class="bl-skeleton"></div>').join('')}<span class="muted">${escapeHtml(L('loading'))}</span></div>`;
      return;
    }
    if (!this.items.length) {
      body.innerHTML = this.emptyHtml('emptyTitle', 'emptyText', 'search');
    } else {
      const rankable = this.rankable();
      body.innerHTML = this.groups().map((g) => {
        const collapsed = this.prefs.collapsed.includes(g.id) && this.prefs.group !== 'none';
        const points = g.rows.reduce((a, r) => a + (Number(r.storyPoints) || 0), 0);
        const header = this.prefs.group === 'none' ? '' : `<div class="bl-group-head" data-group="${escapeHtml(g.id)}" role="row">
          <button class="icon-button" data-act="collapse" data-value="${escapeHtml(g.id)}" aria-expanded="${!collapsed}" title="${escapeHtml(L(collapsed ? 'expand' : 'collapse'))}">${icon(collapsed ? 'chevronRight' : 'chevronDown', 'icon tiny')}</button>
          ${g.glyph}<b>${escapeHtml(g.name)}</b><i class="bl-count">${g.rows.length}</i>${points ? `<small class="muted">${escapeHtml(L('points', { n: points }))}</small>` : ''}${g.backlog ? `<i class="badge">${escapeHtml(L('backlogBadge'))}</i>` : ''}</div>`;
        const rows = collapsed ? '' : g.rows.map((r) => this.rowHtml(r, rankable)).join('') || `<div class="bl-group-empty muted" data-group-empty="${escapeHtml(g.id)}">${escapeHtml(L('groupEmpty'))}</div>`;
        return `<div class="bl-group ${collapsed ? 'collapsed' : ''}" data-group-id="${escapeHtml(g.id)}">${header}<div class="bl-group-body" data-group-body="${escapeHtml(g.id)}">${rows}</div></div>`;
      }).join('');
    }
    this.renderCreate();
  }

  emptyHtml(titleKey, textKey, glyph, detail = '') {
    return `<div class="bl-empty">${icon(glyph, 'icon big')}<b>${escapeHtml(L(titleKey))}</b>${textKey ? `<p class="muted">${escapeHtml(L(textKey))}</p>` : ''}${detail ? `<p class="muted">${escapeHtml(detail)}</p>` : ''}</div>`;
  }

  rowHtml(r, rankable) {
    const lk = this.lookups;
    const sel = this.selected.has(r.id);
    const cells = this.prefs.columns.map((c) => `<span class="bl-cell bl-c-${c}" role="gridcell">${this.cellHtml(c, r, lk)}</span>`).join('');
    return `<div class="bl-row ${sel ? 'selected' : ''} ${this.cursor === r.id ? 'cursor' : ''} ${r.flagged ? 'flagged' : ''}" role="row" aria-selected="${sel}" data-id="${escapeHtml(r.id)}" data-key="${escapeHtml(r.key)}">
      <span class="bl-cell bl-check-cell">${rankable ? `<span class="bl-grip" title="${escapeHtml(L('dragTip'))}">${icon('grip', 'icon tiny')}</span>` : '<span class="bl-grip off"></span>'}<input type="checkbox" class="bl-check" ${sel ? 'checked' : ''} aria-label="${escapeHtml(L('selectRow', { key: r.key }))}" /></span>${cells}</div>`;
  }

  cellHtml(c, r, lk) {
    switch (c) {
      case 'type': { const ty = lk.types.get(r.typeId); return renderIconRef(ty?.icon, { size: 16, title: ty?.name ?? '', fallback: 'b:task' }); }
      case 'key': return `<span class="bl-key ${r.resolutionId ? 'resolved' : ''}">${escapeHtml(r.key)}</span>`;
      case 'summary': return `<span class="bl-summary" title="${escapeHtml(r.summary)}">${r.flagged ? icon('flag', 'icon tiny bl-flag') : ''}${escapeHtml(r.summary)}</span>`;
      case 'status': { const s = lk.statuses.get(r.statusId); return s ? `<span class="bl-lozenge ${s.category}" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</span>` : ''; }
      case 'assignee':
      case 'reporter': {
        const id = c === 'assignee' ? r.assigneeId : r.reporterId;
        if (!id) return `<span class="muted bl-person">${icon('user', 'icon tiny')}<span>${escapeHtml(L('unassigned'))}</span></span>`;
        const u = lk.users.get(id); const name = lk.userName(id) || '?';
        return `<span class="bl-person">${renderIconRef(u?.avatar, { size: 20, fallback: `l:${initials(name)}` })}<span>${escapeHtml(name)}</span></span>`;
      }
      case 'priority': { const p = lk.priorities.get(r.priorityId); return p ? `<span class="bl-prio">${renderIconRef(p.icon, { size: 15, fallback: 'b:priority-medium' })}<span>${escapeHtml(p.name)}</span></span>` : ''; }
      case 'labels': return (r.labels ?? []).map((l) => `<span class="bl-label">${escapeHtml(l)}</span>`).join('');
      case 'epic': { const e = lk.epicOf(r.epicId); return e ? `<span class="bl-epic" style="--epic:${escapeHtml(e.color || '#7e4fd8')}" title="${escapeHtml(`${e.key} ${e.summary}`)}">${escapeHtml(e.summary)}</span>` : ''; }
      case 'points': return r.storyPoints != null ? `<span class="bl-points">${escapeHtml(String(r.storyPoints))}</span>` : '';
      case 'due': return r.dueDate ? `<span class="bl-date ${!r.resolutionId && r.dueDate < today() ? 'overdue' : ''}">${escapeHtml(fmtDate(r.dueDate))}</span>` : '';
      case 'created': return `<span class="bl-date">${escapeHtml(fmtDate(r.createdAt))}</span>`;
      case 'updated': return `<span class="bl-date">${escapeHtml(fmtDate(r.updatedAt))}</span>`;
      default: return '';
    }
  }

  renderCreate() {
    const host = this.el.create;
    if (!this.live || this.state === 'error') { host.innerHTML = ''; return; }
    if (!this.creating) {
      host.innerHTML = `<button class="bl-create-open" data-act="create" title="${escapeHtml(L('createTip'))}">${icon('plus')}<span>${escapeHtml(L('createInline'))}</span></button>`;
      return;
    }
    const types = this.createTypes();
    const type = types.find((x) => x.id === this.createType) ?? types[0];
    this.createType = type?.id ?? null;
    host.innerHTML = `<div class="bl-create-row">
      ${dropButtonHtml({ id: 'createType', iconHtml: renderIconRef(type?.icon, { size: 16, fallback: 'b:task' }), label: type?.name ?? '', tip: L('createTypeTip') })}
      <input class="bl-create-input" type="text" maxlength="500" placeholder="${escapeHtml(L('createPlaceholder'))}" aria-label="${escapeHtml(L('createPlaceholder'))}" />
      <button class="button primary small" data-act="createSubmit" title="${escapeHtml(L('createSubmitTip'))}">${icon('check')}<span>${escapeHtml(L('createSubmit'))}</span></button>
      <button class="icon-button" data-act="createCancel" title="${escapeHtml(L('createCancel'))}">${icon('close')}</button>
    </div>`;
  }

  createTypes() { return this.lookups.typesOf(this.project?.id).filter((x) => x.level !== 1); }

  renderFoot() {
    const size = this.prefs.pageSize;
    const from = this.total ? this.page * size + 1 : 0;
    const to = Math.min(this.total, (this.page + 1) * size);
    const pages = Math.max(1, Math.ceil(this.total / size));
    const loading = this.state === 'loading';
    this.el.foot.innerHTML = `<span class="bl-total">${loading ? `${icon('hourglass', 'icon tiny')}<span>${escapeHtml(L('loading'))}</span>` : `${icon('list', 'icon tiny')}<span>${escapeHtml(L('range', { from, to, total: this.total }))}</span>`}</span>
      ${this.rankable() || !this.live ? '' : `<span class="muted bl-rank-hint">${icon('info', 'icon tiny')}<span>${escapeHtml(L('rankOff'))}</span></span>`}
      <span class="grow"></span>
      <span class="pager">
        <button class="icon-button" data-act="page" data-value="-1" ${this.page <= 0 ? 'disabled' : ''} title="${escapeHtml(L('prevPage'))}">${icon('chevronLeft')}</button>
        <span>${escapeHtml(L('pageOf', { page: this.page + 1, pages }))}</span>
        <button class="icon-button" data-act="page" data-value="1" ${this.page + 1 >= pages ? 'disabled' : ''} title="${escapeHtml(L('nextPage'))}">${icon('chevronRight')}</button>
      </span>
      ${dropButtonHtml({ id: 'pageSize', iconHtml: icon('list'), label: L('perPage', { n: size }), tip: L('pageSizeTip'), cls: 'up' })}`;
  }

  // ───────────────────────── events

  bindEvents() {
    const root = this.root;
    root.addEventListener('click', (event) => this.onClick(event));
    root.addEventListener('input', (event) => {
      const input = event.target.closest('[data-input]');
      if (input?.dataset.input === 'text') { this.filters.text = input.value; clearTimeout(this.textTimer); this.textTimer = setTimeout(() => this.search(), 300); }
    });
    root.addEventListener('change', (event) => {
      const input = event.target.closest('[data-input]');
      if (input?.dataset.input === 'hideDone') { this.filters.hideDone = input.checked; this.search(); }
    });
    root.addEventListener('keydown', (event) => this.onKey(event));
    this.el.body.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.el.head.addEventListener('keydown', (event) => { if ((event.key === 'Enter' || event.key === ' ') && event.target.dataset.sort) { event.preventDefault(); this.sortBy(event.target.dataset.sort); } });
  }

  onClick(event) {
    if (this.dragJustEnded) { this.dragJustEnded = false; return; }
    const t = event.target;
    const drop = t.closest('[data-drop]');
    if (drop) return this.openDrop(drop);
    const act = t.closest('[data-act]');
    if (act && !act.disabled) return this.onAct(act.dataset.act, act.dataset.value, act, event);
    const sideItem = t.closest('[data-side]');
    if (sideItem) return this.onSide(sideItem.dataset.side, sideItem.dataset.value);
    const sort = t.closest('[data-sort]');
    if (sort) return this.sortBy(sort.dataset.sort);
    const row = t.closest('.bl-row');
    if (row) {
      if (t.closest('.bl-check')) { this.toggleSelect(row.dataset.id, event.shiftKey); return undefined; }
      return this.rowClick(row.dataset.id, event);
    }
    return undefined;
  }

  onAct(act, value, el, event) {
    switch (act) {
      case 'mode': return this.setMode(value);
      case 'run': return this.editor?.submit();
      case 'clear': this.filters = { projects: [this.project.key], types: [], statuses: [], assignees: [], priorities: [], labels: [], text: '', hideDone: false }; this.side = { epic: null, version: null }; this.renderSearch(); this.renderSide(); return this.search();
      case 'side': this.prefs.side = !this.prefs.side; this.savePrefs(); this.renderBar(); return this.renderSide();
      case 'unside': this.side[value] = null; this.renderChips(); this.renderSide(); return this.search();
      case 'export': return this.exportCsv();
      case 'create': return this.openCreate();
      case 'createSubmit': return this.submitCreate();
      case 'createCancel': this.creating = false; return this.renderCreate();
      case 'collapse': {
        const set = new Set(this.prefs.collapsed);
        if (set.has(value)) set.delete(value); else set.add(value);
        this.prefs.collapsed = [...set];
        this.savePrefs();
        return this.renderList();
      }
      case 'selectAll': {
        const all = this.items.length && this.items.every((i) => this.selected.has(i.id));
        this.selected = all ? new Set() : new Set(this.items.map((i) => i.id));
        this.renderList();
        return this.renderBulk();
      }
      case 'deselect': this.selected.clear(); this.renderList(); return this.renderBulk();
      case 'bulkDelete': return this.bulkDelete();
      case 'page': this.page = Math.max(0, this.page + Number(value)); return this.search({ keepPage: true });
      case 'retry': return this.load();
      default: return event;
    }
  }

  setMode(mode) {
    if (mode === this.mode) return undefined;
    if (mode === 'jql') {
      // The basic search goes over into the query text, so it can be refined.
      this.jqlText = withOrder(basicJql(this.filters), this.order);
    }
    this.mode = mode;
    this.renderBar();
    this.renderSearch();
    if (mode === 'jql') this.editor?.focus();
    return this.search();
  }

  onSide(kind, value) {
    if (kind === 'epic') this.side.epic = value === '*' ? null : value;
    else this.side.version = value === '*' ? null : value;
    this.renderSide();
    this.renderChips();
    return this.search();
  }

  sortBy(col) {
    const field = SORT_FIELD[col];
    if (!field) return undefined;
    const cur = this.effectiveOrder()[0];
    let order;
    if (cur?.field?.toLowerCase() === field.toLowerCase()) order = cur.dir === 'asc' ? [{ field, dir: 'desc' }] : [];
    else order = [{ field, dir: 'asc' }];
    if (this.mode === 'jql') {
      this.jqlText = withOrder(this.editor?.value ?? '', order);
      this.editor?.setValue(this.jqlText);
    }
    this.order = order;
    return this.search();
  }

  rowClick(id, event) {
    if (event.ctrlKey || event.metaKey) { this.toggleSelect(id); return; }
    if (event.shiftKey) { this.selectRange(id); return; }
    this.selected = new Set([id]);
    this.anchor = id;
    this.cursor = id;
    this.renderList();
    this.renderBulk();
    this.ctx.openIssue?.(id);
  }

  toggleSelect(id, shift = false) {
    if (shift && this.anchor) { this.selectRange(id); return; }
    if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
    this.anchor = id;
    this.cursor = id;
    this.renderList();
    this.renderBulk();
  }

  /** The rows in the order shown (collapsed groups left out). */
  visibleRows() {
    if (this.prefs.group === 'none') return this.items;
    return this.groups().filter((g) => !this.prefs.collapsed.includes(g.id)).flatMap((g) => g.rows);
  }

  selectRange(id) {
    const rows = this.visibleRows().map((r) => r.id);
    const a = rows.indexOf(this.anchor ?? id);
    const b = rows.indexOf(id);
    if (a < 0 || b < 0) { this.selected = new Set([id]); } else {
      for (const rid of rows.slice(Math.min(a, b), Math.max(a, b) + 1)) this.selected.add(rid);
    }
    this.cursor = id;
    this.renderList();
    this.renderBulk();
  }

  onKey(event) {
    const t = event.target;
    if (t.classList?.contains('bl-create-input')) {
      if (event.key === 'Enter') { event.preventDefault(); this.submitCreate(); }
      else if (event.key === 'Escape') { event.preventDefault(); this.creating = false; this.renderCreate(); this.el.list.focus(); }
      return;
    }
    if (!t.closest?.('.bl-list') || t.matches('input, textarea, button')) return;
    const rows = this.visibleRows();
    if (!rows.length) return;
    const at = Math.max(0, rows.findIndex((r) => r.id === this.cursor));
    const go = (i, extend) => {
      const next = rows[Math.max(0, Math.min(rows.length - 1, i))];
      this.cursor = next.id;
      if (extend) { this.selectRange(next.id); } else { this.renderList(); }
      this.el.body.querySelector(`.bl-row[data-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: 'nearest' });
    };
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const dir = event.key === 'ArrowDown' ? 1 : -1;
        if (event.altKey) { this.rankByKey(rows[at], dir); return; }
        go(this.cursor ? at + dir : 0, event.shiftKey);
        return;
      }
      case 'Home': event.preventDefault(); go(0, event.shiftKey); return;
      case 'End': event.preventDefault(); go(rows.length - 1, event.shiftKey); return;
      case ' ': event.preventDefault(); if (this.cursor) this.toggleSelect(this.cursor); return;
      case 'Enter': event.preventDefault(); if (this.cursor) this.ctx.openIssue?.(this.cursor); return;
      case 'Escape': if (this.selected.size) { event.preventDefault(); this.selected.clear(); this.renderList(); this.renderBulk(); } return;
      case 'Delete': if (this.selected.size) { event.preventDefault(); this.bulkDelete(); } return;
      case 'a': if (event.ctrlKey || event.metaKey) { event.preventDefault(); this.selected = new Set(rows.map((r) => r.id)); this.renderList(); this.renderBulk(); } return;
      default:
    }
  }

  // ───────────────────────── drop-downs

  openDrop(button) {
    const id = button.dataset.drop;
    const lk = this.lookups;
    const multi = (key, items) => openPicker(button, {
      items, multi: true, values: this.filters[key],
      onPick: (values) => { this.filters[key] = values; clearTimeout(this.filterTimer); this.filterTimer = setTimeout(() => this.search(), 150); },
      onClose: () => this.renderSearch(),
    });
    const projectIds = () => [...lk.projects.values()].filter((p) => this.filters.projects.includes(p.key)).map((p) => p.id);
    const inProjects = (list) => { const ids = projectIds(); return ids.length ? list.filter((x) => ids.includes(x.projectId)) : list; };
    const uniqueNames = (list) => { const seen = new Map(); for (const x of list) if (!seen.has(x.name)) seen.set(x.name, x); return [...seen.values()]; };
    switch (id) {
      case 'f:projects': return multi('projects', [...lk.projects.values()].filter((p) => !p.archived).map((p) => ({ value: p.key, label: p.name, detail: p.key, icon: renderIconRef(p.icon, { size: 16, fallback: `l:${String(p.key).slice(0, 2)}` }) })));
      case 'f:types': return multi('types', uniqueNames(inProjects([...lk.types.values()]).sort((a, b) => a.position - b.position)).map((x) => ({ value: x.name, label: x.name, icon: renderIconRef(x.icon, { size: 16, fallback: 'b:task' }) })));
      case 'f:statuses': return multi('statuses', uniqueNames(inProjects([...lk.statuses.values()]).sort((a, b) => a.position - b.position)).map((x) => ({ value: x.name, label: x.name, icon: `<span class="bl-cat-dot ${x.category}"></span>`, detail: L(`cat_${x.category}`) })));
      case 'f:assignees': return multi('assignees', [{ value: 'me', label: L('me'), icon: icon('user') }, { value: '', label: L('unassigned'), icon: icon('close') }, { separator: true }, ...lk.usersList().map((u) => ({ value: u.username, label: lk.userName(u.id), detail: u.username, icon: renderIconRef(u.avatar, { size: 18, fallback: `l:${initials(lk.userName(u.id))}` }) }))]);
      case 'f:priorities': return multi('priorities', lk.prioritiesList().map((p) => ({ value: p.name, label: p.name, icon: renderIconRef(p.icon, { size: 16 }) })));
      case 'f:labels': return multi('labels', this.labelsList.map((l) => ({ value: l, label: l, icon: icon('tag') })));
      case 'group': return openPicker(button, { items: Object.keys(GROUPS).map((g) => ({ value: g, label: L(`group_${g}`), icon: icon(GROUPS[g]) })), value: this.prefs.group, onPick: (g) => { this.prefs.group = g; this.savePrefs(); this.renderBar(); this.renderList(); } });
      case 'columns': return openPicker(button, {
        items: Object.keys(COLUMNS).map((c) => ({ value: c, label: L(`col_${c}`), icon: icon(COLUMNS[c].icon), disabled: COLUMNS[c].fixed })), multi: true, values: this.prefs.columns, title: L('columnsTip'),
        onPick: (values) => { this.prefs.columns = Object.keys(COLUMNS).filter((c) => values.includes(c) || COLUMNS[c].fixed); this.savePrefs(); this.renderList(); },
      });
      case 'pageSize': return openPicker(button, { items: PAGE_SIZES.map((n) => ({ value: String(n), label: L('perPage', { n }), icon: icon('list') })), value: String(this.prefs.pageSize), onPick: (n) => { this.prefs.pageSize = Number(n); this.savePrefs(); this.search(); } });
      case 'filters': return this.openFilters(button);
      case 'createType': return openPicker(button, { items: this.createTypes().map((x) => ({ value: x.id, label: x.name, icon: renderIconRef(x.icon, { size: 16, fallback: 'b:task' }) })), value: this.createType, onPick: (v) => { this.createType = v; const text = this.el.create.querySelector('.bl-create-input')?.value ?? ''; this.renderCreate(); const input = this.el.create.querySelector('.bl-create-input'); input.value = text; input.focus(); } });
      case 'b:transition': return this.pickTransition(button);
      case 'b:assign': return openPicker(button, { items: [{ value: '', label: L('unassigned'), icon: icon('close') }, ...lk.usersList().map((u) => ({ value: u.id, label: lk.userName(u.id), detail: u.username, icon: renderIconRef(u.avatar, { size: 18, fallback: `l:${initials(lk.userName(u.id))}` }) }))], onPick: (v) => this.bulkField('assigneeId', v || null) });
      case 'b:priority': return openPicker(button, { items: lk.prioritiesList().map((p) => ({ value: p.id, label: p.name, icon: renderIconRef(p.icon, { size: 16 }) })), onPick: (v) => this.bulkField('priorityId', v) });
      case 'b:labels': return openPicker(button, {
        items: [{ value: '+', label: L('labelAddNew'), icon: icon('plus'), action: true }, { separator: true }, ...this.labelsList.map((l) => ({ value: `+${l}`, label: L('labelAdd', { label: l }), icon: icon('tag') })), { separator: true }, ...this.selectedLabels().map((l) => ({ value: `-${l}`, label: L('labelRemove', { label: l }), icon: icon('close') }))],
        onPick: (v) => this.bulkLabel(v),
      });
      default: return undefined;
    }
  }

  // ───────────────────────── saved filters

  openFilters(button) {
    const mine = this.savedFilters.filter((f) => f.mine);
    const shared = this.savedFilters.filter((f) => !f.mine);
    const row = (f) => ({ value: `open:${f.id}`, label: f.name, detail: f.shared ? L('shared') : '', icon: icon(f.favourite ? 'star' : 'filter'), tip: f.jql });
    const sortFav = (list) => [...list].sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name));
    const f = this.filter;
    const items = [
      ...(mine.length ? [{ group: L('myFilters') }, ...sortFav(mine).map(row)] : []),
      ...(shared.length ? [{ group: L('sharedFilters') }, ...sortFav(shared).map(row)] : []),
      ...(this.savedFilters.length ? [{ separator: true }] : []),
      { value: 'saveAs', label: L('filterSaveAs'), icon: icon('saveAs') },
      ...(f?.mine ? [
        { value: 'save', label: L('filterSave', { name: f.name }), icon: icon('save') },
        { value: 'rename', label: L('filterRename'), icon: icon('edit') },
        { value: 'share', label: L(f.shared ? 'filterUnshare' : 'filterShare'), icon: icon(f.shared ? 'lock' : 'globe') },
        { value: 'star', label: L(f.favourite ? 'filterUnstar' : 'filterStar'), icon: icon('star') },
        { value: 'delete', label: L('filterDelete'), icon: icon('trash'), danger: true },
      ] : []),
      ...(f ? [{ value: 'close', label: L('filterClose'), icon: icon('close') }] : []),
    ];
    openPicker(button, { items, width: 260, onPick: (v) => this.filterAction(v) });
  }

  async filterAction(value) {
    const f = this.filter;
    try {
      if (value.startsWith('open:')) {
        const row = this.savedFilters.find((x) => x.id === value.slice(5));
        if (!row) return;
        this.filter = row;
        this.jqlText = row.jql;
        this.side = { epic: null, version: null };
        this.order = [];
        if (this.mode !== 'jql') { this.mode = 'jql'; this.renderSearch(); } else this.editor?.setValue(row.jql);
        this.renderBar();
        this.renderSide();
        await this.search();
        return;
      }
      if (value === 'close') { this.filter = null; this.renderBar(); return; }
      if (value === 'saveAs') {
        const out = await this.ctx.popups.open('prompt', { icon: 'saveAs', title: L('filterSaveAs'), label: L('filterName'), value: f?.name ?? L('filterDefaultName', { key: this.project.key }) });
        const name = out?.value?.trim();
        if (!name) return;
        const row = await this.api.post('/filters', { name, jql: this.currentJql() });
        this.filter = row;
        this.ctx.notify('success', L('filterSaved', { name }));
        this.recordFilterCreate(row);
      } else if (value === 'save' && f) {
        this.filter = await this.api.patch(`/filters/${encodeURIComponent(f.id)}`, { jql: this.currentJql(), rev: f.rev });
        this.ctx.notify('success', L('filterSaved', { name: f.name }));
      } else if (value === 'rename' && f) {
        const out = await this.ctx.popups.open('prompt', { icon: 'edit', title: L('filterRename'), label: L('filterName'), value: f.name });
        const name = out?.value?.trim();
        if (!name || name === f.name) return;
        this.filter = await this.api.patch(`/filters/${encodeURIComponent(f.id)}`, { name, rev: f.rev });
      } else if (value === 'share' && f) {
        this.filter = await this.api.patch(`/filters/${encodeURIComponent(f.id)}`, { shared: !f.shared, rev: f.rev });
      } else if (value === 'star' && f) {
        this.filter = await this.api.patch(`/filters/${encodeURIComponent(f.id)}`, { favourite: !f.favourite, rev: f.rev });
      } else if (value === 'delete' && f) {
        const choice = await this.ctx.app.ask({ icon: 'trash', title: L('filterDelete'), message: L('filterDeleteAsk', { name: f.name }), buttons: [{ id: 'cancel', label: L('cancel') }, { id: 'delete', label: L('delete'), icon: 'trash', danger: true, primary: true }] });
        if (choice !== 'delete') return;
        await this.api.del(`/filters/${encodeURIComponent(f.id)}`);
        this.filter = null;
        this.ctx.notify('success', L('filterDeleted', { name: f.name }));
      }
      await this.loadFilters();
      if (this.filter) this.filter = this.savedFilters.find((x) => x.id === this.filter.id) ?? this.filter;
      this.renderBar();
    } catch (error) {
      this.ctx.showError(E('filterFailed'), error);
    }
  }

  recordFilterCreate(row) {
    let current = row;
    this.ctx.history.record({
      label: L('opFilterSave', { name: row.name }),
      undo: async () => { await this.api.del(`/filters/${encodeURIComponent(current.id)}`); if (this.filter?.id === current.id) this.filter = null; await this.loadFilters(); this.renderBar(); },
      redo: async () => { current = await this.api.post('/filters', { name: row.name, jql: row.jql }); await this.loadFilters(); this.renderBar(); },
    });
  }

  // ───────────────────────── export

  async exportCsv() {
    const jql = this.currentJql();
    try {
      const response = await this.api.request('GET', '/export/csv', { query: { jql }, raw: true });
      const text = await response.text();
      const name = `${safeName(this.filter?.name ?? this.project.key)}-${today()}.csv`;
      const saved = await saveFile(name, text, { mime: 'text/csv', type: 'csv' });
      if (saved) this.ctx.notify('success', L('exported', { name: saved, n: Math.max(0, text.split(/\r?\n(?=(?:[^"]*"[^"]*")*[^"]*$)/).filter(Boolean).length - 1) }));
    } catch (error) {
      this.ctx.showError(E('exportFailed'), error);
    }
  }

  // ───────────────────────── create

  openCreate() {
    if (!this.live) return;
    this.creating = true;
    this.renderCreate();
    const input = this.el.create.querySelector('.bl-create-input');
    input?.scrollIntoView({ block: 'nearest' });
    input?.focus();
  }

  async submitCreate() {
    const input = this.el.create.querySelector('.bl-create-input');
    const summary = input?.value.trim();
    if (!summary) { input?.focus(); return null; }
    const body = { projectId: this.project.id, typeId: this.createType, summary };
    input.disabled = true;
    try {
      let created = await this.api.createIssue(body);
      this.ctx.notify('success', L('createdIssue', { key: created.key }));
      this.ctx.app?.logActivity?.({ kind: 'local', type: 'issue.created', text: L('createdIssue', { key: created.key }) });
      this.ctx.history.record({
        label: L('opCreate', { key: created.key }),
        undo: async () => { await this.api.deleteIssue(created.id); },
        redo: async () => { created = await this.api.createIssue(body); },
      });
      this.renderCreate();
      const next = this.el.create.querySelector('.bl-create-input');
      next.value = '';
      next.focus();
      await this.search({ keepPage: true, quiet: true });
      this.el.create.querySelector('.bl-create-input')?.focus();
      return created;
    } catch (error) {
      input.disabled = false;
      this.ctx.showError(E('createFailed'), error);
      return null;
    }
  }

  // ───────────────────────── rank (drag and keyboard)

  onPointerDown(event) {
    if (event.button !== 0) return;
    const row = event.target.closest('.bl-row');
    if (!row || event.target.closest('input, button, a')) return;
    if (!this.rankable()) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const id = row.dataset.id;
    let dragging = false;
    let target = null;
    const line = document.createElement('div');
    line.className = 'bl-drop-line';
    const move = (e) => {
      if (!dragging) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < 5) return;
        dragging = true;
        row.classList.add('dragging');
        this.root.classList.add('dragging');
        this.el.body.append(line);
      }
      e.preventDefault();
      target = this.dropTarget(e.clientX, e.clientY, id);
      if (!target) { line.hidden = true; return; }
      line.hidden = false;
      const bodyRect = this.el.body.getBoundingClientRect();
      line.style.top = `${Math.round(target.y - bodyRect.top + this.el.body.scrollTop)}px`;
      // Near the edges the list scrolls.
      const list = this.el.list.getBoundingClientRect();
      if (e.clientY < list.top + 30) this.el.list.scrollTop -= 12; else if (e.clientY > list.bottom - 30) this.el.list.scrollTop += 12;
    };
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      line.remove();
      row.classList.remove('dragging');
      this.root.classList.remove('dragging');
      if (!dragging) return;
      this.dragJustEnded = true;
      setTimeout(() => { this.dragJustEnded = false; }, 0);
      if (target) this.rankMove(id, target);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  }

  /** Where a dragged row would land: { groupId, afterId, beforeId, y } (neighbours inside that group). */
  dropTarget(x, y, dragId) {
    const groups = this.groups();
    for (const groupEl of this.el.body.querySelectorAll('.bl-group')) {
      const r = groupEl.getBoundingClientRect();
      if (y < r.top || y > r.bottom) continue;
      const g = groups.find((x2) => x2.id === groupEl.dataset.groupId);
      if (!g) return null;
      const rows = [...groupEl.querySelectorAll('.bl-row')].filter((el) => el.dataset.id !== dragId);
      let afterId = null;
      let beforeId = null;
      let lineY = (groupEl.querySelector('.bl-group-body') ?? groupEl).getBoundingClientRect().top;
      for (const el of rows) {
        const rr = el.getBoundingClientRect();
        if (y < rr.top + rr.height / 2) { beforeId = el.dataset.id; lineY = rr.top; break; }
        afterId = el.dataset.id;
        lineY = rr.bottom;
      }
      return { groupId: g.id, group: g, afterId, beforeId, y: lineY };
    }
    return null;
  }

  /** Moves one issue to between afterId and beforeId (and into the group's column / status). Undoable. */
  async rankMove(id, { group, afterId, beforeId }) {
    const item = this.items.find((r) => r.id === id);
    if (!item) return;
    const flat = this.items.map((r) => r.id);
    const at = flat.indexOf(id);
    const oldAbove = flat[at - 1] ?? null;
    const oldBelow = flat[at + 1] ?? null;
    if ((afterId ?? null) === oldAbove && (beforeId ?? null) === oldBelow && (!group || this.inGroup(item, group))) return;
    const body = { afterId, beforeId };
    if (group && !this.inGroup(item, group)) {
      if (group.columnId && this.board) { body.boardId = this.board.id; body.columnId = group.columnId; }
      else if (group.statusId) body.statusId = group.statusId;
      else if (this.prefs.group === 'epic') body.epicChange = group.id || null;
      else if (this.prefs.group === 'assignee') body.assigneeChange = group.id || null;
    }
    const oldStatus = item.statusId;
    const oldEpic = item.epicId ?? null;
    const oldAssignee = item.assigneeId ?? null;
    const doMove = async (b) => {
      const { epicChange, assigneeChange, ...rest } = b;
      if (epicChange !== undefined) await this.api.updateIssue(id, { epicId: epicChange });
      if (assigneeChange !== undefined) await this.api.updateIssue(id, { assigneeId: assigneeChange });
      return this.api.move(id, rest);
    };
    try {
      const out = await doMove(body);
      for (const w of out?.warnings ?? []) if (w.code === 'WIP_LIMIT') this.ctx.notify('warning', L('wipWarning', { max: w.max, count: w.count }));
      const back = { afterId: oldAbove, beforeId: oldBelow };
      if (body.columnId || body.statusId) back.statusId = oldStatus;
      if (body.epicChange !== undefined) back.epicChange = oldEpic;
      if (body.assigneeChange !== undefined) back.assigneeChange = oldAssignee;
      this.ctx.history.record({ label: L('opRank', { key: item.key }), undo: () => doMove(back), redo: () => doMove(body) });
      this.ctx.app?.logActivity?.({ kind: 'local', type: 'issue.moved', text: L('opRank', { key: item.key }) });
      this.cursor = id;
    } catch (error) {
      this.ctx.showError(E('rankFailed'), error);
    }
    await this.search({ keepPage: true, quiet: true });
  }

  inGroup(item, group) {
    if (group.statusIds) return group.statusIds.includes(item.statusId);
    if (group.statusId) return group.statusId === item.statusId;
    if (group.other) return true;
    if (this.prefs.group === 'epic') return (item.epicId ?? '') === group.id;
    if (this.prefs.group === 'assignee') return (item.assigneeId ?? '') === group.id;
    return true;
  }

  rankByKey(row, dir) {
    if (!row) return;
    if (!this.rankable()) { this.ctx.notify('info', L('rankOff')); return; }
    const group = this.groups().find((g) => g.rows.includes(row));
    const rows = group?.rows ?? this.items;
    const i = rows.indexOf(row);
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const target = dir < 0 ? { afterId: rows[j - 1]?.id ?? null, beforeId: rows[j].id } : { afterId: rows[j].id, beforeId: rows[j + 1]?.id ?? null };
    this.rankMove(row.id, { group, ...target }).then(() => this.el.list.focus());
  }

  // ───────────────────────── bulk changes

  selectedRows() { return this.items.filter((r) => this.selected.has(r.id)); }
  selectedLabels() { return [...new Set(this.selectedRows().flatMap((r) => r.labels ?? []))].sort(); }

  bulkReport(out, label) {
    const ok = out?.ok?.length ?? 0;
    const failed = out?.failed ?? [];
    if (failed.length) {
      const keys = failed.map((f) => this.items.find((r) => r.id === f.id)?.key ?? f.id);
      this.ctx.notify('warning', L('bulkPartial', { ok, failed: failed.length, keys: keys.slice(0, 5).join(', '), reason: failed[0]?.error?.message ?? '' }));
    } else this.ctx.notify('success', L('bulkDone', { n: ok, label }));
    this.ctx.app?.logActivity?.({ kind: 'local', type: 'issue.bulk', text: `${label} · ${ok}` });
  }

  pickTransition(button) {
    const rows = this.selectedRows();
    const projectIds = [...new Set(rows.map((r) => r.projectId))];
    const names = new Map();
    for (const pid of projectIds) for (const s of this.lookups.statusesOf(pid)) if (!names.has(s.name)) names.set(s.name, s);
    openPicker(button, {
      items: [...names.values()].map((s) => ({ value: s.name, label: s.name, icon: `<span class="bl-cat-dot ${s.category}"></span>`, detail: L(`cat_${s.category}`) })),
      onPick: (name) => this.bulkTransition(name),
    });
  }

  /** Every selected issue → the status of that name in its project. Undo puts each one back. */
  async bulkTransition(name) {
    const rows = this.selectedRows();
    const byStatus = new Map();
    for (const r of rows) {
      const s = this.lookups.statusesOf(r.projectId).find((x) => x.name === name);
      if (!s || s.id === r.statusId) continue;
      if (!byStatus.has(s.id)) byStatus.set(s.id, []);
      byStatus.get(s.id).push(r);
    }
    if (!byStatus.size) { this.ctx.notify('info', L('bulkNothing')); return; }
    const before = rows.map((r) => [r.id, r.statusId]);
    const apply = async (groups) => {
      const all = { ok: [], failed: [] };
      for (const [statusId, ids] of groups) {
        const out = await this.api.bulk({ ids, transition: { statusId } });
        all.ok.push(...(out?.ok ?? []));
        all.failed.push(...(out?.failed ?? []));
      }
      return all;
    };
    const forward = [...byStatus].map(([statusId, list]) => [statusId, list.map((r) => r.id)]);
    try {
      const out = await apply(forward);
      const moved = new Set(out.ok);
      const back = new Map();
      for (const [id, statusId] of before) if (moved.has(id)) { if (!back.has(statusId)) back.set(statusId, []); back.get(statusId).push(id); }
      const label = L('opTransition', { n: moved.size, status: name });
      this.bulkReport(out, label);
      if (moved.size) this.ctx.history.record({ label, undo: () => apply([...back]), redo: () => apply(forward.map(([s, ids]) => [s, ids.filter((id) => moved.has(id))])) });
    } catch (error) {
      this.ctx.showError(E('bulkFailed'), error);
    }
    await this.search({ keepPage: true, quiet: true });
  }

  /** One field (assigneeId, priorityId) on every selected issue; undo restores each one's own value. */
  async bulkField(field, value) {
    const rows = this.selectedRows().filter((r) => (r[field] ?? null) !== (value ?? null));
    if (!rows.length) { this.ctx.notify('info', L('bulkNothing')); return; }
    const ids = rows.map((r) => r.id);
    const before = new Map();
    for (const r of rows) { const k = r[field] ?? ''; if (!before.has(k)) before.set(k, []); before.get(k).push(r.id); }
    const label = field === 'assigneeId'
      ? L('opAssign', { n: ids.length, name: value ? this.lookups.userName(value) : L('unassigned') })
      : L('opPriority', { n: ids.length, name: this.lookups.priorities.get(value)?.name ?? '' });
    try {
      const out = await this.api.bulk({ ids, patch: { [field]: value } });
      this.bulkReport(out, label);
      const done = new Set(out?.ok ?? []);
      if (done.size) {
        this.ctx.history.record({
          label,
          undo: async () => { for (const [k, list] of before) { const these = list.filter((id) => done.has(id)); if (these.length) await this.api.bulk({ ids: these, patch: { [field]: k || null } }); } },
          redo: () => this.api.bulk({ ids: [...done], patch: { [field]: value } }),
        });
      }
    } catch (error) {
      this.ctx.showError(E('bulkFailed'), error);
    }
    await this.search({ keepPage: true, quiet: true });
  }

  /** '+label' adds, '-label' removes, '+' asks for a new label. Each issue keeps its other labels. */
  async bulkLabel(value) {
    let label = value.slice(1);
    const add = value.startsWith('+');
    if (value === '+') {
      const out = await this.ctx.popups.open('prompt', { icon: 'tag', title: L('labelAddNew'), label: L('labelName'), value: '' });
      label = out?.value?.trim().replace(/\s+/g, '-');
      if (!label) return;
    }
    const rows = this.selectedRows();
    const changes = rows.map((r) => {
      const cur = r.labels ?? [];
      const next = add ? [...new Set([...cur, label])] : cur.filter((l) => l !== label);
      return { id: r.id, before: cur, after: next };
    }).filter((c) => c.before.join(' ') !== c.after.join(' '));
    if (!changes.length) { this.ctx.notify('info', L('bulkNothing')); return; }
    const opLabel = L(add ? 'opLabelAdd' : 'opLabelRemove', { n: changes.length, label });
    const apply = async (pick) => {
      const out = { ok: [], failed: [] };
      for (const c of changes) {
        try { await this.api.updateIssue(c.id, { labels: c[pick] }); out.ok.push(c.id); } catch (error) { out.failed.push({ id: c.id, error: { message: error.message } }); }
      }
      return out;
    };
    try {
      const out = await apply('after');
      this.bulkReport(out, opLabel);
      this.ctx.history.record({ label: opLabel, undo: () => apply('before'), redo: () => apply('after') });
      if (add && !this.labelsList.includes(label)) this.labelsList = [...this.labelsList, label].sort();
    } catch (error) {
      this.ctx.showError(E('bulkFailed'), error);
    }
    await this.search({ keepPage: true, quiet: true });
  }

  async bulkDelete() {
    const rows = this.selectedRows();
    if (!rows.length) return;
    const choice = await this.ctx.app.ask({
      icon: 'trash', title: L('bDelete'), message: L('bDeleteAsk', { n: rows.length }), items: rows.map((r) => `${r.key} ${r.summary}`),
      buttons: [{ id: 'cancel', label: L('cancel') }, { id: 'delete', label: L('delete'), icon: 'trash', danger: true, primary: true }],
    });
    if (choice !== 'delete') return;
    try {
      const out = await this.api.bulk({ ids: rows.map((r) => r.id), delete: true });
      this.bulkReport(out, L('opDelete', { n: out?.ok?.length ?? 0 }));
      this.selected.clear();
    } catch (error) {
      this.ctx.showError(E('bulkFailed'), error);
    }
    await this.search({ keepPage: true, quiet: true });
  }

  // ───────────────────────── live events and commands

  /** ctx: { event } (a change by someone else), { reload } (refresh, undo), { settingsChanged } (language, theme). */
  update(ctx) {
    this.ctx = { ...this.ctx, ...ctx };
    if (ctx.settingsChanged) { closePicker(); this.renderAll(); return; }
    if (ctx.reload) { this.search({ keepPage: true, quiet: true }); return; }
    const event = ctx.event;
    if (!event || !this.live) return;
    const type = String(event.type ?? '');
    if (!type.startsWith('issue.')) {
      if (/^(version|status|issueType)\./.test(type)) { this.lookups.loadedProjects.delete(this.project.id); this.lookups.project(this.project.id).then(() => this.renderAll()); }
      if (/^filter\./.test(type)) this.loadFilters().then(() => this.renderBar());
      return;
    }
    const at = this.items.findIndex((r) => r.id === event.id);
    if ((type === 'issue.updated' || type === 'issue.transitioned') && at >= 0 && event.data) {
      const prev = this.items[at];
      const next = { ...prev };
      for (const k of Object.keys(prev)) if (k in event.data) next[k] = event.data[k];
      this.items[at] = next;
      this.renderList();
      this.flash(event.id);
      // A changed field the query looks at may take the row out: checked quietly.
      clearTimeout(this.liveTimer);
      this.liveTimer = setTimeout(() => this.search({ keepPage: true, quiet: true }), 800);
      return;
    }
    clearTimeout(this.liveTimer);
    this.liveTimer = setTimeout(() => this.search({ keepPage: true, quiet: true }).then(() => this.flash(event.id)), 250);
  }

  flash(id) {
    const row = this.el.body.querySelector(`.bl-row[data-id="${CSS.escape(String(id))}"]`);
    if (!row) return;
    row.classList.remove('flash');
    void row.offsetWidth;
    row.classList.add('flash');
  }

  focusSearch() {
    if (this.mode === 'jql') { this.editor?.focus(); return; }
    const input = this.el.search.querySelector('[data-input="text"]');
    input?.focus();
    input?.select();
  }
}
