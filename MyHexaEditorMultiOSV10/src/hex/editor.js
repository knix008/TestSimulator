// The documents and their tabs: opening (files, new documents, disks and process memory on the desktop; files
// picked or dropped in the browser), saving, closing, the edits (all through the Rust core), the clipboard in
// several formats, bookmarks and the per-file memory (caret, bookmarks, template). The shell (app.js) draws the
// tab strip and the panels; this module owns what is in the tabs.
import { call as core, fromBase64, openBytes, rawBytes, toBase64 } from '../core/core.js';
import { HexDocument } from './document.js';
import { HexView } from './hexview.js';
import { encodeChar } from './charsets.js';
import * as native from '../platform/native.js';
import { FILE_PREFS_KEY } from '../domain/settings.js';
import { t } from '../i18n.js';

const loadJson = (key, fallback) => { try { return JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; } };
const saveJson = (key, value) => { try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* full */ } };
export const baseName = (path) => String(path ?? '').split(/[\\/]/).pop() || String(path ?? '');
export const BOOKMARK_COLORS = ['#f5a524', '#e5484d', '#30a46c', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];

let tabSeq = 0;

/**
 * app: { settings(), updateSettings(patch), notify(kind, text), showError(key, error, context), ask(params), withProgress(titleKey, name, task),
 *        rendered(): redraw tabs, panels and status; caretMoved(tab); contextMenu(event, tab); desktop }
 */
