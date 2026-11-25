// Product data management in the main window: the vault explorer (a panel docked on the right of the main
// window, usable with or without an open document) and the vault commands. app.js hands in `ctx`;
// attachPdm() adds the commands, the menu and CommandManager entries and chains `blocks` (a document opened
// from the vault is read-only unless it is checked out to you), `treeExtra` (the document's vault references
// with their out-of-date marks) and Save (a vault document offers check-in or a local copy).
// Connecting asks for a login (the vault's own accounts, PBKDF2 hashes); the session lasts while the app runs.
//
// The rules live in cad/vault.js; where the files are kept, in platform/vault-store.js (a folder on the
// desktop — local or shared — or IndexedDB in a browser).
import { segGlyph } from './ui/seg-icons.js';
import './styles-pdm.css';
import { Vault, VaultError, STATES, ROLES, SCHEMES, FIELD_TYPES, TRANSITIONS, describeContent, applyLinks } from './cad/vault.js';
import { makeZip } from './cad/vault-zip.js';
import { storeFor, vaultInfo, webVaults } from './platform/vault-store.js';
import { isDesktop, chooseFolder, chooseSavePath, errorText } from './platform/native.js';
import { quatIdentity } from './cad/assembly.js';
import { packProject } from './cad/document.js';
import { MATERIALS, materialName } from './cad/materials.js';
import { getLanguage } from './i18n.js';
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';

const AUTHOR_KEY = 'mymechanics.vault.author';
const LOCATION_KEY = 'mymechanics.vault.location';
const storage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const STATE_ICONS = { wip: 'stateWip', pending: 'statePending', released: 'stateReleased', obsolete: 'stateObsolete' };
const TR_ICONS = { submit: 'trSubmit', approve: 'trApprove', reject: 'trReject', revise: 'trRevise', obsolete: 'trObsolete', reinstate: 'trReinstate' };
const KIND_ICONS = { part: 'part', assembly: 'assembly', drawing: 'drawing' };
const SUBS = [['history', 'versionHistory'], ['contains', 'refContains'], ['whereUsed', 'refWhereUsed'], ['bom', 'bomIndented'], ['pack', 'packAndGo'], ['events', 'lifecycle'], ['discussion', 'pdmDiscussion']];
const WATCH_KEY = 'mymechanics.vault.watch';

