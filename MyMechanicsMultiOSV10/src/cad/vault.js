// Product data management: a vault of project files shared by several people (no DOM, no kernel).
//
// A vault is a folder (desktop: one the user picks, possibly on a shared drive; web: IndexedDB) reached through
// a small store (src/platform/vault-store.js; tests use test/fixtures/vault-node-store.js):
//   vault.json                    the index: settings, roles, data cards, files and their histories, changes
//   files/<name>.mymech           the latest checked-in copy of every file
//   history/<id>/<version>.mymech every version ever checked in (never changed afterwards)
//   .locks/<id>.lock              who has a file checked out (created exclusively: only one person can hold it)
//   .locks/index.lock             held while the index is read, changed and written back
//
// Rules:
//   versions vs revisions — every check-in is a new version (1, 2, 3 …); the revision (A, B, C … or 01, 02 …)
//     changes only when a released file is revised under an approved change order;
//   lifecycle — Work in progress → Pending approval → Released → Obsolete, with transitions guarded by role,
//     state, check-out, data card and reference rules; per state what may be done (check out, edit the data
//     card, rename);
//   accounts — the vault keeps its users (name, role, PBKDF2-SHA-256 password hash with its own salt); a
//     Vault is only made by a login, so check-outs, approvals and change orders carry an authenticated name;
//     roles viewer, editor, approver, admin (the vault's creator is admin; admins add users and set roles);
//   change requests (ECR) and change orders (ECO) — approved by approvers other than the author;
//   references — a part or assembly of another vault file is used by reference: the stored file keeps only a
//     stub `{ id, name, vaultRef { vaultId, fileId, name, docId, policy: latest | released | version, version } }`
//     and opening resolves it (recursively) into the referenced file's content at that version — sub-assemblies
//     bring their own parts as nested documents (`vaultNested`, never stored). A file knows itself by
//     `vaultLink { vaultId, fileId }`. The index keeps each file's direct references, giving Where used /
//     Contains trees, rename with reference update, copy tree, Pack and Go and BOMs across files.
import { compareVersions } from './versions.js';

export const VAULT_FORMAT = 'mymechanics-vault';
export const VAULT_VERSION = 1;
export const INDEX = 'vault.json';
export const EXT = '.mymech';
export const STATES = ['wip', 'pending', 'released', 'obsolete'];
export const ROLES = ['viewer', 'editor', 'approver', 'admin'];
const RANK = { viewer: 0, editor: 1, approver: 2, admin: 3 };
export const atLeast = (role, need) => need != null && (RANK[role] ?? -1) >= RANK[need];

/** What each state allows (the least role needed; null = nobody). */
export const STATE_RULES = {
  wip: { checkOut: 'editor', editCard: 'editor', rename: 'editor', copy: 'editor' },
  pending: { checkOut: null, editCard: null, rename: null, copy: 'editor' },
  released: { checkOut: null, editCard: null, rename: 'admin', copy: 'editor' },
  obsolete: { checkOut: null, editCard: null, rename: 'admin', copy: 'admin' },
};

/** The workflow: transitions between states and their conditions. */
export const TRANSITIONS = [
  { id: 'submit', from: 'wip', to: 'pending', role: 'editor', checkedIn: true, card: true },
  { id: 'approve', from: 'pending', to: 'released', role: 'approver', checkedIn: true, refsReleased: true, fourEyes: true },
  { id: 'reject', from: 'pending', to: 'wip', role: 'approver' },
  { id: 'revise', from: 'released', to: 'wip', role: 'editor', order: true, bump: true },
  { id: 'obsolete', from: 'released', to: 'obsolete', role: 'approver', checkedIn: true },
  { id: 'reinstate', from: 'obsolete', to: 'released', role: 'admin' },
];

/** Revision schemes: letters (A … Z without I, O, Q, S, X, Z, then AA, AB …) or two-digit numbers. */
const LETTERS = 'ABCDEFGHJKLMNPRTUVWY';
export const SCHEMES = {
  letter: {
    first: 'A',
    next(r) {
      const digits = String(r).split('').map((c) => LETTERS.indexOf(c));
      if (!digits.length || digits.some((d) => d < 0)) return 'A';
      let i = digits.length - 1;
      while (i >= 0 && digits[i] === LETTERS.length - 1) { digits[i] = 0; i -= 1; }
      if (i < 0) digits.unshift(0); else digits[i] += 1;
      return digits.map((d) => LETTERS[d]).join('');
    },
  },
  number: {
    first: '01',
    next(r) { const n = Number.parseInt(r, 10); return String(Number.isFinite(n) ? n + 1 : 1).padStart(2, '0'); },
  },
};

/** The default data cards: the general one for every file and one more for drawings. */
export const DEFAULT_CARDS = [
  {
    id: 'general', appliesTo: 'all', fields: [
      { key: 'partNumber', type: 'text', required: true },
      { key: 'description', type: 'text', required: true },
      { key: 'material', type: 'text' },
      { key: 'project', type: 'text' },
      { key: 'vendor', type: 'text' },
      { key: 'cost', type: 'number' },
      { key: 'finish', type: 'list', options: ['none', 'anodized', 'painted', 'plated', 'polished'] },
      { key: 'dueDate', type: 'date' },
      { key: 'critical', type: 'bool' },
    ],
  },
  { id: 'drawing', appliesTo: 'drawing', fields: [{ key: 'sheetSize', type: 'list', options: ['A4', 'A3', 'A2', 'A1', 'A0'] }, { key: 'checkedBy', type: 'text' }] },
];
export const FIELD_TYPES = ['text', 'number', 'list', 'date', 'bool'];

export class VaultError extends Error {
  constructor(code, params = {}) { super(`${code}${Object.keys(params).length ? ` ${JSON.stringify(params)}` : ''}`); this.code = code; this.params = params; }
}
const fail = (code, params) => { throw new VaultError(code, params); };

