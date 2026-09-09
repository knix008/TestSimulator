import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  IconSun, IconMoon, IconUp, IconDown, IconX, IconCheckSquare, IconSquare,
  IconCopy, IconCut, IconPaste, IconSelectAll, IconTarget,
  IconStars, IconSnow, IconLeaf, IconFlower, IconSunrise, IconContrast, IconBulb,
  IconDroplet, IconCoffee, IconCloud, IconGlobe, IconImage,
  IconCover, IconContents, IconFigIndex, IconPageNum, IconMinus, IconPlus,
  IconZoomIn, IconZoomOut, IconGem, IconFlame, IconSprout, IconDune,
} from './components/Icons';
import { isElectron, api, readFileText, readFileDataURL, saveSettingsToDisk } from './lib/platform';
import {
  embedImages, resolveRelPath, registerImage, clearImages, srcBaseName, IMAGE_EXTS,
} from './lib/images';
import {
  mergeFilesAsync, renumberHeadings, getOutline, getFigures, renderPreviewHtml,
  buildDocument, refreshFrontMatter, splitDocument, setFigureWidth, fontStack, sanitizeExportName,
  sortFiles, DEFAULT_EXPORT_SETTINGS,
} from './lib/markdown';
import { exportMarkdown, exportHtml, exportPdf, exportWord } from './lib/export';

const MD_RE = /\.(md|markdown)$/i;
const THEME_IDS = THEMES.map((t) => t.id);
// Each theme shows its own toolbar glyph so the current theme is recognizable.
const THEME_ICONS = {
  dark: IconMoon, light: IconSun, white: IconBulb, midnight: IconStars, nord: IconSnow,
  forest: IconLeaf, rose: IconFlower, solarized: IconSunrise, contrast: IconContrast,
  ocean: IconDroplet, mocha: IconCoffee, sky: IconCloud,
  violet: IconGem, amber: IconFlame, mint: IconSprout, sand: IconDune,
};
let uid = 0;
const nextId = () => `f${++uid}`;

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