export function attachPdm(more, ctx) {
  const { t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const S = {
    open: false, location: loadLocation(), vault: null, host: '', tab: 'files', sub: 'history', sel: null,
    q: { text: '', partNumber: '', description: '', material: '', state: '', kind: '' }, adv: false,
    cmp: { a: null, b: null, diff: null }, bomMode: 'indented', bom: null, pack: { includeDrawings: true, prefix: '', suffix: '', version: 'latest' },
    rename: '', copySuffix: ' (copy)', comment: '', keepOut: false, chg: { type: 'ecr', title: '', desc: '', files: [], sel: null },
    field: { card: 'general', key: '', label: '', type: 'text', options: '', required: false }, role: { user: '', role: 'editor', password: '' }, webName: '', webList: [], busy: false,
    login: null, pw: { old: '', next: '' }, reset: {},
    // Working together: the vault read again every `watch` seconds (0 = off), news of others since `seen`.
    watch: loadWatch(), seen: null, news: [], talk: '',
  };
  const lastUser = () => { try { return storage()?.getItem(AUTHOR_KEY) || ''; } catch { return ''; } };
  /** The logged-in user (the vault's session), else the name last used. */
  const user = () => S.vault?.user ?? (lastUser() || t('ver.defaultAuthor'));
  const V = () => S.vault;
  const file = (id = S.sel) => V()?.file(id) ?? null;
  const roleName = (r) => t(`pdm.role.${r}`);

  // ───────────────────────── connecting

  function loadWatch() { try { const v = Number(storage()?.getItem(WATCH_KEY)); return Number.isFinite(v) && storage()?.getItem(WATCH_KEY) != null ? v : 15; } catch { return 15; } }

  // ───────────────────────── working together: the vault watched for others' work

  let timer = 0;
  /** (Re)starts the watch: every S.watch seconds the vault is read again and others' new work announced. */
  function startWatch() {
    clearInterval(timer); timer = 0;
    if (!S.vault || !(S.watch > 0)) return;
    S.seen ??= S.vault.activity({ limit: 1 })[0]?.time ?? S.vault.now();
    timer = setInterval(() => { void poll(); }, S.watch * 1000);
  }
  /** One look at the vault: news of others since the last look as notices, the explorer and marks redrawn. */
  async function poll() {
    const v = S.vault;
    if (!v || S.busy) return [];
    try { await v.refresh(); } catch { return []; }
    const news = v.activity({ since: S.seen, others: true, limit: 50 });
    if (!news.length) return [];
    S.seen = news[0].time;
    S.news = [...news, ...S.news].slice(0, 100);
    for (const e of news.slice(0, 3).reverse()) notify('info', newsText(e));
    if (news.length > 3) notify('info', t('pdm.newsMore', { count: news.length - 3 }));
    if (S.open) render();
    ctx.renderAll?.();
    return news;
  }
  /** One line about an event. */
  function newsText(e) {
    const what = e.kind === 'change'
      ? `${e.number} ${t(`pdm.log.${e.action}`, null, e.action)}`
      : `${e.name} — ${e.type === 'transition' ? t(`pdm.tr.${e.transition}`) : t(`pdm.ev.${e.type}`, null, e.type)}`;
    return `${e.by}: ${what}${e.comment ? ` — ${e.comment}` : ''}`;
  }

  function loadLocation() { try { return JSON.parse(storage()?.getItem(LOCATION_KEY) ?? 'null'); } catch { return null; } }
  function saveLocation(loc) { try { if (loc) storage()?.setItem(LOCATION_KEY, JSON.stringify(loc)); else storage()?.removeItem(LOCATION_KEY); } catch { /* no storage */ } }

  /**
   * Logs in to a vault (or creates one, its creator the first admin). credentials: { user, password }.
   * The password is only used to derive and check the PBKDF2 hash; it is never kept.
   */
  async function connect(location, { create = false, name = '', scheme = 'letter', user: who, password } = {}) {
    const store = storeFor(location);
    const host = location.kind === 'folder' && isDesktop() ? (await vaultInfo(location.root)).host : 'browser';
    const opts = { user: who, password, host };
    S.vault = create ? await Vault.create(store, { name: name || location.root, scheme, ...opts }) : await Vault.login(store, opts);
    S.seen = null; S.news = []; startWatch();
    S.location = location; S.host = host; S.sel = null; S.bom = null; S.cmp = { a: null, b: null, diff: null }; S.login = null;
    try { storage()?.setItem(AUTHOR_KEY, S.vault.user); } catch { /* no storage */ }
    saveLocation(location);
    notify('success', t(create ? 'pdm.created' : 'pdm.loggedIn', { name: S.vault.index.name, user: S.vault.user }));
  }

  /** True while logged in to a vault (its index read again). Without a session the explorer asks for a login. */
  async function ensureVault() {
    if (!S.vault) return false;
    try { await S.vault.refresh(); return true; } catch { return false; }
  }
  function logout() { clearInterval(timer); timer = 0; S.vault = null; S.sel = null; S.login = S.location ? { location: S.location, create: false, user: lastUser(), password: '' } : null; }

  const testFolder = () => { const q = globalThis.window?.__mymechanicsFolderPicks; return Array.isArray(q) && q.length ? { value: q.shift() } : null; };
  async function pickFolder() { const p = testFolder(); return p ? p.value : chooseFolder(S.location?.kind === 'folder' ? S.location.root : undefined); }

  // ───────────────────────── running actions

  function errorMessage(e) {
    if (!(e instanceof VaultError)) return errorText(e);
    const params = { ...e.params };
    if (params.need) params.need = roleName(params.need);
    if (params.role) params.role = roleName(params.role);
    if (params.state) params.state = t(`pdm.state.${params.state}`);
    if (params.status) params.status = t(`pdm.status.${params.status}`);
    if (params.fields) params.fields = String(params.fields).split(', ').map(fieldLabelOf).join(', ');
    return t(`pdm.err.${e.code}`, params, t('pdm.err.generic', { code: e.code }));
  }

  async function act(work, { success = null } = {}) {
    if (S.busy) return undefined;
    S.busy = true; render();
    try {
      const r = await work();
      if (success) notify('success', typeof success === 'function' ? success(r) : success);
      return r;
    } catch (error) {
      notify('warning', errorMessage(error));
      return undefined;
    } finally {
      S.busy = false;
      render();
      ctx.renderAll?.();
    }
  }

  // ───────────────────────── the open document and the vault

  const activeDoc = () => ctx.doc?.() ?? null;
  /** The open project's link to its vault file (saved in the project: vaultLink { vaultId, fileId, name }). */
  const projectLink = () => ctx.project()?.vaultLink ?? null;
  /** The vault file the open document is, when it belongs to the vault logged in to. */
  function linkedFile() {
    const l = projectLink(); const v = V();
    if (!l || !v || l.vaultId !== v.id) return null;
    return v.file(l.fileId);
  }
  const heldByMe = (f) => Boolean(f?.checkout && S.vault && f.checkout.by === S.vault.user);
  const setLink = (f) => { const p = ctx.project(); if (p && f) p.vaultLink = { vaultId: V().id, fileId: f.id, name: f.name }; };

  function blocks(labelKey) {
    if (String(labelKey ?? '').startsWith('op.vault')) return false;
    // A document used by reference shows another file's content: it is changed in that file, not here.
    const p = ctx.project(); const a = p?.active;
    const shown = a && (a.kind === 'part' ? p.parts : a.kind === 'assembly' ? p.assemblies : []).find((d) => d.id === a.id);
    if (shown && (shown.vaultRef || shown.vaultNested) && labelKey !== 'op.refPolicy') {
      notify('warning', t('pdm.refReadOnly', { name: shown.vaultRef?.name ?? shown.name }));
      return true;
    }
    const f = linkedFile();
    if (!f || heldByMe(f)) return false;
    notify('warning', t('pdm.readOnly', { name: f.name }));
    return true;
  }

  /** Opens a vault file (a version, or the latest) with its references resolved. */
  async function openInApp(f, { version = null } = {}) {
    await V().refresh();
    const p = JSON.parse(version ? await V().versionContent(f.id, version) : await V().latest(f.id));
    const links = await V().resolveLinks(p, { seen: new Set([f.id]) });
    const missing = links.filter((l) => l.missing);
    const d = await ctx.openVaultDoc(f.name, JSON.stringify(p));
    if (d) { d.vaultVersion = version ?? f.version; d.markSaved?.(); }
    if (missing.length) notify('warning', t('pdm.refsMissing', { names: missing.map((l) => l.doc.name).join(', ') }));
    return d;
  }

  async function checkInActive(opts = {}) {
    const p = ctx.project();
    if (!p) { notify('info', t('pdm.noDocument')); return; }
    if (!(await ensureVault())) { notify('info', t('pdm.connectFirst')); return; }
    const f = linkedFile();
    const keepOut = opts.keepOut ?? S.keepOut;
    if (p.vaultLink && !f) { notify('warning', t('pdm.otherVault')); return false; }
    return act(async () => {
      if (f) {
        const r = await V().checkIn(f.id, packProject(p), { comment: S.comment, keepOut });
        S.sel = f.id;
        const d = activeDoc(); if (d) { d.vaultVersion = r.file.version; d.markSaved?.(); }
        S.comment = '';
        notify('success', r.added ? t('pdm.checkedIn', { name: f.name, rev: `${r.file.revision}.${r.file.version}` }) : t('pdm.unchanged', { name: f.name }));
      } else {
        const d = activeDoc();
        const base = (d?.path ? String(d.path).split(/[\\/]/).pop() : d?.name) || p.name || 'Project';
        const id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const nf = await V().addFile(base, packProject(p), { comment: S.comment, keepOut, id });
        setLink(nf);
        S.sel = nf.id; S.comment = '';
        if (d) { d.vaultVersion = 1; d.markSaved?.(); }
        notify('success', t('pdm.added', { name: nf.name }));
      }
      return true;
    });
  }

  async function checkOutActive() {
    if (!(await ensureVault())) { notify('info', t('pdm.connectFirst')); return; }
    const f = linkedFile();
    if (!f) { notify('info', t('pdm.notInVault')); openExplorer('files'); return; }
    await act(async () => {
      const d = activeDoc();
      const had = d?.vaultVersion ?? null;
      await V().checkOut(f.id);
      // A newer version than the one open is opened (the lock is on the latest)
      if (had == null || had < V().file(f.id).version) await openInApp(V().file(f.id));
    }, { success: t('pdm.checkedOut', { name: f.name }) });
  }

  async function insertSelected() {
    const f = file(); const asm = ctx.activeAssembly();
    if (!f || !asm) { notify('info', t('pdm.insertNeedsAssembly')); return; }
    await act(async () => {
      const info = describeContent(await V().latest(f.id));
      if (!info.main || info.main.kind === 'drawing') { notify('info', t('pdm.insertNotModel')); return; }
      // The reference and what it resolves to are made aside, then put into the project as one undoable change.
      const scratch = { parts: [], assemblies: [], vaultLink: ctx.project()?.vaultLink ?? null };
      const made = await V().link(scratch, f.id, info.main.id, { policy: S.insertPolicy ?? 'latest', newId: ctx.newId });
      ctx.change('op.vaultInsert', (p) => { p.parts.push(...scratch.parts); p.assemblies.push(...scratch.assemblies); });
      if (made.kind === 'part') ctx.insertComponent(made.doc.id);
      else {
        const a = ctx.activeAssembly();
        const n = a.components.filter((c) => c.sub === made.doc.id).length + 1;
        ctx.change('op.vaultInsert', () => { a.components.push({ id: ctx.newId('cmp'), sub: made.doc.id, name: `${made.doc.name}<${n}>`, position: [0, 0, 0], rotation: quatIdentity(), fixed: a.components.length === 0 }); });
      }
      notify('success', t('pdm.inserted', { name: f.name }));
    });
  }

  async function updateActiveLinks(only = null) {
    const p = ctx.project();
    if (!p || !(await ensureVault())) { notify('info', t('pdm.connectFirst')); return; }
    await act(async () => {
      const prepared = await V().prepareLinks(p, { only });
      if (!prepared.length) { notify('info', t('pdm.linksCurrent')); return; }
      let names = [];
      ctx.change('op.vaultUpdate', (proj) => { names = applyLinks(proj, prepared); });
      notify('success', t('pdm.linksUpdated', { count: names.length, names: names.join(', ') }));
    });
  }

  // ───────────────────────── the explorer panel

  let host = null;
  function openExplorer(tab = null) {
    S.open = true;
    if (tab) S.tab = tab;
    mount();
    render();
    if (!S.vault && !S.login && S.location && !(S.location.kind === 'folder' && !isDesktop())) S.login = { location: S.location, create: false, user: lastUser(), password: '' };
    ensureVault().then(() => render()).catch(() => render());
    if (!isDesktop()) webVaults().then((list) => { S.webList = list; render(); });
    ctx.renderAll?.();
  }
  function closeExplorer() { S.open = false; if (host) host.hidden = true; ctx.renderAll?.(); }

  function mount() {
    if (host) { host.hidden = false; return; }
    host = document.createElement('aside');
    host.id = 'pdm-explorer';
    host.className = 'pdm-explorer';
    host.setAttribute('role', 'complementary');
    document.body.appendChild(host);
    globalThis.addEventListener('resize', () => { if (S.open) place(); });
    host.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-pdm]');
      if (!b || b.disabled) return;
      const raw = b.dataset.pdm; const i = raw.indexOf(':');
      action(i < 0 ? raw : raw.slice(0, i), i < 0 ? '' : raw.slice(i + 1));
    });
    host.addEventListener('change', (ev) => {
      const el = ev.target.closest('[data-pdm-field]');
      if (el) field(el.dataset.pdmField, el.type === 'checkbox' ? el.checked : el.value);
    });
    host.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && ev.target.matches?.('input[data-pdm-field]')) { ev.preventDefault(); ev.target.dispatchEvent(new Event('change', { bubbles: true })); }
      if (ev.key === 'Escape') closeExplorer();
      ev.stopPropagation();
    });
  }

  /** Over the work area only: the menu bar (with the window buttons), toolbar and status bar stay visible. */
  function place() {
    const ws = document.querySelector('#workspace')?.getBoundingClientRect();
    host.style.top = `${Math.max(0, Math.round(ws?.top ?? 0))}px`;
    host.style.bottom = `${Math.max(0, Math.round(ws ? globalThis.innerHeight - ws.bottom : 0))}px`;
  }

  function render() {
    if (!host || !S.open) return;
    const body = host.querySelector('.pdm-body');
    const scroll = body?.scrollTop ?? 0;
    host.hidden = false;
    place();
    host.classList.toggle('busy', S.busy);
    host.innerHTML = `${headHtml()}<div class="pdm-body">${S.vault ? bodyHtml() : connectHtml()}</div>`;
    const nb = host.querySelector('.pdm-body');
    if (nb) nb.scrollTop = scroll;
  }

  const esc = escapeHtml;
  const btn = (a, glyph, label, { disabled = false, title = '', cls = '' } = {}) => `<button type="button" class="pdm-button ${cls}" data-pdm="${esc(a)}" ${disabled || S.busy ? 'disabled' : ''} title="${esc(title || label)}">${icon(glyph, 'icon tiny')}<span>${esc(label)}</span></button>`;
  const iconBtn = (a, glyph, label, { disabled = false, cls = '' } = {}) => `<button type="button" class="icon-button pdm-icon ${cls}" data-pdm="${esc(a)}" ${disabled || S.busy ? 'disabled' : ''} title="${esc(label)}" aria-label="${esc(label)}">${icon(glyph, 'icon tiny')}</button>`;
  const seg = (a, options, current) => `<span class="segmented pdm-seg" role="radiogroup">${options.map(([v, label, glyph]) => `<button type="button" class="segment ${String(v) === String(current) ? 'active' : ''}" data-pdm="${esc(`${a}:${v}`)}" title="${esc(label)}">${icon(glyph || segGlyph(a, v), 'icon tiny')}<span>${esc(label)}</span></button>`).join('')}</span>`;
  const input = (key, value, { placeholder = '', disabled = false, type = 'text', cls = '' } = {}) => `<input type="${type}" class="pdm-input ${cls}" data-pdm-field="${esc(key)}" value="${esc(value ?? '')}" placeholder="${esc(placeholder)}" ${disabled ? 'disabled' : ''} spellcheck="false"/>`;
  const select = (key, options, current, { disabled = false } = {}) => `<select class="pdm-input" data-pdm-field="${esc(key)}" ${disabled ? 'disabled' : ''}>${options.map(([v, label]) => `<option value="${esc(v)}" ${String(v) === String(current) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
  const check = (key, checked, label, { disabled = false } = {}) => `<label class="pdm-check"><input type="checkbox" data-pdm-field="${esc(key)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}/><span>${esc(label)}</span></label>`;
  const group = (glyph, title, inner, cls = '') => `<section class="pdm-group ${cls}"><h4>${icon(glyph, 'icon tiny')}<span>${esc(title)}</span></h4>${inner}</section>`;
  const badge = (state) => `<span class="pdm-badge pdm-state-${esc(state)}" title="${esc(t(`pdm.state.${state}`))}">${icon(STATE_ICONS[state] ?? 'dot', 'icon tiny')}<span>${esc(t(`pdm.state.${state}`))}</span></span>`;
  const when = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return String(iso ?? ''); } };
  const fieldLabelOf = (key) => { const fl = (V()?.index?.cards ?? []).flatMap((c) => c.fields).find((f) => f.key === key); return fl?.label && !t(`pdm.field.${key}`, null, '') ? fl.label : t(`pdm.field.${key}`, null, fl?.label ?? key); };

  function headHtml() {
    const v = V();
    const where = v ? `${v.index.name} — ${S.location?.kind === 'web' ? t('pdm.webVault') : S.location?.root ?? ''}` : t('pdm.notConnected');
    return `<header class="pdm-head">${icon('vault')}<div class="pdm-title"><b>${esc(t('pdm.title'))}</b><span class="muted" title="${esc(where)}">${esc(where)}</span></div>
      ${v ? `<span class="pdm-user" title="${esc(t('pdm.youAre', { user: user(), role: roleName(v.role) }))}">${icon('roleUser', 'icon tiny')}<span>${esc(user())}</span><em>${esc(roleName(v.role))}</em></span>` : ''}
      ${v ? `${iconBtn('refresh', 'vaultRefresh', t('pdm.refresh'))}${iconBtn('logout', 'exitProject', t('pdm.logout'))}` : ''}${iconBtn('close', 'close', t('pdm.close'), { cls: 'pdm-close' })}</header>
      ${v ? `<nav class="pdm-tabs">${seg('tab', [['files', t('pdm.tab.files'), 'vaultExplorer'], ['changes', t('pdm.tab.changes'), 'changeOrder'], ['activity', `${t('pdm.tab.activity')}${waitingCount() ? ` (${waitingCount()})` : ''}`, 'pdmActivity'], ['settings', t('pdm.tab.settings'), 'gear']], S.tab)}</nav>` : ''}`;
  }

  /** The login (or, for a new vault, the first admin account) form. */
  function loginHtml() {
    const L = S.login;
    const where = L.location.kind === 'web' ? `${t('pdm.webVault')}: ${L.location.root}` : L.location.root;
    return group(L.create ? 'vaultCreate' : 'roleUser', t(L.create ? 'pdm.createAdmin' : 'pdm.login'), `<p class="pdm-note">${icon('vault', 'icon tiny')}<span>${esc(where)}</span></p>
      ${L.create ? `<p class="pdm-note muted">${esc(t('pdm.createAdminHelp'))}</p>` : ''}
      <label class="pdm-field"><span>${esc(t('pdm.userName'))}</span>${input('login.user', L.user)}</label>
      <label class="pdm-field"><span>${esc(t('pdm.password'))}</span>${input('login.password', L.password, { type: 'password' })}</label>
      ${L.create ? `<label class="pdm-field"><span>${esc(t('pdm.passwordAgain'))}</span>${input('login.password2', L.password2 ?? '', { type: 'password' })}</label>` : ''}
      <div class="pdm-row">${btn('login', L.create ? 'vaultCreate' : 'vaultConnect', t(L.create ? 'pdm.create' : 'pdm.loginButton'), { cls: 'primary' })}${btn('loginCancel', 'close', t('confirm.cancel'))}</div>`);
  }

  function connectHtml() {
    if (S.login) return loginHtml();
    const desktop = isDesktop();
    const last = S.location ? `<p class="pdm-note">${icon('info', 'icon tiny')}<span>${esc(t('pdm.lastVault', { name: S.location.root }))}</span></p>${btn('reconnect', 'vaultConnect', t('pdm.reconnect'), { cls: 'primary' })}` : '';
    const folder = desktop ? group('folder', t('pdm.folderVault'), `<p class="pdm-note">${esc(t('pdm.folderHelp'))}</p><div class="pdm-row">${btn('connectFolder', 'vaultConnect', t('pdm.openFolder'), { cls: 'primary' })}${btn('createFolder', 'vaultCreate', t('pdm.createFolder'))}</div>`) : '';
    const web = group('vault', t('pdm.webVaults'), `<p class="pdm-note">${esc(t(desktop ? 'pdm.webHelpDesktop' : 'pdm.webHelp'))}</p>
      ${S.webList.length ? `<ul class="pdm-list">${S.webList.map((n) => `<li>${icon('vault', 'icon tiny')}<span class="grow">${esc(n)}</span>${btn(`connectWeb:${n}`, 'vaultConnect', t('pdm.connect'))}</li>`).join('')}</ul>` : ''}
      <div class="pdm-row">${input('webName', S.webName, { placeholder: t('pdm.vaultName') })}${btn('createWeb', 'vaultCreate', t('pdm.create'), { disabled: !S.webName.trim() })}</div>`);
    return `${group('info', t('pdm.welcome'), `<p class="pdm-note">${esc(t('pdm.welcomeText'))}</p>${last}`)}${folder}${web}`;
  }

  const waitingCount = () => { const w = V()?.awaitingMe(); return w ? w.changes.length + w.files.length : 0; };

  /** Working together: what waits for me, the vault's latest activity, the watch setting. */
  function activityHtml() {
    const v = V(); const w = v.awaitingMe();
    const waiting = [
      ...w.files.map((f) => `<li>${icon(KIND_ICONS[f.kind] ?? 'part', 'icon tiny')}<button type="button" class="pdm-link grow" data-pdm="selFile:${esc(f.id)}">${esc(f.name)}</button>${badge(f.state)}<span class="muted">${esc(t('pdm.waitApprove'))}</span></li>`),
      ...w.changes.map((c) => `<li>${icon(c.type === 'ecr' ? 'changeRequest' : 'changeOrder', 'icon tiny')}<button type="button" class="pdm-link grow" data-pdm="chgOpen:${esc(c.id)}">${esc(`${c.number} — ${c.title}`)}</button><span class="pdm-status pdm-status-${esc(c.status)}">${esc(t(`pdm.status.${c.status}`))}</span></li>`),
    ].join('');
    const feed = v.activity({ limit: 60 }).map((e) => `<li class="${e.by === user() ? 'mine' : ''}">${icon(e.kind === 'change' ? 'changeOrder' : e.type === 'comment' ? 'pdmDiscussion' : e.type === 'transition' ? TR_ICONS[e.transition] ?? 'lifecycle' : e.type === 'checkIn' ? 'vaultCheckIn' : e.type === 'checkOut' ? 'vaultCheckOut' : 'note', 'icon tiny')}<span class="grow">${esc(when(e.time))} · <b>${esc(e.by)}</b> — ${esc(newsText(e).slice(e.by.length + 2))}</span>${e.kind === 'file' ? iconBtn(`selFile:${e.file}`, 'vaultOpen', t('pdm.show')) : iconBtn(`chgOpen:${e.change}`, 'vaultOpen', t('pdm.show'))}</li>`).join('');
    const out = v.files.filter((f) => f.checkout).map((f) => `<li>${icon('vaultCheckOut', 'icon tiny')}<button type="button" class="pdm-link grow" data-pdm="selFile:${esc(f.id)}">${esc(f.name)}</button><span class="muted">${esc(t('pdm.heldBy', { by: f.checkout.by, host: f.checkout.host ?? '' }))}</span></li>`).join('');
    return `${group('pdmActivity', t('pdm.waiting', { count: w.files.length + w.changes.length }), waiting ? `<ul class="pdm-list">${waiting}</ul>` : `<p class="pdm-note">${esc(t('pdm.nothingWaiting'))}</p>`)}
      ${group('vaultCheckOut', t('pdm.workingOn'), out ? `<ul class="pdm-list">${out}</ul>` : `<p class="pdm-note">${esc(t('pdm.nobodyOut'))}</p>`)}
      ${group('lifecycle', t('pdm.activity'), `<div class="pdm-row">${seg('watch', [['0', t('pdm.watchOff'), 'stop'], ['15', '15 s', 'refresh'], ['60', '1 min', 'refresh'], ['300', '5 min', 'refresh']], String(S.watch))}${btn('pollNow', 'refresh', t('pdm.pollNow'))}</div><p class="pdm-note muted">${esc(t('pdm.watchHelp'))}</p><ul class="pdm-list pdm-feed">${feed}</ul>`)}`;
  }

  function bodyHtml() {
    if (S.tab === 'activity') return activityHtml();
    if (S.tab === 'changes') return changesHtml();
    if (S.tab === 'settings') return settingsHtml();
    return filesHtml();
  }

  // ── files

  function filesHtml() {
    const v = V();
    const list = v.search({ ...S.q, partNumber: S.adv ? S.q.partNumber : '', description: S.adv ? S.q.description : '', material: S.adv ? S.q.material : '' });
    const linked = linkedFile();
    const p = ctx.project();
    const activeLine = p ? `<p class="pdm-note">${icon(linked ? 'link' : 'info', 'icon tiny')}<span>${esc(linked ? t('pdm.activeLinked', { name: linked.name, rev: `${linked.revision}.${linked.version}`, state: t(`pdm.state.${linked.state}`) }) : t('pdm.activeNotLinked', { name: p.name ?? '' }))}</span></p>` : `<p class="pdm-note">${esc(t('pdm.noDocument'))}</p>`;
    const active = group('vaultCheckIn', t('pdm.activeDoc'), `${activeLine}
      <div class="pdm-row">${input('comment', S.comment, { placeholder: t('pdm.comment') })}${check('keepOut', S.keepOut, t('pdm.keepOut'))}</div>
      <div class="pdm-row">${btn('checkInActive', 'vaultCheckIn', linked ? t('cmd.vaultCheckIn') : t('pdm.addToVault'), { disabled: !p || (linked && !heldByMe(linked)), cls: 'primary', title: linked && !heldByMe(linked) ? t('pdm.err.notOut') : '' })}
      ${btn('checkOutActive', 'vaultCheckOut', t('cmd.vaultCheckOut'), { disabled: !linked || Boolean(linked.checkout) })}
      ${btn('updateLinks', 'vaultUpdateLinks', t('cmd.vaultUpdateLinks'), { disabled: !p || !v.linkStatus(p).some((x) => x.outdated) })}</div>${refsHtml(p)}`);
    const stateOpts = [['', t('pdm.all')], ...STATES.map((s) => [s, t(`pdm.state.${s}`)])];
    const kindOpts = [['', t('pdm.allKinds')], ...Object.keys(KIND_ICONS).map((k) => [k, t(`pdm.kind.${k}`)])];
    const search = group('vaultSearch', t('pdm.search'), `<div class="pdm-row">${input('q.text', S.q.text, { placeholder: t('pdm.searchText'), cls: 'grow' })}${iconBtn('search', 'search', t('pdm.search'))}${iconBtn('adv', 'filter', t('pdm.advanced'), { cls: S.adv ? 'active' : '' })}</div>
      ${S.adv ? `<div class="pdm-grid">${['partNumber', 'description', 'material'].map((k) => `<label class="pdm-field"><span>${esc(t(`pdm.field.${k}`))}</span>${input(`q.${k}`, S.q[k])}</label>`).join('')}
      <label class="pdm-field"><span>${esc(t('pdm.stateLabel'))}</span>${select('q.state', stateOpts, S.q.state)}</label><label class="pdm-field"><span>${esc(t('pdm.kindLabel'))}</span>${select('q.kind', kindOpts, S.q.kind)}</label></div>` : ''}
      <p class="pdm-count muted">${esc(t('pdm.found', { count: list.length, total: v.files.length }))}</p>`);
    const rows = list.map((f) => `<tr class="${f.id === S.sel ? 'selected' : ''}" data-pdm="sel:${esc(f.id)}"><td>${icon(KIND_ICONS[f.kind] ?? 'part', 'icon tiny')}</td><td class="pdm-name" title="${esc(f.title)}">${esc(f.name)}</td><td>${esc(f.card.partNumber ?? f.props.partNumber ?? '')}</td><td class="pdm-rev">${esc(`${f.revision}.${f.version}`)}</td><td>${badge(f.state)}</td><td>${f.checkout ? `<span class="pdm-lock ${heldByMe(f) ? 'mine' : ''}" title="${esc(t('pdm.outBy', { by: f.checkout.by, host: f.checkout.host || '-' }))}">${icon('lockHeld', 'icon tiny')}<span>${esc(f.checkout.by)}</span></span>` : ''}</td></tr>`).join('');
    const table = group('vaultExplorer', t('pdm.files'), list.length ? `<div class="pdm-table-wrap"><table class="pdm-table"><thead><tr><th></th><th>${esc(t('pdm.col.name'))}</th><th>${esc(t('pdm.field.partNumber'))}</th><th>${esc(t('pdm.col.rev'))}</th><th>${esc(t('pdm.stateLabel'))}</th><th>${esc(t('pdm.col.lock'))}</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="pdm-note">${esc(t(v.files.length ? 'pdm.noMatch' : 'pdm.empty'))}</p>`);
    return `${active}${search}${table}${file() ? detailHtml(file()) : ''}`;
  }

  /** The open document's references: policy per reference, the version it shows, out-of-date marks. */
  function refsHtml(p) {
    const st = p ? V().linkStatus(p) : [];
    if (!st.length) return '';
    const rows = st.map((x) => {
      const opts = [['latest', t('pdm.policy.latest')], ['released', t('pdm.policy.released')], ...(x.file?.versions ?? []).map((ver) => [`v${ver.version}`, t('pdm.policy.version', { rev: `${ver.revision}.${ver.version}` })])];
      const cur = x.policy === 'version' ? `v${x.doc.vaultRef.version}` : x.policy;
      const mark = x.missing ? `<span class="pdm-ref-bad" title="${esc(t('pdm.refMissing'))}">${icon('warning', 'icon tiny')}</span>` : x.outdated ? `<span class="pdm-ref-old" title="${esc(t('pdm.refOutdated', { now: x.resolved ?? '-', target: x.target ?? '-', stale: (x.stale ?? []).join(', ') || '-' }))}">${icon('warning', 'icon tiny')}</span>` : `<span class="pdm-ref-ok" title="${esc(t('pdm.refCurrent'))}">${icon('check', 'icon tiny')}</span>`;
      return `<li>${mark}${icon(KIND_ICONS[x.kind], 'icon tiny')}<span class="grow" title="${esc(x.file?.name ?? '')}">${esc(x.doc.name)} <span class="muted">${esc(x.file?.name ?? '?')} · ${esc(x.resolved ?? '-')}</span></span>${select(`policy:${x.doc.id}`, opts, cur)}${iconBtn(`updateOne:${x.doc.id}`, 'vaultUpdateLinks', t('cmd.vaultUpdateLinks'), { disabled: !x.outdated })}</li>`;
    }).join('');
    return `<h5>${esc(t('pdm.references', { count: st.length, old: st.filter((x) => x.outdated).length }))}</h5><ul class="pdm-list pdm-refs">${rows}</ul>`;
  }

  function detailHtml(f) {
    const v = V();
    const ok = v.allowed(f.id);
    const asm = ctx.activeAssembly();
    const head = `<div class="pdm-detail-head">${icon(KIND_ICONS[f.kind] ?? 'part')}<div><b>${esc(f.name)}</b><br/><span class="muted">${esc(t('pdm.revVer', { rev: f.revision, ver: f.version }))} · ${esc(t(`pdm.kind.${f.kind}`))} · ${esc(t('pdm.createdBy', { by: f.createdBy, time: when(f.created) }))}</span></div>${badge(f.state)}</div>
      ${f.checkout ? `<p class="pdm-note warn">${icon('lockHeld', 'icon tiny')}<span>${esc(t('pdm.outBy', { by: f.checkout.by, host: f.checkout.host || '-' }))} — ${esc(when(f.checkout.time))}</span></p>` : ''}
      ${f.released ? `<p class="pdm-note">${icon('stateReleased', 'icon tiny')}<span>${esc(t('pdm.releasedAt', { rev: f.released.revision, ver: f.released.version, by: f.released.by, time: when(f.released.time) }))}</span></p>` : ''}`;
    const actions = `<div class="pdm-row wrap">${btn('open', 'vaultOpen', t('pdm.openReadOnly'))}${btn('checkOut', 'vaultCheckOut', t('pdm.checkOutOpen'), { disabled: !ok.checkOut, cls: 'primary' })}
      ${btn('undo', 'vaultUndo', f.checkout && !heldByMe(f) ? t('pdm.breakLock') : t('pdm.undoCheckOut'), { disabled: !ok.undo })}
      ${btn('insert', 'vaultInsert', t('cmd.vaultInsert'), { disabled: !asm || f.kind === 'drawing', title: asm ? '' : t('pdm.insertNeedsAssembly') })}</div>`;
    const transitions = v.transitionsOf(f.id, { all: true });
    const life = group('lifecycle', t('pdm.lifecycle'), `<div class="pdm-flow">${STATES.map((s) => `<span class="pdm-flow-step ${s === f.state ? 'current' : ''}">${icon(STATE_ICONS[s], 'icon tiny')}<span>${esc(t(`pdm.state.${s}`))}</span></span>`).join('<span class="pdm-flow-arrow">→</span>')}</div>
      <div class="pdm-row wrap">${transitions.length ? transitions.map((tr) => btn(`tr:${tr.id}`, TR_ICONS[tr.id], t(`pdm.tr.${tr.id}`), { disabled: Boolean(tr.blocked), title: tr.blocked ? errorMessage(new VaultError(tr.blocked.code, tr.blocked.params ?? {})) : t(`pdm.trHelp.${tr.id}`) })).join('') : `<span class="muted">${esc(t('pdm.noTransitions'))}</span>`}</div>`);
    const values = v.cardValues(f.id);
    const cards = v.cardsFor(f.kind).map((c) => `<div class="pdm-grid">${c.fields.map((fl) => `<label class="pdm-field ${fl.required ? 'required' : ''}"><span>${esc(fieldLabelOf(fl.key))}${fl.required ? ' *' : ''}</span>${cardInput(fl, values[fl.key], !ok.editCard)}</label>`).join('')}</div>`).join('');
    const card = group('dataCard', t('pdm.dataCard'), `${cards}${ok.editCard ? '' : `<p class="pdm-note muted">${esc(t('pdm.cardLocked'))}</p>`}`);
    const manage = group('renameFile', t('pdm.manage'), `<div class="pdm-row">${input('rename', S.rename || f.name.replace(/\.mymech$/i, ''), { cls: 'grow' })}${btn('rename', 'renameFile', t('pdm.rename'), { disabled: !ok.rename })}</div>
      <div class="pdm-row">${input('copySuffix', S.copySuffix, { placeholder: t('pdm.copySuffix'), cls: 'grow' })}${btn('copyTree', 'copyTree', t('pdm.copyTree'), { disabled: !ok.copy, title: t('pdm.copyTreeHelp') })}</div>`);
    const subs = `<nav class="pdm-subtabs">${seg('sub', SUBS.map(([k, g]) => [k, t(`pdm.sub.${k}`), g]), S.sub)}</nav>${subHtml(f)}`;
    return `<div class="pdm-detail">${group(KIND_ICONS[f.kind] ?? 'part', t('pdm.details'), `${head}${actions}`)}${life}${card}${manage}${subs}</div>`;
  }

  function cardInput(fl, value, disabled) {
    const key = `card.${fl.key}`;
    if (fl.type === 'list') return select(key, [['', '—'], ...(fl.options ?? []).map((o) => [o, t(`pdm.opt.${o}`, null, o)])], value ?? '', { disabled });
    if (fl.type === 'bool') return `<input type="checkbox" data-pdm-field="${esc(key)}" ${value ? 'checked' : ''} ${disabled ? 'disabled' : ''}/>`;
    if (fl.type === 'date') return input(key, value, { type: 'date', disabled });
    return input(key, value == null ? '' : String(value), { disabled });
  }

  function subHtml(f) {
    const v = V();
    if (S.sub === 'discussion') {
      const list = v.comments(f.id).map((c) => `<li class="${c.by === user() ? 'mine' : ''}"><span class="grow"><b>${esc(c.by)}</b> <span class="muted">${esc(when(c.time))}</span><br/>${esc(c.text)}</span></li>`).join('');
      return group('pdmDiscussion', t('pdm.discussion', { count: v.comments(f.id).length }), `${list ? `<ul class="pdm-list pdm-talk">${list}</ul>` : `<p class="pdm-note">${esc(t('pdm.noTalk'))}</p>`}<div class="pdm-row">${input('talk', S.talk, { placeholder: t('pdm.writeComment'), cls: 'grow' })}${btn('talkPost', 'pdmDiscussion', t('pdm.post'), { disabled: !S.talk.trim(), cls: 'primary' })}</div>`);
    }
    if (S.sub === 'history') {
      const rows = f.versions.slice().reverse().map((x) => `<li class="${S.cmp.a === x.version || S.cmp.b === x.version ? 'picked' : ''}"><span class="pdm-rev">${esc(`${x.revision}.${x.version}`)}</span><span class="grow">${esc(when(x.time))} · ${esc(x.by)}${x.comment ? ` — ${esc(x.comment)}` : ''}</span>
        ${iconBtn(`cmpA:${x.version}`, 'versionCompare', t('pdm.compareFrom'), { cls: S.cmp.a === x.version ? 'active' : '' })}${iconBtn(`cmpB:${x.version}`, 'versionCompare', t('pdm.compareTo'), { cls: S.cmp.b === x.version ? 'active' : '' })}
        ${iconBtn(`openVersion:${x.version}`, 'vaultOpen', t('pdm.openVersion'))}${iconBtn(`rollback:${x.version}`, 'rollback', t('ver.rollback'), { disabled: x.version === f.version || !STATE_RULES_OK(f) })}</li>`).join('');
      const d = S.cmp.diff;
      const diff = d ? `<ul class="pdm-list pdm-diff">${d.documents.filter((x) => x.status !== 'same').map((x) => `<li class="${x.status}">${icon(KIND_ICONS[x.kind] ?? 'part', 'icon tiny')}<span><b>${esc(x.name)}</b> — ${esc(t(`ver.status.${x.status}`))}${x.renamed ? ` (${esc(x.renamed.from)} → ${esc(x.renamed.to)})` : ''}${x.features ? `<br/>${esc(t('ver.featureDiff', { added: x.features.added.length, removed: x.features.removed.length, changed: x.features.changed.length }))}` : ''}${x.components ? `<br/>${esc(t('ver.componentDiff', { added: x.components.added.length, removed: x.components.removed.length }))}` : ''}</span></li>`).join('') || `<li class="muted">${esc(t('ver.noDiff'))}</li>`}</ul>` : '';
      return group('versionHistory', t('pdm.history', { count: f.versions.length }), `<ul class="pdm-list pdm-versions">${rows}</ul><div class="pdm-row">${btn('compare', 'versionCompare', t('pdm.compare', { a: S.cmp.a ?? '?', b: S.cmp.b ?? '?' }), { disabled: S.cmp.a == null || S.cmp.b == null || S.cmp.a === S.cmp.b })}</div>${diff}`);
    }
    if (S.sub === 'contains' || S.sub === 'whereUsed') {
      const tree = S.sub === 'contains' ? v.contains(f.id) : v.whereUsed(f.id);
      const node = (n, depth) => `<li style="--depth:${depth}">${icon(KIND_ICONS[n.file.kind] ?? 'part', 'icon tiny')}<button type="button" class="pdm-link" data-pdm="sel:${esc(n.file.id)}">${esc(n.file.name)}</button><span class="pdm-rev">${esc(`${n.file.revision}.${n.file.version}`)}</span>${badge(n.file.state)}${n.loop ? `<span class="muted">↺</span>` : ''}</li>${n.children.map((c) => node(c, depth + 1)).join('')}`;
      const docs = S.sub === 'contains' ? `<ul class="pdm-list">${f.docs.filter((d) => !d.linked).map((d) => `<li>${icon(KIND_ICONS[d.kind] ?? 'part', 'icon tiny')}<span>${esc(d.name)}${d.partNo ? ` · ${esc(d.partNo)}` : ''}</span></li>`).join('')}</ul>` : '';
      return group(S.sub === 'contains' ? 'refContains' : 'refWhereUsed', t(`pdm.sub.${S.sub}`), `${docs}${tree.children.length ? `<ul class="pdm-list pdm-tree">${tree.children.map((c) => node(c, 0)).join('')}</ul>` : `<p class="pdm-note">${esc(t(S.sub === 'contains' ? 'pdm.noRefs' : 'pdm.notUsed'))}</p>`}`);
    }
    if (S.sub === 'bom') {
      const rows = S.bom && S.bom.id === f.id && S.bom.mode === S.bomMode ? S.bom.rows : null;
      const table = rows ? (rows.length ? `<div class="pdm-table-wrap"><table class="pdm-table pdm-bom"><thead><tr>${['item', 'name', 'partNumber', 'description', 'material', 'qty', 'rev', 'state'].map((k) => `<th>${esc(t(`pdm.bom.${k}`))}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.item)}</td><td style="padding-left:${6 + r.level * 14}px">${icon(r.kind === 'assembly' ? 'assembly' : 'part', 'icon tiny')} ${esc(r.name)}</td><td>${esc(r.partNumber)}</td><td>${esc(r.description)}</td><td>${esc(materialLabel(r.material))}</td><td>${esc(r.qty)}</td><td>${esc(r.revision)}</td><td>${esc(t(`pdm.state.${r.state}`))}</td></tr>`).join('')}</tbody></table></div>` : `<p class="pdm-note">${esc(t('pdm.bomEmpty'))}</p>`) : '';
      return group('bom', t('pdm.sub.bom'), `<div class="pdm-row">${seg('bomMode', [['indented', t('pdm.bomIndented'), 'bomIndented'], ['parts', t('pdm.bomParts'), 'bomParts']], S.bomMode)}${btn('bom', 'bom', t('pdm.bomShow'))}</div>${table}`);
    }
    if (S.sub === 'pack') {
      const desktop = isDesktop();
      return group('packAndGo', t('cmd.packAndGo'), `<p class="pdm-note">${esc(t('pdm.packHelp', { count: v.closure(f.id).length }))}</p>
        ${check('pack.includeDrawings', S.pack.includeDrawings, t('pdm.packDrawings'))}
        <div class="pdm-grid"><label class="pdm-field"><span>${esc(t('pdm.prefix'))}</span>${input('pack.prefix', S.pack.prefix)}</label><label class="pdm-field"><span>${esc(t('pdm.suffix'))}</span>${input('pack.suffix', S.pack.suffix)}</label></div>
        <div class="pdm-row">${seg('packVersion', [['latest', t('pdm.packLatest')], ['released', t('pdm.packReleased')]], S.pack.version)}</div>
        <div class="pdm-row">${desktop && S.location?.kind === 'folder' ? btn('packFolder', 'folder', t('pdm.packFolder')) : ''}${btn('packZip', 'zipFile', t('pdm.packZip'), { cls: 'primary' })}</div>`);
    }
    const ev = f.events.slice().reverse().map((e) => `<li>${icon(e.type === 'transition' ? TR_ICONS[e.transition] ?? 'lifecycle' : e.type === 'checkOut' ? 'vaultCheckOut' : e.type === 'checkIn' ? 'vaultCheckIn' : 'note', 'icon tiny')}<span class="grow">${esc(when(e.time))} · ${esc(e.by)} — ${esc(e.type === 'transition' ? `${t(`pdm.tr.${e.transition}`)} (${t(`pdm.state.${e.from}`)} → ${t(`pdm.state.${e.to}`)})${e.order ? ` ${e.order}` : ''}` : t(`pdm.ev.${e.type}`, null, e.type))}${e.comment ? `: ${esc(e.comment)}` : ''}</span></li>`).join('');
    return group('lifecycle', t('pdm.sub.events'), `<ul class="pdm-list">${ev}</ul>`);
  }
  const materialLabel = (id) => { try { return MATERIALS.some((m) => m.id === id) ? materialName(id, getLanguage()) : String(id ?? ''); } catch { return String(id ?? ''); } };
  const STATE_RULES_OK = (f) => V().allowed(f.id).checkOut || heldByMe(f);

  // ── changes

  function changesHtml() {
    const v = V();
    const list = v.index.changes.slice().reverse();
    const sel = list.find((c) => c.id === S.chg.sel) ?? null;
    const fileName = (id) => v.file(id)?.name ?? id;
    const form = group('changeRequest', t('pdm.newChange'), `<div class="pdm-row">${seg('chgType', [['ecr', t('pdm.ecr'), 'changeRequest'], ['eco', t('pdm.eco'), 'changeOrder']], S.chg.type)}</div>
      <label class="pdm-field"><span>${esc(t('pdm.chgTitle'))}</span>${input('chg.title', S.chg.title)}</label>
      <label class="pdm-field"><span>${esc(t('pdm.chgDesc'))}</span>${input('chg.desc', S.chg.desc)}</label>
      <div class="pdm-row wrap">${S.chg.files.map((id) => `<span class="pdm-chip">${esc(fileName(id))}${iconBtn(`chgRemove:${id}`, 'close', t('pdm.remove'))}</span>`).join('')}${btn('chgAdd', 'plus', t('pdm.addSelected'), { disabled: !S.sel || S.chg.files.includes(S.sel), title: S.sel ? fileName(S.sel) : t('pdm.selectFileFirst') })}</div>
      <div class="pdm-row">${btn('chgCreate', S.chg.type === 'ecr' ? 'changeRequest' : 'changeOrder', t('pdm.create'), { disabled: !S.chg.title.trim(), cls: 'primary' })}</div>`);
    const rows = list.length ? `<ul class="pdm-list pdm-changes">${list.map((c) => `<li class="${c.id === S.chg.sel ? 'selected' : ''}">${icon(c.type === 'ecr' ? 'changeRequest' : 'changeOrder', 'icon tiny')}<button type="button" class="pdm-link grow" data-pdm="chgSel:${esc(c.id)}">${esc(`${c.number} — ${c.title}`)}</button><span class="pdm-status pdm-status-${esc(c.status)}">${esc(t(`pdm.status.${c.status}`))}</span></li>`).join('')}</ul>` : `<p class="pdm-note">${esc(t('pdm.noChanges'))}</p>`;
    const detail = sel ? group(sel.type === 'ecr' ? 'changeRequest' : 'changeOrder', `${sel.number} — ${sel.title}`, `<p class="pdm-note">${esc(sel.description || '—')}</p>
      <p class="muted">${esc(t('pdm.chgBy', { by: sel.by, time: when(sel.time) }))} · ${esc(t('pdm.approvalsNeeded', { have: sel.approvals.filter((a) => a.decision === 'approve').length, need: sel.type === 'ecr' ? 1 : sel.required }))}</p>
      <ul class="pdm-list">${sel.files.map((id) => `<li>${icon(KIND_ICONS[v.file(id)?.kind] ?? 'part', 'icon tiny')}<button type="button" class="pdm-link" data-pdm="selFile:${esc(id)}">${esc(fileName(id))}</button>${v.file(id) ? badge(v.file(id).state) : ''}<span class="pdm-rev">${esc(v.file(id)?.revision ?? '')}</span></li>`).join('')}</ul>
      <ul class="pdm-list">${sel.log.slice().reverse().map((l) => `<li><span class="grow">${esc(when(l.time))} · ${esc(l.by)} — ${esc(t(`pdm.log.${l.action}`, null, l.action))}${l.comment ? `: ${esc(l.comment)}` : ''}</span></li>`).join('')}</ul>
      <div class="pdm-row">${input('chg.comment', S.chg.comment ?? '', { placeholder: t('pdm.comment'), cls: 'grow' })}${btn('chgTalk', 'pdmDiscussion', t('pdm.post'))}</div>
      <div class="pdm-row wrap">${sel.type === 'eco' && sel.status === 'draft' ? btn('chgSubmit', 'trSubmit', t('pdm.chgSubmit')) : ''}
      ${(sel.type === 'ecr' && sel.status === 'open') || (sel.type === 'eco' && sel.status === 'pending') ? `${btn('chgApprove', 'trApprove', t('pdm.chgApprove'), { disabled: !atLeastRole('approver') || sel.by === user() })}${btn('chgReject', 'trReject', t('pdm.chgReject'), { disabled: !atLeastRole('approver') || sel.by === user() })}` : ''}
      ${sel.type === 'ecr' && sel.status === 'approved' ? btn('chgOrder', 'changeOrder', t('pdm.chgOrder')) : ''}
      ${(sel.type === 'eco' && sel.status === 'approved') || (sel.type === 'ecr' && ['approved', 'rejected'].includes(sel.status)) ? btn('chgClose', 'check', t('pdm.chgClose')) : ''}</div>`) : '';
    return `${form}${group('changeOrder', t('pdm.changes'), rows)}${detail}`;
  }
  const atLeastRole = (r) => ROLES.indexOf(V().role) >= ROLES.indexOf(r);

  // ── settings

  function settingsHtml() {
    const v = V(); const ix = v.index;
    const admin = atLeastRole('admin');
    const info = group('vault', t('pdm.vaultInfo'), `<p class="pdm-note">${esc(t('pdm.vaultLine', { name: ix.name, count: ix.files.length, by: ix.createdBy, time: when(ix.created) }))}</p><p class="pdm-note muted">${esc(S.location?.kind === 'web' ? t('pdm.webVault') : S.location?.root ?? '')}</p>
      <div class="pdm-row">${btn('disconnect', 'close', t('pdm.disconnect'))}</div>`);
    const you = group('roleUser', t('pdm.you'), `<p class="pdm-note">${esc(t('pdm.youAre', { user: user(), role: roleName(v.role) }))}</p><p class="pdm-note muted">${esc(t(`pdm.roleHelp.${v.role}`))}</p>
      <div class="pdm-grid"><label class="pdm-field"><span>${esc(t('pdm.oldPassword'))}</span>${input('pw.old', S.pw.old, { type: 'password' })}</label><label class="pdm-field"><span>${esc(t('pdm.newPassword'))}</span>${input('pw.next', S.pw.next, { type: 'password' })}</label></div>
      <div class="pdm-row">${btn('changePassword', 'lockHeld', t('pdm.changePassword'), { disabled: !S.pw.next })}${btn('logout', 'exitProject', t('pdm.logout'))}</div>`);
    const rules = group('lifecycle', t('pdm.workflow'), `<ul class="pdm-list">${TRANSITIONS.map((tr) => `<li>${icon(TR_ICONS[tr.id], 'icon tiny')}<span class="grow"><b>${esc(t(`pdm.tr.${tr.id}`))}</b>: ${esc(t(`pdm.state.${tr.from}`))} → ${esc(t(`pdm.state.${tr.to}`))} · ${esc(roleName(tr.role))}+ — ${esc(t(`pdm.trHelp.${tr.id}`))}</span></li>`).join('')}</ul>`);
    const roleOpts = ROLES.map((r) => [r, roleName(r)]);
    const settings = group('gear', t('pdm.vaultSettings'), `<div class="pdm-row"><span class="pdm-label">${esc(t('pdm.scheme'))}</span>${seg('scheme', Object.keys(SCHEMES).map((k) => [k, t(`pdm.scheme.${k}`)]), ix.scheme)}</div>
      <div class="pdm-grid"><label class="pdm-field"><span>${esc(t('pdm.requiredApprovals'))}</span>${input('approvals', ix.requiredApprovals, { disabled: !admin, type: 'number' })}</label>
      <label class="pdm-field"><span>${esc(t('pdm.defaultRole'))}</span>${select('defaultRole', roleOpts.filter(([r]) => r !== 'admin'), ix.defaultRole, { disabled: !admin })}</label></div>
      <h5>${esc(t('pdm.roles'))}</h5><ul class="pdm-list pdm-users">${v.users.map((u) => `<li class="${u.disabled ? 'disabled' : ''}">${icon('roleUser', 'icon tiny')}<span class="grow">${esc(u.name)}${u.disabled ? ` <span class="muted">(${esc(t('pdm.disabled'))})</span>` : ''}${u.hasPassword ? '' : ` <span class="muted">(${esc(t('pdm.noPasswordYet'))})</span>`}</span>${select(`role:${u.name}`, roleOpts, u.role, { disabled: !admin })}
        ${admin ? `${input(`reset:${u.name}`, S.reset[u.name] ?? '', { type: 'password', placeholder: t('pdm.newPassword'), cls: 'short' })}${iconBtn(`resetPassword:${u.name}`, 'lockHeld', t('pdm.resetPassword'), { disabled: !S.reset[u.name] })}${iconBtn(`toggleUser:${u.name}`, u.disabled ? 'check' : 'trReject', t(u.disabled ? 'pdm.enableUser' : 'pdm.disableUser'), { disabled: u.name === v.user })}` : ''}</li>`).join('')}</ul>
      ${admin ? `<div class="pdm-row">${input('role.user', S.role.user, { placeholder: t('pdm.userName'), cls: 'grow' })}${input('role.password', S.role.password, { type: 'password', placeholder: t('pdm.password'), cls: 'grow' })}${select('role.role', roleOpts, S.role.role)}${btn('roleAdd', 'plus', t('pdm.addUser'), { disabled: !S.role.user.trim() || !S.role.password })}</div>` : ''}`);
    const fields = ix.cards.map((c) => `<h5>${esc(t(`pdm.card.${c.id}`, null, c.id))}</h5><ul class="pdm-list">${c.fields.map((fl) => `<li><span class="grow">${esc(fieldLabelOf(fl.key))}${fl.required ? ' *' : ''}</span><span class="muted">${esc(t(`pdm.type.${fl.type}`))}${fl.options?.length ? `: ${esc(fl.options.join(', '))}` : ''}</span></li>`).join('')}</ul>`).join('');
    const add = admin ? `<div class="pdm-grid"><label class="pdm-field"><span>${esc(t('pdm.cardLabel'))}</span>${select('field.card', ix.cards.map((c) => [c.id, t(`pdm.card.${c.id}`, null, c.id)]), S.field.card)}</label>
      <label class="pdm-field"><span>${esc(t('pdm.fieldKey'))}</span>${input('field.key', S.field.key)}</label><label class="pdm-field"><span>${esc(t('pdm.fieldLabel'))}</span>${input('field.label', S.field.label)}</label>
      <label class="pdm-field"><span>${esc(t('pdm.fieldType'))}</span>${select('field.type', FIELD_TYPES.map((x) => [x, t(`pdm.type.${x}`)]), S.field.type)}</label>
      ${S.field.type === 'list' ? `<label class="pdm-field"><span>${esc(t('pdm.fieldOptions'))}</span>${input('field.options', S.field.options)}</label>` : ''}</div>
      <div class="pdm-row">${check('field.required', S.field.required, t('pdm.fieldRequired'))}${btn('fieldAdd', 'plus', t('pdm.addField'), { disabled: !S.field.key.trim() })}</div>` : '';
    return `${info}${you}${settings}${group('dataCard', t('pdm.dataCards'), `${fields}${add}`)}${rules}`;
  }

  // ───────────────────────── events

  async function action(name, arg) {
    const v = V(); const f = file();
    switch (name) {
      case 'close': return closeExplorer();
      case 'refresh': return act(() => v.refresh());
      case 'pollNow': return poll().then(() => render());
      case 'chgOpen': S.tab = 'changes'; S.chg.sel = arg; return render();
      case 'talkPost': { const text = S.talk; return act(async () => { await v.comment(f.id, text); S.talk = ''; }); }
      case 'chgTalk': { const text = S.chg.comment ?? ''; return act(async () => { await v.comment(S.chg.sel, text); S.chg.comment = ''; }); }
      case 'tab': S.tab = arg; return render();
      case 'sub': S.sub = arg; return render();
      case 'sel': if (S.sel !== arg) { S.sel = arg; S.rename = ''; S.cmp = { a: null, b: null, diff: null }; } return render();
      case 'selFile': S.sel = arg; S.tab = 'files'; S.rename = ''; return render();
      case 'adv': S.adv = !S.adv; return render();
      case 'search': return render();
      case 'reconnect': S.login = { location: S.location, create: false, user: lastUser(), password: '' }; return render();
      case 'loginCancel': S.login = null; return render();
      case 'login': {
        const L = S.login;
        if (!L) return undefined;
        if (L.create && L.password !== (L.password2 ?? '')) { notify('warning', t('pdm.passwordsDiffer')); return undefined; }
        return act(async () => { try { await connect(L.location, { create: L.create, name: L.name, user: L.user, password: L.password }); } finally { if (S.login) S.login.password = ''; } if (!isDesktop()) S.webList = await webVaults(); });
      }
      case 'logout': logout(); notify('info', t('pdm.loggedOut')); return render();
      case 'changePassword': return act(async () => { await v.setPassword(v.user, S.pw.next, { old: S.pw.old }); S.pw = { old: '', next: '' }; }, { success: t('pdm.passwordChanged') });
      case 'resetPassword': return act(async () => { await v.setPassword(arg, S.reset[arg]); delete S.reset[arg]; }, { success: t('pdm.passwordChanged') });
      case 'toggleUser': return act(() => v.setDisabled(arg, !v.users.find((u) => u.name === arg)?.disabled));
      case 'updateOne': return updateActiveLinks([arg]);
      case 'connectFolder': case 'createFolder': {
        const root = await pickFolder();
        if (!root) return undefined;
        return act(async () => {
          const info = await vaultInfo(root);
          if (name === 'createFolder' && !info.isVault) S.login = { location: { kind: 'folder', root }, create: true, name: String(root).split(/[\\/]/).filter(Boolean).pop(), user: lastUser(), password: '', password2: '' };
          else if (!info.isVault) throw new VaultError('notVault');
          else S.login = { location: { kind: 'folder', root }, create: false, user: lastUser(), password: '' };
        });
      }
      case 'connectWeb': S.login = { location: { kind: 'web', root: arg }, create: false, user: lastUser(), password: '' }; return render();
      case 'createWeb': S.login = { location: { kind: 'web', root: S.webName.trim() }, create: true, name: S.webName.trim(), user: lastUser(), password: '', password2: '' }; S.webName = ''; return render();
      case 'disconnect': S.vault = null; S.location = null; S.login = null; saveLocation(null); S.sel = null; if (!isDesktop()) S.webList = await webVaults(); return render();
      case 'checkInActive': return checkInActive();
      case 'checkOutActive': return checkOutActive();
      case 'updateLinks': return updateActiveLinks();
      case 'open': return f && act(() => openInApp(f));
      case 'openVersion': return f && act(() => openInApp(f, { version: Number(arg) }));
      case 'checkOut': return f && act(async () => { await v.checkOut(f.id); await openInApp(v.file(f.id)); }, { success: t('pdm.checkedOut', { name: f.name }) });
      case 'undo': {
        if (!f) return undefined;
        const other = f.checkout && !heldByMe(f);
        const choice = await ctx.ask({ title: t(other ? 'pdm.breakLock' : 'pdm.undoCheckOut'), message: t(other ? 'pdm.confirmBreak' : 'pdm.confirmUndo', { name: f.name, by: f.checkout?.by ?? '' }), icon: 'warning', buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t(other ? 'pdm.breakLock' : 'pdm.undoCheckOut'), icon: 'vaultUndo', primary: true, danger: other }] });
        if (choice !== 'ok') return undefined;
        return act(() => v.undoCheckOut(f.id), { success: t('pdm.undone', { name: f.name }) });
      }
      case 'insert': return insertSelected();
      case 'tr': return f && act(() => v.transition(f.id, arg, { comment: S.comment }), { success: (r) => t('pdm.moved', { name: f.name, state: t(`pdm.state.${r.state}`), rev: r.revision }) });
      case 'rename': return f && act(async () => { const r = await v.rename(f.id, S.rename || f.name); S.rename = ''; const pl = projectLink(); if (pl?.fileId === f.id) pl.name = r.file.name; return r; }, { success: (r) => t('pdm.renamed', { name: r.file.name, count: r.updated.length }) });
      case 'copyTree': return f && act(async () => { const r = await v.copyTree(f.id, { suffix: S.copySuffix || ' (copy)' }); S.sel = r.map[f.id]; return r; }, { success: (r) => t('pdm.copied', { count: r.files.length }) });
      case 'cmpA': S.cmp.a = Number(arg); S.cmp.diff = null; return render();
      case 'cmpB': S.cmp.b = Number(arg); S.cmp.diff = null; return render();
      case 'compare': return f && act(async () => { S.cmp.diff = await v.compare(f.id, S.cmp.a, S.cmp.b); });
      case 'rollback': {
        if (!f) return undefined;
        const choice = await ctx.ask({ title: t('ver.rollback'), message: t('pdm.confirmRollback', { name: f.name, ver: arg }), icon: 'warning', buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('ver.rollback'), icon: 'rollback', primary: true }] });
        if (choice !== 'ok') return undefined;
        return act(() => v.rollback(f.id, Number(arg), { comment: S.comment }), { success: (r) => t('pdm.rolledBack', { name: f.name, ver: arg, now: r.file.version }) });
      }
      case 'bomMode': S.bomMode = arg; return render();
      case 'bom': return f && act(async () => { S.bom = { id: f.id, mode: S.bomMode, rows: await v.bom(f.id, { mode: S.bomMode }) }; });
      case 'packVersion': S.pack.version = arg; return render();
      case 'packFolder': case 'packZip': return f && packAndGo(f, name === 'packZip');
      case 'chgType': S.chg.type = arg; return render();
      case 'chgAdd': if (S.sel && !S.chg.files.includes(S.sel)) S.chg.files.push(S.sel); return render();
      case 'chgRemove': S.chg.files = S.chg.files.filter((x) => x !== arg); return render();
      case 'chgCreate': return act(async () => { const c = await v.createChange(S.chg.type, { title: S.chg.title, description: S.chg.desc, files: S.chg.files }); S.chg = { ...S.chg, title: '', desc: '', files: [], sel: c.id }; return c; }, { success: (c) => t('pdm.changeCreated', { number: c.number }) });
      case 'chgSel': S.chg.sel = arg; return render();
      case 'chgSubmit': return act(() => v.submitChange(S.chg.sel), { success: (c) => t('pdm.changeStatus', { number: c.number, status: t(`pdm.status.${c.status}`) }) });
      case 'chgApprove': case 'chgReject': return act(() => v.decideChange(S.chg.sel, name === 'chgApprove' ? 'approve' : 'reject', { comment: S.chg.comment ?? '' }), { success: (c) => t('pdm.changeStatus', { number: c.number, status: t(`pdm.status.${c.status}`) }) });
      case 'chgOrder': return act(async () => { const c = await v.orderFromRequest(S.chg.sel); S.chg.sel = c.id; return c; }, { success: (c) => t('pdm.changeCreated', { number: c.number }) });
      case 'chgClose': return act(() => v.closeChange(S.chg.sel), { success: (c) => t('pdm.changeStatus', { number: c.number, status: t(`pdm.status.${c.status}`) }) });
      case 'scheme': return act(() => v.setSettings({ scheme: arg }));
      case 'roleAdd': return act(async () => { await v.addUser(S.role.user.trim(), S.role.password, S.role.role); S.role.user = ''; S.role.password = ''; }, { success: t('pdm.userAdded') });
      case 'fieldAdd': return act(async () => { await v.addCardField(S.field.card, { key: S.field.key, label: S.field.label || S.field.key, type: S.field.type, options: S.field.options.split(',').map((x) => x.trim()).filter(Boolean), required: S.field.required }); S.field = { ...S.field, key: '', label: '', options: '' }; });
      default: return undefined;
    }
  }

  async function packAndGo(f, zip) {
    const v = V();
    let dest = null;
    const base = `${f.name.replace(/\.mymech$/i, '')}${zip ? '.zip' : ''}`;
    if (zip && isDesktop()) { dest = await chooseSavePath(base, ['zip']); if (!dest) return; }
    if (!zip) { dest = await pickFolder(); if (!dest) return; }
    await act(async () => {
      const pack = await v.packAndGo(f.id, { ...S.pack });
      if (!zip) { await v.store.exportFiles(dest, pack.entries); return pack; }
      if (isDesktop()) { await (v.store.exportZip ? v.store.exportZip(dest, pack.entries) : Promise.reject(new Error('zip'))); return pack; }
      await ctx.saveExport(base, 'zip', makeZip(pack.entries), 'application/zip');
      return pack;
    }, { success: (pack) => t('pdm.packed', { count: pack.files.length }) });
  }

  function field(key, value) {
    const v = V(); const f = file();
    if (key.startsWith('login.') && S.login) { S.login[key.slice(6)] = String(value); return undefined; }
    if (key.startsWith('pw.')) { S.pw[key.slice(3)] = String(value); if (key === 'pw.next') render(); return undefined; }
    if (key.startsWith('reset:')) { S.reset[key.slice(6)] = String(value); render(); return undefined; }
    if (key.startsWith('policy:')) return setPolicy(key.slice(7), String(value));
    if (key === 'webName') { S.webName = String(value); return render(); }
    if (key === 'comment') { S.comment = String(value); return undefined; }
    if (key === 'talk') { S.talk = String(value); return render(); }
    if (key === 'watch') { S.watch = Math.max(0, Number(value) || 0); try { storage()?.setItem(WATCH_KEY, String(S.watch)); } catch { /* no storage */ } startWatch(); return render(); }
    if (key === 'keepOut') { S.keepOut = Boolean(value); return undefined; }
    if (key === 'rename') { S.rename = String(value); return undefined; }
    if (key === 'copySuffix') { S.copySuffix = String(value); return undefined; }
    if (key.startsWith('q.')) { S.q[key.slice(2)] = String(value); return render(); }
    if (key.startsWith('pack.')) { S.pack[key.slice(5)] = key === 'pack.includeDrawings' ? Boolean(value) : String(value); return undefined; }
    if (key.startsWith('chg.')) { S.chg[key.slice(4)] = String(value); if (key === 'chg.title') render(); return undefined; }
    if (key.startsWith('card.') && f) return act(() => v.setCard(f.id, { [key.slice(5)]: value }));
    if (key.startsWith('role:')) return act(() => v.setRole(key.slice(5), value));
    if (key.startsWith('role.')) { S.role[key.slice(5)] = String(value); if (key !== 'role.password') return render(); render(); return undefined; }
    if (key === 'approvals') return act(() => v.setSettings({ requiredApprovals: value }));
    if (key === 'defaultRole') return act(() => v.setSettings({ defaultRole: value }));
    if (key.startsWith('field.')) { S.field[key.slice(6)] = key === 'field.required' ? Boolean(value) : String(value); return render(); }
    return undefined;
  }

  /** A reference's policy (latest / released / a version) changed: the project records it, then resolves it. */
  async function setPolicy(docId, value) {
    const p = ctx.project();
    const d = p && [...p.parts, ...p.assemblies].find((x) => x.id === docId && x.vaultRef);
    if (!d) return undefined;
    const ref = value.startsWith('v') ? { policy: 'version', version: Number(value.slice(1)) } : { policy: value };
    const before = JSON.stringify(d.vaultRef);
    ctx.change('op.refPolicy', (proj) => {
      const x = [...proj.parts, ...proj.assemblies].find((y) => y.id === docId);
      const { version, ...rest } = x.vaultRef;
      void version;
      x.vaultRef = { ...rest, ...ref };
    });
    if (JSON.stringify(d.vaultRef) === before) return render();
    return updateActiveLinks([docId]);
  }

  /**
   * Save on a vault document: check in (keeping it checked out, or releasing it), or save a local copy. A
   * document that is not checked out can only be saved as a local copy.
   */
  async function save(saveLocal) {
    const p = ctx.project();
    const link = p?.vaultLink;
    if (!link) return saveLocal();
    const f = linkedFile();
    if (!f) {
      const choice = await ctx.ask({ title: t('pdm.saveTitle'), message: t('pdm.saveNotConnected', { name: link.name ?? '' }), icon: 'vault', buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'connect', label: t('cmd.vaultExplorer'), icon: 'vaultExplorer' }, { id: 'local', label: t('pdm.saveLocal'), icon: 'save', primary: true }] });
      if (choice === 'connect') openExplorer('files');
      return choice === 'local' ? saveLocal() : false;
    }
    const mine = heldByMe(f);
    const buttons = [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'local', label: t('pdm.saveLocal'), icon: 'save' }];
    if (mine) buttons.push({ id: 'release', label: t('pdm.checkInRelease'), icon: 'vaultCheckIn' }, { id: 'keep', label: t('pdm.checkInKeep'), icon: 'vaultCheckIn', primary: true });
    const choice = await ctx.ask({ title: t('pdm.saveTitle'), message: t(mine ? 'pdm.saveMessage' : 'pdm.saveReadOnly', { name: f.name }), icon: 'vault', buttons });
    if (choice === 'local') return saveLocal();
    if (choice === 'keep' || choice === 'release') return checkInActive({ keepOut: choice === 'keep' });
    return false;
  }

  /** The FeatureManager tree's vault block: the document's references and how many are out of date. */
  function treeExtra() {
    const p = ctx.project(); const v = V();
    if (!p || !v) return '';
    const st = v.linkStatus(p);
    if (!st.length) return '';
    const old = st.filter((x) => x.outdated || x.missing).length;
    return `<div class="tree pdm-tree-refs" role="tree"><div class="pdm-tree-head">${icon('vault', 'icon tiny')}<span>${esc(t('pdm.references', { count: st.length, old }))}</span>${old ? `<button class="icon-button" data-command="vaultUpdateLinks" title="${esc(t('cmd.vaultUpdateLinks'))}">${icon('vaultUpdateLinks', 'icon tiny')}</button>` : ''}</div>
      ${st.map((x) => `<div class="pdm-tree-ref ${x.outdated ? 'old' : ''} ${x.missing ? 'bad' : ''}" title="${esc(`${x.file?.name ?? '?'} — ${t(`pdm.policy.${x.policy}`, { rev: x.doc.vaultRef.version ?? '' })}`)}">${icon(x.outdated || x.missing ? 'warning' : KIND_ICONS[x.kind], 'icon tiny')}<span>${esc(x.doc.name)}</span><span class="muted">${esc(`v${x.resolved ?? '-'}`)}${x.outdated ? ` → v${esc(x.target)}` : ''}</span></div>`).join('')}</div>`;
  }
  // Others may check in while this document is open: read the index again when the window comes back.
  globalThis.addEventListener?.('focus', () => {
    const v = V();
    if (!v || !ctx.project()?.parts?.some((d) => d.vaultRef) && !ctx.project()?.assemblies?.some((d) => d.vaultRef)) return;
    const before = JSON.stringify(v.linkStatus(ctx.project()).map((x) => x.outdated));
    v.refresh().then(() => { if (JSON.stringify(v.linkStatus(ctx.project()).map((x) => x.outdated)) !== before) { ctx.renderAll?.(); render(); } }).catch(() => {});
  });

  // ───────────────────────── commands, menus, tabs

  const commands = {
    vaultExplorer: { icon: 'vaultExplorer', label: 'cmd.vaultExplorer', checked: () => S.open, run: () => (S.open ? closeExplorer() : openExplorer()) },
    vaultCheckIn: { icon: 'vaultCheckIn', label: 'cmd.vaultCheckIn', enabled: () => Boolean(ctx.project()), run: () => checkInActive() },
    vaultCheckOut: { icon: 'vaultCheckOut', label: 'cmd.vaultCheckOut', enabled: () => Boolean(ctx.project()), run: () => checkOutActive() },
    vaultInsert: { icon: 'vaultInsert', label: 'cmd.vaultInsert', enabled: () => Boolean(ctx.activeAssembly()), run: async () => { if (!(await ensureVault())) { notify('info', t('pdm.connectFirst')); return; } openExplorer('files'); notify('info', t('pdm.insertHint')); } },
    vaultUpdateLinks: { icon: 'vaultUpdateLinks', label: 'cmd.vaultUpdateLinks', enabled: () => Boolean(ctx.project()), run: () => updateActiveLinks() },
    vaultPackAndGo: { icon: 'packAndGo', label: 'cmd.packAndGo', run: async () => { if (!(await ensureVault())) { notify('info', t('pdm.connectFirst')); return; } openExplorer('files'); const f = linkedFile(); if (f) S.sel = f.id; S.sub = 'pack'; render(); } },
  };
  const prevBlocks = more.blocks;
  more.blocks = (label) => blocks(label) || prevBlocks(label);
  for (const [tab, ids] of Object.entries({ evaluate: ['vaultExplorer', 'vaultCheckIn', 'vaultCheckOut'], assembly: ['vaultInsert', 'vaultUpdateLinks'] })) more.TABS[tab] = [...(more.TABS[tab] ?? []), '|', ...ids];
  const prevTree = more.treeExtra;
  more.treeExtra = () => `${prevTree()}${treeExtra()}`;
  const prevMenus = more.extendMenus;
  more.extendMenus = (MENUS) => {
    prevMenus(MENUS);
    if (!MENUS.file) return;
    const i = MENUS.file.indexOf('whereUsed');
    MENUS.file.splice(i >= 0 ? i + 1 : MENUS.file.length, 0, '-', 'vaultExplorer', 'vaultCheckIn', 'vaultCheckOut', 'vaultUpdateLinks', 'vaultPackAndGo');
  };

  return {
    commands,
    api: { state: S, poll, startWatch, openExplorer, closeExplorer, connect, logout, ensureVault, action, field, checkInActive, checkOutActive, insertSelected, updateActiveLinks, setPolicy, save, vault: () => S.vault, linkedFile },
  };
}
