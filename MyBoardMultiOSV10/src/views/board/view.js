// The board view: columns × swimlanes of issue cards from GET /boards/:id/data (ARCHITECTURE.md §5),
// drag and drop (POST /issues/:id/move, optimistic with rollback), keyboard, multi-select with bulk
// changes (POST /issues/bulk), quick filters and search, swimlanes, Undo/Redo through ctx.history,
// realtime events (§6) and presence, context menus, and the create-issue form.
import { icon } from '../../icons.js';
import { getLanguage } from '../../i18n.js';
import { renderIconRef } from '../../ui/iconref.js';
import { between } from '../../../core/rank.js';
import { avatarHtml, avatarStackHtml, cardHtml, createLookups, escapeHtml, errorMessage, isConflict, issueToCard, openRefList, refButtonHtml, closeRefList } from '../shared/index.js';
import { buildLayout, byRank, dropNeighbours, GROUP_ICONS, groupChoices, groupMode, LANE_FIELDS, laneOf, laneValue, loadPrefs, neighbours, savePrefs } from './model.js';
import { CardDrag } from './dnd.js';
import { demoBoardData } from './demo.js';
import { openBoardMenu, openCardMenu } from './menu.js';
import { openCreateForm, openEditForm } from './create.js';
import { canAddColumn, openAddColumn } from './addcolumn.js';
import { ColumnDrag, changeColumnIcon, columnKey, editColumn, openColumnMenu } from './columns.js';

const CHUNK = 40;
const CHUNK_LANES = 20;
const glyphCache = new Map();
const glyph = (name) => { let html = glyphCache.get(name); if (!html) { html = icon(name); glyphCache.set(name, html); } return html; };

/** A rank key between two (either may be null); never throws (a stale order gets a key after `a`). */
function rankBetween(a, b) {
  try { return between(a || null, b || null); } catch { try { return between(a || null, null); } catch { return `${a || ''}1`; } }
}

export class BoardView {
  constructor(host, ctx) {
    this.host = host;
    this.ctx = ctx;
    this.board = ctx.workspace?.board ?? null;
    this.boardId = this.board?.id ?? null;
    this.demo = Boolean(ctx.workspace?.demo) || !this.boardId;
    this.prefs = loadPrefs(this.boardId ?? 'demo');
    if (this.demo) this.prefs.search = '';
    this.data = null;
    this.status = 'loading';
    this.error = null;
    this.selection = new Set();
    this.focusId = null;
    this.anchorId = null;
    this.limits = new Map();
    this.seq = 0;
    this.presence = [];
    this.pendingRender = false;
    this.pendingRefetch = false;
    this.refetchTimer = 0;
    this.flash = new Map();
    this.allowed = null;
    this.mount();
  }

  get t() { return this.ctx.t; }
  get api() { return this.ctx.api; }
  get lang() { return getLanguage(); }
  get me() { return this.ctx.app?.state?.core?.info?.user?.id ?? null; }
  get settings() { return this.data?.board?.settings ?? {}; }
  get mode() { return groupMode(this.prefs, this.settings); }
  card(id) { return this.cards?.get(id) ?? null; }

  // ───────────────────────── skeleton

