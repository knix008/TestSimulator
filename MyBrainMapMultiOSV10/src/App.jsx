// MyBrainMap — the main window.
//
// Maps are tabs (src/lib/docs.js: map + undo history + camera + selection).
// The active map is laid out (src/lib/layout.js) and drawn by MapCanvas, or
// shown as an outline / Gantt chart. Every change goes through `edit` (or
// `mutate`), which records it for undo; the session (open maps with their
// unsaved drafts, the camera, settings) is written a moment after each change
// and brought back on the next start.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t, useLanguage, setLanguage, getLanguage } from './lib/i18n';
import { applyTheme, setCustomThemes, nextThemeId, themeById, baseColorsOf } from './themes';
import {
  call, isDesktop, nativeDialog, setDialogFallback, setWindowTitle, onOpenFiles, rendererReady, onOsFileDrop, onCloseRequest, replyClose,
  onWindowFocus, onWindowBlur, openPopup, openHelp, warmPopups, sendSettingsPatch, onSettingsPatch, openExternal, quitApp, windowControl,
  writeClipboardText, writeClipboardImage, readClipboardText,
} from './lib/backend';
import { pickSettings, SETTINGS_DEFAULTS } from './lib/settings';
import { createDoc, commit, undo as undoDoc, redo as redoDoc, isDirty, suggestName, keepSelection } from './lib/docs';
import {
  findTopic, entryOf, setText, setStyle, setField, setTask, expandToLevel, expandAll, sortChildren, balanceSides,
  addRelationship, updateRelationship, removeRelationships, copyFragment, pasteFragment, topicsFromText, textOfTopics,
  filterActive, filterTopics, indexOf, mapTitle, countTopics, replaceInTopics, subtreeIds, isRoot, LAYOUTS, normalizeMap, arrangeMap, nudgeTopics,
} from './lib/model';
import { cmdAddChild, cmdAddSibling, cmdAddParent, cmdAddCallout, cmdAddFloating, cmdDelete, cmdMove, cmdFloat, cmdNudge, navigate, cmdShift, cmdToggleFold } from './lib/commands';
import { layoutMap } from './lib/layout';
import { resolveMapStyle, MAP_STYLES, SHAPES, mapStyleById } from './lib/mapstyles';
import { measureText, themeTokens } from './lib/measure';
import { readMapFile, writeMapFile, serializeMap, openFilters, importFilters, saveFilters, exportMap, exportById, extOf, baseName, MAP_EXT, OPEN_EXT } from './lib/formats/index';
import { mapFromTemplate } from './lib/templates';
import { mapFromSample } from './lib/samples';
import { importOpml, importMarkdown, importTextOutline } from './lib/formats/outline';
import { importFreeMind } from './lib/formats/freemind';
import { mapPngDataUrl } from './lib/exportimg';
import { markerLabel } from './lib/markers';
import { MenuBar } from './components/MenuBar';
import { Toolbar, LAYOUT_ICONS } from './components/Toolbar';
import { TabBar } from './components/TabBar';
import { StatusBar } from './components/StatusBar';
import { MapCanvas } from './components/MapCanvas';
import { Overview } from './components/Overview';
import { Sidebar } from './components/Sidebar';
import { TaskPane, ShapeIcon } from './components/TaskPane';
import { LevelIcon } from './components/IconSelect';
import { OutlineView } from './components/OutlineView';
import { GanttView } from './components/GanttView';
import { KanbanView } from './components/KanbanView';
import { GuidedTour } from './components/GuidedTour';
import { Presentation } from './components/Presentation';
import { StartPage } from './components/StartPage';
import { ContextMenu } from './components/ContextMenu';
import { Icon } from './components/Icons';
import { ConfirmDialog, ErrorDialog, AboutDialog, PromptDialog, QuickEntryDialog, TemplateDialog, ExportDialog, ShortcutsDialog } from './dialogs/Dialogs';
import { SettingsDialog } from './dialogs/SettingsDialog';
import { PrintPreviewDialog } from './dialogs/PrintPreviewDialog';
import { FileDialog } from './dialogs/FileDialog';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'];
const isTextField = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || (el.tagName === 'TEXTAREA' && !el.classList.contains('sink')) || el.isContentEditable);

// The app's own clipboard: the last copied topics, recognised again by their text.
let clipFragment = null;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(file); });
}
function imageSize(src) {
  return new Promise((resolve) => { const img = new Image(); img.onload = () => resolve({ w: img.naturalWidth || 160, h: img.naturalHeight || 120 }); img.onerror = () => resolve({ w: 160, h: 120 }); img.src = src; });
}
async function topicImage(src) {
  const { w, h } = await imageSize(src);
  const k = Math.min(1, 220 / Math.max(1, w));
  return { src, w: Math.round(w * k), h: Math.round(h * k) };
}

