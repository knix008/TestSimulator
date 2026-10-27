// The desktop of the numeric computing environment: title bar with ribbon
// tabs, the ribbon, Current Folder (left), document tabs (editor, variables,
// figures, models) over the Command Window (centre), Workspace and Command
// History (right), status bar. Pane sizes, open files, the ribbon tab and
// the window position are remembered.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t, useLanguage, setLanguage, getLanguage } from './lib/i18n';
import { applyTheme, nextThemeId, setCustomThemes } from './themes';
import { engine } from './engine/client';
import { isDesktop, windowControl, hostInfo, fsApi, baseName, dirName, joinPath, setMAssociation } from './lib/backend';
import { initSettings, useSettings, patchSettings, replaceSettings, flushSettings, getSettings, DEFAULT_LAYOUT } from './lib/settings';
import { usePopupWindows, openPopupWindow, warmPopups, onBroadcast } from './lib/popups';
import { subscribeHistory, undo as historyUndo, redo as historyRedo, record, typingTarget } from './lib/history';
import { dirtyEditors, subscribeDirty, listenChildEditors, saveEditors } from './lib/dirty';
import { ask, toast, showError } from './lib/ui';
import { openMenu } from './lib/menu';
import { askText, chooseFile } from './lib/prompt';
import { fileKind, importCommand, mQuote, varNameOf, getModelExts } from './lib/files';
import { getCustomThemesRaw } from './themes';
import { Icon, ResizeGrip } from './components/Chrome';
import { TitleBar } from './components/TitleBar';
import { Ribbon } from './components/Ribbon';
import { DocTabs, TabActiveCtx } from './components/DocTabs';
import { Splitter } from './components/Layout';
import { UiHost } from './components/UiHost';
import { MenuHost } from './components/MenuHost';
import { PromptHost } from './components/PromptHost';
import { ProgressHost } from './components/ProgressHost';
import { CommandWindow } from './panes/CommandWindow';
import { WorkspacePane } from './panes/Workspace';
import { HistoryPane, loadHistory, storeHistory, SESSION_START } from './panes/CommandHistory';
import { CurrentFolderPane } from './panes/CurrentFolder';
import { EditorDoc } from './panes/EditorDoc';
import { VariableEditor } from './panes/VariableEditor';
import { FigureAreaGuard, ModelEditorGuard, loadSim } from './panes/Guarded';
import { SettingsDialog } from './views/Settings';
import { AboutDialog } from './views/About';
import { FindFilesDialog } from './views/FindFiles';

const LIMITS = { folder: [170, 520], right: [200, 560], cmdH: [90, 2000] };
const PLOTS = [
  ['plot', 'plotLine', 'plot({v})'], ['area', 'plotArea', 'area({v})'], ['bar', 'plotBar', 'bar({v})'], ['barh', 'plotBarh', 'barh({v})'],
  ['stairs', 'plotStairs', 'stairs({v})'], ['stem', 'plotStem', 'stem({v})'], ['scatter', 'plotScatter', 'scatter(1:numel({v}), {v})'],
  ['histogram', 'plotHist', 'histogram({v})'], ['pie', 'plotPie', 'pie({v})'], ['polarplot', 'plotPolar', 'polarplot({v})'],
  ['semilogy', 'plotLog', 'semilogy({v})'], ['surf', 'plotSurf', 'surf({v})'], ['mesh', 'plotMesh', 'mesh({v})'],
  ['contour', 'plotContour', 'contour({v})'], ['imagesc', 'plotImage', 'imagesc({v})'],
];
const NUMERIC = new Set(['double', 'single', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64', 'logical']);

let docSeq = 0;
const newId = (p) => `${p}${++docSeq}`;

function loadBreakpoints() {
  try { return JSON.parse(localStorage.getItem('msm-breakpoints') || '{}') || {}; } catch { return {}; }
}

export default function App() {
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    initSettings().then((s) => {
      setCustomThemes(s.customThemes || []);
      applyTheme(s.theme);
      setLanguage(s.language);
      document.documentElement.lang = s.language;
      setBooted(true);
    });
  }, []);
  if (!booted) return <div className="boot">MySimulationMath…</div>;
  return <Desktop />;
}

