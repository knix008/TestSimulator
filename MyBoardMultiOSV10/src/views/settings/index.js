// Project settings view (registerView('projectSettings')): a section list on the left (icons + labels, icons
// only when narrow) and the editor of the chosen section on the right. Sections: details, members & users,
// issue types, statuses, priorities, resolutions, components, versions, labels, custom fields, workflows,
// board configuration, automation, import/export.
//
// Data: GET /projects/:id/config (+ GET /boards/:id for the board, the automation rules, users); every editor
// saves with `rev` (409 → a notice and a reload), errors are shown by code, simple edits go to ctx.history.
// Non-admins see everything read-only.
import { registerView } from '../registry.js';
import { registerTexts } from '../../i18n.js';
import { TEXTS } from './texts.js';
import './settings.css';
import {
  tr, esc, icon, items, errorText, note, debounce,
} from './util.js';
import { detailsSection } from './sections/details.js';
import { membersSection, usersSection } from './sections/members.js';
import { typesSection, statusesSection, prioritiesSection, resolutionsSection, componentsSection, versionsSection, labelsSection } from './sections/lists.js';
import { fieldsSection } from './sections/fields.js';
import { workflowSection } from './sections/workflow.js';
import { boardSection } from './sections/board.js';
import { automationSection } from './sections/automation.js';
import { exchangeSection } from './sections/exchange.js';

registerTexts(TEXTS);

/** Sections in display order, grouped. */
export const SECTIONS = [
  { group: 'project', ...detailsSection },
  { group: 'project', ...membersSection },
  { group: 'project', ...usersSection },
  { group: 'issues', ...typesSection },
  { group: 'issues', ...statusesSection },
  { group: 'issues', ...prioritiesSection },
  { group: 'issues', ...resolutionsSection },
  { group: 'issues', ...componentsSection },
  { group: 'issues', ...versionsSection },
  { group: 'issues', ...labelsSection },
  { group: 'issues', ...fieldsSection },
  { group: 'flow', ...workflowSection },
  { group: 'flow', ...automationSection },
  { group: 'board', ...boardSection },
  { group: 'data', ...exchangeSection },
];

const SECTION_KEY = 'myboard.projectSettings.section';
const readStored = (key, fallback) => { try { return globalThis.localStorage?.getItem(key) ?? fallback; } catch { return fallback; } };
const writeStored = (key, value) => { try { globalThis.localStorage?.setItem(key, value); } catch { /* private window */ } };

class SettingsView {
  constructor() {
    this.host = null;
    this.ctx = null;
    this.section = readStored(SECTION_KEY, 'details');
    this.data = null;
    this.banner = null;
    this.pending = {};      // per-section UI state (open editors, confirmations)
    this.loading = null;
    this.observer = null;
    this.queueRefresh = debounce(() => this.refresh(), 250);
  }

  // ───────────────────────── view interface

  mount(host, ctx) {
    this.host = host;
    this.ctx = ctx;
    host.classList.add('ps-host');
    host.innerHTML = `<div class="ps-root"><nav class="ps-nav" aria-label="${esc(tr('nav.title'))}"></nav><div class="ps-main"><div class="ps-content"></div></div></div>`;
    this.root = host.querySelector('.ps-root');
    this.nav = host.querySelector('.ps-nav');
    this.content = host.querySelector('.ps-content');
    this.nav.addEventListener('click', (event) => {
      const item = event.target.closest('[data-section]');
      if (item) this.go(item.dataset.section);
    });
    this.observer = new ResizeObserver(() => this.fit());
    this.observer.observe(host);
    this.fit();
    window.__myboardSettings = this;
    this.refresh();
  }

  update(ctx) {
    const previous = this.ctx;
    this.ctx = ctx;
    if (ctx.workspace?.project?.id !== previous?.workspace?.project?.id || ctx.workspace?.board?.id !== previous?.workspace?.board?.id) { this.data = null; this.refresh(); return; }
    if (ctx.reload) { this.refresh(); return; }
    if (ctx.settingsChanged) { this.render(); return; }
    const event = ctx.event;
    if (event && this.data && this.relevant(event)) this.queueRefresh();
  }

  unmount() {
    this.observer?.disconnect();
    this.observer = null;
    if (window.__myboardSettings === this) delete window.__myboardSettings;
    this.host?.classList.remove('ps-host', 'ps-narrow', 'ps-tiny');
    this.host = null;
  }

  relevant(event) {
    const topics = event.topics ?? [];
    return topics.includes(`project:${this.pid}`) || (this.boardId && topics.includes(`board:${this.boardId}`)) || topics.includes('users');
  }

  fit() {
    if (!this.host) return;
    const width = this.host.clientWidth;
    this.host.classList.toggle('ps-narrow', width < 860);
    this.host.classList.toggle('ps-tiny', width < 600);
  }