export default function App() {
  const lang = useLanguage();
  const [settings, setSettings] = useState(() => pickSettings(SETTINGS_DEFAULTS));
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const [ready, setReady] = useState(false);
  const [docs, setDocsState] = useState([]);
  const docsRef = useRef(docs);
  const [activeId, setActiveIdState] = useState(null);
  const activeRef = useRef(activeId);
  const [recent, setRecent] = useState([]);
  const [info, setInfo] = useState(null);
  const [message, setMessage] = useState('');
  const [startOpen, setStartOpen] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [editing, setEditingState] = useState(null);   // { docId, id, mode, seq, isNew }
  const editingRef = useRef(null);
  const [draft, setDraftState] = useState('');
  const draftRef = useRef('');
  const [linkFrom, setLinkFrom] = useState(null);
  const [presenting, setPresenting] = useState(false);
  const [touring, setTouring] = useState(false);   // the guided tour over the tutorial map
  const tourMark = useRef(null);   // the tutorial map before a tour step's demo changed it
  const [ctx, setCtx] = useState(null);
  const [findFocus, setFindFocus] = useState(0);
  const [notesFocus, setNotesFocus] = useState(0);
  const [view, setView] = useState(null);
  const viewLatest = useRef({ id: null, v: null });
  const viewRaf = useRef(0);
  const viewSave = useRef(0);
  const canvas = useRef(null);
  const editSeq = useRef(0);
  const untitledSeq = useRef(0);
  const lastEditAt = useRef(0);

  const setDocs = useCallback((list) => { docsRef.current = list; setDocsState(list); }, []);
  const setActiveId = useCallback((id) => { activeRef.current = id; setActiveIdState(id); }, []);
  const setEditing = (e) => { editingRef.current = e; setEditingState(e); };
  const setDraft = (v) => { draftRef.current = v; setDraftState(v); };
  // A status message; the same text twice still flashes (an invisible joiner alternates).
  const flashToggle = useRef(false);
  const flash = useCallback((msg) => { flashToggle.current = !flashToggle.current; setMessage(flashToggle.current ? `${msg}⁠` : msg); }, []);

  const activeDoc = () => docsRef.current.find((d) => d.id === activeRef.current) || null;
  const mutate = useCallback((id, fn) => {
    let changed = null;
    const list = docsRef.current.map((d) => { if (d.id !== id) return d; changed = fn(d); return changed; });
    if (changed) setDocs(list);
    return changed;
  }, [setDocs]);

  // A change to the active map, recorded for undo. fn(map, doc) → map | { map, sel } | null.
  const edit = useCallback((fn, key = '', sel) => {
    const d = activeDoc();
    if (!d) return null;
    const r = fn(d.map, d);
    if (!r) return null;
    const map = r.root ? r : r.map;
    if (!map) return null;
    lastEditAt.current = Date.now();
    mutate(d.id, (x) => commit(x, map, { key, sel: sel || r.sel }));
    return r;
  }, [mutate]);   // eslint-disable-line react-hooks/exhaustive-deps

  const select = useCallback((sel, { rel = null } = {}) => {
    const d = activeDoc();
    if (!d) return;
    mutate(d.id, (x) => ({ ...x, sel, selRel: rel }));
  }, [mutate]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── settings ──
  const applySettings = useCallback((patch, { persist = true, broadcast = true } = {}) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    if (patch.customThemes !== undefined) setCustomThemes(next.customThemes);
    if (patch.theme !== undefined || patch.customThemes !== undefined) {
      const th = applyTheme(next.theme);
      if (persist) call('session.save', { themeBg: th.tokens['--bg'] }).catch(() => {});
    }
    if (patch.language !== undefined) setLanguage(next.language);
    setSettings(next);
    if (persist) call('session.save', patch).catch(() => {});
    if (broadcast) sendSettingsPatch(patch);
  }, []);

  // ── errors / dialogs ──
  const showError = useCallback((title, err) => {
    setDialog({ kind: 'error', title, message: err && err.message ? err.message : String(err || ''), error: err });
  }, []);
  const ask = useCallback((props) => new Promise((resolve) => setDialog({ ...props, look: props.kind, kind: 'confirm', onResult: (r) => { setDialog(null); resolve(r); } })), []);
  const prompt = useCallback((props) => new Promise((resolve) => setDialog({ ...props, look: props.kind, kind: 'prompt', onResult: (r) => { setDialog(null); resolve(r); } })), []);

  // Web: the in-page file dialog stands in for the native ones.
  useEffect(() => {
    setDialogFallback((kind, opts) => new Promise((resolve) => {
      setDialog({ kind: 'file', fileKind: kind, opts, onResult: (r) => { setDialog(null); resolve(r || (kind === 'open' ? [] : null)); } });
    }));
  }, []);

  // ── documents ──
  const addDoc = useCallback((doc, { activate = true } = {}) => {
    setDocs([...docsRef.current, doc]);
    if (activate) { setActiveId(doc.id); setStartOpen(false); }
    return doc;
  }, [setDocs, setActiveId]);

  const newDocFromMap = useCallback((map, extra = {}) => {
    untitledSeq.current += 1;
    const name = extra.name || t('untitled', { n: untitledSeq.current });
    return addDoc(createDoc(map, { name, kind: 'new', ...extra }));
  }, [addDoc]);

  const newMapDoc = useCallback((templateId = 'blank') => {
    const s = settingsRef.current;
    const map = mapFromTemplate(templateId, getLanguage(), { style: s.defaultMapStyle, layout: s.defaultLayout });
    // a template's map is named after its central topic; a blank one "새 맵 n"
    const doc = newDocFromMap(map, templateId === 'blank' ? {} : { name: mapTitle(map).slice(0, 40) });
    if (templateId === 'blank') {
      // the central topic is ready to be typed over
      setTimeout(() => { const d = docsRef.current.find((x) => x.id === doc.id); if (d) { editSeq.current += 1; setEditing({ docId: d.id, id: d.map.root.id, mode: 'all', seq: editSeq.current }); setDraft(d.map.root.text); } }, 60);
    }
    return doc;
  }, [newDocFromMap]);

  const openPaths = useCallback(async (paths) => {
    let last = null;
    for (const p of paths || []) {
      const existing = docsRef.current.find((d) => d.path && d.path.toLowerCase() === String(p).toLowerCase());
      if (existing) { last = existing; continue; }
      if (!OPEN_EXT.includes(extOf(p))) { flash(t('msg_unsupported', { name: baseName(p) })); continue; }
      try {
        const r = await readMapFile(p, call);
        const tmap = r.kind === 'tmap';
        const doc = createDoc(r.map, { path: tmap ? r.path : '', source: r.path, name: baseName(r.path), kind: r.kind, mtime: r.mtime, readonly: r.readonly });
        setDocs([...docsRef.current, doc]);
        last = doc;
        if (tmap) call('recent.touch', { path: r.path }).then(setRecent).catch(() => {});
        flash(tmap ? t('msg_opened', { name: doc.name }) : t('msg_imported', { name: doc.name }));
      } catch (err) {
        if (err && err.code === 'ENOENT') call('recent.remove', { path: p }).then(setRecent).catch(() => {});
        showError(t('err_open'), err);
      }
    }
    if (last) { setActiveId(last.id); setStartOpen(false); }
  }, [setDocs, setActiveId, flash, showError]);

  const openDialog = useCallback(async (importOnly = false) => {
    try {
      const paths = await nativeDialog('open', { filters: importOnly ? importFilters(getLanguage()) : openFilters(getLanguage()), multi: true, title: t(importOnly ? 'import_file' : 'open_file') });
      if (paths && paths.length) await openPaths(paths);
    } catch (err) { showError(t('err_open'), err); }
  }, [openPaths, showError]);

  // Save (as): a .tmap file. Imported maps and new ones ask for a name.
  const saveDoc = useCallback(async (id, { as = false } = {}) => {
    finishEdit();
    const d = docsRef.current.find((x) => x.id === id);
    if (!d) return false;
    let path = d.path;
    if (as || !path || d.kind !== 'tmap') {
      const base = d.source ? d.source.replace(/[^\\/]+$/, '') : (info && info.documents) || '';
      const name = suggestName(d, mapTitle(d.map));
      const picked = await nativeDialog('save', { defaultPath: base ? `${base}${base.endsWith('/') || base.endsWith('\\') ? '' : (info && info.sep) || '/'}${name}` : name, name, filters: saveFilters(), title: t('save_as') }).catch((err) => { showError(t('err_save'), err); return null; });
      if (!picked) return false;
      path = /\.tmap$/i.test(picked) ? picked : `${picked}.${MAP_EXT}`;
    }
    try {
      const map = d.map;
      const r = await writeMapFile(path, map, call);
      mutate(id, (x) => ({ ...x, path: r.path, source: r.path, name: r.name, kind: 'tmap', saved: map, mtime: r.mtime, readonly: false }));
      call('recent.touch', { path: r.path }).then(setRecent).catch(() => {});
      flash(t('msg_saved', { name: r.name }));
      return true;
    } catch (err) {
      showError(t('err_save'), err);
      return false;
    }
  }, [mutate, flash, showError, info]);   // eslint-disable-line react-hooks/exhaustive-deps

  const saveAll = useCallback(async () => {
    for (const d of docsRef.current.filter(isDirty)) { const ok = await saveDoc(d.id); if (!ok) return false; }
    return true;
  }, [saveDoc]);

  // Close tabs, asking about unsaved ones. Resolves to false when cancelled.
  const closeDocs = useCallback(async (ids) => {
    finishEdit();
    for (const id of ids) {
      const d = docsRef.current.find((x) => x.id === id);
      if (!d) continue;
      if (isDirty(d) && settingsRef.current.confirmClose) {
        setActiveId(id);
        const r = await ask({ title: t('close_title'), message: t('close_dirty', { name: d.name }), icon: 'warning', kind: 'danger', buttons: [{ id: 'save', label: t('save'), kind: 'primary' }, { id: 'discard', label: t('dont_save') }, { id: 'cancel', label: t('cancel') }] });
        if (r === 'cancel') return false;
        if (r === 'save' && !(await saveDoc(id))) return false;
      }
      const list = docsRef.current;
      const i = list.findIndex((x) => x.id === id);
      const rest = list.filter((x) => x.id !== id);
      setDocs(rest);
      if (activeRef.current === id) setActiveId(rest.length ? rest[Math.min(i, rest.length - 1)].id : null);
    }
    if (!docsRef.current.length) setStartOpen(true);
    return true;
  }, [ask, saveDoc, setDocs, setActiveId]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── editing a topic's text ──
  const startEdit = useCallback((id, mode = 'all', value) => {
    const d = activeDoc();
    if (!d || !findTopic(d.map, id)) return;
    editSeq.current += 1;
    setEditing({ docId: d.id, id, mode, seq: editSeq.current, isNew: false });
    setDraft(mode === 'replace' ? value ?? '' : findTopic(d.map, id).text || '');
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const startNewEdit = (id) => {
    const d = activeDoc();
    editSeq.current += 1;
    setEditing({ docId: d.id, id, mode: 'all', seq: editSeq.current, isNew: true });
    setDraft('');
  };

  // Commits the text being edited (a new topic left empty is taken back).
  function finishEdit(next = null) {
    const ed = editingRef.current;
    if (!ed) return;
    setEditing(null);
    const d = docsRef.current.find((x) => x.id === ed.docId);
    if (!d) return;
    const text = draftRef.current.replace(/\s+$/, '');
    const topic = findTopic(d.map, ed.id);
    if (!topic) return;
    if (ed.isNew && !text.trim()) {
      mutate(d.id, (x) => { const u = undoDoc(x); return { ...u, future: x.future, sel: keepSelection(u.map, [entryOf(x.map, ed.id) ? (entryOf(x.map, ed.id).parent || x.map.root.id) : x.map.root.id]) }; });
      return;
    }
    if (text !== topic.text) {
      lastEditAt.current = Date.now();
      mutate(d.id, (x) => commit(x, setText(x.map, ed.id, text), { sel: [ed.id] }));
    }
    if (next === 'tab') { const r = edit((m, doc) => cmdAddChild(m, doc.sel, { autoBalance: settingsRef.current.autoBalance })); if (r) startNewEdit(r.edit); }
    else if (next === 'shiftTab') { const p = entryOf(activeDoc().map, ed.id); if (p && p.parent) select([p.parent]); }
    setTimeout(() => canvas.current && canvas.current.focus(), 0);
  }

  const cancelEdit = useCallback(() => {
    const ed = editingRef.current;
    if (!ed) return;
    if (ed.isNew) { setDraft(''); finishEdit(); return; }
    setEditing(null);
    setDraft('');
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── session restore ──
  useEffect(() => {
    let alive = true;
    (async () => {
      let session = {};
      try { session = await call('session.get'); } catch (err) { setMessage(String(err.message || err)); }
      const appInfo = await call('app.info').catch(() => null);
      if (!alive) return;
      const s = pickSettings(session);
      setCustomThemes(s.customThemes);
      applyTheme(s.theme);
      setLanguage(s.language);
      settingsRef.current = s;
      setSettings(s);
      setInfo(appInfo);
      setRecent(Array.isArray(session.recent) ? session.recent : []);
      const restored = [];
      if (s.restoreSession && Array.isArray(session.tabs)) {
        for (const tab of session.tabs) {
          try {
            if (tab.draft) {
              const map = normalizeMap(JSON.parse(tab.draft));
              const doc = createDoc(map, { path: tab.path || '', source: tab.source || tab.path || '', name: tab.name || t('untitled', { n: ++untitledSeq.current }), kind: tab.kind || (tab.path ? 'tmap' : 'new'), view: tab.view || null, sel: keepSelection(map, tab.sel), mtime: tab.mtime || 0 });
              if (tab.dirty) doc.saved = null;
              restored.push(doc);
            } else if (tab.path) {
              const r = await readMapFile(tab.path, call);
              restored.push(createDoc(r.map, { path: r.path, source: r.path, name: baseName(r.path), kind: r.kind, mtime: r.mtime, readonly: r.readonly, view: tab.view || null, sel: keepSelection(r.map, tab.sel) }));
            }
          } catch { /* a file that is gone is not restored */ }
        }
      }
      if (!alive) return;
      setDocs(restored);
      const at = Math.min(Math.max(0, Number(session.activeTab) || 0), restored.length - 1);
      setActiveId(restored.length ? restored[at].id : null);
      setStartOpen(!restored.length || s.showStartOnLaunch);
      setReady(true);
      // the very first launch after installing: the tutorial map and the guided tour
      if (!s.tutorialDone) setTimeout(() => { runActionRef.current && runActionRef.current('tour'); }, 400);
      rendererReady();
      warmPopups();
    })();
    return () => { alive = false; };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── session save (debounced) ──
  useEffect(() => {
    if (!ready) return undefined;
    const id = setTimeout(() => {
      const tabs = docsRef.current.map((d) => ({
        path: d.path, source: d.source || '', name: d.name, kind: d.kind, dirty: isDirty(d), mtime: d.mtime,
        draft: !d.path || isDirty(d) ? serializeMap(d.map) : '', view: d.view, sel: d.sel,
      }));
      const activeTab = Math.max(0, docsRef.current.findIndex((d) => d.id === activeRef.current));
      call('session.save', { tabs, activeTab }).catch(() => {});
    }, 900);
    return () => clearTimeout(id);
  }, [docs, activeId, ready]);

  // ── popups → main window ──
  useEffect(() => onSettingsPatch((patch) => {
    if (patch.settingsTab) return;
    applySettings(patch, { persist: false, broadcast: false });
  }), [applySettings]);

  // ── files from the OS ──
  useEffect(() => onOpenFiles((paths) => openPaths(paths)), [openPaths]);

  // ── window title ──
  const active = docs.find((d) => d.id === activeId) || null;
  useEffect(() => {
    setWindowTitle(active ? `${active.name}${isDirty(active) ? ' •' : ''} — MyBrainMap` : 'MyBrainMap');
  }, [active && active.name, active && isDirty(active)]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── closing the window ──
  const closeAllForQuit = useCallback(async () => {
    finishEdit();
    const dirty = docsRef.current.filter(isDirty);
    if (dirty.length && settingsRef.current.confirmClose) {
      const r = await ask({ title: t('quit_title'), message: t('quit_dirty', { n: dirty.length, names: dirty.map((d) => d.name).join(', ') }), icon: 'warning', kind: 'danger', buttons: [{ id: 'save', label: t('save_all'), kind: 'primary' }, { id: 'discard', label: t('dont_save') }, { id: 'cancel', label: t('cancel') }] });
      if (r === 'cancel') return false;
      if (r === 'save' && !(await saveAll())) return false;
    }
    return true;
  }, [ask, saveAll]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onCloseRequest(async () => { const ok = await closeAllForQuit(); replyClose(ok); }), [closeAllForQuit]);
  useEffect(() => {
    if (isDesktop) return undefined;
    const h = (e) => { if (docsRef.current.some(isDirty) && settingsRef.current.confirmClose) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  // ── maps changed by another program ──
  const checkExternal = useCallback(async () => {
    if (!settingsRef.current.reloadChangedFiles) return;
    for (const d of docsRef.current) {
      if (!d.path || d.kind !== 'tmap') continue;
      try {
        const st = await call('file.stat', { path: d.path });
        if (!st || !d.mtime || Math.abs(st.mtime - d.mtime) < 1) continue;
        if (isDirty(d)) {
          const r = await ask({ title: t('changed_title'), message: t('changed_dirty', { name: d.name }), icon: 'warning', kind: 'info', buttons: [{ id: 'reload', label: t('reload'), kind: 'danger' }, { id: 'keep', label: t('keep_mine'), kind: 'primary' }] });
          if (r !== 'reload') { mutate(d.id, (x) => ({ ...x, mtime: st.mtime })); continue; }
        }
        const r = await readMapFile(d.path, call);
        mutate(d.id, (x) => ({ ...commit(x, r.map, {}), saved: r.map, mtime: r.mtime }));
        flash(t('msg_reloaded', { name: d.name }));
      } catch { /* a missing file stays open as it is */ }
    }
  }, [ask, mutate, flash]);
  useEffect(() => onWindowFocus(() => { checkExternal(); }), [checkExternal]);

  // ── auto save ──
  useEffect(() => onWindowBlur(() => {
    if (settingsRef.current.autoSave !== 'blur') return;
    for (const d of docsRef.current) if (isDirty(d) && d.path && d.kind === 'tmap') saveDoc(d.id);
  }), [saveDoc]);
  useEffect(() => {
    if (settings.autoSave !== 'delay') return undefined;
    const ms = Math.max(2, Number(settings.autoSaveDelay) || 10) * 1000;
    const id = setInterval(() => {
      if (Date.now() - lastEditAt.current < ms || editingRef.current) return;
      for (const d of docsRef.current) if (isDirty(d) && d.path && d.kind === 'tmap') saveDoc(d.id);
    }, 1000);
    return () => clearInterval(id);
  }, [settings.autoSave, settings.autoSaveDelay, saveDoc]);

  // ── the active map, laid out ──
  const viewMap = useMemo(() => {
    if (!active) return null;
    if (editing && editing.docId === active.id && findTopic(active.map, editing.id)) return setText(active.map, editing.id, draft);
    return active.map;
  }, [active, editing, draft]);
  const ms = useMemo(() => (viewMap ? resolveMapStyle(viewMap, themeTokens()) : null), [viewMap && viewMap.style, viewMap && viewMap.background, viewMap && viewMap.lineStyle, viewMap && viewMap.branchColors, settings.theme, settings.customThemes]);   // eslint-disable-line react-hooks/exhaustive-deps
  const filterInfo = useMemo(() => (active && viewMap && filterActive(active.filter) ? filterTopics(viewMap, active.filter) : null), [viewMap, active && active.filter]);   // eslint-disable-line react-hooks/exhaustive-deps
  const hidden = useMemo(() => {
    if (!filterInfo || active.filterMode !== 'hide') return null;
    return new Set([...indexOf(viewMap).keys()].filter((id) => !filterInfo.keep.has(id)));
  }, [filterInfo, active && active.filterMode, viewMap]);   // eslint-disable-line react-hooks/exhaustive-deps
  const dimIds = useMemo(() => {
    if (!filterInfo || active.filterMode === 'hide') return null;
    return new Set([...indexOf(viewMap).keys()].filter((id) => !filterInfo.hits.has(id)));
  }, [filterInfo, active && active.filterMode, viewMap]);   // eslint-disable-line react-hooks/exhaustive-deps
  const L = useMemo(() => (viewMap && ms ? layoutMap(viewMap, {
    ms, measure: measureText, lang, baseSize: Number(settings.mapFontSize) || 14, mapFont: settings.mapFont || '', hidden,
    focusId: active.focusId && findTopic(viewMap, active.focusId) ? active.focusId : null, autoBalance: settings.autoBalance !== false,
  }) : null), [viewMap, ms, lang, settings.mapFontSize, settings.mapFont, hidden, active && active.focusId, settings.autoBalance]);   // eslint-disable-line react-hooks/exhaustive-deps

  // keep the selected topic in view after keyboard moves / new topics
  const pendingReveal = useRef(null);
  useEffect(() => {
    if (pendingReveal.current && L && canvas.current) { canvas.current.ensureVisible(pendingReveal.current); pendingReveal.current = null; }
  }, [L]);
  const reveal = (id) => { pendingReveal.current = id; if (L && L.nodes.has(id) && canvas.current) { canvas.current.ensureVisible(id); } };

  // ── clipboard ──
  const copySelection = useCallback(async (clipboardData, cut = false) => {
    const d = activeDoc();
    if (!d) return;
    const frag = copyFragment(d.map, d.sel);
    if (!frag.topics.length) return;
    const text = textOfTopics(frag.topics);
    clipFragment = { frag: JSON.parse(JSON.stringify(frag)), text };
    if (clipboardData) clipboardData.setData('text/plain', text);
    else await writeClipboardText(text);
    if (cut) { const r = edit((m, doc) => cmdDelete(m, doc.sel)); if (r) flash(t('msg_cut', { n: frag.topics.length })); }
    else flash(t('msg_copied', { n: frag.topics.length }));
  }, [edit, flash]);   // eslint-disable-line react-hooks/exhaustive-deps

  const pasteInto = useCallback(async (clipboardData) => {
    const d = activeDoc();
    if (!d) return;
    const target = d.sel[d.sel.length - 1] || d.map.root.id;
    // a picture on the clipboard becomes the topic's image
    const items = clipboardData ? [...(clipboardData.items || [])] : [];
    const imgItem = items.find((it) => it.kind === 'file' && /^image\//.test(it.type));
    if (imgItem) {
      const src = await readFileAsDataUrl(imgItem.getAsFile());
      const image = await topicImage(src);
      edit((m) => setField(m, [target], 'image', image));
      flash(t('msg_image_set'));
      return;
    }
    const text = clipboardData ? clipboardData.getData('text/plain') : await readClipboardText();
    if (clipFragment && text === clipFragment.text) {
      edit((m) => { const r = pasteFragment(m, target, clipFragment.frag); return { map: r.map, sel: r.ids }; });
      return;
    }
    const tops = topicsFromText(text);
    if (!tops.length) return;
    edit((m) => { const r = pasteFragment(m, target, { topics: tops, relationships: [] }); return { map: r.map, sel: r.ids }; });
    flash(t('msg_pasted', { n: tops.length }));
  }, [edit, flash]);   // eslint-disable-line react-hooks/exhaustive-deps

  const copyImage = useCallback(async () => {
    const d = activeDoc();
    if (!d) return;
    try {
      const { dataUrl } = await mapPngDataUrl(d.map, { lang: getLanguage(), settings: settingsRef.current, scale: 2 });
      const ok = await writeClipboardImage(dataUrl);
      flash(ok ? t('msg_image_copied') : t('msg_image_copy_failed'));
    } catch (err) { showError(t('copy_image'), err); }
  }, [flash, showError]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── export / print ──
  const doExport = useCallback(async (opts) => {
    const d = activeDoc();
    if (!d || !opts) return;
    const fmt = exportById(opts.id);
    const base = (d.source || d.path || '').replace(/\.[^.\\/]+$/, '') || mapTitle(d.map).replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim() || 'map';
    const name = `${baseName(base)}.${fmt.ext}`;
    const dir = d.source ? d.source.replace(/[^\\/]+$/, '') : '';
    try {
      const picked = await nativeDialog('save', { defaultPath: dir ? dir + name : name, name, filters: [{ name: fmt.label[getLanguage() === 'ko' ? 0 : 1], extensions: [fmt.ext] }], title: t('export_title') });
      if (!picked) return;
      const path = new RegExp(`\\.${fmt.ext}$`, 'i').test(picked) ? picked : `${picked}.${fmt.ext}`;
      flash(t('msg_exporting'));
      await exportMap(opts.id, d.map, path, call, { ...opts, lang: getLanguage(), settings: settingsRef.current });
      flash(t('msg_exported', { name: baseName(path) }));
      applySettings({ exportScale: opts.scale, exportTransparent: !!opts.transparent, exportPadding: opts.padding });
    } catch (err) { showError(t('err_export'), err); }
  }, [flash, showError, applySettings]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── links / attachments / pictures ──
  const openLink = useCallback((id) => {
    const d = activeDoc();
    const tp = d && findTopic(d.map, id);
    if (!tp || !tp.link || !tp.link.url) return;
    const url = tp.link.url;
    if (/^topic:/.test(url)) {
      const target = url.slice(6);
      if (findTopic(d.map, target)) { select([target]); setTimeout(() => canvas.current && canvas.current.centerOn(target), 30); }
      else flash(t('msg_topic_gone'));
      return;
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) || /^mailto:/i.test(url)) openExternal(url);
    else if (isDesktop) openExternal(url);
    else call('os.open', { path: url }).catch((err) => showError(t('link_open'), err));
  }, [flash, showError]);   // eslint-disable-line react-hooks/exhaustive-deps

  const pickFiles = async (filters, multi = true) => {
    try { return await nativeDialog('open', { filters, multi }); } catch (err) { showError(t('err_open'), err); return []; }
  };

  const setImageFromFile = async (id) => {
    const paths = await pickFiles([{ name: t('images'), extensions: IMAGE_EXT }, { name: t('all_files'), extensions: ['*'] }], false);
    if (!paths || !paths.length) return;
    try {
      const r = await call('file.dataUrl', { path: paths[0] });
      const image = await topicImage(r.dataUrl);
      edit((m) => setField(m, [id], 'image', image));
    } catch (err) { showError(t('link_image'), err); }
  };

  // ── relationships ──
  const startLink = (from) => { setLinkFrom(from); flash(t('link_hint')); };
  const finishLink = (to) => {
    const from = linkFrom;
    setLinkFrom(null);
    if (!to || !from || to === from) return;
    const r = edit((m) => { const x = addRelationship(m, from, to); return x.id ? { map: x.map, sel: [to] } : null; });
    if (r) flash(t('msg_rel_added'));
  };

  // ── command dispatch ──
  const runAction = useCallback(async (id, arg) => {
    const s = settingsRef.current;
    const d = activeDoc();
    if (editingRef.current && !/^(toggle:|theme:|nextTheme|toggleLanguage)/.test(id)) finishEdit();
    setCtx(null);
    const sel = d ? d.sel : [];
    const primary = sel[sel.length - 1];
    const needDoc = () => { if (!d) { flash(t('msg_no_map')); return false; } return true; };
    const afterAdd = (r) => { if (r && r.edit) { startNewEdit(r.edit); reveal(r.edit); } };
    // prefixed ids
    if (id.startsWith('theme:')) { applySettings({ theme: id.slice(6) }); return; }
    if (id.startsWith('recent:')) { await openPaths([id.slice(7)]); return; }
    if (id.startsWith('recent-remove:')) { call('recent.remove', { path: id.slice(14) }).then(setRecent).catch(() => {}); return; }
    if (id.startsWith('template:')) { newMapDoc(id.slice(9)); return; }
    if (id.startsWith('sample:')) { const map = mapFromSample(id.slice(7), getLanguage()); newDocFromMap(map, { name: mapTitle(map).slice(0, 40) }); setTimeout(() => canvas.current && canvas.current.fit(), 80); return; }
    if (id.startsWith('toggle:')) { const k = id.slice(7); applySettings({ [k]: !s[k] }); return; }
    if (id.startsWith('pane:')) {
      const tab = id.slice(5);
      if (s.panelVisible && s.panelTab === tab && !arg) applySettings({ panelVisible: false });
      else applySettings({ panelVisible: true, panelTab: tab });
      if (tab === 'notes') setNotesFocus((n) => n + 1);
      return;
    }
    if (id.startsWith('side:')) { applySettings({ sidebarVisible: true, sidebarTab: id.slice(5) }); if (id === 'side:find') setFindFocus((n) => n + 1); return; }
    if (id.startsWith('view:')) { applySettings({ view: id.slice(5) }); setStartOpen(false); return; }
    // redraw in a direction: the layout changes and every topic goes back to its place
    if (id.startsWith('redraw:')) { if (needDoc()) { const layout = id.slice(7); edit((m) => ({ ...arrangeMap(m, { balance: layout === 'map' }), layout })); setTimeout(() => canvas.current && canvas.current.fit(), 60); } return; }
    if (id.startsWith('layout:')) { if (needDoc()) { edit((m) => ({ ...m, layout: id.slice(7) })); setTimeout(() => canvas.current && canvas.current.fit(), 60); } return; }
    if (id.startsWith('style:')) { if (needDoc()) edit((m) => ({ ...m, style: id.slice(6) })); return; }
    if (id.startsWith('shape:')) { if (needDoc()) edit((m) => setStyle(m, sel, { shape: id.slice(6) || null })); return; }
    if (id.startsWith('priority:')) { if (needDoc()) { const p = Number(id.slice(9)); edit((m) => setTask(m, sel, { priority: p || null })); } return; }
    if (id.startsWith('progress:')) { if (needDoc()) { const v = id.slice(9); edit((m) => setTask(m, sel, { progress: v === '' ? null : Number(v) })); } return; }
    if (id.startsWith('level:')) { if (needDoc()) edit((m) => expandToLevel(m, Number(id.slice(6)))); return; }
    // the guided tour's demos (src/lib/tourSteps.js): topics of the tutorial map by their place
    // ("0/3": main topic 0, its subtopic 3), texts as "한국어|English"
    if (id.startsWith('tour:') && d) {
      const [, what, ...rest] = id.split(':');
      const argStr = rest.join(':');
      const text = () => { const [ko, en] = argStr.split('|'); return getLanguage() === 'ko' ? ko : (en ?? ko); };
      const at = (path) => { let tp = d.map.root; if (path === 'root') return tp; for (const k of path.split('/')) { tp = (tp.children || [])[Number(k)]; if (!tp) return null; } return tp; };
      // the topics (with their branches) brought into view, big enough to read
      const show = (ids) => setTimeout(() => canvas.current && canvas.current.showBranch(ids), 60);
      const added = (r) => {
        if (!r || !r.sel) return;
        const e = entryOf(activeDoc().map, r.sel[0]);
        if (!e || e.kind === 'floating') setTimeout(() => canvas.current && canvas.current.fit(), 60); else show([e.parent]);
      };
      switch (what) {
        case 'mark': tourMark.current = { docId: d.id, map: d.map, theme: s.theme }; return;
        case 'restore': {
          const mk = tourMark.current;
          if (!mk || mk.docId !== d.id) return;
          if (d.map !== mk.map) edit(() => ({ map: mk.map, sel: [] }), 'tour-restore');
          if (d.focusId) mutate(d.id, (x) => ({ ...x, focusId: null }));
          if (s.theme !== mk.theme) applySettings({ theme: mk.theme });
          setTimeout(() => canvas.current && canvas.current.fit(), 60);
          return;
        }
        case 'sel': { const ids = argStr.split(',').map(at).filter(Boolean).map((tp) => tp.id); if (ids.length) { select(ids); show(ids); } return; }
        case 'add': {
          const [kind] = rest;
          const t2 = (() => { const [ko, en] = rest.slice(1).join(':').split('|'); return getLanguage() === 'ko' ? ko : (en ?? ko); })();
          const fn = kind === 'child' ? cmdAddChild : kind === 'parent' ? cmdAddParent : cmdAddSibling;
          added(edit((m, doc) => { const r = fn(m, doc.sel, { autoBalance: s.autoBalance }); return r && { map: setText(r.map, r.edit, t2), sel: [r.edit] }; }));
          return;
        }
        case 'rename': if (primary) edit((m) => setText(m, primary, text())); return;
        case 'nudge': { const [dx, dy] = rest.map(Number); edit((m) => cmdNudge(m, sel, dx, dy), 'tour-nudge'); return; }
        case 'icon': edit((m) => sel.reduce((acc, x) => { const tp = findTopic(acc, x); return tp && !(tp.icons || []).includes(argStr) ? setField(acc, [x], 'icons', [...(tp.icons || []), argStr]) : acc; }, m)); return;
        case 'subLayout': edit((m) => setField(m, sel, 'layout', argStr || null)); show(sel); return;
        case 'summary': edit((m) => setField(m, sel.filter((x) => (findTopic(m, x).children || []).length), 'summary', { text: text() })); return;
        case 'callout': added(edit((m, doc) => { const r = cmdAddCallout(m, doc.sel); return { map: setText(r.map, r.edit, text()), sel: [r.edit] }; })); return;
        case 'floating': {
          // in the empty space above the map
          const p = L && L.bounds ? { x: (L.bounds.x0 + L.bounds.x1) / 2, y: L.bounds.y0 - 60 } : { x: 0, y: -300 };
          added(edit((m) => { const r = cmdAddFloating(m, p.x, p.y); return { map: setText(r.map, r.edit, text()), sel: [r.edit] }; }));
          return;
        }
        case 'closeDialog': setDialog(null); return;
        // a tab of the task pane, opened (pane:… would close it when it is open already)
        case 'pane': applySettings({ panelVisible: true, panelTab: argStr }); return;
        default: break;
      }
    }
    if (id.startsWith('rel:')) {
      const [, what, relId] = id.split(':');
      const rel = d && (d.map.relationships || []).find((r) => r.id === relId);
      if (!rel) return;
      if (what === 'label') { const v = await prompt({ title: t('rel_label'), label: t('rel_label_hint'), initial: rel.label || '', icon: 'relationship', allowEmpty: true }); if (v !== null) edit((m) => updateRelationship(m, relId, { label: v })); }
      else if (what === 'dash') edit((m) => updateRelationship(m, relId, { dash: rel.dash === false ? null : false }));
      else if (what === 'both') edit((m) => updateRelationship(m, relId, { arrowStart: !rel.arrowStart || null }));
      else if (what === 'reverse') edit((m) => updateRelationship(m, relId, { from: rel.to, to: rel.from, c1: rel.c2 || null, c2: rel.c1 || null }));
      else if (what === 'reset') edit((m) => updateRelationship(m, relId, { c1: null, c2: null }));
      else if (what === 'color') edit((m) => updateRelationship(m, relId, { color: arg || null }));
      else if (what === 'delete') edit((m) => removeRelationships(m, [relId]));
      return;
    }
    switch (id) {
      // ── file ──
      case 'new': newMapDoc('blank'); return;
      case 'template': setDialog({ kind: 'template' }); return;
      case 'samples': setDialog({ kind: 'samples' }); return;
      case 'tour': {
        // the tutorial map (one tab, reused) and the step-by-step tour on it
        const open = docsRef.current.find((x) => x.tutorial || (!x.path && /^My ?BrainMap (튜토리얼|tutorial)$/.test(x.name)));
        if (open) { setActiveId(open.id); setStartOpen(false); } else { const doc = newMapDoc('tour'); mutate(doc.id, (x) => ({ ...x, tutorial: true })); }
        applySettings({ view: 'map', sidebarVisible: true, panelVisible: true, showGrid: true, showRulers: true, overviewVisible: true });
        setTimeout(() => { if (canvas.current) canvas.current.fit(); setTouring(true); }, 350);
        return;
      }
      case 'tourMap': newMapDoc('tour'); return;
      // the tour's "show me" buttons
      case 'tour:comments': case 'tour:demoMarkers': {
        const x = activeDoc();
        if (!x) return;
        const want = id === 'tour:comments' ? (tp) => (tp.comments || []).length : (tp) => tp.task && tp.task.priority;
        const hit = [...indexOf(x.map).values()].find((e) => want(e.topic));
        if (hit) { select([hit.topic.id]); setTimeout(() => canvas.current && canvas.current.centerOn(hit.topic.id), 30); }
        applySettings({ panelVisible: true, panelTab: id === 'tour:comments' ? 'notes' : 'markers' });
        return;
      }
      case 'tour:demoTopic': {
        if (!needDoc()) return;
        const r = edit((m) => { const a = cmdAddChild(m, [m.root.id], { autoBalance: s.autoBalance }); return { map: setText(a.map, a.edit, getLanguage() === 'ko' ? '새 아이디어 (Ctrl+Z 로 되돌리기)' : 'A new idea (Ctrl+Z undoes it)'), sel: [a.edit] }; });
        if (r) setTimeout(() => canvas.current && canvas.current.centerOn(r.sel[0]), 60);
        return;
      }
      case 'tour:demoDrag': {
        if (!needDoc()) return;
        const first = d.map.root.children[0];
        if (first) { edit((m) => cmdNudge(m, [first.id], 70, -50)); select([first.id]); }
        return;
      }
      case 'tour:demoRedraw': {
        if (!needDoc()) return;
        const order = ['right', 'left', 'orgDown', 'map'];
        const next = order[(order.indexOf(d.map.layout) + 1) % order.length];
        runAction(`redraw:${next}`);
        return;
      }
      case 'tour:demoViews': { const order = ['outline', 'gantt', 'kanban', 'map']; applySettings({ view: order[(order.indexOf(s.view) + 1) % order.length] }); return; }
      case 'tour:demoFold': applySettings({ sidebarVisible: !s.sidebarVisible }); return;
      case 'tour:showPanes': applySettings({ sidebarVisible: true, panelVisible: true }); return;
      case 'tour:demoZoom': if (canvas.current) { const v = canvas.current.getView(); if (v && v.k < 1.4) canvas.current.zoomTo(1.6); else canvas.current.fit(); } return;
      case 'open': openDialog(false); return;
      case 'import': openDialog(true); return;
      case 'save': if (d) saveDoc(d.id); return;
      case 'saveAs': if (d) saveDoc(d.id, { as: true }); return;
      case 'saveAll': saveAll(); return;
      case 'export': if (needDoc()) setDialog({ kind: 'export', initial: arg || 'png' }); return;
      case 'print': if (needDoc()) setDialog({ kind: 'print' }); return;
      case 'copyImage': if (needDoc()) copyImage(); return;
      case 'close': if (d) closeDocs([arg && typeof arg === 'string' ? arg : d.id]); return;
      case 'closeAll': closeDocs(docsRef.current.map((x) => x.id)); return;
      case 'closeOthers': { const keep = typeof arg === 'string' ? arg : d && d.id; closeDocs(docsRef.current.filter((x) => x.id !== keep).map((x) => x.id)); return; }
      case 'reveal': { const x = typeof arg === 'string' ? docsRef.current.find((y) => y.id === arg) : d; const p = x && (x.path || x.source); if (p) call('os.reveal', { path: p }).catch((err) => showError(t('reveal'), err)); return; }
      case 'copyPath': { const x = typeof arg === 'string' ? docsRef.current.find((y) => y.id === arg) : d; if (x && (x.path || x.source)) { writeClipboardText(x.path || x.source); flash(t('msg_path_copied')); } return; }
      case 'recentClear': call('recent.clear').then(setRecent).catch(() => {}); return;
      case 'exit': { if (isDesktop) quitApp(); else { const ok = await closeAllForQuit(); if (ok) window.close(); } return; }
      // ── edit ──
      case 'undo': if (d) mutate(d.id, undoDoc); return;
      case 'redo': if (d) mutate(d.id, redoDoc); return;
      case 'cut': if (d) copySelection(null, true); return;
      case 'copy': if (d) copySelection(null, false); return;
      case 'paste': if (d) pasteInto(null); return;
      case 'delete': if (d) { if (d.selRel) { edit((m) => removeRelationships(m, [d.selRel])); mutate(d.id, (x) => ({ ...x, selRel: null })); } else edit((m) => cmdDelete(m, sel)); } return;
      case 'deleteKeepChildren': if (d) edit((m) => cmdDelete(m, sel, { keepChildren: true })); return;
      case 'selectAll': if (d) select([...indexOf(d.map).keys()]); return;
      case 'selectSiblings': if (d && primary) { const e = entryOf(d.map, primary); if (e && e.parent) select(findTopic(d.map, e.parent)[e.kind === 'callout' ? 'callouts' : 'children'].map((c) => c.id)); } return;
      case 'selectBranch': if (d && primary) select(subtreeIds(d.map, primary)); return;
      case 'editTopic': if (d && primary) startEdit(primary, 'end'); return;
      case 'moveUp': if (d) edit((m) => cmdShift(m, sel, -1)); return;
      case 'moveDown': if (d) edit((m) => cmdShift(m, sel, 1)); return;
      case 'sortChildren': if (d) edit((m) => sortChildren(m, sel.length ? sel : [m.root.id])); return;
      case 'find': applySettings({ sidebarVisible: true, sidebarTab: 'find' }); setFindFocus((n) => n + 1); return;
      case 'findNext': {
        if (!d) return;
        const hits = filterInfo ? [...filterInfo.hits] : [];
        if (!hits.length) { runAction('find'); return; }
        const i = hits.indexOf(primary);
        const next = hits[(i + 1) % hits.length];
        select([next]); setTimeout(() => canvas.current && canvas.current.centerOn(next), 30);
        return;
      }
      // ── insert ──
      case 'addChild': if (needDoc()) afterAdd(edit((m, doc) => cmdAddChild(m, doc.sel, { autoBalance: s.autoBalance }))); return;
      case 'addSibling': if (needDoc()) afterAdd(edit((m, doc) => cmdAddSibling(m, doc.sel, { autoBalance: s.autoBalance }))); return;
      case 'addSiblingBefore': if (needDoc()) afterAdd(edit((m, doc) => cmdAddSibling(m, doc.sel, { before: true, autoBalance: s.autoBalance }))); return;
      case 'addParent': if (needDoc()) afterAdd(edit((m, doc) => cmdAddParent(m, doc.sel))); return;
      case 'addCallout': if (needDoc()) afterAdd(edit((m, doc) => cmdAddCallout(m, doc.sel))); return;
      case 'addFloating': {
        if (!needDoc()) return;
        const v = canvas.current ? canvas.current.getView() : null;
        const size = canvas.current ? canvas.current.size() : { w: 800, h: 600 };
        const p = arg && arg.x != null ? arg : v ? { x: (size.w * 0.72 - v.x) / v.k, y: (size.h * 0.3 - v.y) / v.k } : { x: 400, y: -200 };
        afterAdd(edit((m) => cmdAddFloating(m, p.x, p.y)));
        return;
      }
      case 'relationship': {
        if (!needDoc()) return;
        if (linkFrom) { setLinkFrom(null); return; }
        if (sel.length >= 2) { edit((m) => { const r = addRelationship(m, sel[sel.length - 2], sel[sel.length - 1]); return r.id ? r.map : null; }); flash(t('msg_rel_added')); return; }
        startLink(primary || d.map.root.id);
        return;
      }
      case 'relFrom': if (d) startLink(primary); return;
      case 'boundary': {
        if (!needDoc()) return;
        const has = sel.some((x) => findTopic(d.map, x) && findTopic(d.map, x).boundary);
        edit((m) => setField(m, sel, 'boundary', has ? null : { shape: 'rounded' }));
        return;
      }
      case 'summary': {
        if (!needDoc() || !sel.length) return;
        const has = sel.some((x) => findTopic(d.map, x) && findTopic(d.map, x).summary);
        if (has) { edit((m) => setField(m, sel, 'summary', null)); return; }
        const withKids = sel.filter((x) => (findTopic(d.map, x).children || []).length);
        if (!withKids.length) { flash(t('msg_summary_needs_kids')); return; }
        const v = await prompt({ title: t('summary'), label: t('summary_label_hint'), initial: t('summary'), icon: 'summary', allowEmpty: true });
        if (v !== null) edit((m) => setField(m, withKids, 'summary', { text: v }));
        return;
      }
      case 'summaryLabel': {
        const target = typeof arg === 'string' ? arg : primary;
        const tp = d && target && findTopic(d.map, target);
        if (!tp || !tp.summary) return;
        const v = await prompt({ title: t('summary'), label: t('summary_label_hint'), initial: tp.summary.text || '', icon: 'summary', allowEmpty: true });
        if (v !== null) edit((m) => setField(m, [target], 'summary', { ...tp.summary, text: v }));
        return;
      }
      case 'boundaryCloud': if (d) edit((m) => setField(m, sel, 'boundary', { shape: 'cloud' })); return;
      case 'boundaryLabel': {
        if (!d || !primary) return;
        const tp = findTopic(d.map, primary);
        const v = await prompt({ title: t('boundary_label'), label: t('boundary_label_hint'), initial: (tp.boundary && tp.boundary.label) || '', icon: 'boundary', allowEmpty: true });
        if (v !== null) edit((m) => setField(m, [primary], 'boundary', { ...(tp.boundary || { shape: 'rounded' }), label: v }));
        return;
      }
      case 'notes': runAction('pane:notes', true); return;
      // comments and custom properties live under the Notes tab: open it and put the caret there
      case 'comment': case 'props': {
        if (!d || !primary) return;
        applySettings({ panelVisible: true, panelTab: 'notes' });
        setTimeout(() => { const el = document.querySelector(id === 'comment' ? '.comment-new textarea' : '.props-grid input:nth-last-of-type(2)'); if (el) { el.scrollIntoView({ block: 'nearest' }); el.focus(); } }, 80);
        return;
      }
      case 'hyperlink': {
        if (!d || !primary) return;
        const tp = findTopic(d.map, primary);
        const v = await prompt({ title: t('link_hyperlink'), label: t('link_prompt'), initial: (tp.link && tp.link.url) || 'https://', icon: 'link', allowEmpty: true });
        if (v !== null) edit((m) => setField(m, sel, 'link', v && v !== 'https://' ? { url: v } : null));
        return;
      }
      case 'openLink': openLink(arg || primary); return;
      case 'linkFile': {
        const paths = await pickFiles([{ name: t('all_files'), extensions: ['*'] }], false);
        if (paths && paths.length) edit((m) => setField(m, [arg || primary], 'link', { url: paths[0] }));
        return;
      }
      case 'addAttachment': {
        const target = arg || primary;
        if (!d || !target) return;
        const paths = await pickFiles([{ name: t('all_files'), extensions: ['*'] }], true);
        if (paths && paths.length) edit((m) => { const tp = findTopic(m, target); return setField(m, [target], 'attachments', [...(tp.attachments || []), ...paths.map((p) => ({ name: baseName(p), path: p }))]); });
        return;
      }
      case 'openAttachment': if (arg) { if (isDesktop) openExternal(arg); else call('os.open', { path: arg }).catch((err) => showError(t('link_open'), err)); } return;
      case 'revealAttachment': if (arg) call('os.reveal', { path: arg }).catch((err) => showError(t('reveal'), err)); return;
      case 'image': case 'imageFile': if (d && (arg || primary)) setImageFromFile(arg || primary); return;
      case 'imagePaste': {
        const target = arg || primary;
        try {
          const items = navigator.clipboard && navigator.clipboard.read ? await navigator.clipboard.read() : [];
          for (const it of items) {
            const type = it.types.find((x) => x.startsWith('image/'));
            if (type) { const blob = await it.getType(type); const image = await topicImage(await readFileAsDataUrl(blob)); edit((m) => setField(m, [target], 'image', image)); return; }
          }
          flash(t('msg_no_image'));
        } catch { flash(t('msg_no_image')); }
        return;
      }
      case 'quickEntry': if (needDoc()) setDialog({ kind: 'quick' }); return;
      // ── format ──
      case 'bold': case 'italic': case 'underline': case 'strike': {
        if (!d || !sel.length) return;
        const tp = findTopic(d.map, primary);
        const node = L && L.nodes.get(primary);
        const cur = tp && tp.style && tp.style[id] != null ? tp.style[id] : id === 'bold' && node ? node.st.bold : false;
        edit((m) => setStyle(m, sel, { [id]: !cur }));
        return;
      }
      case 'growFont': case 'shrinkFont': {
        if (!d || !sel.length || !L) return;
        edit((m) => sel.reduce((acc, x) => { const n = L.nodes.get(x); const base = (findTopic(acc, x).style || {}).fontSize || (n ? n.st.fontSize : 14); return setStyle(acc, [x], { fontSize: Math.max(6, Math.min(96, Math.round(base + (id === 'growFont' ? 2 : -2)))) }); }, m));
        return;
      }
      case 'clearFormat': if (d) edit((m) => setStyle(m, sel, { shape: null, fill: null, color: null, border: null, borderWidth: null, fontSize: null, bold: null, italic: null, underline: null, strike: null, font: null, align: null, width: null, line: null, lineWidth: null })); return;
      case 'balance': if (d) edit((m) => balanceSides(m)); return;
      case 'arrange': if (needDoc()) { edit((m) => arrangeMap(m)); flash(t('msg_arranged')); setTimeout(() => canvas.current && canvas.current.fit(), 60); } return;
      case 'resetPosition': if (d && sel.length) edit((m) => nudgeTopics(m, sel.map((x) => { const tp = findTopic(m, x); return tp && tp.offset ? { id: x, dx: -tp.offset.x, dy: -tp.offset.y } : { id: x, dx: 0, dy: 0 }; }))); return;
      case 'detachFloating': {
        if (!d || !primary || isRoot(d.map, primary) || !L) return;
        const n = L.nodes.get(primary);
        if (n && n.kind !== 'floating') edit((m) => cmdFloat(m, [primary], { x: n.x + n.w / 2 + 40, y: n.y + n.h / 2 + 40 }));
        return;
      }
      case 'numbering': if (d) edit((m) => ({ ...m, numbering: { ...(m.numbering || {}), enabled: !(m.numbering && m.numbering.enabled) } })); return;
      case 'subLayout': return;
      // ── view ──
      case 'showStart': setStartOpen((v) => !v || !docsRef.current.length); return;
      case 'zoomIn': if (canvas.current) canvas.current.zoomIn(); return;
      case 'zoomOut': if (canvas.current) canvas.current.zoomOut(); return;
      case 'zoom100': if (canvas.current) canvas.current.zoomTo(1); return;
      case 'fit': if (canvas.current) canvas.current.fit(); return;
      case 'centerMap': if (canvas.current) canvas.current.centerMap(); return;
      case 'fitSelection': if (canvas.current && d) canvas.current.fitSelection(sel); return;
      case 'expandAll': if (d) edit((m) => expandAll(m)); return;
      case 'collapseAll': if (d) edit((m) => expandToLevel(m, 1)); return;
      case 'toggleFold': if (d) edit((m) => cmdToggleFold(m, arg ? [arg] : sel)); return;
      case 'focusBranch': {
        if (!d) return;
        const target = d.focusId ? null : (primary && primary !== d.map.root.id ? primary : null);
        mutate(d.id, (x) => ({ ...x, focusId: target }));
        setTimeout(() => canvas.current && canvas.current.fit(), 60);
        return;
      }
      case 'focusOff': if (d) { mutate(d.id, (x) => ({ ...x, focusId: null })); setTimeout(() => canvas.current && canvas.current.fit(), 60); } return;
      case 'presentation': if (needDoc()) setPresenting(true); return;
      case 'fullscreen': windowControl('fullscreen'); return;
      case 'filterClear': if (d) mutate(d.id, (x) => ({ ...x, filter: null })); return;
      // ── app ──
      case 'settings': if (!openPopup('settings', typeof arg === 'string' ? arg : '')) setDialog({ kind: 'settings', tab: typeof arg === 'string' ? arg : '' }); return;
      case 'about': if (!openPopup('about')) setDialog({ kind: 'about' }); return;
      case 'shortcuts': if (!openPopup('shortcuts')) setDialog({ kind: 'shortcuts' }); return;
      case 'openHelp': openHelp(typeof arg === 'string' ? arg : ''); return;
      case 'nextTheme': applySettings({ theme: nextThemeId(s.theme) }); return;
      // a copy of the current theme becomes a new custom theme, ready to edit in Settings › Theme
      case 'themeCustomNew': {
        const base = themeById(s.theme);
        const id = `custom-${Date.now().toString(36)}`;
        applySettings({ customThemes: [...(s.customThemes || []), { id, label: `${getLanguage() === 'ko' ? base.label : base.labelEn} ${t('set_custom_copy')}`, mode: base.mode, colors: baseColorsOf(base) }], theme: id });
        setTimeout(() => runActionRef.current && runActionRef.current('settings', 'theme'), 0);
        return;
      }
      case 'themeCustomEdit': if (!openPopup('settings', 'theme')) setDialog({ kind: 'settings', tab: 'theme' }); return;
      case 'toggleLanguage': applySettings({ language: s.language === 'ko' ? 'en' : 'ko' }); return;
      case 'layoutMenu': case 'styleMenu': return;
      default:
        if (id.startsWith('clip:')) {
          const kind = id.slice(5);
          if (kind === 'copy') copySelection(arg, false);
          else if (kind === 'cut') copySelection(arg, true);
          else if (kind === 'paste') pasteInto(arg);
        }
    }
  }, [applySettings, openPaths, newMapDoc, openDialog, saveDoc, saveAll, closeDocs, copyImage, mutate, edit, select, copySelection, pasteInto, startEdit, openLink, flash, showError, prompt, closeAllForQuit, linkFrom, L, filterInfo]);   // eslint-disable-line react-hooks/exhaustive-deps

  const runActionRef = useRef(null);
  runActionRef.current = runAction;

  // ── keyboard ──
  // fromCanvas: the key came from the map (its key catcher); text fields keep their own editing keys.
  const handleKey = useCallback((e, fromCanvas = false) => {
    if (e.defaultPrevented || dialog || presenting || touring) return false;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    const inField = !fromCanvas && isTextField(e.target);
    const run = (id, arg) => { e.preventDefault(); e.stopPropagation(); runAction(id, arg); return true; };
    const d = activeDoc();
    // view and layout keys (Ctrl+Alt)
    if (ctrl && e.altKey && !e.shiftKey && !inField) {
      const byCode = { KeyC: 'centerMap', KeyG: 'toggle:showGrid', KeyR: 'toggle:showRulers', KeyO: 'toggle:overviewVisible', KeyS: 'toggle:sidebarVisible', KeyP: 'toggle:panelVisible', KeyM: 'redraw:map' }[e.code];
      if (byCode) return run(byCode);
      if (k === 'ArrowDown') return run('redraw:orgDown');
      if (k === 'ArrowRight') return run('redraw:right');
      if (k === 'ArrowLeft') return run('redraw:left');
    }
    // everywhere
    if (ctrl && !e.altKey) {
      const lower = k.length === 1 ? k.toLowerCase() : k;
      if (lower === 'n' && !e.shiftKey) return run('new');
      if (lower === 'o' && !e.shiftKey) return run('open');
      if (lower === 's') return run(e.shiftKey ? 'saveAs' : 'save');
      if (lower === 'e' && !e.shiftKey) return run('export');
      if (lower === 'p' && !e.shiftKey) return run('print');
      if (lower === 'w') return run('close');
      if (k === 'Tab') { e.preventDefault(); const list = docsRef.current; const i = list.findIndex((x) => x.id === activeRef.current); if (list.length > 1) setActiveId(list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length].id); return true; }
      if (k === ',') return run('settings');
      if (lower === 'f' && !e.shiftKey) return run('find');
      if (lower === 'h' && !e.shiftKey) return run('find');
      if (lower === 'q' && e.shiftKey) return run('quickEntry');
      if (!inField) {
        if (k === '0') return run('fit');
        if (k === '1' && !e.shiftKey) return run('zoom100');
        if (k === '=' || k === '+') return run('zoomIn');
        if (k === '-' || k === '_') return run('zoomOut');
      }
    }
    if (k === 'F1') return run('openHelp');
    if (k === 'F5') return run('presentation');
    if (k === 'F11') return run('fullscreen');
    if (k === 'F4') return run('focusBranch');
    if (k === 'F3') return run('findNext');
    if (inField || !d) return false;
    if (startOpen && !fromCanvas) return false;
    // map keys (the canvas has the focus, or nothing in particular does)
    const v = settingsRef.current.view;
    if (v !== 'map' && !fromCanvas) {
      if (ctrl && (k === 'z' || k === 'Z')) return run(e.shiftKey ? 'redo' : 'undo');
      if (ctrl && (k === 'y' || k === 'Y')) return run('redo');
      return false;
    }
    const sel = d.sel;
    const primary = sel[sel.length - 1];
    if (ctrl) {
      const lower = k.length === 1 ? k.toLowerCase() : k;
      if (lower === 'z') return run(e.shiftKey ? 'redo' : 'undo');
      if (lower === 'y') return run('redo');
      if (lower === 'a') return run('selectAll');
      if (lower === 'c' && e.shiftKey) return run('copyImage');
      if (lower === 't') return run('notes');
      if (lower === 'k') return run('hyperlink');
      if (lower === 'r' && e.shiftKey) return run('relationship');
      if (lower === 'b' && e.shiftKey) return run('boundary');
      if (lower === 'l' && e.shiftKey) return run('arrange');
      if (k === ']' && !e.shiftKey) return run('summary');
      if (lower === 'b') return run('bold');
      if (lower === 'i') return run('italic');
      if (lower === 'u') return run('underline');
      if (e.shiftKey && /^Digit[0-9]$/.test(e.code)) return run(`priority:${e.code.slice(5)}`);
      if (e.shiftKey && (k === 'Insert' || k === 'Tab')) return run('addParent');
      if (e.shiftKey && k === 'Enter') return run('addCallout');
      if (k === 'Delete') return run('deleteKeepChildren');
      // copy / cut are done here (a copy event is not sure to fire with nothing selected); paste is left to the
      // paste event on the map's key catcher, which can read the clipboard without a permission prompt
      if (lower === 'c' || lower === 'x') return run(lower === 'c' ? 'copy' : 'cut');
      if (!fromCanvas && lower === 'v') return run('paste');
      return false;
    }
    if (k === 'Enter' && e.altKey) return run('editTopic');
    if (k === 'Enter') return run(e.shiftKey ? 'addSiblingBefore' : 'addSibling');
    if (k === 'Tab' && e.shiftKey) { e.preventDefault(); const p = entryOf(d.map, primary); if (p && p.parent) select([p.parent]); return true; }
    if (k === 'Tab' || k === 'Insert') return run('addChild');
    if (k === 'Delete' || k === 'Backspace') return run('delete');
    if (k === 'F2') return run('editTopic');
    if (k === ' ' || e.code === 'Space') return run('toggleFold');
    if (k === 'Escape') {
      e.preventDefault();
      if (linkFrom) setLinkFrom(null);
      else if (d.focusId) runAction('focusOff');
      else if (d.selRel) mutate(d.id, (x) => ({ ...x, selRel: null }));
      return true;
    }
    if (k === 'Home') { e.preventDefault(); select([d.map.root.id]); reveal(d.map.root.id); return true; }
    if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) return run(k === 'ArrowUp' ? 'moveUp' : 'moveDown');
    if (k.startsWith('Arrow') && L) {
      e.preventDefault();
      const next = primary ? navigate(L, d.map, primary, k) : d.map.root.id;
      select(e.shiftKey ? [...sel.filter((x) => x !== next), next] : [next]);
      reveal(next);
      return true;
    }
    return false;
  }, [dialog, presenting, touring, runAction, setActiveId, startOpen, linkFrom, mutate, select, L]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the smoke test and the help-screenshot script read and drive the app through this
  useEffect(() => {
    window.__mtm = {
      run: (id, arg) => runAction(id, arg),
      doc: () => activeDoc(),
      docs: () => docsRef.current,
      layout: () => L,
      settings: () => settingsRef.current,
      applySettings: (patch) => applySettings(patch),
      editing: () => editingRef.current,
      select: (ids) => select(ids),
      canvas: () => canvas.current,
      dialog: () => (dialog ? dialog.kind : null),
      menus: () => menus,
      export: (id, path) => exportMap(id, activeDoc().map, path, call, { lang: getLanguage(), settings: settingsRef.current, scale: 1 }),
    };
  });

  useEffect(() => {
    const h = (e) => { handleKey(e, false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [handleKey]);

  // ── drag & drop of files ──
  const dropFiles = useCallback(async (paths, x, y) => {
    const maps = paths.filter((p) => OPEN_EXT.includes(extOf(p)));
    const images = paths.filter((p) => IMAGE_EXT.includes(extOf(p)));
    const others = paths.filter((p) => !maps.includes(p) && !images.includes(p));
    if (maps.length) await openPaths(maps);
    const d = activeDoc();
    if (!d || (!images.length && !others.length)) return;
    // the topic under the drop point, else the selected one
    let target = d.sel[d.sel.length - 1] || d.map.root.id;
    if (x != null && canvas.current && L) {
      const p = canvas.current.screenToWorld(x, y);
      for (const n of L.nodes.values()) if (p.x >= n.x && p.x <= n.x + n.w && p.y >= n.y && p.y <= n.y + n.h) target = n.id;
    }
    if (images.length) {
      try { const r = await call('file.dataUrl', { path: images[0] }); const image = await topicImage(r.dataUrl); edit((m) => setField(m, [target], 'image', image), '', [target]); } catch (err) { showError(t('link_image'), err); }
    }
    if (others.length) edit((m) => { const tp = findTopic(m, target); return setField(m, [target], 'attachments', [...(tp.attachments || []), ...others.map((p) => ({ name: baseName(p), path: p }))]); }, '', [target]);
  }, [openPaths, edit, showError, L]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onOsFileDrop(({ paths, x, y }) => dropFiles(paths, x, y)), [dropFiles]);
  // the browser: map files are read in the page; pictures go onto the topic
  useEffect(() => {
    if (isDesktop) return undefined;
    const over = (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); };
    const drop = async (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      for (const file of e.dataTransfer.files) {
        const ext = extOf(file.name);
        if (IMAGE_EXT.includes(ext)) {
          const d = activeDoc();
          if (!d) continue;
          const image = await topicImage(await readFileAsDataUrl(file));
          const target = d.sel[d.sel.length - 1] || d.map.root.id;
          edit((m) => setField(m, [target], 'image', image));
        } else if (['tmap', 'json', 'mm', 'opml', 'md', 'markdown', 'txt'].includes(ext)) {
          try {
            const text = await file.text();


            const map = ext === 'tmap' || ext === 'json' ? normalizeMap(JSON.parse(text)) : ext === 'mm' ? importFreeMind(text, file.name) : ext === 'opml' ? importOpml(text, file.name) : ext === 'txt' ? importTextOutline(text, file.name) : importMarkdown(text, file.name);
            addDoc(createDoc(map, { name: file.name, kind: 'import' }));
          } catch (err) { showError(t('err_open'), err); }
        }
      }
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, [edit, addDoc, showError]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── menus ──
  const sc = (s) => s;
  const hasDoc = !!active;
  const sel = active ? active.sel : [];
  const primaryId = sel[sel.length - 1];
  const primaryTopic = active && primaryId ? findTopic(active.map, primaryId) : null;
  const menus = [
    { id: 'file', labelKey: 'm_file', icon: 'file', items: () => [
      { id: 'new', label: t('new_map'), icon: 'filePlus', shortcut: sc('Ctrl+N') },
      { id: 'template', label: t('new_from_template'), icon: 'template' },
      { id: 'samples', label: t('samples_menu'), icon: 'sample' },
      { id: 'open', label: t('open_file'), icon: 'fileOpen', shortcut: sc('Ctrl+O') },
      { id: 'import', label: t('import_file'), icon: 'import' },
      { sep: true },
      { header: t('recent') },
      ...(recent.length ? recent.slice(0, 10).map((p) => ({ id: `recent:${p}`, label: baseName(p), icon: 'mapView', meta: p, remove: `recent-remove:${p}`, removeTip: t('recent_remove') })) : [{ id: 'none', label: t('recent_empty'), icon: 'clock', disabled: true }]),
      ...(recent.length ? [{ id: 'recentClear', label: t('recent_clear'), icon: 'trash' }] : []),
      { sep: true },
      { id: 'save', label: t('save'), icon: 'fileSave', shortcut: sc('Ctrl+S'), disabled: !hasDoc },
      { id: 'saveAs', label: t('save_as'), icon: 'save', shortcut: sc('Ctrl+Shift+S'), disabled: !hasDoc },
      { id: 'saveAll', label: t('save_all'), icon: 'saveAll', disabled: !docs.some(isDirty) },
      { sep: true },
      { id: 'export', label: t('export'), icon: 'export', shortcut: sc('Ctrl+E'), disabled: !hasDoc },
      { id: 'copyImage', label: t('copy_image'), icon: 'imageCopy', shortcut: sc('Ctrl+Shift+C'), disabled: !hasDoc },
      { id: 'print', label: t('print'), icon: 'print', shortcut: sc('Ctrl+P'), disabled: !hasDoc },
      { sep: true },
      ...(active && (active.path || active.source) ? [{ id: 'reveal', label: t('reveal'), icon: 'explorer' }] : []),
      { id: 'close', label: t('close'), icon: 'close', shortcut: sc('Ctrl+W'), disabled: !hasDoc },
      { id: 'closeAll', label: t('close_all'), icon: 'closeAll', disabled: !hasDoc },
      { sep: true },
      { id: 'exit', label: t('exit'), icon: 'exit' },
    ] },
    { id: 'edit', labelKey: 'm_edit', icon: 'edit', items: () => [
      { id: 'undo', label: t('undo'), icon: 'undo', shortcut: sc('Ctrl+Z'), disabled: !(active && active.past.length) },
      { id: 'redo', label: t('redo'), icon: 'redo', shortcut: sc('Ctrl+Y'), disabled: !(active && active.future.length) },
      { sep: true },
      { id: 'cut', label: t('cut'), icon: 'cut', shortcut: sc('Ctrl+X'), disabled: !hasDoc },
      { id: 'copy', label: t('copy'), icon: 'copy', shortcut: sc('Ctrl+C'), disabled: !hasDoc },
      { id: 'paste', label: t('paste'), icon: 'paste', shortcut: sc('Ctrl+V'), disabled: !hasDoc },
      { id: 'delete', label: t('delete'), icon: 'trash', shortcut: 'Delete', disabled: !hasDoc },
      { id: 'deleteKeepChildren', label: t('delete_keep_children'), icon: 'delete', shortcut: sc('Ctrl+Delete'), disabled: !hasDoc },
      { sep: true },
      { id: 'editTopic', label: t('edit_topic'), icon: 'rename', shortcut: 'F2', disabled: !primaryTopic },
      { id: 'selectAll', label: t('select_all'), icon: 'selectAll', shortcut: sc('Ctrl+A'), disabled: !hasDoc },
      { id: 'selectSiblings', label: t('select_siblings'), icon: 'list', disabled: !primaryTopic },
      { id: 'selectBranch', label: t('select_branch'), icon: 'listTree', disabled: !primaryTopic },
      { sep: true },
      { id: 'moveUp', label: t('move_up'), icon: 'arrowUp', shortcut: 'Alt+Up', disabled: !primaryTopic },
      { id: 'moveDown', label: t('move_down'), icon: 'arrowDown', shortcut: 'Alt+Down', disabled: !primaryTopic },
      { id: 'sortChildren', label: t('sort_children'), icon: 'sortAz', disabled: !hasDoc },
      { sep: true },
      { id: 'find', label: t('find'), icon: 'search', shortcut: sc('Ctrl+F'), disabled: !hasDoc },
      { id: 'findNext', label: t('find_next'), icon: 'findNext', shortcut: 'F3', disabled: !hasDoc },
    ] },
    { id: 'insert', labelKey: 'm_insert', icon: 'plusBox', items: () => [
      { id: 'addChild', label: t('add_child'), icon: 'subtopic', shortcut: 'Tab', disabled: !hasDoc },
      { id: 'addSibling', label: t('add_sibling'), icon: 'sibling', shortcut: 'Enter', disabled: !hasDoc },
      { id: 'addSiblingBefore', label: t('add_sibling_before'), icon: 'sibling', shortcut: 'Shift+Enter', disabled: !hasDoc },
      { id: 'addParent', label: t('add_parent'), icon: 'parentTopic', shortcut: sc('Ctrl+Shift+Insert'), disabled: !primaryTopic || isRoot(active.map, primaryId) },
      { id: 'addCallout', label: t('add_callout'), icon: 'callout', shortcut: sc('Ctrl+Shift+Enter'), disabled: !hasDoc },
      { id: 'addFloating', label: t('add_floating'), icon: 'floating', disabled: !hasDoc },
      { id: 'quickEntry', label: t('quick_entry'), icon: 'quickEntry', shortcut: sc('Ctrl+Shift+Q'), disabled: !hasDoc },
      { sep: true },
      { id: 'relationship', label: t('relationship'), icon: 'relationship', shortcut: sc('Ctrl+Shift+R'), disabled: !hasDoc },
      { id: 'boundary', label: t('boundary'), icon: 'boundary', shortcut: sc('Ctrl+Shift+B'), disabled: !hasDoc },
      { id: 'boundaryCloud', label: t('boundary_cloud'), icon: 'boundary', disabled: !hasDoc },
      { id: 'summary', label: t('summary'), icon: 'summary', shortcut: sc('Ctrl+]'), disabled: !primaryTopic },
      { sep: true },
      { id: 'notes', label: t('notes'), icon: 'notes', shortcut: sc('Ctrl+T'), disabled: !hasDoc },
      { id: 'comment', label: t('comment_add'), icon: 'comment', disabled: !primaryTopic },
      { id: 'props', label: t('props'), icon: 'list', disabled: !primaryTopic },
      { id: 'hyperlink', label: t('hyperlink'), icon: 'link', shortcut: sc('Ctrl+K'), disabled: !primaryTopic },
      { id: 'addAttachment', label: t('link_add_attachment'), icon: 'attachment', disabled: !primaryTopic },
      { id: 'image', label: t('link_image_file'), icon: 'image', disabled: !primaryTopic },
    ] },
    { id: 'format', labelKey: 'm_format', icon: 'brush', items: () => [
      { id: 'pane:format', label: t('pane_format'), icon: 'brush' },
      { id: 'pane:markers', label: t('pane_markers'), icon: 'marker' },
      { sep: true },
      { id: 'bold', label: t('fmt_bold'), icon: 'bold', shortcut: sc('Ctrl+B'), disabled: !primaryTopic },
      { id: 'italic', label: t('fmt_italic'), icon: 'italic', shortcut: sc('Ctrl+I'), disabled: !primaryTopic },
      { id: 'underline', label: t('fmt_underline'), icon: 'underline', shortcut: sc('Ctrl+U'), disabled: !primaryTopic },
      { id: 'growFont', label: t('grow_font'), icon: 'fontSize', disabled: !primaryTopic },
      { id: 'shrinkFont', label: t('shrink_font'), icon: 'fontSize', disabled: !primaryTopic },
      { sep: true },
      { header: t('fmt_shape') },
      ...SHAPES.map((sh) => ({ id: `shape:${sh}`, label: t(`shape_${sh}`), iconEl: <ShapeIcon shape={sh} scale={0.54} />, radio: true, checked: !!(primaryTopic && primaryTopic.style && primaryTopic.style.shape === sh), disabled: !primaryTopic })),
      { sep: true },
      { header: t('mk_priority') },
      ...[1, 2, 3, 4, 5].map((p) => ({ id: `priority:${p}`, label: markerLabel(`priority-${p}`, lang), marker: `priority-${p}`, checked: !!(primaryTopic && primaryTopic.task && primaryTopic.task.priority === p), disabled: !primaryTopic })),
      { id: 'priority:0', label: t('priority_clear'), icon: 'priority', disabled: !primaryTopic },
      { sep: true },
      { id: 'clearFormat', label: t('fmt_clear'), icon: 'eraser', disabled: !primaryTopic },
    ] },
    { id: 'view', labelKey: 'm_view', icon: 'eye', items: () => [
      { id: 'view:map', label: t('view_map'), icon: 'mapView', radio: true, checked: settings.view === 'map' },
      { id: 'view:outline', label: t('view_outline'), icon: 'outlineView', radio: true, checked: settings.view === 'outline' },
      { id: 'view:gantt', label: t('view_gantt'), icon: 'gantt', radio: true, checked: settings.view === 'gantt' },
      { id: 'view:kanban', label: t('view_kanban'), icon: 'kanban', radio: true, checked: settings.view === 'kanban' },
      { sep: true },
      { id: 'showStart', label: t('start_title'), icon: 'home', checked: startOpen },
      { id: 'toggle:sidebarVisible', label: t('sidebar'), icon: 'sidebar', shortcut: sc('Ctrl+Alt+S'), checked: settings.sidebarVisible },
      { id: 'toggle:panelVisible', label: t('task_pane'), icon: 'panelRight', shortcut: sc('Ctrl+Alt+P'), checked: settings.panelVisible },
      { id: 'toggle:toolbarVisible', label: t('toolbar'), icon: 'toolbar', checked: settings.toolbarVisible },
      { id: 'toggle:statusBarVisible', label: t('statusbar'), icon: 'statusbar', checked: settings.statusBarVisible },
      { id: 'toggle:overviewVisible', label: t('overview'), icon: 'minimap', shortcut: sc('Ctrl+Alt+O'), checked: settings.overviewVisible },
      { id: 'toggle:showGrid', label: t('grid'), icon: 'grid', shortcut: sc('Ctrl+Alt+G'), checked: settings.showGrid },
      { id: 'toggle:showRulers', label: t('rulers'), icon: 'ruler', shortcut: sc('Ctrl+Alt+R'), checked: settings.showRulers },
      { sep: true },
      { id: 'zoomIn', label: t('zoom_in'), icon: 'zoomIn', shortcut: sc('Ctrl+='), disabled: !hasDoc },
      { id: 'zoomOut', label: t('zoom_out'), icon: 'zoomOut', shortcut: sc('Ctrl+-'), disabled: !hasDoc },
      { id: 'zoom100', label: t('zoom_100'), icon: 'zoomReset', shortcut: sc('Ctrl+1'), disabled: !hasDoc },
      { id: 'fit', label: t('fit_map'), icon: 'fit', shortcut: sc('Ctrl+0'), disabled: !hasDoc },
      { id: 'centerMap', label: t('center_map'), icon: 'center', shortcut: sc('Ctrl+Alt+C'), disabled: !hasDoc },
      { id: 'fitSelection', label: t('fit_selection'), icon: 'focus', disabled: !hasDoc },
      { sep: true },
      { id: 'expandAll', label: t('expand_all'), icon: 'expandAll', disabled: !hasDoc },
      { id: 'collapseAll', label: t('collapse_all'), icon: 'collapseAll', disabled: !hasDoc },
      ...[1, 2, 3].map((n) => ({ id: `level:${n}`, label: t('show_levels', { n }), iconEl: <LevelIcon n={n} />, disabled: !hasDoc })),
      { sep: true },
      { id: 'focusBranch', label: t('focus_branch'), icon: 'focus', shortcut: 'F4', checked: !!(active && active.focusId), disabled: !hasDoc },
      { id: 'presentation', label: t('presentation'), icon: 'presentation', shortcut: 'F5', disabled: !hasDoc },
      { id: 'fullscreen', label: t('fullscreen'), icon: 'fullscreen', shortcut: 'F11' },
    ] },
    { id: 'tools', labelKey: 'm_tools', icon: 'layout', items: () => [
      { header: t('map_layout') },
      ...LAYOUTS.map((l) => ({ id: `layout:${l}`, label: t(`layout_${l}`), icon: LAYOUT_ICONS[l], checked: !!(active && active.map.layout === l), disabled: !hasDoc })),
      { sep: true },
      { id: 'pane:map', label: t('map_style_more'), icon: 'mapStyle', disabled: !hasDoc },
      { id: 'balance', label: t('map_balance'), icon: 'balance', disabled: !(active && active.map.layout === 'map') },
      { id: 'arrange', label: t('arrange'), icon: 'arrange', shortcut: sc('Ctrl+Shift+L'), disabled: !hasDoc },
      { sep: true },
      { id: 'redraw:orgDown', label: t('redraw_down'), icon: 'layoutOrgDown', shortcut: sc('Ctrl+Alt+↓'), disabled: !hasDoc },
      { id: 'redraw:right', label: t('redraw_right'), icon: 'layoutRight', shortcut: sc('Ctrl+Alt+→'), disabled: !hasDoc },
      { id: 'redraw:left', label: t('redraw_left'), icon: 'layoutLeft', shortcut: sc('Ctrl+Alt+←'), disabled: !hasDoc },
      { id: 'redraw:map', label: t('redraw_map'), icon: 'layoutMap', shortcut: sc('Ctrl+Alt+M'), disabled: !hasDoc },
      { id: 'numbering', label: t('map_numbering_on'), icon: 'numbering', checked: !!(active && active.map.numbering && active.map.numbering.enabled), disabled: !hasDoc },
      { sep: true },
      { id: 'side:filter', label: t('filter'), icon: 'filter', disabled: !hasDoc },
      { id: 'filterClear', label: t('filter_clear'), icon: 'close', disabled: !(active && filterActive(active.filter)) },
      { sep: true },
      { id: 'settings', label: t('settings'), icon: 'settings', shortcut: sc('Ctrl+,') },
    ] },
    { id: 'help', labelKey: 'm_help', icon: 'help', items: () => [
      { id: 'openHelp', label: t('help_menu'), icon: 'help', shortcut: 'F1' },
      { id: 'shortcuts', label: t('shortcuts'), icon: 'keyboard' },
      { id: 'tour', label: t('start_tour'), icon: 'bookOpen' },
      { id: 'tourMap', label: t('tour_map_only'), icon: 'sample' },
      { id: 'samples', label: t('samples_menu'), icon: 'mapView' },
      { sep: true },
      { id: 'about', label: t('menu_info'), icon: 'info' },
    ] },
  ];

  const layoutItems = () => LAYOUTS.map((l) => ({ id: `layout:${l}`, label: t(`layout_${l}`), icon: LAYOUT_ICONS[l], checked: !!(active && active.map.layout === l) }));
  const styleItems = () => MAP_STYLES.map((st) => {
    const r = st.auto ? null : mapStyleById(st.id);
    return { id: `style:${st.id}`, label: st.label[lang === 'ko' ? 0 : 1], checked: !!(active && (active.map.style || 'auto') === st.id), swatch: r ? (r.branch ? r.branch[0] : r.root.fill) : 'var(--accent)', swatchBg: r ? r.bg : 'var(--bg)' };
  });

  const topicMenu = (id) => {
    const tp = active && findTopic(active.map, id);
    if (!tp) return [];
    const root = isRoot(active.map, id);
    return [
      { id: 'addChild', label: t('add_child'), icon: 'subtopic', shortcut: 'Tab' },
      { id: 'addSibling', label: t('add_sibling'), icon: 'sibling', shortcut: 'Enter' },
      ...(!root ? [{ id: 'addParent', label: t('add_parent'), icon: 'parentTopic' }] : []),
      { id: 'addCallout', label: t('add_callout'), icon: 'callout' },
      { sep: true },
      { id: 'relFrom', label: t('rel_from_here'), icon: 'relationship' },
      { id: 'boundary', label: tp.boundary ? t('boundary_remove') : t('boundary'), icon: 'boundary' },
      ...(tp.boundary ? [{ id: 'boundaryLabel', label: t('boundary_label'), icon: 'rename' }] : []),
      ...((tp.children || []).length ? [{ id: 'summary', label: tp.summary ? t('summary_remove') : t('summary'), icon: 'summary', shortcut: 'Ctrl+]' }] : []),
      ...(tp.summary ? [{ id: 'summaryLabel', label: t('summary_rename'), icon: 'rename' }] : []),
      { sep: true },
      { id: 'editTopic', label: t('edit_topic'), icon: 'rename', shortcut: 'F2' },
      { id: 'notes', label: t('notes'), icon: 'notes' },
      { id: 'comment', label: t('comment_add'), icon: 'comment' },
      { id: 'hyperlink', label: t('hyperlink'), icon: 'link' },
      { id: 'image', label: t('link_image_file'), icon: 'image' },
      { sep: true },
      { id: 'cut', label: t('cut'), icon: 'cut' },
      { id: 'copy', label: t('copy'), icon: 'copy' },
      { id: 'paste', label: t('paste'), icon: 'paste' },
      ...(!root ? [{ id: 'delete', label: t('delete'), icon: 'trash', shortcut: 'Delete' }] : []),
      { sep: true },
      ...((tp.children || []).length ? [{ id: 'toggleFold', label: tp.collapsed ? t('expand') : t('collapse'), icon: tp.collapsed ? 'plusBox' : 'minusBox', shortcut: 'Space' }] : []),
      { id: 'focusBranch', label: t('focus_branch'), icon: 'focus', shortcut: 'F4' },
      ...((tp.children || []).length > 1 ? [{ id: 'sortChildren', label: t('sort_children'), icon: 'sortAz' }] : []),
      ...(tp.offset ? [{ id: 'resetPosition', label: t('reset_position'), icon: 'undo' }] : []),
      ...(!root && !(entryOf(active.map, id) && entryOf(active.map, id).kind === 'floating') ? [{ id: 'detachFloating', label: t('detach_floating'), icon: 'floating' }] : []),
      { sep: true },
      { id: 'pane:format', label: t('pane_format'), icon: 'brush' },
      { id: 'pane:markers', label: t('pane_markers'), icon: 'marker' },
    ];
  };
  const REL_COLORS = ['#e53935', '#fb8c00', '#43a047', '#1e88e5', '#8e24aa', '#546e7a'];
  const relMenu = (relId) => {
    const rel = active && (active.map.relationships || []).find((r) => r.id === relId);
    if (!rel) return [];
    return [
      { id: `rel:label:${relId}`, label: t('rel_label'), icon: 'rename' },
      { id: `rel:dash:${relId}`, label: t('rel_dashed'), icon: 'lineStyle', checked: rel.dash !== false },
      { id: `rel:both:${relId}`, label: t('rel_both'), icon: 'relationship', checked: !!rel.arrowStart },
      { id: `rel:reverse:${relId}`, label: t('rel_reverse'), icon: 'refresh' },
      { id: `rel:reset:${relId}`, label: t('rel_reset'), icon: 'lineStyle' },
      { sep: true },
      { header: t('rel_color') },
      { id: `rel:color:${relId}:`, label: t('auto'), icon: 'palette', checked: !rel.color },
      ...REL_COLORS.map((c) => ({ id: `rel:color:${relId}:${c}`, label: c, swatch: c, swatchBg: c, checked: rel.color === c })),
      { sep: true },
      { id: `rel:delete:${relId}`, label: t('delete'), icon: 'trash' },
    ];
  };
  const canvasMenu = (world) => [
    { id: 'addFloatingHere', label: t('add_floating_here'), icon: 'floating' },
    { id: 'paste', label: t('paste'), icon: 'paste' },
    { sep: true },
    { id: 'fit', label: t('fit_map'), icon: 'fit' },
    { id: 'centerMap', label: t('center_map'), icon: 'center', shortcut: 'Ctrl+Alt+C' },
    { id: 'expandAll', label: t('expand_all'), icon: 'expandAll' },
    { id: 'collapseAll', label: t('collapse_all'), icon: 'collapseAll' },
    { sep: true },
    { id: 'arrange', label: t('arrange'), icon: 'arrange', shortcut: 'Ctrl+Shift+L' },
    { id: 'redraw:orgDown', label: t('redraw_down'), icon: 'layoutOrgDown' },
    { id: 'redraw:right', label: t('redraw_right'), icon: 'layoutRight' },
    { id: 'redraw:left', label: t('redraw_left'), icon: 'layoutLeft' },
    { id: 'redraw:map', label: t('redraw_map'), icon: 'layoutMap' },
    { sep: true },
    { id: 'toggle:showGrid', label: t('grid'), icon: 'grid', checked: settings.showGrid },
    { id: 'toggle:showRulers', label: t('rulers'), icon: 'ruler', checked: settings.showRulers },
    { id: 'toggle:overviewVisible', label: t('overview'), icon: 'minimap', checked: settings.overviewVisible },
    { sep: true },
    { id: 'pane:map', label: t('map_style_more'), icon: 'mapStyle' },
    { id: 'selectAll', label: t('select_all'), icon: 'selectAll' },
  ].map((it) => (it.id === 'addFloatingHere' ? { ...it, world } : it));

  const onMenuPick = (item) => {
    if (!ctx) return;
    if (item === 'addFloatingHere') { runAction('addFloating', ctx.world); return; }
    const m = /^rel:color:([^:]+):(.*)$/.exec(item);
    if (m) { runAction(`rel:color:${m[1]}`, m[2]); setCtx(null); return; }
    runAction(item);
  };

  const tabMenu = (id) => {
    const d = docs.find((x) => x.id === id);
    return [
      { id: 'close', label: t('close'), icon: 'close' },
      { id: 'closeOthers', label: t('close_others'), icon: 'closeOthers', disabled: docs.length < 2 },
      { id: 'closeAll', label: t('close_all'), icon: 'closeAll' },
      { sep: true },
      { id: 'save', label: t('save'), icon: 'fileSave' },
      ...(d && (d.path || d.source) ? [{ id: 'reveal', label: t('reveal'), icon: 'explorer' }, { id: 'copyPath', label: t('copy_path'), icon: 'copy' }] : []),
    ];
  };

  // ── toolbar / status state ──
  const zoomPct = view ? Math.round(view.k * 100) : 100;
  const tbState = {
    hasDoc,
    dirty: !!(active && isDirty(active)),
    canUndo: !!(active && active.past.length),
    canRedo: !!(active && active.future.length),
    canEdit: hasDoc,
    canParent: !!(primaryTopic && !isRoot(active.map, primaryId)),
    linking: !!linkFrom,
    hasBoundary: !!(primaryTopic && primaryTopic.boundary),
    hasSummary: !!(primaryTopic && primaryTopic.summary),
    focused: !!(active && active.focusId),
    isMap: hasDoc && settings.view === 'map' && !startOpen,
    layout: active ? active.map.layout : 'map',
    zoom: zoomPct,
    layoutItems,
    styleItems,
  };
  const statusInfo = active && viewMap ? {
    topics: countTopics(viewMap),
    selected: sel.length,
    level: primaryId && entryOf(viewMap, primaryId) ? entryOf(viewMap, primaryId).depth : null,
    floating: !!(primaryId && entryOf(viewMap, primaryId) && entryOf(viewMap, primaryId).kind === 'floating'),
    filter: filterInfo ? filterInfo.hits.size : 0,
    focused: !!active.focusId,
    layout: active.map.layout,
    styleName: (MAP_STYLES.find((x) => x.id === (active.map.style || 'auto')) || MAP_STYLES[0]).label[lang === 'ko' ? 0 : 1],
    zoom: settings.view === 'map' && !startOpen ? zoomPct : null,
  } : null;

  // ── render ──
  if (!ready) return <div className="boot" />;
  const d = active;
  const mainView = !d || startOpen ? null : settings.view;
  // The camera moves every frame while panning: the zoom label and the overview follow once a
  // frame, and the map's saved camera (doc.view, for the session) once it has come to rest.
  const onCanvasView = (v) => {
    viewLatest.current = { id: d && d.id, v };
    if (!viewRaf.current) viewRaf.current = requestAnimationFrame(() => { viewRaf.current = 0; setView(viewLatest.current.v); });
    clearTimeout(viewSave.current);
    viewSave.current = setTimeout(() => { const { id, v: last } = viewLatest.current; if (id) mutate(id, (x) => ({ ...x, view: last })); }, 600);
  };

  return (
    <div className="app" onContextMenu={(e) => { if (!e.target.closest('input, textarea, .map-canvas')) e.preventDefault(); }}>
      <MenuBar menus={menus} onAction={runAction} theme={settings.theme} controls={!settings.toolbarVisible} startOpen={startOpen} />
      {settings.toolbarVisible && <Toolbar onAction={runAction} settings={settings} state={tbState} />}
      <div className="body">
        <div className="body-row">
          {settings.sidebarVisible && !startOpen && (
            <Sidebar doc={d} map={viewMap} settings={settings} tab={settings.sidebarTab} onTab={(tab) => applySettings({ sidebarTab: tab })} findFocus={findFocus}
              onPick={(id, all) => { select(all || [id]); setTimeout(() => canvas.current && canvas.current.centerOn(id), 30); }}
              onContext={(id, x, y) => { if (!(d.sel || []).includes(id)) select([id]); setCtx({ kind: 'topic', id, x, y, items: topicMenu(id) }); }}
              onPickAll={(ids) => select(ids)}
              onReplace={(ids, q, rep, opts) => { const r = edit((m) => { const x = replaceInTopics(m, ids, q, rep, opts); return x.count ? x.map : null; }); flash(r ? t('msg_replaced') : t('no_match')); }}
              onFilter={(f) => d && mutate(d.id, (x) => ({ ...x, filter: f }))} onFilterMode={(mode) => d && mutate(d.id, (x) => ({ ...x, filterMode: mode }))}
              onAction={runAction} />
          )}
          {settings.sidebarVisible && !startOpen && <PaneSplitter side="left" width={settings.sidebarWidth} min={180} max={560} onChange={(w) => applySettings({ sidebarWidth: w }, { broadcast: false })} onToggle={() => runAction('toggle:sidebarVisible')} />}
          <main className="main-area">
            {docs.length > 0 && (
              <TabBar docs={docs.map((x) => ({ id: x.id, name: x.name, path: x.path || x.source, dirty: isDirty(x), readonly: x.readonly, kind: x.kind }))} activeId={activeId}
                onActivate={(id) => { finishEdit(); setActiveId(id); setStartOpen(false); }} onClose={(id) => closeDocs([id])} onNew={() => runAction('new')}
                onReorder={(from, to) => { const list = docsRef.current.slice(); const i = list.findIndex((x) => x.id === from); const j = list.findIndex((x) => x.id === to); const [m] = list.splice(i, 1); list.splice(j, 0, m); setDocs(list); }}
                onAction={(id, tabId) => runAction(id, tabId)} onContextItems={tabMenu} />
            )}
            {!startOpen && !settings.sidebarVisible && <button type="button" className="pane-expander left" data-cmd="expand-left" title={t('tip_sidebar_toggle')} onClick={() => runAction('toggle:sidebarVisible')}><Icon name="chevronRight" size={14} /></button>}
            {!startOpen && !settings.panelVisible && <button type="button" className="pane-expander right" data-cmd="expand-right" title={t('tip_panel_toggle')} onClick={() => runAction('toggle:panelVisible')}><Icon name="chevronLeft" size={14} /></button>}
            {mainView === 'map' && L && (
              <MapCanvas key={d.id} ref={canvas} doc={d} map={viewMap} L={L} ms={ms} lang={lang} settings={settings} readonly={false}
                editing={editing && editing.docId === d.id ? editing : null} draftText={draft} linkFrom={linkFrom}
                dimIds={dimIds} hitIds={null}
                onSelect={(ids) => select(ids)} onSelectRel={(rid) => mutate(d.id, (x) => ({ ...x, selRel: rid }))}
                onAction={runAction} onKey={(e) => handleKey(e, true)}
                onEditStart={(id, mode, value) => startEdit(id, mode, value)} onEditChange={(v) => setDraft(v)} onEditCommit={(next) => finishEdit(next)} onEditCancel={cancelEdit}
                onMove={(ids, target, zone) => { const r = edit((m) => cmdMove(m, ids, target, zone, { autoBalance: settings.autoBalance })); if (!r) flash(t('msg_move_refused')); }}
                onFloat={(ids, c) => edit((m) => cmdFloat(m, ids, c))}
                onNudge={(ids, dx, dy) => edit((m) => cmdNudge(m, ids, dx, dy))}
                onRelControl={(relId, which, p) => edit((m) => { const rel = (m.relationships || []).find((x) => x.id === relId); if (!rel) return null; const n = L.nodes.get(which === 'c1' ? rel.from : rel.to); if (!n) return null; const auto = !rel.c1 && !rel.c2 && L.relBends ? L.relBends.get(relId) : null; const keep = auto ? { c1: { x: Math.round(auto.c1.x), y: Math.round(auto.c1.y) }, c2: { x: Math.round(auto.c2.x), y: Math.round(auto.c2.y) } } : {}; return updateRelationship(m, relId, { ...keep, [which]: { x: Math.round(p.x - (n.x + n.w / 2)), y: Math.round(p.y - (n.y + n.h / 2)) } }); })}
                onLink={finishLink} onViewChange={onCanvasView}
                onContextMenu={(c) => setCtx({ ...c, items: c.kind === 'topic' ? topicMenu(c.id) : c.kind === 'rel' ? relMenu(c.id) : canvasMenu(c.world) })}
                onBadge={(id, badge) => { select([id]); if (badge === 'notes' || badge === 'comments') runAction('pane:notes', true); else if (badge === 'link') openLink(id); else if (badge === 'attachments') runAction('pane:links', true); }}
                onToggleFold={(id) => edit((m) => cmdToggleFold(m, [id]))}
                onCreateFloating={(x, y) => { const r = edit((m) => cmdAddFloating(m, x, y)); if (r) startNewEdit(r.edit); }} />
            )}
            {mainView === 'map' && L && settings.overviewVisible && view && canvas.current && (
              <Overview L={L} ms={ms} view={view} size={canvas.current.size()} onMove={(v) => canvas.current && canvas.current.setView(v)} />
            )}
            {mainView === 'outline' && <OutlineView doc={d} map={d.map} settings={settings} edit={edit} onSelect={(ids) => select(ids)} readonly={false} />}
            {mainView === 'kanban' && <KanbanView doc={d} map={d.map} ms={ms} edit={edit} onSelect={(ids) => select(ids)} readonly={false} />}
            {mainView === 'gantt' && <GanttView doc={d} map={d.map} edit={edit} onSelect={(ids) => select(ids)} onAction={runAction} readonly={false} />}
            {!d && !startOpen && (
              <div className="empty-main">
                <img src="./icon.svg" alt="" width={72} height={72} />
                <p>{t('empty_hint')}</p>
                <div className="row"><button className="btn primary" onClick={() => runAction('new')}>{t('new_map')}</button><button className="btn" onClick={() => runAction('open')}>{t('open_file')}</button></div>
              </div>
            )}
            {startOpen && (
              <StartPage settings={settings} recent={recent} onAction={(id) => runAction(id)} onSettings={(p) => applySettings(p)} onScreen={(patch) => applySettings({ startScreen: { ...settings.startScreen, ...patch } })} />
            )}
          </main>
          {settings.panelVisible && !startOpen && <PaneSplitter side="right" width={settings.panelWidth} min={240} max={560} onChange={(w) => applySettings({ panelWidth: w }, { broadcast: false })} onToggle={() => runAction('toggle:panelVisible')} />}
          {settings.panelVisible && !startOpen && (
            <TaskPane doc={d} map={viewMap} L={L} ms={ms} settings={settings} onSettings={(p) => applySettings(p)} edit={edit} onAction={runAction}
              tab={settings.panelTab} onTab={(tab) => applySettings({ panelTab: tab })} notesFocus={notesFocus} />
          )}
        </div>
      </div>
      {settings.statusBarVisible && <StatusBar message={message} info={startOpen ? null : statusInfo} onAction={runAction} pickers={{ layout: layoutItems, style: styleItems }} />}

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} onPick={onMenuPick} />}
      {touring && !presenting && <GuidedTour onAction={(a) => runAction(a)} onClose={() => { setTouring(false); applySettings({ tutorialDone: true }); }} />}
      {presenting && d && L && <Presentation map={viewMap} L={L} ms={ms} onClose={() => { setPresenting(false); }} />}

      {/* the dialog's look (danger / info) travels as 'look': 'kind' says which dialog it is */}
      {dialog && dialog.kind === 'confirm' && <ConfirmDialog {...dialog} kind={dialog.look} />}
      {dialog && dialog.kind === 'prompt' && <PromptDialog {...dialog} kind={dialog.look} />}
      {dialog && dialog.kind === 'error' && <ErrorDialog title={dialog.title} message={dialog.message} error={dialog.error} onClose={() => setDialog(null)} />}
      {dialog && dialog.kind === 'about' && <AboutDialog info={info} onClose={() => setDialog(null)} />}
      {dialog && dialog.kind === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog && dialog.kind === 'settings' && <SettingsDialog settings={settings} initialTab={dialog.tab} onChange={(p) => applySettings(p)} onClose={() => setDialog(null)} />}
      {dialog && dialog.kind === 'template' && <TemplateDialog settings={settings} onResult={(id) => { setDialog(null); if (id) newMapDoc(id); }} />}
      {dialog && dialog.kind === 'samples' && <TemplateDialog samples settings={settings} onResult={(id) => { setDialog(null); if (id) runAction(`sample:${id}`); }} />}
      {dialog && dialog.kind === 'export' && <ExportDialog settings={settings} initial={dialog.initial} onResult={(opts) => { setDialog(null); if (opts) doExport(opts); }} />}
      {dialog && dialog.kind === 'print' && d && <PrintPreviewDialog map={d.map} settings={settings} onSettings={(p) => applySettings(p)} onClose={() => setDialog(null)} onDone={() => { setDialog(null); flash(t('msg_printed')); }} />}
      {dialog && dialog.kind === 'quick' && d && (
        <QuickEntryDialog parentText={primaryTopic ? primaryTopic.text : d.map.root.text} onResult={(tops) => {
          setDialog(null);
          if (!tops || !tops.length) return;
          const target = primaryId || d.map.root.id;
          edit((m) => { const r = pasteFragment(m, target, { topics: tops, relationships: [] }); return { map: r.map, sel: r.ids }; });
          flash(t('msg_pasted', { n: tops.length }));
        }} />
      )}
      {dialog && dialog.kind === 'file' && (
        <FileDialog kind={dialog.fileKind} filters={dialog.opts && dialog.opts.filters} title={dialog.opts && dialog.opts.title}
          startPath={dialog.opts && dialog.opts.defaultPath ? String(dialog.opts.defaultPath).replace(/[^\\/]*$/, '') : (info && info.documents) || ''}
          defaultName={dialog.opts && dialog.opts.name} sep={(info && info.sep) || '/'} onResult={dialog.onResult} />
      )}
    </div>
  );
}


// The border between a side pane and the map: drag to resize the pane (the width is a setting),
// double-click (or its small arrow) folds the pane away.
function PaneSplitter({ side, width, min, max, onChange, onToggle }) {
  const onDown = (e) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = width;
    let last = w0;
    document.body.classList.add('dragging-x');
    const move = (ev) => { last = Math.max(min, Math.min(max, Math.round(w0 + (side === 'left' ? ev.clientX - x0 : x0 - ev.clientX)))); document.documentElement.style.setProperty(side === 'left' ? '--sidebar-w' : '--panel-w', `${last}px`); };
    const up = () => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      document.body.classList.remove('dragging-x');
      document.documentElement.style.removeProperty(side === 'left' ? '--sidebar-w' : '--panel-w');
      if (last !== w0) onChange(last);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return (
    <div className={`pane-splitter-v ${side}`} onMouseDown={onDown} onDoubleClick={onToggle} role="separator" aria-orientation="vertical">
      <button type="button" className="pane-fold" title={t('pane_collapse')} onMouseDown={(e) => e.stopPropagation()} onClick={onToggle}><Icon name={side === 'left' ? 'chevronLeft' : 'chevronRight'} size={11} /></button>
    </div>
  );
}
