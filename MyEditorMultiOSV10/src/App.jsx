// My Editor — the application shell.
//
//   menu bar (frameless title bar) · icon toolbar · [folder tree | tabs +
//   find bar + editor] · status bar, plus the dialogs.
//
// Documents: `docs` holds the metadata of every tab (path, encoding, line
// ending, language, dirty…); the text lives in CodeMirror EditorStates —
// the active one inside the single EditorView, the others in `statesRef`.
// Switching tabs swaps the state in and out of the view, so every tab keeps
// its own undo history, selection and folds.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorSelection } from '@codemirror/state';
import { t, setLanguage, getLanguage, useLanguage } from './lib/i18n';
import { applyTheme, nextThemeId, themeById } from './themes';
import { SETTINGS_DEFAULTS, pickSettings } from './lib/settings';
import {
  call, isElectron, nativeDialog, setDialogFallback, writeClipboardText, readClipboardText, onOpenFiles, rendererReady, pathForFile,
  onCloseRequest, replyClose, onWindowFocus, setWindowTitle, windowControl, quitApp, isMac,
} from './lib/backend';
import { createState, settingsEffects, languageEffect, readOnlyEffect, commands, searchApi, applySaveTransforms, cursorInfo } from './lib/editor';
import { detectLanguage, languageByName, loadLanguage, FEATURED_LANGUAGES, PLAIN } from './lib/languages';
import { commands as md } from './lib/markdown';
import { markdownLive } from './lib/mdlive';
import { wordAt as spellWordAt, suggest as spellSuggest, addUserWord, ignoreWord, setUserWords, setSpellOptions, refreshAll as spellRefreshAll, isReady as spellReady } from './lib/spell';
import { MenuBar } from './components/MenuBar';
import { Toolbar } from './components/Toolbar';
import { TabBar } from './components/TabBar';
import { EditorPane } from './components/EditorPane';
import { FindBar } from './components/FindBar';
import { MarkdownBar } from './components/MarkdownBar';
import { Preview } from './components/Preview';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { TerminalPanel } from './components/TerminalPanel';
import { ConfirmDialog, ErrorDialog, AboutDialog, GotoLineDialog, PromptDialog, LanguagePicker, EncodingPicker, ShortcutsDialog } from './dialogs/Dialogs';
import { SettingsDialog } from './dialogs/SettingsDialog';
import { FileDialog } from './dialogs/FileDialog';

const BASE_FONT = 14;
const EOLS = ['crlf', 'lf', 'cr'];
let nextDocId = 1;