function Desktop() {
  useLanguage();
  const settings = useSettings();
  const layout = useMemo(() => ({ ...DEFAULT_LAYOUT, ...(settings.layout || {}), folder: { ...DEFAULT_LAYOUT.folder, ...((settings.layout || {}).folder || {}) }, workspace: { ...DEFAULT_LAYOUT.workspace, ...((settings.layout || {}).workspace || {}) }, history: { ...DEFAULT_LAYOUT.history, ...((settings.layout || {}).history || {}) } }), [settings.layout]);
  const [live, setLive] = useState({}); // pane sizes while dragging
  const L = { ...layout, ...live };
  const tab = settings.ribbonTab || 'home';

  const [cwd, setCwd] = useState('');
  const [engineState, setEngineState] = useState('starting');
  const [busy, setBusy] = useState(false);
  const [debug, setDebug] = useState(null);
  const debugRef = useRef(null);
  debugRef.current = debug;
  const [variables, setVariables] = useState([]);
  const [selectedVar, setSelectedVar] = useState(null);
  const [history, setHistory] = useState(loadHistory);
  const [docs, setDocs] = useState([]);
  const [active, setActive] = useState(null);
  const [docDirty, setDocDirty] = useState({});
  const [cursor, setCursor] = useState(null);
  const [folderKey, setFolderKey] = useState(0);
  const [varKey, setVarKey] = useState(0);
  const [breakpoints, setBreakpoints] = useState(loadBreakpoints);
  const [dialog, setDialog] = useState(null);
  const [hist, setHist] = useState({ canUndo: false, canRedo: false });
  const [anyDirty, setAnyDirty] = useState(false);
  const cmdRef = useRef(null);
  const editors = useRef(new Map());
  const docsRef = useRef(docs);
  docsRef.current = docs;
  const activeRef = useRef(active);
  activeRef.current = active;
  const closing = useRef(false);

  const activeDoc = docs.find((d) => d.id === active) || null;
  const activeEditor = activeDoc && activeDoc.kind === 'file' ? editors.current.get(activeDoc.id) : null;
  const engineReady = engineState === 'ready' || engineState === 'busy';

  // ── Boot: engine, folder, open files ─────────────────────
  useEffect(() => {
    let alive = true;
    const offs = [
      engine.on('state', ({ state }) => setEngineState(state)),
      engine.on('event:busy', (ev) => setBusy(!!ev.busy)),
      engine.on('event:cwd', (ev) => { if (ev.path) setCwd(ev.path); }),
      engine.on('event:workspace', () => { engine.variables().then((v) => alive && setVariables(v || [])); setVarKey((k) => k + 1); }),
      engine.on('variables', (v) => { setVariables(v || []); }),
      engine.on('event:openFile', (ev) => { if (ev.path) openFile(ev.path, { line: ev.line }); }),
      engine.on('event:history', (ev) => { if (ev.command && !engine.wasQuiet(ev.command)) addHistory(ev.command, true); }),
      engine.on('done', () => { setFolderKey((k) => k + 1); setVarKey((k) => k + 1); }),
      // A figure was drawn (core/graphics/PROTOCOL.md): show the figure tab.
      engine.on('*', (msg, type) => { if ((type === 'graphics.scene' || type === 'graphics.update') && msg && Array.isArray(msg.figures) && msg.figures.length) showFigures(); }),
      engine.on('audio.play', (msg) => playAudio(msg)),
      engine.onRequest('dialog.open', (m) => chooseFile({ mode: 'open', title: m.title, start: m.start || engine.cwd, exts: m.exts || m.filters || [] })),
      engine.onRequest('dialog.save', (m) => chooseFile({ mode: 'save', title: m.title, start: m.start || engine.cwd, name: m.name || '', exts: m.exts || m.filters || [] })),
      engine.onRequest('dialog.folder', (m) => chooseFile({ mode: 'folder', title: m.title, start: m.start || engine.cwd })),
      engine.onRequest('http', httpRequest),
      engine.onRequest('debug.paused', (m) => new Promise((resolve) => {
        setDebug({ file: m.file, line: m.line, stack: m.stack || [], resolve });
        if (m.file) openFile(m.file, { line: m.line });
      })),
    ];
    (async () => {
      const info = await hostInfo().catch(() => ({}));
      let start = getSettings().startFolder || info.start || '/';
      try { const st = await fsApi.stat(start); if (!st.isDir) start = info.start || '/'; } catch { start = info.start || '/'; }
      if (!alive) return;
      setCwd(start);
      await engine.start({ cwd: start });
      if (!alive) return;
      setEngineState(engine.state);
      if (engine.cwd) setCwd(engine.cwd);
      if (engine.state === 'ready') {
        applyEngineSettings(getSettings());
        for (const [file, lines] of Object.entries(loadBreakpoints())) if (lines.length) engine.setBreakpoints(file, lines);
        engine.variables().then((v) => alive && setVariables(v || []));
      }
    })();
    // Files from the last session and from the command line / "open with".
    const s = getSettings();
    if (s.restoreFiles) for (const p of s.openFiles || []) openFile(p, { quiet: true });
    for (const p of (typeof window !== 'undefined' && window.__MSM_OPEN__) || []) openFile(p);
    const onOpen = (e) => { if (e.detail) openFile(e.detail); };
    window.addEventListener('msm-open-file', onOpen);
    loadSim();
    if (isDesktop) import('@tauri-apps/api/core').then((m) => m.invoke('renderer_ready')).catch(() => {});
    const warm = setTimeout(() => warmPopups(), 1500);
    return () => { alive = false; offs.forEach((f) => f()); window.removeEventListener('msm-open-file', onOpen); clearTimeout(warm); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => subscribeHistory(setHist), []);
  useEffect(() => { const update = () => setAnyDirty(dirtyEditors().length > 0); update(); return subscribeDirty(update); }, []);
  useEffect(() => { let off = null; listenChildEditors().then((u) => { off = u; }); return () => off && off(); }, []);

  // Settings from the settings child window (desktop) and its live previews.
  useEffect(() => {
    const offs = [];
    onBroadcast('msm-settings-saved', (next) => { applySaved(next); }).then((u) => offs.push(u));
    onBroadcast('msm-settings-preview', (p) => {
      if (!p) return;
      if (p.revert) { const s = getSettings(); setCustomThemes(s.customThemes || []); applyTheme(s.theme); setLanguage(s.language); return; }
      if (p.customThemes) setCustomThemes(p.customThemes);
      if (p.theme) applyTheme(p.theme);
      if (p.language) setLanguage(p.language);
    }).then((u) => offs.push(u));
    return () => offs.forEach((f) => f());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Remember the open files.
  useEffect(() => {
    const paths = docs.filter((d) => (d.kind === 'file' || d.kind === 'model') && d.path).map((d) => d.path);
    if (JSON.stringify(paths) !== JSON.stringify(getSettings().openFiles || [])) patchSettings({ openFiles: paths });
  }, [docs]);

  useEffect(() => { try { localStorage.setItem('msm-breakpoints', JSON.stringify(breakpoints)); } catch { /* storage blocked */ } }, [breakpoints]);

  // ── Settings application ─────────────────────────────────
  function applyEngineSettings(s) {
    if (engine.state !== 'ready' && engine.state !== 'busy') return;
    const fmt = (s.cmd && s.cmd.numericFormat) || 'short';
    engine.eval(`format ${fmt}; format ${s.cmd && s.cmd.compact ? 'compact' : 'loose'}`, { echo: false, history: false }).catch(() => {});
  }
  function applySaved(next) {
    const before = getSettings();
    const s = replaceSettings(next);
    setCustomThemes(s.customThemes || []);
    applyTheme(s.theme);
    setLanguage(s.language);
    document.documentElement.lang = s.language;
    if (JSON.stringify([before.cmd, before.figures, before.sim]) !== JSON.stringify([s.cmd, s.figures, s.sim])) applyEngineSettings(s);
    if (s.mAssociation != null && s.mAssociation !== before.mAssociation) setMAssociation(s.mAssociation);
  }
  const saveSettingsDraft = async (draft) => {
    const before = getSettings();
    patchSettings(draft);
    await flushSettings();
    applySaved({ ...before, ...draft });
  };

  // ── History (Command History pane) ───────────────────────
  const addHistory = useCallback((command, fromEngine = false) => {
    setHistory((list) => {
      const last = list[list.length - 1];
      if (last && last.c === command) return list;
      if (fromEngine && list.some((x) => x.c === command && x.s === SESSION_START)) return list;
      const next = [...list, { c: command, s: SESSION_START }].slice(-2000);
      storeHistory(next);
      return next;
    });
  }, []);
  const historyCommands = useMemo(() => history.map((h) => h.c), [history]);

  // ── Documents ────────────────────────────────────────────
  const activate = (id) => setActive(id);
  function openFile(path, { line, create, quiet } = {}) {
    if (!path) return;
    const kind = fileKind(path);
    const existing = docsRef.current.find((d) => d.path === path);
    if (existing) {
      setActive(existing.id);
      if (line) setDocs((list) => list.map((d) => (d.id === existing.id ? { ...d, line, lineSeq: (d.lineSeq || 0) + 1 } : d)));
      return;
    }
    if (kind === 'model') {
      const doc = { id: newId('m'), kind: 'model', path, title: baseName(path), icon: 'model', create: !!create };
      setDocs((list) => [...list, doc]);
      setActive(doc.id);
      return;
    }
    if (kind === 'data' || kind === 'image' || kind === 'audio') {
      if (!quiet && cmdRef.current) cmdRef.current.run(importCommand(path));
      return;
    }
    if (kind === 'other' && !quiet) {
      // Unknown binary files are not opened as text.
      const ext = path.split('.').pop();
      if (/^(exe|dll|zip|7z|pdf|docx?|pptx?|so|dylib|bin)$/i.test(ext)) { toast(t('cf_cannot_open', { name: baseName(path) }), 'warn'); return; }
    }
    const doc = { id: newId('f'), kind: 'file', path, title: baseName(path), icon: kind === 'script' ? 'script' : 'file', line };
    setDocs((list) => [...list, doc]);
    setActive(doc.id);
  }
  function newScript(initialText) {
    const used = new Set(docsRef.current.map((d) => d.title));
    let n = 1;
    while (used.has(n === 1 ? 'untitled.m' : `untitled${n}.m`)) n += 1;
    const doc = { id: newId('f'), kind: 'file', path: null, title: n === 1 ? 'untitled.m' : `untitled${n}.m`, icon: 'script', initialText };
    setDocs((list) => [...list, doc]);
    setActive(doc.id);
  }
  function newModel() {
    const doc = { id: newId('m'), kind: 'model', path: null, title: t('mdl_untitled'), icon: 'model', create: true };
    setDocs((list) => [...list, doc]);
    setActive(doc.id);
  }
  function showFigures({ force = false } = {}) {
    const has = docsRef.current.some((d) => d.id === 'figures');
    if (!has) setDocs((list) => (list.some((d) => d.id === 'figures') ? list : [...list, { id: 'figures', kind: 'figures', title: t('fig_title'), icon: 'figure' }]));
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('.cm-editor');
    if (force || !has || !typing) setActive('figures');
  }
  function openVariable(name) {
    const id = `var:${name}`;
    if (!docsRef.current.some((d) => d.id === id)) setDocs((list) => [...list, { id, kind: 'var', name, title: name, icon: 'variable' }]);
    setActive(id);
  }
  const registerEditor = useCallback((id, api) => { if (api) editors.current.set(id, api); else editors.current.delete(id); }, []);
  const onDocDirty = useCallback((id, dirty) => setDocDirty((m) => (m[id] === dirty ? m : { ...m, [id]: dirty })), []);

  async function closeDocs(ids) {
    for (const id of ids) {
      const doc = docsRef.current.find((d) => d.id === id);
      if (!doc) continue;
      if (docDirtyRef.current[id]) {
        setActive(id);
        // eslint-disable-next-line no-await-in-loop
        const choice = await ask({ title: t('ed_unsaved_title'), icon: 'save', body: t('ed_unsaved_body', { name: doc.title }), buttons: [
          { id: 'save', label: t('save'), icon: 'save', primary: true },
          { id: 'discard', label: t('ed_discard'), icon: 'trash', danger: true },
          { id: 'cancel', label: t('cancel'), icon: 'close' },
        ] });
        if (choice === 'cancel') return;
        // eslint-disable-next-line no-await-in-loop
        if (choice === 'save' && !(await saveDoc(id))) return;
      }
      setDocs((list) => {
        const i = list.findIndex((d) => d.id === id);
        const next = list.filter((d) => d.id !== id);
        if (activeRef.current === id) setActive(next.length ? next[Math.max(0, i - 1)].id : null);
        return next;
      });
      setDocDirty((m) => { const { [id]: _, ...rest } = m; return rest; });
    }
  }
  const docDirtyRef = useRef(docDirty);
  docDirtyRef.current = docDirty;

  async function saveDoc(id, { as = false } = {}) {
    const doc = docsRef.current.find((d) => d.id === id);
    if (!doc) return false;
    if (doc.kind === 'model') {
      window.dispatchEvent(new CustomEvent('msm-model-command', { detail: { id, path: doc.path, command: as ? 'saveAs' : 'save' } }));
      return true;
    }
    if (doc.kind !== 'file') return false;
    const ed = editors.current.get(id);
    if (!ed) return false;
    let path = doc.path;
    if (!path || as) {
      path = await chooseFile({ mode: 'save', title: t('ed_save_as'), start: path ? dirName(path) : cwd, name: path ? baseName(path) : doc.title, exts: ['.m'], filterName: t('ft_m') });
      if (!path) return false;
      if (!/\.[A-Za-z0-9]+$/.test(baseName(path))) path += '.m';
    }
    try {
      await ed.save(path);
      if (path !== doc.path) setDocs((list) => list.map((d) => (d.id === id ? { ...d, path, title: baseName(path) } : d)));
      const lines = ed.editor ? ed.editor.breakpoints() : [];
      setBreakpointsFor(path, lines);
      setFolderKey((k) => k + 1);
      toast(t('ed_saved', { name: baseName(path) }), 'ok', 1800);
      return path;
    } catch (e) { showError(e); return false; }
  }

  const setBreakpointsFor = (path, lines) => {
    if (!path) return;
    setBreakpoints((m) => ({ ...m, [path]: lines }));
    engine.setBreakpoints(path, lines);
  };

  const pathsChanged = (from, to) => {
    setDocs((list) => list.flatMap((d) => {
      if (!d.path) return [d];
      if (d.path === from || d.path.startsWith(`${from}/`)) {
        if (to == null) return [{ ...d, path: null, title: `${d.title} (${t('ed_deleted')})` }];
        const p = to + d.path.slice(from.length);
        return [{ ...d, path: p, title: baseName(p) }];
      }
      return [d];
    }));
  };

  // ── Running code ─────────────────────────────────────────
  const runCode = (code, opts) => (cmdRef.current ? cmdRef.current.run(code, opts) : Promise.resolve());
  async function runDoc(id = active) {
    const doc = docsRef.current.find((d) => d.id === id);
    if (!doc || doc.kind !== 'file') return;
    let path = doc.path;
    if (!path || docDirtyRef.current[id]) path = await saveDoc(id);
    if (!path) return;
    const name = baseName(path).replace(/\.m$/i, '');
    const here = dirName(path) === engine.cwd || dirName(path) === cwd;
    runCode(here && /^[A-Za-z]\w*$/.test(name) ? name : `run(${mQuote(path)})`);
  }
  function runSection() {
    if (!activeEditor || !activeEditor.editor) return;
    const sec = activeEditor.editor.section();
    if (sec.text.trim()) runCode(sec.text, { echo: false, history: false });
  }
  function evalSelection() {
    if (!activeEditor || !activeEditor.editor) return;
    const text = activeEditor.editor.selection() || '';
    if (text.trim()) runCode(text);
  }
  function debugReply(action) {
    if (!debug) { if (action === 'stop' && busy) engine.interrupt(); return; }
    const d = debug;
    setDebug(null);
    d.resolve(action);
  }
  useEffect(() => engine.on('interrupt', () => { setDebug((d) => { if (d) d.resolve('stop'); return null; }); }), []);

  // ── Workspace actions ────────────────────────────────────
  async function clearWorkspace() {
    if (!variables.length) return;
    if (!(await ask({ title: t('rb_clear_ws'), body: t('ws_clear_confirm', { n: variables.length }), okLabel: t('rb_clear_ws'), danger: true }))) return;
    const names = variables.map((v) => v.name);
    const saved = [];
    for (const n of names) { try { saved.push([n, await engine.getVariable(n)]); } catch { /* skipped */ } }
    await engine.clear();
    record({ label: t('rb_clear_ws'), undo: async () => { for (const [n, v] of saved) if (v) await engine.setVariable(n, v); }, redo: () => engine.clear() });
  }
  async function workspaceAction(id, name) {
    if (id === 'open') openVariable(name);
    else if (id === 'plot') { setTab('plots'); runCode(`plot(${name})`); }
    else if (id === 'copyName') navigator.clipboard && navigator.clipboard.writeText(name).catch(() => {});
    else if (id === 'rename') {
      const to = await askText({ title: t('ws_rename'), label: t('ws_new_name'), value: name, icon: 'edit', mono: true });
      if (to && to !== name && /^[A-Za-z]\w*$/.test(to)) {
        await runCode(`${to} = ${name}; clear ${name}`, { echo: false, history: false });
        record({ label: t('ws_rename'), undo: () => runCode(`${name} = ${to}; clear ${to}`, { echo: false, history: false }), redo: () => runCode(`${to} = ${name}; clear ${name}`, { echo: false, history: false }) });
      } else if (to && to !== name) showError(new Error(t('ws_bad_name', { name: to })));
    } else if (id === 'duplicate') runCode(`${name}Copy = ${name};`);
    else if (id === 'saveAs') {
      const p = await chooseFile({ mode: 'save', start: cwd, name: `${name}.mat`, exts: ['.mat'], filterName: t('ft_mat') });
      if (p) runCode(`save(${mQuote(p)}, ${mQuote(name)})`);
    } else if (id === 'delete') {
      let v = null;
      try { v = await engine.getVariable(name); } catch { v = null; }
      await engine.clear([name]);
      if (v) record({ label: t('ws_delete'), undo: () => engine.setVariable(name, v), redo: () => engine.clear([name]) });
    }
  }

  async function importData() {
    const p = await chooseFile({ mode: 'open', title: t('rb_import'), start: cwd, exts: [] });
    if (!p) return;
    const kind = fileKind(p);
    if (kind === 'data') { runCode(importCommand(p)); return; }
    const name = await askText({ title: t('rb_import'), label: t('imp_var_name'), value: varNameOf(baseName(p)), icon: 'import', mono: true, hint: p });
    if (name) runCode(importCommand(p, name));
  }

  async function openModelDialog() {
    const p = await chooseFile({ mode: 'open', title: t('sim_open'), start: cwd, exts: getModelExts(), filterName: t('ft_model') });
    if (p) openFile(p);
  }

  async function openAny() {
    const p = await chooseFile({ mode: 'open', title: t('rb_open'), start: cwd, exts: [] });
    if (p) openFile(p);
  }

  async function changeFolder(path) {
    if (!path) return;
    try {
      const st = await fsApi.stat(path);
      if (!st.isDir) throw new Error(t('cf_not_folder', { path }));
    } catch (e) { showError(e); return; }
    if (engineReady) {
      try { await engine.chdir(path); } catch (e) { showError(e); return; }
    }
    setCwd(path);
  }

  // ── Layout ───────────────────────────────────────────────
  const setLayout = (patch) => patchSettings({ layout: { ...layout, ...patch } });
  const setTab = (id) => patchSettings({ ribbonTab: id });
  const togglePane = (key) => setLayout({ [key]: { ...layout[key], on: !layout[key].on } });
  const layoutMenu = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(r, [
      { id: 'default', label: t('lay_default'), icon: 'layout' },
      { id: 'cmdOnly', label: t('lay_cmd_only'), icon: 'terminal' },
      { sep: true },
      { id: 'folder', label: t('cf_title'), icon: 'folder', on: layout.folder.on },
      { id: 'workspace', label: t('ws_title'), icon: 'table', on: layout.workspace.on },
      { id: 'history', label: t('hist_title'), icon: 'history', on: layout.history.on },
    ], (id) => {
      if (id === 'default') patchSettings({ layout: DEFAULT_LAYOUT });
      else if (id === 'cmdOnly') setLayout({ folder: { ...layout.folder, on: false }, workspace: { on: false }, history: { on: false } });
      else togglePane(id);
    });
  };

  // ── App actions (title bar) ──────────────────────────────
  const openSettings = async (stab) => {
    if (usePopupWindows()) {
      await openPopupWindow({ kind: 'settings', center: true, width: 920, height: 600,
        payload: { settings: getSettings(), tab: stab || null, theme: getSettings().theme, language: getLanguage(), customThemes: getCustomThemesRaw() } });
      return;
    }
    setDialog({ kind: 'settings', tab: stab || null });
  };
  const openAbout = async () => {
    if (usePopupWindows()) {
      await openPopupWindow({ kind: 'about', center: true, width: 640, height: 560, payload: { theme: getSettings().theme, language: getLanguage(), customThemes: getCustomThemesRaw() } });
      return;
    }
    setDialog({ kind: 'about' });
  };
  const onTitleAction = (id) => {
    if (id === 'nextTheme') { const th = nextThemeId(settings.theme); applyTheme(th); patchSettings({ theme: th }); }
    else if (id.startsWith('theme:')) { const th = id.slice(6); applyTheme(th); patchSettings({ theme: th }); }
    else if (id.startsWith('lang:')) { const lang = id.slice(5); setLanguage(lang); document.documentElement.lang = lang; patchSettings({ language: lang }); }
    else if (id === 'settings') openSettings();
    else if (id === 'settings:custom') openSettings('custom');
    else if (id === 'about') openAbout();
  };

  const doUndo = () => { if (activeEditor && activeEditor.editor) activeEditor.editor.undo(); else historyUndo().then((r) => { if (r && r.error) showError(r.error); }); };
  const doRedo = () => { if (activeEditor && activeEditor.editor) activeEditor.editor.redo(); else historyRedo().then((r) => { if (r && r.error) showError(r.error); }); };

  // ── Close (save prompt) ──────────────────────────────────
  const confirmUnsaved = async () => {
    const list = dirtyEditors();
    if (!list.length) return true;
    if (getSettings().confirmExit === false) {
      try { await saveEditors(); return true; } catch { /* fall through to the question */ }
    }
    const choice = await ask({ title: t('exit_unsaved_title'), icon: 'save', body: t('exit_unsaved_body', { names: list.map((x) => x.label).join(', ') }), buttons: [
      { id: 'save', label: t('exit_save_all'), icon: 'save', primary: true },
      { id: 'discard', label: t('exit_discard'), icon: 'trash', danger: true },
      { id: 'cancel', label: t('cancel'), icon: 'close' },
    ] });
    if (choice === 'cancel') return false;
    if (choice === 'save') { try { await saveEditors(); } catch (e) { showError(e); return false; } }
    return true;
  };
  const requestClose = async () => {
    if (!(await confirmUnsaved())) return;
    await flushSettings();
    closing.current = true;
    windowControl(isDesktop ? 'destroy' : 'close');
  };
  useEffect(() => {
    if (!isDesktop) {
      const before = (e) => { if (dirtyEditors().length) { e.preventDefault(); e.returnValue = ''; } };
      window.addEventListener('beforeunload', before);
      return () => window.removeEventListener('beforeunload', before);
    }
    let off = null;
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().onCloseRequested((e) => {
      if (closing.current) return;
      e.preventDefault();
      requestClose();
    })).then((u) => { off = u; }).catch(() => {});
    return () => { if (off) off(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Global keys ──────────────────────────────────────────
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const inEditor = e.target && e.target.closest && e.target.closest('.cm-editor');
    if (mod && !e.shiftKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); newScript(); }
    else if (mod && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); openAny(); }
    else if (mod && (e.key === 's' || e.key === 'S') && !inEditor) { e.preventDefault(); if (active) saveDoc(active, { as: e.shiftKey }); }
    else if (mod && e.key === ',') { e.preventDefault(); openSettings(); }
    else if (mod && e.key === '0' && !e.shiftKey) { e.preventDefault(); if (cmdRef.current) cmdRef.current.focus(); }
    else if (mod && (e.key === ')' || (e.key === '0' && e.shiftKey))) { e.preventDefault(); if (activeEditor && activeEditor.editor) activeEditor.editor.focus(); }
    else if (e.key === 'F5' && !inEditor) { e.preventDefault(); if (debug) debugReply('continue'); else if (activeDoc && activeDoc.kind === 'file') runDoc(); }
    else if (e.key === 'F10' && debug) { e.preventDefault(); debugReply('step'); }
    else if (e.key === 'F11' && debug) { e.preventDefault(); debugReply(e.shiftKey ? 'stepOut' : 'stepIn'); }
    else if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z') && !typingTarget(e.target)) { e.preventDefault(); historyUndo(); }
    else if (mod && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z'))) && !typingTarget(e.target)) { e.preventDefault(); historyRedo(); }
  };
  useEffect(() => {
    const on = (e) => keyRef.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  // ── Ribbon ───────────────────────────────────────────────
  const selVar = variables.find((v) => v.name === selectedVar) || null;
  const plottable = !!selVar && NUMERIC.has(selVar.cls);
  const isEditor = !!(activeDoc && activeDoc.kind === 'file');
  const isModel = !!(activeDoc && activeDoc.kind === 'model');
  const edCall = (fn) => () => { if (activeEditor && activeEditor.editor) activeEditor.editor[fn](); };
  const undoItems = [
    { id: 'undo', icon: 'undo', label: t('tb_undo'), keys: 'Ctrl+Z', disabled: !(isEditor || hist.canUndo), run: doUndo, tip: hist.canUndo && !isEditor ? t('hist_undo_named', { action: hist.undoLabel }) : t('tb_undo') },
    { id: 'redo', icon: 'redo', label: t('tb_redo'), keys: 'Ctrl+Y', disabled: !(isEditor || hist.canRedo), run: doRedo, tip: hist.canRedo && !isEditor ? t('hist_redo_named', { action: hist.redoLabel }) : t('tb_redo') },
  ];
  const debugItems = [
    { id: 'continue', icon: 'continue', label: t('rb_continue'), keys: 'F5', disabled: !debug, run: () => debugReply('continue') },
    { id: 'step', icon: 'stepOver', label: t('rb_step'), keys: 'F10', disabled: !debug, run: () => debugReply('step') },
    { id: 'stepIn', icon: 'stepIn', label: t('rb_step_in'), keys: 'F11', disabled: !debug, run: () => debugReply('stepIn') },
    { id: 'stepOut', icon: 'stepOut', label: t('rb_step_out'), keys: 'Shift+F11', disabled: !debug, run: () => debugReply('stepOut') },
    { id: 'stopDebug', icon: 'stop', label: t('rb_stop'), disabled: !debug && !busy, run: () => (debug ? debugReply('stop') : engine.interrupt()) },
  ];
  const ribbons = {
    home: [
      { id: 'newScript', icon: 'script', label: t('rb_new_script'), keys: 'Ctrl+N', run: () => newScript() },
      { id: 'newModel', icon: 'model', label: t('rb_new_model'), run: newModel },
      { id: 'open', icon: 'folder', label: t('rb_open'), keys: 'Ctrl+O', run: openAny },
      { id: 'save', icon: 'save', label: t('rb_save'), keys: 'Ctrl+S', disabled: !(isEditor || isModel), run: () => saveDoc(active) },
      { sep: true },
      { id: 'findFiles', icon: 'search', label: t('rb_find_files'), run: () => setDialog({ kind: 'find' }) },
      { id: 'import', icon: 'import', label: t('rb_import'), run: importData },
      { id: 'clearWs', icon: 'clearWs', label: t('rb_clear_ws'), disabled: !variables.length, run: clearWorkspace },
      { id: 'clearCmd', icon: 'clearCmd', label: t('rb_clear_cmd'), run: () => cmdRef.current && cmdRef.current.clear() },
      { sep: true },
      ...undoItems,
      { sep: true },
      { id: 'pane:folder', icon: 'folder', label: t('cf_title'), on: layout.folder.on, run: () => togglePane('folder') },
      { id: 'pane:workspace', icon: 'table', label: t('ws_title'), on: layout.workspace.on, run: () => togglePane('workspace') },
      { id: 'pane:history', icon: 'history', label: t('hist_title'), on: layout.history.on, run: () => togglePane('history') },
      { id: 'layout', icon: 'layout', label: t('rb_layout'), run: layoutMenu },
      { id: 'prefs', icon: 'settings', label: t('rb_prefs'), run: () => openSettings() },
    ],
    plots: [
      { id: 'selected', node: <span className={`rb-selvar mono ${selVar ? '' : 'muted'}`}>{selVar ? `${selVar.name} (${selVar.dims.join('×')} ${selVar.cls})` : t('pl_select_var')}</span>, icon: 'variable', tip: t('pl_select_hint') },
      { sep: true },
      ...PLOTS.map(([id, icon, tpl]) => ({ id: `plot:${id}`, icon, label: id, disabled: !plottable, tip: t('pl_tip', { cmd: tpl.replaceAll('{v}', selVar ? selVar.name : 'x') }), run: () => runCode(tpl.replaceAll('{v}', selVar.name)) })),
      { sep: true },
      { id: 'figures', icon: 'figure', label: t('fig_title'), run: () => showFigures({ force: true }) },
    ],
    apps: [
      { id: 'app:import', icon: 'import', label: t('app_import'), run: importData },
      { id: 'app:var', icon: 'table', label: t('app_variables'), disabled: !selVar, run: () => selVar && openVariable(selVar.name) },
      { id: 'app:plots', icon: 'chart', label: t('app_plots'), run: () => setTab('plots') },
      { id: 'app:figures', icon: 'figure', label: t('app_figures'), run: () => showFigures({ force: true }) },
      { id: 'app:library', icon: 'library', label: t('app_library'), run: () => { setTab('simulation'); window.dispatchEvent(new CustomEvent('msm-sim-library')); engine.post({ type: 'sim.library' }); } },
      { id: 'app:find', icon: 'search', label: t('app_find'), run: () => setDialog({ kind: 'find' }) },
      { sep: true },
      { id: 'app:restart', icon: 'refresh', label: t('app_restart'), run: async () => { if (await ask({ title: t('app_restart'), body: t('app_restart_body'), okLabel: t('app_restart'), danger: true })) { await engine.restart(); setVariables([]); } } },
    ],
    editor: [
      { id: 'ed:new', icon: 'script', label: t('rb_new_script'), run: () => newScript() },
      { id: 'ed:open', icon: 'folder', label: t('rb_open'), run: openAny },
      { id: 'ed:save', icon: 'save', label: t('rb_save'), keys: 'Ctrl+S', disabled: !isEditor, run: () => saveDoc(active) },
      { id: 'ed:saveAs', icon: 'download', label: t('ed_save_as'), disabled: !isEditor, run: () => saveDoc(active, { as: true }) },
      { sep: true },
      { id: 'run', icon: 'play', label: t('rb_run'), keys: 'F5', primary: true, disabled: !isEditor || busy, run: () => runDoc() },
      { id: 'runSection', icon: 'runSection', label: t('rb_run_section'), keys: 'Ctrl+Enter', disabled: !isEditor || busy, run: runSection },
      ...debugItems,
      { sep: true },
      { id: 'bp', icon: 'breakpoint', label: t('rb_breakpoint'), keys: 'F12', disabled: !isEditor, run: edCall('toggleBreakpoint') },
      { id: 'bpClear', icon: 'breakpointOff', label: t('rb_clear_bp'), disabled: !Object.values(breakpoints).some((l) => l.length), run: () => { for (const p of Object.keys(breakpoints)) engine.setBreakpoints(p, []); setBreakpoints({}); for (const ed of editors.current.values()) if (ed.editor) ed.editor.setBreakpoints([]); } },
      { sep: true },
      { id: 'find', icon: 'search', label: t('rb_find'), keys: 'Ctrl+F', disabled: !isEditor, run: edCall('find') },
      { id: 'comment', icon: 'comment', label: t('rb_comment'), keys: 'Ctrl+R', disabled: !isEditor, run: edCall('comment') },
      { id: 'uncomment', icon: 'uncomment', label: t('rb_uncomment'), keys: 'Ctrl+T', disabled: !isEditor, run: edCall('uncomment') },
      { id: 'indent', icon: 'indent', label: t('rb_indent'), keys: 'Ctrl+]', disabled: !isEditor, run: edCall('indent') },
      { id: 'outdent', icon: 'outdent', label: t('rb_outdent'), keys: 'Ctrl+[', disabled: !isEditor, run: edCall('outdent') },
    ],
    simulation: [
      { id: 'sim:new', icon: 'model', label: t('rb_new_model'), run: newModel },
      { id: 'sim:open', icon: 'folder', label: t('sim_open'), run: openModelDialog },
      { id: 'sim:save', icon: 'save', label: t('rb_save'), disabled: !isModel, run: () => saveDoc(active) },
      { id: 'sim:library', icon: 'library', label: t('sim_library'), run: () => { window.dispatchEvent(new CustomEvent('msm-sim-library')); engine.post({ type: 'sim.library' }); } },
      { sep: true },
      { sep: true },
      { id: 'sim:run', icon: 'play', label: t('sim_run'), primary: true, disabled: !isModel, run: () => { const detail = { id: active, path: activeDoc.path, command: 'run', solver: settings.sim.solver, stopTime: settings.sim.stopTime }; window.dispatchEvent(new CustomEvent('msm-model-command', { detail })); } },
      { id: 'sim:stopRun', icon: 'stop', label: t('sim_stop'), disabled: !isModel, run: () => { window.dispatchEvent(new CustomEvent('msm-model-command', { detail: { id: active, path: activeDoc.path, command: 'stop' } })); } },
    ],
  };

  // ── Render ───────────────────────────────────────────────
  const rightOn = layout.workspace.on || layout.history.on;
  const hasDocs = docs.length > 0;
  const figuresOpen = docs.some((d) => d.id === 'figures');
  const tabs = docs.map((d) => ({ id: d.id, label: d.title, icon: d.icon, dirty: !!docDirty[d.id], title: d.path || d.title }));
  const dbgFile = debug && debug.file;
  const stateLabel = debug ? t('dbg_paused') : engineState === 'busy' || busy ? t('st_busy') : engineState === 'ready' ? t('st_ready') : engineState === 'starting' ? t('st_starting') : t('st_no_engine');

  const commandWindow = (
    <div className="cw-wrap pane-box" data-pane="cmd">
      <div className="pane-head"><Icon name="terminal" size={14} /><strong>{t('cw_title')}</strong><span className="spacer" />
        {(busy || debug) && <button type="button" className="icon-btn" title={`${t('cw_interrupt')} (Ctrl+C)`} aria-label={t('cw_interrupt')} onClick={() => { if (debug) debugReply('stop'); else engine.interrupt(); }}><Icon name="stop" size={13} /></button>}
        <button type="button" className="icon-btn" title={t('rb_clear_cmd')} aria-label={t('rb_clear_cmd')} onClick={() => cmdRef.current && cmdRef.current.clear()}><Icon name="clearCmd" size={13} /></button>
      </div>
      <CommandWindow ref={cmdRef} engine={engine} settings={settings} busy={busy} engineState={engineState} debug={debug} onDebugReply={debugReply}
        history={historyCommands} onHistoryAdd={addHistory} onOpenLink={(file, line) => openFile(/^([A-Za-z]:)?\//.test(file) ? file : joinPath(cwd, file), { line })} />
    </div>
  );

  return (
    <div className="app msm" data-engine={engineState}>
      <TitleBar tab={tab} onTab={setTab} theme={settings.theme} onAction={onTitleAction} dirty={anyDirty} busy={busy} debug={debug} onClose={requestClose} />
      <Ribbon tabId={tab} items={ribbons[tab] || ribbons.home} />
      <div className="body-row">
        {layout.folder.on && (
          <>
            <div className="pane-box dock-col" style={{ width: L.folderW || layout.folder.w }} data-pane="folder">
              <div className="pane-head"><Icon name="folder" size={14} /><strong>{t('cf_title')}</strong><span className="spacer" />
                <button type="button" className="icon-btn close-x" title={t('pn_close')} aria-label={t('pn_close')} onClick={() => togglePane('folder')}><Icon name="close" size={12} /></button>
              </div>
              <CurrentFolderPane cwd={cwd} refreshKey={folderKey} onChdir={changeFolder} onOpen={(p, o) => openFile(p, o)}
                onRun={(p) => { const n = baseName(p).replace(/\.m$/i, ''); runCode(dirName(p) === cwd && /^[A-Za-z]\w*$/.test(n) ? n : `run(${mQuote(p)})`); }} onPathsChanged={pathsChanged} />
            </div>
            <Splitter axis="x" dir={1} value={L.folderW || layout.folder.w} min={LIMITS.folder[0]} max={LIMITS.folder[1]} label={t('cf_title')}
              onChange={(v) => setLive((x) => ({ ...x, folderW: v }))} onCommit={(v) => { setLive((x) => ({ ...x, folderW: undefined })); setLayout({ folder: { ...layout.folder, w: v } }); }} />
          </>
        )}
        <div className="center-col">
          <div className="doc-area" style={{ display: hasDocs ? undefined : 'none' }}>
            <DocTabs tabs={tabs} active={active} onActivate={activate} onClose={closeDocs}
              onReorder={(from, to) => setDocs((list) => { const a = list.findIndex((d) => d.id === from); const b = list.findIndex((d) => d.id === to); const next = [...list]; const [x] = next.splice(a, 1); next.splice(b, 0, x); return next; })}
              onMoveTo={(id, at) => setDocs((list) => { const x = list.find((d) => d.id === id); const rest = list.filter((d) => d.id !== id); rest.splice(Math.min(at, rest.length), 0, x); return rest; })} />
            <div className="doc-body">
              {docs.filter((d) => d.kind !== 'figures').map((d) => (
                <div key={d.id} className="doc-page" style={{ display: d.id === active ? undefined : 'none' }} data-doc={d.kind}>
                  <TabActiveCtx.Provider value={d.id === active}>
                    {d.kind === 'file' && (
                      <EditorDoc doc={d} active={d.id === active} settings={settings} register={registerEditor} onDirty={onDocDirty}
                        onCursor={setCursor} breakpoints={d.path ? breakpoints[d.path] || [] : []}
                        onBreakpoints={(lines) => { if (d.path) setBreakpointsFor(d.path, lines); }}
                        debugLine={debug && dbgFile && d.path && dbgFile.replace(/\\/g, '/') === d.path ? debug.line : null}
                        actions={{ run: () => (debugRef.current ? debugReply('continue') : runDoc(d.id)), runSection, evalSelection, save: () => saveDoc(d.id), saveAs: (id) => saveDoc(id, { as: true }), debug: (a) => debugReply(a), complete: (text, cur) => engine.complete(text, cur) }} />
                    )}
                    {d.kind === 'var' && <VariableEditor engine={engine} name={d.name} active={d.id === active} refreshKey={varKey} format={settings.cmd.numericFormat.startsWith('long') ? 'long' : 'short'} />}
                    {d.kind === 'model' && (
                      <ModelEditorGuard engine={engine} path={d.path} lang={getLanguage()} active={d.id === active} defaults={settings.sim}
                        onDirty={(dirty) => onDocDirty(d.id, !!dirty)}
                        onTitle={(title) => setDocs((list) => list.map((x) => (x.id === d.id ? { ...x, title: title || x.title } : x)))}
                        onSaveAs={async (name) => { const p = await chooseFile({ mode: 'save', title: t('ed_save_as'), start: d.path ? dirName(d.path) : cwd, name: `${name || 'untitled'}${getModelExts()[0]}`, exts: getModelExts(), filterName: t('ft_model') }); if (p) setDocs((list) => list.map((x) => (x.id === d.id ? { ...x, path: p, title: baseName(p) } : x))); return p; }}
                        onNew={newModel} onOpen={openModelDialog} />
                    )}
                  </TabActiveCtx.Provider>
                </div>
              ))}
              {/* Always mounted: figures arrive before their tab is shown. */}
              <div className="doc-page figure-page" style={{ display: active === 'figures' && figuresOpen ? undefined : 'none' }} data-doc="figures">
                <FigureAreaGuard engine={engine} lang={getLanguage()} active={active === 'figures'} defaults={settings.figures} />
              </div>
            </div>
          </div>
          {hasDocs && (
            <Splitter axis="y" dir={-1} value={L.cmdH} min={LIMITS.cmdH[0]} max={LIMITS.cmdH[1]} label={t('cw_title')}
              onChange={(v) => setLive((x) => ({ ...x, cmdH: v }))} onCommit={(v) => { setLive((x) => ({ ...x, cmdH: undefined })); setLayout({ cmdH: v }); }} />
          )}
          <div className={`cmd-slot ${hasDocs ? '' : 'fill'}`} style={hasDocs ? { height: L.cmdH } : undefined}>{commandWindow}</div>
        </div>
        {rightOn && (
          <>
            <Splitter axis="x" dir={-1} value={L.rightW} min={LIMITS.right[0]} max={LIMITS.right[1]} label={t('ws_title')}
              onChange={(v) => setLive((x) => ({ ...x, rightW: v }))} onCommit={(v) => { setLive((x) => ({ ...x, rightW: undefined })); setLayout({ rightW: v }); }} />
            <div className="right-col" style={{ width: L.rightW }}>
              {layout.workspace.on && (
                <div className="pane-box" data-pane="workspace" style={layout.history.on ? { flex: `0 0 ${Math.round(L.wsRatio * 100)}%` } : { flex: 1 }}>
                  <div className="pane-head"><Icon name="table" size={14} /><strong>{t('ws_title')}</strong><span className="spacer" />
                    <button type="button" className="icon-btn" title={t('rb_clear_ws')} aria-label={t('rb_clear_ws')} disabled={!variables.length} onClick={clearWorkspace}><Icon name="clearWs" size={13} /></button>
                    <button type="button" className="icon-btn close-x" title={t('pn_close')} aria-label={t('pn_close')} onClick={() => togglePane('workspace')}><Icon name="close" size={12} /></button>
                  </div>
                  <WorkspacePane variables={variables} selected={selectedVar} onSelect={setSelectedVar} onOpen={openVariable} onAction={workspaceAction} engineReady={engineReady} />
                </div>
              )}
              {layout.workspace.on && layout.history.on && (
                <RatioSplitter value={L.wsRatio} onChange={(v) => setLive((x) => ({ ...x, wsRatio: v }))} onCommit={(v) => { setLive((x) => ({ ...x, wsRatio: undefined })); setLayout({ wsRatio: v }); }} />
              )}
              {layout.history.on && (
                <div className="pane-box" data-pane="history" style={{ flex: 1 }}>
                  <div className="pane-head"><Icon name="history" size={14} /><strong>{t('hist_title')}</strong><span className="spacer" />
                    <button type="button" className="icon-btn close-x" title={t('pn_close')} aria-label={t('pn_close')} onClick={() => togglePane('history')}><Icon name="close" size={12} /></button>
                  </div>
                  <HistoryPane items={history} onRun={(c) => runCode(c)} onCopyToPrompt={(c) => { if (cmdRef.current) cmdRef.current.focus(); navigator.clipboard && navigator.clipboard.writeText(c).catch(() => {}); toast(t('hist_copied'), 'ok', 1500); }}
                    onDelete={(i) => setHistory((list) => { const next = list.filter((_, k) => k !== i); storeHistory(next); return next; })}
                    onClearAll={async () => { if (await ask({ title: t('hist_clear_all'), body: t('hist_clear_confirm'), danger: true })) { setHistory([]); storeHistory([]); } }} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <div className="statusbar" data-tour="statusbar">
        <span className="sb-item ellipsis sb-path" title={cwd}><Icon name="folder" size={13} />{cwd}</span>
        <span className={`sb-item sb-engine ${engineState}`} title={engine.error || stateLabel}><Icon name={debug ? 'bug' : busy ? 'spinner' : engineReady ? 'checkCircle' : engineState === 'starting' ? 'hourglass' : 'alert'} size={13} className={busy && !debug ? 'spin' : undefined} />{stateLabel}</span>
        {debug && <span className="sb-item"><Icon name="stepOver" size={13} />{baseName(debug.file || '')}:{debug.line}</span>}
        <span className="spacer" />
        {activeDoc && activeDoc.kind === 'file' && cursor && <span className="sb-item">{t('sb_ln_col', { line: cursor.line, col: cursor.col })}{cursor.sel ? ` (${t('sb_sel', { n: cursor.sel })})` : ''}</span>}
        {activeDoc && activeDoc.kind === 'file' && <span className="sb-item">UTF-8</span>}
        {activeDoc && <span className="sb-item">{activeDoc.kind === 'file' ? (fileKind(activeDoc.title) === 'script' ? t('sb_lang_m') : t('sb_lang_text')) : activeDoc.kind === 'model' ? t('mdl_title') : activeDoc.kind === 'var' ? t('ve_title') : t('fig_title')}</span>}
        <ResizeGrip />
      </div>
      {dialog && dialog.kind === 'settings' && <SettingsDialog settings={settings} initialTab={dialog.tab} onClose={() => setDialog(null)} onSave={saveSettingsDraft} />}
      {dialog && dialog.kind === 'about' && <AboutDialog onClose={() => setDialog(null)} />}
      {dialog && dialog.kind === 'find' && <FindFilesDialog cwd={cwd} onOpen={(p, line) => openFile(p, { line })} onClose={() => setDialog(null)} />}
      <UiHost />
      <MenuHost />
      <PromptHost />
      <ProgressHost />
    </div>
  );
}

/** The splitter between Workspace and Command History (a share of the column). */
function RatioSplitter({ value, onChange, onCommit }) {
  const down = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const col = e.currentTarget.parentElement.getBoundingClientRect();
    let last = value;
    const move = (ev) => { last = Math.max(0.15, Math.min(0.85, (ev.clientY - col.top) / col.height)); onChange(last); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('resizing-y'); onCommit(last); };
    document.body.classList.add('resizing-y');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return <div className="splitter splitter-y" role="separator" aria-orientation="horizontal" tabIndex={0} onPointerDown={down}
    onKeyDown={(e) => { const d = e.key === 'ArrowUp' ? -0.05 : e.key === 'ArrowDown' ? 0.05 : 0; if (d) { e.preventDefault(); const v = Math.max(0.15, Math.min(0.85, value + d)); onChange(v); onCommit(v); } }} />;
}

// ── Engine requests answered here ─────────────────────────
async function httpRequest(m) {
  try {
    const res = await fetch(m.url, { method: m.method || 'GET', headers: m.headers || undefined, body: m.body == null ? undefined : m.body });
    const headers = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    if (m.binary) {
      const buf = new Uint8Array(await res.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { status: res.status, headers, base64: btoa(s) };
    }
    return { status: res.status, headers, text: await res.text() };
  } catch (e) {
    return { status: 0, error: (e && e.message) || String(e) };
  }
}

let audioCtx = null;
function playAudio(msg) {
  try {
    const rate = Number(msg.fs || msg.rate || 8192);
    const raw = msg.samples || msg.data || [];
    const channels = Math.max(1, Number(msg.channels || (Array.isArray(raw[0]) ? raw.length : 1)));
    const chans = Array.isArray(raw[0]) || ArrayBuffer.isView(raw[0]) ? raw : [raw];
    const n = chans[0].length;
    if (!n) return;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const buf = audioCtx.createBuffer(channels, n, rate);
    for (let c = 0; c < channels; c++) {
      const out = buf.getChannelData(c);
      const src = chans[Math.min(c, chans.length - 1)];
      for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, Number(src[i]) || 0));
    }
    const node = audioCtx.createBufferSource();
    node.buffer = buf;
    node.connect(audioCtx.destination);
    node.start();
  } catch (e) { console.error('audio.play', e); }
}