  mount() {
    const t = this.t;
    this.host.innerHTML = `<div class="bv" data-board="${escapeHtml(this.boardId ?? 'demo')}">
      <div class="bv-bar" role="toolbar" aria-label="${escapeHtml(t('board.quickFilters'))}">
        <label class="search-box bv-search" title="${escapeHtml(t('board.searchTip'))}">${glyph('search')}<input type="search" data-bv-search placeholder="${escapeHtml(t('board.search'))}" aria-label="${escapeHtml(t('board.search'))}" value="${escapeHtml(this.prefs.search)}" /></label>
        <div class="bv-filters"></div>
        <div class="bv-tools"></div>
      </div>
      <div class="bv-bulk" hidden></div>
      <div class="bv-scroll"><div class="bv-board" role="grid"></div></div>
      <div class="bv-state" hidden></div>
    </div>`;
    this.root = this.host.querySelector('.bv');
    this.scroller = this.root.querySelector('.bv-scroll');
    this.boardEl = this.root.querySelector('.bv-board');
    this.searchInput = this.root.querySelector('[data-bv-search]');
    this.observer = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) this.showMore(e.target.closest('[data-cell]')?.dataset.cell); }, { root: this.scroller, rootMargin: '400px' });
    this.drag = new CardDrag(this.boardEl, this.scroller, {
      ids: (el) => (this.selection.has(el.dataset.id) && this.selection.size > 1 ? this.orderedSelection() : [el.dataset.id]),
      canDrop: (cell) => this.canDrop(cell),
      onStart: (ids) => this.dragStarted(ids),
      onDrop: (drop) => this.dropped(drop),
      onRefused: () => this.ctx.notify('warning', this.t('board.dropNotAllowed')),
      onCancel: () => this.dragEnded(),
    });
    this.boardEl.setAttribute('aria-label', t('board.keyboardHelp'));
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.colDrag = new ColumnDrag(this);
    this.root.addEventListener('dblclick', (e) => {
      const el = e.target.closest('.mb-card');
      // a card: the edit form (the detail panel opens on the single click already)
      if (el) { openEditForm(this, el.dataset.id); return; }
      // a column header: its icon → the icon picker, elsewhere → name + icon (columns.js)
      const head = e.target.closest('.bv-heads .bv-col-head[data-col]');
      if (head && !e.target.closest('button') && !this.demo) { if (e.target.closest('.bv-col-icon')) changeColumnIcon(this, head.dataset.col); else editColumn(this, head.dataset.col); }
    });
    this.root.addEventListener('keydown', (e) => this.onKey(e));
    this.root.addEventListener('contextmenu', (e) => this.onContextMenu(e));
    this.root.addEventListener('focusin', (e) => { const el = e.target.closest?.('.mb-card'); if (el) this.setFocus(el.dataset.id, { scroll: false, focus: false }); });
    this.searchInput.addEventListener('input', () => {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => { this.prefs.search = this.searchInput.value; this.savePrefs(); this.load({ quiet: true }); }, 250);
    });
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.searchInput.value) { e.preventDefault(); e.stopPropagation(); this.searchInput.value = ''; this.prefs.search = ''; this.savePrefs(); this.load({ quiet: true }); }
      if (e.key === 'ArrowDown') { e.preventDefault(); this.focusFirst(); }
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(this.searchTimer); this.prefs.search = this.searchInput.value; this.savePrefs(); this.load({ quiet: true }); }
    });
    this.bindLive();
    // This window's own changes made elsewhere (the detail panel, the backlog): the live channel drops events of
    // this window, so other views tell the board with a DOM event shaped like a live event (§6):
    //   window.dispatchEvent(new CustomEvent('myboard:event', { detail: { type: 'issue.updated', id, rev, data: issue } }))
    this.onLocalEvent = (e) => { if (e.detail?.type) this.onLiveEvent(e.detail, { local: true }); };
    window.addEventListener('myboard:event', this.onLocalEvent);
    this.renderState();
    this.load();
    window.__myboardBoard = this;
  }

  unmount() {
    clearTimeout(this.refetchTimer);
    clearTimeout(this.searchTimer);
    this.offPresence?.();
    window.removeEventListener('myboard:event', this.onLocalEvent);
    this.observer?.disconnect();
    this.drag?.destroy();
    this.colDrag?.destroy();
    closeRefList({ focus: false });
    if (window.__myboardBoard === this) window.__myboardBoard = null;
    this.host.innerHTML = '';
  }

  bindLive() {
    this.offPresence?.();
    this.liveRef = this.ctx.live;
    const topic = `board:${this.boardId}`;
    if (!this.demo && this.ctx.live?.on) {
      this.offPresence = this.ctx.live.on('presence', ({ topic: tp, users }) => { if (tp === topic) { this.presence = users ?? []; this.renderTools(); } });
    }
    this.presence = this.ctx.app?.state?.live?.presence ?? [];
  }

  savePrefs() { if (this.boardId) savePrefs(this.boardId, this.prefs); }

  // ───────────────────────── data

  /** Reads the board data (quiet: no loading screen, the board stays while it reads). */
  async load({ quiet = false } = {}) {
    clearTimeout(this.refetchTimer);
    if (this.demo) {
      this.demoData ??= demoBoardData({ lang: this.lang, template: this.ctx.workspace?.project?.template ?? 'kanban', key: this.ctx.workspace?.project?.key ?? 'KAN' });
      const q = this.prefs.search.trim().toLowerCase();
      const issues = q ? this.demoData.issues.filter((c) => `${c.key} ${c.summary}`.toLowerCase().includes(q)) : this.demoData.issues;
      this.apply({ ...this.demoData, issues });
      return;
    }
    const seq = ++this.seq;
    if (!quiet && !this.data) { this.status = 'loading'; this.renderState(); }
    this.root.classList.add('bv-reading');
    try {
      const data = await this.api.boardData(this.boardId, {
        quick: this.prefs.quick.join(',') || undefined,
        search: this.prefs.search.trim() || undefined,
        includeAllDone: this.prefs.showAllDone ? 1 : undefined,
      });
      if (seq !== this.seq || !this.root.isConnected) return;
      this.apply(data);
    } catch (error) {
      if (seq !== this.seq || !this.root.isConnected) return;
      if (!this.data) { this.status = 'error'; this.error = error; this.renderState(); } else this.ctx.notify('error', `${this.t('board.error')}: ${errorMessage(error, this.t)}`);
    } finally {
      if (seq === this.seq) this.root.classList.remove('bv-reading');
    }
  }

  apply(data) {
    this.data = data;
    this.status = 'ready';
    this.error = null;
    this.L = createLookups(data);
    this.cards = new Map([...(data.issues ?? []), ...(data.backlog ?? [])].map((c) => [c.id, c]));
    const quickIds = new Set((data.quickFilters ?? []).map((q) => q.id));
    const kept = this.prefs.quick.filter((id) => quickIds.has(id));
    if (kept.length !== this.prefs.quick.length) { this.prefs.quick = kept; this.savePrefs(); }
    for (const id of [...this.selection]) if (!this.cards.has(id)) this.selection.delete(id);
    this.renderState();
    this.renderFilters();
    this.renderTools();
    this.render();
  }

  /** Reads again soon (several events → one read); waits while a card is dragged. */
  scheduleRefetch(delay = 500) {
    if (this.demo) return;
    clearTimeout(this.refetchTimer);
    if (this.drag.active) { this.pendingRefetch = true; return; }
    this.refetchTimer = setTimeout(() => this.load({ quiet: true }), delay);
  }

  /** Cards in their render order (the rank). */
  allCards() { return [...(this.data?.issues ?? []), ...(this.data?.backlog ?? [])]; }

  /** Puts a changed card into the data (issues or backlog by its column). */
  putCard(card) {
    const data = this.data;
    if (this.settings.cardColors && this.settings.cardColors !== 'queries' && this.L) card.cardColor = this.cardColorOf(card, card);
    data.issues = data.issues.filter((c) => c.id !== card.id);
    data.backlog = (data.backlog ?? []).filter((c) => c.id !== card.id);
    if (!card.columnId) { this.cards.delete(card.id); return; }
    const column = this.L.column(card.columnId);
    (column?.backlog ? data.backlog : data.issues).push(card);
    this.cards.set(card.id, card);
  }

  removeCard(id) {
    const data = this.data;
    data.issues = data.issues.filter((c) => c.id !== id);
    data.backlog = (data.backlog ?? []).filter((c) => c.id !== id);
    this.cards.delete(id);
    this.selection.delete(id);
  }

  // ───────────────────────── drawing

  renderState() {
    const el = this.root.querySelector('.bv-state');
    const t = this.t;
    if (this.status === 'loading') {
      el.hidden = false;
      el.innerHTML = `<div class="bv-state-box">${glyph('hourglass')}<p>${escapeHtml(t('board.loading'))}</p></div>`;
    } else if (this.status === 'error') {
      el.hidden = false;
      el.innerHTML = `<div class="bv-state-box error">${glyph('error')}<p><b>${escapeHtml(t('board.error'))}</b></p><p class="muted">${escapeHtml(errorMessage(this.error, t))}</p><button class="button primary" data-bv-retry>${glyph('refresh')}<span>${escapeHtml(t('board.retry'))}</span></button></div>`;
    } else {
      el.hidden = true;
      el.innerHTML = '';
    }
  }

  renderFilters() {
    this.onSideChange?.();   // the left panel's sidebar shows the same filters (sidebar.js)
    const t = this.t;
    const el = this.root.querySelector('.bv-filters');
    const chip = (attrs, pressed, iconHtml, label, tip) => `<button class="bv-chip" ${attrs} aria-pressed="${pressed}" title="${escapeHtml(tip ?? label)}">${iconHtml}<span>${escapeHtml(label)}</span></button>`;
    const quick = (this.data?.quickFilters ?? []).map((q) => chip(`data-quick="${escapeHtml(q.id)}"`, this.prefs.quick.includes(q.id), q.icon ? renderIconRef(q.icon, { size: 15 }) : glyph('filter'), q.name, q.jql ? `${q.name} — ${q.jql}` : q.name)).join('');
    const builtins = this.demo ? '' : chip('data-builtin="mine"', this.prefs.mine, glyph('user'), t('board.onlyMine'), t('board.onlyMineTip')) + chip('data-builtin="recent"', this.prefs.recent, glyph('clock'), t('board.recent'), t('board.recentTip'));
    const any = this.prefs.quick.length || this.prefs.mine || this.prefs.recent || this.prefs.search.trim();
    el.innerHTML = `${builtins}${quick}${any ? `<button class="small-button bv-clear" data-clear-filters title="${escapeHtml(t('board.clearFilters'))}">${glyph('filterClear')}<span>${escapeHtml(t('board.clearFilters'))}</span></button>` : ''}`;
  }


  groupItems() {
    const t = this.t;
    return groupChoices(this.settings).map((mode) => ({ value: mode, label: t(`board.group.${mode}`), glyph: GROUP_ICONS[mode], hint: mode === this.settings.swimlanes ? t('board.group.boardDefault') : '' }));
  }

  renderTools() {
    if (!this.data) return;
    const t = this.t;
    const el = this.root.querySelector('.bv-tools');
    const layout = this.layout;
    const mode = this.mode;
    const lanes = layout?.lanes.length ?? 0;
    const allCollapsed = layout && lanes > 1 && layout.lanes.every((l) => l.collapsed);
    const hasBacklog = (this.data.columns ?? []).some((c) => c.backlog);
    const hidesDone = this.settings.doneHideDays != null && (this.data.columns ?? []).some((c) => c.done);
    const others = this.presence.filter((p) => p.clientId !== this.api?.clientId);
    const presence = others.length ? `<span class="bv-presence" title="${escapeHtml(`${t('board.presence')}: ${others.map((p) => p.name).join(', ')}`)}">${avatarStackHtml(others.map((p) => ({ id: p.userId, displayName: p.name, avatar: p.avatar })), { size: 22, max: 4, t })}</span>` : '';
    const count = layout ? (layout.shown === layout.total ? t('board.issues', { n: layout.total }) : t('board.issuesFiltered', { n: layout.shown, total: layout.total })) : '';
    el.innerHTML = `
      <span class="bv-tool-label" title="${escapeHtml(t('board.groupByTip'))}">${glyph('group')}<span>${escapeHtml(t('board.groupBy'))}</span></span>
      ${refButtonHtml({ id: 'groupBy', items: this.groupItems(), value: mode, icon, title: t('board.groupByTip'), extraClass: 'bv-group' })}
      ${lanes > 1 ? `<button class="small-button" data-lanes="${allCollapsed ? 'expand' : 'collapse'}" title="${escapeHtml(t(allCollapsed ? 'board.lanes.expandAll' : 'board.lanes.collapseAll'))}">${glyph(allCollapsed ? 'chevronDown' : 'chevronUp')}<span>${escapeHtml(t(allCollapsed ? 'board.lanes.expandAll' : 'board.lanes.collapseAll'))}</span></button>` : ''}
      ${hasBacklog ? `<button class="bv-chip" data-toggle-backlog aria-pressed="${this.prefs.showBacklog}" title="${escapeHtml(t('board.showBacklogTip'))}">${glyph('list')}<span>${escapeHtml(t('board.showBacklog'))}</span></button>` : ''}
      ${hidesDone && !this.demo ? `<button class="bv-chip" data-toggle-done aria-pressed="${this.prefs.showAllDone}" title="${escapeHtml(t('board.showAllDoneTip', { days: this.settings.doneHideDays }))}">${glyph('check')}<span>${escapeHtml(t('board.showAllDone'))}</span></button>` : ''}
      ${canAddColumn(this) ? `<button class="small-button bv-add-column" data-col-new title="${escapeHtml(t('board.addColumn.tip'))}">${glyph('columns')}<span>${escapeHtml(t('board.addColumn.button'))}</span></button>` : ''}
      <span class="bv-count muted">${escapeHtml(count)}</span>
      ${presence}`;
  }

  renderBulk() {
    const el = this.root.querySelector('.bv-bulk');
    const n = this.selection.size;
    if (n < 2) { el.hidden = true; el.innerHTML = ''; return; }
    const t = this.t;
    el.hidden = false;
    el.innerHTML = `<span class="bv-bulk-count">${glyph('selectAll')}<b>${escapeHtml(t('board.selected', { n }))}</b></span>
      <button class="small-button" data-bulk="move" title="${escapeHtml(t('board.menu.moveTo'))}">${glyph('columns')}<span>${escapeHtml(t('board.menu.moveTo'))}</span>${glyph('chevronDown')}</button>
      ${this.demo ? '' : `<button class="small-button" data-bulk="assignMe" title="${escapeHtml(t('board.menu.assignMe'))}">${glyph('user')}<span>${escapeHtml(t('board.menu.assignMe'))}</span></button>`}
      <button class="small-button" data-bulk="menu" title="${escapeHtml(t('board.menu.titleMany', { n }))}">${glyph('menu')}<span>${escapeHtml(t('board.menu.titleMany', { n }))}</span></button>
      <span class="grow"></span>
      <button class="small-button" data-bulk="clear" title="${escapeHtml(t('board.clearSelection'))}">${glyph('deselect')}<span>${escapeHtml(t('board.clearSelection'))}</span></button>`;
  }

  /** The whole board (columns, lanes, cards); keeps the scroll position and the focused card. */
  render() {
    this.onSideChange?.();
    if (!this.data) return;
    if (this.drag?.active || this.colDrag?.active) { this.pendingRender = true; return; }
    this.pendingRender = false;
    const t = this.t;
    const layout = buildLayout(this.data, this.L, { prefs: this.prefs, me: this.me, t });
    this.layout = layout;
    const { scrollLeft, scrollTop } = this.scroller;
    const hadFocus = this.root.contains(this.root.ownerDocument.activeElement) && this.root.ownerDocument.activeElement?.classList.contains('mb-card');
    this.observer.disconnect();
    if (!layout.columns.length) {
      this.boardEl.innerHTML = `<div class="bv-empty">${glyph('columns')}<p>${escapeHtml(t('board.noColumns'))}</p></div>`;
      this.renderTools();
      return;
    }
    // "Add column" is in the toolbar (renderTools), next to "show older done".
    const template = layout.columns.map((c) => (c.collapsed ? '42px' : 'minmax(244px, 1fr)')).join(' ');
    this.boardEl.style.setProperty('--bv-cols', template);
    this.boardEl.style.minWidth = `${layout.columns.reduce((w, c) => w + (c.collapsed ? 42 : 244) + 10, 14)}px`;
    const heads = `<div class="bv-heads bv-row" role="row">${layout.columns.map((c) => this.columnHeadHtml(c)).join('')}</div>`;
    const single = layout.mode === 'none';
    const chunk = layout.lanes.length > 1 ? CHUNK_LANES : CHUNK;
    const lanes = layout.lanes.map((lane) => {
      const cells = layout.columns.map((col) => this.cellHtml(lane, col, chunk)).join('');
      if (single) return `<div class="bv-lane single" data-lane="${escapeHtml(lane.id)}"><div class="bv-row bv-cells" role="row">${cells}</div></div>`;
      return `<section class="bv-lane ${lane.collapsed ? 'collapsed' : ''} ${lane.empty ? 'empty-lane' : ''}" data-lane="${escapeHtml(lane.id)}">
        <div class="bv-lane-head"><button class="bv-lane-toggle" data-lane-toggle="${escapeHtml(lane.id)}" aria-expanded="${!lane.collapsed}" title="${escapeHtml(t('board.lane.toggle'))}">${glyph(lane.collapsed ? 'chevronRight' : 'chevronDown')}${this.laneIconHtml(lane)}<span class="bv-lane-name">${escapeHtml(lane.name ?? '')}</span><span class="bv-lane-count">${escapeHtml(t('board.lane.count', { n: lane.count }))}</span></button></div>
        ${lane.collapsed ? '' : `<div class="bv-row bv-cells" role="row">${cells}</div>`}
      </section>`;
    }).join('');
    const emptyNote = layout.total === 0 && !this.filtersActive()
      ? `<div class="bv-empty-note">${glyph('info')}<span><b>${escapeHtml(t('board.empty'))}</b> ${escapeHtml(t('board.emptyHint'))}</span>${this.demo ? '' : `<button class="small-button" data-bv-create>${glyph('plus')}<span>${escapeHtml(t('action.createIssue'))}</span></button>`}</div>`
      : layout.shown === 0 ? `<div class="bv-empty-note">${glyph('filter')}<span>${escapeHtml(t('board.emptyFiltered'))}</span><button class="small-button" data-clear-filters>${glyph('filterClear')}<span>${escapeHtml(t('board.clearFilters'))}</span></button></div>` : '';
    const demoNote = this.demo ? `<div class="bv-demo-note muted">${glyph('info')}<span>${escapeHtml(t('board.demo'))}</span></div>` : '';
    this.boardEl.innerHTML = `${demoNote}${emptyNote}${heads}${lanes}`;
    for (const el of this.boardEl.querySelectorAll('.bv-more')) this.observer.observe(el);
    this.scroller.scrollLeft = scrollLeft;
    this.scroller.scrollTop = scrollTop;
    this.applyFocus(hadFocus);
    this.renderTools();
    this.renderBulk();
  }

  filtersActive() { return Boolean(this.prefs.quick.length || this.prefs.mine || this.prefs.recent || this.prefs.search.trim()); }

  laneIconHtml(lane) {
    if (lane.user !== undefined || lane.avatar) return avatarHtml(lane.user ?? null, { size: 20, t: this.t });
    if (lane.epic) return `<span class="bv-lane-epic" style="--epic:${escapeHtml(lane.epic.color || 'var(--accent)')}"></span>`;
    if (lane.iconRef) return renderIconRef(lane.iconRef, { size: 16 });
    return '';
  }

  columnHeadHtml(c) {
    const t = this.t;
    const days = this.settings.doneHideDays;
    const wip = [c.wipMin != null ? t('board.wip.min', { min: c.wipMin }) : '', c.wipMax != null ? t('board.wip.max', { max: c.wipMax }) : ''].filter(Boolean).join(' · ');
    const constrained = this.settings.columnConstraint !== 'none' && !c.backlog;
    const warn = c.over ? t('board.wip.over', { max: c.wipMax, count: c.total }) : c.under ? t('board.wip.under', { min: c.wipMin, count: c.total }) : '';
    const countText = c.shown === c.total ? String(c.total) : `${c.shown}/${c.total}`;
    const countTip = c.shown === c.total ? t('board.column.count', { n: c.total }) : t('board.column.countFiltered', { n: c.shown, total: c.total });
    const cls = ['bv-col-head', c.over ? 'over' : '', c.under ? 'under' : '', c.collapsed ? 'collapsed' : '', c.done ? 'done' : '', c.backlog ? 'backlog' : ''].filter(Boolean).join(' ');
    const doneTip = c.done ? (days != null && !this.prefs.showAllDone ? t('board.column.done', { days }) : t('board.column.doneAll')) : '';
    // every column has an icon (the core fills a default); the backlog column's icon replaces the old list glyph
    const movable = canAddColumn(this);
    const iconTip = c.backlog ? t('board.backlogTip') : movable ? t('board.column.iconTip') : c.name;
    const iconHtml = `<span class="bv-col-icon" title="${escapeHtml(iconTip)}">${renderIconRef(c.icon || (c.backlog ? 'b:backlog' : c.done ? 'b:done' : 'b:circle'), { size: 16 })}</span>`;
    const headAttrs = `tabindex="0" ${movable ? `data-col-movable aria-roledescription="${escapeHtml(t('board.column.movable'))}"` : ''}`;
    if (c.collapsed) {
      return `<div class="${cls}" data-col="${escapeHtml(c.id)}" data-drop-column="${escapeHtml(c.id)}" role="columnheader" ${headAttrs} title="${escapeHtml(`${c.name} — ${countTip}${warn ? ` — ${warn}` : ''}`)}">
        <button class="icon-button bv-col-toggle" data-col-toggle="${escapeHtml(c.id)}" title="${escapeHtml(t('board.column.expand'))}" aria-label="${escapeHtml(t('board.column.expand'))}" aria-expanded="false">${glyph('chevronRight')}</button>
        ${iconHtml}<span class="bv-col-count">${escapeHtml(countText)}</span><span class="bv-col-name vertical">${escapeHtml(c.name)}</span></div>`;
    }
    return `<div class="${cls}" data-col="${escapeHtml(c.id)}" role="columnheader" ${headAttrs} title="${escapeHtml(warn || countTip)}">
      ${this.demo ? '' : `<button class="icon-button bv-col-add" data-col-create="${escapeHtml(c.id)}" title="${escapeHtml(t('board.column.create'))}" aria-label="${escapeHtml(t('board.column.create'))}">${glyph('plus')}</button>`}
      ${iconHtml}
      <span class="bv-col-name">${escapeHtml(c.name)}</span>
      <span class="bv-col-count" title="${escapeHtml(countTip)}">${escapeHtml(countText)}</span>
      ${constrained && wip ? `<span class="bv-wip ${c.over ? 'over' : c.under ? 'under' : ''}" title="${escapeHtml(warn || wip)}">${c.over || c.under ? glyph('warning') : ''}${escapeHtml(wip)}</span>` : ''}
      ${c.done ? `<span class="bv-col-kind done" title="${escapeHtml(doneTip)}">${glyph('check')}</span>` : ''}
      <span class="grow"></span>
      <button class="icon-button bv-col-toggle" data-col-toggle="${escapeHtml(c.id)}" title="${escapeHtml(t('board.column.collapse'))}" aria-label="${escapeHtml(t('board.column.collapse'))}" aria-expanded="true">${glyph('chevronDown')}</button>
    </div>`;
  }

  cellHtml(lane, col, chunk = CHUNK) {
    const key = `${lane.id}|${col.id}`;
    const list = this.layout.cells.get(key) ?? [];
    const cls = ['bv-cell', col.collapsed ? 'collapsed' : '', col.over ? 'over' : '', col.under ? 'under' : '', col.done ? 'done' : '', col.backlog ? 'backlog' : ''].filter(Boolean).join(' ');
    if (col.collapsed) return `<div class="${cls}" data-cell="${escapeHtml(key)}" data-drop-column="${escapeHtml(col.id)}" role="gridcell">${list.length ? `<span class="bv-cell-count">${list.length}</span>` : ''}</div>`;
    const limit = Math.max(this.limits.get(key) ?? chunk, chunk);
    const shown = list.slice(0, limit);
    const fields = this.settings.cardFields ?? ['priority', 'storyPoints', 'dueDate'];
    const opts = { t: this.t, lang: this.lang, fields, urlOf: (p) => this.api.url(p), done: col.done, glyph, showDays: this.settings.daysInColumn === true };
    const cards = shown.map((card) => {
      let html = cardHtml(card, this.L, { ...opts, selected: this.selection.has(card.id) });
      if (this.flash.has(card.id)) html = html.replace('class="mb-card', 'class="mb-card bv-flash');
      return html;
    }).join('');
    const more = list.length > shown.length ? `<button class="bv-more small-button" data-more="${escapeHtml(key)}">${glyph('chevronDown')}<span>${escapeHtml(this.t('board.more', { n: list.length - shown.length }))}</span></button>` : '';
    return `<div class="${cls}" data-cell="${escapeHtml(key)}" role="gridcell" aria-label="${escapeHtml(`${lane.name ?? ''} ${col.name}`.trim())}">${cards}${more}</div>`;
  }

  /** Draws more cards of a long cell (the "more" row came into view or was pressed). */
  showMore(key, all = false) {
    if (!key || !this.layout) return;
    const list = this.layout.cells.get(key) ?? [];
    const chunk = this.layout.lanes.length > 1 ? CHUNK_LANES : CHUNK;
    const current = Math.max(this.limits.get(key) ?? chunk, chunk);
    if (current >= list.length) return;
    this.limits.set(key, all ? list.length : current + CHUNK);
    this.redrawCell(key);
  }

  redrawCell(key) {
    const el = this.boardEl.querySelector(`[data-cell="${CSS.escape(key)}"]`);
    if (!el) return;
    const [laneId, colId] = key.split('|');
    const lane = this.layout.lanes.find((l) => l.id === laneId);
    const col = this.layout.columns.find((c) => c.id === colId);
    if (!lane || !col) return;
    const tmp = this.root.ownerDocument.createElement('div');
    tmp.innerHTML = this.cellHtml(lane, col, this.layout.lanes.length > 1 ? CHUNK_LANES : CHUNK);
    const fresh = tmp.firstElementChild;
    for (const more of el.querySelectorAll('.bv-more')) this.observer.unobserve(more);
    el.replaceWith(fresh);
    for (const more of fresh.querySelectorAll('.bv-more')) this.observer.observe(more);
    this.applyFocus(false);
  }

  // ───────────────────────── focus and selection

  cardEl(id) { return id ? this.boardEl.querySelector(`.mb-card[data-id="${CSS.escape(id)}"]`) : null; }

  setFocus(id, { scroll = true, focus = true } = {}) {
    this.focusId = id;
    for (const el of this.boardEl.querySelectorAll('.mb-card[tabindex="0"], .mb-card.focused')) { el.tabIndex = -1; el.classList.remove('focused'); }
    let el = this.cardEl(id);
    if (!el && id) {
      // Not drawn yet (a long cell): draw up to it.
      const key = this.cellKeyOf(id);
      if (key) { const index = (this.layout.cells.get(key) ?? []).findIndex((c) => c.id === id); this.limits.set(key, index + CHUNK); this.redrawCell(key); el = this.cardEl(id); }
    }
    if (!el) return;
    el.tabIndex = 0;
    el.classList.add('focused');
    if (focus) el.focus({ preventScroll: true });
    if (scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  applyFocus(hadFocus) {
    const id = this.focusId && this.cardEl(this.focusId) ? this.focusId : null;
    const el = id ? this.cardEl(id) : this.boardEl.querySelector('.mb-card');
    if (!el) return;
    el.tabIndex = 0;
    if (id) el.classList.add('focused');
    if (hadFocus && id) el.focus({ preventScroll: true });
  }

  focusFirst() { const el = this.boardEl.querySelector('.mb-card'); if (el) this.setFocus(el.dataset.id); }

  cellKeyOf(id) {
    for (const [key, list] of this.layout?.cells ?? []) if (list.some((c) => c.id === id)) return key;
    return null;
  }

  orderedSelection() {
    const order = this.allCards().filter((c) => this.selection.has(c.id)).sort(byRank);
    return order.map((c) => c.id);
  }

  select(ids, { toggle = false, add = false } = {}) {
    if (toggle) { for (const id of ids) if (this.selection.has(id)) this.selection.delete(id); else this.selection.add(id); }
    else { if (!add) this.selection.clear(); for (const id of ids) this.selection.add(id); }
    for (const el of this.boardEl.querySelectorAll('.mb-card')) { const on = this.selection.has(el.dataset.id); el.classList.toggle('selected', on); el.setAttribute('aria-selected', String(on)); }
    this.renderBulk();
  }

  /** The cards from the anchor to `id` in reading order (cell by cell), for Shift+click. */
  rangeTo(id) {
    const order = [];
    for (const lane of this.layout.lanes) for (const col of this.layout.columns) for (const c of this.layout.cells.get(`${lane.id}|${col.id}`) ?? []) order.push(c.id);
    const a = order.indexOf(this.anchorId ?? this.focusId);
    const b = order.indexOf(id);
    if (a < 0 || b < 0) return [id];
    return order.slice(Math.min(a, b), Math.max(a, b) + 1);
  }

  /** Arrow keys: the next card up/down in its cell (then the next lane), left/right in the next column. */
  neighbour(id, direction) {
    const key = this.cellKeyOf(id);
    if (!key) return null;
    const [laneId, colId] = key.split('|');
    const list = this.layout.cells.get(key) ?? [];
    const index = list.findIndex((c) => c.id === id);
    const cols = this.layout.columns.filter((c) => !c.collapsed);
    const lanes = this.layout.lanes.filter((l) => !l.collapsed);
    if (direction === 'up' || direction === 'down') {
      const next = list[index + (direction === 'up' ? -1 : 1)];
      if (next) return next.id;
      const li = lanes.findIndex((l) => l.id === laneId);
      for (let i = li + (direction === 'up' ? -1 : 1); i >= 0 && i < lanes.length; i += direction === 'up' ? -1 : 1) {
        const other = this.layout.cells.get(`${lanes[i].id}|${colId}`) ?? [];
        if (other.length) return (direction === 'up' ? other.at(-1) : other[0]).id;
      }
      return null;
    }
    const ci = cols.findIndex((c) => c.id === colId);
    for (let i = ci + (direction === 'left' ? -1 : 1); i >= 0 && i < cols.length; i += direction === 'left' ? -1 : 1) {
      const other = this.layout.cells.get(`${laneId}|${cols[i].id}`) ?? [];
      if (other.length) return other[Math.min(index, other.length - 1)].id;
    }
    return null;
  }

  // ───────────────────────── events

  onClick(event) {
    const target = event.target;
    const at = (sel) => target.closest(sel);
    let el;
    if ((el = at('[data-bv-retry]'))) return this.load();
    if ((el = at('[data-bv-create]'))) return this.createIssue();
    if ((el = at('[data-col-toggle]'))) return this.toggleColumn(el.dataset.colToggle);
    if ((el = at('[data-col-create]'))) return this.createIssue({ columnId: el.dataset.colCreate });
    if ((el = at('[data-col-new]'))) return openAddColumn(this);
    if ((el = at('[data-lane-toggle]'))) return this.toggleLane(el.dataset.laneToggle);
    if ((el = at('[data-more]'))) return this.showMore(el.dataset.more);
    if ((el = at('[data-quick]'))) { const id = el.dataset.quick; this.prefs.quick = this.prefs.quick.includes(id) ? this.prefs.quick.filter((q) => q !== id) : [...this.prefs.quick, id]; this.savePrefs(); this.renderFilters(); return this.load({ quiet: true }); }
    if ((el = at('[data-builtin]'))) { const key = el.dataset.builtin; this.prefs[key] = !this.prefs[key]; this.savePrefs(); this.renderFilters(); return this.render(); }
    if ((el = at('[data-clear-filters]'))) return this.clearFilters();
    if ((el = at('[data-lanes]'))) return this.setAllLanes(el.dataset.lanes === 'collapse');
    if ((el = at('[data-toggle-backlog]'))) { this.prefs.showBacklog = !this.prefs.showBacklog; this.savePrefs(); return this.render(); }
    if ((el = at('[data-toggle-done]'))) { this.prefs.showAllDone = !this.prefs.showAllDone; this.savePrefs(); return this.load({ quiet: true }); }
    if ((el = at('[data-ref-dd="groupBy"]'))) {
      return openRefList(el, { items: this.groupItems(), value: this.mode, icon, onPick: (mode) => this.setGroup(mode) });
    }
    if ((el = at('[data-bulk]'))) return this.onBulk(el.dataset.bulk, el);
    const card = at('.mb-card');
    if (card && this.boardEl.contains(card)) {
      const id = card.dataset.id;
      if (event.ctrlKey || event.metaKey) { this.select([id], { toggle: true }); this.anchorId = id; this.setFocus(id, { scroll: false }); return undefined; }
      if (event.shiftKey) { this.select(this.rangeTo(id), { add: event.ctrlKey }); this.setFocus(id, { scroll: false }); return undefined; }
      this.anchorId = id;
      this.select([id]);
      this.setFocus(id, { scroll: false });
      return this.ctx.openIssue(id);
    }
    return undefined;
  }

  onKey(event) {
    if (event.target === this.searchInput) return;
    if (columnKey(this, event)) return;
    const el = event.target.closest?.('.mb-card');
    if (!el) return;
    const id = el.dataset.id;
    const mod = event.ctrlKey || event.metaKey;
    const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[event.key];
    if (dir && mod && !event.altKey) { event.preventDefault(); event.stopPropagation(); this.keyboardMove(id, dir); return; }
    if (dir && !event.altKey) {
      event.preventDefault();
      const next = this.neighbour(id, dir);
      if (next) {
        if (event.shiftKey) { this.anchorId ??= id; this.select(this.rangeTo(next)); }
        this.setFocus(next);
      }
      return;
    }
    if (event.key === 'Enter') { event.preventDefault(); this.ctx.openIssue(id); return; }
    if (event.key === ' ') { event.preventDefault(); this.select([id], { toggle: true }); this.anchorId = id; return; }
    if (event.key === 'Escape' && this.selection.size) { event.preventDefault(); this.select([]); return; }
    if (event.key === 'Delete' && !this.demo) { event.preventDefault(); this.deleteCards(this.selection.has(id) ? this.orderedSelection() : [id]); return; }
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      const r = el.getBoundingClientRect();
      this.cardMenu(id, r.left + 16, r.top + 16);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const key = this.cellKeyOf(id);
      const list = this.layout.cells.get(key) ?? [];
      const to = event.key === 'Home' ? list[0] : list.at(-1);
      if (to) this.setFocus(to.id);
    }
  }

  onContextMenu(event) {
    if (event.target.closest('input, textarea')) return;
    event.preventDefault();
    const head = event.target.closest('.bv-heads .bv-col-head[data-col]');
    if (head && this.boardEl.contains(head)) { openColumnMenu(this, head.dataset.col, event.clientX, event.clientY); return; }
    const el = event.target.closest('.mb-card');
    if (el && this.boardEl.contains(el)) {
      const id = el.dataset.id;
      if (!this.selection.has(id)) { this.select([id]); this.anchorId = id; }
      this.setFocus(id, { scroll: false });
      this.cardMenu(id, event.clientX, event.clientY);
      return;
    }
    openBoardMenu(this, event.clientX, event.clientY);
  }

  cardMenu(id, x, y) {
    const ids = this.selection.has(id) && this.selection.size > 1 ? this.orderedSelection() : [id];
    return openCardMenu(this, ids, x, y);
  }

  onBulk(kind, el) {
    const ids = this.orderedSelection();
    if (kind === 'clear') return this.select([]);
    if (kind === 'assignMe') return this.patchCards(ids, { assigneeId: this.me }, 'assign');
    if (kind === 'move') {
      const items = this.layout.columns.map((c) => ({ value: c.id, label: c.name, glyph: c.done ? 'check' : c.backlog ? 'list' : 'columns' }));
      return openRefList(el, { items, value: null, icon, onPick: (colId) => this.moveToColumn(ids, colId) });
    }
    if (kind === 'menu') { const r = el.getBoundingClientRect(); return openCardMenu(this, ids, r.left, r.bottom); }
    return undefined;
  }

  toggleColumn(id) {
    const list = this.prefs.collapsedColumns;
    this.prefs.collapsedColumns = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    this.savePrefs();
    this.render();
  }

  toggleLane(id) {
    const list = this.prefs.collapsedLanes;
    this.prefs.collapsedLanes = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    this.savePrefs();
    this.render();
  }

  setAllLanes(collapse) {
    this.prefs.collapsedLanes = collapse ? this.layout.lanes.map((l) => l.id) : [];
    this.savePrefs();
    this.render();
  }

  setGroup(mode) {
    this.prefs.groupBy = mode === this.settings.swimlanes ? null : mode;
    this.prefs.collapsedLanes = [];
    this.limits.clear();
    this.savePrefs();
    this.render();
  }

  clearFilters() {
    Object.assign(this.prefs, { quick: [], mine: false, recent: false, search: '' });
    this.searchInput.value = '';
    this.savePrefs();
    this.renderFilters();
    this.load({ quiet: true });
  }

  focusSearch() { this.searchInput.focus(); this.searchInput.select(); }

  // ───────────────────────── drag and drop

  dragStarted(ids) {
    this.allowed = null;
    if (this.demo || ids.length !== 1) return;
    // Which columns the workflow lets this issue go to (GET /issues/:id/transitions); others are dimmed.
    const card = this.card(ids[0]);
    const seq = (this.dragSeq = (this.dragSeq ?? 0) + 1);
    this.api.get(`/issues/${encodeURIComponent(ids[0])}/transitions`).then((list) => {
      if (seq !== this.dragSeq || !this.drag.active) return;
      const items = Array.isArray(list) ? list : list?.items ?? [];
      const reachable = new Set(items.filter((x) => x.available !== false).map((x) => x.toStatusId ?? x.to_status_id));
      reachable.add(card?.statusId);
      this.allowed = new Set(this.layout.columns.filter((c) => c.statusIds.some((s) => reachable.has(s))).map((c) => c.id));
      for (const col of this.layout.columns) if (!this.allowed.has(col.id)) for (const el of this.boardEl.querySelectorAll(`[data-cell$="|${CSS.escape(col.id)}"], .bv-col-head[data-col="${CSS.escape(col.id)}"]`)) el.classList.add('no-drop');
    }).catch(() => {});
  }

  canDrop(cell) {
    if (!this.allowed) return true;
    const colId = cell.dataset.cell.split('|')[1];
    return this.allowed.has(colId);
  }

  dragEnded() {
    this.allowed = null;
    if (this.pendingRefetch) { this.pendingRefetch = false; this.scheduleRefetch(100); }
    if (this.pendingRender) this.render();
  }

  dropped({ ids, cell, index }) {
    const [laneId, columnId] = cell.dataset.cell.split('|');
    this.allowed = null;
    this.moveCards(ids, { laneId, columnId, index }).finally(() => this.dragEnded());
  }

  /** Ctrl+arrow: the focused card one place up/down, or to the next column (same lane, same place). */
  keyboardMove(id, dir) {
    const key = this.cellKeyOf(id);
    if (!key) return;
    const [laneId, colId] = key.split('|');
    const list = this.layout.cells.get(key) ?? [];
    const index = list.findIndex((c) => c.id === id);
    const ids = this.selection.has(id) && this.selection.size > 1 ? this.orderedSelection() : [id];
    if (dir === 'up' || dir === 'down') {
      const to = dir === 'up' ? index - 1 : index + 1;
      if (to < 0 || to >= list.length) return;
      this.moveCards(ids, { laneId, columnId: colId, index: to }, { refocus: id });
      return;
    }
    const cols = this.layout.columns.filter((c) => !c.collapsed || c.id === colId);
    const ci = cols.findIndex((c) => c.id === colId);
    const next = cols[ci + (dir === 'left' ? -1 : 1)];
    if (!next) return;
    this.moveCards(ids, { laneId, columnId: next.id, index }, { refocus: id });
  }

  /** Moves the dragged cards in the local data (rank, column, lane); returns the snapshots to undo. */
  applyLocalMove(cards, { laneId, columnId, afterId, beforeId }) {
    const mode = this.mode;
    const field = LANE_FIELDS[mode];
    const col = this.L.column(columnId);
    let low = afterId ? this.card(afterId)?.rank ?? null : null;
    const high = beforeId ? this.card(beforeId)?.rank ?? null : null;
    for (const card of cards) {
      const moved = { ...card, rank: rankBetween(low, high) };
      low = moved.rank;
      if (moved.columnId !== columnId) {
        moved.columnId = columnId;
        if (col && !col.statusIds.includes(moved.statusId)) { moved.statusId = col.statusIds[0]; moved.statusChangedAt = Date.now(); }
      }
      if (field && laneOf(card, mode) !== laneId) moved[field] = laneValue(laneId);
      if (mode === 'queries') moved.lane = laneId;
      this.putCard(moved);
    }
  }

  /**
   * Moves cards to a cell at a position: optimistic, then POST /issues/:id/move for each (in order), the
   * swimlane's field set too; rolls back and says why when the core refuses; recorded for Undo/Redo.
   */
  async moveCards(ids, { laneId, columnId, index }, { refocus = null } = {}) {
    const t = this.t;
    const key = `${laneId}|${columnId}`;
    const target = this.layout.cells.get(key) ?? [];
    const excluded = new Set(ids);
    const { afterId, beforeId } = dropNeighbours(target, index, excluded);
    const cards = ids.map((id) => this.card(id)).filter(Boolean).sort(byRank);
    if (!cards.length) return;
    const mode = this.mode;
    const field = LANE_FIELDS[mode];
    const serverLanes = field && this.settings.swimlanes === mode;
    // Nothing changes: one card dropped where it was.
    if (cards.length === 1) {
      const c = cards[0];
      const sameCell = c.columnId === columnId && laneOf(c, mode) === laneId;
      const nb = neighbours(this.layout.cells.get(key) ?? [], c.id);
      if (sameCell && nb.aboveId === afterId && nb.belowId === beforeId) return;
    }
    // A column the workflow does not reach: said at once, nothing is sent (the drag already dims those columns).
    if (!this.demo && cards.length === 1 && cards[0].columnId !== columnId) {
      const refusal = await this.transitionRefusal(cards[0], columnId);
      if (refusal) { this.ctx.notify('error', `${t('board.moveFailed')}: ${refusal}`); return; }
    }
    const before = cards.map((c) => {
      const k = this.cellKeyOf(c.id);
      return { card: { ...c }, lane: laneOf(c, mode), ...neighbours(this.layout.cells.get(k) ?? [], c.id) };
    });
    const sameColumn = cards.every((c) => c.columnId === columnId);
    const label = cards.length > 1 ? t('board.op.moveMany', { n: cards.length }) : t(sameColumn && before[0].lane === laneId ? 'board.op.rank' : 'board.op.move', { key: cards[0].key });
    this.applyLocalMove(cards, { laneId, columnId, afterId, beforeId });
    if (refocus) this.focusId = refocus;
    this.render();
    if (refocus) this.setFocus(refocus);
    const column = this.L.column(columnId);

    if (this.demo) {
      const after = ids.map((id) => ({ ...this.card(id) }));
      this.ctx.history.record({
        label,
        undo: async () => { for (const b of before) this.putCard({ ...b.card }); this.render(); },
        redo: async () => { for (const a of after) this.putCard({ ...a }); this.render(); },
      });
      return;
    }

    const forward = async ({ initial }) => {
      let after = afterId;
      for (const b of before) {
        const id = b.card.id;
        const body = { boardId: this.boardId, columnId };
        if (after) body.afterId = after;
        if (beforeId) body.beforeId = beforeId;
        if (initial && b.card.rev != null) body.rev = b.card.rev;
        let patch = null;
        if (field && b.lane !== laneId) { if (serverLanes) body.swimlane = laneId; else patch = { [field]: laneValue(laneId) }; }
        const res = await this.api.move(id, body);
        let issue = res?.issue ?? null;
        if (patch) issue = (await this.api.updateIssue(id, patch)) ?? issue;
        if (initial && issue) {
          const prev = this.card(id);
          const next = issueToCard(issue, { prev, L: this.L });
          if (mode === 'queries') next.lane = laneId;
          this.putCard(next);
        }
        for (const w of res?.warnings ?? []) if (w.code === 'WIP_LIMIT' && initial) this.ctx.notify('warning', t('board.wipWarning', { column: this.L.column(w.columnId)?.name ?? column?.name ?? '', max: w.max, count: w.count }));
        after = id;
      }
    };
    const backward = async () => {
      for (const b of before) {
        const c = b.card;
        const body = { boardId: this.boardId, columnId: c.columnId, statusId: c.statusId };
        if (b.aboveId && !ids.includes(b.aboveId)) body.afterId = b.aboveId;
        else if (b.belowId && !ids.includes(b.belowId)) body.beforeId = b.belowId;
        else if (b.aboveId) body.afterId = b.aboveId;
        let patch = null;
        if (field && b.lane !== laneId) { if (serverLanes) body.swimlane = b.lane; else patch = { [field]: c[field] ?? null }; }
        await this.api.move(c.id, body);
        if (patch) await this.api.updateIssue(c.id, patch);
      }
    };
    try {
      await forward({ initial: true });
      this.ctx.history.record({ label, undo: backward, redo: () => forward({ initial: false }) });
      this.render();
      if (this.settings.cardColors === 'queries' || mode === 'queries' || this.filtersActive()) this.scheduleRefetch(300);
    } catch (error) {
      // Back where they were; the board is read again (a part of a multi-move may have happened).
      for (const b of before) this.putCard({ ...b.card });
      this.render();
      if (isConflict(error)) this.ctx.notify('info', t('board.conflict'));
      else this.ctx.notify('error', `${t('board.moveFailed')}: ${errorMessage(error, t)}`);
      this.scheduleRefetch(cards.length > 1 || isConflict(error) ? 0 : 400);
    }
  }

  /** Why the workflow keeps `card` out of a column (translated), or '' when a transition reaches it. */
  async transitionRefusal(card, columnId) {
    const col = this.L.column(columnId);
    if (!col || col.statusIds.includes(card.statusId)) return '';
    let list;
    try { list = await this.api.get(`/issues/${encodeURIComponent(card.id)}/transitions`); } catch { return ''; }
    const items = Array.isArray(list) ? list : list?.items ?? [];
    const into = items.filter((x) => col.statusIds.includes(x.toStatusId ?? x.to_status_id));
    if (into.some((x) => x.available !== false)) return '';
    const reason = into.find((x) => x.reason)?.reason;
    if (reason) return errorMessage(typeof reason === 'object' ? reason : { code: String(reason), message: '' }, this.t);
    return errorMessage({ code: 'TRANSITION_NOT_ALLOWED' }, this.t);
  }

  /** Several cards to a column (menu, bulk bar): one bulk transition, single moves for those it refuses. */
  async moveToColumn(ids, columnId) {
    const t = this.t;
    const col = this.L.column(columnId);
    const cards = ids.map((id) => this.card(id)).filter((c) => c && c.columnId !== columnId);
    if (!cards.length || !col) return;
    if (cards.length === 1 || this.demo) {
      const list = this.layout.cells.get(`${laneOf(cards[0], this.mode)}|${columnId}`) ?? [];
      return this.moveCards(cards.map((c) => c.id), { laneId: laneOf(cards[0], this.mode), columnId, index: list.length });
    }
    const before = cards.map((c) => ({ ...c }));
    for (const c of cards) this.putCard({ ...c, columnId, statusId: col.statusIds.includes(c.statusId) ? c.statusId : col.statusIds[0] });
    this.render();
    const forward = async () => {
      const res = await this.api.bulk({ ids: cards.map((c) => c.id), transition: { statusId: col.statusIds[0] } });
      const failed = [];
      for (const f of res?.failed ?? []) { try { await this.api.move(f.id, { boardId: this.boardId, columnId }); } catch (error) { failed.push([f.id, error]); } }
      return failed;
    };
    const backward = async () => {
      const groups = new Map();
      for (const c of before) { if (!groups.has(c.statusId)) groups.set(c.statusId, []); groups.get(c.statusId).push(c.id); }
      for (const [statusId, list] of groups) await this.api.bulk({ ids: list, transition: { statusId } });
    };
    try {
      const failed = await forward();
      if (failed.length) this.ctx.notify('error', `${t('board.moveFailed')}: ${failed.map(([id, e]) => `${this.card(id)?.key ?? id} — ${errorMessage(e, t)}`).join(', ')}`);
      this.ctx.history.record({ label: t('board.op.moveMany', { n: cards.length }), undo: backward, redo: async () => { await forward(); } });
    } catch (error) {
      for (const c of before) this.putCard(c);
      this.render();
      this.ctx.notify('error', `${t('board.moveFailed')}: ${errorMessage(error, t)}`);
    }
    this.scheduleRefetch(0);
  }

  /**
   * Changes fields of cards (assignee, flag, priority, type, icon, cover, colour): optimistic, one bulk request
   * (PATCH for a single card, so its new rev comes back), recorded for Undo/Redo by the old values.
   */
  async patchCards(ids, patch, op) {
    const t = this.t;
    const cards = ids.map((id) => this.card(id)).filter(Boolean);
    if (!cards.length) return;
    const keys = Object.keys(patch);
    const olds = cards.map((c) => ({ id: c.id, values: Object.fromEntries(keys.map((k) => [k, c[k] ?? null])) }));
    const changed = olds.filter((o) => keys.some((k) => JSON.stringify(o.values[k]) !== JSON.stringify(patch[k] ?? null)));
    if (!changed.length) return;
    const label = changed.length > 1 ? t(`board.op.${op}Many`, { n: changed.length }, t(`board.op.${op}`, { key: '' })) : t(`board.op.${op}`, { key: this.card(changed[0].id)?.key ?? '' });
    const snapshot = cards.map((c) => ({ ...c }));
    for (const o of changed) this.putCard({ ...this.card(o.id), ...patch });
    this.render();
    if (this.demo) {
      this.ctx.history.record({ label, undo: async () => { for (const o of changed) this.putCard({ ...this.card(o.id), ...o.values }); this.render(); }, redo: async () => { for (const o of changed) this.putCard({ ...this.card(o.id), ...patch }); this.render(); } });
      return;
    }
    const send = async (list, values, initial) => {
      if (list.length === 1) {
        const issue = await this.api.updateIssue(list[0], initial && this.card(list[0])?.rev != null ? { ...values, rev: snapshot.find((s) => s.id === list[0])?.rev } : values);
        if (initial && issue) this.putCard(issueToCard(issue, { prev: this.card(list[0]), L: this.L }));
        return [];
      }
      const res = await this.api.bulk({ ids: list, patch: values });
      return res?.failed ?? [];
    };
    try {
      const failed = await send(changed.map((o) => o.id), patch, true);
      if (failed.length) this.ctx.notify('error', `${t('board.updateFailed')}: ${failed.map((f) => `${this.card(f.id)?.key ?? f.id} — ${errorMessage(f.error, t)}`).join(', ')}`);
      this.ctx.history.record({
        label,
        undo: async () => {
          const groups = new Map();
          for (const o of changed) { const k = JSON.stringify(o.values); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(o.id); }
          for (const [k, list] of groups) await send(list, JSON.parse(k), false);
        },
        redo: async () => { await send(changed.map((o) => o.id), patch, false); },
      });
      this.render();
      if (changed.length > 1 || failed.length || keys.some((k) => ['typeId', 'priorityId', 'assigneeId'].includes(k))) this.scheduleRefetch(changed.length > 1 ? 0 : 300);
    } catch (error) {
      for (const s of snapshot) this.putCard(s);
      this.render();
      if (isConflict(error)) { this.ctx.notify('info', t('board.conflict')); this.scheduleRefetch(0); } else this.ctx.notify('error', `${t('board.updateFailed')}: ${errorMessage(error, t)}`);
    }
  }

  async deleteCards(ids) {
    const t = this.t;
    const cards = ids.map((id) => this.card(id)).filter(Boolean);
    if (!cards.length || this.demo) return;
    const message = cards.length === 1 ? t('board.deleteOne', { key: cards[0].key, summary: cards[0].summary }) : t('board.deleteMany', { n: cards.length });
    const choice = await this.ctx.app.ask({ kind: 'delete', icon: 'trash', title: t('board.deleteTitle'), message, buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'delete', label: t('board.deleteButton'), icon: 'trash', danger: true, primary: true }] });
    if (choice !== 'delete') return;
    try {
      const res = await this.api.bulk({ ids: cards.map((c) => c.id), delete: true });
      for (const id of res?.ok ?? []) this.removeCard(id);
      if (res?.failed?.length) this.ctx.notify('error', `${t('board.updateFailed')}: ${res.failed.map((f) => `${this.card(f.id)?.key ?? f.id} — ${errorMessage(f.error, t)}`).join(', ')}`);
      else this.ctx.notify('success', t('board.deleted', { n: res?.ok?.length ?? 0 }));
      this.render();
    } catch (error) {
      this.ctx.notify('error', `${t('board.updateFailed')}: ${errorMessage(error, t)}`);
    }
  }

  createIssue(options = {}) { return openCreateForm(this, options); }

  // ───────────────────────── realtime (ARCHITECTURE.md §6) and the shell's updates

  update(ctx) {
    this.ctx = ctx;
    if (ctx.live !== this.liveRef) this.bindLive();
    if (ctx.event) return this.onLiveEvent(ctx.event);
    if (ctx.reload) return this.load({ quiet: true });
    if (ctx.settingsChanged) {
      const t = this.t;
      this.searchInput.placeholder = t('board.search');
      this.searchInput.setAttribute('aria-label', t('board.search'));
      this.searchInput.closest('label').title = t('board.searchTip');
      this.boardEl.setAttribute('aria-label', t('board.keyboardHelp'));
      if (this.demo && this.demoData && this.demoLang !== this.lang) { this.demoData = null; }
      this.demoLang = this.lang;
      if (this.demo) return this.load();
      this.renderState();
      this.renderFilters();
      return this.render();
    }
    return undefined;
  }

  /** The board's card colour of a card (§3.2 cardColors) — the core's rule; 'queries' keeps the last known. */
  cardColorOf(card, prev = null) {
    switch (this.settings.cardColors) {
      case 'type': return this.L.type(card.typeId)?.color || null;
      case 'priority': return this.L.priority(card.priorityId)?.color || null;
      case 'assignee': { if (!card.assigneeId) return null; let h = 0; for (const ch of card.assigneeId) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 55% 50%)`; }
      case 'queries': return prev?.cardColor ?? null;
      default: return null;
    }
  }

  onLiveEvent(event, { local = false } = {}) {
    if (!this.data || this.demo) return;
    if (!local && event.client && event.client === this.api?.clientId) return;
    const type = String(event.type ?? '');
    const data = event.data ?? {};
    if (/^issue\./.test(type)) {
      const id = event.id ?? data.id;
      if (type === 'issue.deleted') { if (this.card(id)) { this.removeCard(id); this.render(); } return; }
      if (type === 'issue.created') { this.scheduleRefetch(200); return; }
      // moved to another project: off this board now (a cross-project board gets it back from the refetch)
      if (type === 'issue.projectMoved') { if (this.card(id)) { this.removeCard(id); this.render(); } this.scheduleRefetch(200); return; }
      const prev = this.card(id);
      if (!prev) {
        // Not on the board yet: it may have moved into one of its columns.
        if (data.statusId && this.L.columnOfStatus(data.statusId)) this.scheduleRefetch(200);
        return;
      }
      if (prev.rev != null && event.rev != null && Number(event.rev) < Number(prev.rev)) return;
      const next = issueToCard(data, { prev, L: this.L });
      next.cardColor = this.cardColorOf(next, prev);
      if (this.mode === 'queries' || this.settings.cardColors === 'queries' || this.filtersActive() || data.archived) this.scheduleRefetch(300);
      if (data.archived) { this.removeCard(id); this.render(); return; }
      this.putCard(next);
      if (local) { this.render(); return; }
      this.flash.set(id, Date.now());
      setTimeout(() => { this.flash.delete(id); this.cardEl(id)?.classList.remove('bv-flash'); }, 1600);
      this.render();
      return;
    }
    if (/^(comment|attachment|checklist|worklog|link|label)\./.test(type)) { this.scheduleRefetch(600); return; }
    if (/^(board|column|swimlane|quickFilter|cardColor|status|issueType|workflow|transition|version|component|priority|user|member|project)\./.test(type)) {
      if (type === 'board.deleted' && (event.id === this.boardId || data.id === this.boardId)) { this.status = 'error'; this.error = { code: 'BOARD_NOT_FOUND' }; this.renderState(); return; }
      this.scheduleRefetch(300);
    }
  }
}
