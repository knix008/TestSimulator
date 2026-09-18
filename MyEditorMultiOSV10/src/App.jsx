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
import { EditorView } from '@codemirror/view';
import { indentSelection } from '@codemirror/commands';
import { t, setLanguage, getLanguage, useLanguage } from './lib/i18n';
import { applyTheme, nextThemeId, themeById, setCustomThemes } from './themes';
import { SETTINGS_DEFAULTS, pickSettings } from './lib/settings';
import {
  call, isElectron, nativeDialog, setDialogFallback, writeClipboardText, readClipboardText, onOpenFiles, rendererReady, pathForFile,
  onCloseRequest, replyClose, onWindowFocus, setWindowTitle, windowControl, quitApp, isMac, openPopup, openPrintWindow, sendSettingsPatch, onSettingsPatch, printHtml,
} from './lib/backend';
import { createState, settingsEffects, languageEffect, readOnlyEffect, commands, searchApi, applySaveTransforms, cursorInfo } from './lib/editor';
import { detectLanguage, languageByName, loadLanguage, FEATURED_LANGUAGES, PLAIN } from './lib/languages';
import { commands as md } from './lib/markdown';
import { resolveFormatter, toolLabel } from './lib/formatters';
import { HexView } from './components/HexView';
import { Outline } from './components/Outline';
import { markdownLive, imageBase } from './lib/mdlive';
import { dockerfileCompletion, kubernetesCompletion } from './lib/devops';
import { fileToDataUrl, isImageFile, resolveImageSrc, analyzeImage, encodeImage, icoDisplaySrc } from './lib/images';
import { buildCodePrintHtmlAsync, highlightCodeLinesAsync, printOptsOf } from './lib/print';
import { withProgress, yieldToUi } from './lib/progress';
import { renderMarkdown } from './lib/markdown';
import { applyDiagnostics, clearDiagnostics, countDiagnostics, openLintPanel, nextDiagnostic } from './lib/lint';
import { wordAt as spellWordAt, suggest as spellSuggest, addUserWord, ignoreWord, setUserWords, setSpellOptions, refreshAll as spellRefreshAll, isReady as spellReady } from './lib/spell';
import { MenuBar } from './components/MenuBar';
import { Toolbar } from './components/Toolbar';
import { TabBar } from './components/TabBar';
import { EditorPane } from './components/EditorPane';
import { FindBar } from './components/FindBar';
import { MarkdownBar } from './components/MarkdownBar';
import { Preview } from './components/Preview';
import { HtmlPreview, HtmlBar, buildHtmlDocument } from './components/HtmlPreview';
import { ImagePreview, ImageBar, isBinaryImageName, isSvgName, insertSvgTag } from './components/ImagePreview';
import { restoreAsPicture } from './lib/imagekind';
import { withMenuIcons } from './lib/menuicons';
import { Sidebar } from './components/Sidebar';
import { SearchPanel } from './components/SearchPanel';
import { StatusBar } from './components/StatusBar';
import { TerminalPanel } from './components/TerminalPanel';
import { Icon, LangIcon } from './components/Icons';
import { ContextMenu } from './components/ContextMenu';
import { ConfirmDialog, ErrorDialog, AboutDialog, GotoLineDialog, PromptDialog, LanguagePicker, EncodingPicker, ShortcutsDialog } from './dialogs/Dialogs';
import { SettingsDialog } from './dialogs/SettingsDialog';
import { FileDialog } from './dialogs/FileDialog';
import { ImageDialog } from './dialogs/ImageDialog';
import { ImageExportDialog } from './dialogs/ImageExportDialog';
import { InstallDialog } from './dialogs/InstallDialog';
import { PrintPreviewDialog } from './dialogs/PrintPreviewDialog';
import { ProgressHost } from './dialogs/ProgressDialog';

