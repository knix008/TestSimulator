// The issue detail view (views/registry.js id 'detail', the right panel #detail): header, status and
// transitions, every field inline-editable, description, checklist, subtasks, links, attachments and the
// activity tabs (comments, history, work log, all). Edits are optimistic, PATCHed with `rev`; a 409 shows
// what changed and offers to keep mine (merge) or take theirs, unsaved text kept. Live events of the issue
// refresh it without losing an edit in progress; presence shows who else views / edits. Field edits are
// undoable through ctx.history.
import { registerView } from '../registry.js';
import { icon } from '../../icons.js';
import { getLanguage, t } from '../../i18n.js';
import { renderIconRef } from '../../ui/iconref.js';
import { bindSteppers, stepperValue } from '../../stepper.js';
import { CLIENT_ID } from '../../api/client.js';
import './texts.js';
import './detail.css';
import { headerHtml, statusRowHtml, bannersHtml, fieldsHtml, sectionBarHtml, descriptionHtml, COLORS, typeIcon, resolutionIcon } from './render.js';
import { checklistHtml, subtasksHtml, linksHtml, attachmentsHtml, activityHtml, previewHtml, LINK_OPTIONS, linkLabel } from './parts.js';
import { formatAction, insertUploads, mentionInput } from './editor.js';
import { openPicker, closePicker, pickerOpen, reanchorPicker } from './picker.js';
import { openMoveForm } from './move.js';
import { avatarHtml, debounce, errorText, esc, fileBase64, fmtDuration, isImage, isoDate, parseDuration, sameValue, userName } from './util.js';

const MAX_ATTACHMENT = 50 * 1024 * 1024;
const PREFS_KEY = 'myboard.detail.v1';
const loadPrefs = () => { try { return JSON.parse(globalThis.localStorage?.getItem(PREFS_KEY) ?? '{}') ?? {}; } catch { return {}; } };
const savePrefs = (prefs) => { try { globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private window */ } };

/** API field name ↔ issue property, for patches, undo and conflict reports. */
const API_FIELD = {
  summary: 'summary', description: 'description', type: 'typeId', assignee: 'assigneeId', reporter: 'reporterId', priority: 'priorityId',
  labels: 'labels', components: 'componentIds', fixVersions: 'fixVersionIds', affectedVersions: 'affectedVersionIds', epic: 'epicId',
  parent: 'parentId', storyPoints: 'storyPoints', originalEstimate: 'originalEstimate', remainingEstimate: 'remainingEstimate',
  startDate: 'startDate', dueDate: 'dueDate', color: 'color', cover: 'cover', 'icon': 'icon', flagged: 'flagged', status: 'statusId',
};
const COMPARED = ['summary', 'description', 'type', 'status', 'assignee', 'reporter', 'priority', 'labels', 'components', 'fixVersions', 'affectedVersions', 'epic', 'parent', 'storyPoints', 'originalEstimate', 'remainingEstimate', 'startDate', 'dueDate', 'color', 'cover', 'icon', 'flagged'];
const HISTORY_FIELD = { typeId: 'type', statusId: 'status', assigneeId: 'assignee', reporterId: 'reporter', priorityId: 'priority', componentIds: 'components', fixVersionIds: 'fixVersions', affectedVersionIds: 'affectedVersions', epicId: 'epic', parentId: 'parent' };

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

class DetailView {
  constructor() {
    this.host = null;
    this.ctx = null;
    this.issueId = null;
    this.issue = null; // what is shown (optimistic)
    this.server = null; // the last issue the core sent
    this.cfg = null;
    this.users = new Map();
    this.drafts = new Map();
    this.previews = new Set();
    this.editing = new Set();
    this.editBase = new Map();
    const prefs = loadPrefs();
    this.collapsed = new Set(prefs.collapsed ?? []);
    this.tab = prefs.tab ?? 'comments';
    this.order = prefs.order ?? 'newest';
    this.showEmpty = Boolean(prefs.showEmpty); // "show empty fields" in Details
    this.keepShown = new Set(); // empty fields the user touched in this issue: never hidden under their hands
    this.activeSection = null;
    this.comments = null; this.attachments = null; this.worklogs = null; this.history = null; this.transitions = null;
    this.presence = [];
    this.configs = new Map();
    this.projectIssues = new Map();
    this.state = 'empty'; // empty | loading | ready | missing | error | demo
    this.pending = 0;
    this.idleWaiters = [];
    this.loadSeq = 0;
    this.offs = [];
    this.language = getLanguage();
  }

  // ───────────────────────── lifecycle

  mount(host, ctx) {
    this.host = host;
    this.ctx = ctx;
    host.classList.add('dt-host');
    host.addEventListener('click', (e) => this.onClick(e));
    host.addEventListener('input', (e) => this.onInput(e));
    host.addEventListener('change', (e) => this.onChange(e));
    host.addEventListener('keydown', (e) => this.onKey(e));
    host.addEventListener('paste', (e) => this.onPaste(e));
    host.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    for (const type of ['dragenter', 'dragover', 'dragleave', 'drop']) host.addEventListener(type, (e) => this.onDrag(e));
    host.addEventListener('focusin', (e) => this.onFocus(e));
    host.addEventListener('scroll', () => this.onScroll(), { passive: true });
    bindSteppers(host, (key, value, el) => this.onStep(key, value, el));
    this.globalKey = (e) => this.onGlobalKey(e);
    document.addEventListener('keydown', this.globalKey);
    const live = ctx.live;
    if (live?.on) {
      this.offs.push(live.on('event', (event) => this.onLive(event)));
      this.offs.push(live.on('presence', (p) => this.onPresence(p)));
      this.offs.push(live.on('subscribed', ({ topics }) => { if (this.topic && (topics ?? []).includes(this.topic)) { this.topicReady = true; this.lastPresence = null; this.sendPresence(); } }));
      this.offs.push(live.on('state', (s) => { if (s?.resync && this.issueId) this.reload({ quiet: true }); }));
    }
    window.__myboardDetail = this;
    this.show(ctx.issueId ?? null);
  }

  update(ctx) {
    this.ctx = { ...this.ctx, ...ctx };
    const id = ctx.issueId !== undefined ? ctx.issueId : this.issueId;
    const demoChanged = Boolean(id) && Boolean(ctx.workspace?.demo) !== (this.state === 'demo');
    if (id !== this.issueId || demoChanged) { this.show(id); return; }
    if (getLanguage() !== this.language) { this.language = getLanguage(); this.render(); }
    else if (ctx.reload && this.issueId) this.reload({ quiet: true });
  }

  unmount() {
    this.leavePresence();
    for (const off of this.offs) off?.();
    this.offs = [];
    document.removeEventListener('keydown', this.globalKey);
    closePicker();
    if (window.__myboardDetail === this) window.__myboardDetail = null;
    this.host = null;
  }

  get api() { return this.ctx.api; }
  get me() { return this.ctx.app?.state?.core?.info?.user ?? null; }
  get readOnly() { const role = this.cfg?.project?.myRole; return !role || role === 'viewer'; }

  /** Resolves when nothing is loading or saving (tests). */
  idle() { return this.pending ? new Promise((resolve) => this.idleWaiters.push(resolve)) : Promise.resolve(); }
  async track(promise) {
    this.pending += 1;
    try { return await promise; } finally {
      this.pending -= 1;
      if (!this.pending) { const waiters = this.idleWaiters.splice(0); for (const w of waiters) w(); }
    }
  }

  // ───────────────────────── loading

  show(id) {
    if (this.issueId !== id) closePicker();
    if (this.issueId && this.issueId !== id) this.leavePresence();
    const changed = this.issueId !== id;
    this.issueId = id;
    if (changed) {
      this.drafts.clear(); this.editing.clear(); this.editBase.clear(); this.previews.clear(); this.keepShown.clear();
      this.issue = null; this.server = null; this.comments = null; this.attachments = null; this.worklogs = null; this.history = null; this.transitions = null;
      this.conflict = null; this.notice = null; this.remoteNote = null; this.statusForm = null; this.linkForm = null; this.preview = null; this.presence = [];
      closePicker();
    }
    if (!id) { this.state = 'empty'; this.render(); return; }
    if (this.ctx.workspace?.demo) { this.state = 'demo'; this.render(); return; }
    this.state = 'loading';
    this.render();
    this.track(this.load(id));
  }

  async load(id, { quiet = false } = {}) {
    const seq = ++this.loadSeq;
    try {
      const issue = await this.api.issue(id);
      if (seq !== this.loadSeq || this.issueId !== id) return;
      const [cfg] = await Promise.all([this.config(issue.projectId), this.loadUsers()]);
      if (seq !== this.loadSeq || this.issueId !== id) return;
      this.cfg = cfg;
      this.setServer(issue);
      this.state = 'ready';
      if (!quiet) this.subscribe(issue);
      this.render();
      await Promise.all([this.loadParts(['comments', 'attachments', ...(this.tab === 'history' || this.tab === 'all' ? ['history'] : []), ...(this.tab === 'worklog' || this.tab === 'all' ? ['worklogs'] : [])]), this.loadTransitions()]);
    } catch (error) {
      if (seq !== this.loadSeq || this.issueId !== id) return;
      if (error?.status === 404 || /NOT_FOUND/i.test(error?.code ?? '')) { this.state = 'missing'; this.missingBy = null; } else { this.state = 'error'; this.loadError = errorText(error); }
      this.render();
    }
  }

  async reload({ quiet = true, parts = null } = {}) {
    if (!this.issueId || this.state === 'demo') return;
    await this.track((async () => {
      try {
        const issue = await this.api.issue(this.issueId);
        this.setServer(issue);
        // moved to another project (here or by someone else): that project's types, statuses and fields
        if (this.state !== 'ready' || (this.cfg?.project?.id && this.cfg.project.id !== issue.projectId)) { this.cfg = await this.config(issue.projectId); this.state = 'ready'; }
        this.render();
        await Promise.all([this.loadParts(parts ?? ['comments', 'attachments', ...(this.history ? ['history'] : []), ...(this.worklogs ? ['worklogs'] : [])]), this.loadTransitions()]);
      } catch (error) {
        if (error?.status === 404) { this.state = 'missing'; this.render(); } else if (!quiet) this.fail(error);
      }
    })());
  }

  /**
   * This window's own changes come back without a live event (the channel drops them): the other views
   * (board, backlog …) hear about them through the window event `myboard:event`, marked `local: true`.
   */
  tellWorkspace(type, issue) {
    if (!issue) return;
    const event = { type, id: issue.id, rev: issue.rev, data: issue, topics: [`project:${issue.projectId}`, `issue:${issue.id}`], by: this.me?.id ?? null, at: Date.now(), local: true };
    try { window.dispatchEvent(new CustomEvent('myboard:event', { detail: event })); } catch (error) { console.warn('myboard:event', error); }
  }