  // ───────────────────────── data

  get api() { return this.ctx.api; }
  get workspace() { return this.ctx.workspace; }
  get pid() { return this.workspace?.project?.id ?? null; }
  get boardId() { return this.pending.boardId ?? this.workspace?.board?.id ?? this.data?.config?.boards?.[0]?.id ?? null; }
  get config() { return this.data?.config ?? null; }
  get project() { return this.data?.config?.project ?? this.workspace?.project ?? null; }
  get board() { return this.data?.board ?? null; }
  get info() { return this.ctx.app?.state?.core?.info ?? null; }
  get me() { return this.info?.user ?? null; }
  get mode() { return this.info?.mode ?? 'desktop'; }
  get isGlobalAdmin() { return this.me?.role === 'admin'; }
  /** Project administrators (and global admins) configure the project. */
  get canEdit() { return Boolean(this.project && (this.project.myRole === 'admin' || this.isGlobalAdmin)); }
  get canEditBoard() { return this.canEdit || Boolean(this.board && !this.board.projectId && this.board.createdBy === this.me?.id); }
  get members() { return this.config?.members ?? []; }
  get users() { return this.data?.users ?? []; }
  /** Users who can be picked (members first, then the others for global admins). */
  get people() { return this.members.map((m) => ({ id: m.userId, displayName: m.displayName, username: m.username, avatar: m.avatar })); }

  async load() {
    const pid = this.pid;
    const [config, board, rules, users] = await Promise.all([
      this.api.get(`/projects/${encodeURIComponent(pid)}/config`),
      this.boardId ? this.api.board(this.boardId).catch(() => null) : null,
      this.api.get(`/projects/${encodeURIComponent(pid)}/automation`).catch(() => []),
      this.api.users({ all: 1 }).catch(() => []),
    ]);
    let boardRow = board;
    if (!boardRow && config?.boards?.length && !this.pending.boardId) boardRow = await this.api.board(config.boards[0].id).catch(() => null);
    return { config, board: boardRow, rules: items(rules), users: items(users) };
  }

  /** Reloads the data and redraws the current section (keeps the scroll position). */
  async refresh() {
    if (!this.host) return;
    if (!this.pid || this.workspace?.demo) { this.data = null; this.render(); return; }
    const token = (this.loading = Symbol('load'));
    if (!this.data) this.render();
    try {
      const data = await this.load();
      if (token !== this.loading || !this.host) return;
      this.data = data;
      this.loadError = null;
    } catch (error) {
      if (token !== this.loading) return;
      this.loadError = error;
    }
    this.render();
  }

  // ───────────────────────── rendering

  visibleSections() { return SECTIONS.filter((s) => !s.visible || s.visible(this)); }

  render() {
    if (!this.host) return;
    const sections = this.visibleSections();
    if (!sections.some((s) => s.id === this.section)) this.section = sections[0].id;
    let group = '';
    this.nav.innerHTML = sections.map((s) => {
      const head = s.group !== group ? `<div class="ps-nav-group">${esc(tr(`group.${(group = s.group)}`))}</div>` : '';
      return `${head}<button type="button" class="ps-nav-item ${s.id === this.section ? 'active' : ''}" data-section="${s.id}" title="${esc(tr(`section.${s.id}`))}" aria-current="${s.id === this.section}">${icon(s.glyph)}<span>${esc(tr(`section.${s.id}`))}</span></button>`;
    }).join('');
    const scroll = this.content.scrollTop;
    const section = sections.find((s) => s.id === this.section);
    let body;
    if (this.workspace?.demo) body = `<div class="ps-section">${note(tr('demo'), 'info')}</div>`;
    else if (!this.pid) body = `<div class="ps-section">${note(tr('noProject'))}</div>`;
    else if (this.loadError) body = `<div class="ps-section">${note(`${tr('loadFailed')}: ${errorText(this.loadError)}`, 'danger')}<div class="ps-actions"><button type="button" class="button ps-btn" data-act="retry">${icon('refresh')}<span>${esc(tr('common.retry'))}</span></button></div></div>`;
    else if (!this.data) body = `<div class="ps-section ps-loading">${icon('hourglass')}<span>${esc(tr('loading'))}</span></div>`;
    else {
      let inner;
      try { inner = section.render(this); } catch (error) { console.error(error); inner = note(`${tr('loadFailed')}: ${error.message}`, 'danger'); }
      body = `<div class="ps-section" data-ps-section="${section.id}">
        <header class="ps-head">${icon(section.glyph)}<div class="ps-head-text"><h2>${esc(tr(`section.${section.id}`))}</h2><p class="ps-head-desc">${esc(tr(`desc.${section.id}`))}</p></div>
          ${!this.canEdit && !section.open ? `<span class="ps-badge readonly" title="${esc(tr('readOnlyHint'))}">${icon('lock')}<span>${esc(tr('readOnly'))}</span></span>` : ''}</header>
        ${this.banner ? `<div class="ps-banner ${this.banner.kind}" role="alert">${icon(this.banner.kind === 'success' ? 'check' : this.banner.kind === 'warning' ? 'warning' : 'error')}<span>${esc(this.banner.text)}</span><button type="button" class="icon-button" data-act="banner-close" title="${esc(tr('common.close'))}" aria-label="${esc(tr('common.close'))}">${icon('close')}</button></div>` : ''}
        ${inner}
      </div>`;
    }
    this.content.innerHTML = body;
    const el = this.content.firstElementChild;
    el.addEventListener('click', (event) => {
      const act = event.target.closest('[data-act]')?.dataset.act;
      if (act === 'retry') this.refresh();
      else if (act === 'banner-close') { this.banner = null; this.render(); }
    });
    if (this.data && section?.bind && !this.workspace?.demo) {
      try { section.bind(this, el); } catch (error) { console.error(error); }
    }
    this.content.scrollTop = scroll;
  }