const BASE_FONT = 12;   // the font size that is 100 % zoom (the default)
// split = multi: n panes as a balanced grid — columns = ceil(√n), rows = ceil(n / columns).
const multiGrid = (n) => { const cols = Math.max(1, Math.ceil(Math.sqrt(n))); return { cols, rows: Math.max(1, Math.ceil(n / cols)) }; };
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
  const statesRef = useRef(new Map());     // id → EditorState of docs not shown in a pane
  const hexRef = useRef(new Map());        // id → read(offset, length) of a binary document (kind 'hex'; its editor state stays empty)
  // Split view: one or more panes (보기 › 편집 창 나누기), each showing one
  // document; the active pane is the one the tab bar, find bar and preview
  // follow, and viewRef is its view. A document is shown in at most one pane.
  const [panes, setPanes] = useState([{ key: 1, docId: null }]);
  const [paneMenu, setPaneMenu] = useState(null);   // { i, el, files: [{ name, path }] | null }
  // The pane's document picker: the open documents, then the files of the
  // folder open in the sidebar (or the active document's folder), then "Open…".
  const openPaneMenu = (i, el) => {
    setPaneMenu({ i, el, files: null });
    const dir = folderRef.current || (() => { const d = getDoc(activeIdRef.current); return d && d.path ? dirName(d.path) : ''; })();
    if (!dir) return;
    call('fs.list', { path: dir, showHidden: false }).then((r) => {
      const entries = (r && r.entries) || (Array.isArray(r) ? r : []);
      const files = entries.filter((e) => !e.isDir).map((e) => ({ name: e.name, path: e.path })).slice(0, 200);
      setPaneMenu((m) => (m && m.i === i && m.el === el ? { ...m, dir, files } : m));
    }).catch(() => {});
  };
  // Picked from the pane menu: an open document moves into the pane, a file is opened there.
  const paneMenuPick = (i, id) => {
    if (id.startsWith('doc:')) { showInPane(i, Number(id.slice(4))); return; }
    if (id === 'open') { focusPane(i, { focus: false }); action('open'); return; }
    if (id.startsWith('file:')) {
      const p = id.slice(5);
      const open = docsRef.current.find((d) => samePath(d.path, p));
      if (open) { showInPane(i, open.id); return; }
      focusPane(i, { focus: false });
      openPath(p);
    }
  };
  const panesRef = useRef(panes);
  const paneKeyRef = useRef(2);
  const paneViews = useRef(new Map());     // pane key → EditorView
  const activePaneRef = useRef(0);
  const [activePane, setActivePaneState] = useState(0);
  const updatePanes = (fn) => { const next = fn(panesRef.current.map((p) => ({ ...p }))); panesRef.current = next; setPanes(next); return next; };
  const paneOfDoc = (id) => panesRef.current.findIndex((p) => p.docId === id);
  const viewOfDoc = (id) => { const i = paneOfDoc(id); return i >= 0 ? paneViews.current.get(panesRef.current[i].key) || null : null; };
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
  const showHidden = !!settings.treeShowHidden;   // the folder tree's hidden files (settings › general › folder tree)
  const [sbRefresh, setSbRefresh] = useState(0);
  const [recent, setRecent] = useState([]);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [searchRequest, setSearchRequest] = useState(null);   // { key, initial, scope } → the search panel focuses / runs
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
  const getState = (id) => { const v = viewOfDoc(id); return v ? v.state : statesRef.current.get(id); };
  const putState = (id, state) => { const v = viewOfDoc(id); if (v) v.setState(state); else statesRef.current.set(id, state); };
  // Applies a transaction spec to a document, wherever its state lives.
  const dispatchTo = (id, spec) => {
    const v = viewOfDoc(id);
    if (v) v.dispatch(spec);
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
    scheduleLint(id);
    scheduleFmtCheck(id);
    scheduleAutoSave(id);
  };
  // Auto save (settings › general › session): 'delay' saves an edited file autoSaveDelay seconds after the last
  // edit, 'blur' saves every edited file when the window loses the focus. Only files that exist on disk and
  // are writable — a new untitled document still needs a name from you.
  const autoSaveTimers = useRef(new Map());
  const scheduleAutoSave = (id) => {
    const st = settingsRef.current;
    clearTimeout(autoSaveTimers.current.get(id));
    if (st.autoSave !== 'delay') return;
    autoSaveTimers.current.set(id, setTimeout(() => { const d = getDoc(id); if (d && d.dirty && d.path && !d.readonly && d.kind !== 'hex') saveDoc(id).catch(() => {}); }, Math.max(1, Number(st.autoSaveDelay) || 5) * 1000));
  };
  useEffect(() => {
    const onBlur = () => { if (settingsRef.current.autoSave !== 'blur') return; for (const d of docsRef.current) if (d.dirty && d.path && !d.readonly && d.kind !== 'hex') saveDoc(d.id).catch(() => {}); };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── linting: the language's checker runs in the backend, a moment after the
  // last edit, and its findings come back as gutter markers / underlines. The
  // editor is never blocked: the run is a separate process and the result is
  // applied only if the document has not changed meanwhile (then it is rerun).
  const lintTimers = useRef(new Map());
  const lintRuns = useRef(new Map());   // id → text that was sent
  const scheduleLint = (id, delay = 700) => {
    if (!settingsRef.current.lint) return;
    const timers = lintTimers.current;
    if (timers.has(id)) clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => { timers.delete(id); runLint(id); }, delay));
    const d = getDoc(id); if (d && d.lint && !d.lint.pending) patchDoc(id, { lint: { ...d.lint, pending: true } });
  };
  const runLint = async (id) => {
    const doc = getDoc(id);
    const state = getState(id);
    if (!doc || !state || !settingsRef.current.lint) return;
    if (!doc.langName || doc.langName === 'Markdown' && !doc.path) { return; }
    const text = state.doc.toString();
    lintRuns.current.set(id, text);
    let r;
    try { r = await call('lint.run', { id, path: doc.path || '', name: doc.name, language: doc.langName, text, tool: (settingsRef.current.linters || {})[doc.langName] || 'auto' }); } catch { r = null; }
    if (!r || r.cancelled || lintRuns.current.get(id) !== text) return;
    lintRuns.current.delete(id);
    const cur = getDoc(id);
    const st = getState(id);
    if (!cur || !st) return;
    if (st.doc.toString() !== text) { scheduleLint(id, 300); return; }
    dispatchTo(id, applyDiagnostics(st, r.diagnostics || []));
    const after = getState(id);
    const counts = after ? countDiagnostics(after) : { error: 0, warning: 0, info: 0, total: 0 };
    patchDoc(id, { lint: { tool: r.tool, error: r.error || null, ...counts } });
  };
  const clearLint = (id) => { const st = getState(id); if (st) dispatchTo(id, clearDiagnostics(st)); patchDoc(id, { lint: null }); };
  // ── printing (파일 › 인쇄, Ctrl+P): the desktop app opens a separate
  // print window (preview + destination). The web / smoke test keep the
  // dialog in the page. Markdown and HTML print as rendered (local images
  // embedded as data URLs), a picture / SVG as the picture, anything else
  // as a listing with line numbers.
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const printDoc = async (id = activeIdRef.current) => {
    const doc = getDoc(id);
    const st = getState(id);
    if (!doc || !st) return;
    const text = st.doc.toString();
    const title = doc.name;
    const base = doc.path ? dirName(doc.path) : folderRef.current || '';
    const isCode = doc.langName !== 'Markdown' && doc.langName !== 'HTML' && !isBinaryImageName(doc.name) && !isSvgName(doc.name);
    const printOpts = printOptsOf(settingsRef.current);
    const big = text.length > 40000 || st.doc.lines > 800;
    let lineHtml;
    let html;
    const built = await withProgress({ title: t('prog_print'), message: t('prog_print_build'), detail: title, delay: big ? 0 : 160 }, async ({ report }) => {
      if (isCode) {
        report({ message: t('prog_print_highlight'), value: 0.05 });
        lineHtml = await highlightCodeLinesAsync(st, printOpts.tabSize, (v) => report({ value: v, message: t('prog_print_highlight') }));
      }
      if (doc.langName === 'HTML') {
        report({ message: t('prog_print_build'), value: 0.4 });
        return buildHtmlDocument(text, base);
      }
      let body;
      if (isBinaryImageName(doc.name) && doc.path) {
        report({ message: t('prog_image_load'), value: 0.3 });
        try {
          const r = await call('file.dataUrl', { path: doc.path });
          const src = /\.ico$/i.test(doc.name) ? icoDisplaySrc(r.dataUrl) : r.dataUrl;
          body = `<div class="pic"><img src="${src}" alt="${esc(title)}"></div>`;
        } catch { body = `<p class="muted">${esc(t('img_pv_broken'))}</p>`; }
      } else if (isSvgName(doc.name)) {
        body = `<div class="pic"><img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}" alt="${esc(title)}"></div>`;
      } else if (doc.langName === 'Markdown') {
        report({ message: t('prog_print_build'), value: 0.25 });
        const host = document.createElement('div');
        host.innerHTML = renderMarkdown(text);
        const imgs = [...host.querySelectorAll('img[src]')];
        for (let i = 0; i < imgs.length; i++) {
          try { imgs[i].setAttribute('src', await resolveImageSrc(imgs[i].getAttribute('src'), base)); } catch { /* left as is */ }
          report({ value: 0.25 + 0.5 * ((i + 1) / Math.max(1, imgs.length)) });
        }
        body = `<article class="md">${host.innerHTML}</article>`;
      } else {
        report({ message: t('prog_print_pages'), value: 0.7 });
        return buildCodePrintHtmlAsync({ title, path: doc.path || doc.name, lang: doc.langName, text, lineHtml, opts: printOpts }, (v) => report({ value: v, message: t('prog_print_pages') }));
      }
      const css = `body{font-family:Segoe UI,Malgun Gothic,Apple SD Gothic Neo,Noto Sans KR,Helvetica,Arial,sans-serif;color:#111;margin:18mm 16mm;font-size:12pt;line-height:1.55}
h1{font-size:1.8em;border-bottom:1px solid #999;padding-bottom:4px}h2{font-size:1.45em;border-bottom:1px solid #bbb;padding-bottom:3px}h3{font-size:1.2em}
pre,code{font-family:Cascadia Mono,Consolas,D2Coding,Menlo,monospace;font-size:10.5pt}pre{background:#f4f4f4;border:1px solid #ddd;border-radius:4px;padding:8px;white-space:pre-wrap;word-break:break-all}
img{max-width:100%;height:auto;page-break-inside:avoid}table{border-collapse:collapse}.md table td,.md table th{border:1px solid #bbb;padding:3px 8px}blockquote{border-left:3px solid #999;margin:0;padding:2px 12px;color:#444}
.pic{display:flex;justify-content:center}.title{font-size:10pt;color:#666;border-bottom:1px solid #ccc;margin-bottom:12px;padding-bottom:4px}@page{margin:0}`;
      return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body><div class="title">${esc(doc.path || doc.name)}</div>${body}</body></html>`;
    });
    html = built;
    const job = { html, title, code: isCode, text: isCode ? text : undefined, path: doc.path || doc.name, lang: isCode ? doc.langName : undefined, lineHtml };
    if (openPrintWindow(job)) return;
    const ok = await ask({ type: 'printPreview', ...job });
    if (ok) printHtml((ok && ok.html) || html, t('print_title'), { print: t('print_title'), close: t('cancel') }, ok && typeof ok === 'object' ? ok : undefined);
  };
  // An image of the preview saved as a file: the export dialog picks the
  // format / quality / transparency, then the save dialog the place.
  const saveImage = async (src, alt) => {
    const r = await ask({ type: 'imageExport', src, alt });
    if (!r) return;
    try {
      const p = await nativeDialog('save', { name: r.name, defaultPath: folderRef.current ? `${folderRef.current}${(infoRef.current && infoRef.current.sep) || '/'}${r.name}` : undefined });
      if (!p) return;
      await call('file.writeDataUrl', { path: p, dataUrl: r.dataUrl });
      setMessage(t('pv_image_saved', { path: p }));
    } catch (e) { await showError(t('error_title'), e.message, e); }
  };

  // ── code formatting (편집 › 문서 정렬, Shift+Alt+F): the whole document
  // through the formatter chosen for its language (settings › 정렬), the
  // first one installed by default; 'indent' only re-indents with the editor's
  // own rules, which is also the fallback when nothing is installed.
  const reindentDoc = (id) => {
    const v = viewOfDoc(id);
    if (!v) return false;
    const sel = v.state.selection;
    v.dispatch({ selection: { anchor: 0, head: v.state.doc.length } });
    indentSelection(v);
    const len = v.state.doc.length;
    v.dispatch({ selection: { anchor: Math.min(sel.main.anchor, len), head: Math.min(sel.main.head, len) } });
    return true;
  };
  const formatDoc = async (id = activeIdRef.current, { quiet = false } = {}) => {
    const doc = getDoc(id);
    const st = getState(id);
    if (!doc || !st) return false;
    const lang = doc.langName;
    const choice = (settingsRef.current.formatters || {})[lang] || 'auto';
    if (choice === 'none') { if (!quiet) setMessage(t('fmt_off', { lang })); return false; }
    if (!lang || choice === 'indent') { reindentDoc(id); if (!quiet) setMessage(t('fmt_done', { tool: t('fmt_indent') })); { const after = getState(id); if (after) setFmtCheck({ id, doc: after.doc, formatted: true }); } return true; }
    const text = st.doc.toString();
    let r;
    try {
      r = await withProgress({ title: t('prog_format'), message: t('prog_format_run'), detail: doc.name, delay: text.length > 20000 ? 0 : 160 },
        () => call('format.run', { path: doc.path || '', name: doc.name, language: lang, text, tool: choice, tabSize: settingsRef.current.tabSize, insertSpaces: settingsRef.current.insertSpaces }));
    } catch (e) { if (!quiet) setMessage(`${t('fmt_failed', { tool: lang })}: ${e.message}`); return false; }
    if (r.error) {
      if (!r.tool) { reindentDoc(id); if (!quiet) setMessage(t('fmt_none', { lang })); return true; }
      // The chosen tool is not installed: offer to install it (package manager, progress popup), then format.
      if (r.notInstalled && !quiet) {
        if (r.installable) {
          const yes = await confirm(t('inst_ask_title', { tool: r.tool }), t('inst_ask_msg', { tool: r.tool, lang }), [{ id: 'yes', label: t('inst_ask_yes'), kind: 'primary' }, { id: 'cancel', label: t('cancel') }], { icon: 'download', kind: 'info' });
          if (yes !== 'yes') return false;
          let st;
          try { st = await call('install.start', { tool: r.tool }); } catch (e) { st = { error: e.message }; }
          if (st.error) { setMessage(`${t('inst_failed', { tool: r.tool })}: ${st.error}`); return false; }
          if (st.manual) { await showError(t('inst_manual_title', { tool: r.tool }), st.manual); return false; }
          if (st.missing) { await showError(t('inst_manual_title', { tool: r.tool }), t('inst_missing_pm', { pm: st.missing, tool: r.tool })); return false; }
          const ok = await ask({ type: 'install', tool: r.tool, jobId: st.id });
          if (!ok) return false;
          try { setFmtTools(await call('format.tools', { dir: fmtDirRef.current, refresh: true })); } catch { /* the label catches up on the next listing */ }   // forget the cached "not installed"
          return formatDoc(id, { quiet });
        }
        await showError(t('inst_manual_title', { tool: r.tool }), r.hint || t('inst_no_recipe', { tool: r.tool }));
        return false;
      }
      if (!quiet) setMessage(`${t('fmt_failed', { tool: r.tool })}: ${r.error}`);
      return false;
    }
    const next = String(r.text).replace(/\r\n?/g, '\n');
    const cur = getState(id);
    if (!cur || cur.doc.toString() !== text) return false;   // edited meanwhile
    if (next !== text) {
      const main = cur.selection.main;
      const line = cur.doc.lineAt(main.head);
      const lineNo = line.number, col = main.head - line.from;
      dispatchTo(id, { changes: { from: 0, to: cur.doc.length, insert: next } });
      const after = getState(id);
      if (after) {
        const l = after.doc.line(Math.min(lineNo, after.doc.lines));
        const pos = Math.min(l.from + col, l.to);
        dispatchTo(id, { selection: { anchor: pos }, scrollIntoView: true });
      }
      scheduleLint(id, 300);
    }
    if (!quiet) setMessage(t(next === text ? 'fmt_unchanged' : 'fmt_done', { tool: r.tool }));
    { const after = getState(id); if (after) setFmtCheck({ id, doc: after.doc, formatted: true }); }
    return true;
  };

  // ── which formatter each language gets (format.tools: the tools per
  // language and whether each is installed) — for the toolbar label next to
  // the format button. Looked up for the open folder (project-local npm tools
  // first), again when settings › 정렬 rescans or installs one.
  const [fmtTools, setFmtTools] = useState(null);
  const fmtDir = folder || (activeDoc && activeDoc.path ? dirName(activeDoc.path) : '');
  const fmtDirRef = useRef(''); fmtDirRef.current = fmtDir;
  useEffect(() => {
    let live = true;
    call('format.tools', { dir: fmtDir }).then((r) => { if (live) setFmtTools(r); }).catch(() => { if (live) setFmtTools({}); });
    return () => { live = false; };
  }, [fmtDir]);

  // ── "already formatted": a moment after the last edit the active document
  // is run through its formatter (the same call as 문서 정렬, result thrown
  // away) and the format button is disabled when nothing would change. A
  // stale answer is harmless: it is keyed by the document's Text, which the
  // editor replaces on every change.
  const [fmtCheck, setFmtCheck] = useState(null);   // { id, doc: Text, formatted }
  const fmtCheckTimer = useRef(null);
  const fmtCheckRun = useRef(0);
  // Would the editor's own re-indent (the 'indent' choice and the fallback) change anything?
  const wouldReindent = (st) => {
    let changed = false;
    const all = st.update({ selection: { anchor: 0, head: st.doc.length } }).state;
    indentSelection({ state: all, dispatch: (tr) => { changed = !tr.newDoc.eq(st.doc); } });
    return changed;
  };
  const checkFormatted = async (id) => {
    const doc = getDoc(id);
    const st = getState(id);
    if (!doc || !st || st.doc.length === 0) return;
    const run = ++fmtCheckRun.current;
    const lang = doc.langName;
    const choice = (settingsRef.current.formatters || {})[lang] || 'auto';
    if (choice === 'none') return;
    if (!lang || choice === 'indent') { setFmtCheck({ id, doc: st.doc, formatted: !wouldReindent(st) }); return; }
    const text = st.doc.toString();
    let r = null;
    try { r = await call('format.run', { path: doc.path || '', name: doc.name, language: lang, text, tool: choice, tabSize: settingsRef.current.tabSize, insertSpaces: settingsRef.current.insertSpaces }); } catch { r = null; }
    if (run !== fmtCheckRun.current) return;
    let formatted = false;
    if (!r) formatted = false;
    else if (r.error) formatted = !r.tool ? !wouldReindent(st) : false;   // no tool at all → the re-indent fallback; a missing tool → the button offers to install it
    else formatted = String(r.text).replace(/\r\n?/g, '\n') === text;
    setFmtCheck({ id, doc: st.doc, formatted });
  };
  const scheduleFmtCheck = (id, delay = 800) => {
    if (fmtCheckTimer.current) clearTimeout(fmtCheckTimer.current);
    fmtCheckTimer.current = setTimeout(() => { fmtCheckTimer.current = null; if (id === activeIdRef.current) checkFormatted(id); }, delay);
  };
  // A new active document, its language or the formatter choice: check again.
  useEffect(() => { if (activeDoc) scheduleFmtCheck(activeDoc.id, 100); }, [activeDoc && activeDoc.id, activeDoc && activeDoc.langName, settings.formatters, fmtTools]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── find in files / in the open documents ──
  const searchOpenDocs = ({ query, regex, caseSensitive, wholeWord }) => {
    let re;
    try {
      let src = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`;
      re = new RegExp(src, `gu${caseSensitive ? '' : 'i'}`);
    } catch (e) { return { hits: [], error: e.message }; }
    const hits = [];
    let truncated = false;
    for (const d of docsRef.current) {
      const st = getState(d.id);
      if (!st) continue;
      const doc = st.doc;
      for (let ln = 1; ln <= doc.lines && !truncated; ln++) {
        const line = doc.line(ln);
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line.text))) {
          if (m[0] === '') { re.lastIndex++; continue; }
          hits.push({ docId: d.id, name: d.name, path: d.path, line: ln, col: m.index + 1, endCol: m.index + m[0].length + 1, text: line.text.slice(0, 240) });
          if (hits.length >= 2000) { truncated = true; break; }
        }
      }
    }
    return { hits, files: docsRef.current.length, truncated };
  };
  // A hit: open (or activate) the file and select the match.
  const openSearchHit = async (h) => {
    let doc = h.docId != null ? getDoc(h.docId) : docsRef.current.find((d) => samePath(d.path, h.path));
    if (!doc && h.path) doc = await openPath(h.path);
    if (!doc) return;
    activate(doc.id);
    setTimeout(() => {
      const v = viewOfDoc(doc.id) || viewRef.current;
      if (!v) return;
      const st = v.state;
      const ln = Math.min(Math.max(1, h.line), st.doc.lines);
      const line = st.doc.line(ln);
      const from = Math.min(line.from + Math.max(0, (h.col || 1) - 1), line.to);
      const to = Math.min(line.from + Math.max(0, (h.endCol || h.col || 1) - 1), line.to);
      v.dispatch({ selection: { anchor: from, head: Math.max(from, to) }, effects: EditorView.scrollIntoView(from, { y: 'center' }) });
      v.focus();
    }, 30);
  };
  const findInFiles = (scope) => {
    const v = viewRef.current;
    const sel = v ? v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to) : '';
    changeSettings({ sidebarVisible: true, searchVisible: true });
    setSearchRequest({ key: Date.now(), initial: sel && !sel.includes('\n') ? sel : '', scope: scope || (folderRef.current ? 'folder' : 'open') });
  };
  // The divider between the folder tree and the search section: the search
  // section takes half of the column by default; dragging changes the share.
  const sidebarColumnRef = useRef(null);
  const onSearchResizeStart = (e) => {
    e.preventDefault();
    const col = sidebarColumnRef.current;
    if (!col) return;
    const move = (ev) => { const r = col.getBoundingClientRect(); setSettings({ searchRatio: Math.max(0.15, Math.min(0.85, (r.bottom - ev.clientY) / r.height)) }); };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); call('session.save', { searchRatio: settingsRef.current.searchRatio }).catch(() => {}); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const lintAll = () => { for (const d of docsRef.current) { if (settingsRef.current.lint) scheduleLint(d.id, 50); else clearLint(d.id); } };
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
      const live = langName === 'Markdown' && settingsRef.current.mdWysiwyg ? [markdownLive, imageBase.of(cur.path ? dirName(cur.path) : folderRef.current || '')] : [];
      // Dockerfiles and Kubernetes manifests (YAML) complete their own vocabulary (lib/devops.js) on top of the grammar.
      const extra = support && support.language && (langName === 'Dockerfile' ? [support.language.data.of({ autocomplete: dockerfileCompletion })] : langName === 'YAML' ? [support.language.data.of({ autocomplete: kubernetesCompletion })] : []);
      dispatchTo(doc.id, { effects: languageEffect([support, live, extra || []]) });
      scheduleLint(doc.id, 200);
    }).catch(() => { /* a grammar failed to load: plain text */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── tabs ──
  // Makes pane `i` the active one (its view becomes viewRef, its document the active document).
  const focusPane = useCallback((i, { focus = true } = {}) => {
    const pane = panesRef.current[i];
    if (!pane) return;
    const v = paneViews.current.get(pane.key) || null;
    const changed = activePaneRef.current !== i || viewRef.current !== v;
    activePaneRef.current = i;
    setActivePaneState(i);
    viewRef.current = v;
    setView(v);
    activeIdRef.current = pane.docId;
    setActiveIdState(pane.docId);
    if (v) setCursor(cursorInfo(v.state));
    if (changed) setDocVersion((x) => x + 1);
    if (focus && v) setTimeout(() => v.focus(), 0);
    schedulePersist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activate = useCallback((id) => {
    // Shown in another pane: that pane becomes the active one.
    const pi = paneOfDoc(id);
    if (id != null && pi >= 0 && pi !== activePaneRef.current) { focusPane(pi); if (id != null) checkExternal(id); return; }
    const pane = panesRef.current[activePaneRef.current];
    const v = pane ? paneViews.current.get(pane.key) || null : null;
    const prev = pane ? pane.docId : activeIdRef.current;
    // Already shown here: the live state is in the view — never replace it with the stored copy.
    if (prev === id && v) { activeIdRef.current = id; setActiveIdState(id); setTimeout(() => v.focus(), 0); return; }
    if (v && prev != null && prev !== id && getDoc(prev)) statesRef.current.set(prev, v.state);
    if (pane) updatePanes((ps) => { ps[activePaneRef.current].docId = id; return ps; });
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

  // Shows document `id` in pane `i` (moving it there if another pane had it).
  const showInPane = (i, id) => {
    const from = paneOfDoc(id);
    if (from === i) { focusPane(i); return; }
    if (from >= 0) { const fv = paneViews.current.get(panesRef.current[from].key); if (fv) statesRef.current.set(id, fv.state); updatePanes((ps) => { ps[from].docId = null; return ps; }); if (fv) fv.setState(newDocState('')); }
    focusPane(i, { focus: false });
    activate(id);
  };

  // The layout: 'none' (one pane) · 'cols' · 'rows' · 'grid' (2 × 2). New
  // panes take documents not shown elsewhere; removed panes hand theirs back.
  // mode: none · cols · rows · grid (the View menu) · multi (the toolbar button: n panes in a balanced grid, 2‥9)
  const setSplit = (mode, n) => {
    const count = mode === 'grid' ? 4 : mode === 'multi' ? Math.max(2, Math.min(9, n || 2)) : mode === 'cols' || mode === 'rows' ? 2 : 1;
    const cur = panesRef.current;
    if (count > cur.length) {
      const shown = new Set(cur.map((p) => p.docId));
      const free = docsRef.current.map((d) => d.id).filter((id) => !shown.has(id));
      const next = cur.map((p) => ({ ...p }));
      while (next.length < count) { const id = free.shift(); next.push({ key: paneKeyRef.current++, docId: id == null ? null : id }); }
      panesRef.current = next;
      setPanes(next);
    } else if (count < cur.length) {
      // Keep the panes that show something (the active one first), drop the rest.
      const active = cur[activePaneRef.current];
      const ordered = [...cur.filter((p) => p.docId != null && p === active), ...cur.filter((p) => p.docId != null && p !== active), ...cur.filter((p) => p.docId == null)];
      const keep = new Set(ordered.slice(0, count));
      const next = cur.filter((p) => keep.has(p)).map((p) => ({ ...p }));
      for (const p of cur) { if (keep.has(p)) continue; const v = paneViews.current.get(p.key); if (v && p.docId != null && getDoc(p.docId)) statesRef.current.set(p.docId, v.state); }
      panesRef.current = next;
      setPanes(next);
      const ai = next.findIndex((p) => p.key === active.key);
      focusPane(ai >= 0 ? ai : 0, { focus: false });
    }
    if (mode === 'multi') { const g = multiGrid(count); changeSettings({ split: mode, paneCount: count, colFracs: Array(g.cols).fill(1 / g.cols), rowFracs: Array(g.rows).fill(1 / g.rows) }); }
    else changeSettings({ split: mode });
  };
  // The × of a pane showing a document: the document is closed (asking about unsaved changes first) and the
  // pane goes with it — the remaining panes are laid out afresh.
  const closePaneAndDoc = async (i) => {
    const pane = panesRef.current[i];
    if (!pane) return;
    if (pane.docId != null) { if (!(await closeDocs([pane.docId]))) return; }
    const j = panesRef.current.findIndex((p) => p.key === pane.key);
    if (j >= 0 && panesRef.current.length > 1) closePane(j);
    collapseEmpty();   // a pane that showed the closed document (or was empty already) goes too
  };
  // Closes one pane of a split (an empty one, from its "닫기"): the others stay as they are; the
  // layout follows the count — one pane left → no split, two → columns, three → the grid with the last spanning.
  const closePane = (i) => {
    const cur = panesRef.current;
    if (cur.length < 2 || !cur[i]) return;
    const gone = cur[i];
    const v = paneViews.current.get(gone.key);
    if (v && gone.docId != null && getDoc(gone.docId)) statesRef.current.set(gone.docId, v.state);
    const next = cur.filter((_, j) => j !== i).map((p) => ({ ...p }));
    panesRef.current = next;
    setPanes(next);
    const st = settingsRef.current;
    const mode = next.length === 1 ? 'none' : st.split === 'multi' ? 'multi' : next.length === 2 ? (st.split === 'rows' ? 'rows' : 'cols') : 'grid';
    const ai = Math.min(activePaneRef.current <= i ? activePaneRef.current : activePaneRef.current - 1, next.length - 1);
    focusPane(Math.max(0, ai), { focus: false });
    if (mode === 'multi') { const g = multiGrid(next.length); changeSettings({ split: mode, paneCount: next.length, colFracs: Array(g.cols).fill(1 / g.cols), rowFracs: Array(g.rows).fill(1 / g.rows) }); }
    else changeSettings({ split: mode });
  };
  const nextPane = () => { const n = panesRef.current.length; if (n > 1) focusPane((activePaneRef.current + 1) % n); };

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
    const dl = settingsRef.current.defaultLanguage;   // settings › general › files: the language a new document starts with
    return addDoc({ untitledNo: n, name: t('untitled', { n }), ...(dl && dl !== 'auto' ? { language: dl } : {}), ...opts.meta }, text, opts);
  };

  const removeDocs = (ids) => {
    const set = new Set(ids);
    const remaining = docsRef.current.filter((d) => !set.has(d.id));
    const idx = docsRef.current.findIndex((d) => d.id === activeIdRef.current);
    for (const id of ids) { statesRef.current.delete(id); savedRef.current.delete(id); checkedRef.current.delete(id); hexRef.current.delete(id); }
    setDocs(remaining);
    // Other panes showing a removed document get one nobody shows, or go empty.
    const shown = new Set(panesRef.current.map((p) => p.docId));
    const free = remaining.map((d) => d.id).filter((id) => !shown.has(id));
    updatePanes((ps) => {
      ps.forEach((p, i) => {
        if (!set.has(p.docId) || i === activePaneRef.current) return;
        const id = free.shift();
        p.docId = id == null ? null : id;
        const v = paneViews.current.get(p.key);
        if (v) { const st = id != null ? statesRef.current.get(id) : null; v.setState(st || newDocState('')); }
      });
      return ps;
    });
    if (set.has(activeIdRef.current)) {
      const elsewhere = new Set(panesRef.current.map((p, i) => (i === activePaneRef.current ? null : p.docId)));
      const candidates = remaining.filter((d) => !elsewhere.has(d.id));
      const next = candidates[Math.min(idx, candidates.length - 1)] || candidates[candidates.length - 1];
      activeIdRef.current = null;
      updatePanes((ps) => { ps[activePaneRef.current].docId = null; return ps; });
      if (next) activate(next.id);
      else if (!remaining.length) { setActiveIdState(null); newUntitled(); }
      else { const v = viewRef.current; if (v) v.setState(newDocState('')); setActiveIdState(null); setDocVersion((x) => x + 1); }
      if (panesRef.current.length > 1 && panesRef.current.some((p) => p.docId == null)) setTimeout(() => collapseEmpty(), 0);
    } else { schedulePersist(); if (panesRef.current.length > 1 && panesRef.current.some((p) => p.docId == null)) setTimeout(() => collapseEmpty(), 0); }
  };
  // Panes left with nothing to show go away (the last one stays): the remaining panes are laid out afresh —
  // one → no split, otherwise the layout for their number (closePane).
  const collapseEmpty = () => {
    for (let i = panesRef.current.length - 1; i >= 0 && panesRef.current.length > 1; i--) if (panesRef.current[i].docId == null) closePane(i);
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
    const name = baseName(p);
    const MAX_TEXT = 64 * 1024 * 1024;
    let err = null;
    const doc = await withProgress({ title: t('prog_open'), message: t('prog_open_file'), detail: name, delay: 180 }, async ({ report }) => {
      try {
        if (!force && !encoding && isBinaryImageName(name)) {
          report({ message: t('prog_hex') });
          return await openHex(p, { activateIt });
        }
        if (!force && !encoding) {
          report({ message: t('prog_sniff') });
          let s = null;
          try { s = await call('file.sniff', { path: p }); } catch { s = null; }
          if (s && s.binary) { report({ message: t('prog_hex') }); return await openHex(p, { activateIt }); }
          if (s && s.size > MAX_TEXT) { err = { code: 'ETOOBIG', name }; return null; }
        }
        report({ message: t('prog_read') });
        const r = await call('file.read', { path: p, encoding: encoding || (force ? 'utf8' : null), defaultEol: settingsRef.current.defaultEol });
        if (!existing) existing = docsRef.current.find((d) => samePath(d.path, r.path));
        if (existing && !encoding) { if (activateIt) activate(existing.id); return existing; }
        report({ message: t('prog_prepare'), value: 0.85 });
        await yieldToUi();
        if (existing) {
          const state = newDocState(r.text, { selection: { anchor: 0 } });
          putState(existing.id, state);
          savedRef.current.set(existing.id, state.doc);
          patchDoc(existing.id, { encoding: r.encoding, eol: r.eol, dirty: false, mtime: r.mtime, size: r.size, readonly: r.readonly, missing: false });
          if (activateIt) activate(existing.id);
          setCursor(cursorInfo(state));
          return existing;
        }
        const opened = addDoc({ path: r.path, name: r.name, encoding: r.encoding, eol: r.eol, mtime: r.mtime, size: r.size, readonly: r.readonly }, r.text, { activateIt });
        call('recent.touch', { path: r.path }).then(setRecent).catch(() => {});
        setMessage(t('opened', { name: r.name }));
        return opened;
      } catch (e) {
        err = e;
        if (e.code === 'ETOOBIG') {
          let s = null;
          try { s = await call('file.sniff', { path: p }); } catch { s = null; }
          if (s && s.binary && !force) return openHex(p, { activateIt });
        } else if (e.code === 'EBINARY' && !force) return openHex(p, { activateIt });
        return null;
      }
    });
    if (doc) return doc;
    if (err) {
      if (err.code === 'ETOOBIG') await showError(t('too_big_title'), t('too_big_msg', { name }), err);
      else {
        if (err.code === 'ENOENT') call('recent.remove', { path: p }).then(setRecent).catch(() => {});
        await showError(t('error_title'), t('open_failed', { name }), err);
      }
    }
    return null;
  };

  // A file that is not text: a binary picture (PNG · JPEG · GIF · WebP · AVIF · BMP · ICO · HEIC · HEIF · DCM) fills the
  // pane as the image itself (Hexa opens a hex dump beside it); anything
  // else is a hex dump (components/HexView.jsx) in a read-only document whose
  // editor state stays empty. The hex view fetches the bytes it shows through
  // file.readRange (hexRef holds the reader), so the file's size does not
  // matter. "텍스트로 열기" in its header reopens it as text.
  const decodeBase64 = (b64) => { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
  const hexReader = (path) => async (offset, length) => decodeBase64((await call('file.readRange', { path, offset, length })).base64);
  const ensureHexReader = (doc) => {
    if (!doc || !doc.path) return null;
    let read = hexRef.current.get(doc.id);
    if (!read) { read = hexReader(doc.path); hexRef.current.set(doc.id, read); }
    return read;
  };
  const openHex = async (p, { activateIt = true } = {}) => {
    try {
      const r = await call('file.readRange', { path: p, offset: 0, length: 0 });   // the resolved path, size and mtime
      const existing = docsRef.current.find((d) => samePath(d.path, r.path));
      if (existing) {
        ensureHexReader(existing);
        if (activateIt) activate(existing.id);
        return existing;
      }
      const id = nextDocId;   // addDoc takes the next id: the reader must be there before the first render
      const image = isBinaryImageName(r.name);   // PNG · JPEG · GIF · WebP · AVIF · BMP · ICO · HEIC · HEIF · DCM: the picture fills the pane; Hexa shows the bytes beside it
      hexRef.current.set(id, hexReader(r.path));
      const doc = addDoc({ path: r.path, name: r.name, kind: 'hex', language: PLAIN, mtime: r.mtime, size: r.size, readonly: true, imageHex: false }, '', { activateIt });
      call('recent.touch', { path: r.path }).then(setRecent).catch(() => {});
      setMessage(t(image ? 'img_opened' : 'hex_opened', { name: r.name }));
      return doc;
    } catch (e) {
      await showError(t('error_title'), t('open_failed', { name: baseName(p) }), e);
      return null;
    }
  };
  const hexAsText = async (id) => {
    const doc = getDoc(id);
    if (!doc || !doc.path) return;
    removeDocs([id]);
    await openPath(doc.path, { force: true });
  };

  const openFiles = async (paths) => {
    const run = async (report) => {
      let last = null;
      for (let i = 0; i < paths.length; i++) {
        if (report) report({ message: t('prog_open_file'), detail: baseName(paths[i]), value: paths.length ? i / paths.length : 0 });
        const d = await openPath(paths[i], { activateIt: false });
        if (d) last = d;
      }
      if (last) activate(last.id);
    };
    if (paths.length > 1) await withProgress({ title: t('prog_open'), message: t('prog_open_file'), delay: 0 }, ({ report }) => run(report));
    else await run();
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
    if (doc.kind === 'hex') { setMessage(t('hex_readonly')); return false; }
    let target = doc.path;
    if (as || !target) {
      const f = folderRef.current, sep = (infoRef.current && infoRef.current.sep) || '/';
      const p = await nativeDialog('save', { defaultPath: doc.path || (f ? `${f}${sep}${doc.name}` : undefined), name: doc.name });
      if (!p) return false;
      target = p;
    }
    const enc = encoding || doc.encoding;
    if (settingsRef.current.formatOnSave) await formatDoc(id, { quiet: true });
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
      // The line ending written: the document's own, or the one the settings force on every save (settings › files).
      const policy = settingsRef.current.eolOnSave;
      const eol = policy === 'lf' || policy === 'crlf' ? policy : doc.eol;
      const r = await withProgress({ title: t('prog_save'), message: t('prog_save_file'), detail: baseName(target), delay: text.length > 200000 ? 0 : 200 },
        () => call('file.write', { path: target, text, encoding: enc, eol, force }));
      const nowState = getState(id);
      savedRef.current.set(id, nowState.doc);
      const renamed = !samePath(doc.path, r.path);
      patchDoc(id, { path: r.path, name: r.name, encoding: enc, eol, dirty: false, mtime: r.mtime, size: r.size, readonly: false, missing: false });
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
    const ok = await withProgress({ title: t('prog_save'), message: t('prog_save_all'), delay: dirty.length > 1 ? 0 : 200 }, async ({ report }) => {
      for (let i = 0; i < dirty.length; i++) {
        report({ message: t('prog_save_file'), detail: dirty[i].name, value: i / dirty.length });
        if (!(await saveDoc(dirty[i].id))) return false;
      }
      return true;
    });
    if (ok) setMessage(t('all_saved'));
    return !!ok;
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
    if (doc.kind === 'hex') {
      try { const r = await call('file.readRange', { path: doc.path, offset: 0, length: 0 }); patchDoc(id, { mtime: r.mtime, size: r.size, readonly: true, dirty: false, missing: false }); checkedRef.current.set(id, Date.now()); }   // the view refetches: its cache is keyed by mtime / size
      catch (e) { await showError(t('error_title'), t('open_failed', { name: doc.name }), e); }
      return;
    }
    try {
      const r = await withProgress({ title: t('prog_open'), message: t('prog_read'), detail: doc.name, delay: 160 },
        () => call('file.read', { path: doc.path, encoding: encoding || doc.encoding, defaultEol: settingsRef.current.defaultEol }));
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
      if (cur.kind !== 'hex' && cur.readonly !== st.readonly) { patchDoc(id, { readonly: st.readonly }); dispatchTo(id, { effects: readOnlyEffect(st.readonly) }); }
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
      if (d.kind === 'hex') { tab.kind = 'hex'; tab.imageHex = !!d.imageHex; }
      if (d.dirty && s && s.doc.length <= 512 * 1024) tab.draft = s.doc.toString();
      return tab;
    });
    const activeTab = docsRef.current.findIndex((d) => d.id === activeIdRef.current);
    const paneDocs = panesRef.current.map((p) => docsRef.current.findIndex((d) => d.id === p.docId));
    call('session.save', { tabs, activeTab: Math.max(0, activeTab), folder: folderRef.current, sidebarWidth: sidebarWidthRef.current, paneDocs, activePane: activePaneRef.current }).catch(() => {});
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
      setCustomThemes(s.customThemes);
      applyTheme(s.theme);
      setRecent(Array.isArray(session.recent) ? session.recent : []);
      setUserWords(Array.isArray(session.userWords) ? session.userWords : []);
      setSpellOptions({ codeAll: !!s.spellCodeAll });
      setSidebarWidth(session.sidebarWidth || 240);
      if (session.folder) { try { await call('file.stat', { path: session.folder }); setFolder(session.folder); } catch { /* folder gone: start without one */ } }
      // Restore the tabs (files are re-read; unsaved drafts come back dirty).
      // A file that no longer exists is not restored: its tab is dropped, or —
      // when it had unsaved changes — those come back in a new untitled document
      // so nothing is lost. With nothing to restore the editor starts with a new
      // empty document.
      const tabs = s.restoreSession && Array.isArray(session.tabs) ? session.tabs : [];
      let restored = 0;
      const seen = new Set();
      await withProgress({ title: t('prog_restore'), message: t('prog_restore_file'), delay: tabs.length > 1 ? 0 : 400 }, async ({ report }) => {
        for (let i = 0; i < tabs.length; i++) {
          const tab = tabs[i];
          if (!tab) continue;
          if (tab.path) { const k = pathKey(tab.path); if (seen.has(k)) continue; seen.add(k); }
          report({ detail: tab.path || tab.name || '', value: tabs.length ? i / tabs.length : 0 });
          try {
            if (tab.path) {
              // Same path as File › Open (`openPath`): a raster goes to openHex
              // (picture fill). Do not file.read with the tab's encoding — that
              // skips the binary sniff and pastes the bytes into the editor.
              if (restoreAsPicture(tab)) {
                const hex = await openPath(tab.path, { activateIt: false });
                if (hex) {
                  if (tab.imageHex) patchDoc(hex.id, { imageHex: true });
                  restored++;
                  continue;
                }
              }
              let r = null;
              let readErr = null;
              try { r = await call('file.read', { path: tab.path, encoding: tab.encoding || null, defaultEol: s.defaultEol }); } catch (e) { readErr = e; }
              if (!r && readErr && (readErr.code === 'EBINARY' || readErr.code === 'ETOOBIG') && !tab.draft) {
                const hex = await openPath(tab.path, { activateIt: false });
                if (hex) { restored++; continue; }
              }
              if (r) {
                const hasDraft = typeof tab.draft === 'string';
                addDoc({ path: r.path, name: r.name, encoding: r.encoding, eol: tab.eol || r.eol, language: tab.language || null, mtime: r.mtime, size: r.size, readonly: r.readonly, savedText: hasDraft ? r.text : undefined }, hasDraft ? tab.draft : r.text, { activateIt: false, dirty: hasDraft && tab.draft !== r.text, selection: tab.cursor });
                restored++;
              } else if (typeof tab.draft === 'string' && tab.draft.trim()) {
                newUntitled(tab.draft, { activateIt: false, dirty: true, selection: tab.cursor, meta: { encoding: tab.encoding || s.defaultEncoding, eol: tab.eol || s.defaultEol, language: tab.language || null } });
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
      });
      if (cancelled) return;
      if (!restored) newUntitled('', { activateIt: false });
      const list = docsRef.current;
      const idx = Math.min(Math.max(0, session.activeTab || 0), list.length - 1);
      activate(list[idx].id);
      // The split layout and what each pane showed.
      const mode = s.split || 'none';
      if (mode !== 'none' && Array.isArray(session.paneDocs)) {
        const count = mode === 'grid' ? 4 : mode === 'multi' ? Math.max(2, Math.min(9, s.paneCount || 2)) : 2;
        const used = new Set([list[idx].id]);
        const next = [{ key: panesRef.current[0].key, docId: list[idx].id }];
        for (let i = 1; i < count; i++) {
          let d = list[session.paneDocs[i]];
          if (!d || used.has(d.id)) d = list.find((x) => !used.has(x.id));
          if (d) used.add(d.id);
          next.push({ key: paneKeyRef.current++, docId: d ? d.id : null });
        }
        panesRef.current = next;
        setPanes(next);
        const ap = Math.min(Math.max(0, session.activePane || 0), count - 1);
        if (ap !== 0) setTimeout(() => focusPane(ap), 50);
      }
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
  // Settings changed in a separate window (settings popup): apply, don't save again, don't echo back.
  useEffect(() => onSettingsPatch((patch) => {
    // The settings window looked the formatters up again (다시 찾기 / an install): take the backend's new list for the toolbar label.
    if (patch.formatToolsAt) { call('format.tools', { dir: fmtDirRef.current }).then(setFmtTools).catch(() => {}); return; }
    if (patch.settingsTab) return;   // a note for the settings window only (which tab to show)
    changeSettings(patch, { fromRemote: true });
  }), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const changeSettings = (patch, { fromRemote = false } = {}) => {
    const next = setSettings(patch);
    if (patch.language !== undefined) { setLanguage(next.language); setDocs((ds) => ds.map((d) => (d.path ? d : { ...d, name: t('untitled', { n: d.untitledNo }) }))); }
    if (patch.customThemes !== undefined) setCustomThemes(next.customThemes);
    if (patch.theme !== undefined || patch.customThemes !== undefined) { const th = applyTheme(next.theme); call('session.save', { themeBg: th.tokens['--bg'] }).catch(() => {}); }
    const editorKeys = ['tabSize', 'insertSpaces', 'wordWrap', 'lineNumbers', 'showWhitespace', 'highlightActiveLine', 'autoCloseBrackets', 'bracketMatching', 'foldGutter', 'spellCheck', 'autoIndent', 'lint', 'autocomplete'];
    if (editorKeys.some((k) => patch[k] !== undefined)) {
      const effects = settingsEffects(next);
      if (viewRef.current) viewRef.current.dispatch({ effects });
      for (const [id, s] of statesRef.current) if (id !== activeIdRef.current) statesRef.current.set(id, s.update({ effects: settingsEffects(next) }).state);
    }
    if (patch.mdWysiwyg !== undefined) for (const d of docsRef.current) if (d.langName === 'Markdown') applyLanguage(d);
    if (patch.spellCodeAll !== undefined) { setSpellOptions({ codeAll: !!next.spellCodeAll }); spellRefreshAll([viewRef.current]); }
    if (patch.lint !== undefined || patch.linters !== undefined) lintAll();
    if (!fromRemote) { call('session.save', patch).catch(() => {}); sendSettingsPatch(patch); }
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
  // Images dropped on a Markdown document are embedded as data URLs (any
  // other file is opened as a document).
  const insertImages = async (files, pos) => {
    const v = viewRef.current;
    if (!v) return false;
    const parts = [];
    for (const f of files) {
      if (f.size > 16 * 1024 * 1024) continue;
      try { parts.push(`![${f.name.replace(/\.[^.]+$/, '').replace(/[\[\]]/g, '')}](${await fileToDataUrl(f)})`); } catch { /* unreadable */ }
    }
    if (!parts.length) return false;
    const at = typeof pos === 'number' ? pos : v.state.selection.main.head;
    const line = v.state.doc.lineAt(at);
    const insert = (at > line.from ? '\n' : '') + parts.join('\n') + '\n';
    v.dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length }, scrollIntoView: true });
    v.focus();
    return true;
  };
  const dropFiles = async (files, pos) => {
    const cur = getDoc(activeIdRef.current);
    if (cur && cur.langName === 'Markdown' && files.length && files.every(isImageFile) && await insertImages(files, pos)) return;
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
    if (id.startsWith('recentRemove:')) { call('recent.remove', { path: id.slice(13) }).then(setRecent).catch(() => {}); return; }   // the × on a recent-files entry (the menu stays open)
    if (id.startsWith('recent:')) return openPath(id.slice(7));
    if (id.startsWith('formatter:')) { const d = getDoc(activeIdRef.current); if (d && d.langName) changeSettings({ formatters: { ...(settingsRef.current.formatters || {}), [d.langName]: id.slice(10) } }); return; }   // the toolbar picker next to 문서 정렬
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
    if (id === 'termSettings') { if (!openPopup('settings', 'terminal')) setDialog({ type: 'settings', tab: 'terminal' }); else sendSettingsPatch({ settingsTab: 'terminal' }); return undefined; }   // ⚙ in the terminal header: settings on the terminal tab (prompt, line endings)
    if (id === 'togglePreview') { const d = getDoc(activeIdRef.current); if (d && isSvgName(d.name)) toggleSetting('imagePreview'); else if (d && isBinaryImageName(d.name)) return undefined; else if (d && d.langName === 'HTML') toggleSetting('htmlPreview'); else if (d && d.langName === 'Markdown') toggleSetting('mdPreview'); return undefined; }   // Ctrl+Shift+M: the preview pane (SVG / HTML / Markdown). A binary image is the picture itself.
    if (id === 'toggleImageHex') {
      const d = getDoc(typeof arg === 'number' ? arg : activeIdRef.current);
      if (d && d.kind === 'hex' && isBinaryImageName(d.name)) {
        ensureHexReader(d);
        patchDoc(d.id, { imageHex: !d.imageHex });
      }
      return undefined;
    }   // a picture file: Hexa opens the bytes beside the image
    if (id === 'toggle:termVisible') id = 'toggleTerminal';
    if (id === 'toggleTerminal') {
      const on = !settingsRef.current.termVisible;
      const patch = { termVisible: on };
      if (on && settingsRef.current.termHeight === 75) patch.termHeight = SETTINGS_DEFAULTS.termHeight;
      changeSettings(patch);
      if (on && !terms.length) newTerminal();
      return undefined;
    }
    if (id.startsWith('svg:')) return withView((vw) => insertSvgTag(vw, id.slice(4)));   // the SVG bar: an element at the cursor
    if (id.startsWith('md:heading:')) return withView((vw) => md.heading(vw, Number(id.slice(11))));
    if (id === 'md:image') { setDialog({ type: 'mdImage' }); return undefined; }
    if (id.startsWith('split:')) { setSplit(id.slice(6)); return undefined; }
    if (id === 'toggleStructure') { const d = getDoc(activeIdRef.current); if (d && isBinaryImageName(d.name)) return undefined; toggleSetting(d && d.langName === 'Markdown' ? 'mdOutline' : 'minimap'); return undefined; }   // toolbar: the minimap, or a Markdown document's structure panel — not for a raster image (PNG · JPEG · GIF · WebP · AVIF · BMP · ICO). SVG is a text document.
    // The toolbar's split button (and Ctrl+\) steps through the layouts: one → left / right → top / bottom → four → one.
    if (id === 'toggleSplit') { const st = settingsRef.current; setSplit('multi', st.split === 'multi' ? Math.min(9, (st.paneCount || 2) + 1) : 2); return undefined; }   // one more pane per press
    if (id === 'nextPane') { nextPane(); return undefined; }
    if (id === 'lintPanel') return withView((vw) => openLintPanel(vw));
    if (id === 'lintNext') return withView((vw) => nextDiagnostic(vw));
    if (id === 'lintNow') { if (v && activeIdRef.current != null) runLint(activeIdRef.current); return undefined; }
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
      case 'formatDoc': await formatDoc(typeof arg === 'number' ? arg : activeIdRef.current); break;
      case 'print': await printDoc(typeof arg === 'number' ? arg : activeIdRef.current); break;
      case 'insertPath': { const d = getDoc(cur); if (d && d.path) withView((vw) => commands.insertText(vw, d.path)); break; }
      case 'foldAll': withView(commands.foldAll); break;
      case 'unfoldAll': withView(commands.unfoldAll); break;
      // search
      case 'find': case 'replace': {
        if (getDoc(activeIdRef.current) && getDoc(activeIdRef.current).kind === 'hex') break;   // a hex dump / a picture: nothing to search
        const sel = v ? v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to) : '';
        setFind({ mode: id, initial: sel && !sel.includes('\n') ? sel : (findRef.current ? findRef.current.initial : ''), key: Date.now() });
        break;
      }
      case 'findInFiles': findInFiles('folder'); break;
      case 'findInOpen': findInFiles('open'); break;
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
      case 'settings': case 'about': case 'shortcuts': if (!openPopup(id)) setDialog({ type: id }); break;
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
    const cwd = settingsRef.current.termCwd || folderRef.current || (doc && doc.path ? dirName(doc.path) : undefined);
    try {
      const r = await call('term.create', { cwd, shell: shell || settingsRef.current.termShell || undefined });
      const tm = { id: r.id, title: `${r.label} ${termNo.current++}`, shell: r.shell, cwd: r.cwd, buffer: [], seq: 0 };
      setTerms((ts) => [...ts, tm]);
      setActiveTerm(r.id);
      if (!settingsRef.current.termVisible) {
        const patch = { termVisible: true };
        if (settingsRef.current.termHeight === 75) patch.termHeight = SETTINGS_DEFAULTS.termHeight;
        changeSettings(patch);
      }
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
    const move = (ev) => setSettings({ termHeight: Math.max(75, Math.min(window.innerHeight - 200, h0 + (y0 - ev.clientY))) });
    document.body.classList.add('dragging', 'dragging-y');
    const up = () => { document.body.classList.remove('dragging', 'dragging-y'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); call('session.save', { termHeight: settingsRef.current.termHeight }).catch(() => {}); };
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
      else if (mod && e.shiftKey && k === 'm') action('togglePreview');
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
      else if (mod && !e.shiftKey && !e.altKey && k === 'f') action('find');
      else if (mod && e.shiftKey && k === 'f') action('findInFiles');
      else if (mod && e.altKey && k === 'f') action('findInOpen');
      else if (mod && !e.shiftKey && k === 'h') action('replace');
      else if (e.key === 'F3') action(e.shiftKey ? 'findPrev' : 'findNext');
      else if (mod && !e.shiftKey && k === 'g') action('gotoLine');
      else if (mod && !e.shiftKey && k === 'b') action('toggle:sidebarVisible');
      else if (mod && (e.key === '=' || e.key === '+')) action('zoomIn');
      else if (mod && e.key === '-') action('zoomOut');
      else if (mod && e.key === '0') action('zoomReset');
      else if (e.key === 'F11') action('fullscreen');
      else if (e.key === 'F7') action('toggle:spellCheck');
      else if (e.key === 'F8') action('lintNext');
      else if (e.altKey && e.shiftKey && !mod && (e.key === 'F' || e.key === 'f')) action('formatDoc');
      else if (mod && !e.shiftKey && !e.altKey && k === 'p') action('print');
      else if (mod && !e.shiftKey && e.key === '\\') action(settingsRef.current.split === 'none' ? 'split:cols' : 'split:none');
      else if (mod && e.altKey && /^[1-4]$/.test(e.key)) action(`split:${['none', 'cols', 'rows', 'grid'][Number(e.key) - 1]}`);
      else if (e.key === 'F6' && !e.shiftKey && !mod) action('nextPane');
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
    const h = (e) => {
      if (!(isMac ? e.metaKey : e.ctrlKey) || !e.target.closest) return;
      if (e.target.closest('.image-preview')) return;   // the picture zooms itself (Ctrl+wheel)
      if (e.target.closest('.editor-pane')) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1 : -1); }
    };
    window.addEventListener('wheel', h, { passive: false });
    return () => window.removeEventListener('wheel', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── menus ──
  const sc = (win, mac) => (isMac ? (mac || win.replace('Ctrl', '⌘')) : win);
  const cur = activeDoc;
  // 문서 정렬 (toolbar button + menu item): the formatter the active document
  // gets, and whether there is anything for it to do.
  const curState = cur ? getState(cur.id) : null;
  const fmtInfo = cur && cur.kind !== 'hex' ? resolveFormatter({ lang: cur.langName, settings, tools: fmtTools }) : null;
  const fmtEmpty = !curState || curState.doc.length === 0;
  const fmtDone = !!(fmtCheck && cur && curState && fmtCheck.id === cur.id && fmtCheck.doc === curState.doc && fmtCheck.formatted);
  const canFormat = !!cur && !fmtEmpty && !(fmtInfo && fmtInfo.off) && !fmtDone;
  const formatTip = !cur ? null : fmtEmpty ? t('tip_format_empty') : fmtInfo && fmtInfo.off ? t('tip_formatter_off') : fmtDone ? t('tip_format_done', { tool: fmtInfo.label }) : null;
  // The choices for the document's language (as in settings › 정렬): auto, each tool, editor re-indent, off.
  const formatterItems = cur && cur.langName ? () => {
    const lang = cur.langName;
    const choice = (settings.formatters || {})[lang] || 'auto';
    const list = (fmtTools || {})[lang] || [];
    const first = list.find((x) => x.available);
    return [
      { header: t('set_format_for', { lang }) },
      { id: 'formatter:auto', label: t('fmt_auto', { tool: first ? toolLabel(first) : t('fmt_indent') }), checked: choice === 'auto', radio: true },
      ...list.map((x) => ({ id: `formatter:${x.id}`, label: toolLabel(x), meta: x.available ? '' : (x.installable ? t('fmt_not_installed_auto') : t('fmt_not_installed_manual')), checked: choice === x.id, radio: true })),
      { id: 'formatter:indent', label: t('fmt_indent'), checked: choice === 'indent', radio: true },
      { id: 'formatter:none', label: t('fmt_none_opt'), checked: choice === 'none', radio: true },
    ];
  } : null;
  const menus = [
    { id: 'file', label: t('m_file'), labelKey: 'm_file', icon: 'folder', items: () => [
      { id: 'new', label: t('new_file'), icon: 'filePlus', shortcut: sc('Ctrl+N') },
      { id: 'open', label: t('open_file'), icon: 'fileOpen', shortcut: sc('Ctrl+O') },
      { id: 'openFolder', label: t('open_folder'), icon: 'folderOpen', shortcut: sc('Ctrl+Shift+O') },
      ...(folder ? [{ id: 'closeFolder', label: t('close_folder'), icon: 'close' }] : []),
      { sep: true },
      { id: 'save', label: t('save'), icon: 'fileSave', shortcut: sc('Ctrl+S'), disabled: !cur },
      { id: 'saveAs', label: t('save_as'), icon: 'fileSave', shortcut: sc('Ctrl+Alt+S'), disabled: !cur },
      { id: 'saveAll', label: t('save_all'), icon: 'saveAll', shortcut: sc('Ctrl+Shift+S'), disabled: !docs.some((d) => d.dirty) },
      { id: 'reload', label: t('reload'), icon: 'reload', disabled: !cur || !cur.path },
      { sep: true },
      { id: 'print', label: t('print'), icon: 'print', shortcut: sc('Ctrl+P'), disabled: !cur },
      { sep: true },
      { id: 'close', label: t('close'), icon: 'close', shortcut: sc('Ctrl+W'), disabled: !cur },
      { id: 'closeAll', icon: 'closeAll', label: t('close_all'), shortcut: sc('Ctrl+Shift+W'), disabled: !docs.length },
      { id: 'closeOthers', icon: 'closeOthers', label: t('close_others'), disabled: docs.length < 2 },
      { sep: true },
      { id: 'reveal', label: t('reveal'), icon: 'explorer', disabled: !cur || !cur.path || !isElectron },
      { id: 'openWith', label: t('open_with'), icon: 'open', disabled: !cur || !cur.path || !isElectron },
      { id: 'copyPath', label: t('copy_path'), icon: 'copy', disabled: !cur || !cur.path },
      { sep: true },
      { header: t('recent') },
      ...(recent.length ? recent.slice(0, 10).map((p) => ({ id: `recent:${p}`, label: baseName(p), meta: dirName(p), icon: 'clock', remove: `recentRemove:${p}`, removeTip: t('recent_remove') })) : [{ id: 'recentNone', icon: 'clock', label: t('recent_empty'), disabled: true }]),
      ...(recent.length ? [{ id: 'recentClear', label: t('recent_clear'), icon: 'eraser' }] : []),
      { sep: true },
      { id: 'exit', icon: 'exit', label: t('exit'), shortcut: isMac ? '⌘Q' : 'Alt+F4' },
    ] },
    { id: 'edit', label: t('m_edit'), labelKey: 'm_edit', icon: 'edit', items: () => [
      { id: 'undo', label: t('undo'), icon: 'undo', shortcut: sc('Ctrl+Z') },
      { id: 'redo', label: t('redo'), icon: 'redo', shortcut: sc('Ctrl+Y') },
      { sep: true },
      { id: 'cut', label: t('cut'), icon: 'cut', shortcut: sc('Ctrl+X') },
      { id: 'copy', label: t('copy'), icon: 'copy', shortcut: sc('Ctrl+C') },
      { id: 'paste', label: t('paste'), icon: 'paste', shortcut: sc('Ctrl+V') },
      { id: 'delete', label: t('delete'), icon: 'delete', shortcut: 'Del' },
      { id: 'selectAll', icon: 'selectAll', label: t('select_all'), shortcut: sc('Ctrl+A') },
      { sep: true },
      { id: 'dupLine', icon: 'dupLine', label: t('dup_line'), shortcut: sc('Ctrl+D') },
      { id: 'delLine', icon: 'delLine', label: t('del_line'), shortcut: sc('Ctrl+L') },
      { id: 'moveUp', label: t('move_up'), icon: 'arrowUp', shortcut: 'Alt+↑' },
      { id: 'moveDown', label: t('move_down'), icon: 'arrowDown', shortcut: 'Alt+↓' },
      { id: 'toggleComment', icon: 'comment', label: t('toggle_comment'), shortcut: sc('Ctrl+/') },
      { id: 'indent', icon: 'indent', label: t('indent'), shortcut: 'Tab' },
      { id: 'outdent', icon: 'outdent', label: t('outdent'), shortcut: 'Shift+Tab' },
      { sep: true },
      { id: 'upper', icon: 'upper', label: t('upper'), shortcut: sc('Ctrl+Shift+U') },
      { id: 'lower', icon: 'lower', label: t('lower'), shortcut: sc('Ctrl+U') },
      { id: 'sortAsc', label: t('sort_asc'), icon: 'sortAsc' },
      { id: 'sortDesc', icon: 'sortDesc', label: t('sort_desc') },
      { id: 'trimWs', icon: 'trimWs', label: t('trim_ws') },
      { id: 'removeEmpty', icon: 'removeEmpty', label: t('remove_empty') },
      { id: 'removeDup', icon: 'removeDup', label: t('remove_dup') },
      { sep: true },
      { id: 'formatDoc', label: t('format_doc'), icon: 'format', shortcut: 'Shift+Alt+F', disabled: !canFormat },
      { sep: true },
      { id: 'insertDate', label: t('insert_date'), icon: 'calendar' },
      { id: 'insertPath', icon: 'link', label: t('insert_path'), disabled: !cur || !cur.path },
    ] },
    { id: 'search', label: t('m_search'), labelKey: 'm_search', icon: 'search', items: () => [
      { id: 'find', label: t('find'), icon: 'search', shortcut: sc('Ctrl+F') },
      { id: 'findNext', icon: 'findNext', label: t('find_next'), shortcut: 'F3' },
      { id: 'findPrev', icon: 'findPrev', label: t('find_prev'), shortcut: 'Shift+F3' },
      { id: 'replace', label: t('replace'), icon: 'replace', shortcut: sc('Ctrl+H') },
      { id: 'selectMatches', icon: 'selectMatches', label: t('select_all_matches'), disabled: !find },
      { sep: true },
      { id: 'findInFiles', icon: 'searchFolder', label: t('find_in_files'), shortcut: sc('Ctrl+Shift+F'), disabled: !folder },
      { id: 'findInOpen', icon: 'searchDocs', label: t('find_in_open'), shortcut: sc('Ctrl+Alt+F') },
      { sep: true },
      { id: 'gotoLine', label: t('goto_line'), icon: 'hash', shortcut: sc('Ctrl+G') },
    ] },
    // Two menus instead of one long 보기: 편집기 = how the editor behaves and draws text, 보기 = the window's layout.
    { id: 'editor', label: t('m_editor'), labelKey: 'm_editor', icon: 'edit', items: () => [
      { id: 'toggle:autoIndent', icon: 'autoIndent', label: t('auto_indent'), checked: settings.autoIndent },
      { id: 'toggle:autocomplete', icon: 'autocomplete', label: t('autocomplete'), checked: settings.autocomplete },
      { id: 'toggle:wordWrap', icon: 'wrap', label: t('word_wrap'), checked: settings.wordWrap },
      { sep: true },
      { id: 'toggle:lineNumbers', icon: 'listOrdered', label: t('line_numbers'), checked: settings.lineNumbers },
      { id: 'toggle:minimap', icon: 'minimap', label: t('minimap'), checked: settings.minimap },
      { id: 'toggle:showWhitespace', icon: 'pilcrow', label: t('show_ws'), checked: settings.showWhitespace },
      { id: 'toggle:highlightActiveLine', icon: 'activeLine', label: t('active_line'), checked: settings.highlightActiveLine },
      { id: 'toggle:foldGutter', icon: 'foldGutter', label: t('fold_gutter'), checked: settings.foldGutter },
      { id: 'foldAll', icon: 'minusBox', label: t('fold_all') },
      { id: 'unfoldAll', icon: 'plusBox', label: t('unfold_all') },
      { sep: true },
      { id: 'toggle:spellCheck', icon: 'spell', label: t('spell_check'), checked: settings.spellCheck, shortcut: 'F7' },
      { id: 'toggle:spellCodeAll', icon: 'code', label: t('spell_code_all'), checked: settings.spellCodeAll, disabled: !settings.spellCheck },
      { id: 'toggle:lint', icon: 'lint', label: t('lint'), checked: settings.lint },
      { id: 'lintNext', icon: 'lintNext', label: t('lint_next'), shortcut: 'F8', disabled: !settings.lint },
      { id: 'lintPanel', icon: 'list', label: t('lint_panel'), disabled: !settings.lint },
      { sep: true },
      { id: 'toggle:mdWysiwyg', icon: 'eye', label: t('md_wysiwyg_menu'), checked: settings.mdWysiwyg, shortcut: sc('Ctrl+Shift+W'), disabled: !cur || cur.langName !== 'Markdown' },
      { id: 'toggle:mdPreview', icon: 'splitView', label: t('md_preview_menu'), checked: settings.mdPreview, shortcut: sc('Ctrl+Shift+M'), disabled: !cur || cur.langName !== 'Markdown' },
      { id: 'toggle:mdOutline', icon: 'listTree', label: t('md_outline_menu'), checked: settings.mdOutline, disabled: !cur || cur.langName !== 'Markdown' },
      { id: 'toggle:htmlPreview', icon: 'splitView', label: t('html_preview_menu'), checked: settings.htmlPreview, shortcut: sc('Ctrl+Shift+M'), disabled: !cur || cur.langName !== 'HTML' },
      { id: 'toggle:imagePreview', icon: 'fileImage', label: t('img_pv_menu'), checked: settings.imagePreview, shortcut: sc('Ctrl+Shift+M'), disabled: !cur || !isSvgName(cur.name) },
    ] },
    { id: 'view', label: t('m_view'), labelKey: 'm_view', icon: 'eye', items: () => [
      { id: 'toggle:sidebarVisible', icon: 'sidebar', label: t('sidebar'), checked: settings.sidebarVisible, shortcut: sc('Ctrl+B') },
      { id: 'toggle:toolbarVisible', icon: 'toolbar', label: t('toolbar'), checked: settings.toolbarVisible },
      { id: 'toggle:statusBarVisible', icon: 'statusbar', label: t('statusbar'), checked: settings.statusBarVisible },
      { sep: true },
      { id: 'split:none', icon: 'splitNone', label: t('split_none'), checked: settings.split === 'none', radio: true, shortcut: sc('Ctrl+Alt+1') },
      { id: 'split:cols', icon: 'splitCols', label: t('split_cols'), checked: settings.split === 'cols', radio: true, shortcut: sc('Ctrl+Alt+2') },
      { id: 'split:rows', icon: 'splitRows', label: t('split_rows'), checked: settings.split === 'rows', radio: true, shortcut: sc('Ctrl+Alt+3') },
      { id: 'split:grid', icon: 'splitGrid', label: t('split_grid'), checked: settings.split === 'grid', radio: true, shortcut: sc('Ctrl+Alt+4') },
      { id: 'nextPane', icon: 'nextPane', label: t('next_pane'), shortcut: 'F6', disabled: settings.split === 'none' },
      { sep: true },
      { id: 'toggleTerminal', label: t('terminal'), icon: 'terminal', checked: settings.termVisible, shortcut: sc('Ctrl+`') },
      { id: 'newTerminal', icon: 'terminalPlus', label: t('term_new'), shortcut: sc('Ctrl+Shift+`') },
      { sep: true },
      { id: 'zoomIn', label: t('zoom_in'), icon: 'zoomIn', shortcut: sc('Ctrl++') },
      { id: 'zoomOut', label: t('zoom_out'), icon: 'zoomOut', shortcut: sc('Ctrl+-') },
      { id: 'zoomReset', icon: 'zoomReset', label: t('zoom_reset'), shortcut: sc('Ctrl+0') },
      { sep: true },
      { id: 'fullscreen', label: t('fullscreen'), icon: 'fullscreen', shortcut: 'F11' },
      { sep: true },
      { id: 'toggleImageHex', icon: 'binary', label: t('img_hex_menu'), checked: !!cur && !!cur.imageHex, disabled: !cur || !isBinaryImageName(cur.name) },
    ] },
    { id: 'lang', label: t('m_lang'), labelKey: 'm_lang', icon: 'code', items: () => [
      { id: 'lang:auto', label: t('lang_auto'), checked: !!cur && !cur.language, radio: true, iconEl: <LangIcon name="auto" />, badge: 'auto' },
      { id: `lang:${PLAIN}`, label: t('lang_plain'), checked: !!cur && cur.language === PLAIN, radio: true, iconEl: <LangIcon name="plain" />, badge: 'plain' },
      { sep: true },
      ...FEATURED_LANGUAGES.map((d) => ({ id: `lang:${d.name}`, label: d.name, checked: !!cur && cur.language === d.name, radio: true, iconEl: <LangIcon name={d.name} />, badge: d.name, meta: !cur || cur.language || cur.langName !== d.name ? undefined : t('lang_auto').split(' ')[0] })),
      { sep: true },
      { id: 'languagePicker', label: `${t('m_lang')}…`, icon: 'search' },
    ] },
    { id: 'enc', label: t('m_enc'), labelKey: 'm_enc', icon: 'encoding', items: () => [
      { header: t('enc_current') },
      ...((info && info.encodings) || []).map((e) => ({ id: `enc:${e.id}`, icon: 'encoding', label: e.label, checked: !!cur && cur.encoding === e.id, radio: true })),
      { sep: true },
      { id: 'reopenPicker', label: `${t('reopen_as')}…`, icon: 'reload', disabled: !cur || !cur.path },
      { sep: true },
      { header: t('eol') },
      ...EOLS.map((e) => ({ id: `eol:${e}`, icon: 'eol', label: t(`eol_${e}`), checked: !!cur && cur.eol === e, radio: true })),
    ] },
    { id: 'help', label: t('m_help'), labelKey: 'm_help', icon: 'help', items: () => [
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
      { id: 'saveAs', icon: 'fileSave', label: t('save_as') },
      { id: 'reload', label: t('reload'), icon: 'reload', disabled: !d || !d.path },
      { id: 'formatDoc', icon: 'format', label: t('format_doc'), shortcut: 'Shift+Alt+F' },
      { sep: true },
      { id: 'close', label: t('close'), icon: 'close' },
      { id: 'closeOthers', icon: 'closeOthers', label: t('close_others'), disabled: docs.length < 2 },
      { id: 'closeRight', icon: 'closeRight', label: t('close_right'), disabled: i >= docs.length - 1 },
      { id: 'closeAll', icon: 'closeAll', label: t('close_all') },
      { sep: true },
      ...(d && d.kind === 'hex' && isBinaryImageName(d.name) ? [{ id: 'toggleImageHex', icon: 'binary', label: t('img_hex_menu'), checked: !!d.imageHex }, { sep: true }] : []),
      { id: 'reveal', label: t('reveal'), icon: 'explorer', disabled: !d || !d.path || !isElectron },
      { id: 'openWith', label: t('open_with'), icon: 'open', disabled: !d || !d.path || !isElectron },
      { id: 'copyPath', label: t('copy_path'), icon: 'copy', disabled: !d || !d.path },
      { id: 'copyName', icon: 'fileText', label: t('copy_name') },
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
    { id: 'selectAll', icon: 'selectAll', label: t('select_all'), shortcut: sc('Ctrl+A') },
    { sep: true },
    { id: 'toggleComment', icon: 'comment', label: t('toggle_comment'), shortcut: sc('Ctrl+/') },
    { id: 'upper', icon: 'upper', label: t('upper') },
    { id: 'lower', icon: 'lower', label: t('lower') },
    { id: 'formatDoc', icon: 'format', label: t('format_doc'), shortcut: 'Shift+Alt+F' },
    { sep: true },
    { id: 'find', label: t('find'), icon: 'search', shortcut: sc('Ctrl+F') },
    { id: 'replace', label: t('replace'), icon: 'replace', shortcut: sc('Ctrl+H') },
    { id: 'gotoLine', label: t('goto_line'), icon: 'hash', shortcut: sc('Ctrl+G') },
  ];

  const statusPickers = {
    indent: () => [
      { id: 'toggle:autoIndent', icon: 'autoIndent', label: t('auto_indent'), checked: settings.autoIndent },
      { sep: true },
      { header: t('set_indent_spaces') },
      ...[2, 3, 4, 8].map((n) => ({ id: `indent:spaces-${n}`, icon: 'spaces', label: t('st_spaces', { n }), checked: settings.insertSpaces && settings.tabSize === n, radio: true })),
      { header: t('set_indent_tabs') },
      ...[2, 4, 8].map((n) => ({ id: `indent:tabs-${n}`, icon: 'tab', label: t('st_tabs', { n }), checked: !settings.insertSpaces && settings.tabSize === n, radio: true })),
    ],
    eol: () => EOLS.map((e) => ({ id: `eol:${e}`, icon: 'eol', label: t(`eol_${e}`), checked: !!cur && cur.eol === e, radio: true })),
    encoding: () => [
      { header: t('enc_current') },
      ...((info && info.encodings) || []).map((e) => ({ id: `enc:${e.id}`, icon: 'encoding', label: e.label, checked: !!cur && cur.encoding === e.id, radio: true })),
      { sep: true },
      { id: 'reopenPicker', label: `${t('reopen_as')}…`, icon: 'reload', disabled: !cur || !cur.path },
    ],
    language: () => [
      { id: 'lang:auto', label: t('lang_auto'), checked: !!cur && !cur.language, radio: true, iconEl: <LangIcon name="auto" />, badge: 'auto' },
      { id: `lang:${PLAIN}`, label: t('lang_plain'), checked: !!cur && cur.language === PLAIN, radio: true, iconEl: <LangIcon name="plain" />, badge: 'plain' },
      { sep: true },
      ...FEATURED_LANGUAGES.slice(0, 12).map((d) => ({ id: `lang:${d.name}`, label: d.name, checked: !!cur && cur.language === d.name, radio: true, iconEl: <LangIcon name={d.name} /> })),
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
    // An <iframe> (the HTML preview) would take the mouse as soon as the pointer crosses it and the drag would stop:
    // pointer events are switched off on every iframe for the duration of the drag.
    document.body.classList.add('dragging');
    const up = () => { document.body.classList.remove('dragging'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); call('session.save', { mdPreviewWidth: settingsRef.current.mdPreviewWidth }).catch(() => {}); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // ── splitters between the editor panes (cols / rows / grid): drag to resize, kept as splitX / splitY ──
  const panesElRef = useRef(null);
  // split = multi: n panes in a balanced grid (columns = ceil(√n), rows as needed; the last pane spans what is
  // left of its row), column widths / row heights as fractions, a splitter between every two.
  const multi = settings.split === 'multi' ? multiGrid(panes.length) : null;
  const fracsOf = (arr, n) => (Array.isArray(arr) && arr.length === n ? arr : Array(n).fill(1 / n));
  const colFracs = multi ? fracsOf(settings.colFracs, multi.cols) : [];
  const rowFracs = multi ? fracsOf(settings.rowFracs, multi.rows) : [];
  const onFracSplitDown = (key, fracs, i, axis) => (e) => {
    e.preventDefault();
    const box = panesElRef.current && panesElRef.current.getBoundingClientRect();
    if (!box) return;
    const p0 = axis === 'x' ? e.clientX : e.clientY, f0 = fracs.slice();
    document.body.classList.add('dragging', axis === 'x' ? 'dragging-x' : 'dragging-y');
    const move = (ev) => {
      const d = ((axis === 'x' ? ev.clientX : ev.clientY) - p0) / (axis === 'x' ? box.width : box.height);
      const a = Math.max(0.1, Math.min(f0[i] + f0[i + 1] - 0.1, f0[i] + d));
      const next = f0.slice(); next[i] = a; next[i + 1] = f0[i] + f0[i + 1] - a;
      setSettings({ [key]: next });
    };
    const up = () => { document.body.classList.remove('dragging', 'dragging-x', 'dragging-y'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); call('session.save', { [key]: settingsRef.current[key] }).catch(() => {}); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  const cum = (fr, i) => fr.slice(0, i + 1).reduce((a, b) => a + b, 0) * 100;
  const onPaneSplitDown = (axis) => (e) => {
    e.preventDefault();
    const box = panesElRef.current && panesElRef.current.getBoundingClientRect();
    if (!box) return;
    document.body.classList.add('dragging', axis === 'y' ? 'dragging-y' : 'dragging-x');
    const move = (ev) => {
      const frac = axis === 'x' ? (ev.clientX - box.left) / box.width : (ev.clientY - box.top) / box.height;
      setSettings({ [axis === 'x' ? 'splitX' : 'splitY']: Math.max(0.15, Math.min(0.85, frac)) });
    };
    const up = () => { document.body.classList.remove('dragging', 'dragging-x', 'dragging-y'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); call('session.save', { splitX: settingsRef.current.splitX, splitY: settingsRef.current.splitY }).catch(() => {}); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // ── sidebar splitter ──
  // The sidebar is never narrower than its header needs (the title and every
  // icon button visible): the Sidebar measures that (onMinWidth) whenever the
  // language or the buttons change, and the width is clamped to it.
  const [sidebarMin, setSidebarMin] = useState(160);
  const sidebarMinRef = useRef(160);
  const onSidebarMin = useCallback((px) => { const m = Math.max(160, Math.ceil(px)); if (m === sidebarMinRef.current) return; sidebarMinRef.current = m; setSidebarMin(m); setSidebarWidth((w) => Math.max(m, w)); }, []);
  const onSplitDown = (e) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = sidebarWidth;
    const move = (ev) => setSidebarWidth(Math.max(sidebarMinRef.current, Math.min(600, w0 + ev.clientX - x0)));
    document.body.classList.add('dragging');
    const up = () => { document.body.classList.remove('dragging'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); schedulePersist(); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // ── smoke-test / automation hook ──
  useEffect(() => {
    window.__med = {
      get state() { return { docs: docsRef.current, activeId: activeIdRef.current, settings: settingsRef.current, folder, find: !!find, dialog: dialog ? dialog.type : null, cursor }; },
      action, openFiles, openPath, newUntitled, activate, focusPane, showInPane, formatDoc, saveImage, exportImage: async (src, opts) => encodeImage((await analyzeImage(src)).canvas, opts), get panes() { return panesRef.current.map((p, i) => ({ docId: p.docId, active: i === activePaneRef.current })); }, setText: (text) => { const v = viewRef.current; if (v) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } }); },
      getText: () => (viewRef.current ? viewRef.current.state.doc.toString() : ''), setFolder: (p) => setFolder(p), view: () => viewRef.current, closeDialog,
      get menus() { return menus.map((m) => ({ id: m.id, items: m.items() })); }, menuIcons: withMenuIcons,
    };
  });

  const initialState = useMemo(() => createState('', SETTINGS_DEFAULTS, handlers), [handlers]);
  const onPaneView = useCallback((key, v) => {
    const i = panesRef.current.findIndex((p) => p.key === key);
    const pane = i >= 0 ? panesRef.current[i] : null;
    if (!v) {
      const old = paneViews.current.get(key);
      if (old && pane && pane.docId != null && getDoc(pane.docId)) statesRef.current.set(pane.docId, old.state);
      paneViews.current.delete(key);
      if (viewRef.current === old) { viewRef.current = null; setView(null); }
      return;
    }
    paneViews.current.set(key, v);
    if (pane && pane.docId != null) { const s = statesRef.current.get(pane.docId); if (s) v.setState(s); }
    if (i === activePaneRef.current) { viewRef.current = v; setView(v); if (pane && pane.docId != null) { activeIdRef.current = pane.docId; const s = v.state; setCursor(cursorInfo(s)); } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPaths = useMemo(() => new Set(docs.map((d) => d.path).filter(Boolean)), [docs]);
  const isMarkdown = !!cur && cur.langName === 'Markdown';
  const isHtml = !!cur && cur.langName === 'HTML';
  const isSvg = !!cur && isSvgName(cur.name);                 // SVG source on the left, live picture in the preview pane
  const isBinaryImage = !!cur && isBinaryImageName(cur.name); // PNG · JPEG · GIF · WebP · AVIF · … — the picture (or hex), no minimap
  // What the prompt's session / os segments show (app.info): one object per app info, so the transcripts are not re-rendered for nothing.
  const termEnv = useMemo(() => ({ home: info ? info.home : '', user: info ? info.user : '', host: info ? info.hostname : '', platform: info ? info.platform : '' }), [info]);
  const toolbarState = { dirty: !!cur && cur.dirty, anyDirty: docs.some((d) => d.dirty), canFormat, formatter: fmtInfo, formatterItems, formatTip, zoom, structureOn: isBinaryImage ? false : (isMarkdown ? !!settings.mdOutline : !!settings.minimap), canStructure: !isBinaryImage };

  if (!booted) return <><div className="boot">{t('ready')}…</div><ProgressHost /></>;

  return (
    <div className="app">
      <MenuBar menus={menus} onAction={action} theme={settings.theme} controls={!settings.toolbarVisible} />
      {settings.toolbarVisible && <Toolbar onAction={action} onSetting={changeSettings} settings={settings} state={toolbarState} />}
      <div className="body">
        {settings.sidebarVisible && (
          <>
            <div className="sidebar-column" ref={sidebarColumnRef} style={{ width: Math.max(sidebarWidth, sidebarMin), minWidth: sidebarMin, '--search-share': settings.searchVisible ? settings.searchRatio : 0 }}>
              <Sidebar onMinWidth={onSidebarMin} folder={folder} activePath={cur && cur.path} openPaths={openPaths} showHidden={showHidden} searchOn={settings.searchVisible} onToggleSearch={() => (settings.searchVisible ? changeSettings({ searchVisible: false }) : findInFiles())}
                onToggleHidden={() => changeSettings({ treeShowHidden: !showHidden })} onOpenFile={(p) => openPath(p)} onOpenFolder={openFolderDialog}
                onCloseFolder={() => action('closeFolder')} onAction={sidebarAction} refreshKey={sbRefresh} />
              {settings.searchVisible && (
                <SearchPanel folder={folder} request={searchRequest} searchOpen={searchOpenDocs} onOpen={openSearchHit} onClose={() => changeSettings({ searchVisible: false })}
                  onResizeStart={onSearchResizeStart} />
              )}
            </div>
            <div className="v-splitter" onMouseDown={onSplitDown} />
          </>
        )}
        <div className="editor-column">
        <div className="editor-area">
          <TabBar docs={docs} activeId={activeId} onActivate={activate} onClose={(id) => closeDocs([id])} onNew={() => newUntitled()}
            onReorder={(from, to) => { setDocs((ds) => { const a = ds.slice(); const i = a.findIndex((d) => d.id === from), j = a.findIndex((d) => d.id === to); const [m] = a.splice(i, 1); a.splice(j, 0, m); return a; }); schedulePersist(); }}
            onAction={(id, docId) => action(id, docId)} onContextItems={tabContextItems} />
          {isMarkdown && <MarkdownBar onAction={action} preview={settings.mdPreview} outline={settings.mdOutline} wysiwyg={settings.mdWysiwyg} />}
          {isHtml && <HtmlBar onAction={action} preview={settings.htmlPreview} />}
          {(isSvg || isBinaryImage) && <ImageBar onAction={action} preview={settings.imagePreview} svg={isSvg} imageHex={!!cur.imageHex} />}
          {find && view && !(cur && cur.kind === 'hex') && <FindBar key={find.key} view={view} mode={find.mode} initial={find.initial} docVersion={docVersion} onClose={() => action('closeFind')} onModeChange={(mode) => setFind({ ...find, mode })} />}
          <div className="editor-split" ref={splitRef}>
            <div className={`panes ${settings.split || 'none'}`} ref={panesElRef} style={{ '--split-x': settings.splitX || 0.5, '--split-y': settings.splitY || 0.5, ...(multi ? { gridTemplateColumns: colFracs.map((f) => `minmax(0, ${f}fr)`).join(' '), gridTemplateRows: rowFracs.map((f) => `minmax(0, ${f}fr)`).join(' ') } : {}) }}>
              {multi && colFracs.slice(0, -1).map((_, i) => <div key={`x${i}`} className="pane-splitter x" style={{ left: `calc(${cum(colFracs, i)}% - 3px)` }} onMouseDown={onFracSplitDown('colFracs', colFracs, i, 'x')} title="↔" />)}
              {multi && rowFracs.slice(0, -1).map((_, i) => <div key={`y${i}`} className="pane-splitter y" style={{ top: `calc(${cum(rowFracs, i)}% - 3px)` }} onMouseDown={onFracSplitDown('rowFracs', rowFracs, i, 'y')} title="↕" />)}
              {settings.split === 'cols' || settings.split === 'grid' ? <div className="pane-splitter x" onMouseDown={onPaneSplitDown('x')} title="↔" /> : null}
              {settings.split === 'rows' || settings.split === 'grid' ? <div className="pane-splitter y" onMouseDown={onPaneSplitDown('y')} title="↕" /> : null}
              {panes.map((p, i) => {
                const pd = p.docId != null ? getDoc(p.docId) : null;
                return (
                  <div key={p.key} className={`pane ${i === activePane ? 'active' : ''}`} style={multi && i === panes.length - 1 && panes.length % multi.cols ? { gridColumn: `span ${multi.cols - (panes.length % multi.cols) + 1}` } : settings.split === 'grid' && panes.length === 3 && i === 2 ? { gridColumn: '1 / -1' } : undefined} onMouseDownCapture={() => { if (activePaneRef.current !== i) focusPane(i, { focus: false }); }}>
                    {panes.length > 1 && (
                      <div className="pane-head">
                        <button className="pane-title ellipsis" title={pd ? pd.path || pd.name : t('pane_empty')} onClick={(e) => openPaneMenu(i, e.currentTarget)}>
                          {pd ? <>{pd.name}{pd.dirty ? ' ●' : ''}</> : <span className="muted">{t('pane_empty')}</span>}<Icon name="chevronDown" size={12} />
                        </button>
                        <span className="spacer" />
                        {pd && isBinaryImageName(pd.name) && (
                          <button className={`icon-btn ${pd.imageHex ? 'on' : ''}`} title={t('img_hex_tip')}
                            onClick={() => { ensureHexReader(pd); patchDoc(pd.id, { imageHex: !pd.imageHex }); }}>
                            <Icon name="binary" size={13} />
                          </button>
                        )}
                        {pd ? <button className="icon-btn" title={t('pane_close_doc')} onClick={() => closePaneAndDoc(i)}><Icon name="close" size={13} /></button>
                          : <button className="icon-btn" title={t('pane_close')} onClick={() => closePane(i)}><Icon name="close" size={13} /></button>}
                      </div>
                    )}
                    {panes.length > 1 && p.docId == null && (
                      <div className="pane-empty"><Icon name="file" size={26} /><p>{t('pane_empty')}</p><div className="pane-empty-btns"><button className="btn" onClick={(e) => openPaneMenu(i, e.currentTarget)}>{t('pane_pick')}</button><button className="btn" onClick={() => closePane(i)}>{t('pane_close')}</button></div></div>
                    )}
                    <div className="pane-body">
                    <EditorPane initialState={initialState} onView={(v) => onPaneView(p.key, v)} onDropFiles={dropFiles} contextItems={editorContextItems} onAction={action}
                      fontFamily={settings.fontFamily} fontSize={settings.fontSize} lineHeight={settings.lineHeight} empty={!docs.length || p.docId == null || (pd && pd.kind === 'hex')}
                      minimap={settings.minimap && !(pd && (pd.langName === 'Markdown' || isBinaryImageName(pd.name)))} version={`${p.docId}:${docVersion}:${settings.theme}:${cursor.line}`} />
                    {pd && pd.kind === 'hex' && isBinaryImageName(pd.name) && (
                      <div className="pane-media"
                        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
                        onDrop={(e) => { e.preventDefault(); const files = Array.from(e.dataTransfer.files || []); if (files.length) dropFiles(files, null); }}>
                        <ImagePreview fill path={pd.path} name={pd.name} mtime={pd.mtime} imageHex={!!pd.imageHex}
                          onToggleHex={() => { ensureHexReader(pd); patchDoc(pd.id, { imageHex: !pd.imageHex }); }} />
                        {pd.imageHex && ensureHexReader(pd) && (
                          <HexView read={hexRef.current.get(pd.id)} version={pd.mtime} name={pd.name} size={pd.size} fontSize={settings.fontSize}
                            width={`${Math.round((settings.mdPreviewWidth || 0.5) * 100)}%`}
                            onClose={() => patchDoc(pd.id, { imageHex: false })} onMessage={setMessage} />
                        )}
                      </div>
                    )}
                    {pd && pd.kind === 'hex' && !isBinaryImageName(pd.name) && ensureHexReader(pd) && (
                      <div className="pane-media">
                        <HexView read={hexRef.current.get(pd.id)} version={pd.mtime} name={pd.name} size={pd.size} fontSize={settings.fontSize}
                          onOpenAsText={() => hexAsText(pd.id)} onMessage={setMessage} />
                      </div>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>
            {paneMenu && panes[paneMenu.i] && (
              <ContextMenu anchorEl={paneMenu.el} x={0} y={0} className="pane-menu" items={[
                { header: t('pane_open_docs') },
                ...docs.map((d) => ({ id: `doc:${d.id}`, label: d.name + (d.dirty ? ' ●' : ''), meta: (() => { const j = paneOfDoc(d.id); return j >= 0 && j !== paneMenu.i ? t('pane_in', { n: j + 1 }) : undefined; })(), checked: panes[paneMenu.i].docId === d.id, radio: true, iconEl: <LangIcon name={d.langName || 'plain'} /> })),
                ...(paneMenu.files ? [
                  { sep: true },
                  { header: t('pane_folder_files', { name: baseName(paneMenu.dir) }) },
                  ...(paneMenu.files.length ? paneMenu.files.filter((f) => !docs.some((d) => samePath(d.path, f.path))).map((f) => ({ id: `file:${f.path}`, label: f.name, icon: 'file' })) : [{ id: 'none', label: t('pane_folder_empty'), disabled: true }]),
                ] : []),
                { sep: true },
                { id: 'open', label: t('open_file'), icon: 'fileOpen' },
              ]}
                onClose={() => setPaneMenu(null)} onPick={(id) => { const i = paneMenu.i; setPaneMenu(null); paneMenuPick(i, id); }} />
            )}
            {isMarkdown && settings.mdOutline && view && (
              <Outline view={view} docVersion={docVersion} cursorPos={cursor.pos} onClose={() => changeSettings({ mdOutline: false })} />
            )}
            {isMarkdown && settings.mdPreview && view && (
              <>
                <div className="v-splitter" onMouseDown={onPreviewSplitDown} />
                <Preview view={view} docVersion={docVersion} cursorPos={cursor.pos} onAction={action} onSaveImage={saveImage} onMessage={setMessage} base={cur && cur.path ? dirName(cur.path) : folder || ''} width={`${Math.round(settings.mdPreviewWidth * 100)}%`} />
              </>
            )}
            {isHtml && settings.htmlPreview && view && (
              <>
                <div className="v-splitter" onMouseDown={onPreviewSplitDown} />
                <HtmlPreview view={view} docVersion={docVersion} base={cur && cur.path ? dirName(cur.path) : folder || ''} name={cur.name} width={`${Math.round(settings.mdPreviewWidth * 100)}%`} />
              </>
            )}
            {isSvg && settings.imagePreview && view && (
              <>
                <div className="v-splitter" onMouseDown={onPreviewSplitDown} />
                <ImagePreview view={view} docVersion={docVersion} path={cur.path} name={cur.name} mtime={cur.mtime} width={`${Math.round(settings.mdPreviewWidth * 100)}%`} />
              </>
            )}
          </div>
        </div>
        {settings.termVisible && (
          <TerminalPanel terms={terms} activeId={activeTerm} shells={shells} height={settings.termHeight} onResizeStart={onTermResizeStart}
            onActivate={setActiveTerm} onNew={(shell) => newTerminal(shell)} onClose={closeTerminal} onHide={() => changeSettings({ termVisible: false })}
            onExit={() => {}} onSettings={() => action('termSettings')} prompt={settings.prompt} env={termEnv} termEol={settings.termEol} termCr={settings.termCr} termColor={settings.termColor !== false} />
        )}
        </div>
      </div>
      {settings.statusBarVisible && (
        <StatusBar message={message} cursor={cursor} settings={settings} zoom={zoom} pickers={statusPickers} onAction={action} lint={cur ? cur.lint : null}
          doc={cur ? { ...cur, encodingLabel: encodingLabel(cur.encoding) } : null} />
      )}

      {dialog && dialog.type === 'confirm' && <ConfirmDialog title={dialog.title} message={dialog.message} buttons={dialog.buttons} icon={dialog.icon} kind={dialog.kind} detail={dialog.detail} onResult={closeDialog} />}
      {dialog && dialog.type === 'error' && <ErrorDialog title={dialog.title} message={dialog.message} error={dialog.error} onClose={() => closeDialog('ok')} />}
      {dialog && dialog.type === 'prompt' && <PromptDialog title={dialog.title} label={dialog.label} initial={dialog.initial} okLabel={dialog.okLabel} icon={dialog.icon} validate={dialog.validate} onResult={closeDialog} />}
      {dialog && dialog.type === 'about' && <AboutDialog info={info} onClose={closeDialog} />}
      {dialog && dialog.type === 'shortcuts' && <ShortcutsDialog onClose={closeDialog} />}
      {dialog && dialog.type === 'settings' && <SettingsDialog initialTab={dialog.tab} settings={settings} encodings={(info && info.encodings) || []} shells={shells} formatDir={cur && cur.path ? dirName(cur.path) : folder || ''} onChange={changeSettings} onClose={closeDialog} tools={fmtTools} onTools={setFmtTools} />}
      {dialog && dialog.type === 'goto' && <GotoLineDialog lines={cursor.lines} current={cursor.line} onClose={closeDialog} onGo={(l, c) => { closeDialog(); withView((v) => commands.gotoLine(v, l, c)); }} />}
      {dialog && dialog.type === 'language' && <LanguagePicker current={(getDoc(dialog.docId) || {}).language || 'auto'} onClose={closeDialog} onPick={(name) => { closeDialog(); setDocLanguage(dialog.docId, name); }} />}
      {dialog && dialog.type === 'encoding' && <EncodingPicker title={t('reopen_as')} encodings={(info && info.encodings) || []} current={cur && cur.encoding} onClose={closeDialog} onPick={(id) => { closeDialog(); reopenWith(activeIdRef.current, id); }} />}
      {dialog && dialog.type === 'install' && <InstallDialog tool={dialog.tool} jobId={dialog.jobId} doneLabel={t('inst_use')} onResult={closeDialog} />}
      {dialog && dialog.type === 'printPreview' && <PrintPreviewDialog html={dialog.html} title={dialog.title} path={dialog.path} lang={dialog.lang} text={dialog.text} lineHtml={dialog.lineHtml} code={dialog.code} settings={settings} onPrintOpts={changeSettings} onResult={closeDialog} />}
      {dialog && dialog.type === 'imageExport' && <ImageExportDialog src={dialog.src} alt={dialog.alt} onResult={closeDialog} />}
      {dialog && dialog.type === 'mdImage' && <ImageDialog base={cur && cur.path ? dirName(cur.path) : folder || ''} home={info && info.home} sep={(info && info.sep) || '/'}
        onResult={(text) => { closeDialog(); if (!text) return; withView((vw) => { const r = vw.state.selection.main; vw.dispatch({ changes: { from: r.from, to: r.to, insert: text }, selection: { anchor: r.from + text.length }, scrollIntoView: true }); }); }} />}
      {dialog && dialog.type === 'file' && <FileDialog kind={dialog.kind} startPath={dialog.opts.defaultPath || folder || (info && info.home)} defaultName={dialog.opts.name} sep={(info && info.sep) || '/'} onResult={closeDialog} />}
      <ProgressHost />
    </div>
  );
}