  setServer(issue, { tell = false, type = 'issue.updated' } = {}) {
    if (tell) this.tellWorkspace(type, issue);
    this.server = clone(issue);
    // Fields being edited keep the user's text; everything else follows the core.
    this.issue = clone(issue);
  }

  async config(projectId, { force = false } = {}) {
    const cached = this.configs.get(projectId);
    if (cached && !force && Date.now() - cached.at < 60000) return cached.cfg;
    const cfg = await this.api.get(`/projects/${encodeURIComponent(projectId)}/config`);
    for (const f of cfg.fields ?? []) if (typeof f.options === 'string') { try { f.options = JSON.parse(f.options); } catch { f.options = []; } }
    for (const w of cfg.workflows ?? []) for (const tr of w.transitions ?? []) if (typeof tr.rules === 'string') { try { tr.rules = JSON.parse(tr.rules); } catch { tr.rules = {}; } }
    this.configs.set(projectId, { cfg, at: Date.now() });
    return cfg;
  }

  async loadUsers() {
    if (this.usersAt && Date.now() - this.usersAt < 60000) return;
    const list = await this.api.users();
    const items = Array.isArray(list) ? list : list?.items ?? [];
    this.users = new Map(items.map((u) => [u.id, u]));
    if (this.me && !this.users.has(this.me.id)) this.users.set(this.me.id, this.me);
    this.usersAt = Date.now();
  }

  async loadParts(parts) {
    const id = this.issueId;
    const map = { comments: 'comments', attachments: 'attachments', history: 'history', worklogs: 'worklogs' };
    const wanted = [...new Set(parts)].filter((p) => map[p]);
    if (!wanted.length) return;
    if (wanted.some((p) => p === 'history' || p === 'worklogs') && !this[wanted.find((p) => p === 'history' || p === 'worklogs')]) { this.activityLoading = true; this.render(); }
    try {
      const results = await Promise.all(wanted.map((p) => this.api.issuePart(id, p)));
      if (this.issueId !== id) return;
      wanted.forEach((p, i) => { const r = results[i]; this[p] = Array.isArray(r) ? r : r?.items ?? []; });
    } catch (error) {
      if (this.issueId === id && error?.status !== 404) this.fail(error);
    } finally {
      this.activityLoading = false;
      if (this.issueId === id) this.render();
    }
  }

  async loadTransitions() {
    const id = this.issueId;
    try {
      const list = await this.api.issuePart(id, 'transitions');
      if (this.issueId === id) this.transitions = Array.isArray(list) ? list : [];
    } catch { /* shown when the button is pressed */ }
  }

  async projectIssueList(projectKey, { force = false } = {}) {
    const cached = this.projectIssues.get(projectKey);
    if (cached && !force && Date.now() - cached.at < 30000) return cached.items;
    const out = await this.api.issues({ jql: `project = "${projectKey}"`, limit: 1000 });
    const items = out?.items ?? [];
    this.projectIssues.set(projectKey, { items, at: Date.now() });
    return items;
  }

  // ───────────────────────── realtime

  subscribe(issue) {
    const live = this.ctx.live;
    if (!live?.subscribe) return;
    if (this.topic && this.topic !== `issue:${issue.id}`) live.unsubscribe?.([this.topic]);
    this.topic = `issue:${issue.id}`;
    // The hub accepts presence only once the subscription is confirmed (it checks access asynchronously):
    // presence goes out now when the topic is already subscribed, else on the 'subscribed' answer.
    const already = live.topics?.has?.(this.topic);
    live.subscribe([this.topic]);
    this.lastPresence = null;
    this.topicReady = Boolean(already || !live.realtime);
    if (this.topicReady) this.sendPresence();
  }

  sendPresence() {
    if (!this.topic || !this.topicReady || this.ctx.settings?.realtimePresence === false) return;
    const editing = [...this.editing].find((k) => k === 'summary' || k === 'desc' || k.startsWith('custom:') || k.startsWith('comment:')) ?? null;
    const state = { view: 'issue', issueId: this.issueId, ...(editing ? { editing: editing === 'desc' ? 'description' : editing.startsWith('comment:') ? 'comment' : editing } : {}) };
    const key = JSON.stringify(state);
    if (key === this.lastPresence) return;
    this.lastPresence = key;
    this.ctx.live?.setPresence?.(this.topic, state);
  }

  leavePresence() {
    if (!this.topic) return;
    try { this.ctx.live?.setPresence?.(this.topic, null); this.ctx.live?.unsubscribe?.([this.topic]); } catch { /* closed */ }
    this.topic = null;
    this.topicReady = false;
    this.lastPresence = null;
  }

  onPresence({ topic, users }) {
    if (topic !== this.topic) return;
    const myClient = this.api?.clientId ?? CLIENT_ID;
    this.presence = (users ?? []).filter((u) => u.clientId !== myClient && u.state);
    this.renderSoon();
  }

  /** Is the event about the shown issue? */
  concerns(event) {
    const id = this.issueId;
    if (!id || !event) return false;
    if ((event.topics ?? []).includes(`issue:${id}`)) return true;
    const d = event.data ?? {};
    return event.id === id || d.id === id || d.issueId === id || d.sourceId === id || d.targetId === id || d.parentId === id;
  }

  onLive(event) {
    if (!this.host || !this.issueId || this.state === 'demo') return;
    const type = String(event?.type ?? '');
    if (/^(field|version|component|status|issueType|workflow|transition|member|project)\./.test(type) && this.issue && (event.topics ?? []).includes(`project:${this.issue.projectId}`)) {
      this.configs.delete(this.issue.projectId);
      this.debouncedConfig();
      // a project key rename re-keys the shown issue too
      if (type === 'project.updated' && event.data?.oldKey) this.debouncedRefresh();
      return;
    }
    if (!this.concerns(event)) return;
    const by = this.users.get(event.by);
    if (type === 'issue.deleted' && (event.id === this.issueId || event.data?.id === this.issueId)) {
      this.state = 'missing';
      this.missingBy = by ? userName(this.users, event.by) : null;
      closePicker();
      this.render();
      return;
    }
    const part = type.split('.')[0];
    this.pendingParts ??= new Set();
    if (part === 'comment') this.pendingParts.add('comments');
    if (part === 'attachment') this.pendingParts.add('attachments');
    if (part === 'worklog') this.pendingParts.add('worklogs');
    if (this.history) this.pendingParts.add('history');
    if (by) this.remoteNote = t('detail.remote.changed', { name: userName(this.users, event.by) });
    this.debouncedRefresh();
  }

  debouncedRefresh = debounce(() => {
    const parts = [...(this.pendingParts ?? [])].filter((p) => p !== 'worklogs' || this.worklogs);
    this.pendingParts = new Set();
    this.reload({ quiet: true, parts });
  }, 120);

  debouncedConfig = debounce(async () => {
    if (!this.issue) return;
    try { this.cfg = await this.config(this.issue.projectId, { force: true }); this.render(); } catch { /* next time */ }
  }, 200);

  // ───────────────────────── rendering

