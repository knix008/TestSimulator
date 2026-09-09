import React, { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import TitleBar from './components/TitleBar';
import FileList from './components/FileList';
import OutlineTree from './components/OutlineTree';
import FigureList from './components/FigureList';
import { THEMES } from './lib/themes';
import ContextMenu from './components/ContextMenu';
import Tooltip from './components/Tooltip';
import Toasts from './components/Toasts';
import ExportResultDialog from './components/ExportResultDialog';
import ExportProgressDialog from './components/ExportProgressDialog';
import ImportProgressDialog from './components/ImportProgressDialog';
import MergeProgressDialog from './components/MergeProgressDialog';
import ConfirmCloseDialog from './components/ConfirmCloseDialog';
import {
  IconFolder, IconFilePlus, IconHash, IconExport, IconChevron,
  IconMd, IconHtml, IconPdf, IconWord, IconTrash, IconInfo, IconSettings,
  IconSun, IconMoon, IconUp, IconDown, IconX, IconCheckSquare, IconSquare, IconSave,
  IconUndo, IconRedo, IconPrint, IconRenumber,
  IconCopy, IconCut, IconPaste, IconSelectAll, IconTarget,
  IconStars, IconSnow, IconLeaf, IconFlower, IconSunrise, IconContrast, IconBulb,
  IconDroplet, IconCoffee, IconCloud, IconGlobe, IconImage,
  IconCover, IconContents, IconFigIndex, IconPageNum, IconHeader, IconFooter, IconRemerge,
  IconMinus, IconPlus,
  IconZoomIn, IconZoomOut, IconGem, IconFlame, IconSprout, IconDune,
  IconSubfolder, IconFileHeading,
} from './components/Icons';
import {
  isElectron, api, readFileText, readFileDataURL, saveSettingsToDisk, canWriteInPlace,
} from './lib/platform';
import {
  embedImages, resolveRelPath, registerImage, clearImages, srcBaseName, IMAGE_EXTS,
} from './lib/images';
import {
  mergeFilesAsync, renumberHeadings, getOutline, getDocumentOutline, getFigures, renderPreviewHtml,
  buildDocument, refreshFrontMatter, refreshGenerated, splitDocument, setFigureWidth, fontStack,
  firstHeadingText,
  sortFiles, DEFAULT_EXPORT_SETTINGS,
} from './lib/markdown';
import {
  exportMarkdown, exportHtml, exportPdf, exportWord, saveMarkdownTo, printDocument,
} from './lib/export';

const MD_RE = /\.(md|markdown)$/i;
const THEME_IDS = THEMES.map((t) => t.id);
const MarkdownEditor = lazy(() => import('./components/MarkdownEditor'));
// Each theme shows its own toolbar glyph so the current theme is recognizable.
const THEME_ICONS = {
  dark: IconMoon, light: IconSun, white: IconBulb, midnight: IconStars, nord: IconSnow,
  forest: IconLeaf, rose: IconFlower, solarized: IconSunrise, contrast: IconContrast,
  ocean: IconDroplet, mocha: IconCoffee, sky: IconCloud,
  violet: IconGem, amber: IconFlame, mint: IconSprout, sand: IconDune,
};
let uid = 0;
const nextId = () => `f${++uid}`;

// Nothing derived from the document — the structure tree, the figure list, the
// statistics, the preview — is computed while a LINE is being typed. It all
// catches up when the writer finishes the line: Enter, a caret move off it, the
// editor losing focus, a switch to the preview, or simply stopping. So a
// keystroke costs a keystroke: no React render, no scan of the document, no
// re-render of lists that may be hundreds of rows long.
const SETTLE_LINE_MS = 250;    // after a key that ends or leaves a line
const SETTLE_IDLE_MS = 1200;   // the writer simply stopped

// Keys that end a line or take the caret off it — the line is finished, so the
// rest of the app may catch up. keydown runs before the character lands, hence
// the short delay rather than settling on the spot.
const LINE_DONE_KEYS = new Set([
  'Enter', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Tab',
]);

// Undo history for the document. One step per burst of typing; a burst is
// anything with less than this long a pause in it.
const HISTORY_LIMIT = 200;
const HISTORY_COALESCE_MS = 600;

// First index where two documents differ. Undo/redo use this (recorded against
// the text being stored) so the caret lands on the edit, not a later TOC fold.
function firstDiff(a, b) {
  const left = a ?? '';
  const right = b ?? '';
  const n = Math.min(left.length, right.length);
  let i = 0;
  while (i < n && left.charCodeAt(i) === right.charCodeAt(i)) i += 1;
  return i;
}

// Document zoom range, in percent.
const ZOOM_MIN = 50;
const ZOOM_MAX = 300;
const ZOOM_STEP = 10;

function loadSettings() {
  try {
    const raw = localStorage.getItem('mmm-export');
    if (raw) return { ...DEFAULT_EXPORT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_EXPORT_SETTINGS };
}

// A callback whose identity never changes but which always runs the latest
// version — so passing it to a memoised child does not re-render that child on
// every keystroke, and it still closes over current state.
function useEvent(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return useMemo(() => (...args) => ref.current(...args), []);
}

export default function App() {
  const { t } = useTranslation();

  const [files, setFiles] = useState([]);
  const [sourceDir, setSourceDir] = useState('');

  const [merged, setMerged] = useState('');
  const [leftTab, setLeftTab] = useState('files');
  const [activeFigure, setActiveFigure] = useState(-1);
  // Document zoom for the preview / editor panes (display only — it never
  // reaches the export, which is laid out for the page).
  const [zoom, setZoom] = useState(() => {
    const n = Number(localStorage.getItem('mmm-zoom'));
    return n >= ZOOM_MIN && n <= ZOOM_MAX ? n : 100;
  });
  const [rightTab, setRightTab] = useState('preview');
  // CodeMirror is loaded only when the Edit tab is first opened, so the main
  // window can appear without waiting for the editor bundle.
  const [editorReady, setEditorReady] = useState(false);
  const [status, setStatus] = useState(t('status.ready'));
  const [exportOpen, setExportOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    const s = localStorage.getItem('mmm-theme');
    return THEME_IDS.includes(s) ? s : 'dark';
  });
  const [lang, setLang] = useState(i18n.language);
  const [exportSettings, setExportSettings] = useState(loadSettings);
  const [exportName, setExportName] = useState('');
  const exportNameEdited = useRef(false);
  const [ctx, setCtx] = useState({ open: false, x: 0, y: 0, items: [] });
  const [toasts, setToasts] = useState([]);
  const toastSeq = useRef(0);
  const [exportResult, setExportResult] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [importProg, setImportProg] = useState(null); // { done, total, file }
  const [importOpen, setImportOpen] = useState(false);
  const [mergeProg, setMergeProg] = useState(null); // { done, total, file }
  const [mergeOpen, setMergeOpen] = useState(false);
  const mergeSeq = useRef(0);
  // Unsaved-changes tracking: the document counts as saved while it matches the
  // text of the last successful save / export.
  const savedTextRef = useRef('');
  // The .md this document lives in once it has been saved. Save writes straight
  // back to it; until then Save has to ask where, like Save as.
  const [docPath, setDocPath] = useState('');
  // The same value as a ref. Two saves can be raised in one tick (a shortcut
  // that reaches two handlers, or an impatient double click), and the second
  // must see the path the first just chose — a state update would not be there
  // yet, and the user would be asked for a file name all over again.
  const docPathRef = useRef('');
  const savingRef = useRef(false);
  const printingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  // The window-level Ctrl+S listener is installed once, so it reaches the save
  // action through a ref — a captured saveDocument would save a stale document.
  const saveRef = useRef(null);
  const printRef = useRef(null);
  // The editor is rewritten by the app on its own (numbering, the contents
  // block). Every one of those writes replaces the document text, which wipes
  // CodeMirror's native undo stack — so the document keeps its own history
  // instead of relying on document.execCommand('undo').
  //   apply – the change being applied IS an undo/redo, so do not record it
  //   fold  – an automatic pass (renumber / index); belongs to the step before it
  const histRef = useRef({ past: [], future: [], current: '', at: 0, sel: 0, changeAt: 0, apply: false, fold: false });
  const pendingSelRef = useRef(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [closeAsk, setCloseAsk] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);

  const folderInputRef = useRef(null);
  const filesInputRef = useRef(null);
  const previewRef = useRef(null);
  const editorRef = useRef(null);
  const editorCbs = useRef({});
  // The editor is UNCONTROLLED CodeMirror. While the writer types, the view
  // owns its own text and React never writes to it: that keeps the whole app
  // out of the keystroke path, leaves IME composition (Korean and friends)
  // alone, and — unlike a <textarea> — only paints the visible lines, so a
  // long merged document does not re-layout on every jamo.
  // `merged` catches up on a short debounce; anything that needs the very
  // latest text reads it straight from the editor (currentText).
  const settleTimer = useRef(0);
  const composingRef = useRef(false);
  const exportRef = useRef(null);
  const toolbarRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('mmm-theme', theme);
    saveSettingsToDisk();
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('mmm-export', JSON.stringify(exportSettings));
    saveSettingsToDisk();
  }, [exportSettings]);

  // Sync with the separate settings window via the storage event.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'mmm-export' && e.newValue) {
        try { setExportSettings((prev) => ({ ...prev, ...JSON.parse(e.newValue) })); } catch { /* ignore */ }
      } else if (e.key === 'mmm-theme' && e.newValue && THEME_IDS.includes(e.newValue)) {
        setTheme(e.newValue);
      } else if (e.key === 'mmm-lang' && e.newValue) {
        i18n.changeLanguage(e.newValue); setLang(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // When returning to the main window (e.g. after using the settings window),
  // reload settings/theme/language from localStorage in case the live storage
  // event was missed (some platforms don't fire it across windows).
  useEffect(() => {
    const onFocus = () => {
      try {
        const raw = localStorage.getItem('mmm-export');
        if (raw) setExportSettings({ ...DEFAULT_EXPORT_SETTINGS, ...JSON.parse(raw) });
      } catch { /* ignore */ }
      const th = localStorage.getItem('mmm-theme');
      if (th && THEME_IDS.includes(th)) setTheme(th);
      const lg = localStorage.getItem('mmm-lang');
      if (lg && lg !== i18n.language) { i18n.changeLanguage(lg); setLang(lg); }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    if (!exportOpen) return;
    const onDown = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [exportOpen]);

  // Anything that goes wrong ends up here: the popup names what was being done,
  // says exactly what failed, and shows the stack — all of it copyable, because
  // an error the user cannot quote is an error nobody can help them with.
  function reportError(what, err) {
    setExportResult({
      status: 'error',
      fmt: what,
      message: err?.message || String(err),
      detail: err?.stack && err.stack !== err.message ? String(err.stack) : '',
    });
  }

  // Failures that never reached a try/catch — a bug in the app, or a rejected
  // promise nobody awaited — would otherwise vanish into the console.
  useEffect(() => {
    const onError = (e) => reportError(t('exportDlg.titleUnexpected'), e.error || e.message || e);
    const onRejection = (e) => reportError(t('exportDlg.titleUnexpected'), e.reason || e);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // ── Completion toasts ───────────────────────────────────
  const dismissToast = (id) => setToasts((list) => list.filter((x) => x.id !== id));
  function notify(title, { message = '', type = 'success', duration = 3800 } = {}) {
    const id = ++toastSeq.current;
    setToasts((list) => [...list, { id, title, message, type }]);
    if (duration) setTimeout(() => dismissToast(id), duration);
  }

  // `merged` IS the settled document now: it only changes when a line is
  // finished, or when something other than the keyboard changes it. So the
  // derived views read it directly. Anything that splices text back by offset
  // must still re-resolve against the LIVE editor value (currentText), which
  // can be a line ahead of this.
  // Records every change to the document, except the ones it is itself making.
  useEffect(() => {
    const h = histRef.current;
    if (h.current === merged) return;
    const now = Date.now();
    if (h.apply) {
      h.apply = false;                       // undo/redo already moved the stacks
    } else if (h.fold) {
      // The automatic pass (renumber / index) is not an edit of its own: it
      // belongs to the step before it, and — since it also runs right after an
      // undo — it must not throw away a redo branch the writer may still want.
    } else {
      // A burst of typing is one step; a pause starts the next one.
      // Store the first differing offset in the OLD text — that is where the
      // caret should go when this step is undone. The live caret is in the NEW
      // document and would restore to the wrong place (or into a later TOC).
      const at = firstDiff(h.current, merged);
      const sameStep = h.past.length > 0 && now - h.at < HISTORY_COALESCE_MS;
      if (!sameStep) {
        h.past.push({ text: h.current, sel: at });
        if (h.past.length > HISTORY_LIMIT) h.past.shift();
        h.changeAt = at;
      } else {
        h.changeAt = firstDiff(h.past[h.past.length - 1].text, merged);
      }
      h.future.length = 0;                   // a new edit abandons the redo branch
    }
    h.fold = false;
    h.current = merged;
    if (pendingSelRef.current != null) {
      h.sel = pendingSelRef.current;
      pendingSelRef.current = null;
    }
    h.at = now;
    setHistory({ canUndo: h.past.length > 0, canRedo: h.future.length > 0 });
  }, [merged]);

  // Starts the history over — a fresh merge is a new document, not an edit of
  // the one before it.
  function resetHistory(text) {
    pendingSelRef.current = null;
    histRef.current = { past: [], future: [], current: text, at: Date.now(), sel: 0, changeAt: 0, apply: false, fold: false };
    setHistory({ canUndo: false, canRedo: false });
  }

  function liveEditor() {
    const el = editorRef.current;
    return el && el.isReady && el.isFilled ? el : null;
  }

  function stepHistory(from, to) {
    const h = histRef.current;
    cancelEditorSync();                        // a queued keystroke would land after
    pendingSelRef.current = null;
    const el = liveEditor();
    const live = el ? el.value : merged;
    // Unsettled typing is not in the stacks yet. Record it first so Ctrl+Z
    // undoes that burst rather than skipping it.
    if (live !== h.current) {
      const sameStep = h.past.length > 0 && Date.now() - h.at < HISTORY_COALESCE_MS;
      const origin = sameStep ? h.past[h.past.length - 1].text : h.current;
      const at = firstDiff(origin, live);
      if (!sameStep) {
        h.past.push({ text: h.current, sel: at });
        if (h.past.length > HISTORY_LIMIT) h.past.shift();
      }
      h.future.length = 0;
      h.current = live;
      h.changeAt = at;
      h.sel = el?.selectionStart ?? at;
      h.at = Date.now();
    }
    if (!from.length) {
      setHistory({ canUndo: h.past.length > 0, canRedo: h.future.length > 0 });
      return;
    }
    const entry = from.pop();
    const redoAt = Math.min(h.changeAt ?? firstDiff(live, entry.text), live.length);
    to.push({ text: live, sel: redoAt });
    const pos = Math.min(entry.sel ?? 0, entry.text.length);
    h.apply = true;
    h.sel = pos;
    h.changeAt = pos;
    if (el) {
      el.replaceAndReveal(entry.text, pos, pos);
      el.focus();
    }
    setMerged(entry.text);
  }
  const undo = () => stepHistory(histRef.current.past, histRef.current.future);
  const redo = () => stepHistory(histRef.current.future, histRef.current.past);

  // The merge options live in the same store as the export ones, so the toolbar,
  // the settings window and the next launch all agree on them.
  const recursive = exportSettings.recursive !== false;
  const insertFileHeaders = exportSettings.insertFileHeaders !== false;
  const numberHeadings = exportSettings.numberHeadings !== false;
  const sortOrder = exportSettings.sortOrder || 'nameAsc';
  const setSortOrder = (order) => setExportSettings((prev) => ({ ...prev, sortOrder: order }));

  const outline = useMemo(() => getOutline(merged), [merged]);
  // What the structure tab shows: the generated pages the document carries, then
  // its headings. The pages are named by their own text, so the tree reads the
  // way the document does.
  const structure = useMemo(() => getDocumentOutline(merged, {
    cover: t('structure.cover'),
    toc: t('export.contents'),
    figures: t('export.figures'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [merged, lang]);
  const figures = useMemo(() => getFigures(merged), [merged]);
  // The preview shows the whole document the export produces — cover, contents,
  // figure index and body — built from the very text the Edit tab holds. It is
  // built only while it is the visible tab: running the whole document through
  // marked + DOMPurify on every keystroke was by far the biggest cost of typing
  // in the Edit tab, and nothing was looking at the result.
  const previewHtml = useMemo(
    () => (rightTab === 'preview'
      ? renderPreviewHtml(merged, { ...exportSettings, figureLabel: t('figure.label') })
      : ''),
    [merged, exportSettings, lang, rightTab],
  );

  // Document composition: the merged body plus the cover / contents / figure
  // index the settings ask for, all as editable Markdown (see markdown.js).
  // No `title` here on purpose: the cover names the document, not the other way
  // round (see documentTitle). Feeding the export name back into the cover would
  // make the two chase each other and rebuild the front matter — and throw away
  // manual cover edits — every time the name followed the title.
  function documentOpts() {
    return {
      ...exportSettings,
      contentsLabel: t('export.contents'),
      figuresLabel: t('export.figures'),
      figureLabel: t('figure.label'),
      coverDate: coverDateText(),
      dateStr: coverDateText(),
    };
  }

  // The settings store the cover date as the calendar picker's ISO value (or ''
  // for "today"); the cover shows it written out in the current language.
  function coverDateText() {
    const locale = lang === 'ko' ? 'ko-KR' : 'en-US';
    const raw = String(exportSettings.coverDate || '').trim();
    if (!raw) return new Date().toLocaleDateString(locale);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    // Anything typed by hand before this build is left exactly as it was.
    if (!m) return raw;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(locale);
  }

  // Live preview: re-merge automatically whenever the selection, order or merge
  // options change, so including / reordering files updates the result with no
  // manual step.
  //
  // Until the writer touches it. A merged document that has been edited by hand
  // is a document of its own, and rebuilding it from the sources would throw
  // that work away — which is what used to happen on something as ordinary as
  // ticking a file in the list. So once it is edited the automatic merge stops
  // and offers itself instead: `mergeStale` lights the toolbar's re-merge
  // button, and only pressing that rebuilds from the sources.
  const editedRef = useRef(false);
  const [edited, setEdited] = useState(false);
  const [mergeStale, setMergeStale] = useState(false);
  function markEdited() {
    if (!editedRef.current) { editedRef.current = true; setEdited(true); }
  }
  useEffect(() => {
    if (editedRef.current) {
      setMergeStale(true);
      setStatus(t('status.mergeStale'));
      return;
    }
    const chosen = files.filter((f) => f.checked);
    if (!chosen.length) { setMerged(''); return; }
    runMerge(chosen, ++mergeSeq.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, insertFileHeaders, numberHeadings]);

  // The explicit "merge again" action: the only thing that replaces an edited
  // document with a fresh merge of the sources.
  function remerge() {
    cancelEditorSync();
    editedRef.current = false;
    setEdited(false);
    setMergeStale(false);
    const chosen = files.filter((f) => f.checked);
    if (!chosen.length) { setMerged(''); return; }
    runMerge(chosen, ++mergeSeq.current);
  }

  // Chunked merge that yields to the event loop and surfaces a determinate
  // progress popup (only if it runs longer than a short delay, to avoid a flash
  // on small documents). `seq` guards against out-of-order/superseded runs.
  async function runMerge(chosen, seq) {
    const total = chosen.length;
    const nameOf = (f) => f.relPath || f.name;
    setMergeProg({ done: 0, total, file: total ? nameOf(chosen[0]) : '' });
    const timer = setTimeout(() => { if (seq === mergeSeq.current) setMergeOpen(true); }, 300);
    try {
      let out = await mergeFilesAsync(chosen, { insertFileHeaders }, (done, tot, name) => {
        if (seq === mergeSeq.current) setMergeProg({ done, total: tot, file: name });
      });
      if (seq !== mergeSeq.current) return; // a newer merge started; drop this one
      if (numberHeadings) out = renumberHeadings(out);
      if (seq !== mergeSeq.current) return;
      const built = buildDocument(out, documentOpts());
      resetHistory(built);
      setMerged(built);
      editedRef.current = false;
      setEdited(false);
      setMergeStale(false);
      setStatus(t('status.merged', { count: total }));
    } finally {
      clearTimeout(timer);
      if (seq === mergeSeq.current) { setMergeOpen(false); setMergeProg(null); }
    }
  }

  // The cover / contents / figure index are derived from the body and the export
  // settings, so they are rebuilt whenever those settings change — turning the
  // cover off, renaming the document or switching language updates the Edit tab
  // and the preview together. Body edits are kept; manual edits to the front
  // matter itself are replaced, the same way a re-merge replaces body edits.
  const frontKey = JSON.stringify([
    exportSettings.coverPage, exportSettings.coverTitle, exportSettings.coverVersion,
    exportSettings.coverAuthor, exportSettings.coverDate, exportSettings.coverShowVersion,
    exportSettings.coverShowAuthor, exportSettings.coverShowDate, exportSettings.headerText,
    exportSettings.showHeader, exportSettings.tocPage, exportSettings.figurePage, lang,
  ]);
  const frontKeyRef = useRef(frontKey);
  useEffect(() => {
    if (frontKeyRef.current === frontKey) return;
    frontKeyRef.current = frontKey;
    setMerged((prev) => {
      if (!prev.trim()) return prev;
      const next = refreshFrontMatter(prev, documentOpts());
      if (next === prev) return prev;
      const el = editorRef.current;
      if (el && el.value === prev) {
        const caret = el.selectionStart;
        el.replaceKeepingAnchor(next, {
          caret: mapCaretPos(prev, next, caret),
          mapPos: (p) => mapCaretPos(prev, next, p),
        });
      }
      const h = histRef.current;
      h.sel = mapCaretPos(prev, next, h.sel);
      h.changeAt = mapCaretPos(prev, next, h.changeAt ?? h.sel);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontKey]);

  const firstCheckedName = useMemo(() => {
    const f = files.find((x) => x.checked);
    return f ? f.name.replace(/\.(md|markdown)$/i, '') : '';
  }, [files]);

  // The document's name is the one written on its cover, so that is the export
  // name too — the settings title if there is one, otherwise the cover block's
  // own H1 (which the writer can retype in the Edit tab). Only a document with
  // no cover at all falls back to the first merged file's name, and a name the
  // user typed into the export box always wins.
  const documentTitle = useMemo(() => {
    const chosen = (exportSettings.coverTitle || '').trim();
    return chosen || firstHeadingText(splitDocument(merged).cover);
  }, [exportSettings.coverTitle, merged]);
  useEffect(() => {
    if (exportNameEdited.current) return;
    setExportName(documentTitle || firstCheckedName);
  }, [documentTitle, firstCheckedName]);

  // Runs `process(item, i)` over items sequentially, showing a determinate
  // progress popup (only if it takes longer than a short delay, to avoid flashes).
  async function withImportProgress(items, nameOf, process) {
    const total = items.length;
    setImportProg({ done: 0, total, file: total ? nameOf(items[0]) : '' });
    const timer = setTimeout(() => setImportOpen(true), 250);
    try {
      for (let i = 0; i < items.length; i++) {
        setImportProg({ done: i, total, file: nameOf(items[i]) });
        await process(items[i], i);
        setImportProg({ done: i + 1, total, file: nameOf(items[i]) });
      }
    } finally {
      clearTimeout(timer);
      setImportOpen(false);
      setImportProg(null);
    }
  }

  // Local images are pulled in as Base64 but stored out-of-line: the Markdown
  // only keeps a short `mmm-img:<n>` ref, so the Edit tab stays readable while
  // the preview and every export still render the real picture.
  const toImageRef = (uri, src) => (uri ? registerImage(uri, srcBaseName(src)) : null);

  // ── Import helpers (additive, deduped) ──────────────────
  function addImported(items) {
    let added = 0;
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.key));
      const additions = items
        .filter((it) => !seen.has(it.key))
        .map((it) => ({ ...it, id: nextId(), checked: true }));
      added = additions.length;
      let next = [...prev, ...additions];
      if (sortOrder !== 'custom') next = sortFiles(next, sortOrder);
      return next;
    });
    return added;
  }

  async function addFolder() {
    try {
      editorRef.current?.blur?.();
      if (isElectron) {
        const dir = await api.pickDirectory();
        if (!dir) return;
        const { files: scanned } = await api.scanMarkdown({ dir, recursive });
        const items = scanned.map((f) => ({
          key: f.fullPath, name: f.name, relPath: f.relPath, fullPath: f.fullPath,
          mtime: f.mtime, content: '',
        }));
        await withImportProgress(items, (it) => it.relPath || it.name, async (it) => {
          const raw = await api.readFile(it.fullPath);
          it.content = await embedImages(raw, async (src) =>
            toImageRef(await api.embedImage({ mdPath: it.fullPath, src }), src));
        });
        const added = addImported(items);
        setSourceDir(dir);
        setStatus(t('status.added', { count: added }));
      } else {
        folderInputRef.current?.click();
      }
    } catch (err) {
      reportError(t('toolbar.addFolder'), err);
    }
  }

  async function addFiles() {
    try {
      editorRef.current?.blur?.();
      if (isElectron) {
        const picked = await api.openFiles();
        if (!picked?.length) return;
        const items = picked.map((f) => ({
          key: f.fullPath, name: f.name, relPath: f.relPath, fullPath: f.fullPath,
          mtime: f.mtime, content: f.content,
        }));
        await withImportProgress(items, (it) => it.name, async (it) => {
          it.content = await embedImages(it.content, async (src) =>
            toImageRef(await api.embedImage({ mdPath: it.fullPath, src }), src));
        });
        const added = addImported(items);
        setStatus(t('status.added', { count: added }));
      } else {
        filesInputRef.current?.click();
      }
    } catch (err) {
      reportError(t('toolbar.addFiles'), err);
    }
  }

  async function onWebFolder(e) {
    const all = Array.from(e.target.files || []);
    const list = all.filter((f) => MD_RE.test(f.name));
    if (!list.length) { e.target.value = ''; return; }
    // Map of relative path -> image File for inlining local image links.
    const imgMap = new Map();
    for (const f of all) {
      const ext = f.name.split('.').pop().toLowerCase();
      if (IMAGE_EXTS.includes(ext)) imgMap.set(f.webkitRelativePath || f.name, f);
    }
    const items = [];
    await withImportProgress(list, (f) => f.webkitRelativePath || f.name, async (f) => {
      const relPath = f.webkitRelativePath || f.name;
      let content = await readFileText(f);
      content = await embedImages(content, async (src) => {
        const file = imgMap.get(resolveRelPath(relPath, src));
        return file ? toImageRef(await readFileDataURL(file), src) : null;
      });
      items.push({ key: relPath, name: f.name, relPath, mtime: f.lastModified, content });
    });
    const added = addImported(items);
    setSourceDir(list[0].webkitRelativePath?.split('/')[0] || '');
    setStatus(t('status.added', { count: added }) + ' ' + t('status.webFolderNote'));
    e.target.value = '';
  }

  async function onWebFiles(e) {
    const list = Array.from(e.target.files || []).filter((f) => MD_RE.test(f.name));
    if (!list.length) { e.target.value = ''; return; }
    const items = await Promise.all(list.map(async (f) => ({
      key: f.name + ':' + f.size + ':' + f.lastModified,
      name: f.name, relPath: f.name, mtime: f.lastModified,
      content: await readFileText(f),
    })));
    const added = addImported(items);
    setStatus(t('status.added', { count: added }));
    e.target.value = '';
  }

  // ── File list operations ────────────────────────────────
  const toggle = (id) => setFiles((p) => p.map((f) => f.id === id ? { ...f, checked: !f.checked } : f));
  const checkAll = (v) => setFiles((p) => p.map((f) => ({ ...f, checked: v })));
  const remove = (id) => setFiles((p) => p.filter((f) => f.id !== id));
  const removeChecked = () => setFiles((p) => p.filter((f) => !f.checked));

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= files.length) return;
    setFiles((p) => {
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setSortOrder('custom');
  };
  const reorder = (from, to) => {
    setFiles((p) => {
      const next = [...p];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setSortOrder('custom');
  };

  // The order is a setting, and it can change in the settings window too — so
  // the list follows the setting rather than the toolbar's onChange.
  const sortedBy = useRef(sortOrder);
  useEffect(() => {
    if (sortedBy.current === sortOrder) return;
    sortedBy.current = sortOrder;
    if (sortOrder !== 'custom') setFiles((p) => sortFiles(p, sortOrder));
  }, [sortOrder]);

  function onSortChange(order) {
    setSortOrder(order);
  }

  // ── Actions ─────────────────────────────────────────────
  // The contents and figure index follow the headings on their own — they are
  // generated lists, and stale ones are worse than useless. Heading NUMBERS are
  // not touched here: renumbering rewrites lines the writer is working on, so it
  // happens when they ask for it (the toolbar's renumber button) or when a merge
  // builds the document. This pass only ever rewrites the index rows, in place;
  // the cover, the body text and the spacing stay exactly as typed.
  useEffect(() => {
    if (!merged.trim()) return undefined;
    const timer = setTimeout(() => {
      // The writer has typed since this text settled — rewriting the textarea
      // now would fight them. It runs again after the next settle.
      const el = editorRef.current;
      if (el && el.value !== merged) return;
      const next = refreshGenerated(merged, documentOpts(), { renumber: false });
      if (next === merged) return;
      const caret = el ? el.selectionStart : 0;
      histRef.current.fold = true;
      histRef.current.sel = mapCaretPos(merged, next, histRef.current.sel);
      histRef.current.changeAt = mapCaretPos(merged, next, histRef.current.changeAt ?? histRef.current.sel);
      if (el) {
        el.replaceKeepingAnchor(next, {
          caret: mapCaretPos(merged, next, caret),
          mapPos: (p) => mapCaretPos(merged, next, p),
        });
      }
      setMerged(next);
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merged, frontKey]);

  // Renumber on request: every heading gets a fresh hierarchical number and the
  // contents / figure index follow. The one place that rewrites heading lines.
  function renumberNow() {
    const text = currentText();
    if (!text.trim()) return;
    const next = refreshGenerated(text, documentOpts(), { renumber: true });
    if (next === text) { setStatus(t('status.numbered')); return; }
    const el = editorOnScreen();
    const caret = el ? el.selectionStart : 0;
    if (el) {
      el.replaceKeepingAnchor(next, {
        caret: mapCaretPos(text, next, caret),
        mapPos: (p) => mapCaretPos(text, next, p),
      });
    }
    markEdited();
    setMerged(next);
    setStatus(t('status.numbered'));
    notify(t('toast.numbered'));
  }

  // Maps a caret through a generated-block rewrite. Only the cover / contents /
  // figure index above the body change length, so the anchor is the caret's
  // line and column within the body.
  function mapCaretPos(oldText, newText, caret) {
    const oldBody = splitDocument(oldText).body;
    const newBody = splitDocument(newText).body;
    const oldStart = oldText.lastIndexOf(oldBody);
    const newStart = newText.lastIndexOf(newBody);
    if (oldStart < 0 || newStart < 0 || caret < oldStart) {
      return Math.min(caret, newText.length);
    }
    const before = oldBody.slice(0, caret - oldStart);
    const line = before.split('\n').length - 1;
    const col = (caret - oldStart) - (before.lastIndexOf('\n') + 1);
    const oldLines = oldBody.split('\n');
    const newLines = newBody.split('\n');
    if (line >= newLines.length) return newText.length;
    const delta = newLines[line].length - (oldLines[line] || '').length;
    const nc = Math.max(0, Math.min(newLines[line].length, col > 0 ? col + delta : col));
    let pos = newStart;
    for (let i = 0; i < line; i++) pos += newLines[i].length + 1;
    return pos + nc;
  }

  function restoreCaret(oldText, newText, caret) {
    const el = editorRef.current;
    if (!el) return;
    const pos = mapCaretPos(oldText, newText, caret);
    el.setSelectionRange(pos, pos);
  }

  const EXPORTERS = {
    md: { label: 'export.md', icon: IconMd, run: (m, o) => exportMarkdown(m, exportName, o) },
    html: { label: 'export.html', icon: IconHtml, run: (m, o) => exportHtml(m, o, exportName) },
    pdf: { label: 'export.pdf', icon: IconPdf, run: (m, o) => exportPdf(m, o, exportName) },
    word: { label: 'export.word', icon: IconWord, run: (m, o) => exportWord(m, o, exportName) },
  };

  function buildExportOpts() {
    // Use the freshest settings so the export matches the preview / settings:
    // defaults < persisted localStorage < live state (updated via the settings
    // window's storage event). The live state wins so the chosen font, size and
    // spacing always reach the export.
    const fresh = { ...DEFAULT_EXPORT_SETTINGS, ...loadSettings(), ...exportSettings };
    setExportSettings(fresh);
    return {
      ...fresh,
      contentsLabel: t('export.contents'),
      figuresLabel: t('export.figures'),
      figureLabel: t('figure.label'),
      appName: t('app.title'),
      dateStr: new Date().toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US'),
    };
  }

  async function doExport(fmt) {
    setExportOpen(false);
    if (!merged) return;
    const ex = EXPORTERS[fmt];
    setStatus(t('status.exporting', { fmt: t(ex.label) }));
    setExporting(t(ex.label));
    try {
      const text = flushEditor();
      const saved = await ex.run(text, buildExportOpts());
      if (saved) {
        // The document now matches a file on disk, so it is no longer "unsaved".
        savedTextRef.current = text;
        setStatus(t('status.exported', { path: saved }));
        setExportResult({
          status: 'success',
          fmt: t(ex.label),
          path: String(saved),
          note: (fmt === 'pdf' && !isElectron) ? t('status.pdfWebNote') : '',
        });
      } else {
        setStatus(t('status.exportCancel'));
      }
    } catch (err) {
      setStatus(t('status.exportErr', { msg: err?.message || String(err) }));
      reportError(t(ex.label), err);
    } finally {
      setExporting(null);
    }
  }

  // ── Unsaved changes / quitting ──────────────────────────
  const isDirty = !!merged.trim() && merged !== savedTextRef.current;
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  // Electron holds the window close back and asks here first; the web build can
  // only fall back to the browser's own "leave site?" prompt.
  useEffect(() => {
    if (isElectron && api.win?.onRequestClose) {
      return api.win.onRequestClose(() => {
        if (!dirtyRef.current) { api.win.confirmClose(); return; }
        // Tell the main process the question is on screen, so its "renderer did
        // not answer" fallback does not close the window out from under it.
        api.win.holdClose?.();
        setCloseAsk(true);
      });
    }
    const onBeforeUnload = (e) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // "Save" on exit means exporting the document as Markdown. A cancelled save
  // dialog leaves the app open, so nothing is lost by accident.
  // Save the document as it stands. The first save asks where to put it (and
  // remembers); after that it writes straight over that file, the way Ctrl+S is
  // expected to behave. The bytes are exactly what a Markdown export writes, so
  // the file can be read back into the app unchanged. The web build cannot write
  // to a path it was handed earlier, so there every save is a download.
  // Reads the editor's text and makes it the document state right away, so an
  // action taken mid-typing works on what is on screen, not on what React last
  // heard about.
  function flushEditor() {
    const text = currentText();
    cancelEditorSync();
    if (text !== merged) setMerged(text);
    return text;
  }

  async function saveDocument({ saveAs = false } = {}) {
    if (!merged.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const text = flushEditor();
      let path = null;
      if (!saveAs && docPathRef.current && canWriteInPlace) {
        path = await saveMarkdownTo(text, docPathRef.current);
      }
      if (!path) {
        path = await exportMarkdown(text, exportName);
        if (!path) return;                       // cancelled in the dialog
        if (canWriteInPlace) { docPathRef.current = path; setDocPath(path); }
      }
      savedTextRef.current = text;
      setStatus(t('status.saved', { path }));
      notify(t('toast.saved'), { message: path });
    } catch (err) {
      reportError(t('tip.save'), err);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  saveRef.current = saveDocument;
  printRef.current = doPrint;

  // Frameless windows have no OS grip in the corner, so the status bar draws one
  // and drives the resize itself: the pointer's movement across the screen is
  // added to the window size the drag started from.
  function startResize(e) {
    if (!isElectron || !api.win?.getSize) return;
    e.preventDefault();
    const el = e.currentTarget;
    const pid = e.pointerId;
    const startX = e.screenX;
    const startY = e.screenY;
    api.win.getSize().then((size) => {
      const [w0, h0] = size || [0, 0];
      const move = (ev) => api.win.setSize({
        width: w0 + (ev.screenX - startX),
        height: h0 + (ev.screenY - startY),
      });
      const up = () => {
        try { el.releasePointerCapture(pid); } catch { /* already released */ }
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      };
      try { el.setPointerCapture(pid); } catch { /* not captured; edge case */ }
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }

  // Print what the preview shows. The heavy part (pagination) happens in the
  // export pipeline, so this only has to guard against a second click.
  async function doPrint() {
    if (!merged.trim() || printingRef.current) return;
    printingRef.current = true;
    setPrinting(true);
    setStatus(t('status.printing'));
    try {
      const r = await printDocument(flushEditor(), buildExportOpts(), exportName);
      // A dialog the user closed is not a failure worth a red box.
      setStatus(r && r.success === false
        ? t('status.printCancel')
        : t('status.printed'));
    } catch (err) {
      setStatus(t('status.ready'));
      reportError(t('tip.print'), err);
    } finally {
      printingRef.current = false;
      setPrinting(false);
    }
  }

  async function saveThenClose() {
    setCloseBusy(true);
    try {
      const text = flushEditor();
      const saved = await exportMarkdown(text, exportName);
      if (!saved) { setCloseBusy(false); return; }
      savedTextRef.current = text;
      discardAndClose();
    } catch (err) {
      setCloseBusy(false);
      setCloseAsk(false);
      reportError(t('export.md'), err);
    }
  }

  function discardAndClose() {
    setCloseBusy(false);
    setCloseAsk(false);
    if (isElectron && api.win?.confirmClose) api.win.confirmClose();
    else window.close();
  }

  function clearAll() {
    cancelEditorSync();
    setFiles([]);
    docPathRef.current = '';
    setDocPath('');
    savedTextRef.current = '';
    resetHistory('');
    editedRef.current = false;
    setEdited(false);
    setMergeStale(false);
    setMerged('');
    setSourceDir('');
    clearImages();
    setActiveFigure(-1);
    setStatus(t('status.cleared'));
  }

  // Selects a range in the editor AND brings it into view.
  function selectInEditor(el, start, end) {
    el.focus();
    el.setSelectionRange(start, end);
    el.scrollSelectionIntoView?.();
  }

  // Jump to a heading without leaving the tab the writer is working in: select
  // its line in the editor, or scroll to it in the preview.
  function scrollToHeading(h) {
    // A generated page (cover / contents / figure index) is addressed by its
    // section id — it has no heading number and no `h-N` anchor.
    if (h.section) {
      const el = editorOnScreen();
      if (el) {
        const live = getDocumentOutline(el.value).find((x) => x.section === h.section) || h;
        const lines = el.value.split("\n");
        const start = lines.slice(0, live.line).reduce((n, l) => n + l.length + 1, 0);
        selectInEditor(el, start, start + (lines[live.line] || '').length);
        return;
      }
      showTab('preview');
      requestAnimationFrame(() => {
        previewRef.current?.querySelector(`#sec-${h.section}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }
    const el = editorOnScreen();
    if (el) {
      // The outline is built from the settled text, which can be a line behind —
      // so find the heading again in the text that is in the editor right now.
      const live = getOutline(el.value).find((x) => x.index === h.index) || h;
      const lines = el.value.split("\n");
      const start = lines.slice(0, live.line).reduce((n, l) => n + l.length + 1, 0);
      selectInEditor(el, start, start + (lines[live.line] || '').length);
      return;
    }
    showTab('preview');
    requestAnimationFrame(() => {
      const el = previewRef.current?.querySelector(`#h-${h.index}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Contents / figure-index entries are in-document links. Scroll the preview
  // instead of letting the browser change the location hash — the app uses the
  // hash to tell the main window from the settings window.
  function previewLinkClick(e) {
    const a = e.target.closest?.('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute('href').slice(1);
    const el = id && previewRef.current?.querySelector(`#${CSS.escape(id)}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Picking a figure follows whichever pane is open: it scrolls the preview to
  // the picture, or selects the image link in the editor (so you can see and
  // change the reference that produced it).
  function gotoFigure(f) {
    setActiveFigure(f.index);
    const el = editorOnScreen();
    if (el) {
      // Same reason as resizeFigure: select using offsets read from the text
      // that is actually in the editor right now.
      const live = getFigures(el.value).find((x) => x.index === f.index) || f;
      selectInEditor(el, live.start, live.start + live.length);
      return;
    }
    showTab('preview');
    requestAnimationFrame(() => {
      const el = previewRef.current?.querySelector(`#fig-${f.index}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // Resizing a figure rewrites its Markdown in place (a `w=NN%` size hint), so
  // the change shows up in the editor text, the preview and every export.
  function resizeFigure(f, percent) {
    // `figures` can be a moment behind the text, and setFigureWidth splices by
    // offset — so find the figure again in the text as it is right now.
    const base = currentText();
    const live = getFigures(base).find((x) => x.index === f.index);
    if (live) putEditorText(setFigureWidth(base, live, percent));
    setActiveFigure(f.index);
  }

  // Highlights the figure the editor caret currently sits in, so moving through
  // the text shows the matching picture in the sidebar.
  // The editor stays mounted (hidden on the preview tab), so "go to this item"
  // follows the visible tab rather than whether the DOM node exists.
  function editorOnScreen() {
    if (rightTab !== 'edit') return null;
    const el = editorRef.current;
    return el && el.isConnected ? el : null;
  }

  // Switching panes finishes the line first, so the preview always renders what
  // is actually in the editor — and so the preview is built once, on the way in,
  // rather than on any keystroke.
  function showTab(tab) {
    if (tab !== 'edit') settleNow();
    if (tab === 'edit') setEditorReady(true);
    setRightTab(tab);
  }

  // The document as it is at this instant: while the Edit tab is up, that is the
  // textarea's own value, which can be a moment ahead of `merged`.
  function currentText() {
    const el = editorOnScreen();
    if (!el || !el.isFilled) return merged;
    return el.value;
  }

  function cancelEditorSync() {
    clearTimeout(settleTimer.current);
    settleTimer.current = 0;
  }

  // The editor's text becomes the document. A functional update, because this
  // usually runs from a timer whose closure holds an older `merged`.
  function settleNow() {
    cancelEditorSync();
    const el = editorRef.current;
    if (!el || composingRef.current || !el.isReady) return;
    // A remounted / not-yet-written editor is empty. Treating that as the
    // document would wipe the merge the sidebar just showed.
    if (!el.isFilled) {
      if (merged) fillEditorFromMerged();
      return;
    }
    const text = el.value;
    const sel = el.selectionStart;
    if (figures.length) {
      const hit = figures.find((f) => sel >= f.start && sel <= f.start + f.length);
      setActiveFigure(hit ? hit.index : -1);
    }
    // Keep hist.sel in the CURRENT document's coordinates until the history
    // effect records the past entry. The live caret belongs to the new text.
    if (text === histRef.current.current) {
      histRef.current.sel = sel;
      return;
    }
    pendingSelRef.current = sel;
    setMerged((prev) => (prev === text ? prev : text));
  }

  function fillEditorFromMerged() {
    const el = editorRef.current;
    if (!el || composingRef.current || !el.isReady) return;
    if (el.value === merged) return;
    // Undo wrote `merged` but the view was empty (e.g. first fill). Follow the
    // restored change rather than pinning whatever caret the empty view had.
    if (histRef.current.apply) {
      const pos = Math.min(histRef.current.sel, merged.length);
      el.replaceAndReveal(merged, pos, pos);
      return;
    }
    const start = Math.min(el.selectionStart, merged.length);
    const end = Math.min(el.selectionEnd, merged.length);
    el.replaceKeepingView(merged, start, end);
  }

  function settleIn(ms) {
    cancelEditorSync();
    settleTimer.current = setTimeout(settleNow, ms);
  }

  // Replaces the editor's text from an action rather than a keystroke. The
  // textarea is written directly — waiting for the push-back effect would race
  // the requestAnimationFrame that puts the caret where the action wants it.
  function putEditorText(text, start, end) {
    const el = editorRef.current;
    cancelEditorSync();
    if (el) {
      if (start != null) {
        el.replaceKeepingView(text, start, end ?? start);
        el.focus();
      } else {
        el.value = text;
      }
    }
    markEdited();
    setMerged(text);
  }

  // Typing costs exactly this: one flag and one timer. The first keystroke's
  // "edited" badge is deferred so a React render cannot land inside an IME
  // composition. After that, no state update at all.
  function onEditorInput() {
    if (!editedRef.current) queueMicrotask(markEdited);
    if (composingRef.current) return;   // never interrupt IME composition
    settleIn(SETTLE_IDLE_MS);
  }

  function onCompositionEnd() {
    composingRef.current = false;
    onEditorInput();
  }

  // Changes that came from somewhere other than the keyboard — a merge, an undo,
  // the automatic renumber, a settings change — have to be pushed into the
  // editor, because nothing else writes to it any more.
  useLayoutEffect(() => {
    fillEditorFromMerged();
  }, [merged, rightTab]);

  useEffect(() => {
    if (rightTab === 'edit') editorRef.current?.requestMeasure?.();
  }, [rightTab]);

  function syncFigureToCaret() {
    const el = editorRef.current;
    if (!el) return;
    histRef.current.sel = el.selectionStart;   // where undo should put the caret
    if (!figures.length) return;
    const pos = el.selectionStart;
    const hit = figures.find((f) => pos >= f.start && pos <= f.start + f.length);
    setActiveFigure(hit ? hit.index : -1);
  }

  // ── Toolbar quick settings ──────────────────────────────
  // The same export settings the settings window holds, one click away. They
  // persist and sync exactly like the ones changed in that window.
  const onOff = (key) => exportSettings[key] !== false;
  function toggleExportSetting(key) {
    setExportSettings((prev) => ({ ...prev, [key]: !(prev[key] !== false) }));
  }
  function bumpFontSize(delta) {
    setExportSettings((prev) => ({
      ...prev,
      fontSizePt: Math.min(40, Math.max(6, (Number(prev.fontSizePt) || 10) + delta)),
    }));
  }
  const optTitle = (labelKey, key) =>
    `${t(labelKey)} — ${onOff(key) ? t('opts.on') : t('opts.off')}`;
  // Header / footer are a switch over a piece of text, so the tooltip shows the
  // text as well — and says where to type one when there is none yet.
  const optHint = (labelKey, key, text) => {
    const body = String(text || '').trim();
    return `${optTitle(labelKey, key)}${body ? ` — ${body}` : ` (${t('opts.noText')})`}`;
  };

  // ── Document zoom ───────────────────────────────────────
  function applyZoom(next) {
    const n = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next)));
    setZoom(n);
    localStorage.setItem('mmm-zoom', String(n));
  }
  const zoomIn = () => applyZoom(zoom + ZOOM_STEP);
  const zoomOut = () => applyZoom(zoom - ZOOM_STEP);
  const zoomReset = () => applyZoom(100);

  // The window may never be narrower than its own toolbar. Rather than keep a
  // hand-measured constant in sync with every button anyone adds, measure the
  // row that was actually laid out — in the language and font in use — and tell
  // the main process. The spacer is skipped: it is the slack, not content.
  useEffect(() => {
    if (!isElectron || !api.win?.setMinWidth) return undefined;
    let cancelled = false;
    const measure = () => {
      const el = toolbarRef.current;
      if (cancelled || !el) return;
      const cs = getComputedStyle(el);
      const gap = parseFloat(cs.columnGap) || parseFloat(cs.gap) || 0;
      const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      let content = 0;
      for (const child of el.children) {
        if (child.classList.contains('toolbar-spacer')) continue;
        content += child.getBoundingClientRect().width;
      }
      const gaps = gap * Math.max(0, el.children.length - 1);
      // Whatever the window frame adds around the page, plus a little slack.
      const chrome = Math.max(0, window.outerWidth - window.innerWidth);
      api.win.setMinWidth(Math.ceil(content + gaps + pad + chrome) + 8);
    };
    // After layout, and again once webfonts have settled (label widths change).
    const id = requestAnimationFrame(measure);
    document.fonts?.ready?.then(measure).catch(() => {});
    return () => { cancelled = true; cancelAnimationFrame(id); };
    // Language changes the label widths, so measure again.
  }, [lang]);

  // Ctrl+S and Ctrl +/-/0 and Ctrl+wheel, the shortcuts people already expect.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      // Ctrl+S saves, Ctrl+Shift+S saves under a new name. The editor's own
      // key handler lets these through so they work while typing too.
      if (k === 's') { e.preventDefault(); saveRef.current?.({ saveAs: e.shiftKey }); }
      else if (k === 'p') { e.preventDefault(); printRef.current?.(); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn(); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomOut(); }
      else if (e.key === '0') { e.preventDefault(); zoomReset(); }
    };
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      applyZoom(zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  function toggleLang() { changeLang(lang === 'ko' ? 'en' : 'ko'); }
  function changeLang(next) {
    i18n.changeLanguage(next);
    localStorage.setItem('mmm-lang', next);
    setLang(next);
    saveSettingsToDisk();
  }
  function cycleTheme() {
    const i = THEME_IDS.indexOf(theme);
    setTheme(THEME_IDS[(i + 1) % THEME_IDS.length]);
  }
  function openSettings() {
    if (isElectron) {
      api.openSettings();
    } else {
      const url = `${window.location.pathname}${window.location.search}#settings`;
      window.open(url, 'mmm-settings', 'width=1240,height=585,resizable=no');
    }
  }

  function openAbout() {
    if (isElectron) {
      api.openAbout();
    } else {
      const url = `${window.location.pathname}${window.location.search}#about`;
      window.open(url, 'mmm-about', 'width=520,height=400,resizable=no');
    }
  }

  // ── Context menus ───────────────────────────────────────
  const openCtx = (e, items) => { e.preventDefault(); e.stopPropagation(); setCtx({ open: true, x: e.clientX, y: e.clientY, items }); };
  const closeCtx = () => setCtx((c) => ({ ...c, open: false }));

  async function copyText(text) {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  }
  function selectionText() { return window.getSelection?.().toString() || ''; }

  function fileRowMenu(e, file, index) {
    openCtx(e, [
      { icon: file.checked ? IconSquare : IconCheckSquare, label: file.checked ? t('files.uncheckThis') : t('files.checkThis'), onClick: () => toggle(file.id) },
      { icon: IconUp, label: t('files.moveUp'), disabled: index === 0, onClick: () => move(index, -1) },
      { icon: IconDown, label: t('files.moveDown'), disabled: index === files.length - 1, onClick: () => move(index, 1) },
      { icon: IconX, label: t('files.remove'), danger: true, onClick: () => remove(file.id) },
      { icon: IconTrash, label: t('files.removeChecked'), danger: true, disabled: !files.some((f) => f.checked), onClick: removeChecked },
      { separator: true },
      { icon: IconCheckSquare, label: t('files.checkAll'), onClick: () => checkAll(true) },
      { icon: IconSquare, label: t('files.uncheckAll'), onClick: () => checkAll(false) },
    ]);
  }

  function outlineMenu(e, h) {
    openCtx(e, [
      { icon: IconTarget, label: t('ctx.goto'), onClick: () => scrollToHeading(h) },
      { icon: IconCopy, label: t('ctx.copyHeading'), onClick: () => copyText(h.text) },
      { separator: true },
      { icon: IconTrash, label: t('files.removeChecked'), danger: true, disabled: !files.some((f) => f.checked), onClick: removeChecked },
    ]);
  }

  function figureMenu(e, f) {
    openCtx(e, [
      { icon: IconTarget, label: t('ctx.goto'), onClick: () => gotoFigure(f) },
      { icon: IconCopy, label: t('ctx.copyCaption'), disabled: !f.caption, onClick: () => copyText(f.caption) },
    ]);
  }

  // Zoom + export entries both panes share, so the two menus stay consistent.
  const zoomItems = () => [
    { icon: IconZoomIn, label: `${t('tip.zoomIn')} (Ctrl +)`, disabled: zoom >= ZOOM_MAX, onClick: zoomIn },
    { icon: IconZoomOut, label: `${t('tip.zoomOut')} (Ctrl −)`, disabled: zoom <= ZOOM_MIN, onClick: zoomOut },
    { icon: IconTarget, label: `${t('tip.zoomReset')} (Ctrl 0) — ${zoom}%`, disabled: zoom === 100, onClick: zoomReset },
  ];
  const exportItems = () => Object.entries(EXPORTERS).map(([fmt, ex]) => ({
    icon: ex.icon, label: t(ex.label), disabled: !merged, onClick: () => doExport(fmt),
  }));

  function previewMenu(e) {
    const sel = selectionText();
    openCtx(e, [
      { icon: IconCopy, label: t('ctx.copy'), disabled: !sel, onClick: () => copyText(sel) },
      { icon: IconCopy, label: t('ctx.copyAll'), disabled: !merged, onClick: () => copyText(previewRef.current?.innerText || '') },
      { icon: IconSelectAll, label: t('ctx.selectAll'), disabled: !merged, onClick: selectPreviewAll },
      { separator: true },
      ...zoomItems(),
      { separator: true },
      { icon: IconMd, label: t('ctx.toEdit'), disabled: !merged, onClick: () => showTab('edit') },
      { separator: true },
      { icon: IconSave, label: `${t('tip.save')} (Ctrl S)`, disabled: !merged || saving, onClick: () => saveDocument() },
      { icon: IconPrint, label: `${t('tip.print')} (Ctrl P)`, disabled: !merged || printing, onClick: doPrint },
      { separator: true },
      ...exportItems(),
    ]);
  }

  function editorMenu(e) {
    const el = editorRef.current;
    const hasSel = el && el.selectionStart !== el.selectionEnd;
    openCtx(e, [
      { icon: IconCut, label: t('ctx.cut'), disabled: !hasSel, onClick: editorCut },
      { icon: IconCopy, label: t('ctx.copy'), disabled: !hasSel, onClick: () => copyText(el?.value.slice(el.selectionStart, el.selectionEnd)) },
      { icon: IconPaste, label: t('ctx.paste'), onClick: editorPaste },
      { icon: IconSelectAll, label: t('ctx.selectAll'), onClick: () => el?.select() },
      { separator: true },
      { icon: IconUndo, label: `${t('ctx.undo')} (Ctrl Z)`, disabled: !history.canUndo, onClick: undo },
      { icon: IconRedo, label: `${t('ctx.redo')} (Ctrl Y)`, disabled: !history.canRedo, onClick: redo },
      { separator: true },
      ...zoomItems(),
      { separator: true },
      { icon: IconHtml, label: t('ctx.toPreview'), disabled: !merged, onClick: () => showTab('preview') },
      { separator: true },
      { icon: IconSave, label: `${t('tip.save')} (Ctrl S)`, disabled: !merged || saving, onClick: () => saveDocument() },
      { icon: IconPrint, label: `${t('tip.print')} (Ctrl P)`, disabled: !merged || printing, onClick: doPrint },
      { separator: true },
      ...exportItems(),
    ]);
  }

  // Selects the whole rendered preview (the browser selection, so Copy works).
  function selectPreviewAll() {
    const el = previewRef.current;
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }


  // ── Markdown toolbar (Edit tab) ─────────────────────────
  // Every action runs on the textarea's current value and puts the selection
  // back where it belongs, so the writer never loses their place. Headings stop
  // at H5 — the document format does not use H6.
  const HEADING_LEVELS = [1, 2, 3, 4, 5];

  function editorApply(transform) {
    const el = editorRef.current;
    if (!el) return;
    const out = transform({ value: el.value, start: el.selectionStart, end: el.selectionEnd });
    if (!out) return;
    putEditorText(out.text, out.start, out.end ?? out.start);
  }

  // Start/end offsets of the whole lines the selection touches.
  function lineRange(text, start, end) {
    const from = text.lastIndexOf('\n', start - 1) + 1;
    const nl = text.indexOf('\n', end);
    return [from, nl < 0 ? text.length : nl];
  }

  // Sets every touched line to `level`; pressing the level a line already has
  // takes the heading off again.
  function applyHeading(level) {
    editorApply(({ value, start, end }) => {
      const [from, to] = lineRange(value, start, end);
      const next = value.slice(from, to).split('\n').map((line) => {
        const m = line.match(/^(#{1,6})\s+(.*)$/);
        const body = m ? m[2] : line.replace(/^\s+/, '');
        if (m && m[1].length === level) return body;
        return `${'#'.repeat(level)} ${body}`;
      }).join('\n');
      return { text: value.slice(0, from) + next + value.slice(to), start: from, end: from + next.length };
    });
  }

  // Wraps the selection (bold, italic, code …), or unwraps it if already wrapped.
  function applyWrap(before, after = before) {
    editorApply(({ value, start, end }) => {
      const sel = value.slice(start, end);
      if (sel.length >= before.length + after.length && sel.startsWith(before) && sel.endsWith(after)) {
        const inner = sel.slice(before.length, sel.length - after.length);
        return { text: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
      }
      return {
        text: value.slice(0, start) + before + sel + after + value.slice(end),
        start: start + before.length,
        end: start + before.length + sel.length,
      };
    });
  }

  // Toggles a line prefix (list item, quote) across the selected lines.
  function applyLinePrefix(prefix, ordered = false) {
    editorApply(({ value, start, end }) => {
      const [from, to] = lineRange(value, start, end);
      const lines = value.slice(from, to).split('\n');
      const rx = ordered ? /^\d+\.\s+/ : new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
      const on = lines.every((l) => rx.test(l));
      const next = lines
        .map((l, i) => (on ? l.replace(rx, '') : (ordered ? `${i + 1}. ` : prefix) + l))
        .join('\n');
      return { text: value.slice(0, from) + next + value.slice(to), start: from, end: from + next.length };
    });
  }

  // Drops a block (code fence, table, rule) in on its own line. `select` is the
  // placeholder to leave highlighted, if any.
  function insertBlock(block, select) {
    editorApply(({ value, start }) => {
      const lead = start === 0 || value[start - 1] === '\n' ? '' : '\n';
      const text = value.slice(0, start) + lead + block + value.slice(start);
      const base = start + lead.length;
      const at = select ? block.indexOf(select) : -1;
      return at >= 0
        ? { text, start: base + at, end: base + at + select.length }
        : { text, start: base + block.length };
    });
  }

  // A link/image keeps the selected text as the label and highlights the URL.
  function insertLink(image) {
    editorApply(({ value, start, end }) => {
      const label = value.slice(start, end) || (image ? t('md.imageAlt') : t('md.linkText'));
      const url = 'https://';
      const snippet = `${image ? '!' : ''}[${label}](${url})`;
      const text = value.slice(0, start) + snippet + value.slice(end);
      const at = start + snippet.length - url.length - 1;
      return { text, start: at, end: at + url.length };
    });
  }

  const MD_TOOLS = [
    { key: 'bold', label: 'B', cls: 'md-b', run: () => applyWrap('**') },
    { key: 'italic', label: 'I', cls: 'md-i', run: () => applyWrap('*') },
    { key: 'strike', label: 'S', cls: 'md-s', run: () => applyWrap('~~') },
    { key: 'code', label: '`', cls: 'md-mono', run: () => applyWrap('`') },
    { sep: true },
    { key: 'list', label: '•', run: () => applyLinePrefix('- ') },
    { key: 'ordered', label: '1.', cls: 'md-mono', run: () => applyLinePrefix('', true) },
    { key: 'quote', label: '❝', run: () => applyLinePrefix('> ') },
    { sep: true },
    { key: 'link', label: '🔗', run: () => insertLink(false) },
    { key: 'image', label: '🖼', run: () => insertLink(true) },
    { key: 'codeBlock', label: '{ }', cls: 'md-mono', run: () => insertBlock('```\n\n```\n', '') },
    { key: 'table', label: '▦', run: () => insertBlock('| A | B |\n| --- | --- |\n|  |  |\n', 'A') },
    { key: 'rule', label: '―', run: () => insertBlock('\n---\n') },
  ];

  // Ctrl+B / Ctrl+I, and Ctrl+1…5 for the heading levels.
  function editorKeyDown(e) {
    if (!(e.ctrlKey || e.metaKey) && LINE_DONE_KEYS.has(e.key)) { settleIn(SETTLE_LINE_MS); return; }
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    // Save / print are handled here as well as on the window, so they work even
    // if something in between swallows the event — but then the window must not
    // see them as well, or the action runs twice.
    if (k === 's') { e.preventDefault(); e.stopPropagation(); saveDocument({ saveAs: e.shiftKey }); }
    else if (k === 'p') { e.preventDefault(); e.stopPropagation(); doPrint(); }
    else if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    else if (k === 'b') { e.preventDefault(); applyWrap('**'); }
    else if (k === 'i') { e.preventDefault(); applyWrap('*'); }
    else if (HEADING_LEVELS.includes(Number(k))) { e.preventDefault(); applyHeading(Number(k)); }
  }

  function replaceSelection(text) {
    const el = editorRef.current;
    if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const next = el.value.slice(0, s) + text + el.value.slice(e);
    putEditorText(next, s + text.length);
  }
  async function editorCut() {
    const el = editorRef.current;
    if (!el) return;
    await copyText(el.value.slice(el.selectionStart, el.selectionEnd));
    replaceSelection('');
  }
  async function editorPaste() {
    try { const text = await navigator.clipboard.readText(); if (text) replaceSelection(text); } catch { /* ignore */ }
  }

  const checkedCount = files.filter((f) => f.checked).length;
  const stats = useMemo(() => {
    const trimmed = merged.trim();
    return {
      chars: merged.length,
      words: trimmed ? trimmed.split(/\s+/).length : 0,
    };
  }, [merged]);
  const ThemeIcon = THEME_ICONS[theme] || IconSun;

  // The sidebar lists are memoised (they can be hundreds of rows), so every
  // handler they receive has to keep the same identity between renders.
  const onFileToggle = useEvent(toggle);
  const onFileCheckAll = useEvent(checkAll);
  const onFileRemove = useEvent(remove);
  const onFileRemoveChecked = useEvent(removeChecked);
  const onFileMove = useEvent(move);
  const onFileReorder = useEvent(reorder);
  const onFileMenu = useEvent(fileRowMenu);
  const onHeadingSelect = useEvent(scrollToHeading);
  const onHeadingMenu = useEvent(outlineMenu);
  const onFigureSelect = useEvent(gotoFigure);
  const onFigureResize = useEvent(resizeFigure);
  const onFigureMenu = useEvent(figureMenu);

  editorCbs.current = {
    onInput: onEditorInput,
    onCompositionStart: () => { composingRef.current = true; },
    onCompositionEnd,
    onClick: () => { syncFigureToCaret(); settleIn(SETTLE_LINE_MS); },
    onBlur: settleNow,
    onKeyDown: editorKeyDown,
    onContextMenu: editorMenu,
    onReady: fillEditorFromMerged,
  };

  return (
    <div className="app">
      <TitleBar title={t('app.title')} />

      {/* hidden web inputs */}
      <input ref={folderInputRef} type="file" webkitdirectory="" directory="" multiple
        style={{ display: 'none' }} onChange={onWebFolder} />
      <input ref={filesInputRef} type="file" accept=".md,.markdown" multiple
        style={{ display: 'none' }} onChange={onWebFiles} />

      <header className="toolbar" ref={toolbarRef}>
        <div className="toolbar-group">
          {/* Icon only: the tooltip names them, and the width goes to the
              document instead. */}
          <button className="iconbtn" title={`${t('toolbar.addFolder')} — ${t('tip.addFolder')}`}
            onClick={addFolder}><IconFolder /></button>
          <button className="iconbtn" title={`${t('toolbar.addFiles')} — ${t('tip.addFiles')}`}
            onClick={addFiles}><IconFilePlus /></button>
          {/* An ordinary action, not a toggle — the `on` state is reserved for
              the option buttons. Unsaved work shows as a small dot instead. */}
          <button className={`iconbtn${isDirty ? ' dirty' : ''}`}
            title={`${t('tip.save')} (Ctrl S)${docPath ? ` — ${docPath}` : ''}`}
            onClick={() => saveDocument()} disabled={!merged || saving}><IconSave /></button>
          <button className="iconbtn" title={`${t('tip.print')} (Ctrl P)`}
            onClick={doPrint} disabled={!merged || printing}><IconPrint /></button>
        </div>
        {/* Merge options: how the files are collected, ordered and joined. */}
        <span className="toolbar-sep" />
        <div className="toolbar-group">
          <span className="toolbar-label">{t('opts.sort')}</span>
          <select className="toolbar-select" value={sortOrder} title={t('opts.sort')}
            onChange={(e) => onSortChange(e.target.value)}>
            <option value="nameAsc">{t('sort.nameAsc')}</option>
            <option value="nameDesc">{t('sort.nameDesc')}</option>
            <option value="dateNewest">{t('sort.dateNewest')}</option>
            <option value="dateOldest">{t('sort.dateOldest')}</option>
            <option value="custom">{t('sort.custom')}</option>
          </select>
          <button className={`iconbtn${recursive ? ' on' : ''}`}
            title={`${t('opts.recursive')} — ${recursive ? t('opts.on') : t('opts.off')}`}
            onClick={() => toggleExportSetting('recursive')}><IconSubfolder /></button>
          <button className={`iconbtn${insertFileHeaders ? ' on' : ''}`}
            title={`${t('opts.fileHeaders')} — ${insertFileHeaders ? t('opts.on') : t('opts.off')}`}
            onClick={() => toggleExportSetting('insertFileHeaders')}><IconFileHeading /></button>
          <button className={`iconbtn${numberHeadings ? ' on' : ''}`}
            title={`${t('opts.numberingOnMerge')} — ${numberHeadings ? t('opts.on') : t('opts.off')}`}
            onClick={() => toggleExportSetting('numberHeadings')}><IconHash /></button>
          {/* An action, not a toggle: numbering rewrites heading lines, so it
              happens when asked for rather than under the writer's hands. */}
          <button className="iconbtn" title={t('tip.renumber')}
            onClick={renumberNow} disabled={!merged}><IconRenumber /></button>
          {/* Rebuild from the sources — highlighted once the selection has moved
              on but the edited document is being kept. */}
          <button className={`iconbtn${mergeStale ? ' on' : ''}`}
            title={mergeStale ? t('tip.remergeStale') : t('tip.remerge')}
            onClick={remerge} disabled={!checkedCount}><IconRemerge /></button>
        </div>
        <div className="toolbar-group">
          <div className="dropdown" ref={exportRef}>
            <button className="btn" title={t('tip.export')} onClick={() => setExportOpen((v) => !v)} disabled={!merged}>
              <IconExport /> {t('toolbar.export')} <IconChevron size={14} />
            </button>
            {exportOpen && (
              <div className="dropdown-menu export-menu">
                <div className="export-name">
                  <label>{t('export.filename')}</label>
                  <input
                    type="text"
                    value={exportName}
                    placeholder={firstCheckedName || 'merged'}
                    onChange={(e) => { exportNameEdited.current = true; setExportName(e.target.value); }}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="ctxmenu-sep" />
                {Object.entries(EXPORTERS).map(([fmt, ex]) => {
                  const Ico = ex.icon;
                  return (
                    <button key={fmt} className="dropdown-item" onClick={() => doExport(fmt)}>
                      <Ico size={16} /> {t(ex.label)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        {/* Export options that are worth one click: which pages the document
            gets, page numbering, and the body font size. */}
        <span className="toolbar-sep" />
        <div className="toolbar-group">
          <button className={`iconbtn${onOff('coverPage') ? ' on' : ''}`}
            title={optTitle('settings.coverPage', 'coverPage')}
            onClick={() => toggleExportSetting('coverPage')}><IconCover /></button>
          <button className={`iconbtn${onOff('tocPage') ? ' on' : ''}`}
            title={optTitle('settings.tocPage', 'tocPage')}
            onClick={() => toggleExportSetting('tocPage')}><IconContents /></button>
          <button className={`iconbtn${onOff('figurePage') ? ' on' : ''}`}
            title={optTitle('settings.figurePage', 'figurePage')}
            onClick={() => toggleExportSetting('figurePage')}><IconFigIndex /></button>
          <button className={`iconbtn${onOff('showPageNumber') ? ' on' : ''}`}
            title={optTitle('settings.pageNumber', 'showPageNumber')}
            onClick={() => toggleExportSetting('showPageNumber')}><IconPageNum /></button>
          <button className={`iconbtn${onOff('showHeader') ? ' on' : ''}`}
            title={optHint('settings.header', 'showHeader', exportSettings.headerText)}
            onClick={() => toggleExportSetting('showHeader')}><IconHeader /></button>
          <button className={`iconbtn${onOff('showFooter') ? ' on' : ''}`}
            title={optHint('settings.footer', 'showFooter', exportSettings.footerText)}
            onClick={() => toggleExportSetting('showFooter')}><IconFooter /></button>
        </div>
        <span className="toolbar-sep" />
        <div className="toolbar-group fontsize-ctl" title={t('settings.fontSize')}>
          <button className="iconbtn sm" onClick={() => bumpFontSize(-1)}
            disabled={(Number(exportSettings.fontSizePt) || 10) <= 6}><IconMinus size={15} /></button>
          <span className="fontsize-val">{Number(exportSettings.fontSizePt) || 10}pt</span>
          <button className="iconbtn sm" onClick={() => bumpFontSize(1)}
            disabled={(Number(exportSettings.fontSizePt) || 10) >= 40}><IconPlus size={15} /></button>
        </div>
        <span className="toolbar-sep" />
        {/* Document zoom for the preview / editor panes. */}
        <div className="toolbar-group zoom-ctl">
          <button className="iconbtn sm" title={`${t('tip.zoomOut')} (Ctrl −)`}
            onClick={zoomOut} disabled={zoom <= ZOOM_MIN}><IconZoomOut size={15} /></button>
          <button className="zoom-val" title={`${t('tip.zoomReset')} (Ctrl 0)`} onClick={zoomReset}>{zoom}%</button>
          <button className="iconbtn sm" title={`${t('tip.zoomIn')} (Ctrl +)`}
            onClick={zoomIn} disabled={zoom >= ZOOM_MAX}><IconZoomIn size={15} /></button>
        </div>
        <span className="toolbar-sep" />
        {/* Undo / redo for the document itself — the app keeps its own history,
            because rewriting the textarea's value wipes the browser's. */}
        <div className="toolbar-group">
          <button className="iconbtn" title={`${t('md.undo')} (Ctrl Z)`}
            onClick={undo} disabled={!history.canUndo}><IconUndo /></button>
          <button className="iconbtn" title={`${t('md.redo')} (Ctrl Y)`}
            onClick={redo} disabled={!history.canRedo}><IconRedo /></button>
        </div>
        <div className="toolbar-spacer" />
        <div className="toolbar-group">
          <button className="iconbtn" title={t('tip.clear')} onClick={clearAll}><IconTrash /></button>
          <button className="iconbtn lang-btn" title={`${t('tip.lang')} — ${lang === 'ko' ? 'EN' : '한글'}`} onClick={toggleLang}>
            <IconGlobe /><span className="lang-code">{lang === 'ko' ? 'EN' : '한글'}</span>
          </button>
          <button className="iconbtn" title={`${t('tip.theme')} — ${t(`theme.${theme}`)}`} onClick={cycleTheme}><ThemeIcon /></button>
          <button className="iconbtn" title={t('tip.settings')} onClick={openSettings}><IconSettings /></button>
          <button className="iconbtn" title={t('tip.about')} onClick={openAbout}><IconInfo /></button>
        </div>
      </header>

      <main className="body">
        <aside className="sidebar">
          <div className="tabs">
            <button className={leftTab === 'files' ? 'tab active' : 'tab'} onClick={() => setLeftTab('files')}>{t('tab.files')}</button>
            <button className={leftTab === 'structure' ? 'tab active' : 'tab'} onClick={() => setLeftTab('structure')}>{t('tab.structure')}</button>
            <button className={leftTab === 'figures' ? 'tab active' : 'tab'} onClick={() => setLeftTab('figures')}>{t('tab.figures')}</button>
          </div>
          <div className="sidebar-body">
            {leftTab === 'files'
              ? <FileList files={files} onToggle={onFileToggle} onCheckAll={onFileCheckAll}
                  onRemove={onFileRemove} onRemoveChecked={onFileRemoveChecked}
                  onMove={onFileMove} onReorder={onFileReorder} onRowContextMenu={onFileMenu} />
              : leftTab === 'structure'
                ? <OutlineTree outline={structure} headingCount={outline.length}
                    onSelect={onHeadingSelect} onItemContextMenu={onHeadingMenu} />
                : <FigureList figures={figures} activeIndex={activeFigure} onSelect={onFigureSelect}
                    onResize={onFigureResize} onItemContextMenu={onFigureMenu} />}
          </div>
        </aside>

        <section className="main">
          <div className="tabs">
            <button className={rightTab === 'edit' ? 'tab active' : 'tab'} onClick={() => showTab('edit')}>{t('tab.edit')}</button>
            <button className={rightTab === 'preview' ? 'tab active' : 'tab'} onClick={() => showTab('preview')}>{t('tab.preview')}</button>
          </div>
          <div className="main-body">
            <div className={`preview-host${rightTab === 'preview' ? '' : ' is-hidden'}`}>
              {merged
                ? <div ref={previewRef} className="preview markdown-body"
                    style={{
                      fontFamily: exportSettings.fontFamily ? fontStack(exportSettings.fontFamily) : undefined,
                      fontSize: `${exportSettings.fontSizePt || 10}pt`,
                      lineHeight: Number(exportSettings.lineHeight) > 0 ? Number(exportSettings.lineHeight) : 1,
                      zoom: zoom / 100,
                    }}
                    onClick={previewLinkClick}
                    onContextMenu={previewMenu} dangerouslySetInnerHTML={{ __html: previewHtml }} />
                : <div className="empty"><p className="muted">{t('preview.empty')}</p></div>}
            </div>
            {(editorReady || rightTab === 'edit') && (
            <div className={`editor-wrap${rightTab === 'edit' ? '' : ' is-hidden'}`}>
                {/* Markdown marks for the text under the caret. */}
                <div className="md-toolbar">
                  {HEADING_LEVELS.map((n) => (
                    <button key={n} className="md-btn md-h" title={t('md.heading', { level: n })}
                      onClick={() => applyHeading(n)}>H{n}</button>
                  ))}
                  <span className="md-sep" />
                  {MD_TOOLS.map((tool, i) => (tool.sep
                    ? <span key={`s${i}`} className="md-sep" />
                    : (
                      <button key={tool.key} className={`md-btn ${tool.cls || ''}`}
                        title={t(`md.${tool.key}`)} onClick={tool.run}>{tool.label}</button>
                    )
                  ))}
                </div>
                <div className="editor-pane">
                  <Suspense fallback={<div className="editor" />}>
                    <MarkdownEditor ref={editorRef} zoom={zoom}
                      placeholder={t('preview.empty')}
                      callbacksRef={editorCbs} />
                  </Suspense>
                  {figures.length > 0 && (
                    <aside className="editor-figures">
                      <FigureList figures={figures} activeIndex={activeFigure}
                        onSelect={onFigureSelect} onResize={onFigureResize} onItemContextMenu={onFigureMenu} />
                    </aside>
                  )}
                </div>
            </div>
            )}
          </div>
        </section>
      </main>

      <footer className="statusbar">
        <span className="status-text" title={status}>{status}</span>
        <div className="status-stats">
          <span className="stat" title={t('stat.files')}><IconFilePlus size={13} /> {checkedCount}/{files.length}</span>
          <span className="stat" title={t('stat.headings')}><IconHash size={13} /> {outline.length}</span>
          <span className="stat" title={t('stat.figures')}><IconImage size={13} /> {figures.length}</span>
          <span className="stat" title={t('stat.words')}>{t('stat.wAbbr')} {stats.words}</span>
          <span className="stat" title={t('stat.chars')}>{t('stat.cAbbr')} {stats.chars}</span>
          {/* Says why the automatic merge has gone quiet: this document is
              the writer's now, not a rebuild of the sources. */}
          {edited && <span className="stat badge" title={t('stat.editedHint')}>{t('stat.edited')}</span>}
          {numberHeadings && <span className="stat badge" title={t('opts.numberingOnMerge')}><IconHash size={12} /></span>}
          <span className="stat" title={t('settings.font')}>{exportSettings.fontFamily || t('settings.fontDefault')} · {exportSettings.fontSizePt}pt</span>
          <span className="stat" title={t('settings.theme')}>{t(`theme.${theme}`)}</span>
        </div>
        {sourceDir && <span className="status-dir" title={sourceDir}>{sourceDir}</span>}
        {isElectron && (
          <span className="resize-grip" title={t('tip.resize')} onPointerDown={startResize} />
        )}
      </footer>

      <ContextMenu open={ctx.open} x={ctx.x} y={ctx.y} items={ctx.items} onClose={closeCtx} />
      <Toasts toasts={toasts} onDismiss={dismissToast} />
      <ImportProgressDialog open={importOpen && !!importProg} done={importProg?.done || 0} total={importProg?.total || 0} file={importProg?.file || ''} />
      <MergeProgressDialog open={mergeOpen && !!mergeProg} done={mergeProg?.done || 0} total={mergeProg?.total || 0} file={mergeProg?.file || ''} />
      <ExportProgressDialog open={!!exporting} label={exporting || ''} />
      <ExportResultDialog result={exportResult} onClose={() => setExportResult(null)} />
      <ConfirmCloseDialog open={closeAsk} busy={closeBusy}
        onSave={saveThenClose} onDiscard={discardAndClose} onCancel={() => setCloseAsk(false)} />
      <Tooltip />
    </div>
  );
}