  go(id) {
    if (id === this.section) return;
    this.section = id;
    this.banner = null;
    writeStored(SECTION_KEY, id);
    this.content.scrollTop = 0;
    this.render();
  }

  // ───────────────────────── saving

  /** Shows a message above the editor (kept until closed or the next section). */
  say(kind, text) { this.banner = { kind, text }; }

  /** Runs a change; errors go to the banner (409: reload notice). Resolves to the result or null. */
  async run(fn, { reload = true, ok = '' } = {}) {
    try {
      const out = await fn();
      this.banner = ok ? { kind: 'success', text: ok } : null;
      if (reload) await this.refresh(); else this.render();
      return out ?? true;
    } catch (error) {
      this.fail(error);
      return null;
    }
  }

  fail(error) {
    if (error?.status === 409 && (error.code === 'CONFLICT' || error.code === 'conflict')) {
      this.say('warning', tr('conflict'));
      this.ctx.notify?.('warning', tr('conflict'));
      this.refresh();
      return;
    }
    this.say('danger', errorText(error));
    this.ctx.notify?.('error', `${tr('saveFailed')}: ${errorText(error)}`);
    this.render();
  }

  /**
   * An undo-able PATCH: `url`, the item (for rev and the old values), the patch. The history step patches
   * back (and again) with the rev it got last.
   */
  async patch(label, url, item, patch, { reload = true, after = null } = {}) {
    const before = {};
    for (const key of Object.keys(patch)) before[key] = item?.[key] ?? null;
    return this.run(async () => {
      const row = await this.api.patch(url, { ...patch, ...(item?.rev != null ? { rev: item.rev } : {}) });
      let rev = row?.rev ?? null;
      const apply = async (values) => { const r = await this.api.patch(url, { ...values, ...(rev != null ? { rev } : {}) }); rev = r?.rev ?? null; await after?.(r); };
      this.ctx.history?.record({ label, undo: () => apply(before), redo: () => apply(patch) });
      await after?.(row);
      return row;
    }, { reload });
  }

  /** URLs of the things the sections edit. */
  url(kind, id = '') {
    const tail = id ? `/${encodeURIComponent(id)}` : '';
    if (kind === 'project') return `/projects/${encodeURIComponent(this.pid)}`;
    if (kind === 'priorities' || kind === 'resolutions') return `/${kind}${tail}`;
    if (kind === 'board') return `/boards/${encodeURIComponent(this.boardId)}`;
    if (['columns', 'swimlanes', 'quickfilters', 'cardcolors'].includes(kind)) return `/boards/${encodeURIComponent(this.boardId)}/${kind}${tail}`;
    return `/projects/${encodeURIComponent(this.pid)}/${kind}${tail}`;
  }

  /** The shell's copy of the project / board after a rename (sidebar, tabs, recent list). */
  syncShell({ project = null, board = null } = {}) {
    const state = this.ctx.app?.state;
    if (!state?.doc) return;
    if (project && state.doc.project?.id === project.id) Object.assign(state.doc.project, project);
    if (project) { const p = state.projects?.find((x) => x.id === project.id); if (p) Object.assign(p, project); }
    if (board && state.doc.board?.id === board.id) Object.assign(state.doc.board, board);
    if (board) for (const list of state.boardsByProject?.values?.() ?? []) for (const b of list) if (b.id === board.id) Object.assign(b, board);
    try { this.ctx.app?.renderAll?.(); } catch { /* shell redraw only */ }
  }
}

const view = new SettingsView();
registerView('projectSettings', {
  mount: (host, ctx) => view.mount(host, ctx),
  update: (ctx) => view.update(ctx),
  unmount: () => view.unmount(),
});

export { view as settingsView };