export function createEditor(app) {
  const tabs = [];
  let activeId = null;

  const active = () => tabs.find((x) => x.id === activeId) ?? null;
  const activeDoc = () => active()?.doc ?? null;
  const activeView = () => active()?.view ?? null;

  // ───────── per-file memory

  const prefKey = (doc) => doc.path ?? (doc.source.kind === 'web' ? `web:${doc.name}` : null);
  function filePrefs(doc) { const key = prefKey(doc); return key ? loadJson(FILE_PREFS_KEY, {})[key] ?? {} : {}; }
  function setFilePrefs(doc, patch) {
    const key = prefKey(doc);
    if (!key) return;
    const all = loadJson(FILE_PREFS_KEY, {});
    all[key] = { ...(all[key] ?? {}), ...patch, at: Date.now() };
    // Keep the 300 most recent files.
    const keys = Object.keys(all).sort((a, b) => (all[b].at ?? 0) - (all[a].at ?? 0));
    for (const k of keys.slice(300)) delete all[k];
    saveJson(FILE_PREFS_KEY, all);
  }

  // ───────── tabs

  function makeTab(doc, kind = 'hex') {
    const tab = { id: `t${(tabSeq += 1)}`, kind, doc, view: null, el: null, textMode: false };
    tabs.push(tab);
    activeId = tab.id;
    doc.bookmarks = filePrefs(doc).bookmarks ?? [];
    doc.onChange(() => app.docChanged(tab));
    return tab;
  }

  /** The view of a tab, made when the tab is first shown in `host`. */
  function mount(tab, host) {
    if (tab.view && tab.el === host && host.isConnected) return tab.view;
    tab.view?.destroy();
    tab.el = host;
    tab.view = new HexView(host, {
      doc: tab.doc,
      settings: app.settings,
      edit: (op, args) => edit(tab.doc, op, args),
      onCaret: () => app.caretMoved(tab),
      onContextMenu: (event) => app.contextMenu(event, tab),
      notify: (kind, key) => app.notify(kind, t(key)),
      toggleInsert: () => app.updateSettings({ insertMode: !app.settings().insertMode }),
      marks: () => marksOf(tab.doc),
      onScroll: (view) => app.viewScrolled?.(tab, view),
    });
    const saved = filePrefs(tab.doc);
    if (app.settings().rememberCaret && Number.isFinite(saved.caret) && saved.caret <= tab.doc.len) requestAnimationFrame(() => tab.view?.setCaret(saved.caret, { reveal: true }));
    return tab.view;
  }

  function marksOf(doc) {
    const out = [];
    for (const b of doc.bookmarks) out.push({ start: b.offset, end: b.offset + Math.max(1, b.length || 1), color: b.color, cls: 'mk' });
    for (const m of doc.marks.template) out.push({ start: m.start, end: m.end, color: m.color, cls: 'tp' });
    for (const m of doc.marks.diff) out.push({ start: m.start, end: m.end, cls: m.cls ?? 'df' });
    for (const m of doc.marks.search) out.push({ start: m.start, end: m.end, cls: 'sr' });
    return out;
  }

  async function addDocument(info, source, { readonly = false } = {}) {
    if (readonly || app.settings().openReadonly) info = await core('setReadonly', { id: info.id, readonly: true });
    const doc = new HexDocument(info, source);
    const tab = makeTab(doc);
    app.rendered({ structure: true });
    app.opened(tab);
    return tab;
  }

  // ───────── opening

  async function newDocument(size = 0) {
    const n = tabs.filter((x) => !x.doc.path && x.doc.source.kind === 'memory').length + 1;
    const info = await core('new', { name: `${t('file.untitled')} ${n}`, size });
    return addDocument(info, { kind: 'memory' });
  }

  async function openPath(path, { readonly = false } = {}) {
    const existing = tabs.find((x) => x.doc.path && samePath(x.doc.path, path));
    if (existing) { activeId = existing.id; app.rendered({ structure: true }); return existing; }
    const info = await native.invoke('hex_open', { path, readonly: readonly || app.settings().openReadonly });
    return addDocument(info, { kind: 'file', path });
  }

  /** Web: a File (picked or dropped), with its handle when the browser gives one (saving in place). */
  async function openWebFile(file, handle = null, report = null) {
    // Read in pieces, telling the progress popup how far it is (a big file takes a while in the browser).
    const bytes = new Uint8Array(file.size);
    const reader = file.stream().getReader();
    let pos = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes.set(value, pos);
      pos += value.length;
      report?.({ fraction: file.size ? pos / file.size : 1, text: `${(pos / 1048576).toFixed(1)} / ${(file.size / 1048576).toFixed(1)} MB` });
    }
    const info = await openBytes(bytes, file.name);
    return addDocument(info, { kind: 'web', handle, size: file.size });
  }

  async function openBytesAs(bytes, name, source = { kind: 'memory' }) {
    const info = app.desktop ? await core('new', { name, data: toBase64(bytes) }) : await openBytes(bytes, name);
    return addDocument(info, source);
  }

  async function openDisk(disk) {
    const info = await native.invoke('hex_open_disk', { path: disk.path });
    return addDocument(info, { kind: 'disk', path: disk.path, label: disk.name });
  }

  async function openProcess(proc) {
    const info = await native.invoke('hex_open_process', { pid: proc.pid });
    return addDocument(info, { kind: 'process', pid: proc.pid, label: `${proc.name} (${proc.pid})` });
  }

  // ───────── editing

  /** One edit through the core: write / insert / delete / replace / fill / undo / redo / … */
  async function edit(doc, op, args = {}) {
    const payload = { id: doc.id, ...args };
    if (payload.data instanceof Uint8Array) payload.data = toBase64(payload.data);
    if ((op === 'insert' || op === 'delete') && !doc.resizable) { app.notify('warning', t('edit.fixedSize')); return null; }
    if (doc.readonly && op !== 'undo' && op !== 'redo') { app.notify('warning', t('edit.readonly')); return null; }
    const result = await core(op, payload);
    doc.changed(result.info ?? await core('info', { id: doc.id }), result.range ?? (result.offset != null ? [result.offset, result.length] : null));
    return result;
  }

  async function undo(tab = active()) {
    if (!tab?.doc.info.canUndo) return;
    const r = await edit(tab.doc, 'undo');
    if (r?.range) tab.view?.select(r.range[0], r.range[0] + Math.min(r.range[1], 1 << 20), { center: false });
  }
  async function redo(tab = active()) {
    if (!tab?.doc.info.canRedo) return;
    const r = await edit(tab.doc, 'redo');
    if (r?.range) tab.view?.select(r.range[0], r.range[0] + Math.min(r.range[1], 1 << 20));
  }

  // ───────── clipboard

  /** The selection's bytes (or the byte at the caret). */
  async function selectedBytes(tab = active(), { orCaret = true } = {}) {
    if (!tab?.view) return null;
    const sel = tab.view.selection();
    const start = sel.length ? sel.start : tab.view.caret;
    const length = sel.length || (orCaret && start < tab.doc.len ? 1 : 0);
    if (!length) return null;
    return { offset: start, length, bytes: await tab.doc.read(start, length) };
  }

  function decodeText(bytes, charset) {
    const labels = { utf8: 'utf-8', utf16le: 'utf-16le', utf16be: 'utf-16be', 'euc-kr': 'euc-kr', shift_jis: 'shift_jis', cp1252: 'windows-1252', latin1: 'iso-8859-1' };
    if (labels[charset]) { try { return new TextDecoder(labels[charset]).decode(bytes); } catch { /* fall through */ } }
    return core('decode', { data: toBase64(bytes), encoding: charset }).then((r) => r.text);
  }

  /** The selection as text in a format: hex | hexSpaced | text | c | python | base64 | escaped | … (export formats). */
  async function selectionText(format, tab = active()) {
    const sel = await selectedBytes(tab);
    if (!sel) return null;
    if (format === 'hex') return [...sel.bytes].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    if (format === 'text') return decodeText(sel.bytes, app.settings().charset);
    const r = await core('export', { id: tab.doc.id, offset: sel.offset, length: sel.length, format, uppercase: app.settings().uppercase, name: 'data', bytesPerLine: 16, base: sel.offset + (app.settings().baseAddress || 0) });
    return r.text ?? '';
  }

  async function copy(format = app.settings().copyFormat, tab = active()) {
    const text = await selectionText(format, tab);
    if (text == null) return false;
    try {
      await native.clipboardWrite(text);
    } catch {
      app.notify('warning', t('notice.clipboardRefused'));
      return false;
    }
    app.notify('success', t('notice.copied', { format: t(`copy.${format}`, null, format) }));
    return true;
  }

  async function cut(tab = active()) {
    if (!tab || !(await copy(app.settings().copyFormat, tab))) return;
    const sel = tab.view.selection();
    const offset = sel.length ? sel.start : tab.view.caret;
    const length = sel.length || 1;
    if (!tab.doc.resizable) { await edit(tab.doc, 'fill', { offset, length, mode: 'zero' }); return; }
    await edit(tab.doc, 'delete', { offset, length });
    tab.view.setCaret(offset);
  }

  /** Clipboard text → bytes: hex digits when it looks like hex (auto) or when asked, else the text in the character set. */
  async function clipboardBytes(mode = app.settings().pasteMode) {
    let text = '';
    try { text = await native.clipboardRead(); } catch { text = await navigator.clipboard?.readText?.() ?? ''; }
    if (!text) return null;
    const hexLike = /^[\s0-9a-fA-F,;:-]*$/.test(text.replace(/0x/gi, '')) && text.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '').length % 2 === 0;
    if (mode === 'hex' || (mode === 'auto' && hexLike && /[0-9a-fA-F]{2}/.test(text))) {
      const digits = text.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
      if (digits.length % 2) throw new Error(t('paste.oddHex'));
      return Uint8Array.from(digits.match(/../g) ?? [], (h) => parseInt(h, 16));
    }
    const charset = app.settings().charset;
    const parts = [];
    for (const ch of text) {
      const bytes = encodeChar(ch, charset);
      if (!bytes) { const r = await core('encode', { text, encoding: charset === 'utf16le' || charset === 'utf16be' ? charset : 'utf8' }); return fromBase64(r.data); }
      parts.push(...bytes);
    }
    return Uint8Array.from(parts);
  }

  async function paste(mode, tab = active()) {
    if (!tab?.view) return;
    const data = await clipboardBytes(mode);
    if (!data?.length) return;
    const sel = tab.view.selection();
    const at = sel.length ? sel.start : tab.view.caret;
    const insert = app.settings().insertMode;
    if (insert && sel.length) await edit(tab.doc, 'replace', { offset: at, length: sel.length, data, kind: 'paste' });
    else if (insert) await edit(tab.doc, 'insert', { offset: at, data, kind: 'paste' });
    else {
      if (!tab.doc.resizable && at + data.length > tab.doc.len) { app.notify('warning', t('edit.fixedSize')); return; }
      await edit(tab.doc, 'write', { offset: at, data, kind: 'paste' });
    }
    tab.view.select(at, at + data.length);
    app.notify('success', t('notice.pasted', { n: data.length.toLocaleString() }));
  }

  // ───────── saving

  async function save(tab = active(), { as = false } = {}) {
    if (!tab) return false;
    const doc = tab.doc;
    const device = doc.source.kind === 'disk' || doc.source.kind === 'process';
    try {
      // Back into a disk or a process: the changed bytes are written where they came from — asked first.
      if (app.desktop && device && !as) {
        const choice = await app.ask({ kind: 'writeDevice', icon: 'warning', title: t(`save.${doc.source.kind}Title`), message: t(`save.${doc.source.kind}Confirm`, { name: doc.source.label ?? doc.name }), buttons: [{ id: 'cancel', label: t('common.cancel'), primary: true }, { id: 'write', label: t('save.writeNow'), icon: 'save', danger: true }] });
        if (choice !== 'write') return false;
      }
      if (app.desktop) {
        let path = device && !as ? null : doc.path;
        if (as || (!path && !device)) {
          path = await native.chooseSavePath(doc.path ?? doc.name, ['bin', 'all']);
          if (!path) return false;
        }
        const info = await app.withProgress('progress.save', doc.name, (op) => native.invoke('hex_save', { id: doc.id, path, op }));
        if (path) doc.source = { ...doc.source, kind: 'file', path };
        doc.changed(info);
      } else {
        const bytes = await rawBytes(doc.id, 0, doc.len);
        const result = await native.saveFileWeb(bytes, { name: doc.name, handle: as ? null : doc.source.handle, saveAs: as || !doc.source.handle, mime: 'application/octet-stream' });
        if (result?.handle) doc.source = { ...doc.source, handle: result.handle };
        if (result?.name && result.name !== doc.name) await core('rename', { id: doc.id, name: result.name });
        doc.changed(await core('markSaved', { id: doc.id }));
      }
      app.notify('success', t('notice.saved', { name: doc.name }));
      app.remember?.(tab);
      app.rendered({ structure: true });
      return true;
    } catch (error) {
      if (/abort|cancel/i.test(String(error?.message ?? error))) return false;
      app.showError('error.save', error, doc.path ?? doc.name);
      return false;
    }
  }

  /** Writes [offset, offset + length) of a document to a new file (export a selection, a carved file). */
  async function saveRange(doc, offset, length, name) {
    if (app.desktop) {
      const path = await native.chooseSavePath(name, ['bin', 'all']);
      if (!path) return false;
      await app.withProgress('progress.save', baseName(path), (op) => native.invoke('hex_save_range', { id: doc.id, offset, length, path, op }));
      app.notify('success', t('notice.saved', { name: baseName(path) }));
      return true;
    }
    const bytes = await rawBytes(doc.id, offset, length);
    await native.saveFileWeb(bytes, { name, saveAs: true, mime: 'application/octet-stream' });
    return true;
  }

  async function close(tab = active(), { force = false } = {}) {
    if (!tab) return true;
    if (!force && tab.doc.modified) {
      const choice = await app.ask({ kind: 'save', icon: 'save', title: t('confirm.unsavedTitle'), message: t('confirm.unsaved', { name: tab.doc.name }), buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'discard', label: t('confirm.discard'), icon: 'trash', danger: true }, { id: 'save', label: t('action.save'), icon: 'save', primary: true }] });
      if (choice === 'cancel') return false;
      if (choice === 'save' && !(await save(tab))) return false;
    }
    if (tab.view) setFilePrefs(tab.doc, { caret: tab.view.caret, bookmarks: tab.doc.bookmarks });
    tab.view?.destroy();
    const i = tabs.indexOf(tab);
    tabs.splice(i, 1);
    // A compare tab only shows documents; a document tab gives its document back to the core when no other tab shows it.
    if (tab.kind === 'hex' && !tabs.some((x) => x.doc === tab.doc || x.docB === tab.doc)) await core('close', { id: tab.doc.id }).catch(() => {});
    if (tab.kind === 'compare') { tab.doc.marks.diff = []; tab.docB.marks.diff = []; tab.viewB?.destroy(); }
    if (activeId === tab.id) activeId = tabs[Math.min(i, tabs.length - 1)]?.id ?? null;
    app.rendered({ structure: true });
    return true;
  }

  async function closeAll() {
    for (const tab of [...tabs]) if (!(await close(tab))) return false;
    return true;
  }

  async function reload(tab = active()) {
    if (!tab || !tab.doc.path) return;
    if (tab.doc.modified) {
      const choice = await app.ask({ kind: 'reload', icon: 'refresh', title: t('confirm.reloadTitle'), message: t('confirm.reload', { name: tab.doc.name }), buttons: [{ id: 'cancel', label: t('common.cancel'), primary: true }, { id: 'reload', label: t('action.reload'), icon: 'refresh', danger: true }] });
      if (choice !== 'reload') return;
    }
    const info = await native.invoke('hex_reload', { id: tab.doc.id });
    tab.doc.changed(info);
  }

  // ───────── bookmarks

  function toggleBookmark(tab = active()) {
    if (!tab?.view) return;
    const sel = tab.view.selection();
    const offset = sel.length ? sel.start : tab.view.caret;
    const length = sel.length || 1;
    const doc = tab.doc;
    const i = doc.bookmarks.findIndex((b) => offset >= b.offset && offset < b.offset + Math.max(1, b.length));
    if (i >= 0 && !sel.length) doc.bookmarks.splice(i, 1);
    else doc.bookmarks.push({ offset, length, name: `${t('bookmark.name')} ${doc.bookmarks.length + 1}`, color: BOOKMARK_COLORS[doc.bookmarks.length % BOOKMARK_COLORS.length] });
    doc.bookmarks.sort((a, b) => a.offset - b.offset);
    setFilePrefs(doc, { bookmarks: doc.bookmarks });
    tab.view.schedule();
    app.rendered({ panels: true });
  }

  function stepBookmark(step, tab = active()) {
    if (!tab?.view || !tab.doc.bookmarks.length) return;
    const caret = tab.view.caret;
    const list = tab.doc.bookmarks;
    const next = step > 0 ? list.find((b) => b.offset > caret) ?? list[0] : [...list].reverse().find((b) => b.offset < caret) ?? list.at(-1);
    tab.view.select(next.offset, next.offset + Math.max(1, next.length), { center: true });
  }

  function saveBookmarks(doc) { setFilePrefs(doc, { bookmarks: doc.bookmarks }); }

  return {
    tabs, active, activeDoc, activeView,
    get activeId() { return activeId; },
    activate(id) { if (tabs.some((x) => x.id === id)) { activeId = id; app.rendered({ structure: true }); } },
    makeTab, mount, addDocument, newDocument, openPath, openWebFile, openBytesAs, openDisk, openProcess,
    edit, undo, redo, copy, cut, paste, selectedBytes, selectionText, clipboardBytes, decodeText,
    save, saveRange, close, closeAll, reload, toggleBookmark, stepBookmark, saveBookmarks, filePrefs, setFilePrefs, marksOf,
  };
}

function samePath(a, b) {
  const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '');
  return /^[a-z]:/i.test(a) ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
}