export default function App() {
  const { t } = useTranslation();

  const [files, setFiles] = useState([]);
  const [sourceDir, setSourceDir] = useState('');
  const [recursive, setRecursive] = useState(true);
  const [sortOrder, setSortOrder] = useState('nameAsc');
  const [insertFileHeaders, setInsertFileHeaders] = useState(false);
  const [numberHeadings, setNumberHeadings] = useState(true);

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
  // text of the last successful export.
  const savedTextRef = useRef('');
  const [closeAsk, setCloseAsk] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);

  const folderInputRef = useRef(null);
  const filesInputRef = useRef(null);
  const previewRef = useRef(null);
  const editorRef = useRef(null);
  const exportRef = useRef(null);

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

  // ── Completion toasts ───────────────────────────────────
  const dismissToast = (id) => setToasts((list) => list.filter((x) => x.id !== id));
  function notify(title, { message = '', type = 'success', duration = 3800 } = {}) {
    const id = ++toastSeq.current;
    setToasts((list) => [...list, { id, title, message, type }]);
    if (duration) setTimeout(() => dismissToast(id), duration);
  }

  const outline = useMemo(() => getOutline(merged), [merged]);
  const figures = useMemo(() => getFigures(merged), [merged]);
  // The preview shows the whole document the export produces — cover, contents,
  // figure index and body — built from the very text the Edit tab holds.
  const previewHtml = useMemo(
    () => renderPreviewHtml(merged, { ...exportSettings, figureLabel: t('figure.label') }),
    [merged, exportSettings, lang],
  );

  // Document composition: the merged body plus the cover / contents / figure
  // index the settings ask for, all as editable Markdown (see markdown.js).
  function documentOpts() {
    return {
      ...exportSettings,
      title: sanitizeExportName(exportName) || undefined,
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
  // manual step. Manual editor edits are superseded on the next change.
  const editedRef = useRef(false);
  useEffect(() => {
    const chosen = files.filter((f) => f.checked);
    if (!chosen.length) { setMerged(''); editedRef.current = false; return; }
    const seq = ++mergeSeq.current;
    runMerge(chosen, seq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, insertFileHeaders, numberHeadings]);

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
      setMerged(buildDocument(out, documentOpts()));
      editedRef.current = false;
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
    exportSettings.tocPage, exportSettings.figurePage, exportName, lang,
  ]);
  const frontKeyRef = useRef(frontKey);
  useEffect(() => {
    if (frontKeyRef.current === frontKey) return;
    frontKeyRef.current = frontKey;
    setMerged((prev) => {
      if (!prev.trim()) return prev;
      const next = refreshFrontMatter(prev, documentOpts());
      return next === prev ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontKey]);

  // Default export name = first merged file's name (until the user edits it).
  const firstCheckedName = useMemo(() => {
    const f = files.find((x) => x.checked);
    return f ? f.name.replace(/\.(md|markdown)$/i, '') : '';
  }, [files]);
  useEffect(() => {
    if (!exportNameEdited.current) setExportName(firstCheckedName);
  }, [firstCheckedName]);

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
  }

  async function addFiles() {
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

  function onSortChange(order) {
    setSortOrder(order);
    if (order !== 'custom') setFiles((p) => sortFiles(p, order));
  }

  // ── Actions ─────────────────────────────────────────────
  function doRenumber() {
    if (!merged) return;
    // Renumber the body, then rebuild the contents / figure index so their
    // entries carry the new numbers.
    const body = renumberHeadings(splitDocument(merged).body);
    setMerged(buildDocument(body, documentOpts()));
    setStatus(t('status.numbered'));
    notify(t('toast.numbered'));
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
      const saved = await ex.run(merged, buildExportOpts());
      if (saved) {
        // The document now matches a file on disk, so it is no longer "unsaved".
        savedTextRef.current = merged;
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
      setExportResult({ status: 'error', fmt: t(ex.label), message: err?.message || String(err) });
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
  async function saveThenClose() {
    setCloseBusy(true);
    try {
      const saved = await exportMarkdown(merged, exportName);
      if (!saved) { setCloseBusy(false); return; }
      savedTextRef.current = merged;
      discardAndClose();
    } catch (err) {
      setCloseBusy(false);
      setCloseAsk(false);
      setExportResult({ status: 'error', fmt: t('export.md'), message: err?.message || String(err) });
    }
  }

  function discardAndClose() {
    setCloseBusy(false);
    setCloseAsk(false);
    if (isElectron && api.win?.confirmClose) api.win.confirmClose();
    else window.close();
  }

  function clearAll() {
    setFiles([]);
    setMerged('');
    setSourceDir('');
    clearImages();
    setActiveFigure(-1);
    setStatus(t('status.cleared'));
  }

  function scrollToHeading(h) {
    setRightTab('preview');
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
    if (rightTab === 'edit') {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(f.start, f.start + f.length);
      // Chromium scrolls the selection into view when the field regains focus.
      el.blur();
      el.focus();
      return;
    }
    setRightTab('preview');
    requestAnimationFrame(() => {
      const el = previewRef.current?.querySelector(`#fig-${f.index}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // Resizing a figure rewrites its Markdown in place (a `w=NN%` size hint), so
  // the change shows up in the editor text, the preview and every export.
  function resizeFigure(f, percent) {
    setMerged((prev) => setFigureWidth(prev, f, percent));
    setActiveFigure(f.index);
    editedRef.current = true;
  }

  // Highlights the figure the editor caret currently sits in, so moving through
  // the text shows the matching picture in the sidebar.
  function syncFigureToCaret() {
    const el = editorRef.current;
    if (!el || !figures.length) return;
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

  // ── Document zoom ───────────────────────────────────────
  function applyZoom(next) {
    const n = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next)));
    setZoom(n);
    localStorage.setItem('mmm-zoom', String(n));
  }
  const zoomIn = () => applyZoom(zoom + ZOOM_STEP);
  const zoomOut = () => applyZoom(zoom - ZOOM_STEP);
  const zoomReset = () => applyZoom(100);

  // Ctrl +/-/0 and Ctrl+wheel, the shortcuts people already expect.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn(); }
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
      { icon: IconHash, label: t('toolbar.renumber'), disabled: !merged, onClick: doRenumber },
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
      { icon: IconMd, label: t('ctx.toEdit'), disabled: !merged, onClick: () => setRightTab('edit') },
      { icon: IconHash, label: t('toolbar.renumber'), disabled: !merged, onClick: doRenumber },
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
      { icon: IconUp, label: `${t('ctx.undo')} (Ctrl Z)`, onClick: () => editorExec('undo') },
      { icon: IconDown, label: `${t('ctx.redo')} (Ctrl Y)`, onClick: () => editorExec('redo') },
      { separator: true },
      ...zoomItems(),
      { separator: true },
      { icon: IconHtml, label: t('ctx.toPreview'), disabled: !merged, onClick: () => setRightTab('preview') },
      { icon: IconHash, label: t('toolbar.renumber'), disabled: !merged, onClick: doRenumber },
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

  // Native textarea undo/redo — the stack the browser keeps for typing.
  function editorExec(cmd) {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    try { document.execCommand(cmd); } catch { /* ignore */ }
    if (el.value !== merged) { editedRef.current = true; setMerged(el.value); }
  }

  function replaceSelection(text) {
    const el = editorRef.current;
    if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const next = el.value.slice(0, s) + text + el.value.slice(e);
    setMerged(next);
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + text.length; });
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

  return (
    <div className="app">
      <TitleBar title={t('app.title')} />

      {/* hidden web inputs */}
      <input ref={folderInputRef} type="file" webkitdirectory="" directory="" multiple
        style={{ display: 'none' }} onChange={onWebFolder} />
      <input ref={filesInputRef} type="file" accept=".md,.markdown" multiple
        style={{ display: 'none' }} onChange={onWebFiles} />

      <header className="toolbar">
        <div className="toolbar-group">
          <button className="btn" title={t('tip.addFolder')} onClick={addFolder}><IconFolder /> {t('toolbar.addFolder')}</button>
          <button className="btn" title={t('tip.addFiles')} onClick={addFiles}><IconFilePlus /> {t('toolbar.addFiles')}</button>
          <button className="btn" title={t('tip.renumber')} onClick={doRenumber} disabled={!merged}>
            <IconHash /> {t('toolbar.renumber')}
          </button>
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

      <div className="options">
        <label className="opt"><input type="checkbox" checked={recursive} onChange={(e) => setRecursive(e.target.checked)} /> {t('opts.recursive')}</label>
        <label className="opt">{t('opts.sort')}:
          <select value={sortOrder} onChange={(e) => onSortChange(e.target.value)}>
            <option value="nameAsc">{t('sort.nameAsc')}</option>
            <option value="nameDesc">{t('sort.nameDesc')}</option>
            <option value="dateNewest">{t('sort.dateNewest')}</option>
            <option value="dateOldest">{t('sort.dateOldest')}</option>
            <option value="custom">{t('sort.custom')}</option>
          </select>
        </label>
        <label className="opt"><input type="checkbox" checked={insertFileHeaders} onChange={(e) => setInsertFileHeaders(e.target.checked)} /> {t('opts.fileHeaders')}</label>
        <label className="opt"><input type="checkbox" checked={numberHeadings} onChange={(e) => setNumberHeadings(e.target.checked)} /> {t('opts.numbering')}</label>
      </div>

      <main className="body">
        <aside className="sidebar">
          <div className="tabs">
            <button className={leftTab === 'files' ? 'tab active' : 'tab'} onClick={() => setLeftTab('files')}>{t('tab.files')}</button>
            <button className={leftTab === 'structure' ? 'tab active' : 'tab'} onClick={() => setLeftTab('structure')}>{t('tab.structure')}</button>
            <button className={leftTab === 'figures' ? 'tab active' : 'tab'} onClick={() => setLeftTab('figures')}>{t('tab.figures')}</button>
          </div>
          <div className="sidebar-body">
            {leftTab === 'files'
              ? <FileList files={files} onToggle={toggle} onCheckAll={checkAll} onRemove={remove} onRemoveChecked={removeChecked} onMove={move} onReorder={reorder} onRowContextMenu={fileRowMenu} />
              : leftTab === 'structure'
                ? <OutlineTree outline={outline} onSelect={scrollToHeading} onItemContextMenu={outlineMenu} />
                : <FigureList figures={figures} activeIndex={activeFigure} onSelect={gotoFigure} onResize={resizeFigure} onItemContextMenu={figureMenu} />}
          </div>
        </aside>

        <section className="main">
          <div className="tabs">
            <button className={rightTab === 'preview' ? 'tab active' : 'tab'} onClick={() => setRightTab('preview')}>{t('tab.preview')}</button>
            <button className={rightTab === 'edit' ? 'tab active' : 'tab'} onClick={() => setRightTab('edit')}>{t('tab.edit')}</button>
          </div>
          <div className="main-body">
            {rightTab === 'preview' ? (
              merged
                ? <div ref={previewRef} className="preview markdown-body"
                    style={{
                      fontFamily: exportSettings.fontFamily ? fontStack(exportSettings.fontFamily) : undefined,
                      fontSize: `${exportSettings.fontSizePt || 10}pt`,
                      lineHeight: Number(exportSettings.lineHeight) > 0 ? Number(exportSettings.lineHeight) : 1,
                      zoom: zoom / 100,
                    }}
                    onClick={previewLinkClick}
                    onContextMenu={previewMenu} dangerouslySetInnerHTML={{ __html: previewHtml }} />
                : <div className="empty"><p className="muted">{t('preview.empty')}</p></div>
            ) : (
              // The editor holds raw Markdown, so the images live in a docked
              // panel beside it: every embedded picture is visible while editing,
              // and the one the caret sits in is highlighted.
              <div className="editor-pane">
                <textarea ref={editorRef} className="editor" value={merged}
                  style={{ fontSize: `${(13.5 * zoom) / 100}px` }}
                  onChange={(e) => { editedRef.current = true; setMerged(e.target.value); }}
                  onSelect={syncFigureToCaret} onClick={syncFigureToCaret} onKeyUp={syncFigureToCaret}
                  onContextMenu={editorMenu} spellCheck={false} placeholder={t('preview.empty')} />
                {figures.length > 0 && (
                  <aside className="editor-figures">
                    <FigureList figures={figures} activeIndex={activeFigure}
                      onSelect={gotoFigure} onResize={resizeFigure} onItemContextMenu={figureMenu} />
                  </aside>
                )}
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
          {numberHeadings && <span className="stat badge" title={t('opts.numbering')}><IconHash size={12} /></span>}
          <span className="stat" title={t('settings.font')}>{exportSettings.fontFamily || t('settings.fontDefault')} · {exportSettings.fontSizePt}pt</span>
          <span className="stat" title={t('settings.theme')}>{t(`theme.${theme}`)}</span>
        </div>
        {sourceDir && <span className="status-dir" title={sourceDir}>{sourceDir}</span>}
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