const INDEX_LOCK = '.locks/index.lock';
const STALE_INDEX_MS = 15000;
const lockPath = (id) => `.locks/${id}.lock`;
const latestPath = (name) => `files/${name}`;
const versionPath = (id, v) => `history/${id}/${v}${EXT}`;
let idCounter = 0;
const newId = (prefix) => `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** FNV-1a hash of a text (detects an unchanged check-in). */
export function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

// ───────────────────────── accounts: PBKDF2-SHA-256 (WebCrypto — browsers, the desktop webview and Node)

export const KDF_ITERATIONS = 310000;
const b64 = (bytes) => { let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** The PBKDF2-SHA-256 hash (base64, 32 bytes) of a password with a salt (base64). */
export async function passwordHash(password, salt, iterations = KDF_ITERATIONS) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) fail('noCrypto');
  const key = await subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  return b64(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations }, key, 256));
}
const newSalt = () => b64(globalThis.crypto.getRandomValues(new Uint8Array(16)));
const sameText = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
async function account(password, role, iterations, now) {
  if (String(password ?? '').length < 4) fail('weakPassword');
  const salt = newSalt();
  return { role, salt, iterations, hash: await passwordHash(password, salt, iterations), created: now, disabled: false };
}
const validUser = (name) => { const n = String(name ?? '').trim(); if (!n || n.length > 64 || /[\u0000-\u001f]/.test(n)) fail('badUser', { user: String(name ?? '') }); return n; };
const roleIn = (ix, user) => { const u = ix.users?.[user]; return u && !u.disabled ? u.role : null; };

/** A file name for the vault: trimmed, with the .mymech extension, without folder or reserved characters. */
export function vaultName(name) {
  let n = String(name ?? '').trim();
  if (!n.toLowerCase().endsWith(EXT)) n += EXT;
  const base = n.slice(0, -EXT.length).trim();
  if (!base || /[\\/:*?"<>|\u0000-\u001f]/.test(n) || base === '.' || base === '..') fail('badName', { name: String(name ?? '') });
  return `${base}${EXT}`;
}
const baseOf = (name) => name.slice(0, -EXT.length);

// ───────────────────────── the contents of a project file

const DOC_LISTS = [['parts', 'part'], ['assemblies', 'assembly'], ['drawings', 'drawing']];

/** The documents, references and properties of a project file's text. */
export function describeContent(text) {
  let p;
  try { p = typeof text === 'string' ? JSON.parse(text) : text; } catch { fail('badContent'); }
  if (!p || typeof p !== 'object') fail('badContent');
  const docs = [];
  for (const [list, kind] of DOC_LISTS) for (const d of p[list] ?? []) if (!d.vaultNested) docs.push({ kind, id: d.id, name: d.name ?? '', partNo: d.partNo ?? '', description: d.description ?? '', material: kind === 'part' ? d.material ?? '' : '', linked: d.vaultRef ? { fileId: d.vaultRef.fileId, docId: d.vaultRef.docId } : null });
  const own = docs.filter((d) => !d.linked);
  const main = own.find((d) => d.kind === p.active?.kind && d.id === p.active?.id) ?? own.find((d) => d.kind === 'assembly') ?? own[0] ?? null;
  const refs = [...new Set(docs.filter((d) => d.linked?.fileId).map((d) => d.linked.fileId))];
  const props = {};
  if (main?.partNo) props.partNumber = main.partNo;
  if (main?.description) props.description = main.description;
  if (main?.material) props.material = main.material;
  return { title: p.name ?? '', kind: main?.kind ?? 'part', main: main ? { kind: main.kind, id: main.id } : null, docs, refs, props };
}

/**
 * The stored form of a project text: documents used from other vault files become stubs (id, name, vaultRef),
 * documents they brought along (vaultNested) go, and the project knows its own file (vaultLink).
 */
export function storedContent(text, link = null) {
  let p;
  try { p = typeof text === 'string' ? JSON.parse(text) : JSON.parse(JSON.stringify(text)); } catch { fail('badContent'); }
  if (!p || typeof p !== 'object') fail('badContent');
  for (const [list] of DOC_LISTS) {
    if (!Array.isArray(p[list])) continue;
    p[list] = p[list].filter((d) => !d.vaultNested).map((d) => {
      if (!d.vaultRef) return d;
      const { resolved, ...ref } = d.vaultRef;
      void resolved;
      const stub = { id: d.id, name: d.name, vaultRef: ref };
      if (list === 'assemblies') { stub.components = []; stub.mates = []; }
      return stub;
    });
  }
  if (link) p.vaultLink = { vaultId: link.vaultId, fileId: link.fileId, name: link.name };
  delete p.saved; delete p.vaultDeps;
  return JSON.stringify(p, null, 1);
}

/** Rewrites the vault references of a project text: fn(vaultRef) → new vaultRef (or the same). */
export function rewriteRefs(text, fn) {
  const p = JSON.parse(text);
  let changed = false;
  for (const [list] of DOC_LISTS) for (const d of p[list] ?? []) {
    if (!d.vaultRef) continue;
    const r = fn({ ...d.vaultRef });
    if (r && JSON.stringify(r) !== JSON.stringify(d.vaultRef)) { d.vaultRef = r; changed = true; }
  }
  return { text: changed ? JSON.stringify(p, null, 1) : text, changed };
}

// ───────────────────────── the index

function emptyIndex({ name, scheme, user, now, admin, iterations }) {
  return {
    format: VAULT_FORMAT, version: VAULT_VERSION, id: newId('v'), name: String(name || 'Vault'), created: now, createdBy: user,
    scheme: SCHEMES[scheme] ? scheme : 'letter', defaultRole: 'editor', users: { [user]: admin }, kdfIterations: iterations, requiredApprovals: 1,
    cards: JSON.parse(JSON.stringify(DEFAULT_CARDS)), files: [], changes: [], counters: { ecr: 0, eco: 0 },
  };
}

function checkIndex(raw) {
  if (!raw || raw.format !== VAULT_FORMAT || !Array.isArray(raw.files)) fail('notVault');
  raw.changes ??= []; raw.counters ??= { ecr: 0, eco: 0 }; raw.cards ??= JSON.parse(JSON.stringify(DEFAULT_CARDS));
  raw.id ??= `v-${hashText(`${raw.created}|${raw.createdBy}|${raw.name}`)}`;
  // A vault from before accounts: its role list becomes users without a password (set at the first login).
  if (!raw.users) { raw.users = Object.fromEntries(Object.entries(raw.roles ?? {}).map(([u, r]) => [u, { role: r, salt: null, hash: null, iterations: KDF_ITERATIONS, disabled: false }])); delete raw.roles; }
  raw.kdfIterations ??= KDF_ITERATIONS;
  raw.defaultRole ??= 'editor'; raw.requiredApprovals ??= 1; raw.scheme = SCHEMES[raw.scheme] ? raw.scheme : 'letter';
  return raw;
}

export class Vault {
  /**
   * Made by Vault.create / Vault.login only. store — { read, write, createExclusive, removeLock, rename, list };
   * user — the logged-in name; host — the computer (lock files say who holds a file where); now() — the time
   * as ISO text (tests move it).
   */
  constructor(store, { user, host = '', now = () => new Date().toISOString() } = {}) {
    if (!user) fail('noUser');
    this.store = store; this.user = String(user); this.host = String(host); this.now = now; this.index = null;
  }

  /** Makes a new vault in an empty folder (refused where there is one); its creator is the first admin. */
  static async create(store, { name, scheme = 'letter', user, password, kdfIterations = KDF_ITERATIONS, ...opts }) {
    const u = validUser(user);
    const v = new Vault(store, { user: u, ...opts });
    if (await store.read(INDEX)) fail('exists', { name: INDEX });
    const now = v.now();
    v.index = emptyIndex({ name, scheme, user: u, now, iterations: kdfIterations, admin: await account(password, 'admin', kdfIterations, now) });
    await store.write(INDEX, JSON.stringify(v.index, null, 1));
    v.session = { user: u, since: now };
    return v;
  }

  /**
   * Logs in: the password is checked against the user's PBKDF2 hash. A user without a password yet (an
   * older vault) sets it now. Disabled or unknown users and wrong passwords give 'badLogin'.
   */
  static async login(store, { user, password, ...opts }) {
    const v = new Vault(store, { user: validUser(user), ...opts });
    await v.refresh();
    const acc = v.index.users[v.user];
    if (!acc || acc.disabled) fail('badLogin');
    if (!acc.hash) {
      await v.mutate(async (ix) => { Object.assign(ix.users[v.user], await account(password, ix.users[v.user].role, ix.kdfIterations, v.now())); });
    } else if (!sameText(await passwordHash(password, acc.salt, acc.iterations ?? KDF_ITERATIONS), acc.hash)) fail('badLogin');
    v.session = { user: v.user, since: v.now() };
    return v;
  }

  /** The vault's id (references and document links name it). */
  get id() { return this.index?.id ?? null; }

  async refresh() {
    const text = await this.store.read(INDEX);
    if (!text) fail('notVault');
    let raw;
    try { raw = JSON.parse(text); } catch { fail('notVault'); }
    this.index = checkIndex(raw);
    return this.index;
  }

  // ── locking of the index: read → change → write while holding .locks/index.lock

  async lockIndex() {
    for (let i = 0; i < 120; i++) {
      const stamp = JSON.stringify({ by: this.user, host: this.host, time: this.now(), at: Date.now() });
      if (await this.store.createExclusive(INDEX_LOCK, stamp)) return;
      const held = await this.store.read(INDEX_LOCK).catch(() => null);
      let at = 0;
      try { at = JSON.parse(held ?? '{}').at ?? 0; } catch { at = 0; }
      if (held != null && Date.now() - at > STALE_INDEX_MS) { await this.store.removeLock(INDEX_LOCK); continue; }
      await wait(25 + Math.random() * 25);
    }
    fail('indexBusy');
  }

  /** Runs fn(index) on a fresh copy of the index and writes it back (all changes go through here). */
  async mutate(fn) {
    await this.lockIndex();
    try {
      await this.refresh();
      const result = await fn(this.index);
      await this.store.write(INDEX, JSON.stringify(this.index, null, 1));
      return result;
    } finally {
      await this.store.removeLock(INDEX_LOCK);
    }
  }

  // ── users and roles

  roleOf(user = this.user) { return roleIn(this.index, user); }
  get role() { return this.roleOf() ?? 'viewer'; }
  need(role) { if (!atLeast(this.roleOf(), role)) fail('permission', { role: this.role, need: role }); }
  /** The users: [{ name, role, disabled, created, hasPassword }] (no hashes). */
  get users() { return Object.entries(this.index?.users ?? {}).map(([name, u]) => ({ name, role: u.role, disabled: Boolean(u.disabled), created: u.created ?? '', hasPassword: Boolean(u.hash) })); }

  adminIn(ix) { if (!atLeast(roleIn(ix, this.user), 'admin')) fail('permission', { need: 'admin' }); }
  lastAdminCheck(ix, user, { role = null, disabled = false } = {}) {
    const admins = Object.entries(ix.users).filter(([, u]) => u.role === 'admin' && !u.disabled).map(([n]) => n);
    if (admins.length === 1 && admins[0] === user && (disabled || (role && role !== 'admin'))) fail('lastAdmin');
  }

  /** Adds a user account (admin). */
  async addUser(user, password, role = null) {
    const u = validUser(user);
    const r = role ?? this.index.defaultRole ?? 'editor';
    if (!ROLES.includes(r)) fail('badRole', { role: r });
    const acc = await account(password, r, this.index.kdfIterations ?? KDF_ITERATIONS, this.now());
    return this.mutate((ix) => {
      this.adminIn(ix);
      if (ix.users[u]) fail('userExists', { user: u });
      ix.users[u] = acc;
    });
  }

  async setRole(user, role) {
    if (!ROLES.includes(role)) fail('badRole', { role });
    return this.mutate((ix) => {
      this.adminIn(ix);
      if (!ix.users[user]) fail('noSuchUser', { user });
      this.lastAdminCheck(ix, user, { role });
      ix.users[user].role = role;
    });
  }

  /** Disables (or enables again) a user: a disabled user cannot log in (admin; not the last admin). */
  async setDisabled(user, disabled = true) {
    return this.mutate((ix) => {
      this.adminIn(ix);
      if (!ix.users[user]) fail('noSuchUser', { user });
      if (disabled) this.lastAdminCheck(ix, user, { disabled: true });
      ix.users[user].disabled = Boolean(disabled);
    });
  }

  /** Sets a user's password: an admin for anyone; a user for themself with the old password. */
  async setPassword(user, password, { old = null } = {}) {
    const acc = this.index.users[user];
    if (!acc) fail('noSuchUser', { user });
    if (user === this.user && !atLeast(this.roleOf(), 'admin')) {
      if (acc.hash && !sameText(await passwordHash(old ?? '', acc.salt, acc.iterations ?? KDF_ITERATIONS), acc.hash)) fail('badLogin');
    } else this.need('admin');
    const fresh = await account(password, acc.role, this.index.kdfIterations ?? KDF_ITERATIONS, this.now());
    return this.mutate((ix) => { Object.assign(ix.users[user], { salt: fresh.salt, hash: fresh.hash, iterations: fresh.iterations }); });
  }

  async setSettings({ scheme, defaultRole, requiredApprovals, name } = {}) {
    return this.mutate((ix) => {
      if (!atLeast(roleIn(ix, this.user), 'admin')) fail('permission', { need: 'admin' });
      if (scheme != null) {
        if (!SCHEMES[scheme]) fail('badScheme', { scheme });
        if (scheme !== ix.scheme && ix.files.some((f) => f.released || f.revision !== SCHEMES[ix.scheme].first)) fail('schemeInUse');
        if (scheme !== ix.scheme) for (const f of ix.files) { f.revision = SCHEMES[scheme].first; for (const v of f.versions) v.revision = f.revision; }
        ix.scheme = scheme;
      }
      if (defaultRole != null) { if (!ROLES.includes(defaultRole) || defaultRole === 'admin') fail('badRole', { role: defaultRole }); ix.defaultRole = defaultRole; }
      if (requiredApprovals != null) ix.requiredApprovals = Math.max(1, Math.min(5, Math.round(Number(requiredApprovals)) || 1));
      if (name != null && String(name).trim()) ix.name = String(name).trim();
    });
  }

  // ── files

  get files() { return this.index?.files ?? []; }
  file(id) { return this.files.find((f) => f.id === id) ?? null; }
  fileByName(name) { const n = String(name).toLowerCase(); return this.files.find((f) => f.name.toLowerCase() === n) ?? null; }
  mustFile(ix, id) { const f = ix.files.find((x) => x.id === id); if (!f) fail('missing', { id }); return f; }

  /** What the current user may do with a file now: { checkOut, checkIn, undo, editCard, rename, copy, transitions }. */
  allowed(id) {
    const f = this.file(id);
    if (!f) return null;
    const rules = STATE_RULES[f.state] ?? {};
    const mine = f.checkout?.by === this.user;
    const free = !f.checkout;
    return {
      checkOut: free && atLeast(this.role, rules.checkOut),
      checkIn: mine,
      undo: mine || (Boolean(f.checkout) && atLeast(this.role, 'admin')),
      editCard: (mine || free) && atLeast(this.role, rules.editCard),
      rename: (mine || free) && atLeast(this.role, rules.rename),
      copy: atLeast(this.role, rules.copy),
      transitions: this.transitionsOf(id).map((t) => t.id),
    };
  }

  /** Adds a new file (version 1, Work in progress, first revision of the scheme). */
  async addFile(name, content, { comment = '', keepOut = false, id = newId('f') } = {}) {
    this.need('editor');
    const n = vaultName(name);
    content = storedContent(content, { vaultId: this.id, fileId: id, name: n });
    const info = describeContent(content);
    if (this.files.some((f) => f.id === id)) fail('exists', { name: id });
    return this.mutate(async (ix) => {
      if (ix.files.some((f) => f.name.toLowerCase() === n.toLowerCase())) fail('exists', { name: n });
      for (const r of info.refs) if (!ix.files.some((f) => f.id === r)) fail('badRef', { id: r });
      const time = this.now();
      const revision = SCHEMES[ix.scheme].first;
      await this.store.write(versionPath(id, 1), content);
      await this.store.write(latestPath(n), content);
      const f = {
        id, name: n, kind: info.kind, title: info.title, created: time, createdBy: this.user, state: 'wip', revision, version: 1,
        checkout: null, card: {}, props: { ...info.props }, docs: info.docs, refs: info.refs, released: null,
        versions: [{ version: 1, revision, time, by: this.user, comment: String(comment), hash: hashText(content), size: content.length, state: 'wip' }],
        events: [{ type: 'add', by: this.user, time, comment: String(comment) }],
      };
      ix.files.push(f);
      if (keepOut) {
        if (!(await this.store.createExclusive(lockPath(id), this.lockText()))) fail('held', { by: '?' });
        f.checkout = { by: this.user, host: this.host, time };
      }
      return f;
    });
  }

  lockText() { return JSON.stringify({ by: this.user, host: this.host, time: this.now() }); }

  async readLock(id) {
    const text = await this.store.read(lockPath(id));
    if (text == null) return null;
    try { return JSON.parse(text); } catch { return { by: '?', host: '', time: '' }; }
  }

  /** Checks a file out to the current user (the lock file is the authority; the index shows it). */
  async checkOut(id) {
    await this.refresh();
    const f = this.file(id) ?? fail('missing', { id });
    const need = STATE_RULES[f.state]?.checkOut;
    if (!need) fail('state', { state: f.state });
    this.need(need);
    if (!(await this.store.createExclusive(lockPath(id), this.lockText()))) {
      const held = await this.readLock(id);
      if (!(held?.by === this.user && held?.host === this.host)) fail('held', { by: held?.by ?? '?', host: held?.host ?? '' });
    }
    try {
      return await this.mutate((ix) => {
        const x = this.mustFile(ix, id);
        if (!STATE_RULES[x.state]?.checkOut) fail('state', { state: x.state });
        x.checkout = { by: this.user, host: this.host, time: this.now() };
        x.events.push({ type: 'checkOut', by: this.user, time: x.checkout.time });
        return x;
      });
    } catch (error) {
      await this.store.removeLock(lockPath(id));
      throw error;
    }
  }

  async assertHolder(id) {
    const held = await this.readLock(id);
    if (!held) fail('notOut');
    if (held.by !== this.user) fail('held', { by: held.by, host: held.host ?? '' });
  }

  /**
   * Checks in new content of a checked-out file: a new version (same revision), the latest copy replaced,
   * documents / references / properties read again. Unchanged content adds no version. The lock is released
   * unless keepOut.
   */
  async checkIn(id, content, { comment = '', keepOut = false, event = 'checkIn' } = {}) {
    await this.assertHolder(id);
    content = storedContent(content, { vaultId: this.id, fileId: id, name: this.file(id)?.name ?? '' });
    const info = describeContent(content);
    const result = await this.mutate(async (ix) => {
      const f = this.mustFile(ix, id);
      for (const r of info.refs) if (r !== id && !ix.files.some((x) => x.id === r)) fail('badRef', { id: r });
      if (this.wouldCycle(ix, id, info.refs)) fail('cycle');
      const hash = hashText(content);
      const last = f.versions.at(-1);
      const time = this.now();
      let added = false;
      if (!last || last.hash !== hash) {
        const v = f.version + 1;
        await this.store.write(versionPath(id, v), content);
        await this.store.write(latestPath(f.name), content);
        f.version = v;
        f.versions.push({ version: v, revision: f.revision, time, by: this.user, comment: String(comment), hash, size: content.length, state: f.state });
        f.kind = info.kind; f.title = info.title; f.docs = info.docs; f.refs = info.refs;
        f.props = { ...info.props };
        added = true;
      }
      f.events.push({ type: event, by: this.user, time, comment: String(comment), version: f.version });
      if (!keepOut) f.checkout = null;
      return { file: f, added };
    });
    if (!keepOut) await this.store.removeLock(lockPath(id));
    return result;
  }

  wouldCycle(ix, id, refs) {
    const seen = new Set();
    const walk = (x) => {
      if (x === id) return true;
      if (seen.has(x)) return false;
      seen.add(x);
      return (ix.files.find((f) => f.id === x)?.refs ?? []).some(walk);
    };
    return refs.some(walk);
  }

  /** Undoes a check-out (no new version). An admin can break someone else's lock. */
  async undoCheckOut(id) {
    const held = await this.readLock(id);
    if (held && held.by !== this.user) this.need('admin');
    await this.mutate((ix) => {
      const f = this.mustFile(ix, id);
      f.events.push({ type: held && held.by !== this.user ? 'breakLock' : 'undoCheckOut', by: this.user, time: this.now(), comment: held?.by ?? '' });
      f.checkout = null;
    });
    await this.store.removeLock(lockPath(id));
  }

  async latest(id) { const f = this.file(id) ?? fail('missing', { id }); return this.versionContent(id, f.version); }
  async versionContent(id, v) {
    const text = await this.store.read(versionPath(id, Number(v)));
    if (text == null) fail('missingVersion', { version: v });
    return text;
  }

  // ── lifecycle

  /** The transitions the current user may take now (each with `blocked` = the reason it cannot, or null). */
  transitionsOf(id, { all = false } = {}) {
    const f = this.file(id);
    if (!f) return [];
    return TRANSITIONS.filter((t) => t.from === f.state).map((t) => ({ ...t, blocked: this.blockOf(this.index, f, t) })).filter((t) => all || !t.blocked);
  }

  blockOf(ix, f, t, { order = null } = {}) {
    const role = roleIn(ix, this.user);
    if (!atLeast(role, t.role)) return { code: 'permission', params: { need: t.role } };
    if (t.checkedIn && f.checkout) return { code: 'checkedOut', params: { by: f.checkout.by } };
    if (t.card) {
      const missing = this.missingFields(ix, f);
      if (missing.length) return { code: 'cardRequired', params: { fields: missing.join(', ') } };
    }
    if (t.fourEyes && !atLeast(role, 'admin')) {
      const submit = [...f.events].reverse().find((e) => e.type === 'transition' && e.transition === 'submit');
      if (submit?.by === this.user) return { code: 'fourEyes' };
    }
    if (t.refsReleased) {
      const open = f.refs.map((r) => ix.files.find((x) => x.id === r)).filter((x) => x && x.state !== 'released').map((x) => x.name);
      if (open.length) return { code: 'refsNotReleased', params: { names: open.join(', ') } };
    }
    if (t.order && !atLeast(role, 'admin')) {
      const eco = this.orderFor(ix, f.id, order);
      if (!eco) return { code: 'needsOrder' };
    }
    return null;
  }

  orderFor(ix, fileId, number = null) {
    return ix.changes.find((c) => c.type === 'eco' && c.status === 'approved' && c.files.includes(fileId) && (!number || c.id === number || c.number === number)) ?? null;
  }

  missingFields(ix, f) {
    const values = { ...f.props, ...f.card };
    return this.cardsFor(f.kind, ix).flatMap((c) => c.fields).filter((fl) => fl.required && (values[fl.key] == null || values[fl.key] === '')).map((fl) => fl.key);
  }

  /** Moves a file along the workflow. */
  async transition(id, transitionId, { comment = '', order = null } = {}) {
    return this.mutate((ix) => {
      const f = this.mustFile(ix, id);
      const t = TRANSITIONS.find((x) => x.id === transitionId && x.from === f.state);
      if (!t) fail('state', { state: f.state, transition: transitionId });
      const block = this.blockOf(ix, f, t, { order });
      if (block) fail(block.code, block.params);
      const time = this.now();
      const from = f.state;
      const event = { type: 'transition', transition: t.id, from, to: t.to, by: this.user, time, comment: String(comment), version: f.version, revision: f.revision };
      if (t.bump) {
        const eco = this.orderFor(ix, id, order);
        f.revision = SCHEMES[ix.scheme].next(f.revision);
        event.revision = f.revision;
        if (eco) { event.order = eco.number; eco.log.push({ action: 'revise', by: this.user, time, file: f.name, revision: f.revision }); }
      }
      if (t.to === 'released') f.released = { revision: f.revision, version: f.version, time, by: this.user };
      f.state = t.to;
      const last = f.versions.at(-1);
      if (last && last.revision === f.revision) last.state = t.to;
      f.events.push(event);
      return f;
    });
  }

  // ── data cards

  cardsFor(kind, ix = this.index) { return (ix.cards ?? []).filter((c) => c.appliesTo === 'all' || c.appliesTo === kind); }

  /** The values of a file's data cards: the user's values over the ones read from the file. */
  cardValues(id) { const f = this.file(id); return f ? { ...f.props, ...f.card } : {}; }

  /** Sets data card values (checked out by the user, or free in a state that allows card edits). */
  async setCard(id, values) {
    return this.mutate((ix) => {
      const f = this.mustFile(ix, id);
      const need = STATE_RULES[f.state]?.editCard;
      if (!need) fail('state', { state: f.state });
      if (!atLeast(roleIn(ix, this.user), need)) fail('permission', { need });
      if (f.checkout && f.checkout.by !== this.user) fail('held', { by: f.checkout.by });
      const fields = new Map(this.cardsFor(f.kind, ix).flatMap((c) => c.fields).map((fl) => [fl.key, fl]));
      for (const [key, raw] of Object.entries(values)) {
        const fl = fields.get(key);
        if (!fl) fail('badField', { key });
        f.card[key] = coerceField(fl, raw);
        if (f.card[key] === '' || f.card[key] == null) delete f.card[key];
      }
      f.events.push({ type: 'card', by: this.user, time: this.now(), comment: Object.keys(values).join(', ') });
      return { ...f.props, ...f.card };
    });
  }

  /** Adds a custom field to a card (admin). */
  async addCardField(cardId, field) {
    return this.mutate((ix) => {
      if (!atLeast(roleIn(ix, this.user), 'admin')) fail('permission', { need: 'admin' });
      const card = ix.cards.find((c) => c.id === cardId) ?? fail('missing', { id: cardId });
      const key = String(field.key ?? '').trim();
      if (!/^[A-Za-z][\w-]{0,39}$/.test(key)) fail('badField', { key });
      if (ix.cards.some((c) => c.fields.some((f) => f.key === key))) fail('exists', { name: key });
      if (!FIELD_TYPES.includes(field.type ?? 'text')) fail('badField', { key });
      const out = { key, type: field.type ?? 'text', label: String(field.label ?? key), required: Boolean(field.required) };
      if (out.type === 'list') out.options = (field.options ?? []).map(String).filter(Boolean);
      card.fields.push(out);
      return out;
    });
  }

  // ── history

  /** Differences between two versions of a file (versions.js compare). */
  async compare(id, a, b, opts = {}) {
    const [A, B] = await Promise.all([this.versionContent(id, a), this.versionContent(id, b)]);
    const snap = (text) => { const p = JSON.parse(text); return JSON.stringify({ name: p.name, units: p.units, parts: p.parts ?? [], assemblies: p.assemblies ?? [], drawings: p.drawings ?? [] }); };
    const diff = compareVersions({ versions: [{ n: 1, data: snap(A) }, { n: 2, data: snap(B) }] }, 1, 2, opts);
    return { ...diff, from: Number(a), to: Number(b) };
  }

  /** Rolls a file back: the content of version v checked in as a new version (the file must be checkable out). */
  async rollback(id, v, { comment = '' } = {}) {
    const content = await this.versionContent(id, v);
    const f = this.file(id) ?? fail('missing', { id });
    const ownLock = f.checkout?.by === this.user;
    if (!ownLock) await this.checkOut(id);
    return this.checkIn(id, content, { comment: comment || `rollback ${v}`, keepOut: ownLock, event: 'rollback' });
  }

  // ── references

  /** Files a file uses, as a tree: { file, children } (loops cut). */
  contains(id, seen = new Set()) {
    const f = this.file(id);
    if (!f) return null;
    if (seen.has(id)) return { file: f, children: [], loop: true };
    const next = new Set(seen).add(id);
    return { file: f, children: f.refs.map((r) => this.contains(r, next)).filter(Boolean) };
  }

  /** Files that use a file (directly or through others), as a tree: { file, children (the users) }. */
  whereUsed(id, seen = new Set()) {
    const f = this.file(id);
    if (!f) return null;
    if (seen.has(id)) return { file: f, children: [], loop: true };
    const next = new Set(seen).add(id);
    return { file: f, children: this.files.filter((x) => x.refs.includes(id)).map((x) => this.whereUsed(x.id, next)) };
  }

  /** Every file below `id` (itself first). */
  closure(id) {
    const out = [];
    const walk = (x) => { if (out.includes(x) || !this.file(x)) return; out.push(x); for (const r of this.file(x).refs) walk(r); };
    walk(id);
    return out;
  }

  /**
   * Renames a file and updates the references to it: each file that uses it gets a new version whose
   * vaultRef names say the new name. Refused while one of them is checked out by someone else.
   */
  async rename(id, newName) {
    const n = vaultName(newName);
    await this.refresh();
    const f = this.file(id) ?? fail('missing', { id });
    const need = STATE_RULES[f.state]?.rename;
    if (!need) fail('state', { state: f.state });
    this.need(need);
    if (f.checkout && f.checkout.by !== this.user) fail('held', { by: f.checkout.by });
    if (n === f.name) return { file: f, updated: [] };
    const clash = this.fileByName(n);
    if (clash && clash.id !== id) fail('exists', { name: n });
    const users = this.files.filter((x) => x.refs.includes(id));
    const busy = users.filter((x) => x.checkout);
    if (busy.length) fail('parentOut', { names: busy.map((x) => `${x.name} (${x.checkout.by})`).join(', ') });
    const old = f.name;
    const updated = [];
    await this.mutate(async (ix) => {
      const x = this.mustFile(ix, id);
      if (ix.files.some((y) => y.id !== id && y.name.toLowerCase() === n.toLowerCase())) fail('exists', { name: n });
      await this.store.rename(latestPath(old), latestPath(n));
      x.name = n;
      x.events.push({ type: 'rename', by: this.user, time: this.now(), comment: `${old} → ${n}` });
      for (const u of ix.files.filter((y) => y.refs.includes(id))) {
        if (u.checkout) fail('parentOut', { names: u.name });
        const text = await this.store.read(versionPath(u.id, u.version));
        const r = rewriteRefs(text, (ref) => (ref.fileId === id ? { ...ref, name: n } : ref));
        if (!r.changed) continue;
        const v = u.version + 1;
        await this.store.write(versionPath(u.id, v), r.text);
        await this.store.write(latestPath(u.name), r.text);
        u.version = v;
        u.versions.push({ version: v, revision: u.revision, time: this.now(), by: this.user, comment: `${old} → ${n}`, hash: hashText(r.text), size: r.text.length, state: u.state });
        u.docs = describeContent(r.text).docs;
        u.events.push({ type: 'refUpdate', by: this.user, time: this.now(), comment: `${old} → ${n}`, version: v });
        updated.push(u.name);
      }
    });
    return { file: this.file(id), updated };
  }

  /**
   * Copies a file and (some of) the files it uses as new files: names = { [fileId]: newName } (missing ones
   * get prefix + name + suffix); include = the ids to copy (default all of the tree). The copies point at
   * each other; references to files not copied keep pointing at the originals.
   */
  async copyTree(rootId, { include = null, names = {}, prefix = '', suffix = ' (copy)', comment = '' } = {}) {
    await this.refresh();
    const ids = (include ? this.closure(rootId).filter((x) => x === rootId || include.includes(x)) : this.closure(rootId));
    for (const x of ids) { const need = STATE_RULES[this.file(x).state]?.copy; if (!need) fail('state', { state: this.file(x).state }); this.need(need); }
    const plan = ids.map((x) => ({ from: this.file(x), name: vaultName(names[x] ?? `${prefix}${baseOf(this.file(x).name)}${suffix}`), id: newId('f') }));
    const taken = new Set(this.files.map((f) => f.name.toLowerCase()));
    for (const p of plan) { if (taken.has(p.name.toLowerCase())) fail('exists', { name: p.name }); taken.add(p.name.toLowerCase()); }
    const map = new Map(plan.map((p) => [p.from.id, p]));
    const contents = await Promise.all(plan.map((p) => this.versionContent(p.from.id, p.from.version)));
    return this.mutate(async (ix) => {
      const time = this.now();
      const revision = SCHEMES[ix.scheme].first;
      const out = [];
      for (const [i, p] of plan.entries()) {
        const { text: moved } = rewriteRefs(contents[i], (ref) => { const m = map.get(ref.fileId); return m ? { ...ref, fileId: m.id, name: m.name, ...(ref.policy === 'version' ? { version: 1 } : {}) } : ref; });
        const text = storedContent(moved, { vaultId: ix.id, fileId: p.id, name: p.name });
        const info = describeContent(text);
        await this.store.write(versionPath(p.id, 1), text);
        await this.store.write(latestPath(p.name), text);
        const note = comment || `${p.from.name} ${p.from.revision}.${p.from.version}`;
        const f = {
          id: p.id, name: p.name, kind: info.kind, title: info.title, created: time, createdBy: this.user, state: 'wip', revision, version: 1, checkout: null,
          card: { ...p.from.card }, props: { ...info.props }, docs: info.docs, refs: info.refs, released: null, copiedFrom: { id: p.from.id, revision: p.from.revision, version: p.from.version },
          versions: [{ version: 1, revision, time, by: this.user, comment: note, hash: hashText(text), size: text.length, state: 'wip' }],
          events: [{ type: 'copy', by: this.user, time, comment: note }],
        };
        ix.files.push(f);
        out.push(f);
      }
      return { files: out, map: Object.fromEntries(plan.map((p) => [p.from.id, p.id])) };
    });
  }

  /**
   * Pack and Go: a file and everything it uses (and optionally the drawings of those files) as plain files
   * with their references renamed to the packed names, plus a manifest. version: 'latest' or 'released'
   * (the last released version where there is one). Returns { files: [{ name, content, fileId, revision,
   * version }], manifest }.
   */
  async packAndGo(rootId, { includeDrawings = false, prefix = '', suffix = '', version = 'latest' } = {}) {
    await this.refresh();
    if (!this.file(rootId)) fail('missing', { id: rootId });
    const ids = this.closure(rootId);
    if (includeDrawings) {
      for (const x of [...ids]) for (const d of this.files.filter((f) => f.kind === 'drawing' && f.refs.includes(x))) if (!ids.includes(d.id)) ids.push(d.id);
    }
    const pick = (f) => (version === 'released' && f.released ? { version: f.released.version, revision: f.released.revision } : { version: f.version, revision: f.revision });
    const names = new Map(ids.map((x) => [x, `${prefix}${baseOf(this.file(x).name)}${suffix}${EXT}`]));
    const files = [];
    for (const x of ids) {
      const f = this.file(x);
      const p = pick(f);
      // Resolved: the packed file holds the content of what it uses (it opens without the vault); its stubs'
      // vaultRef keep pointing at the packed names so the set can be checked into a vault again.
      const proj = await this.resolvedProject(x, p.version);
      delete proj.vaultLink;
      const { text: out } = rewriteRefs(JSON.stringify(proj, null, 1), (ref) => (names.has(ref.fileId) ? { ...ref, name: names.get(ref.fileId) } : ref));
      files.push({ name: names.get(x), content: out, fileId: x, source: f.name, revision: p.revision, version: p.version, state: f.state });
    }
    const manifest = {
      format: 'mymechanics-pack', created: this.now(), by: this.user, vault: this.index.name, root: names.get(rootId),
      files: files.map(({ name, fileId, source, revision, version: v, state }) => ({ name, fileId, source, revision, version: v, state })),
    };
    return { files, manifest, entries: [...files.map((f) => ({ name: f.name, content: f.content })), { name: 'packandgo.json', content: JSON.stringify(manifest, null, 1) }] };
  }

  // ── references: resolving stubs into content

  /** The version a reference asks for now: latest, the released one (null when none), or a fixed version. */
  targetVersion(ref) {
    const f = this.file(ref?.fileId);
    if (!f) return null;
    if (ref.policy === 'released') return f.released?.version ?? null;
    if (ref.policy === 'version') { const v = Number(ref.version); return f.versions.some((x) => x.version === v) ? v : null; }
    return f.version;
  }

  /** A file's content at a version with every reference resolved (recursively; loops refused). */
  async resolvedProject(fileId, version, { seen = new Set(), cache = new Map() } = {}) {
    if (seen.has(fileId)) fail('cycle');
    const key = `${fileId}@${version}`;
    if (!cache.has(key)) {
      cache.set(key, (async () => {
        const p = JSON.parse(await this.versionContent(fileId, version));
        const links = await this.resolveLinks(p, { seen: new Set(seen).add(fileId), cache });
        p.vaultDeps = depsOf(links);
        return JSON.stringify(p);
      })());
    }
    return JSON.parse(await cache.get(key));
  }

  /**
   * Resolves the stubs of a project in place (each to the version its policy asks for) and returns their
   * status: [{ doc, kind, file, policy, version, missing }].
   */
  async resolveLinks(project, { seen = new Set(), cache = new Map(), only = null } = {}) {
    const out = [];
    for (const [list, kind] of [['parts', 'part'], ['assemblies', 'assembly']]) {
      for (const stub of [...(project[list] ?? [])].filter((d) => d.vaultRef && (!only || only.includes(d.id)))) {
        const f = this.file(stub.vaultRef.fileId);
        const v = this.targetVersion(stub.vaultRef);
        if (!f || v == null) { out.push({ doc: stub, kind, file: f, policy: stub.vaultRef.policy ?? 'latest', version: null, missing: true }); continue; }
        const src = await this.resolvedProject(f.id, v, { seen, cache });
        importLinked(project, stub, src, { file: f, version: v, revision: f.versions.find((x) => x.version === v)?.revision ?? f.revision });
        out.push({ doc: stub, kind, file: f, policy: stub.vaultRef.policy ?? 'latest', version: v, missing: false, deps: src.vaultDeps ?? {} });
      }
    }
    return out;
  }

  /** The references of an open project: [{ doc, kind, file, policy, resolved, target, outdated, missing }]. */
  linkStatus(project) {
    const out = [];
    for (const [list, kind] of [['parts', 'part'], ['assemblies', 'assembly']]) {
      for (const d of project?.[list] ?? []) {
        if (!d.vaultRef || (d.vaultRef.vaultId && this.id && d.vaultRef.vaultId !== this.id)) continue;
        const file = this.file(d.vaultRef.fileId);
        const target = this.targetVersion(d.vaultRef);
        const resolved = d.vaultRef.resolved?.version ?? null;
        // Out of date: the file itself moved on, or a file it uses (at any depth) did.
        const stale = Object.entries(d.vaultRef.resolved?.deps ?? {}).filter(([fileId, x]) => this.targetVersion({ fileId, policy: x.policy, version: x.pinned }) !== x.version).map(([fileId]) => this.file(fileId)?.name ?? fileId);
        out.push({ doc: d, kind, file, policy: d.vaultRef.policy ?? 'latest', resolved, target, stale, outdated: Boolean(file && target != null && (resolved !== target || stale.length)), missing: !file || target == null });
      }
    }
    return out;
  }

  /**
   * A stub for a document of a vault file, ready to put into a project and resolve: { kind, doc }.
   * policy: 'latest' | 'released' | 'version' (with version).
   */
  makeStub(fileId, docId, { policy = 'latest', version = null, newId: makeId = (x) => newId(x) } = {}) {
    const f = this.file(fileId) ?? fail('missing', { id: fileId });
    const d = f.docs.find((x) => x.id === docId && !x.linked) ?? fail('missing', { id: docId });
    if (d.kind === 'drawing') fail('notModel');
    const ref = { vaultId: this.id, fileId, name: f.name, docId, policy, ...(policy === 'version' ? { version: Number(version) } : {}) };
    const doc = { id: makeId(d.kind === 'part' ? 'part' : 'asm'), name: d.name, vaultRef: ref };
    if (d.kind === 'assembly') { doc.components = []; doc.mates = []; }
    return { kind: d.kind, doc };
  }

  /**
   * Prepares bringing references up to date: [{ id, src, file, version, revision }] for the outdated stubs (or
   * those named in `only`), read from the vault; applyLinks() then puts them in (synchronously, e.g. inside an
   * undoable change).
   */
  async prepareLinks(project, { only = null, all = false } = {}) {
    await this.refresh();
    const cache = new Map();
    const out = [];
    for (const st of this.linkStatus(project)) {
      if (st.missing || (only ? !only.includes(st.doc.id) : !all && !st.outdated)) continue;
      const src = await this.resolvedProject(st.file.id, st.target, { cache, seen: new Set(project.vaultLink?.fileId ? [project.vaultLink.fileId] : []) });
      out.push({ id: st.doc.id, src, file: st.file, version: st.target, revision: st.file.versions.find((x) => x.version === st.target)?.revision ?? st.file.revision });
    }
    return out;
  }

  /** Links a document of a vault file into a project (stub + resolution). Returns { kind, doc }. */
  async link(project, fileId, docId, opts = {}) {
    await this.refresh();
    const { kind, doc } = this.makeStub(fileId, docId, opts);
    if (project.vaultLink?.fileId && (project.vaultLink.fileId === fileId || this.closure(fileId).includes(project.vaultLink.fileId))) fail('cycle');
    const v = this.targetVersion(doc.vaultRef);
    if (v == null) fail('missingVersion', { version: opts.version ?? '-' });
    project[kind === 'part' ? 'parts' : 'assemblies'].push(doc);
    const src = await this.resolvedProject(fileId, v);
    const f = this.file(fileId);
    importLinked(project, doc, src, { file: f, version: v, revision: f.versions.find((x) => x.version === v)?.revision ?? f.revision });
    return { kind, doc };
  }

  /** Brings the outdated references of a project up to date (reads the vault). Returns the names updated. */
  async updateLinks(project, opts = {}) { return applyLinks(project, await this.prepareLinks(project, opts)); }

  // ── search and BOM

  /** Files matching: text (anywhere), partNumber, description, material, state, kind (substrings, any case). */
  search(q = {}) {
    const has = (value, needle) => String(value ?? '').toLowerCase().includes(String(needle).toLowerCase());
    return this.files.filter((f) => {
      const values = { ...f.props, ...f.card };
      const own = f.docs.filter((d) => !d.linked);
      const field = (key, docKey) => has(values[key], q[key]) || own.some((d) => has(d[docKey], q[key]));
      if (q.state && f.state !== q.state) return false;
      if (q.kind && f.kind !== q.kind) return false;
      if (q.partNumber && !field('partNumber', 'partNo')) return false;
      if (q.description && !field('description', 'description')) return false;
      if (q.material && !field('material', 'material')) return false;
      if (q.text) {
        const hay = [f.name, f.title, f.revision, ...Object.values(values), ...own.flatMap((d) => [d.name, d.partNo, d.description, d.material])];
        if (!hay.some((v) => has(v, q.text))) return false;
      }
      return true;
    });
  }

  /**
   * Bill of materials of an assembly in a file: mode 'indented' (levels, quantities per parent) or 'parts'
   * (only parts, total quantities). Parts copied from other vault files show that file's part number,
   * revision and state. Rows: { item, level, kind, name, partNumber, description, material, qty, file,
   * revision, state }.
   */
  async bom(id, { mode = 'indented', assembly = null } = {}) {
    const f = this.file(id) ?? fail('missing', { id });
    const p = await this.resolvedProject(id, f.version);
    const own = (a) => !a.vaultRef && !a.vaultNested;
    const asm = (p.assemblies ?? []).find((a) => a.id === assembly) ?? (p.assemblies ?? []).find((a) => a.id === p.active?.id) ?? (p.assemblies ?? []).find(own) ?? p.assemblies?.[0];
    if (!asm) return [];
    const origin = (doc) => (doc?.vaultRef ? { fileId: doc.vaultRef.fileId, docId: doc.vaultRef.docId } : doc?.vaultNested?.fileId ? { fileId: doc.vaultNested.fileId, docId: doc.vaultNested.docId } : null);
    const info = (doc) => {
      const o = origin(doc);
      const src = o ? this.file(o.fileId) : null;
      const values = src ? { ...src.props, ...src.card } : {};
      const main = src && src.docs.find((d) => !d.linked && d.id === o.docId);
      return {
        partNumber: (main ? values.partNumber || main.partNo : '') || doc?.partNo || '', description: (main ? values.description || main.description : '') || doc?.description || '',
        material: doc?.material ?? '', file: src?.name ?? f.name, revision: src?.revision ?? f.revision, state: src?.state ?? f.state,
      };
    };
    const rows = [];
    const walk = (a, level, prefix, factor, seen) => {
      const groups = new Map();
      for (const c of a.components ?? []) {
        if (c.suppressed || c.excluded) continue;
        const key = c.sub != null && c.part == null ? `sub:${c.sub}` : `part:${c.part}`;
        if (!groups.has(key)) groups.set(key, { c, qty: 0 });
        groups.get(key).qty += 1;
      }
      let i = 0;
      for (const [key, g] of groups) {
        i += 1;
        const item = prefix ? `${prefix}.${i}` : String(i);
        if (key.startsWith('sub:')) {
          const sub = (p.assemblies ?? []).find((s) => s.id === g.c.sub);
          rows.push({ item, level, kind: 'assembly', name: sub?.name ?? g.c.name ?? '?', ...info(sub), material: '', qty: g.qty, total: g.qty * factor, key: `asm:${origin(sub) ? `${origin(sub).fileId}:${origin(sub).docId}` : sub?.id}` });
          if (sub && !seen.has(sub.id)) walk(sub, level + 1, item, factor * g.qty, new Set(seen).add(sub.id));
        } else {
          const part = (p.parts ?? []).find((x) => x.id === g.c.part);
          rows.push({ item, level, kind: 'part', name: part?.name ?? g.c.name ?? '?', ...info(part), qty: g.qty, total: g.qty * factor, key: `part:${origin(part) ? `${origin(part).fileId}:${origin(part).docId}` : part?.id ?? g.c.part}`, missing: !part });
        }
      }
    };
    walk(asm, 0, '', 1, new Set([asm.id]));
    if (mode !== 'parts') return rows.map(({ total, key, ...r }) => r);
    const merged = new Map();
    for (const r of rows.filter((x) => x.kind === 'part')) {
      if (!merged.has(r.key)) merged.set(r.key, { ...r, qty: 0 });
      merged.get(r.key).qty += r.total;
    }
    return [...merged.values()].map(({ total, key, ...r }, i) => ({ ...r, item: String(i + 1), level: 0 }));
  }

  // ── working together: activity, what waits for me, discussions

  /**
   * What happened in the vault, newest first: file events ({ kind: 'file', file, name, type, by, time, comment,
   * transition, version }) and change-order log entries ({ kind: 'change', change, number, title, action, by, time,
   * comment }). since — only after this time (ISO); others — not my own; limit.
   */
  activity({ since = null, others = false, limit = 100 } = {}) {
    const out = [];
    for (const f of this.files) for (const e of f.events ?? []) out.push({ kind: 'file', file: f.id, name: f.name, ...e });
    for (const c of this.index?.changes ?? []) for (const l of c.log ?? []) out.push({ kind: 'change', change: c.id, number: c.number, title: c.title, ...l });
    return out.filter((e) => (!since || e.time > since) && (!others || e.by !== this.user)).sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0)).slice(0, limit);
  }

  /**
   * What waits for the current user: change requests and orders to decide (an approver; not their own, not decided
   * yet), files pending approval they may approve (not the submitter), and draft orders of theirs to send.
   */
  awaitingMe() {
    const me = this.user, approver = atLeast(this.role, 'approver');
    const changes = (this.index?.changes ?? []).filter((c) => (approver && c.by !== me && !c.approvals.some((a) => a.by === me) && ((c.type === 'ecr' && c.status === 'open') || (c.type === 'eco' && c.status === 'pending'))) || (c.by === me && c.type === 'eco' && c.status === 'draft'));
    const files = approver ? this.files.filter((f) => f.state === 'pending' && !this.blockOf(this.index, f, TRANSITIONS.find((t) => t.id === 'approve'))) : [];
    return { changes, files };
  }

  /** Adds a comment to a file's or a change's discussion (anyone who can read the vault). */
  async comment(id, text) {
    const body = String(text ?? '').trim();
    if (!body) fail('noComment');
    return this.mutate((ix) => {
      const time = this.now();
      const f = ix.files.find((x) => x.id === id);
      if (f) {
        const c = { id: newId('m'), by: this.user, time, text: body };
        (f.comments ??= []).push(c);
        f.events.push({ type: 'comment', by: this.user, time, comment: body });
        return c;
      }
      const ch = this.mustChange(ix, id);
      ch.log.push({ action: 'comment', by: this.user, time, comment: body });
      return { by: this.user, time, text: body };
    });
  }

  /** A file's discussion, oldest first. */
  comments(id) { return this.file(id)?.comments ?? []; }

  // ── change requests and orders

  /** A new change request ('ecr', open) or change order ('eco', draft). */
  async createChange(type, { title, description = '', files = [], request = null } = {}) {
    if (!['ecr', 'eco'].includes(type)) fail('badChange', { type });
    this.need('editor');
    if (!String(title ?? '').trim()) fail('noTitle');
    return this.mutate((ix) => {
      for (const x of files) this.mustFile(ix, x);
      ix.counters[type] = (ix.counters[type] ?? 0) + 1;
      const time = this.now();
      const c = {
        id: newId('c'), type, number: `${type.toUpperCase()}-${String(ix.counters[type]).padStart(4, '0')}`, title: String(title).trim(), description: String(description),
        files: [...new Set(files)], status: type === 'ecr' ? 'open' : 'draft', by: this.user, time, approvals: [], required: ix.requiredApprovals ?? 1, request, log: [{ action: 'create', by: this.user, time }],
      };
      ix.changes.push(c);
      return c;
    });
  }

  change(id) { return this.index.changes.find((c) => c.id === id || c.number === id) ?? null; }
  mustChange(ix, id) { const c = ix.changes.find((x) => x.id === id || x.number === id); if (!c) fail('missing', { id }); return c; }

  /** Edits a draft order / open request (its author or an admin): title, description, files. */
  async editChange(id, { title, description, files } = {}) {
    return this.mutate((ix) => {
      const c = this.mustChange(ix, id);
      const role = roleIn(ix, this.user);
      if (c.by !== this.user && !atLeast(role, 'admin')) fail('permission', { need: 'admin' });
      if (!['draft', 'open'].includes(c.status)) fail('changeState', { status: c.status });
      if (title != null) c.title = String(title).trim() || c.title;
      if (description != null) c.description = String(description);
      if (files) { for (const x of files) this.mustFile(ix, x); c.files = [...new Set(files)]; }
      c.log.push({ action: 'edit', by: this.user, time: this.now() });
      return c;
    });
  }

  /** Sends a draft change order for approval. */
  async submitChange(id) {
    return this.mutate((ix) => {
      const c = this.mustChange(ix, id);
      if (c.type !== 'eco' || c.status !== 'draft') fail('changeState', { status: c.status });
      if (!c.files.length) fail('noFiles');
      if (c.by !== this.user && !atLeast(roleIn(ix, this.user), 'admin')) fail('permission', { need: 'admin' });
      c.status = 'pending';
      c.log.push({ action: 'submit', by: this.user, time: this.now() });
      return c;
    });
  }

  /**
   * An approver's decision: 'approve' or 'reject'. A request is decided by one approver; an order needs
   * `required` approvals from different approvers, none of them its author.
   */
  async decideChange(id, decision, { comment = '' } = {}) {
    if (!['approve', 'reject'].includes(decision)) fail('badDecision', { decision });
    return this.mutate((ix) => {
      const c = this.mustChange(ix, id);
      const role = roleIn(ix, this.user);
      if (!atLeast(role, 'approver')) fail('permission', { need: 'approver' });
      if (!((c.type === 'ecr' && c.status === 'open') || (c.type === 'eco' && c.status === 'pending'))) fail('changeState', { status: c.status });
      if (c.by === this.user) fail('fourEyes');
      if (c.approvals.some((a) => a.by === this.user)) fail('alreadyDecided');
      const time = this.now();
      c.approvals.push({ by: this.user, decision, time, comment: String(comment) });
      c.log.push({ action: decision, by: this.user, time, comment: String(comment) });
      if (decision === 'reject') c.status = 'rejected';
      else if (c.type === 'ecr' || c.approvals.filter((a) => a.decision === 'approve').length >= (c.required ?? 1)) {
        c.status = 'approved';
        if (c.type === 'eco') c.startRevisions = Object.fromEntries(c.files.map((x) => [x, ix.files.find((f) => f.id === x)?.revision ?? '']));
      }
      return c;
    });
  }

  /** Turns an approved request into a draft change order with the same files (the request is closed). */
  async orderFromRequest(id) {
    const r = this.change(id) ?? fail('missing', { id });
    if (r.type !== 'ecr' || r.status !== 'approved') fail('changeState', { status: r.status });
    const eco = await this.createChange('eco', { title: r.title, description: r.description, files: r.files, request: r.id });
    await this.mutate((ix) => { const x = this.mustChange(ix, r.id); x.status = 'closed'; x.order = eco.number; x.log.push({ action: 'order', by: this.user, time: this.now(), comment: eco.number }); });
    return eco;
  }

  /** Closes an approved order once every file of it is released again at a new revision. */
  async closeChange(id) {
    return this.mutate((ix) => {
      const c = this.mustChange(ix, id);
      if (c.type === 'ecr') {
        if (!['approved', 'rejected'].includes(c.status)) fail('changeState', { status: c.status });
      } else {
        if (c.status !== 'approved') fail('changeState', { status: c.status });
        const open = c.files.map((x) => ix.files.find((f) => f.id === x)).filter((f) => f && (f.state !== 'released' || f.revision === c.startRevisions?.[f.id])).map((f) => f.name);
        if (open.length) fail('orderOpen', { names: open.join(', ') });
      }
      c.status = 'closed';
      c.log.push({ action: 'close', by: this.user, time: this.now() });
      return c;
    });
  }
}

function coerceField(fl, raw) {
  if (raw == null || raw === '') return '';
  if (fl.type === 'number') { const n = Number(String(raw).replace(',', '.')); if (!Number.isFinite(n)) fail('badValue', { key: fl.key, value: String(raw) }); return n; }
  if (fl.type === 'bool') return raw === true || raw === 'true' || raw === 1 || raw === '1';
  if (fl.type === 'date') { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) fail('badValue', { key: fl.key, value: String(raw) }); return String(raw); }
  if (fl.type === 'list') { if (!(fl.options ?? []).includes(String(raw))) fail('badValue', { key: fl.key, value: String(raw) }); return String(raw); }
  return String(raw);
}

// ───────────────────────── using vault files in a project

const FILLED_KEYS_KEEP = new Set(['id', 'name', 'vaultRef']);

/**
 * Fills a stub with the referenced document of a resolved source project (src). A part takes the source
 * part's content; an assembly takes the source assembly and brings the parts and sub-assemblies it uses as
 * nested documents (ids `<stub>~<source id>`, `vaultNested { owner, fileId, docId }`) — replaced on every
 * resolution, never stored. The stub's id and name stay, so components and drawings that use it still do.
 */
export function importLinked(project, stub, src, { file, version, revision }) {
  const kind = (project.parts ?? []).includes(stub) ? 'part' : 'assembly';
  const docId = stub.vaultRef.docId;
  const from = (kind === 'part' ? src.parts : src.assemblies)?.find((d) => d.id === docId);
  if (!from) fail('missing', { id: docId });
  // the stub's earlier nested documents go
  const owned = (d) => d.vaultNested?.owner === stub.id;
  project.parts = (project.parts ?? []).filter((d) => !owned(d));
  project.assemblies = (project.assemblies ?? []).filter((d) => !owned(d));
  for (const k of Object.keys(stub)) if (!FILLED_KEYS_KEEP.has(k)) delete stub[k];
  const body = JSON.parse(JSON.stringify(from));
  for (const k of ['id', 'name', 'vaultRef', 'vaultNested']) delete body[k];
  Object.assign(stub, body);
  stub.vaultRef = { ...stub.vaultRef, resolved: { version, revision, deps: src.vaultDeps ?? {} } };
  if (kind === 'assembly') {
    const nestedId = (id) => `${stub.id}~${id}`;
    const originOf = (d) => (d.vaultRef ? { fileId: d.vaultRef.fileId, docId: d.vaultRef.docId } : d.vaultNested?.fileId ? { fileId: d.vaultNested.fileId, docId: d.vaultNested.docId } : { fileId: file.id, docId: d.id });
    const done = new Set();
    const bring = (list, id) => {
      const key = `${list}:${id}`;
      if (done.has(key)) return nestedId(id);
      done.add(key);
      const d = (src[list] ?? []).find((x) => x.id === id);
      if (!d) return id;
      const copy = JSON.parse(JSON.stringify(d));
      delete copy.vaultRef;
      copy.id = nestedId(id);
      copy.vaultNested = { owner: stub.id, ...originOf(d) };
      if (list === 'assemblies') copy.components = (copy.components ?? []).map(mapComp);
      project[list].push(copy);
      return copy.id;
    };
    const mapComp = (c) => ({ ...c, part: c.part != null && c.sub == null ? bring('parts', c.part) : c.part, sub: c.sub != null ? bring('assemblies', c.sub) : c.sub });
    stub.components = (stub.components ?? []).map(mapComp);
  }
  return stub;
}

/** Every file a set of resolved links used, at any depth: { fileId: { version, policy, pinned } }. */
function depsOf(links) {
  const deps = {};
  for (const l of links) {
    if (l.missing) continue;
    Object.assign(deps, l.deps ?? {});
    deps[l.file.id] = { version: l.version, policy: l.policy, pinned: l.doc.vaultRef.version ?? null };
  }
  return deps;
}

/** Puts prepared references (Vault.prepareLinks) into a project. Returns the names updated. */
export function applyLinks(project, prepared) {
  const names = [];
  for (const p of prepared) {
    const stub = [...(project.parts ?? []), ...(project.assemblies ?? [])].find((d) => d.id === p.id && d.vaultRef);
    if (!stub) continue;
    importLinked(project, stub, p.src, p);
    names.push(stub.name);
  }
  return names;
}