const baseName = (p) => (p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop();
const dirName = (p) => { const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')); return i > 0 ? p.slice(0, i) : p; };
// Paths are compared through a normalized key: on Windows (of the host that
// owns the files — the server's platform in the web version) separators and
// case do not matter, so "c:/a/B.txt" and "C:\a\b.txt" are the same file.
let hostIsWindows = navigator.platform.startsWith('Win');
const pathKey = (p) => (!p ? '' : hostIsWindows ? p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase() : p.replace(/\/+$/, ''));
const samePath = (a, b) => !!a && !!b && pathKey(a) === pathKey(b);

export default function App() {
  useLanguage();
  const [booted, setBooted] = useState(false);
  const [info, setInfo] = useState(null);
  const [settings, setSettingsState] = useState(SETTINGS_DEFAULTS);
  const settingsRef = useRef(settings);
  const [docs, setDocsState] = useState([]);
  const docsRef = useRef([]);
  const [activeId, setActiveIdState] = useState(null);
  const activeIdRef = useRef(null);
  const viewRef = useRef(null);
  const [view, setView] = useState(null);
  const statesRef = useRef(new Map());     // id → EditorState of inactive tabs
  const savedRef = useRef(new Map());      // id → Text as loaded / last saved
  const checkedRef = useRef(new Map());    // id → last external-change check (ms)
  const untitledRef = useRef(1);
  const [cursor, setCursor] = useState({ line: 1, col: 1, selected: 0, selLines: 0, ranges: 1, chars: 0, lines: 1 });
  const [docVersion, setDocVersion] = useState(0);
  const [message, setMessageState] = useState('');
  const messageTimer = useRef(null);
  const [find, setFind] = useState(null);           // { mode, initial }
  const [dialog, setDialog] = useState(null);       // { type, ...props }
  const [folder, setFolder] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [sbRefresh, setSbRefresh] = useState(0);
  const [recent, setRecent] = useState([]);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const persistTimer = useRef(null);
  // Mirrors of state read from long-lived closures (event handlers, timers).
  const infoRef = useRef(null); infoRef.current = info;
  const folderRef = useRef(''); folderRef.current = folder;
  const findRef = useRef(null); findRef.current = find;
  const sidebarWidthRef = useRef(240); sidebarWidthRef.current = sidebarWidth;
  const actionRef = useRef(null);
  // Terminal panel: sessions live in the host (core/terminal.js); here only their tabs.
  const [terms, setTerms] = useState([]);
  const [activeTerm, setActiveTerm] = useState(null);
  const [shells, setShells] = useState([]);
  const termNo = useRef(1);

  // ── small helpers ──
  const setSettings = (patch) => { const next = { ...settingsRef.current, ...patch }; settingsRef.current = next; setSettingsState(next); return next; };
  const setDocs = (fn) => { const next = typeof fn === 'function' ? fn(docsRef.current) : fn; docsRef.current = next; setDocsState(next); return next; };
  const patchDoc = (id, patch) => setDocs((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const getDoc = (id) => docsRef.current.find((d) => d.id === id);
  const activeDoc = docs.find((d) => d.id === activeId) || null;
  const setMessage = (msg) => {
    setMessageState(msg);
    if (messageTimer.current) clearTimeout(messageTimer.current);
    if (msg) messageTimer.current = setTimeout(() => setMessageState(''), 5000);
  };
  const encodingLabel = (id) => { const e = infoRef.current && infoRef.current.encodings.find((x) => x.id === id); return e ? e.label : id; };

  // A dialog that resolves with the user's answer.
  const ask = (props) => new Promise((resolve) => setDialog({ ...props, resolve }));
  const closeDialog = (result) => setDialog((d) => { if (d && d.resolve) d.resolve(result); return null; });
  const showError = (title, message, error) => ask({ type: 'error', title, message, error });
  const confirm = (title, message, buttons, opts = {}) => ask({ type: 'confirm', title, message, buttons, ...opts });

  // ── editor state access (active doc = the view, others = the map) ──
  const getState = (id) => (id === activeIdRef.current && viewRef.current ? viewRef.current.state : statesRef.current.get(id));
  const putState = (id, state) => { if (id === activeIdRef.current && viewRef.current) viewRef.current.setState(state); else statesRef.current.set(id, state); };
  // Applies a transaction spec to a document, wherever its state lives.
  const dispatchTo = (id, spec) => {
    if (id === activeIdRef.current && viewRef.current) viewRef.current.dispatch(spec);
    else { const s = statesRef.current.get(id); if (s) statesRef.current.set(id, s.update(spec).state); }
  };
  const docText = (id) => { const s = getState(id); return s ? s.doc.toString() : ''; };

  const handlersRef = useRef({});
  const handlers = useMemo(() => ({ onChange: (u) => handlersRef.current.onChange && handlersRef.current.onChange(u), onUpdate: (u) => handlersRef.current.onUpdate && handlersRef.current.onUpdate(u) }), []);
  handlersRef.current.onChange = (u) => {
    const id = activeIdRef.current;
    const doc = getDoc(id);
    if (!doc) return;
    const saved = savedRef.current.get(id);
    const dirty = !saved || !u.state.doc.eq(saved);
    if (dirty !== doc.dirty) patchDoc(id, { dirty });
    setDocVersion((v) => v + 1);
    schedulePersist();
  };
  handlersRef.current.onUpdate = (u) => { setCursor(cursorInfo(u.state)); };

  const newDocState = (text, { selection } = {}) => {
    let state = createState(text, settingsRef.current, handlers);
    if (selection) {
      const anchor = Math.min(state.doc.length, selection.anchor || 0), head = Math.min(state.doc.length, selection.head ?? anchor);
      state = state.update({ selection: EditorSelection.create([EditorSelection.range(anchor, head)]) }).state;
    }
    return state;
  };

  // ── language (async: grammars load on first use) ──
  const applyLanguage = useCallback((doc) => {
    const desc = doc.language ? (doc.language === PLAIN ? null : languageByName(doc.language)) : detectLanguage(doc.name);
    const langName = desc ? desc.name : null;
    if (langName !== doc.langName) patchDoc(doc.id, { langName });
    loadLanguage(desc).then((support) => {
      const cur = getDoc(doc.id);
      if (!cur || (cur.langName || null) !== langName) return;
      // Markdown documents get the WYSIWYG rendering on top of the grammar.
      const live = langName === 'Markdown' && settingsRef.current.mdWysiwyg ? markdownLive : [];
      dispatchTo(doc.id, { effects: languageEffect([support, live]) });
    }).catch(() => { /* a grammar failed to load: plain text */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── tabs ──
  const activate = useCallback((id) => {
    const v = viewRef.current;
    const prev = activeIdRef.current;
    // Already active: the live state is in the view — never replace it with the stored copy.
    if (prev === id && v) { setTimeout(() => v.focus(), 0); return; }
    if (v && prev != null && prev !== id && getDoc(prev)) statesRef.current.set(prev, v.state);
    activeIdRef.current = id;
    setActiveIdState(id);
    if (v && id != null) {
      const s = statesRef.current.get(id);
      if (s) { v.setState(s); setCursor(cursorInfo(s)); }
      setTimeout(() => v.focus(), 0);
    }
    setDocVersion((x) => x + 1);
    if (id != null) checkExternal(id);
    schedulePersist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addDoc = (meta, text, { activateIt = true, dirty = false, selection } = {}) => {
    const id = nextDocId++;
    const doc = { id, path: null, name: '', encoding: settingsRef.current.defaultEncoding, eol: settingsRef.current.defaultEol, language: null, langName: null, dirty, readonly: false, mtime: null, size: 0, missing: false, untitledNo: null, ...meta };
    const state = newDocState(text, { selection });
    statesRef.current.set(id, state);
    savedRef.current.set(id, dirty ? null : state.doc);
    if (dirty && meta.savedText !== undefined) savedRef.current.set(id, newDocState(meta.savedText).doc);
    setDocs((ds) => [...ds, doc]);
    applyLanguage(doc);
    if (doc.readonly) dispatchTo(id, { effects: readOnlyEffect(true) });
    if (activateIt) activate(id);
    return doc;
  };

  const newUntitled = (text = '', opts = {}) => {
    const n = untitledRef.current++;
    return addDoc({ untitledNo: n, name: t('untitled', { n }), ...opts.meta }, text, opts);
  };

  const removeDocs = (ids) => {
    const set = new Set(ids);
    const remaining = docsRef.current.filter((d) => !set.has(d.id));
    const idx = docsRef.current.findIndex((d) => d.id === activeIdRef.current);
    for (const id of ids) { statesRef.current.delete(id); savedRef.current.delete(id); checkedRef.current.delete(id); }
    setDocs(remaining);
    if (set.has(activeIdRef.current)) {
      const next = remaining[Math.min(idx, remaining.length - 1)] || remaining[remaining.length - 1];
      activeIdRef.current = null;
      if (next) activate(next.id);
      else { setActiveIdState(null); newUntitled(); }
    } else schedulePersist();
  };

  // ── open ──
  // A file is never opened twice: an already open tab is activated instead,
  // and a second request for a file that is still being read joins the first.
  const openingRef = useRef(new Map());   // pathKey → Promise<doc>
  const openPath = (p, opts = {}) => {
    const key = pathKey(p);
    const pending = openingRef.current.get(key);
    if (pending && !opts.encoding) return pending.then((d) => { if (d && opts.activateIt !== false) activate(d.id); return d; });
    const job = openPathNow(p, opts).finally(() => { if (openingRef.current.get(key) === job) openingRef.current.delete(key); });
    openingRef.current.set(key, job);
    return job;
  };
  const openPathNow = async (p, { encoding = null, activateIt = true, force = false } = {}) => {
    let existing = docsRef.current.find((d) => samePath(d.path, p));
    if (existing && !encoding) { if (activateIt) activate(existing.id); return existing; }
    try {
      const r = await call('file.read', { path: p, encoding: encoding || (force ? 'utf8' : null), defaultEol: settingsRef.current.defaultEol });
      // The resolved path may differ from what was asked for (relative path, "..", case).
      if (!existing) existing = docsRef.current.find((d) => samePath(d.path, r.path));
      if (existing && !encoding) { if (activateIt) activate(existing.id); return existing; }
      if (existing) {
        // Reopen with another encoding: replace the text in place.
        const state = newDocState(r.text, { selection: { anchor: 0 } });
        putState(existing.id, state);
        savedRef.current.set(existing.id, state.doc);
        patchDoc(existing.id, { encoding: r.encoding, eol: r.eol, dirty: false, mtime: r.mtime, size: r.size, readonly: r.readonly, missing: false });
        if (activateIt) activate(existing.id);
        setCursor(cursorInfo(state));
        return existing;
      }
      const doc = addDoc({ path: r.path, name: r.name, encoding: r.encoding, eol: r.eol, mtime: r.mtime, size: r.size, readonly: r.readonly }, r.text, { activateIt });
      call('recent.touch', { path: r.path }).then(setRecent).catch(() => {});
      setMessage(t('opened', { name: r.name }));
      return doc;
    } catch (e) {
      const name = baseName(p);
      if (e.code === 'ETOOBIG') await showError(t('too_big_title'), t('too_big_msg', { name }), e);
      else if (e.code === 'EBINARY' && !force) {
        const r = await confirm(t('binary_title'), t('binary_msg', { name }), [{ id: 'yes', label: t('yes'), kind: 'primary' }, { id: 'cancel', label: t('cancel') }], { icon: 'warning', kind: 'danger' });
        if (r === 'yes') return openPath(p, { encoding, activateIt, force: true });
      } else {
        if (e.code === 'ENOENT') call('recent.remove', { path: p }).then(setRecent).catch(() => {});
        await showError(t('error_title'), t('open_failed', { name }), e);
      }
      return null;
    }
  };

  const openFiles = async (paths) => {
    let last = null;
    for (const p of paths) { const d = await openPath(p, { activateIt: false }); if (d) last = d; }
    if (last) activate(last.id);
  };

  const openDialog = async () => {
    const start = activeDocRef.current && activeDocRef.current.path ? dirName(activeDocRef.current.path) : folderRef.current || undefined;
    const paths = await nativeDialog('open', { multi: true, defaultPath: start });
    if (paths && paths.length) await openFiles(paths);
  };

  const openFolderDialog = async () => {
    const p = await nativeDialog('openFolder', { defaultPath: folderRef.current || undefined });
    if (p) { setFolder(p); setSettings({ sidebarVisible: true }); call('session.save', { folder: p, sidebarVisible: true }).catch(() => {}); }
  };

  // ── save ──
  const saveDoc = async (id, { as = false, encoding = null } = {}) => {
    const doc = getDoc(id);
    if (!doc) return false;
    let target = doc.path;
    if (as || !target) {
      const f = folderRef.current, sep = (infoRef.current && infoRef.current.sep) || '/';
      const p = await nativeDialog('save', { defaultPath: doc.path || (f ? `${f}${sep}${doc.name}` : undefined), name: doc.name });
      if (!p) return false;
      target = p;
    }
    const enc = encoding || doc.encoding;
    // Save-time transforms are applied to the document itself, so what you see is what was written.
    const state = getState(id);
    const before = state.doc.toString();
    const after = applySaveTransforms(before, settingsRef.current);
    if (after !== before) dispatchTo(id, { changes: { from: 0, to: state.doc.length, insert: after } });
    const text = after;
    let force = false;
    try {
      if (!/^utf/.test(enc) && !(await call('file.canEncode', { text, encoding: enc }))) {
        const r = await confirm(t('enc_lossy_title'), t('enc_lossy_msg', { enc: encodingLabel(enc) }), [{ id: 'yes', label: t('yes'), kind: 'danger' }, { id: 'cancel', label: t('cancel') }]);
        if (r !== 'yes') return false;
        force = true;
      }
      const r = await call('file.write', { path: target, text, encoding: enc, eol: doc.eol, force });
      const nowState = getState(id);
      savedRef.current.set(id, nowState.doc);
      const renamed = !samePath(doc.path, r.path);
      patchDoc(id, { path: r.path, name: r.name, encoding: enc, dirty: false, mtime: r.mtime, size: r.size, readonly: false, missing: false });
      if (renamed && !doc.language) applyLanguage({ ...doc, path: r.path, name: r.name });
      call('recent.touch', { path: r.path }).then(setRecent).catch(() => {});
      setMessage(t('saved', { name: r.name }));
      if (renamed && folderRef.current && r.path.startsWith(folderRef.current)) setSbRefresh((x) => x + 1);
      schedulePersist();
      return true;
    } catch (e) {
      await showError(t('error_title'), t('save_failed', { name: baseName(target) }), e);
      return false;
    }
  };

  const saveAll = async () => {
    const dirty = docsRef.current.filter((d) => d.dirty);
    if (!dirty.length) { setMessage(t('nothing_to_save')); return true; }
    for (const d of dirty) { if (!(await saveDoc(d.id))) return false; }
    setMessage(t('all_saved'));
    return true;
  };

  // ── close ──
  // Resolves true when the document may go (saved or discarded).
  const confirmDiscard = async (doc) => {
    if (!doc.dirty || !settingsRef.current.confirmClose) return true;
    activate(doc.id);
    const r = await confirm(t('unsaved_title'), t('unsaved_msg', { name: doc.name }), [
      { id: 'save', label: t('save'), kind: 'primary' }, { id: 'discard', label: t('dont_save'), kind: 'danger' }, { id: 'cancel', label: t('cancel') },
    ], { icon: 'warning', kind: 'danger' });
    if (r === 'save') return saveDoc(doc.id);
    return r === 'discard';
  };

  const closeDocs = async (ids) => {
    const ok = [];
    for (const id of ids) {
      const d = getDoc(id);
      if (!d) continue;
      if (await confirmDiscard(d)) ok.push(id); else break;
    }
    if (ok.length) removeDocs(ok);
    return ok.length === ids.length;
  };

  const closeAllForExit = async () => {
    const dirty = docsRef.current.filter((d) => d.dirty);
    if (!dirty.length || !settingsRef.current.confirmClose) return true;
    if (dirty.length === 1) return confirmDiscard(dirty[0]);
    const r = await confirm(t('unsaved_title'), t('unsaved_many', { n: dirty.length }), [
      { id: 'save', label: t('save_all_and_close'), kind: 'primary' }, { id: 'discard', label: t('discard_all'), kind: 'danger' }, { id: 'cancel', label: t('cancel') },
    ], { icon: 'warning', kind: 'danger' });
    if (r === 'save') return saveAll();
    return r === 'discard';
  };

  // ── reload / external changes ──
  const reloadDoc = async (id, { encoding = null, keepSelection = true } = {}) => {
    const doc = getDoc(id);
    if (!doc || !doc.path) return;
    try {
      const r = await call('file.read', { path: doc.path, encoding: encoding || doc.encoding, defaultEol: settingsRef.current.defaultEol });
      const old = getState(id);
      const sel = keepSelection && old ? { anchor: old.selection.main.anchor, head: old.selection.main.head } : { anchor: 0 };
      const state = newDocState(r.text, { selection: sel });
      putState(id, state);
      savedRef.current.set(id, state.doc);
      patchDoc(id, { encoding: r.encoding, eol: r.eol, dirty: false, mtime: r.mtime, size: r.size, readonly: r.readonly, missing: false });
      if (id === activeIdRef.current) setCursor(cursorInfo(state));
      checkedRef.current.set(id, Date.now());
    } catch (e) {
      await showError(t('error_title'), t('open_failed', { name: doc.name }), e);
    }
  };

  const checkExternal = async (id) => {
    const doc = getDoc(id);
    if (!doc || !doc.path || doc.mtime == null) return;
    const last = checkedRef.current.get(id) || 0;
    if (Date.now() - last < 1500) return;
    checkedRef.current.set(id, Date.now());
    try {
      const st = await call('file.stat', { path: doc.path });
      const cur = getDoc(id);
      if (!cur) return;
      if (cur.readonly !== st.readonly) { patchDoc(id, { readonly: st.readonly }); dispatchTo(id, { effects: readOnlyEffect(st.readonly) }); }
      if (Math.abs(st.mtime - cur.mtime) < 1 && st.size === cur.size) return;
      if (!cur.dirty && settingsRef.current.reloadChangedFiles) { await reloadDoc(id); return; }
      patchDoc(id, { mtime: st.mtime, size: st.size });   // ask once per change
      const r = await confirm(t('changed_title'), t('changed_msg', { name: cur.name }), [{ id: 'yes', label: t('yes'), kind: 'primary' }, { id: 'no', label: t('no') }], { icon: 'warning', kind: 'info' });
      if (r === 'yes') await reloadDoc(id);
      else patchDoc(id, { dirty: true });
    } catch (e) {
      if (e.code === 'ENOENT') {
        const cur = getDoc(id);
        if (cur && !cur.missing) {
          patchDoc(id, { missing: true, dirty: true });
          await confirm(t('deleted_title'), t('deleted_msg', { name: cur.name }), [{ id: 'ok', label: t('ok'), kind: 'primary' }], { icon: 'warning', kind: 'info' });
        }
      }
    }
  };

  // ── session ──
  const schedulePersist = () => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(persistNow, 1000);
  };
  const persistNow = () => {
    persistTimer.current = null;
    if (!bootedRef.current) return;
    const tabs = docsRef.current.map((d) => {
      const s = getState(d.id);
      const sel = s ? s.selection.main : null;
      const tab = { path: d.path, name: d.name, untitledNo: d.untitledNo, encoding: d.encoding, eol: d.eol, language: d.language, cursor: sel ? { anchor: sel.anchor, head: sel.head } : null };
      if (d.dirty && s && s.doc.length <= 512 * 1024) tab.draft = s.doc.toString();
      return tab;
    });
    const activeTab = docsRef.current.findIndex((d) => d.id === activeIdRef.current);
    call('session.save', { tabs, activeTab: Math.max(0, activeTab), folder: folderRef.current, sidebarWidth: sidebarWidthRef.current }).catch(() => {});
  };
  const bootedRef = useRef(false);
  const activeDocRef = useRef(null);
  activeDocRef.current = activeDoc;

  // ── boot ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let session = {};
      let appInfo = null;
      try { appInfo = await call('app.info'); session = await call('session.get'); } catch (e) { console.error(e); }
      if (cancelled) return;
      setInfo(appInfo);
      call('term.shells').then(setShells).catch(() => {});
      if (appInfo && appInfo.platform) hostIsWindows = appInfo.platform === 'win32';
      const s = pickSettings(session);
      settingsRef.current = s; setSettingsState(s);
      setLanguage(s.language);
      applyTheme(s.theme);
      setRecent(Array.isArray(session.recent) ? session.recent : []);
      setUserWords(Array.isArray(session.userWords) ? session.userWords : []);
      setSpellOptions({ codeAll: !!s.spellCodeAll });
      setSidebarWidth(session.sidebarWidth || 240);
      if (session.folder) setFolder(session.folder);
      // Restore the tabs (files are re-read; unsaved drafts come back dirty).
      const tabs = s.restoreSession && Array.isArray(session.tabs) ? session.tabs : [];
      let restored = 0;
      const seen = new Set();
      for (const tab of tabs) {
        if (!tab) continue;
        if (tab.path) { const k = pathKey(tab.path); if (seen.has(k)) continue; seen.add(k); }
        try {
          if (tab.path) {
            let r = null;
            try { r = await call('file.read', { path: tab.path, encoding: tab.encoding || null, defaultEol: s.defaultEol }); } catch { /* gone */ }
            if (r) {
              const hasDraft = typeof tab.draft === 'string';
              addDoc({ path: r.path, name: r.name, encoding: r.encoding, eol: tab.eol || r.eol, language: tab.language || null, mtime: r.mtime, size: r.size, readonly: r.readonly, savedText: hasDraft ? r.text : undefined }, hasDraft ? tab.draft : r.text, { activateIt: false, dirty: hasDraft && tab.draft !== r.text, selection: tab.cursor });
              restored++;
            } else if (typeof tab.draft === 'string') {
              addDoc({ path: tab.path, name: tab.name || baseName(tab.path), encoding: tab.encoding || s.defaultEncoding, eol: tab.eol || s.defaultEol, language: tab.language || null, missing: true }, tab.draft, { activateIt: false, dirty: true, selection: tab.cursor });
              restored++;
            }
          } else {
            const n = tab.untitledNo || untitledRef.current;
            untitledRef.current = Math.max(untitledRef.current, n + 1);
            addDoc({ untitledNo: n, name: t('untitled', { n }), encoding: tab.encoding || s.defaultEncoding, eol: tab.eol || s.defaultEol, language: tab.language || null }, tab.draft || '', { activateIt: false, dirty: !!tab.draft, selection: tab.cursor });
            restored++;
          }
        } catch (e) { console.error('restore failed', e); }
      }
      if (cancelled) return;
      if (!restored) newUntitled('', { activateIt: false });
      const list = docsRef.current;
      const idx = Math.min(Math.max(0, session.activeTab || 0), list.length - 1);
      activate(list[idx].id);
      bootedRef.current = true;
      setBooted(true);
      rendererReady();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Files from the OS (command line / Explorer / second instance).
  useEffect(() => onOpenFiles((paths) => { openFiles(paths); }), []);   // eslint-disable-line react-hooks/exhaustive-deps
  // Window close (desktop) / page unload (web) with unsaved documents.
  useEffect(() => onCloseRequest(async () => { persistNow(); replyClose(await closeAllForExit()); }), []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isElectron) return undefined;
    const h = (e) => { if (docsRef.current.some((d) => d.dirty)) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);
  // External modifications: check the active document when the window regains focus.
  useEffect(() => onWindowFocus(() => { if (activeIdRef.current != null) checkExternal(activeIdRef.current); }), []);   // eslint-disable-line react-hooks/exhaustive-deps
  // Window title.
  useEffect(() => { setWindowTitle(activeDoc ? `${activeDoc.dirty ? '● ' : ''}${activeDoc.name} — My Editor` : 'My Editor'); }, [activeDoc && activeDoc.name, activeDoc && activeDoc.dirty]);   // eslint-disable-line react-hooks/exhaustive-deps
  // The web version draws its own file dialog.
  useEffect(() => {
    setDialogFallback((kind, opts) => new Promise((resolve) => setDialog({ type: 'file', kind, opts, resolve })));
  }, []);

  // ── settings ──
  const changeSettings = (patch) => {
    const next = setSettings(patch);
    if (patch.language !== undefined) { setLanguage(next.language); setDocs((ds) => ds.map((d) => (d.path ? d : { ...d, name: t('untitled', { n: d.untitledNo }) }))); }
    if (patch.theme !== undefined) { const th = applyTheme(next.theme); call('session.save', { themeBg: th.tokens['--bg'] }).catch(() => {}); }
    const editorKeys = ['tabSize', 'insertSpaces', 'wordWrap', 'lineNumbers', 'showWhitespace', 'highlightActiveLine', 'autoCloseBrackets', 'bracketMatching', 'foldGutter', 'spellCheck', 'autoIndent'];
    if (editorKeys.some((k) => patch[k] !== undefined)) {
      const effects = settingsEffects(next);
      if (viewRef.current) viewRef.current.dispatch({ effects });
      for (const [id, s] of statesRef.current) if (id !== activeIdRef.current) statesRef.current.set(id, s.update({ effects: settingsEffects(next) }).state);
    }
    if (patch.mdWysiwyg !== undefined) for (const d of docsRef.current) if (d.langName === 'Markdown') applyLanguage(d);
    if (patch.spellCodeAll !== undefined) { setSpellOptions({ codeAll: !!next.spellCodeAll }); spellRefreshAll([viewRef.current]); }
    call('session.save', patch).catch(() => {});
  };
  const toggleSetting = (k) => changeSettings({ [k]: !settingsRef.current[k] });
  const zoom = Math.round((settings.fontSize / BASE_FONT) * 100);
  const zoomBy = (d) => changeSettings({ fontSize: Math.max(8, Math.min(40, settingsRef.current.fontSize + d)) });

  // ── document property changes ──
  const setDocLanguage = (id, language) => {
    const doc = getDoc(id);
    if (!doc) return;
    const next = { ...doc, language: language === 'auto' ? null : language };
    patchDoc(id, { language: next.language });
    applyLanguage(next);
    schedulePersist();
  };
  const setDocEol = (id, eol) => { patchDoc(id, { eol, dirty: true }); schedulePersist(); };
  const setDocEncoding = (id, encoding) => { patchDoc(id, { encoding, dirty: true }); schedulePersist(); };
  const reopenWith = async (id, encoding) => {
    const doc = getDoc(id);
    if (!doc || !doc.path) return;
    if (doc.dirty) {
      const r = await confirm(t('reopen_title'), t('reopen_msg', { name: doc.name, enc: encodingLabel(encoding) }), [{ id: 'yes', label: t('yes'), kind: 'danger' }, { id: 'cancel', label: t('cancel') }]);
      if (r !== 'yes') return;
    }
    await reloadDoc(id, { encoding });
  };

  // ── sidebar file operations ──
  const sidebarAction = async (id, p, node) => {
    const sep = (infoRef.current && infoRef.current.sep) || '/';
    const invalid = (v) => (/[\\/:*?"<>|]/.test(v) ? t('new_name') : null);
    try {
      if (id === 'reveal') { await call('os.reveal', { path: p }); return true; }
      if (id === 'copyPath') { await writeClipboardText(p); setMessage(t('copied')); return true; }
      if (id === 'newFile' || id === 'newFolder') {
        const name = await ask({ type: 'prompt', title: t(id === 'newFile' ? 'new_file_title' : 'new_folder_title'), label: t('new_name'), okLabel: t('create'), icon: id === 'newFile' ? 'filePlus' : 'folderNew', validate: invalid });
        if (!name) return false;
        const full = `${p.replace(/[\\/]+$/, '')}${sep}${name}`;
        if (id === 'newFolder') await call('fs.mkdir', { path: full });
        else { await call('file.write', { path: full, text: '', encoding: settingsRef.current.defaultEncoding, eol: settingsRef.current.defaultEol }); await openPath(full); }
        return true;
      }
      if (id === 'rename') {
        const name = await ask({ type: 'prompt', title: t('rename_title'), label: t('new_name'), initial: node.name, icon: 'rename', validate: invalid });
        if (!name || name === node.name) return false;
        const to = `${dirName(p)}${sep}${name}`;
        await call('fs.rename', { from: p, to });
        const open = docsRef.current.find((d) => samePath(d.path, p));
        if (open) { patchDoc(open.id, { path: to, name }); if (!open.language) applyLanguage({ ...open, path: to, name }); }
        return true;
      }
      if (id === 'delete') {
        const r = await confirm(t('delete_title'), t('delete_msg', { name: node.name }), [{ id: 'yes', label: t('delete'), kind: 'danger' }, { id: 'cancel', label: t('cancel') }]);
        if (r !== 'yes') return false;
        await call('fs.remove', { path: p });
        const open = docsRef.current.find((d) => samePath(d.path, p));
        if (open) patchDoc(open.id, { missing: true, dirty: true });
        return true;
      }
    } catch (e) {
      await showError(t('error_title'), e.message, e);
    }
    return false;
  };

  // ── drops ──
  const dropFiles = async (files) => {
    const paths = files.map(pathForFile).filter(Boolean);
    if (paths.length) { await openFiles(paths); return; }
    // Browser: no path — read the content and open it as a new document.
    for (const f of files) {
      if (f.size > 64 * 1024 * 1024) continue;
      const text = await f.text();
      addDoc({ name: f.name, untitledNo: null }, text.replace(/\r\n?/g, '\n'), { dirty: true });
    }
  };

  // ── actions (menus, toolbar, shortcuts, status bar) ──
  const withView = (fn) => { const v = viewRef.current; if (v) { fn(v); v.focus(); } };
  const action = async (id, arg) => {
    const v = viewRef.current;
    const cur = activeIdRef.current;
    if (id.startsWith('theme:')) return changeSettings({ theme: id.slice(6) });
    if (id.startsWith('toggle:')) return toggleSetting(id.slice(7));
    if (id.startsWith('lang:')) return setDocLanguage(arg || cur, id.slice(5));
    if (id.startsWith('enc:')) return setDocEncoding(cur, id.slice(4));
    if (id.startsWith('reopen:')) return reopenWith(cur, id.slice(7));
    if (id.startsWith('eol:')) return setDocEol(cur, id.slice(4));
    if (id.startsWith('recent:')) return openPath(id.slice(7));
    if (id.startsWith('indent:')) { const [kind, n] = id.slice(7).split('-'); return changeSettings({ insertSpaces: kind === 'spaces', tabSize: Number(n) }); }
    if (id.startsWith('tab:')) { const d = docsRef.current[Number(id.slice(4))]; if (d) activate(d.id); return; }
    if (id.startsWith('spell:')) {
      const [, kind, word] = id.split(':');
      const hit = v && typeof arg === 'number' ? spellWordAt(v, arg) : null;
      if (kind === 'replace' && hit) withView((vw) => vw.dispatch({ changes: { from: hit.from, to: hit.to, insert: word } }));
      else if (kind === 'add' && hit) { const words = addUserWord(hit.word); call('session.save', { userWords: words }).catch(() => {}); spellRefreshAll([v]); }
      else if (kind === 'ignore' && hit) { ignoreWord(hit.word); spellRefreshAll([v]); }
      return undefined;
    }
    if (id === 'newTerminal') return newTerminal(arg);
    if (id === 'toggle:termVisible') id = 'toggleTerminal';
    if (id === 'toggleTerminal') { const on = !settingsRef.current.termVisible; changeSettings({ termVisible: on }); if (on && !terms.length) newTerminal(); return undefined; }
    if (id.startsWith('md:heading:')) return withView((vw) => md.heading(vw, Number(id.slice(11))));
    if (id.startsWith('md:')) { const fn = md[id.slice(3)]; if (fn) withView((vw) => fn(vw)); return; }
    switch (id) {
      case 'new': newUntitled(); break;
      case 'open': await openDialog(); break;
      case 'openFolder': await openFolderDialog(); break;
      case 'closeFolder': setFolder(''); call('session.save', { folder: '' }).catch(() => {}); break;
      case 'save': await saveDoc(arg || cur); break;
      case 'saveAs': await saveDoc(arg || cur, { as: true }); break;
      case 'saveAll': await saveAll(); break;
      case 'reload': {
        const d = getDoc(arg || cur);
        if (!d || !d.path) break;
        if (d.dirty) { const r = await confirm(t('reload_title'), t('reload_msg', { name: d.name }), [{ id: 'yes', label: t('yes'), kind: 'danger' }, { id: 'cancel', label: t('cancel') }]); if (r !== 'yes') break; }
        await reloadDoc(d.id);
        break;
      }
      case 'close': await closeDocs([arg || cur]); break;
      case 'closeAll': await closeDocs(docsRef.current.map((d) => d.id)); break;
      case 'closeOthers': await closeDocs(docsRef.current.filter((d) => d.id !== (arg || cur)).map((d) => d.id)); break;
      case 'closeRight': { const i = docsRef.current.findIndex((d) => d.id === (arg || cur)); await closeDocs(docsRef.current.slice(i + 1).map((d) => d.id)); break; }
      case 'recentClear': call('recent.clear').then(setRecent).catch(() => {}); break;
      case 'reveal': { const p = arg || (getDoc(cur) || {}).path; if (p) { try { await call('os.reveal', { path: p }); } catch (e) { setMessage(e.message); } } break; }
      case 'openWith': { const p = (getDoc(arg || cur) || {}).path; if (p) { try { await call('os.open', { path: p }); } catch (e) { setMessage(e.message); } } break; }
      case 'copyPath': { const p = typeof arg === 'string' ? arg : (getDoc(arg || cur) || {}).path; if (p) { await writeClipboardText(p); setMessage(t('copied')); } break; }
      case 'copyName': { const d = getDoc(arg || cur); if (d) { await writeClipboardText(d.name); setMessage(t('copied')); } break; }
      case 'exit': persistNow(); if (isElectron) { if (await closeAllForExit()) replyClose(true); } else quitApp(); break;
      // edit
      case 'undo': withView(commands.undo); break;
      case 'redo': withView(commands.redo); break;
      case 'cut': withView((vw) => { const sel = vw.state.sliceDoc(vw.state.selection.main.from, vw.state.selection.main.to); if (sel) { writeClipboardText(sel); commands.deleteSelection(vw); } }); break;
      case 'copy': withView((vw) => { const sel = vw.state.selection.ranges.filter((r) => !r.empty).map((r) => vw.state.sliceDoc(r.from, r.to)).join('\n'); if (sel) writeClipboardText(sel); }); break;
      case 'paste': { const text = await readClipboardText(); if (text) withView((vw) => commands.insertText(vw, text)); break; }
      case 'delete': withView(commands.deleteSelection); break;
      case 'selectAll': withView(commands.selectAll); break;
      case 'dupLine': withView(commands.duplicateLine); break;
      case 'delLine': withView(commands.deleteLine); break;
      case 'moveUp': withView(commands.moveLineUp); break;
      case 'moveDown': withView(commands.moveLineDown); break;
      case 'toggleComment': withView(commands.toggleComment); break;
      case 'indent': withView(commands.indent); break;
      case 'outdent': withView(commands.outdent); break;
      case 'upper': withView(commands.upper); break;
      case 'lower': withView(commands.lower); break;
      case 'sortAsc': withView(commands.sortAsc); break;
      case 'sortDesc': withView(commands.sortDesc); break;
      case 'trimWs': withView(commands.trimTrailing); break;
      case 'removeEmpty': withView(commands.removeEmpty); break;
      case 'removeDup': withView(commands.removeDuplicates); break;
      case 'insertDate': withView((vw) => commands.insertText(vw, new Date().toLocaleString())); break;
      case 'insertPath': { const d = getDoc(cur); if (d && d.path) withView((vw) => commands.insertText(vw, d.path)); break; }
      case 'foldAll': withView(commands.foldAll); break;
      case 'unfoldAll': withView(commands.unfoldAll); break;
      // search
      case 'find': case 'replace': {
        const sel = v ? v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to) : '';
        setFind({ mode: id, initial: sel && !sel.includes('\n') ? sel : (findRef.current ? findRef.current.initial : ''), key: Date.now() });
        break;
      }
      case 'findNext': if (findRef.current) withView((vw) => searchApi.next(vw)); else setFind({ mode: 'find', initial: '', key: Date.now() }); break;
      case 'findPrev': if (findRef.current) withView((vw) => searchApi.prev(vw)); else setFind({ mode: 'find', initial: '', key: Date.now() }); break;
      case 'closeFind': setFind(null); withView(() => {}); break;
      case 'selectMatches': withView((vw) => searchApi.selectAll(vw)); break;
      case 'gotoLine': setDialog({ type: 'goto' }); break;
      // view
      case 'zoomIn': zoomBy(1); break;
      case 'zoomOut': zoomBy(-1); break;
      case 'zoomReset': changeSettings({ fontSize: BASE_FONT }); break;
      case 'fullscreen': windowControl('fullscreen'); break;
      case 'nextTheme': changeSettings({ theme: nextThemeId(settingsRef.current.theme) }); break;
      case 'toggleLanguage': changeSettings({ language: getLanguage() === 'ko' ? 'en' : 'ko' }); break;
      case 'settings': setDialog({ type: 'settings' }); break;
      case 'about': setDialog({ type: 'about' }); break;
      case 'shortcuts': setDialog({ type: 'shortcuts' }); break;
      case 'guide': setDialog({ type: 'shortcuts' }); break;
      case 'languagePicker': setDialog({ type: 'language', docId: arg || cur }); break;
      case 'reopenPicker': setDialog({ type: 'encoding', mode: 'reopen' }); break;
      case 'nextTab': case 'prevTab': {
        const list = docsRef.current; const i = list.findIndex((d) => d.id === cur);
        if (list.length > 1) activate(list[(i + (id === 'nextTab' ? 1 : list.length - 1)) % list.length].id);
        break;
      }
      default: break;
    }
    return undefined;
  };
  actionRef.current = action;

  // ── terminals ──
  const newTerminal = async (shell) => {
    const doc = getDoc(activeIdRef.current);
    const cwd = folderRef.current || (doc && doc.path ? dirName(doc.path) : undefined);
    try {
      const r = await call('term.create', { cwd, shell: shell || undefined });
      const tm = { id: r.id, title: `${r.label} ${termNo.current++}`, shell: r.shell, cwd: r.cwd, buffer: [], seq: 0 };
      setTerms((ts) => [...ts, tm]);
      setActiveTerm(r.id);
      if (!settingsRef.current.termVisible) changeSettings({ termVisible: true });
    } catch (e) { await showError(t('error_title'), e.message, e); }
  };
  const closeTerminal = (id) => {
    call('term.kill', { id }).catch(() => {});
    setTerms((ts) => { const next = ts.filter((x) => x.id !== id); if (activeTerm === id) setActiveTerm(next.length ? next[next.length - 1].id : null); return next; });
  };
  const termSplitRef = useRef(null);
  const onTermResizeStart = (e) => {
    e.preventDefault();
    const y0 = e.clientY, h0 = settingsRef.current.termHeight;
    const move = (ev) => setSettings({ termHeight: Math.max(120, Math.min(window.innerHeight - 200, h0 + (y0 - ev.clientY))) });
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); call('session.save', { termHeight: settingsRef.current.termHeight }).catch(() => {}); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // ── keyboard shortcuts (window level, before CodeMirror's own keymap) ──
  useEffect(() => {
    const action = (id) => actionRef.current(id);
    const onKey = (e) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const k = e.key.toLowerCase();
      let handled = true;
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '');
      if (dialog) return;   // dialogs handle their own keys
      const cur = getDoc(activeIdRef.current);
      const inMd = !!cur && cur.langName === 'Markdown' && !inField;
      // Markdown documents: formatting shortcuts (the sidebar keeps Ctrl+Shift+B).
      if (inMd && mod && !e.shiftKey && !e.altKey && /^[1-6]$/.test(e.key)) action(`md:heading:${e.key}`);
      else if (inMd && mod && !e.shiftKey && k === 'b') action('md:bold');
      else if (inMd && mod && !e.shiftKey && k === 'i') action('md:italic');
      else if (inMd && mod && !e.shiftKey && k === 'k') action('md:link');
      else if (inMd && mod && e.key === '`') action('md:inlineCode');
      else if (inMd && mod && e.shiftKey && k === 'x') action('md:strike');
      else if (inMd && mod && e.shiftKey && k === 'q') action('md:quote');
      else if (inMd && mod && e.shiftKey && k === 'c') action('md:codeBlock');
      else if (inMd && mod && e.shiftKey && k === 'i') action('md:image');
      else if (inMd && mod && e.shiftKey && (e.key === '8' || e.key === '*')) action('md:bulletList');
      else if (inMd && mod && e.shiftKey && (e.key === '7' || e.key === '&')) action('md:orderedList');
      else if (inMd && mod && e.shiftKey && (e.key === '9' || e.key === '(')) action('md:taskList');
      else if (mod && e.shiftKey && k === 'm') action('toggle:mdPreview');
      else if (inMd && mod && e.shiftKey && k === 'w') action('toggle:mdWysiwyg');
      else if (mod && e.shiftKey && k === 'b') action('toggle:sidebarVisible');
      else if (mod && !e.shiftKey && !e.altKey && k === 'n') action('new');
      else if (mod && !e.shiftKey && k === 'o') action('open');
      else if (mod && e.shiftKey && k === 'o') action('openFolder');
      else if (mod && !e.shiftKey && !e.altKey && k === 's') action('save');
      else if (mod && e.shiftKey && k === 's') action('saveAll');
      else if (mod && e.altKey && k === 's') action('saveAs');
      else if (mod && !e.shiftKey && k === 'w') action('close');
      else if (mod && e.shiftKey && k === 'w') action('closeAll');
      else if (mod && e.key === 'Tab') action(e.shiftKey ? 'prevTab' : 'nextTab');
      else if (mod && (e.key === 'PageDown' || e.key === 'PageUp')) action(e.key === 'PageDown' ? 'nextTab' : 'prevTab');
      else if (mod && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) action(`tab:${Number(e.key) - 1}`);
      else if (mod && !e.shiftKey && k === 'f') action('find');
      else if (mod && !e.shiftKey && k === 'h') action('replace');
      else if (e.key === 'F3') action(e.shiftKey ? 'findPrev' : 'findNext');
      else if (mod && !e.shiftKey && k === 'g') action('gotoLine');
      else if (mod && !e.shiftKey && k === 'b') action('toggle:sidebarVisible');
      else if (mod && (e.key === '=' || e.key === '+')) action('zoomIn');
      else if (mod && e.key === '-') action('zoomOut');
      else if (mod && e.key === '0') action('zoomReset');
      else if (e.key === 'F11') action('fullscreen');
      else if (e.key === 'F7') action('toggle:spellCheck');
      else if (mod && e.key === '`' && !inMd) action('toggleTerminal');
      else if (mod && e.shiftKey && e.key === '`') action('newTerminal');
      else if (mod && e.key === ',') action('settings');
      else if (mod && !inField && !e.shiftKey && k === 'd') action('dupLine');
      else if (mod && !inField && !e.shiftKey && k === 'l') action('delLine');
      else if (mod && !inField && !e.shiftKey && k === 'u') action('lower');
      else if (mod && !inField && e.shiftKey && k === 'u') action('upper');
      else if (e.key === 'Escape' && find && e.target.closest && e.target.closest('.editor-area')) action('closeFind');
      else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog, find]);

  // Ctrl+wheel over the editor zooms.
  useEffect(() => {
    const h = (e) => { if ((isMac ? e.metaKey : e.ctrlKey) && e.target.closest && e.target.closest('.editor-pane')) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1 : -1); } };
    window.addEventListener('wheel', h, { passive: false });
    return () => window.removeEventListener('wheel', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── menus ──
  const sc = (win, mac) => (isMac ? (mac || win.replace('Ctrl', '⌘')) : win);
  const cur = activeDoc;
  const menus = [
    { id: 'file', label: t('m_file'), items: () => [
      { id: 'new', label: t('new_file'), icon: 'filePlus', shortcut: sc('Ctrl+N') },
      { id: 'open', label: t('open_file'), icon: 'folderOpen', shortcut: sc('Ctrl+O') },
      { id: 'openFolder', label: t('open_folder'), icon: 'folder', shortcut: sc('Ctrl+Shift+O') },
      ...(folder ? [{ id: 'closeFolder', label: t('close_folder'), icon: 'close' }] : []),
      { sep: true },
      { id: 'save', label: t('save'), icon: 'fileSave', shortcut: sc('Ctrl+S'), disabled: !cur },
      { id: 'saveAs', label: t('save_as'), icon: 'fileSave', shortcut: sc('Ctrl+Alt+S'), disabled: !cur },
      { id: 'saveAll', label: t('save_all'), icon: 'saveAll', shortcut: sc('Ctrl+Shift+S'), disabled: !docs.some((d) => d.dirty) },
      { id: 'reload', label: t('reload'), icon: 'reload', disabled: !cur || !cur.path },
      { sep: true },
      { id: 'close', label: t('close'), icon: 'close', shortcut: sc('Ctrl+W'), disabled: !cur },
      { id: 'closeAll', label: t('close_all'), shortcut: sc('Ctrl+Shift+W'), disabled: !docs.length },
      { id: 'closeOthers', label: t('close_others'), disabled: docs.length < 2 },
      { sep: true },
      { id: 'reveal', label: t('reveal'), icon: 'explorer', disabled: !cur || !cur.path || !isElectron },
      { id: 'openWith', label: t('open_with'), icon: 'open', disabled: !cur || !cur.path || !isElectron },
      { id: 'copyPath', label: t('copy_path'), icon: 'copy', disabled: !cur || !cur.path },
      { sep: true },
      { header: t('recent') },
      ...(recent.length ? recent.slice(0, 10).map((p) => ({ id: `recent:${p}`, label: baseName(p), meta: dirName(p), icon: 'clock' })) : [{ id: 'recentNone', label: t('recent_empty'), disabled: true }]),
      ...(recent.length ? [{ id: 'recentClear', label: t('recent_clear'), icon: 'eraser' }] : []),
      { sep: true },
      { id: 'exit', label: t('exit'), shortcut: isMac ? '⌘Q' : 'Alt+F4' },
    ] },
    { id: 'edit', label: t('m_edit'), items: () => [
      { id: 'undo', label: t('undo'), icon: 'undo', shortcut: sc('Ctrl+Z') },
      { id: 'redo', label: t('redo'), icon: 'redo', shortcut: sc('Ctrl+Y') },
      { sep: true },
      { id: 'cut', label: t('cut'), icon: 'cut', shortcut: sc('Ctrl+X') },
      { id: 'copy', label: t('copy'), icon: 'copy', shortcut: sc('Ctrl+C') },
      { id: 'paste', label: t('paste'), icon: 'paste', shortcut: sc('Ctrl+V') },
      { id: 'delete', label: t('delete'), icon: 'delete', shortcut: 'Del' },
      { id: 'selectAll', label: t('select_all'), shortcut: sc('Ctrl+A') },
      { sep: true },
      { id: 'dupLine', label: t('dup_line'), shortcut: sc('Ctrl+D') },
      { id: 'delLine', label: t('del_line'), shortcut: sc('Ctrl+L') },
      { id: 'moveUp', label: t('move_up'), icon: 'arrowUp', shortcut: 'Alt+↑' },
      { id: 'moveDown', label: t('move_down'), icon: 'arrowDown', shortcut: 'Alt+↓' },
      { id: 'toggleComment', label: t('toggle_comment'), shortcut: sc('Ctrl+/') },
      { id: 'indent', label: t('indent'), shortcut: 'Tab' },
      { id: 'outdent', label: t('outdent'), shortcut: 'Shift+Tab' },
      { sep: true },
      { id: 'upper', label: t('upper'), shortcut: sc('Ctrl+Shift+U') },
      { id: 'lower', label: t('lower'), shortcut: sc('Ctrl+U') },
      { id: 'sortAsc', label: t('sort_asc'), icon: 'sortAsc' },
      { id: 'sortDesc', label: t('sort_desc') },
      { id: 'trimWs', label: t('trim_ws') },
      { id: 'removeEmpty', label: t('remove_empty') },
      { id: 'removeDup', label: t('remove_dup') },
      { sep: true },
      { id: 'insertDate', label: t('insert_date'), icon: 'calendar' },
      { id: 'insertPath', label: t('insert_path'), disabled: !cur || !cur.path },
    ] },
    { id: 'search', label: t('m_search'), items: () => [
      { id: 'find', label: t('find'), icon: 'search', shortcut: sc('Ctrl+F') },
      { id: 'findNext', label: t('find_next'), shortcut: 'F3' },
      { id: 'findPrev', label: t('find_prev'), shortcut: 'Shift+F3' },
      { id: 'replace', label: t('replace'), icon: 'replace', shortcut: sc('Ctrl+H') },
      { id: 'selectMatches', label: t('select_all_matches'), disabled: !find },
      { sep: true },
      { id: 'gotoLine', label: t('goto_line'), icon: 'hash', shortcut: sc('Ctrl+G') },
    ] },
    { id: 'view', label: t('m_view'), items: () => [
      { id: 'toggle:autoIndent', label: t('auto_indent'), checked: settings.autoIndent },
      { id: 'toggle:wordWrap', label: t('word_wrap'), checked: settings.wordWrap },
      { id: 'toggle:lineNumbers', label: t('line_numbers'), checked: settings.lineNumbers },
      { id: 'toggle:showWhitespace', label: t('show_ws'), checked: settings.showWhitespace },
      { id: 'toggle:highlightActiveLine', label: t('active_line'), checked: settings.highlightActiveLine },
      { id: 'toggle:foldGutter', label: t('fold_gutter'), checked: settings.foldGutter },
      { id: 'toggle:spellCheck', label: t('spell_check'), checked: settings.spellCheck, shortcut: 'F7' },
      { id: 'toggle:spellCodeAll', label: t('spell_code_all'), checked: settings.spellCodeAll, disabled: !settings.spellCheck },
      { sep: true },
      { id: 'foldAll', label: t('fold_all') },
      { id: 'unfoldAll', label: t('unfold_all') },
      { sep: true },
      { id: 'toggle:sidebarVisible', label: t('sidebar'), checked: settings.sidebarVisible, shortcut: sc('Ctrl+B') },
      { id: 'toggle:mdWysiwyg', label: t('md_wysiwyg_menu'), checked: settings.mdWysiwyg, shortcut: sc('Ctrl+Shift+W'), disabled: !cur || cur.langName !== 'Markdown' },
      { id: 'toggle:mdPreview', label: t('md_preview_menu'), checked: settings.mdPreview, shortcut: sc('Ctrl+Shift+M'), disabled: !cur || cur.langName !== 'Markdown' },
      { id: 'toggle:toolbarVisible', label: t('toolbar'), checked: settings.toolbarVisible },
      { id: 'toggle:statusBarVisible', label: t('statusbar'), checked: settings.statusBarVisible },
      { id: 'toggleTerminal', label: t('terminal'), icon: 'terminal', checked: settings.termVisible, shortcut: sc('Ctrl+`') },
      { id: 'newTerminal', label: t('term_new'), shortcut: sc('Ctrl+Shift+`') },
      { sep: true },
      { id: 'zoomIn', label: t('zoom_in'), icon: 'zoomIn', shortcut: sc('Ctrl++') },
      { id: 'zoomOut', label: t('zoom_out'), icon: 'zoomOut', shortcut: sc('Ctrl+-') },
      { id: 'zoomReset', label: t('zoom_reset'), shortcut: sc('Ctrl+0') },
      { sep: true },
      { id: 'fullscreen', label: t('fullscreen'), icon: 'fullscreen', shortcut: 'F11' },
    ] },
    { id: 'lang', label: t('m_lang'), items: () => [
      { id: 'lang:auto', label: t('lang_auto'), checked: !!cur && !cur.language, radio: true },
      { id: `lang:${PLAIN}`, label: t('lang_plain'), checked: !!cur && cur.language === PLAIN, radio: true },
      { sep: true },
      ...FEATURED_LANGUAGES.map((d) => ({ id: `lang:${d.name}`, label: d.name, checked: !!cur && cur.language === d.name, radio: true, meta: !cur || cur.language || cur.langName !== d.name ? undefined : t('lang_auto').split(' ')[0] })),
      { sep: true },
      { id: 'languagePicker', label: `${t('m_lang')}…`, icon: 'search' },
    ] },
    { id: 'enc', label: t('m_enc'), items: () => [
      { header: t('enc_current') },
      ...((info && info.encodings) || []).map((e) => ({ id: `enc:${e.id}`, label: e.label, checked: !!cur && cur.encoding === e.id, radio: true })),
      { sep: true },
      { id: 'reopenPicker', label: `${t('reopen_as')}…`, icon: 'reload', disabled: !cur || !cur.path },
      { sep: true },
      { header: t('eol') },
      ...EOLS.map((e) => ({ id: `eol:${e}`, label: t(`eol_${e}`), checked: !!cur && cur.eol === e, radio: true })),
    ] },
    { id: 'help', label: t('m_help'), items: () => [
      { id: 'shortcuts', label: t('shortcuts'), icon: 'keyboard' },
      { sep: true },
      { id: 'settings', label: t('settings'), icon: 'settings', shortcut: sc('Ctrl+,') },
      { id: 'about', label: t('about'), icon: 'info' },
    ] },
  ];

  const tabContextItems = (id) => {
    const d = getDoc(id);
    const i = docs.findIndex((x) => x.id === id);
    return [
      { id: 'save', label: t('save'), icon: 'fileSave' },
      { id: 'saveAs', label: t('save_as') },
      { id: 'reload', label: t('reload'), icon: 'reload', disabled: !d || !d.path },
      { sep: true },
      { id: 'close', label: t('close'), icon: 'close' },
      { id: 'closeOthers', label: t('close_others'), disabled: docs.length < 2 },
      { id: 'closeRight', label: t('close_right'), disabled: i >= docs.length - 1 },
      { id: 'closeAll', label: t('close_all') },
      { sep: true },
      { id: 'reveal', label: t('reveal'), icon: 'explorer', disabled: !d || !d.path || !isElectron },
      { id: 'openWith', label: t('open_with'), icon: 'open', disabled: !d || !d.path || !isElectron },
      { id: 'copyPath', label: t('copy_path'), icon: 'copy', disabled: !d || !d.path },
      { id: 'copyName', label: t('copy_name') },
    ];
  };

  const spellItems = (pos) => {
    const v = viewRef.current;
    if (!v || typeof pos !== 'number' || !settingsRef.current.spellCheck) return [];
    const hit = spellWordAt(v, pos);
    if (!hit) return [];
    const sugg = spellReady() ? spellSuggest(hit.word) : [];
    return [
      ...(sugg.length ? sugg.map((w) => ({ id: `spell:replace:${w}`, label: w, icon: 'spell' })) : [{ id: 'spell:none', label: t(spellReady() ? 'spell_none' : 'spell_loading'), disabled: true }]),
      { id: 'spell:add', label: t('spell_add', { word: hit.word }), icon: 'plus' },
      { id: 'spell:ignore', label: t('spell_ignore', { word: hit.word }), icon: 'eyeOff' },
      { sep: true },
    ];
  };
  const editorContextItems = (pos) => [
    ...spellItems(pos),
    { id: 'undo', label: t('undo'), icon: 'undo', shortcut: sc('Ctrl+Z') },
    { id: 'redo', label: t('redo'), icon: 'redo', shortcut: sc('Ctrl+Y') },
    { sep: true },
    { id: 'cut', label: t('cut'), icon: 'cut', shortcut: sc('Ctrl+X') },
    { id: 'copy', label: t('copy'), icon: 'copy', shortcut: sc('Ctrl+C') },
    { id: 'paste', label: t('paste'), icon: 'paste', shortcut: sc('Ctrl+V') },
    { id: 'delete', label: t('delete'), icon: 'delete' },
    { id: 'selectAll', label: t('select_all'), shortcut: sc('Ctrl+A') },
    { sep: true },
    { id: 'toggleComment', label: t('toggle_comment'), shortcut: sc('Ctrl+/') },
    { id: 'upper', label: t('upper') },
    { id: 'lower', label: t('lower') },
    { sep: true },
    { id: 'find', label: t('find'), icon: 'search', shortcut: sc('Ctrl+F') },
    { id: 'replace', label: t('replace'), icon: 'replace', shortcut: sc('Ctrl+H') },
    { id: 'gotoLine', label: t('goto_line'), icon: 'hash', shortcut: sc('Ctrl+G') },
  ];

  const statusPickers = {
    indent: () => [
      { id: 'toggle:autoIndent', label: t('auto_indent'), checked: settings.autoIndent },
      { sep: true },
      { header: t('set_indent_spaces') },
      ...[2, 3, 4, 8].map((n) => ({ id: `indent:spaces-${n}`, label: t('st_spaces', { n }), checked: settings.insertSpaces && settings.tabSize === n, radio: true })),
      { header: t('set_indent_tabs') },
      ...[2, 4, 8].map((n) => ({ id: `indent:tabs-${n}`, label: t('st_tabs', { n }), checked: !settings.insertSpaces && settings.tabSize === n, radio: true })),
    ],
    eol: () => EOLS.map((e) => ({ id: `eol:${e}`, label: t(`eol_${e}`), checked: !!cur && cur.eol === e, radio: true })),
    encoding: () => [
      { header: t('enc_current') },
      ...((info && info.encodings) || []).map((e) => ({ id: `enc:${e.id}`, label: e.label, checked: !!cur && cur.encoding === e.id, radio: true })),
      { sep: true },
      { id: 'reopenPicker', label: `${t('reopen_as')}…`, icon: 'reload', disabled: !cur || !cur.path },
    ],
    language: () => [
      { id: 'lang:auto', label: t('lang_auto'), checked: !!cur && !cur.language, radio: true },
      { id: `lang:${PLAIN}`, label: t('lang_plain'), checked: !!cur && cur.language === PLAIN, radio: true },
      { sep: true },
      ...FEATURED_LANGUAGES.slice(0, 12).map((d) => ({ id: `lang:${d.name}`, label: d.name, checked: !!cur && cur.language === d.name, radio: true })),
      { sep: true },
      { id: 'languagePicker', label: `${t('m_lang')}…`, icon: 'search' },
    ],
  };

  // ── preview splitter (fraction of the editor area) ──
  const splitRef = useRef(null);
  const onPreviewSplitDown = (e) => {
    e.preventDefault();
    const box = splitRef.current && splitRef.current.getBoundingClientRect();
    if (!box) return;
    const move = (ev) => { const frac = Math.max(0.2, Math.min(0.8, 1 - (ev.clientX - box.left) / box.width)); setSettings({ mdPreviewWidth: frac }); };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); call('session.save', { mdPreviewWidth: settingsRef.current.mdPreviewWidth }).catch(() => {}); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // ── sidebar splitter ──
  const onSplitDown = (e) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = sidebarWidth;
    const move = (ev) => setSidebarWidth(Math.max(160, Math.min(600, w0 + ev.clientX - x0)));
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); schedulePersist(); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // ── smoke-test / automation hook ──
  useEffect(() => {
    window.__med = {
      get state() { return { docs: docsRef.current, activeId: activeIdRef.current, settings: settingsRef.current, folder, find: !!find, dialog: dialog ? dialog.type : null, cursor }; },
      action, openFiles, openPath, newUntitled, activate, setText: (text) => { const v = viewRef.current; if (v) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } }); },
      getText: () => (viewRef.current ? viewRef.current.state.doc.toString() : ''), setFolder: (p) => setFolder(p), view: () => viewRef.current, closeDialog,
    };
  });

  const initialState = useMemo(() => createState('', SETTINGS_DEFAULTS, handlers), [handlers]);
  const onView = useCallback((v) => {
    if (!v && viewRef.current && activeIdRef.current != null) statesRef.current.set(activeIdRef.current, viewRef.current.state);
    viewRef.current = v;
    setView(v);
    if (v && activeIdRef.current != null) { const s = statesRef.current.get(activeIdRef.current); if (s) { v.setState(s); setCursor(cursorInfo(s)); } }
  }, []);

  const openPaths = useMemo(() => new Set(docs.map((d) => d.path).filter(Boolean)), [docs]);
  const isMarkdown = !!cur && cur.langName === 'Markdown';
  const toolbarState = { dirty: !!cur && cur.dirty, anyDirty: docs.some((d) => d.dirty) };

  if (!booted) return <div className="boot">{t('ready')}…</div>;

  return (
    <div className="app">
      <MenuBar menus={menus} onAction={action} theme={settings.theme} />
      {settings.toolbarVisible && <Toolbar onAction={action} onSetting={changeSettings} settings={settings} state={toolbarState} />}
      <div className="body">
        {settings.sidebarVisible && (
          <>
            <Sidebar folder={folder} activePath={cur && cur.path} openPaths={openPaths} width={sidebarWidth} showHidden={showHidden}
              onToggleHidden={() => setShowHidden(!showHidden)} onOpenFile={(p) => openPath(p)} onOpenFolder={openFolderDialog}
              onCloseFolder={() => action('closeFolder')} onAction={sidebarAction} refreshKey={sbRefresh} />
            <div className="v-splitter" onMouseDown={onSplitDown} />
          </>
        )}
        <div className="editor-column">
        <div className="editor-area">
          <TabBar docs={docs} activeId={activeId} onActivate={activate} onClose={(id) => closeDocs([id])} onNew={() => newUntitled()}
            onReorder={(from, to) => { setDocs((ds) => { const a = ds.slice(); const i = a.findIndex((d) => d.id === from), j = a.findIndex((d) => d.id === to); const [m] = a.splice(i, 1); a.splice(j, 0, m); return a; }); schedulePersist(); }}
            onAction={(id, docId) => action(id, docId)} onContextItems={tabContextItems} />
          {isMarkdown && <MarkdownBar onAction={action} preview={settings.mdPreview} wysiwyg={settings.mdWysiwyg} />}
          {find && view && <FindBar key={find.key} view={view} mode={find.mode} initial={find.initial} docVersion={docVersion} onClose={() => action('closeFind')} onModeChange={(mode) => setFind({ ...find, mode })} />}
          <div className="editor-split" ref={splitRef}>
            <EditorPane initialState={initialState} onView={onView} onDropFiles={dropFiles} contextItems={editorContextItems} onAction={action}
              fontFamily={settings.fontFamily} fontSize={settings.fontSize} empty={!docs.length} />
            {isMarkdown && settings.mdPreview && view && (
              <>
                <div className="v-splitter" onMouseDown={onPreviewSplitDown} />
                <Preview view={view} docVersion={docVersion} width={`${Math.round(settings.mdPreviewWidth * 100)}%`} />
              </>
            )}
          </div>
        </div>
        {settings.termVisible && (
          <TerminalPanel terms={terms} activeId={activeTerm} shells={shells} height={settings.termHeight} onResizeStart={onTermResizeStart}
            onActivate={setActiveTerm} onNew={(shell) => newTerminal(shell)} onClose={closeTerminal} onHide={() => changeSettings({ termVisible: false })}
            onExit={() => {}} />
        )}
        </div>
      </div>
      {settings.statusBarVisible && (
        <StatusBar message={message} cursor={cursor} settings={settings} zoom={zoom} pickers={statusPickers} onAction={action}
          doc={cur ? { ...cur, encodingLabel: encodingLabel(cur.encoding) } : null} />
      )}

      {dialog && dialog.type === 'confirm' && <ConfirmDialog title={dialog.title} message={dialog.message} buttons={dialog.buttons} icon={dialog.icon} kind={dialog.kind} detail={dialog.detail} onResult={closeDialog} />}
      {dialog && dialog.type === 'error' && <ErrorDialog title={dialog.title} message={dialog.message} error={dialog.error} onClose={() => closeDialog('ok')} />}
      {dialog && dialog.type === 'prompt' && <PromptDialog title={dialog.title} label={dialog.label} initial={dialog.initial} okLabel={dialog.okLabel} icon={dialog.icon} validate={dialog.validate} onResult={closeDialog} />}
      {dialog && dialog.type === 'about' && <AboutDialog info={info} onClose={closeDialog} />}
      {dialog && dialog.type === 'shortcuts' && <ShortcutsDialog onClose={closeDialog} />}
      {dialog && dialog.type === 'settings' && <SettingsDialog settings={settings} encodings={(info && info.encodings) || []} onChange={changeSettings} onClose={closeDialog} />}
      {dialog && dialog.type === 'goto' && <GotoLineDialog lines={cursor.lines} current={cursor.line} onClose={closeDialog} onGo={(l, c) => { closeDialog(); withView((v) => commands.gotoLine(v, l, c)); }} />}
      {dialog && dialog.type === 'language' && <LanguagePicker current={(getDoc(dialog.docId) || {}).language || 'auto'} onClose={closeDialog} onPick={(name) => { closeDialog(); setDocLanguage(dialog.docId, name); }} />}
      {dialog && dialog.type === 'encoding' && <EncodingPicker title={t('reopen_as')} encodings={(info && info.encodings) || []} current={cur && cur.encoding} onClose={closeDialog} onPick={(id) => { closeDialog(); reopenWith(activeIdRef.current, id); }} />}
      {dialog && dialog.type === 'file' && <FileDialog kind={dialog.kind} startPath={dialog.opts.defaultPath || folder || (info && info.home)} defaultName={dialog.opts.name} sep={(info && info.sep) || '/'} onResult={closeDialog} />}
    </div>
  );
}