  renderSoon() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => { this.renderQueued = false; this.render(); });
  }

  render() {
    const host = this.host;
    if (!host) return;
    this.language = getLanguage();
    // Keep what the user is doing: the focused box, its caret and the scroll position.
    const active = document.activeElement;
    const focusKey = host.contains(active) ? active.dataset?.draft ?? (active.dataset?.act ? `act:${active.dataset.act}:${active.dataset.field ?? active.dataset.id ?? ''}` : null) : null;
    const caret = focusKey && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
    const scroll = host.scrollTop;
    const areaScroll = active?.tagName === 'TEXTAREA' ? active.scrollTop : 0;
    host.innerHTML = this.html();
    host.scrollTop = scroll;
    if (focusKey) {
      const el = focusKey.startsWith('act:')
        ? host.querySelector(`[data-act="${CSS.escape(focusKey.split(':')[1])}"]${focusKey.split(':')[2] ? `[data-field="${CSS.escape(focusKey.split(':')[2])}"], [data-act="${CSS.escape(focusKey.split(':')[1])}"][data-id="${CSS.escape(focusKey.split(':')[2])}"]` : ''}`)
        : host.querySelector(`[data-draft="${CSS.escape(focusKey)}"]`);
      if (el) {
        el.focus({ preventScroll: true });
        if (caret && 'setSelectionRange' in el) { try { el.setSelectionRange(caret[0], caret[1]); } catch { /* not a text box */ } }
        if (areaScroll) el.scrollTop = areaScroll;
      }
    }
    reanchorPicker(host);
    this.sendPresence();
  }

  html() {
    switch (this.state) {
      case 'empty': return `<div class="detail-empty dt-empty">${icon('notes', 'icon big')}<p>${esc(t('detail.none'))}</p><small class="muted">${esc(t('detail.hint'))}</small></div>`;
      case 'demo': return `<div class="detail-empty dt-empty">${icon('notes', 'icon big')}<p>${esc(t('detail.loading', { id: this.issueId }))}</p><small class="muted">${esc(t('detail.demo'))}</small>${this.closeButton()}</div>`;
      case 'loading': return `<div class="dt-root dt-loading" aria-busy="true"><div class="dt-skel h"></div><div class="dt-skel"></div><div class="dt-skel"></div><div class="dt-skel short"></div><p class="muted">${icon('refresh')}${esc(t('detail.loadingIssue', { id: this.issueId }))}</p></div>`;
      case 'missing': return `<div class="detail-empty dt-empty dt-missing">${icon('warning', 'icon big')}<p>${esc(this.missingBy ? t('detail.deletedBy', { name: this.missingBy }) : t('detail.notFound', { id: this.server?.key ?? this.issueId }))}</p><small class="muted">${esc(t('detail.notFoundHint'))}</small>${this.closeButton()}</div>`;
      case 'error': return `<div class="detail-empty dt-empty">${icon('error', 'icon big')}<p>${esc(t('detail.loadFailed'))}</p><small class="muted">${esc(this.loadError ?? '')}</small><div class="dt-inline-actions"><button type="button" class="button small" data-act="retry">${icon('refresh')}<span>${esc(t('detail.retry'))}</span></button>${this.closeButton(false)}</div></div>`;
      default: break;
    }
    const v = this;
    const main = [descriptionHtml(v), checklistHtml(v), subtasksHtml(v), linksHtml(v), attachmentsHtml(v), activityHtml(v)].join('');
    return `<div class="dt-root${this.readOnly ? ' readonly' : ''}" data-issue="${esc(this.issue.id)}" data-key="${esc(this.issue.key)}" data-rev="${this.issue.rev}" lang="${esc(getLanguage())}">
      ${headerHtml(v)}
      ${statusRowHtml(v)}
      ${bannersHtml(v)}
      ${sectionBarHtml(v)}
      <div class="dt-columns"><div class="dt-main">${main}</div><aside class="dt-side">${fieldsHtml(v)}</aside></div>
      ${previewHtml(v)}
      <input type="file" class="dt-file" hidden multiple />
    </div>`;
  }

  closeButton(wrap = true) {
    const b = `<button type="button" class="button small" data-act="close">${icon('close')}<span>${esc(t('detail.close'))}</span></button>`;
    return wrap ? `<div class="dt-inline-actions">${b}</div>` : b;
  }

  // ───────────────────────── lookups used by the renderers

  typeOf(id) { return this.cfg?.types?.find((x) => x.id === id) ?? null; }
  statusOf(id) { return this.cfg?.statuses?.find((x) => x.id === id) ?? null; }
  fieldLabel(field) {
    if (!field) return '';
    if (String(field).startsWith('custom:')) return this.cfg?.fields?.find((f) => f.id === field.slice(7))?.name ?? t('detail.field.custom');
    const key = `detail.field.${HISTORY_FIELD[field] ?? field}`;
    const text = t(key);
    return text === key ? field : text;
  }
  attachmentUrl(id, inline) {
    const token = this.api.token;
    const q = [inline ? 'inline=1' : '', token ? `token=${encodeURIComponent(token)}` : ''].filter(Boolean).join('&');
    return this.api.url(`/attachments/${encodeURIComponent(id)}${q ? `?${q}` : ''}`);
  }
  mdOptions() { return { users: this.users, attachmentUrl: (id) => this.attachmentUrl(id, true) }; }
  isWide() { return Boolean(this.ctx.settings?.rightWidth >= 600); }

  // ───────────────────────── saving

  /** The issue's value of a field name (API_FIELD key or 'custom:<id>'). */
  valueOf(field, issue = this.issue) {
    if (!issue) return null;
    if (field.startsWith('custom:')) return issue.custom?.[field.slice(7)] ?? null;
    const prop = API_FIELD[field];
    const value = issue[prop];
    return Array.isArray(value) ? [...value] : value ?? null;
  }

  patchFor(field, value) {
    if (field.startsWith('custom:')) return { custom: { [field.slice(7)]: value } };
    return { [API_FIELD[field]]: value };
  }

  applyLocal(field, value) {
    if (field.startsWith('custom:')) { this.issue.custom = { ...(this.issue.custom ?? {}), [field.slice(7)]: value }; return; }
    this.issue[API_FIELD[field]] = value;
  }

  /**
   * Sets a field: shown at once, PATCHed with rev, recorded for Undo. `base`: the value the edit started
   * from (editors), used to tell a real conflict from a change of other fields.
   */
  async setField(field, value, { record = true, base, label } = {}) {
    if (!this.issue || this.readOnly) return false;
    const old = this.valueOf(field, this.server);
    if (sameValue(this.valueOf(field), value) && sameValue(old, value)) return true;
    const id = this.issueId;
    this.applyLocal(field, value);
    this.render();
    const ok = await this.save(this.patchFor(field, value), { fields: [field], base: { [field]: base !== undefined ? base : old }, rev: this.editBase.get(field)?.rev });
    if (ok && record && this.ctx.history) {
      const name = label ?? this.fieldLabel(field);
      this.ctx.history.record({
        label: t('detail.undo.field', { field: name }),
        undo: () => this.remote(id, field, old),
        redo: () => this.remote(id, field, value),
      });
    }
    return ok;
  }

  /** Undo / Redo: sets a field of an issue that may not be shown any more. */
  async remote(id, field, value) {
    // The newest rev: automation may have changed the issue after my own change (those events carry my client id).
    const rev = (await this.api.issue(id)).rev;
    const out = await this.api.updateIssue(id, { ...this.patchFor(field, value), rev });
    if (this.issueId === id) { this.setServer(out, { tell: true }); this.render(); this.loadParts(this.history ? ['history'] : []); this.loadTransitions(); } else this.tellWorkspace('issue.updated', out);
    return out;
  }

  /** PATCH with rev. On 409: retried on the new rev when only other fields changed (merge), else the conflict banner. */
  async save(patch, { fields = [], base = {}, rev } = {}) {
    const id = this.issueId;
    this.saving = true;
    return this.track((async () => {
      try {
        const out = await this.api.updateIssue(id, { ...patch, rev: rev ?? this.server.rev });
        if (this.issueId !== id) return true;
        this.afterSave(out, fields);
        return true;
      } catch (error) {
        if (this.issueId !== id) return false;
        if (error?.status === 409 && error.details?.current) return await this.onConflict(patch, fields, base, error.details.current);
        this.issue = clone(this.server);
        this.fail(error);
        return false;
      } finally {
        this.saving = false;
        if (this.issueId === id) this.render();
      }
    })());
  }

  afterSave(out, fields) {
    for (const f of fields) { this.editBase.delete(f); }
    this.setServer(out, { tell: true });
    if (this.history) this.loadParts(['history']);
    if (fields.some((f) => f === 'status' || f === 'type' || f === 'assignee' || f === 'parent')) this.loadTransitions();
    this.notice = null;
  }

  async onConflict(patch, fields, base, current) {
    const changes = [];
    for (const f of [...COMPARED, ...Object.keys(current.custom ?? {}).map((k) => `custom:${k}`)]) {
      if (!sameValue(this.valueOf(f, this.server), this.valueOf(f, current))) changes.push(f);
    }
    for (const f of fields) if (!changes.includes(f) && !sameValue(base[f], this.valueOf(f, current))) changes.push(f);
    const clash = fields.filter((f) => !sameValue(base[f], this.valueOf(f, current)));
    if (!clash.length) {
      // Someone changed other fields: mine still applies on top of theirs.
      try {
        const out = await this.api.updateIssue(this.issueId, { ...patch, rev: current.rev });
        this.afterSave(out, fields);
        this.remoteNote = t('detail.conflict.merged', { fields: changes.filter((f) => !fields.includes(f)).map((f) => this.fieldLabel(f)).join(', ') || t('detail.conflict.otherFields') });
        return true;
      } catch (error) {
        if (error?.status !== 409) { this.issue = clone(this.server); this.fail(error); return false; }
        current = error.details?.current ?? current;
      }
    }
    let by = [];
    try {
      const hist = await this.api.issuePart(this.issueId, 'history');
      const since = Number(this.server?.updatedAt ?? 0);
      by = [...new Set((Array.isArray(hist) ? hist : []).filter((h) => Number(h.at) >= since && h.userId !== this.me?.id).map((h) => h.userName ?? userName(this.users, h.userId)).filter(Boolean))];
    } catch { /* names are optional */ }
    this.conflict = {
      patch, fields, base, current, by,
      changes: changes.map((f) => ({ field: f, mine: fields.includes(f), theirs: this.describe(f, current) })),
    };
    // The shown issue becomes theirs, with my unsaved values on top (editors keep their text).
    const mine = clone(this.issue);
    this.setServer(current);
    for (const f of fields) this.applyLocal(f, this.valueOf(f, mine));
    return false;
  }

  /** A short text of a field's value (conflict report). */
  describe(field, issue) {
    const value = this.valueOf(field, issue);
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) return t('detail.noneValue');
    switch (field) {
      case 'assignee': case 'reporter': return userName(this.users, value);
      case 'status': return this.statusOf(value)?.name ?? value;
      case 'type': return this.typeOf(value)?.name ?? value;
      case 'priority': return this.cfg.priorities.find((p) => p.id === value)?.name ?? value;
      case 'description': return String(value).length > 120 ? `${String(value).slice(0, 117)}…` : value;
      case 'originalEstimate': case 'remainingEstimate': return fmtDuration(value);
      case 'components': return value.map((x) => this.cfg.components.find((c) => c.id === x)?.name ?? x).join(', ');
      case 'fixVersions': case 'affectedVersions': return value.map((x) => this.cfg.versions.find((c) => c.id === x)?.name ?? x).join(', ');
      case 'epic': return issue.epic?.key ?? value;
      case 'parent': return issue.parent?.key ?? value;
      case 'cover': return value.color ?? t('detail.cover.image');
      case 'flagged': return value ? t('detail.yes') : t('detail.no');
      default: return Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
  }

  async resolveConflict(keepMine) {
    const c = this.conflict;
    if (!c) return;
    this.conflict = null;
    if (!keepMine) {
      for (const f of c.fields) { this.editBase.delete(f); if (f === 'summary') { this.editing.delete('summary'); this.drafts.delete('summary'); } }
      this.issue = clone(this.server);
      this.notice = { kind: 'info', text: t('detail.conflict.tookTheirs') };
      this.render();
      return;
    }
    for (const f of c.fields) this.editBase.delete(f);
    const ok = await this.save(c.patch, { fields: c.fields, base: Object.fromEntries(c.fields.map((f) => [f, this.valueOf(f, this.server)])), rev: this.server.rev });
    if (ok) {
      if (c.fields.includes('description')) { this.editing.delete('desc'); this.drafts.delete('desc'); }
      if (c.fields.includes('summary')) { this.editing.delete('summary'); this.drafts.delete('summary'); }
      this.render();
    }
  }

  fail(error) {
    this.notice = { kind: 'error', text: errorText(error) };
    this.ctx.notify?.('error', `${t('detail.err.title')}: ${errorText(error)}`);
    this.render();
  }

  /** Runs a part request (comment, checklist …), then refreshes the issue (its rev moved). */
  async act(task, { parts = [], issue = true, errorTarget = null } = {}) {
    const id = this.issueId;
    return this.track((async () => {
      try {
        const out = await task();
        if (this.issueId !== id) return out;
        if (issue) this.setServer(await this.api.issue(id), { tell: true });
        this.notice = null;
        this.render();
        if (parts.length || this.history) await this.loadParts([...parts, ...(this.history ? ['history'] : [])]);
        return out;
      } catch (error) {
        if (this.issueId !== id) return null;
        if (errorTarget) { this[errorTarget] = errorText(error); this.render(); } else this.fail(error);
        if (issue) { try { this.setServer(await this.api.issue(id)); this.render(); } catch { /* gone */ } }
        return null;
      }
    })());
  }

  // ───────────────────────── events

  onClick(event) {
    if (event.target.closest('[data-stop]') && !event.target.closest('[data-act]')) return;
    const el = event.target.closest('[data-act]');
    if (!el || !this.host.contains(el)) return;
    const act = el.dataset.act;
    const fieldRow = el.closest('.dt-field');
    if (fieldRow?.dataset.field) this.keepShown.add(fieldRow.dataset.field);
    if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'date')) return; // change event
    if (act === 'att-download') return; // the link downloads
    if (el.tagName === 'A' && !act) return;
    event.preventDefault();
    const handler = this.actions[act];
    if (handler) handler.call(this, el, event);
  }

  onInput(event) {
    const el = event.target;
    if (el.dataset?.draft) {
      this.drafts.set(el.dataset.draft, el.value);
      if (el.tagName === 'TEXTAREA' && el.classList.contains('dt-ed-text')) mentionInput(this, el);
    }
  }

  onChange(event) {
    const el = event.target;
    const act = el.dataset?.act;
    if (act === 'date') {
      const field = el.dataset.field;
      if (el.value && !/^\d{4}-\d{2}-\d{2}$/.test(el.value)) return;
      this.setField(field, el.value || null);
    } else if (act === 'custom-check') this.setField(el.dataset.field, el.checked);
    else if (act === 'cl-toggle') this.toggleChecklist(el.dataset.id, el.checked);
  }

  onStep(key, value, el) {
    if (this.readOnly || !this.issue) return;
    this.keepShown.add(key);
    // Steps arrive one by one while a button is held: saved once the value rests.
    clearTimeout(this.stepTimer);
    const typed = el.querySelector('.stepper-value');
    const empty = typed && !String(typed.value).trim();
    this.stepTimer = setTimeout(() => {
      if (key === 'storyPoints') this.setField('storyPoints', empty ? null : value);
      else if (key === 'originalEstimate' || key === 'remainingEstimate') this.setField(key, empty ? null : Math.round(value * 3600));
      else if (key.startsWith('custom:')) this.setField(key, empty ? null : value);
    }, document.activeElement === typed ? 0 : 450);
  }

  /** The section bar's active chip follows the scroll (no re-render). */
  onScroll() {
    if (this.scrollQueued || !this.host) return;
    this.scrollQueued = true;
    requestAnimationFrame(() => {
      this.scrollQueued = false;
      const host = this.host;
      const bar = host?.querySelector('.dt-secbar');
      if (!bar) return;
      const line = bar.getBoundingClientRect().bottom + 8;
      let current = null;
      for (const sec of host.querySelectorAll('.dt-section[data-section]')) if (sec.getBoundingClientRect().top <= line) current = sec.dataset.section;
      if (host.scrollTop < 4) current = null;
      if (current === this.activeSection) return;
      this.activeSection = current;
      for (const chip of bar.querySelectorAll('.dt-sb-chip')) chip.classList.toggle('active', chip.dataset.jump === current);
    });
  }

  /** Scrolls a section to just under the sticky section bar, opening it, and flashes it. */
  jumpTo(id) {
    if (this.collapsed.has(id)) { this.collapsed.delete(id); this.persist(); this.render(); }
    const host = this.host;
    const sec = host?.querySelector(`.dt-section[data-section="${CSS.escape(id)}"]`);
    if (!sec) return;
    const bar = host.querySelector('.dt-secbar');
    const top = sec.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop - (bar?.offsetHeight ?? 0) - 6;
    host.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
    this.activeSection = id;
    for (const chip of host.querySelectorAll('.dt-sb-chip')) chip.classList.toggle('active', chip.dataset.jump === id);
    sec.classList.remove('dt-flash'); void sec.offsetWidth; sec.classList.add('dt-flash');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => sec.classList.remove('dt-flash'), 1300);
    sec.querySelector('.dt-section-toggle')?.focus({ preventScroll: true });
  }

  onFocus(event) {
    if (event.target.dataset?.draft) this.sendPresence();
  }

  onKey(event) {
    const el = event.target;
    if (event.key === 'Escape') {
      if (pickerOpen()) return;
      if (this.preview) { event.preventDefault(); this.preview = null; this.render(); return; }
      if (this.cancelEditing(el)) { event.preventDefault(); event.stopPropagation(); return; }
      if (this.statusForm) { event.preventDefault(); this.statusForm = null; this.render(); return; }
      if (this.linkForm) { event.preventDefault(); this.linkForm = null; this.render(); return; }
      event.preventDefault();
      this.closePanel();
      return;
    }
    if (event.key === 'Enter' && el.dataset?.enter && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.actions[el.dataset.enter]?.call(this, el, event);
      return;
    }
    if (event.key === 'Enter' && el.classList?.contains('dt-summary-input') && !event.shiftKey && !event.isComposing) { event.preventDefault(); this.actions['summary-save'].call(this, el); return; }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && el.closest?.('.dt-editor')) { event.preventDefault(); this.actions['ed-save'].call(this, el.closest('.dt-editor').querySelector('[data-act="ed-save"]')); return; }
    if (event.key === 'Enter' && el.dataset?.draft?.startsWith('custom:') && el.tagName === 'INPUT') { event.preventDefault(); this.actions['field-save'].call(this, { dataset: { field: el.dataset.draft } }); return; }
    if (event.key === 'Enter' && el.classList?.contains('dt-cl-input')) { event.preventDefault(); this.saveChecklistText(el.dataset.draft.slice(3)); return; }
    if ((event.key === 'Enter' || event.key === ' ') && el.matches?.('[data-act][tabindex]:not(button):not(input)')) { event.preventDefault(); this.actions[el.dataset.act]?.call(this, el, event); return; }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && el.closest?.('[data-cl]')) {
      event.preventDefault();
      this.moveChecklistBy(el.closest('[data-cl]').dataset.cl, event.key === 'ArrowUp' ? -1 : 1);
    }
  }

  /** e / m / i / . while an issue is shown and nothing is typed into. */
  onGlobalKey(event) {
    if (!this.host || this.state !== 'ready' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const inPanel = this.host.contains(target);
    if (!inPanel && target !== document.body && target !== document.documentElement) return;
    if (document.querySelector('.web-popup:not([hidden])') && !inPanel) return;
    const key = event.key;
    const run = { e: 'summary-edit', m: 'comment-new', i: 'assign-me', '.': 'menu' }[key];
    if (!run || (this.readOnly && run !== 'menu')) return;
    event.preventDefault();
    event.stopPropagation();
    const anchor = run === 'menu' ? this.host.querySelector('[data-act="menu"]') : null;
    this.actions[run].call(this, anchor);
  }

  /** Esc inside an editor: that editor closes (its text is dropped). */
  cancelEditing(el) {
    const editor = el.closest?.('.dt-editor');
    if (editor) { this.closeEditor(editor.dataset.editor); return true; }
    if (el.classList?.contains('dt-summary-input')) { this.editing.delete('summary'); this.drafts.delete('summary'); this.render(); this.focusAct('summary-edit'); return true; }
    const draft = el.dataset?.draft;
    if (draft?.startsWith('custom:')) { this.editing.delete(draft); this.drafts.delete(draft); this.render(); return true; }
    if (draft?.startsWith('cl:') && draft !== 'cl:new') { this.editing.delete(draft); this.drafts.delete(draft); this.render(); return true; }
    if (draft?.startsWith('wl:') && this.editing.size) { const id = draft.split(':')[1]; if (this.editing.has(`wl:${id}`)) { this.editing.delete(`wl:${id}`); this.render(); return true; } }
    if (draft && el.value) { el.blur(); return true; }
    const open = [...this.editing].at(-1);
    if (open) { this.closeEditor(open === 'desc' ? 'desc' : open); return true; }
    return false;
  }

  closeEditor(key) {
    this.editing.delete(key);
    this.drafts.delete(key);
    this.previews.delete(key);
    if (key === 'desc') this.editBase.delete('description');
    this.render();
    if (key === 'desc') this.focusAct('desc-edit');
  }

  focusAct(act) { requestAnimationFrame(() => this.host?.querySelector(`[data-act="${act}"]`)?.focus({ preventScroll: true })); }

  closePanel() {
    closePicker();
    this.leavePresence();
    const app = this.ctx.app;
    if (app?.state) app.state.selectedIssue = null;
    this.show(null);
  }

  // ───────────────────────── paste / drop / files

  onPaste(event) {
    if (this.readOnly || this.state !== 'ready') return;
    const files = [...(event.clipboardData?.files ?? [])];
    if (!files.length) return;
    event.preventDefault();
    const area = event.target.closest?.('textarea.dt-ed-text');
    if (area) insertUploads(this, area.dataset.draft, files).catch((e) => this.fail(e));
    else this.uploadFiles(files).catch((e) => this.fail(e));
  }

  onDrag(event) {
    if (this.readOnly || this.state !== 'ready') return;
    if (![...(event.dataTransfer?.types ?? [])].includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    const zone = event.target.closest?.('.dt-dropzone, textarea.dt-ed-text') ?? this.host.querySelector('.dt-root');
    if (event.type === 'dragenter' || event.type === 'dragover') { zone?.classList.add('drag-over'); return; }
    this.host.querySelectorAll('.drag-over').forEach((x) => x.classList.remove('drag-over'));
    if (event.type !== 'drop') return;
    const files = [...(event.dataTransfer?.files ?? [])];
    if (!files.length) return;
    const area = event.target.closest?.('textarea.dt-ed-text');
    if (area) insertUploads(this, area.dataset.draft, files).catch((e) => this.fail(e));
    else this.uploadFiles(files).catch((e) => this.fail(e));
  }

  chooseFiles({ accept = '', multiple = true } = {}) {
    return new Promise((resolve) => {
      const input = this.host.querySelector('.dt-file');
      if (!input) { resolve([]); return; }
      input.accept = accept;
      input.multiple = multiple;
      input.value = '';
      input.onchange = () => resolve([...(input.files ?? [])]);
      input.click();
    });
  }

  /** Uploads files as attachments → their rows. Files over the limit are refused before sending. */
  async uploadFiles(files) {
    const id = this.issueId;
    const out = [];
    const tooBig = files.filter((f) => f.size > MAX_ATTACHMENT);
    if (tooBig.length) { this.notice = { kind: 'error', text: t('detail.err.file_too_large_named', { names: tooBig.map((f) => f.name).join(', ') }) }; this.render(); }
    const ok = files.filter((f) => f.size <= MAX_ATTACHMENT);
    if (!ok.length) return out;
    this.uploading = ok.length;
    this.render();
    await this.track((async () => {
      try {
        for (const file of ok) {
          const name = file.name || `pasted-${Date.now()}.${(file.type.split('/')[1] ?? 'bin').replace(/[^a-z0-9]/gi, '')}`;
          const row = await this.api.request('POST', `/issues/${encodeURIComponent(id)}/attachments`, { body: file, headers: { 'X-File-Name': encodeURIComponent(name), 'Content-Type': file.type || 'application/octet-stream' } });
          out.push(row);
          this.uploading -= 1;
        }
      } catch (error) {
        this.fail(error);
      } finally {
        this.uploading = 0;
        if (this.issueId === id) {
          try { this.setServer(await this.api.issue(id), { tell: true }); } catch { /* gone */ }
          await this.loadParts(['attachments', ...(this.history ? ['history'] : [])]);
        }
      }
    })());
    return out;
  }

  // ───────────────────────── checklist

  async toggleChecklist(itemId, done) {
    const item = this.issue.checklist.find((x) => x.id === itemId);
    if (!item) return;
    item.done = done;
    this.render();
    const ok = await this.act(() => this.api.patch(`/checklist/${encodeURIComponent(itemId)}`, { done }));
    if (ok && this.ctx.history) {
      const id = this.issueId;
      this.ctx.history.record({ label: t('detail.undo.checklist'), undo: () => this.remotePart(id, `/checklist/${itemId}`, { done: !done }), redo: () => this.remotePart(id, `/checklist/${itemId}`, { done }) });
    }
  }

  async remotePart(id, path, body) {
    const out = await this.api.patch(path, body);
    if (this.issueId === id) this.reload({ quiet: true });
    return out;
  }

  async saveChecklistText(itemId) {
    const key = `cl:${itemId}`;
    const text = (this.drafts.get(key) ?? '').trim();
    this.editing.delete(key);
    this.drafts.delete(key);
    const item = this.issue.checklist.find((x) => x.id === itemId);
    if (!item || !text || text === item.text) { this.render(); return; }
    item.text = text;
    this.render();
    await this.act(() => this.api.patch(`/checklist/${encodeURIComponent(itemId)}`, { text }));
  }

  /** Moves a checklist item to sit between afterId and beforeId (drag, Alt+↑/↓). */
  async moveChecklist(itemId, afterId, beforeId) {
    const list = this.issue.checklist;
    const from = list.findIndex((x) => x.id === itemId);
    if (from < 0) return null;
    const [item] = list.splice(from, 1);
    const at = beforeId ? list.findIndex((x) => x.id === beforeId) : afterId ? list.findIndex((x) => x.id === afterId) + 1 : list.length;
    list.splice(at < 0 ? list.length : at, 0, item);
    this.render();
    return this.act(() => this.api.patch(`/checklist/${encodeURIComponent(itemId)}`, { afterId: afterId ?? null, beforeId: beforeId ?? null }), { issue: true });
  }

  moveChecklistBy(itemId, delta) {
    const list = this.issue.checklist;
    const i = list.findIndex((x) => x.id === itemId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    const ids = list.map((x) => x.id).filter((x) => x !== itemId);
    const pos = delta < 0 ? j : j;
    this.moveChecklist(itemId, ids[pos - 1] ?? null, ids[pos] ?? null).then(() => requestAnimationFrame(() => this.host?.querySelector(`[data-cl="${CSS.escape(itemId)}"] .dt-grip`)?.focus()));
  }

  onPointerDown(event) {
    const grip = event.target.closest?.('[data-drag="checklist"]');
    if (!grip || event.button !== 0 || this.readOnly) return;
    event.preventDefault();
    const row = grip.closest('[data-cl]');
    const list = row.parentElement;
    const id = row.dataset.cl;
    row.classList.add('dragging');
    let target = null;
    const marker = document.createElement('li');
    marker.className = 'dt-drop-marker';
    const move = (e) => {
      const rows = [...list.querySelectorAll('[data-cl]')].filter((r) => r !== row);
      let before = null;
      for (const r of rows) { const rect = r.getBoundingClientRect(); if (e.clientY < rect.top + rect.height / 2) { before = r; break; } }
      target = { before: before?.dataset.cl ?? null, after: before ? rows[rows.indexOf(before) - 1]?.dataset.cl ?? null : rows.at(-1)?.dataset.cl ?? null };
      if (before) list.insertBefore(marker, before); else list.append(marker);
    };
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      marker.remove();
      row.classList.remove('dragging');
      if (!target) return;
      const ids = this.issue.checklist.map((x) => x.id);
      const i = ids.indexOf(id);
      const sameSpot = (target.before && ids[i + 1] === target.before) || (!target.before && i === ids.length - 1);
      if (!sameSpot) this.moveChecklist(id, target.after, target.before);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
  }

  // ───────────────────────── pickers

  async openFieldPicker(field, anchor) {
    const issue = this.issue;
    const cfg = this.cfg;
    const userItems = (noneLabel) => [{ value: '', label: noneLabel, icon: 'user' }, ...[...this.users.values()].filter((u) => u.active !== false && (this.memberIds().has(u.id) || u.id === this.valueOf(field))).map((u) => ({ value: u.id, label: u.displayName || u.username, hint: `@${u.username}`, iconHtml: avatarHtml(u, 18) }))];
    const single = (items, value, apply) => openPicker(anchor, { key: field, items, value: value ?? '', onPick: (x) => apply(x === '' ? null : x) });
    const multi = (items, value, { create } = {}) => {
      const before = this.valueOf(field) ?? [];
      const id = this.issueId;
      openPicker(anchor, {
        key: field, items, value: before, multi: true, create,
        onPick: (values) => { this.applyLocal(field, values); this.renderSoon(); },
        // The picker closes right after: onClose saves the toggles and the new value in one step.
        onCreate: (text) => { const now = this.valueOf(field) ?? []; const label = text.trim().replace(/\s+/g, '-'); if (!now.includes(label)) this.applyLocal(field, [...now, label]); },
        onClose: () => this.commitMulti(field, before, id),
      });
    };
    switch (field) {
      case 'assignee': return single(userItems(t('detail.unassigned')), issue.assigneeId, (x) => this.setField('assignee', x));
      case 'reporter': return single(userItems(t('detail.noneValue')), issue.reporterId, (x) => this.setField('reporter', x));
      case 'priority': return single(cfg.priorities.map((p) => ({ value: p.id, label: p.name, iconHtml: renderIconRef(p.icon, { size: 16 }) })), issue.priorityId, (x) => this.setField('priority', x));
      case 'type': {
        const level = Number(this.typeOf(issue.typeId)?.level ?? 0);
        const types = cfg.types.filter((x) => (level === 1 ? Number(x.level) === 1 : Number(x.level) !== 1));
        return single(types.map((x) => ({ value: x.id, label: x.name, iconHtml: renderIconRef(x.icon || 'b:task', { size: 16 }) })), issue.typeId, (x) => x && this.setField('type', x));
      }
      case 'labels': {
        const known = new Set(issue.labels ?? []);
        try { for (const it of await this.projectIssueList(cfg.project.key)) for (const l of it.labels ?? []) known.add(l); } catch { /* only the issue's own */ }
        return multi([...known].sort().map((l) => ({ value: l, label: l, icon: 'tag' })), issue.labels, { create: (text) => t('detail.label.create', { name: text.trim().replace(/\s+/g, '-') }) });
      }
      case 'components': return multi(cfg.components.map((c) => ({ value: c.id, label: c.name, hint: c.description ?? '', iconHtml: renderIconRef(c.icon || 'b:layers', { size: 16 }) })), issue.componentIds);
      case 'fixVersions': case 'affectedVersions':
        return multi(cfg.versions.filter((x) => !x.archived || (this.valueOf(field) ?? []).includes(x.id)).map((x) => ({ value: x.id, label: x.name, hint: x.released ? t('detail.released') : x.releaseDate ?? '', icon: x.released ? 'check' : 'tag' })), this.valueOf(field));
      case 'epic': case 'parent': {
        let items = [];
        try { items = await this.projectIssueList(cfg.project.key, { force: true }); } catch (error) { this.fail(error); return undefined; }
        const levelOf = (it) => Number(this.typeOf(it.typeId)?.level ?? 0);
        const list = items.filter((it) => it.id !== issue.id && (field === 'epic' ? levelOf(it) === -1 : levelOf(it) !== 1));
        return single([...(field === 'epic' ? [{ value: '', label: t('detail.noneValue'), icon: 'close' }] : []), ...list.map((it) => ({ value: it.id, label: `${it.key} ${it.summary}`, iconHtml: typeIcon(this, it.typeId, 16) }))], this.valueOf(field), (x) => this.setField(field, x));
      }
      case 'color': return single([{ value: '', label: t('detail.noneValue'), icon: 'close' }, ...COLORS.map((c) => ({ value: c, label: c, iconHtml: `<span class="dt-swatch" style="background:${c}"></span>` }))], issue.color, (x) => this.setField('color', x));
      case 'cover': {
        const images = (this.attachments ?? []).filter((a) => isImage(a.mime));
        const items = [{ value: '', label: t('detail.noneValue'), icon: 'close' }, { group: t('detail.cover.colors') }, ...COLORS.map((c) => ({ value: `color:${c}`, label: c, iconHtml: `<span class="dt-swatch" style="background:${c}"></span>` })),
          { group: t('detail.cover.images') }, ...images.map((a) => ({ value: `att:${a.id}`, label: a.fileName, iconHtml: `<img class="dt-pick-thumb" src="${esc(this.attachmentUrl(a.id, true))}" alt="" />` })), ...(this.readOnly ? [] : [{ value: 'upload', label: t('detail.cover.upload'), icon: 'paste' }])];
        const cur = issue.cover?.color ? `color:${issue.cover.color}` : issue.cover?.attachmentId ? `att:${issue.cover.attachmentId}` : '';
        return openPicker(anchor, { key: field, items, value: cur, search: false, onPick: (x) => this.pickCover(x) });
      }
      default: break;
    }
    if (field.startsWith('custom:')) {
      const f = cfg.fields.find((x) => x.id === field.slice(7));
      const options = (Array.isArray(f?.options) ? f.options : []).map((o) => ({ value: o.value, label: o.value, iconHtml: o.icon ? renderIconRef(o.icon, { size: 16 }) : icon('tag') }));
      if (f?.type === 'select') return single([{ value: '', label: t('detail.noneValue'), icon: 'close' }, ...options], this.valueOf(field), (x) => this.setField(field, x));
      if (f?.type === 'multiselect') return multi(options, this.valueOf(field));
      if (f?.type === 'labels') return multi((this.valueOf(field) ?? []).map((l) => ({ value: l, label: l, icon: 'tag' })), this.valueOf(field), { create: (text) => t('detail.label.create', { name: text.trim() }) });
      if (f?.type === 'user') return single(userItems(t('detail.noneValue')), this.valueOf(field), (x) => this.setField(field, x));
    }
    return undefined;
  }

  memberIds() { return new Set((this.cfg?.members ?? []).map((m) => m.userId ?? m.id)); }

  commitMulti(field, before, issueId = this.issueId) {
    if (!this.issue || this.issueId !== issueId || this.state !== 'ready') return;
    const now = this.valueOf(field) ?? [];
    if (sameValue(now, before)) { this.render(); return; }
    // The shown value is already new: save against the value it started from.
    this.applyLocal(field, before);
    this.setField(field, now, { base: before });
  }

  async pickCover(value) {
    if (value === 'upload') {
      const files = await this.chooseFiles({ accept: 'image/*', multiple: false });
      const [row] = await this.uploadFiles(files);
      if (row) this.setField('cover', { attachmentId: row.id });
      return;
    }
    if (!value) return this.setField('cover', null);
    if (value.startsWith('color:')) return this.setField('cover', { color: value.slice(6) });
    if (value.startsWith('att:')) return this.setField('cover', { attachmentId: value.slice(4) });
    return undefined;
  }

  // ───────────────────────── transitions

  async openStatus(anchor) {
    if (this.readOnly) return;
    if (!this.transitions) await this.loadTransitions();
    const list = this.transitions ?? [];
    const items = list.length
      ? list.map((tr) => {
        const target = this.statusOf(tr.toStatusId);
        const name = tr.name && tr.name !== target?.name ? `${tr.name} → ${target?.name ?? ''}` : target?.name ?? tr.name;
        return { value: tr.id, label: name, icon: target?.category === 'done' ? 'check' : target?.category === 'inprogress' ? 'play' : 'dot', disabled: !tr.available, hint: tr.available ? '' : errorText(tr.reason ?? { code: 'CONDITION' }) };
      })
      : [{ value: '', label: t('detail.status.noTransitions'), icon: 'info', disabled: true }];
    openPicker(anchor, { key: 'status', items, value: null, search: items.length > 8, onPick: (id) => this.startTransition(id) });
  }

  startTransition(transitionId) {
    const tr = (this.transitions ?? []).find((x) => x.id === transitionId);
    if (!tr) return;
    const target = this.statusOf(tr.toStatusId);
    const rules = tr.rules ?? {};
    const validators = Array.isArray(rules.validators) ? rules.validators : [];
    const needsResolution = target?.category === 'done';
    const needsComment = validators.some((x) => x.type === 'commentRequired');
    const fields = validators.filter((x) => x.type === 'fieldRequired' && x.field !== 'resolution' && this.isEmpty(x.field)).map((x) => x.field);
    if (!needsResolution && !needsComment && !fields.length) { this.applyTransition(tr, {}); return; }
    const presetRes = (rules.postFunctions ?? []).find((p) => p.type === 'setResolution');
    const resolutionId = presetRes?.resolutionId ?? this.cfg.resolutions.find((r) => presetRes?.resolution && r.name.toLowerCase() === String(presetRes.resolution).toLowerCase())?.id ?? this.issue.resolutionId ?? this.cfg.resolutions[0]?.id ?? null;
    this.statusForm = { transition: tr, needsResolution, needsComment, allowComment: true, fields, values: {}, resolutionId };
    this.render();
    requestAnimationFrame(() => this.host?.querySelector('.dt-transition-form [data-draft], .dt-transition-form .dt-fbtn')?.focus());
  }

  isEmpty(field) {
    const map = { assignee: 'assigneeId', storyPoints: 'storyPoints', dueDate: 'dueDate', description: 'description', priority: 'priorityId', originalEstimate: 'originalEstimate', labels: 'labels', components: 'componentIds', component: 'componentIds', fixVersions: 'fixVersionIds', fixVersion: 'fixVersionIds' };
    const value = map[field] ? this.issue[map[field]] : this.issue.custom?.[field];
    return value == null || value === '' || (Array.isArray(value) && !value.length);
  }

  async applyTransition(tr, { resolutionId, comment, fields } = {}) {
    const id = this.issueId;
    const fromStatus = this.server.statusId;
    const fromResolution = this.server.resolutionId;
    this.saving = true;
    this.render();
    await this.track((async () => {
      try {
        const out = await this.api.transition(id, { transitionId: tr.id, rev: this.server.rev, ...(resolutionId ? { resolutionId } : {}), ...(comment ? { comment } : {}), ...(fields && Object.keys(fields).length ? { fields } : {}) });
        if (this.issueId !== id) return;
        this.statusForm = null;
        this.drafts.delete('tf:comment');
        for (const key of [...this.drafts.keys()]) if (key.startsWith('tf:')) this.drafts.delete(key);
        this.setServer(out, { tell: true, type: 'issue.transitioned' });
        this.notice = null;
        this.ctx.history?.record({
          label: t('detail.undo.status', { name: this.statusOf(out.statusId)?.name ?? '' }),
          undo: () => this.remoteStatus(id, fromStatus, fromResolution),
          redo: () => this.remoteStatus(id, out.statusId, out.resolutionId),
        });
        await Promise.all([this.loadTransitions(), this.loadParts([...(comment ? ['comments'] : []), ...(this.history ? ['history'] : [])])]);
      } catch (error) {
        if (this.issueId !== id) return;
        if (error?.status === 409) { try { this.setServer(await this.api.issue(id)); } catch { /* */ } this.notice = { kind: 'error', text: t('detail.err.conflict_transition') }; this.loadTransitions(); }
        else if (this.statusForm) this.statusForm.error = errorText(error);
        else { this.notice = { kind: 'error', text: errorText(error) }; this.ctx.notify?.('error', errorText(error)); }
      } finally {
        this.saving = false;
        this.render();
      }
    })());
  }

  async remoteStatus(id, statusId, resolutionId) {
    const rev = (await this.api.issue(id)).rev;
    const out = await this.api.transition(id, { statusId, rev, ...(resolutionId ? { resolutionId } : {}) });
    if (this.issueId === id) { this.setServer(out, { tell: true, type: 'issue.transitioned' }); this.render(); this.loadTransitions(); if (this.history) this.loadParts(['history']); } else this.tellWorkspace('issue.transitioned', out);
    return out;
  }

  // ───────────────────────── the actions menu

  openMenu(anchor) {
    const issue = this.issue;
    const ro = this.readOnly;
    const items = [
      { value: 'watch', label: `${issue.watching ? t('detail.unwatch') : t('detail.watch')} (${issue.watcherCount ?? 0})`, icon: 'eye' },
      { value: 'vote', label: `${issue.voted ? t('detail.unvote') : t('detail.vote')} (${issue.voteCount ?? 0})`, icon: 'star', disabled: issue.reporterId === this.me?.id && !issue.voted },
      { value: 'flag', label: issue.flagged ? t('detail.unflag') : t('detail.flag'), icon: 'flag', disabled: ro },
      { value: 'icon', label: t('detail.setIcon'), icon: 'iconInsert', disabled: ro },
      { value: 'copy-link', label: t('detail.copyLink'), icon: 'hyperlink' },
      { value: 'copy-key', label: t('detail.copyKey'), icon: 'copy' },
      { value: 'clone', label: t('detail.clone'), icon: 'duplicate', disabled: ro },
      { value: 'move-project', label: t('detail.moveProject'), icon: 'folderOpen', disabled: ro || Boolean(issue.parentId), hint: issue.parentId ? t('detail.move.subtaskHint') : '' },
      { value: 'wide', label: this.isWide() ? t('detail.narrow') : t('detail.wide'), icon: 'fullscreen' },
      { value: 'refresh', label: t('detail.refresh'), icon: 'refresh' },
      { value: 'delete', label: t('detail.delete'), icon: 'trash', danger: true, disabled: ro },
      { value: 'close', label: t('detail.close'), icon: 'close' },
    ];
    openPicker(anchor ?? this.host.querySelector('[data-act="menu"]'), {
      key: 'menu', items, value: null, search: false,
      onPick: (x) => {
        const map = { watch: 'watch', vote: 'vote', flag: 'flag', icon: 'pick-icon', 'copy-link': 'copy-link', 'copy-key': 'copy-key', clone: 'clone', 'move-project': 'move-project', wide: 'wide', refresh: 'retry', delete: 'delete', close: 'close' };
        this.actions[map[x]]?.call(this, this.host.querySelector('[data-act="menu"]'));
      },
    });
  }

  async copy(text) {
    try { await navigator.clipboard.writeText(text); this.ctx.notify?.('success', t('detail.copied', { text })); } catch { this.ctx.notify?.('info', text); }
  }

  issueLink() {
    const url = new URL(globalThis.location?.href ?? 'http://localhost/');
    url.search = '';
    url.hash = `issue=${this.issue.key}`;
    return url.toString();
  }

  // ───────────────────────── the actions (data-act)

  actions = {
    retry() {
      if (!this.issueId) return;
      if (this.state === 'ready') { this.configs.clear(); this.reload({ quiet: false }); return; }
      this.state = 'loading';
      this.render();
      this.track(this.load(this.issueId));
    },
    close() { this.closePanel(); },
    open(el) { const id = el.dataset.id; if (id) this.ctx.openIssue(id); },
    'toggle-group'(el) { const id = `group:${el.dataset.group}`; if (this.collapsed.has(id)) this.collapsed.delete(id); else this.collapsed.add(id); this.persist(); this.render(); },
    'toggle-empty'() { this.showEmpty = !this.showEmpty; this.persist(); this.render(); },
    jump(el) { this.jumpTo(el.dataset.jump); },
    'date-open'(el) {
      const input = el.parentElement?.querySelector('input[type="date"]');
      if (!input || input.disabled) return;
      try { input.showPicker(); } catch { input.focus(); }
    },
    'log-work'() {
      this.collapsed.delete('activity');
      this.actions.tab.call(this, { dataset: { tab: 'worklog' } });
      this.jumpTo('activity');
      requestAnimationFrame(() => this.host?.querySelector('[data-draft="wl:time"]')?.focus({ preventScroll: true }));
    },
    'toggle-section'(el) { const id = el.dataset.section; if (this.collapsed.has(id)) this.collapsed.delete(id); else this.collapsed.add(id); this.persist(); this.render(); },
    'dismiss-note'() { this.remoteNote = null; this.render(); },
    'dismiss-notice'() { this.notice = null; this.render(); },
    'copy-link'() { this.copy(this.issueLink()); },
    'copy-key'() { this.copy(this.issue.key); },
    wide() {
      const settings = this.ctx.settings ?? {};
      const wide = this.isWide();
      if (!wide) this.normalWidth = settings.rightWidth;
      const max = Math.max(300, Math.min(800, Math.round((globalThis.innerWidth || 1200) * 0.62)));
      const width = wide ? Math.min(this.normalWidth && this.normalWidth < 600 ? this.normalWidth : 380, 599) : Math.max(600, Math.min(760, max));
      this.ctx.app?.updateSettings?.({ rightWidth: width });
      this.ctx.settings = { ...settings, rightWidth: width };
      this.render();
    },
    menu(el) { this.openMenu(el); },
    async watch() {
      const watching = this.issue.watching;
      await this.act(() => (watching ? this.api.del(`/issues/${encodeURIComponent(this.issueId)}/watchers`) : this.api.post(`/issues/${encodeURIComponent(this.issueId)}/watchers`, {})));
      this.ctx.notify?.('info', watching ? t('detail.unwatched') : t('detail.watched'));
    },
    async vote() {
      const voted = this.issue.voted;
      await this.act(() => (voted ? this.api.del(`/issues/${encodeURIComponent(this.issueId)}/votes`) : this.api.post(`/issues/${encodeURIComponent(this.issueId)}/votes`, {})));
    },
    flag() { this.setField('flagged', !this.issue.flagged, { label: t('detail.flagged') }); },
    async clone() {
      const out = await this.act(() => this.api.post(`/issues/${encodeURIComponent(this.issueId)}/clone`, {}), { issue: false });
      if (out?.id) { this.tellWorkspace('issue.created', out); this.ctx.notify?.('success', t('detail.cloned', { key: out.key })); this.ctx.openIssue(out.id); }
    },
    'move-project'() { return openMoveForm(this); },
    async delete() {
      const issue = this.issue;
      const subs = issue.subtasks?.length ?? 0;
      const choice = await this.ctx.app?.ask?.({
        kind: 'delete', icon: 'trash', title: t('detail.deleteTitle', { key: issue.key }),
        message: subs ? t('detail.deleteMessageSubs', { key: issue.key, n: subs }) : t('detail.deleteMessage', { key: issue.key }),
        buttons: [{ id: 'cancel', label: t('detail.cancel') }, { id: 'delete', label: t('detail.delete'), icon: 'trash', danger: true, primary: true }],
      });
      if (choice !== 'delete') return;
      const ok = await this.track(this.api.deleteIssue(this.issueId).then(() => true).catch((error) => { this.fail(error); return false; }));
      if (ok) { this.ctx.notify?.('success', t('detail.deleted', { key: issue.key })); this.tellWorkspace('issue.deleted', issue); this.closePanel(); }
    },
    'summary-edit'() {
      if (this.readOnly || this.state !== 'ready') return;
      this.editing.add('summary');
      this.editBase.set('summary', { rev: this.server.rev, value: this.server.summary });
      this.drafts.set('summary', this.drafts.get('summary') ?? this.issue.summary);
      this.render();
      const box = this.host.querySelector('.dt-summary-input');
      box?.focus(); box?.select();
    },
    async 'summary-save'() {
      const text = (this.drafts.get('summary') ?? '').replace(/\s+/g, ' ').trim();
      if (!text) { this.notice = { kind: 'error', text: t('detail.err.summary_required') }; this.render(); return; }
      const base = this.editBase.get('summary')?.value ?? this.server.summary;
      this.editing.delete('summary');
      const ok = await this.setField('summary', text, { base });
      if (ok) this.drafts.delete('summary'); else if (this.conflict) { this.editing.add('summary'); this.drafts.set('summary', text); this.render(); }
    },
    'summary-cancel'() { this.editing.delete('summary'); this.drafts.delete('summary'); this.editBase.delete('summary'); this.render(); },
    'desc-edit'() {
      if (this.readOnly || this.editing.has('desc')) return;
      this.editing.add('desc');
      this.editBase.set('description', { rev: this.server.rev, value: this.server.description ?? '' });
      if (!this.drafts.has('desc')) this.drafts.set('desc', this.issue.description ?? '');
      this.render();
      this.host.querySelector('textarea[data-draft="desc"]')?.focus();
    },
    'ed-write'(el) { this.previews.delete(el.dataset.key); this.render(); this.host.querySelector(`textarea[data-draft="${CSS.escape(el.dataset.key)}"]`)?.focus(); },
    'ed-preview'(el) { this.previews.add(el.dataset.key); this.render(); },
    'ed-fmt'(el) { Promise.resolve(formatAction(this, el.dataset.key, el.dataset.fmt)).catch((e) => this.fail(e)); },
    'ed-cancel'(el) { this.closeEditor(el.dataset.key); },
    async 'ed-save'(el) {
      const key = el.dataset.key;
      const text = this.drafts.get(key) ?? '';
      if (key === 'desc') {
        const base = this.editBase.get('description');
        const ok = await this.setField('description', text, { base: base?.value ?? this.server.description ?? '' });
        if (ok) { this.editing.delete('desc'); this.drafts.delete('desc'); this.previews.delete('desc'); this.editBase.delete('description'); this.render(); }
        return;
      }
      if (key === 'comment:new') {
        if (!text.trim()) return;
        const out = await this.act(() => this.api.post(`/issues/${encodeURIComponent(this.issueId)}/comments`, { body: text }), { parts: ['comments'] });
        if (out) { this.editing.delete(key); this.drafts.delete(key); this.previews.delete(key); if (this.tab !== 'comments' && this.tab !== 'all') this.tab = 'comments'; this.render(); }
        return;
      }
      if (key.startsWith('comment:')) {
        const id = key.slice(8);
        const c = this.comments?.find((x) => x.id === id);
        if (!text.trim()) return;
        const out = await this.act(() => this.api.patch(`/comments/${encodeURIComponent(id)}`, { body: text, rev: c?.rev }), { parts: ['comments'], issue: false });
        if (out) { this.editing.delete(key); this.drafts.delete(key); this.previews.delete(key); this.render(); }
      }
    },
    'comment-new'() {
      if (this.readOnly || this.state !== 'ready') return;
      if (this.tab !== 'comments' && this.tab !== 'all') this.tab = 'comments';
      this.collapsed.delete('activity');
      this.editing.add('comment:new');
      this.render();
      const box = this.host.querySelector('textarea[data-draft="comment:new"]');
      box?.focus();
      box?.scrollIntoView({ block: 'nearest' });
    },
    'comment-edit'(el) {
      const c = this.comments?.find((x) => x.id === el.dataset.id);
      if (!c) return;
      const key = `comment:${c.id}`;
      this.editing.add(key);
      this.drafts.set(key, c.body);
      this.render();
      this.host.querySelector(`textarea[data-draft="${CSS.escape(key)}"]`)?.focus();
    },
    async 'comment-delete'(el) {
      const id = el.dataset.id;
      const choice = await this.ctx.app?.ask?.({ kind: 'delete', icon: 'trash', title: t('detail.comment.deleteTitle'), message: t('detail.comment.deleteMessage'), buttons: [{ id: 'cancel', label: t('detail.cancel') }, { id: 'delete', label: t('detail.delete'), icon: 'trash', danger: true, primary: true }] });
      if (choice !== 'delete') return;
      await this.act(() => this.api.del(`/comments/${encodeURIComponent(id)}`), { parts: ['comments'], issue: false });
    },
    tab(el) {
      this.tab = el.dataset.tab;
      this.persist();
      const need = { history: ['history'], worklog: ['worklogs'], all: ['history', 'worklogs', 'comments'] }[this.tab] ?? [];
      this.render();
      const missing = need.filter((p) => !this[p] || p === 'history');
      if (missing.length) this.track(this.loadParts(missing));
    },
    order() { this.order = this.order === 'newest' ? 'oldest' : 'newest'; this.persist(); this.render(); },
    pick(el) { if (!this.readOnly) this.openFieldPicker(el.dataset.field, el); },
    status(el) { this.openStatus(el); },
    clear(el) {
      const field = el.dataset.field;
      this.setField(field, ['labels', 'components', 'fixVersions', 'affectedVersions'].includes(field) ? [] : null);
    },
    'assign-me'() { if (this.me && this.issue.assigneeId !== this.me.id) this.setField('assignee', this.me.id); },
    async 'pick-icon'() {
      if (this.readOnly) return;
      const ref = await this.ctx.pickIcon?.(this.issue.icon ?? '', { title: t('detail.field.icon') });
      if (ref == null) return;
      this.setField('icon', ref || null);
    },
    'field-edit'(el) {
      const key = el.dataset.field;
      this.editing.add(key);
      this.drafts.set(key, this.drafts.get(key) ?? this.valueOf(key) ?? '');
      this.editBase.set(key, { rev: this.server.rev, value: this.valueOf(key, this.server) });
      this.render();
      const box = this.host.querySelector(`[data-draft="${CSS.escape(key)}"]`);
      box?.focus(); box?.select?.();
    },
    async 'field-save'(el) {
      const key = el.dataset.field;
      const value = (this.drafts.get(key) ?? '').trim();
      const base = this.editBase.get(key)?.value;
      this.editing.delete(key);
      const ok = await this.setField(key, value || null, { base });
      if (ok) this.drafts.delete(key); else if (this.conflict) this.editing.add(key);
      this.render();
    },
    'field-cancel'(el) { const key = el.dataset.field; this.editing.delete(key); this.drafts.delete(key); this.editBase.delete(key); this.render(); },
    // transitions
    'tf-resolution'(el) {
      const f = this.statusForm;
      openPicker(el, { key: 'tf-resolution', items: this.cfg.resolutions.map((r) => ({ value: r.id, label: r.name, hint: r.description ?? '', iconHtml: resolutionIcon(r, 16) })), value: f.resolutionId, onPick: (x) => { f.resolutionId = x; this.render(); } });
    },
    'tf-assignee'(el) {
      const f = this.statusForm;
      openPicker(el, { key: 'tf-assignee', items: [...this.users.values()].filter((u) => this.memberIds().has(u.id)).map((u) => ({ value: u.id, label: u.displayName || u.username, iconHtml: avatarHtml(u, 18) })), value: f.values.assignee, onPick: (x) => { f.values.assignee = x; this.render(); } });
    },
    'tf-priority'(el) {
      const f = this.statusForm;
      openPicker(el, { key: 'tf-priority', items: this.cfg.priorities.map((p) => ({ value: p.id, label: p.name, iconHtml: renderIconRef(p.icon, { size: 16 }) })), value: f.values.priority, onPick: (x) => { f.values.priority = x; this.render(); } });
    },
    'tf-cancel'() { this.statusForm = null; for (const key of [...this.drafts.keys()]) if (key.startsWith('tf:')) this.drafts.delete(key); this.render(); },
    'tf-apply'() {
      const f = this.statusForm;
      if (!f) return;
      const comment = (this.drafts.get('tf:comment') ?? '').trim();
      if (f.needsComment && !comment) { f.error = t('detail.err.validator_comment_required'); this.render(); return; }
      const fields = {};
      for (const field of f.fields) {
        const raw = field === 'assignee' || field === 'priority' ? f.values[field] : (this.drafts.get(`tf:${field}`) ?? '').trim();
        if (raw == null || raw === '') { f.error = t('detail.err.validator_field_required_named', { field: this.fieldLabel(field) }); this.render(); return; }
        const api = { assignee: 'assigneeId', priority: 'priorityId', storyPoints: 'storyPoints', dueDate: 'dueDate', description: 'description', originalEstimate: 'originalEstimate', labels: 'labels' }[field];
        if (api === 'storyPoints') fields[api] = Number(raw);
        else if (api === 'originalEstimate') { const s = parseDuration(raw); if (!Number.isFinite(s)) { f.error = t('detail.err.invalid_duration'); this.render(); return; } fields[api] = s; }
        else if (api === 'labels') fields[api] = raw.split(/[\s,]+/).filter(Boolean);
        else if (api) fields[api] = raw;
        else fields.custom = { ...(fields.custom ?? {}), [field]: raw };
      }
      this.applyTransition(f.transition, { resolutionId: f.needsResolution ? f.resolutionId : undefined, comment: comment || undefined, fields });
    },
    // checklist
    'cl-add'() {
      const text = (this.drafts.get('cl:new') ?? '').trim();
      if (!text) return;
      this.drafts.delete('cl:new');
      this.act(() => this.api.post(`/issues/${encodeURIComponent(this.issueId)}/checklist`, { text })).then(() => this.host?.querySelector('[data-draft="cl:new"]')?.focus());
    },
    'cl-edit'(el) { const id = el.dataset.id; const item = this.issue.checklist.find((x) => x.id === id); if (!item) return; this.editing.add(`cl:${id}`); this.drafts.set(`cl:${id}`, item.text); this.render(); const box = this.host.querySelector(`[data-draft="cl:${CSS.escape(id)}"]`); box?.focus(); box?.select(); },
    'cl-delete'(el) { const id = el.dataset.id; this.issue.checklist = this.issue.checklist.filter((x) => x.id !== id); this.render(); this.act(() => this.api.del(`/checklist/${encodeURIComponent(id)}`)); },
    // subtasks
    async 'sub-add'() {
      const text = (this.drafts.get('sub:new') ?? '').trim();
      const type = this.cfg.types.find((x) => Number(x.level) === 1);
      if (!text || !type) return;
      this.drafts.delete('sub:new');
      const out = await this.act(() => this.api.createIssue({ projectId: this.issue.projectId, typeId: type.id, parentId: this.issueId, summary: text }));
      if (out) { this.tellWorkspace('issue.created', out); this.ctx.notify?.('success', t('detail.sub.created', { key: out.key })); this.host?.querySelector('[data-draft="sub:new"]')?.focus(); }
    },
    // links
    'link-new'() { this.linkForm = { kind: 'relates', direction: 'outward', target: null }; this.render(); this.host.querySelector('[data-draft="link:key"]')?.focus(); },
    'link-cancel'() { this.linkForm = null; this.drafts.delete('link:key'); this.render(); },
    'link-kind'(el) {
      const f = this.linkForm;
      openPicker(el, { key: 'link-kind', search: false, items: LINK_OPTIONS.map(([kind, dir]) => ({ value: `${kind}:${dir}`, label: linkLabel(kind, dir), icon: kind === 'blocks' ? 'stop' : kind === 'duplicates' || kind === 'clones' ? 'duplicate' : kind === 'causes' ? 'bug' : 'link' })), value: `${f.kind}:${f.direction}`, onPick: (x) => { const [kind, direction] = x.split(':'); Object.assign(f, { kind, direction }); this.render(); } });
    },
    async 'link-target'(el) {
      const f = this.linkForm;
      let items = [];
      try { const out = await this.api.issues({ limit: 1000 }); items = (out?.items ?? []).filter((x) => x.id !== this.issueId); } catch (error) { this.fail(error); return; }
      openPicker(el, {
        key: 'link-target', items: items.map((x) => ({ value: x.id, label: `${x.key} ${x.summary}`, iconHtml: typeIcon(this, x.typeId, 16) })), value: f.target?.id ?? '', search: true, placeholder: t('detail.link.search'),
        onPick: (id) => { const it = items.find((x) => x.id === id); f.target = it ? { id: it.id, key: it.key, summary: it.summary } : null; this.drafts.set('link:key', it?.key ?? ''); this.render(); },
      });
    },
    async 'link-save'() {
      const f = this.linkForm;
      if (!f) return;
      const key = (this.drafts.get('link:key') ?? '').trim().toUpperCase();
      const target = f.target && (!key || key === f.target.key) ? f.target.id : key;
      if (!target) { this.notice = { kind: 'error', text: t('detail.link.needTarget') }; this.render(); return; }
      const inward = f.direction === 'inward' && f.kind !== 'relates';
      const out = await this.act(async () => {
        if (!inward) return this.api.post(`/issues/${encodeURIComponent(this.issueId)}/links`, f.target?.id === target ? { targetId: target, kind: f.kind } : { targetKey: target, kind: f.kind });
        return this.api.post(`/issues/${encodeURIComponent(target)}/links`, { targetId: this.issueId, kind: f.kind });
      });
      if (out) { this.linkForm = null; this.drafts.delete('link:key'); this.render(); }
    },
    'link-remove'(el) { const id = el.dataset.id; this.issue.links = this.issue.links.filter((x) => x.id !== id); this.render(); this.act(() => this.api.del(`/links/${encodeURIComponent(id)}`)); },
    // attachments
    async 'att-upload'() { const files = await this.chooseFiles({ multiple: true }); if (files.length) await this.uploadFiles(files); },
    'att-preview'(el) { const a = this.attachments?.find((x) => x.id === el.dataset.id); if (!a) return; if (isImage(a.mime)) { this.preview = a.id; this.render(); } else this.download(a); },
    'preview-close'(el, event) { if (event?.target?.closest('[data-stop]') && !event.target.closest('[data-act="preview-close"].icon-button')) return; this.preview = null; this.render(); },
    'att-cover'(el) { this.setField('cover', { attachmentId: el.dataset.id }); },
    async 'att-delete'(el) {
      const a = this.attachments?.find((x) => x.id === el.dataset.id);
      if (!a) return;
      const choice = await this.ctx.app?.ask?.({ kind: 'delete', icon: 'trash', title: t('detail.att.deleteTitle'), message: t('detail.att.deleteMessage', { name: a.fileName }), buttons: [{ id: 'cancel', label: t('detail.cancel') }, { id: 'delete', label: t('detail.delete'), icon: 'trash', danger: true, primary: true }] });
      if (choice !== 'delete') return;
      await this.act(() => this.api.del(`/attachments/${encodeURIComponent(a.id)}`), { parts: ['attachments'] });
      if (this.issue?.cover?.attachmentId === a.id) this.setField('cover', null, { record: false });
    },
    // work log
    'wl-mode'(el) { this.drafts.set('wl:mode', el.dataset.mode); this.render(); },
    async 'wl-add'() {
      const raw = (this.drafts.get('wl:time') ?? '').trim();
      const seconds = parseDuration(raw);
      this.wlError = null;
      if (!seconds || !Number.isFinite(seconds)) { this.wlError = t('detail.err.invalid_duration'); this.render(); return; }
      const mode = this.drafts.get('wl:mode') ?? 'auto';
      const body = { seconds, comment: (this.drafts.get('wl:comment') ?? '').trim() || undefined, remainingEstimate: 'auto' };
      const date = this.drafts.get('wl:date');
      if (date) { const [y, m, d] = date.split('-').map(Number); const now = new Date(); body.startedAt = new Date(y, m - 1, d, now.getHours(), now.getMinutes()).getTime(); }
      if (mode === 'set') {
        const rem = parseDuration(this.drafts.get('wl:remaining') ?? '');
        if (rem == null || !Number.isFinite(rem)) { this.wlError = t('detail.err.invalid_duration'); this.render(); return; }
        body.remainingEstimate = rem;
      }
      const out = await this.act(() => this.api.post(`/issues/${encodeURIComponent(this.issueId)}/worklogs`, body), { parts: ['worklogs'], errorTarget: 'wlError' });
      if (out) { for (const k of ['wl:time', 'wl:comment', 'wl:remaining']) this.drafts.delete(k); this.ctx.notify?.('success', t('detail.wl.added', { v: fmtDuration(seconds) })); this.render(); }
    },
    'wl-edit'(el) { this.editing.add(`wl:${el.dataset.id}`); this.render(); },
    'wl-cancel'(el) { const k = `wl:${el.dataset.id}`; this.editing.delete(k); this.drafts.delete(`${k}:time`); this.drafts.delete(`${k}:comment`); this.render(); },
    async 'wl-save'(el) {
      const id = el.dataset.id;
      const k = `wl:${id}`;
      const w = this.worklogs?.find((x) => x.id === id);
      const seconds = parseDuration(this.drafts.get(`${k}:time`) ?? fmtDuration(w?.seconds));
      if (!seconds || !Number.isFinite(seconds)) { this.notice = { kind: 'error', text: t('detail.err.invalid_duration') }; this.render(); return; }
      const out = await this.act(() => this.api.patch(`/worklogs/${encodeURIComponent(id)}`, { seconds, comment: this.drafts.get(`${k}:comment`) ?? w?.comment ?? null, rev: w?.rev }), { parts: ['worklogs'] });
      if (out) { this.editing.delete(k); this.drafts.delete(`${k}:time`); this.drafts.delete(`${k}:comment`); this.render(); }
    },
    async 'wl-delete'(el) {
      const choice = await this.ctx.app?.ask?.({ kind: 'delete', icon: 'trash', title: t('detail.wl.deleteTitle'), message: t('detail.wl.deleteMessage'), buttons: [{ id: 'cancel', label: t('detail.cancel') }, { id: 'delete', label: t('detail.delete'), icon: 'trash', danger: true, primary: true }] });
      if (choice !== 'delete') return;
      await this.act(() => this.api.del(`/worklogs/${encodeURIComponent(el.dataset.id)}`), { parts: ['worklogs'] });
    },
    // conflict
    'conflict-mine'() { this.resolveConflict(true); },
    'conflict-theirs'() { this.resolveConflict(false); },
  };

  download(a) {
    const link = document.createElement('a');
    link.href = this.attachmentUrl(a.id, false);
    link.download = a.fileName;
    document.body.append(link);
    link.click();
    link.remove();
  }

  persist() { savePrefs({ collapsed: [...this.collapsed], tab: this.tab, order: this.order, showEmpty: this.showEmpty }); }
}

let instance = null;

registerView('detail', {
  mount(host, ctx) { instance = new DetailView(); instance.mount(host, ctx); },
  update(ctx) { instance?.update(ctx); },
  unmount() { instance?.unmount(); instance = null; },
});

export { DetailView };
