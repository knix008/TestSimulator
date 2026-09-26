import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import TitleBar from './components/TitleBar';
import OutlineTree from './components/OutlineTree';
import { THEMES, nextThemeId, rememberThemePref, preferredThemeForMode, systemThemeMode, themesByMode } from './lib/themes';
import ContextMenu from './components/ContextMenu';
import Tooltip from './components/Tooltip';
import Toasts from './components/Toasts';
import ExportResultDialog from './components/ExportResultDialog';
import PrintDialog, { DEFAULT_PRINT_OPTIONS } from './components/PrintDialog';
import ExportProgressDialog from './components/ExportProgressDialog';
import ErrorDialog from './components/ErrorDialog';
import TimeCombo, { nowRounded } from './components/TimeCombo';
import RichEditor from './components/RichEditor';
import {
  IconFilePlus, IconFolder, IconSave, IconSaveAs, IconExport, IconChevron, IconPrinter,
  IconMd, IconHtml, IconPdf, IconWord, IconPaper, IconTrash, IconInfo, IconSettings,
  IconX, IconCopy, IconCut, IconPaste, IconSelectAll, IconTarget,
  IconRefresh, IconCheck, IconContrast, IconBulb,
  IconGlobe, IconHash, IconCalendar,
  IconBold, IconItalic, IconStrike, IconUnderline, IconHeading, IconList, IconListOrdered, IconChecklist,
  IconQuote, IconCode, IconLink, IconTable, IconRule, IconImage, IconUndo, IconRedo,
} from './components/Icons';
import { isElectron, api, saveText, writeTextTo, readFileText, openTextFile, readPath, saveSettingsToDisk, printPrinters } from './lib/platform';
import { loadMedia, isMediaFile, MEDIA_ACCEPT } from './lib/media';
import { getOutline, DEFAULT_EXPORT_SETTINGS, fontStack } from './lib/markdown';
import { getSystemFonts, fontsWith } from './lib/fonts';
import { exportMarkdown, exportHtml, exportPdf, exportWord, preparePrint, runPrint } from './lib/export';
import {
  createEmptyMeeting, meetingToMarkdown, meetingToPlainText,
  meetingBaseName, isMeetingEmpty, lines, buildStructure } from './lib/meeting';
import { TEMPLATES, templateName, templateMeeting } from './lib/templates';
import { TIME_OPTIONS, TIME_RE, timeToMinutes } from './lib/time';

const THEME_IDS = THEMES.map((t) => t.id);

function loadExportSettings() {
  try {
    const raw = localStorage.getItem('mtg-export');
    if (raw) return { ...DEFAULT_EXPORT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_EXPORT_SETTINGS };
}

// Details-panel width. The minimum is the narrowest panel that still shows a
// whole date and a whole time next to the calendar / clock buttons: each column
// of a two-field row needs 104px of input + 6px gap + a 34px button, so
// 2 x 144 + 10px gap + 24px padding = 322px, rounded up for the labels.
// The storage key is versioned so an older, narrower saved width does not
// survive the change.
const SIDEBAR_W_KEY = 'mtg-sidebar-w2';
const SIDEBAR_DEFAULT = 420;
const SIDEBAR_MIN = 330;
const SIDEBAR_MAX = 900;

// The file the restored document belongs to. Kept next to the autosaved draft
// so Save (Ctrl+S) still writes straight back to it after a restart, instead of
// forgetting the location and asking again.
function loadDocPath() {
  try { return localStorage.getItem('mtg-doc-path') || ''; } catch { return ''; }
}

function loadPrintOptions() {
  try {
    const raw = localStorage.getItem('mtg-print');
    if (raw) return { ...DEFAULT_PRINT_OPTIONS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_PRINT_OPTIONS };
}

function loadMeeting() {
  try {
    const raw = localStorage.getItem('mtg-doc');
    if (raw) return { ...createEmptyMeeting(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return createEmptyMeeting();
}

// Recent files + last-used directory (persisted; mirrored to disk on Electron).
const RECENT_MAX = 10;
function loadRecent() {
  try {
    const r = JSON.parse(localStorage.getItem('mtg-recent') || '{}');
    return { dir: typeof r.dir === 'string' ? r.dir : '', files: Array.isArray(r.files) ? r.files : [] };
  } catch { return { dir: '', files: [] }; }
}
const dirnameOf = (p) => String(p || '').replace(/[\\/][^\\/]*$/, '');
const basenameOf = (p) => String(p || '').replace(/^.*[\\/]/, '');

export default function App() {
  const { t } = useTranslation();

  const [meeting, setMeeting] = useState(loadMeeting);
  const [leftTab, setLeftTab] = useState('details');
  const [editMode, setEditMode] = useState('wysiwyg'); // 'wysiwyg' | 'markdown'
  const [fonts, setFonts] = useState(null); // system font list for the toolbar picker
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const v = Number(localStorage.getItem(SIDEBAR_W_KEY));
    return v >= SIDEBAR_MIN && v <= SIDEBAR_MAX ? v : SIDEBAR_DEFAULT;
  });
  const [status, setStatus] = useState(t('status.ready'));
  const [fileOpen, setFileOpen] = useState(false); // File menu (New/Open/Save/Recent)
  const [sampleOpen, setSampleOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // Print: `printDoc` holds the prepared document + its pagination result.
  const [printOpen, setPrintOpen] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [printDoc, setPrintDoc] = useState(null); // { html, pages, map, currentPage }
  // Path of the file this document came from / was last saved to. Save writes
  // straight back to it; Save As always asks. Empty for an unsaved document.
  const [docPath, setDocPath] = useState(loadDocPath);
  const [printers, setPrinters] = useState([]);
  // Per-job print settings (printer, copies, colour, duplex …), remembered
  // between jobs so a repeat print does not need setting up again.
  const [printOptions, setPrintOptions] = useState(loadPrintOptions);

  const [recent, setRecent] = useState(loadRecent);
  const [theme, setTheme] = useState(() => {
    const s = localStorage.getItem('mtg-theme');
    return THEME_IDS.includes(s) ? s : 'dark';
  });
  const [themeAuto, setThemeAuto] = useState(() => localStorage.getItem('mtg-theme-auto') === '1');
  const [themeOpen, setThemeOpen] = useState(false);
  const [lang, setLang] = useState(i18n.language);
  const [exportSettings, setExportSettings] = useState(loadExportSettings);
  const [exportName, setExportName] = useState('');
  const exportNameEdited = useRef(false);
  const [ctx, setCtx] = useState({ open: false, x: 0, y: 0, items: [] });
  const [toasts, setToasts] = useState([]);
  const toastSeq = useRef(0);
  const [exportResult, setExportResult] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [errorInfo, setErrorInfo] = useState(null);

  const openInputRef = useRef(null);
  const mediaInputRef = useRef(null);
  const bodyRef = useRef(null);
  const mdSourceRef = useRef(null);
  const toolbarRef = useRef(null);
  const richApi = useRef(null);
  // Always point at the current handlers, so the keyboard shortcuts (bound once,
  // on mount) never call a stale closure.
  const printRef = useRef(() => {});
  const saveRef = useRef(() => {});
  const saveAsRef = useRef(() => {});
  // Body edit history for Undo/Redo (owns the stack so the buttons know exactly
  // when they are available; native contentEditable undo isn't observable).
  const histRef = useRef(null);
  if (histRef.current === null) histRef.current = { stack: [meeting.body || ''], index: 0, applying: false, lastTs: 0 };
  const skipHistResetRef = useRef(false);
  const [docKey, setDocKey] = useState(0);
  const bumpDoc = () => setDocKey((k) => k + 1);
  const fileRef = useRef(null);
  const sampleRef = useRef(null);
  const exportRef = useRef(null);
  const themeRef = useRef(null);

  // Localized labels baked into the exported/preview document.
  const docLabels = useMemo(() => ({
    untitled: t('doc.untitled'), field: t('doc.field'), value: t('doc.value'),
    date: t('doc.date'), time: t('doc.time'), location: t('doc.location'),
    organizer: t('doc.organizer'), recorder: t('doc.recorder'), attendees: t('doc.attendees'),
    agenda: t('doc.agenda'), notes: t('doc.notes'), decisions: t('doc.decisions'),
    actions: t('doc.actions'),
  }), [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const numbering = exportSettings.numbering !== false;
  const fullMarkdown = useMemo(
    () => meetingToMarkdown(meeting, docLabels, { number: numbering }),
    [meeting, docLabels, numbering],
  );
  // The structure tree reflects the WHOLE assembled document (title, sections,
  // notes) with numbering, not just the editor body.
  const outline = useMemo(() => getOutline(fullMarkdown), [fullMarkdown]);
  // The Structure tab shows the whole document: the notes headings plus the
  // fields and list entries typed in the details panel.
  const structure = useMemo(
    () => buildStructure(meeting, { ...docLabels, info: t('structure.info') }, outline),
    [meeting, docLabels, outline, lang], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const empty = isMeetingEmpty(meeting);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('mtg-theme', theme);
    rememberThemePref(theme);
    saveSettingsToDisk();
  }, [theme]);

  // "Auto" follows the OS appearance and applies the last theme chosen for that mode.
  useEffect(() => {
    localStorage.setItem('mtg-theme-auto', themeAuto ? '1' : '0');
    saveSettingsToDisk();
    if (!themeAuto) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => setTheme(preferredThemeForMode(mq.matches ? 'light' : 'dark'));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [themeAuto]);

  // Load the system font list once for the toolbar font picker.
  useEffect(() => {
    let alive = true;
    getSystemFonts().then((list) => { if (alive) setFonts(list); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Measure the toolbar's intrinsic width (sum of its groups, ignoring the elastic
  // spacer) and set it as the window's minimum width, so the toolbar always fits
  // on one row and no button is ever hidden. Re-measures when labels change
  // (language) or the font picker appears. Electron only.
  useEffect(() => {
    if (!isElectron || !api?.win?.setMinWidth) return undefined;
    const el = toolbarRef.current;
    if (!el) return undefined;
    const measure = () => {
      const cs = getComputedStyle(el);
      const gap = parseFloat(cs.columnGap || cs.gap) || 0;
      const kids = Array.from(el.children);
      let sum = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      kids.forEach((k) => { if (!k.classList.contains('toolbar-spacer')) sum += k.getBoundingClientRect().width; });
      sum += gap * Math.max(0, kids.length - 1);
      api.win.setMinWidth(Math.ceil(sum) + 8);
    };
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [lang, fonts]);

  // Ctrl/⌘+Z (undo) and Ctrl+Y / Ctrl+Shift+Z (redo) inside the editors route to
  // our history so the keyboard and the toolbar buttons share one stack.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'p') {
        // Ctrl/⌘+P prints the meeting document, not the app window.
        e.preventDefault();
        printRef.current();
        return;
      }
      if (k === 's') {
        // Ctrl/⌘+S saves in place; add Shift for Save As.
        e.preventDefault();
        if (e.shiftKey) saveAsRef.current();
        else saveRef.current();
        return;
      }
      const isUndo = k === 'z' && !e.shiftKey;
      const isRedo = k === 'y' || (k === 'z' && e.shiftKey);
      if (!isUndo && !isRedo) return;
      const ae = document.activeElement;
      if (!ae || !ae.classList || !(ae.classList.contains('richeditor') || ae.classList.contains('md-source'))) return;
      e.preventDefault();
      if (isRedo) editRedo(); else editUndo();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the sidebar width chosen via the splitter.
  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_W_KEY, String(Math.round(sidebarWidth))); } catch { /* ignore */ }
  }, [sidebarWidth]);

  // Drag the splitter to resize the sidebar (clamped so the editor keeps room).
  function startSidebarResize(e) {
    e.preventDefault();
    const onMove = (ev) => {
      const rect = bodyRef.current?.getBoundingClientRect();
      const left = rect ? rect.left : 0;
      const total = rect ? rect.width : window.innerWidth;
      const w = Math.max(SIDEBAR_MIN, Math.min(ev.clientX - left, Math.min(SIDEBAR_MAX, total - 360)));
      setSidebarWidth(w);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  useEffect(() => {
    try { localStorage.setItem('mtg-print', JSON.stringify(printOptions)); } catch { /* ignore */ }
  }, [printOptions]);

  useEffect(() => {
    try { localStorage.setItem('mtg-doc-path', docPath || ''); } catch { /* ignore */ }
  }, [docPath]);

  // Autosave the current meeting draft so a reload restores it.
  useEffect(() => {
    try { localStorage.setItem('mtg-doc', JSON.stringify(meeting)); } catch { /* ignore */ }
  }, [meeting]);

  // Record body edits into the undo history (rapid edits within 500ms coalesce
  // into one step). Skips the change that an undo/redo itself produced.
  useEffect(() => {
    const h = histRef.current;
    const body = meeting.body || '';
    if (h.applying) {
      h.applying = false;
    } else if (h.stack[h.index] !== body) {
      const now = Date.now();
      if (h.index === h.stack.length - 1 && now - h.lastTs < 500) {
        h.stack[h.index] = body; // coalesce with the in-progress step
      } else {
        h.stack = h.stack.slice(0, h.index + 1);
        h.stack.push(body);
        h.index = h.stack.length - 1;
        const MAX = 50; // cap depth (body may embed large base64 media)
        if (h.stack.length > MAX) { h.stack.shift(); h.index -= 1; }
      }
      h.lastTs = now;
    }
    setCanUndo(h.index > 0);
    setCanRedo(h.index < h.stack.length - 1);
  }, [meeting.body]);

  // A new/opened/cleared document resets the history (but an undo/redo reload,
  // which also bumps docKey, must not — it sets skipHistResetRef first).
  useEffect(() => {
    if (skipHistResetRef.current) { skipHistResetRef.current = false; return; }
    histRef.current = { stack: [meeting.body || ''], index: 0, applying: false, lastTs: 0 };
    setCanUndo(false);
    setCanRedo(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  useEffect(() => {
    localStorage.setItem('mtg-export', JSON.stringify(exportSettings));
    saveSettingsToDisk();
  }, [exportSettings]);

  // Sync theme/lang/export settings with the separate settings window.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'mtg-export' && e.newValue) {
        try { setExportSettings((prev) => ({ ...prev, ...JSON.parse(e.newValue) })); } catch { /* ignore */ }
      } else if (e.key === 'mtg-theme' && e.newValue && THEME_IDS.includes(e.newValue)) {
        setTheme(e.newValue);
      } else if (e.key === 'mtg-theme-auto') {
        setThemeAuto(e.newValue === '1');
      } else if (e.key === 'mtg-lang' && e.newValue) {
        i18n.changeLanguage(e.newValue); setLang(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Reload settings/theme/lang from localStorage on focus (some platforms don't
  // fire the storage event across windows).
  useEffect(() => {
    const onFocus = () => {
      try {
        const raw = localStorage.getItem('mtg-export');
        if (raw) setExportSettings({ ...DEFAULT_EXPORT_SETTINGS, ...JSON.parse(raw) });
      } catch { /* ignore */ }
      const th = localStorage.getItem('mtg-theme');
      if (th && THEME_IDS.includes(th)) setTheme(th);
      setThemeAuto(localStorage.getItem('mtg-theme-auto') === '1');
      const lg = localStorage.getItem('mtg-lang');
      if (lg && lg !== i18n.language) { i18n.changeLanguage(lg); setLang(lg); }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    if (!fileOpen && !sampleOpen && !exportOpen && !themeOpen) return;
    const onDown = (e) => {
      if (fileRef.current && !fileRef.current.contains(e.target)) setFileOpen(false);
      if (sampleRef.current && !sampleRef.current.contains(e.target)) setSampleOpen(false);
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
      if (themeRef.current && !themeRef.current.contains(e.target)) setThemeOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [fileOpen, sampleOpen, exportOpen, themeOpen]);

  // Record a successfully opened/saved/exported file path: update the last-used
  // directory and prepend it to the recent-files list (max 10, deduped).
  function rememberPath(p) {
    if (!p || !isElectron) return;
    setRecent((prev) => {
      const files = [p, ...prev.files.filter((x) => x !== p)].slice(0, RECENT_MAX);
      const next = { dir: dirnameOf(p) || prev.dir, files };
      try { localStorage.setItem('mtg-recent', JSON.stringify(next)); } catch { /* ignore */ }
      saveSettingsToDisk();
      return next;
    });
  }
  function clearRecent() {
    const next = { dir: recent.dir, files: [] };
    setRecent(next);
    try { localStorage.setItem('mtg-recent', JSON.stringify(next)); } catch { /* ignore */ }
    saveSettingsToDisk();
    setFileOpen(false);
  }
  // Remove a single entry from the recent-files list (keeps the dropdown open).
  function removeRecent(path) {
    setRecent((prev) => {
      const next = { dir: prev.dir, files: prev.files.filter((x) => x !== path) };
      try { localStorage.setItem('mtg-recent', JSON.stringify(next)); } catch { /* ignore */ }
      saveSettingsToDisk();
      return next;
    });
  }

  // Open a .mtg file that the OS handed us (file association / double-click).
  useEffect(() => {
    if (!isElectron || !api.onOpenFile) return;
    const off = api.onOpenFile((data) => {
      if (data && typeof data.content === 'string') {
        applyOpened(data.name || 'meeting', data.content, data.path);
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global error handlers → copyable error popup.
  useEffect(() => {
    const onError = (e) => {
      const err = e?.error || e;
      showError(err?.message || String(e?.message || e), err?.stack);
    };
    const onRejection = (e) => {
      const r = e?.reason;
      showError(r?.message || String(r), r?.stack);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  // ── Toasts ──────────────────────────────────────────────
  const dismissToast = (id) => setToasts((list) => list.filter((x) => x.id !== id));
  function notify(title, { message = '', type = 'success', duration = 3600 } = {}) {
    const id = ++toastSeq.current;
    setToasts((list) => [...list, { id, title, message, type }]);
    if (duration) setTimeout(() => dismissToast(id), duration);
  }

  function showError(message, detail = '') {
    setErrorInfo({ title: t('error.title'), message: message || String(message), detail: detail || '' });
  }

  // Default export/file name = meeting title (until the user edits it).
  const baseName = useMemo(() => meetingBaseName(meeting, 'meeting'), [meeting]);
  useEffect(() => {
    if (!exportNameEdited.current) setExportName(baseName === 'meeting' ? '' : baseName);
  }, [baseName]);

  // ── Field editing ───────────────────────────────────────
  const update = (key, value) => setMeeting((m) => ({ ...m, [key]: value }));

  function newDoc() {
    // A fresh meeting starts at the current (rounded) time.
    setMeeting({ ...createEmptyMeeting(), startTime: nowRounded() });
    exportNameEdited.current = false;
    setDocPath('');
    bumpDoc();
    setStatus(t('status.newDoc'));
  }
  function loadTemplate(tpl) {
    setSampleOpen(false);
    setMeeting(templateMeeting(tpl, lang));
    exportNameEdited.current = false;
    setDocPath('');
    bumpDoc();
    setStatus(t('status.templateLoaded', { name: templateName(tpl, lang) }));
    notify(t('toast.opened'), { message: templateName(tpl, lang) });
  }
  function clearAll() {
    setMeeting(createEmptyMeeting());
    exportNameEdited.current = false;
    setDocPath('');
    bumpDoc();
    setStatus(t('status.cleared'));
  }

  // ── Open / Save (.mtg JSON) ─────────────────────────────
  const FILE_FILTERS = [
    { name: 'MyMeeting', extensions: ['mtg', 'json'] },
    { name: 'All Files', extensions: ['*'] },
  ];

  function applyOpened(name, content, fullPath) {
    let data;
    try {
      data = JSON.parse(content);
    } catch (err) {
      showError(t('status.openErr', { msg: err.message }), String(content).slice(0, 2000));
      return false;
    }
    setMeeting({ ...createEmptyMeeting(), ...data });
    exportNameEdited.current = false;
    bumpDoc();
    setDocPath(fullPath || '');
    if (fullPath) rememberPath(fullPath);
    setStatus(t('status.opened', { path: name }));
    notify(t('toast.opened'));
    return true;
  }

  async function openMeeting() {
    setFileOpen(false);
    if (isElectron) {
      try {
        const res = await openTextFile(FILE_FILTERS, recent.dir);
        if (!res) return;
        applyOpened(res.name || res.path || 'meeting', res.content, res.path);
      } catch (err) {
        showError(t('status.openErr', { msg: err?.message || String(err) }), err?.stack);
      }
    } else {
      openInputRef.current?.click();
    }
  }

  // Reopen a file from the recent list (Electron reads the path directly).
  async function openRecent(fullPath) {
    setFileOpen(false);
    try {
      const content = await readPath(fullPath);
      if (content == null) { showError(t('status.openErr', { msg: fullPath }), ''); return; }
      applyOpened(basenameOf(fullPath), content, fullPath);
    } catch (err) {
      showError(t('status.openErr', { msg: err?.message || String(err) }), err?.stack);
    }
  }

  async function onWebOpen(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const content = await readFileText(file);
      applyOpened(file.name, content);
    } catch (err) {
      showError(t('status.openErr', { msg: err?.message || String(err) }), err?.stack);
    }
  }

  const docJson = () => JSON.stringify(meeting, null, 2);

  // Save (Ctrl+S): write straight back to the file the document came from. A
  // document that has no file yet falls through to Save As.
  async function saveMeeting() {
    setFileOpen(false);
    if (!(isElectron && docPath)) return saveMeetingAs();
    try {
      const saved = await writeTextTo(docPath, docJson());
      rememberPath(docPath);
      setStatus(t('status.saved', { path: saved || docPath }));
      notify(t('toast.saved'), { message: String(saved || docPath), type: 'success' });
      return saved;
    } catch (err) {
      // The file or its folder is gone (moved, deleted, unplugged drive) —
      // ask for a new location rather than leaving the user with an error.
      setStatus(t('status.saveErr', { msg: err?.message || String(err) }));
      return saveMeetingAs();
    }
  }

  // Save As (Ctrl+Shift+S): always ask for a location, then adopt it as the
  // document's file so later saves go there.
  async function saveMeetingAs() {
    setFileOpen(false);
    try {
      const base = (exportName || baseName || 'meeting').trim() || 'meeting';
      const saved = await saveText({
        defaultName: `${base}.mtg`,
        content: docJson(),
        filters: FILE_FILTERS,
        defaultDir: dirnameOf(docPath) || recent.dir,
      });
      if (saved) {
        if (isElectron) setDocPath(String(saved));
        rememberPath(String(saved));
        setStatus(t('status.saved', { path: saved }));
        notify(t('toast.saved'), { message: String(saved), type: 'success' });
      } else {
        setStatus(t('status.saveCancel'));
      }
      return saved;
    } catch (err) {
      showError(t('status.saveErr', { msg: err?.message || String(err) }), err?.stack);
      return null;
    }
  }

  // ── Export ──────────────────────────────────────────────
  function buildExportOpts() {
    const fresh = { ...DEFAULT_EXPORT_SETTINGS, ...loadExportSettings(), ...exportSettings };
    setExportSettings(fresh);
    return {
      ...fresh,
      contentsLabel: t('export.contents'),
      appName: t('app.title'),
      dateStr: (meeting.date || '').trim() || new Date().toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US'),
      defaultDir: recent.dir,
    };
  }

  const EXPORTERS = {
    md: { label: 'export.md', icon: IconMd, run: (md, o, name) => exportMarkdown(md, name, o) },
    html: { label: 'export.html', icon: IconHtml, run: (md, o, name) => exportHtml(md, o, name) },
    pdf: { label: 'export.pdf', icon: IconPdf, run: (md, o, name) => exportPdf(md, o, name) },
    word: { label: 'export.word', icon: IconWord, run: (md, o, name) => exportWord(md, o, name) },
    txt: {
      label: 'export.txt', icon: IconPaper,
      run: (_md, _o, name) => saveText({
        defaultName: `${name || 'meeting'}.txt`,
        content: meetingToPlainText(meeting, docLabels, { number: numbering }),
        filters: [{ name: 'Text', extensions: ['txt'] }],
        defaultDir: recent.dir,
      }),
    },
  };

  async function doExport(fmt) {
    setExportOpen(false);
    if (empty) return;
    const ex = EXPORTERS[fmt];
    const name = (exportName || baseName || 'meeting').trim() || 'meeting';
    setStatus(t('status.exporting', { fmt: t(ex.label) }));
    setExporting(t(ex.label));
    try {
      const saved = await ex.run(fullMarkdown, buildExportOpts(), name);
      if (saved) {
        rememberPath(String(saved));
        setStatus(t('status.exported', { path: saved }));
        setExportResult({
          status: 'success',
          fmt: t(ex.label),
          path: String(saved),
          note: (fmt === 'pdf' && !isElectron) ? t('status.pdfWebNote') : '',
        });
        notify(t('toast.exported', { fmt: t(ex.label) }));
      } else {
        setStatus(t('status.exportCancel'));
      }
    } catch (err) {
      setStatus(t('status.exportErr', { msg: err?.message || String(err) }));
      showError(t('status.exportErr', { msg: err?.message || String(err) }), err?.stack);
    } finally {
      setExporting(null);
    }
  }

  // ── Print ───────────────────────────────────────────────
  // The heading the caret currently sits under, in the editor's own wording.
  // Used to work out which printed page the user is looking at.
  function currentBodyHeading() {
    if (editMode === 'markdown') {
      const ta = mdSourceRef.current;
      if (!ta) return '';
      const upto = String(meeting.body || '').slice(0, ta.selectionStart || 0);
      const hits = upto.match(/^#{1,6}[ \t]+.*$/gm);
      return hits && hits.length ? hits[hits.length - 1].replace(/^#{1,6}[ \t]+/, '') : '';
    }
    const el = richApi.current?.el?.();
    if (!el) return '';
    const heads = [...el.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    if (!heads.length) return '';
    const sel = window.getSelection();
    const node = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
    let text = '';
    if (node && el.contains(node)) {
      // Last heading that precedes (or contains) the caret.
      for (const h of heads) {
        if (h.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) text = h.textContent;
        else break;
      }
    } else {
      // No caret in the editor — use the heading nearest the top of the view.
      const top = el.getBoundingClientRect().top + 8;
      for (const h of heads) {
        if (h.getBoundingClientRect().top <= top) text = h.textContent;
        else break;
      }
    }
    return text;
  }

  // Resolve the caret's page from a pagination map ({ 'h-3': 2, … }). Body
  // headings are matched against the assembled outline; with no heading above
  // the caret the "Discussion" section heading stands in, since that is where
  // the editor's content starts.
  function resolveCurrentPage(map) {
    if (!map) return 0;
    const pageOf = (text) => {
      const wanted = stripNum(text);
      if (!wanted) return 0;
      const item = outline.find((h) => stripNum(h.text) === wanted);
      return item ? Number(map[`h-${item.index}`]) || 0 : 0;
    };
    return pageOf(currentBodyHeading()) || pageOf(docLabels.notes) || 0;
  }

  // Keep the keyboard shortcuts pointed at the live handlers.
  printRef.current = openPrint;
  saveRef.current = saveMeeting;
  saveAsRef.current = saveMeetingAs;

  // Open the print dialog: build the printable document (the PDF layout) and
  // paginate it once, so the dialog can show a real page count and range.
  async function openPrint() {
    setFileOpen(false);
    if (empty || printBusy) return;
    setPrintBusy(true);
    setPrintOpen(true);
    setStatus(t('status.printPreparing'));
    // The printer list can be fetched while the document is being laid out.
    printPrinters().then(setPrinters).catch(() => setPrinters([]));
    try {
      const name = (exportName || baseName || 'meeting').trim() || 'meeting';
      const prepared = await preparePrint(fullMarkdown, buildExportOpts(), name);
      setPrintDoc({ ...prepared, currentPage: resolveCurrentPage(prepared.map) });
      setStatus(prepared.pages ? t('status.printReady', { count: prepared.pages }) : t('status.ready'));
    } catch (err) {
      setPrintOpen(false);
      setStatus(t('status.printErr', { msg: err?.message || String(err) }));
      showError(t('status.printErr', { msg: err?.message || String(err) }), err?.stack);
    } finally {
      setPrintBusy(false);
    }
  }

  // `pages` is an array of 1-based page numbers, or null for the whole document.
  // `opts` carries the printer and per-job settings chosen in the dialog.
  async function doPrint(pages, opts) {
    if (!printDoc || printBusy) return;
    setPrintBusy(true);
    setStatus(t('status.printing'));
    try {
      const r = await runPrint(printDoc.html, pages, opts || printOptions);
      if (r && r.ok) {
        const count = pages ? pages.length : (r.pages || printDoc.pages);
        setStatus(t('status.printed', { count }));
        notify(t('toast.printed', { count }));
        setPrintOpen(false);
      } else if (r && /cancel/i.test(r.reason || '')) {
        setStatus(t('status.printCancel'));
        setPrintOpen(false);
      } else {
        const msg = (r && r.reason) || t('status.printUnavailable');
        setStatus(t('status.printErr', { msg }));
        showError(t('status.printErr', { msg }));
      }
    } catch (err) {
      setStatus(t('status.printErr', { msg: err?.message || String(err) }));
      showError(t('status.printErr', { msg: err?.message || String(err) }), err?.stack);
    } finally {
      setPrintBusy(false);
    }
  }

  // ── Navigation / preferences ────────────────────────────
  // Structure items come from the whole document; navigate the editor to the
  // matching notes heading when there is one (section wrappers like "Agenda"
  // live in the sidebar and simply have no editor target).
  const stripNum = (s) => String(s || '').replace(/^\s*\d+(?:\.\d+)*\s+/, '').trim();
  function scrollToHeading(h) {
    const el = richApi.current?.el?.();
    if (!el) return;
    const wanted = stripNum(h.text);
    const target = [...el.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .find((n) => stripNum(n.textContent) === wanted);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      el.focus();
    } catch { /* ignore */ }
  }

  // Selecting a Structure row: headings jump to the editor, everything else
  // came from the details panel — switch to it, focus the field and, for a
  // one-entry-per-line list, select the exact line.
  function selectStructure(node) {
    if (!node) return;
    if (!node.kind || node.kind === 'heading') { scrollToHeading(node); return; }
    setLeftTab('details');
    // The details form only mounts once the tab switch has been committed, so
    // wait for the field to exist rather than racing the first frame.
    const focusField = (tries = 0) => {
      const el = document.getElementById(`f-${node.field}`);
      if (!el) {
        if (tries < 20) setTimeout(() => focusField(tries + 1), 16);
        return;
      }
      el.focus();
      if (node.lineIndex != null && typeof el.value === 'string') {
        const rows = el.value.split('\n');
        let start = 0;
        for (let i = 0; i < node.lineIndex && i < rows.length; i++) start += rows[i].length + 1;
        const len = rows[node.lineIndex] ? rows[node.lineIndex].length : 0;
        try { el.setSelectionRange(start, start + len); } catch { /* ignore */ }
      }
      el.scrollIntoView({ block: 'nearest' });
    };
    setTimeout(() => focusField(), 0);
  }

  function toggleLang() { changeLang(lang === 'ko' ? 'en' : 'ko'); }
  function changeLang(next) {
    i18n.changeLanguage(next);
    localStorage.setItem('mtg-lang', next);
    setLang(next);
    saveSettingsToDisk();
  }
  function cycleTheme() {
    setThemeAuto(false);
    setTheme(nextThemeId(theme));
  }
  function pickTheme(id) {
    setThemeAuto(false);
    setTheme(id);
    setThemeOpen(false);
  }
  function pickAutoTheme() {
    setThemeAuto(true);
    setTheme(preferredThemeForMode(systemThemeMode()));
    setThemeOpen(false);
  }
  function openSettings() {
    if (isElectron) {
      api.openSettings();
    } else {
      const url = `${window.location.pathname}${window.location.search}#settings`;
      window.open(url, 'mtg-settings', 'width=1060,height=720');
    }
  }
  function openAbout() {
    if (isElectron) {
      api.openAbout();
    } else {
      const url = `${window.location.pathname}${window.location.search}#about`;
      window.open(url, 'mtg-about', 'width=520,height=560');
    }
  }

  // ── Context menus ───────────────────────────────────────
  // On Electron use a real OS popup menu (never clipped by the window edge);
  // on the web fall back to the in-app DOM menu. Both drive the SAME items list,
  // so the available actions and their behavior are identical either way.
  const openCtx = (e, items) => {
    e.preventDefault(); e.stopPropagation();
    const x = e.clientX, y = e.clientY;
    if (isElectron && api?.popupMenu) { showNativeMenu(items, x, y); return; }
    setCtx({ open: true, x, y, items });
  };
  const closeCtx = () => setCtx((c) => ({ ...c, open: false }));

  // Show the OS-native popup. If it is unavailable or fails for ANY reason, fall
  // back to the in-app DOM menu so a context menu is never silently lost.
  async function showNativeMenu(items, x, y) {
    // Map to a serializable template; the index is the id we get back on click.
    const template = items.map((it, i) => (
      it.separator ? { type: 'separator' } : { id: String(i), label: it.label, enabled: !it.disabled }
    ));
    try {
      const res = await api.popupMenu(template);
      if (res && res.shown) {
        if (res.id != null) items[Number(res.id)]?.onClick?.();
        return;
      }
      // Native reported it could not display → use the DOM menu instead.
      setCtx({ open: true, x, y, items });
    } catch {
      setCtx({ open: true, x, y, items });
    }
  }

  async function copyText(text) {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  }
  function selectionText() { return window.getSelection?.().toString() || ''; }

  const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function editorMenu(e) {
    const hasSel = !!selectionText();
    // Markdown formatting inserts live on the format toolbar only; the context
    // menu keeps editing, media insert and file actions.
    openCtx(e, [
      { icon: IconUndo, label: t('ctx.undo'), disabled: !canUndo, onClick: editUndo },
      { icon: IconRedo, label: t('ctx.redo'), disabled: !canRedo, onClick: editRedo },
      { separator: true },
      { icon: IconCut, label: t('ctx.cut'), disabled: !hasSel, onClick: () => richApi.current?.cmd('cut') },
      { icon: IconCopy, label: t('ctx.copy'), disabled: !hasSel, onClick: () => { document.execCommand('copy'); } },
      { icon: IconPaste, label: t('ctx.paste'), onClick: editorPaste },
      { icon: IconSelectAll, label: t('ctx.selectAll'), onClick: () => richApi.current?.cmd('selectAll') },
      { separator: true },
      { icon: IconImage, label: t('ctx.insertMedia'), onClick: pickMedia },
      { separator: true },
      { icon: IconSave, label: t('ctx.save'), onClick: saveMeeting },
      { icon: IconSaveAs, label: t('ctx.saveAs'), onClick: saveMeetingAs },
      { icon: IconPdf, label: t('ctx.exportPdf'), disabled: empty, onClick: () => doExport('pdf') },
      { icon: IconWord, label: t('ctx.exportWord'), disabled: empty, onClick: () => doExport('word') },
    ]);
  }

  // Context menu for the raw Markdown source textarea. Uses execCommand so cut/
  // copy/paste act on the focused textarea (works natively in Electron).
  function sourceMenu(e) {
    const ta = e.target;
    const hasSel = !!ta && ta.selectionStart !== ta.selectionEnd;
    openCtx(e, [
      { icon: IconUndo, label: t('ctx.undo'), disabled: !canUndo, onClick: editUndo },
      { icon: IconRedo, label: t('ctx.redo'), disabled: !canRedo, onClick: editRedo },
      { separator: true },
      { icon: IconCut, label: t('ctx.cut'), disabled: !hasSel, onClick: () => { ta.focus(); document.execCommand('cut'); } },
      { icon: IconCopy, label: t('ctx.copy'), disabled: !hasSel, onClick: () => { ta.focus(); document.execCommand('copy'); } },
      { icon: IconPaste, label: t('ctx.paste'), onClick: () => { ta.focus(); document.execCommand('paste'); } },
      { icon: IconSelectAll, label: t('ctx.selectAll'), onClick: () => { ta.focus(); ta.select(); } },
    ]);
  }

  function outlineMenu(e, node) {
    const isHeading = !node.kind || node.kind === 'heading';
    openCtx(e, [
      { icon: IconTarget, label: t(isHeading ? 'ctx.goto' : 'ctx.gotoField'), onClick: () => selectStructure(node) },
      { icon: IconCopy, label: t(isHeading ? 'ctx.copyHeading' : 'ctx.copyEntry'), onClick: () => copyText(node.text) },
    ]);
  }

  // Context-menu "Paste": mirror the editor's native paste — bring in images,
  // rich HTML (formatting/tables/links) or plain text from the system clipboard.
  async function editorPaste() {
    const rapi = richApi.current;
    if (!rapi) return;
    rapi.focus();
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const imgType = it.types.find((tp) => tp.startsWith('image/'));
          if (imgType) {
            const blob = await it.getType(imgType);
            rapi.insertMedia(await loadMedia(new File([blob], 'pasted', { type: blob.type || imgType })));
            return;
          }
          if (it.types.includes('text/html')) {
            rapi.pasteRichHtml(await (await it.getType('text/html')).text());
            return;
          }
          if (it.types.includes('text/plain')) {
            rapi.insertPlainText(await (await it.getType('text/plain')).text());
            return;
          }
        }
      }
    } catch { /* fall through to plain-text read below */ }
    try {
      const text = await navigator.clipboard.readText();
      if (text) rapi.insertPlainText(text);
    } catch { /* ignore */ }
  }

  // ── Markdown formatting toolbar (operates on the rich editor) ──────────
  // Uses the contentEditable execCommand API exposed by RichEditor so edits are
  // applied to the interpreted content and serialized back to Markdown.
  const rich = () => richApi.current;

  // Undo / redo over our own body history (works identically on both the WYSIWYG
  // and Markdown tabs). Reloads the active editor via a docKey bump.
  function applyHistory(nextIndex) {
    const h = histRef.current;
    if (nextIndex < 0 || nextIndex > h.stack.length - 1) return;
    h.index = nextIndex;
    h.applying = true;
    const body = h.stack[nextIndex];
    skipHistResetRef.current = true;
    setMeeting((m) => ({ ...m, body }));
    bumpDoc();
  }
  function editUndo() { applyHistory(histRef.current.index - 1); }
  function editRedo() { applyHistory(histRef.current.index + 1); }
  const wrapInline = (tag) => {
    const api = rich(); if (!api) return;
    const sel = api.selection();
    api.insertHTML(`<${tag}>${escHtml(sel || t(tag === 'code' ? 'fmt.code1' : 'fmt.item'))}</${tag}>`);
  };
  const insertLink = () => {
    const api = rich(); if (!api) return;
    const sel = api.selection() || t('fmt.linkText');
    api.insertHTML(`<a href="https://">${escHtml(sel)}</a>`);
  };
  const insertTable = () => {
    const h = escHtml(t('doc.field')); const v = escHtml(t('doc.value'));
    rich()?.insertHTML(
      `<table><thead><tr><th>${h}</th><th>${v}</th></tr></thead>`
      + `<tbody><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br></p>`);
  };

  // Insert media (image / video / audio) via the file dialog. Reads each chosen
  // file into an embedded base64 data: URL and drops it into the active editor —
  // the WYSIWYG caret (works in table cells) or the Markdown source caret — so it
  // travels inside every export.
  const pickMedia = () => mediaInputRef.current?.click();
  function mediaTagFor({ kind, dataUrl, width }) {
    const w = width ? ` width="${width}"` : '';
    if (kind === 'video') return `<video src="${dataUrl}" controls${w}></video>`;
    if (kind === 'audio') return `<audio src="${dataUrl}" controls></audio>`;
    return `<img src="${dataUrl}" alt=""${w}>`;
  }
  function insertMediaIntoSource(info) {
    const ta = mdSourceRef.current;
    const tag = mediaTagFor(info);
    const cur = meeting.body || '';
    if (!ta) { update('body', cur ? `${cur}\n\n${tag}` : tag); return; }
    const s = ta.selectionStart ?? cur.length;
    const e = ta.selectionEnd ?? s;
    update('body', cur.slice(0, s) + tag + cur.slice(e));
  }
  async function onMediaSelected(e) {
    const files = Array.from(e.target.files || []).filter(isMediaFile);
    e.target.value = '';
    if (!files.length) return;
    for (const f of files) {
      try {
        const info = await loadMedia(f);
        if (editMode === 'markdown' || !rich()) insertMediaIntoSource(info);
        else rich().insertMedia(info);
      } catch (err) {
        showError(t('status.mediaErr', { msg: err?.message || String(err) }), err?.stack);
      }
    }
  }

  const FORMAT_ACTIONS = [
    { key: 'bold', icon: IconBold, run: () => rich()?.cmd('bold') },
    { key: 'italic', icon: IconItalic, run: () => rich()?.cmd('italic') },
    { key: 'strike', icon: IconStrike, run: () => rich()?.cmd('strikeThrough') },
    { key: 'underline', icon: IconUnderline, run: () => rich()?.cmd('underline') },
    { sep: true },
    // Heading levels H1–H6 (formatBlock on the current line/selection).
    ...[1, 2, 3, 4, 5, 6].map((lvl) => ({
      key: `h${lvl}`, text: `H${lvl}`, icon: IconHeading,
      run: () => rich()?.cmd('formatBlock', `H${lvl}`),
    })),
    { sep: true },
    { key: 'ul', icon: IconList, run: () => rich()?.cmd('insertUnorderedList') },
    { key: 'ol', icon: IconListOrdered, run: () => rich()?.cmd('insertOrderedList') },
    { key: 'check', icon: IconChecklist, run: () => rich()?.insertHTML('<ul><li>[ ] </li></ul>') },
    { key: 'quote', icon: IconQuote, run: () => rich()?.cmd('formatBlock', 'BLOCKQUOTE') },
    { sep: true },
    { key: 'code', icon: IconCode, run: () => wrapInline('code') },
    { key: 'codeblock', icon: IconHtml, run: () => rich()?.cmd('formatBlock', 'PRE') },
    { key: 'link', icon: IconLink, run: insertLink },
    { key: 'table', icon: IconTable, run: insertTable },
    { key: 'image', icon: IconImage, run: pickMedia },
    { key: 'rule', icon: IconRule, run: () => rich()?.cmd('insertHorizontalRule') },
  ];

  // ── Stats ───────────────────────────────────────────────
  const stats = useMemo(() => {
    const trimmed = fullMarkdown.trim();
    return {
      chars: fullMarkdown.length,
      words: trimmed ? trimmed.split(/\s+/).length : 0,
      attendees: lines(meeting.attendees).length,
      agenda: lines(meeting.agenda).length,
    };
  }, [fullMarkdown, meeting.attendees, meeting.agenda]);

  const activeTheme = THEMES.find((th) => th.id === theme) || THEMES[0];

  // A labeled text field for the details panel. Rendered via a plain function
  // (not a nested component) so inputs keep focus across re-renders.
  // `model` is the meeting key this field edits — it differs from the label /
  // element id only for Action Items, whose model key is `actionItems`.
  const field = (id, { area = false, rows = 3, model = id } = {}) => (
    <div className={`mfield${area ? ' area' : ''}`} key={id}>
      <label htmlFor={`f-${model}`}>{t(`fields.${id}`)}</label>
      {area ? (
        <textarea id={`f-${model}`} rows={rows} value={meeting[model] || ''}
          placeholder={t(`fields.${id}Ph`)} onChange={(e) => update(model, e.target.value)} spellCheck={false} />
      ) : (
        <input id={`f-${model}`} type="text" value={meeting[model] || ''}
          placeholder={t(`fields.${id}Ph`)} onChange={(e) => update(model, e.target.value)} />
      )}
    </div>
  );

  // Date field: free-text entry PLUS a calendar picker. The text box accepts any
  // format; the calendar button opens the native date picker and fills the box
  // with the chosen YYYY-MM-DD value.
  const dateFieldRef = useRef(null);
  const dateField = () => (
    <div className="mfield" key="date">
      <label htmlFor="f-date">{t('fields.date')}</label>
      <div className="date-control">
        <input id="f-date" type="text" value={meeting.date || ''} title={t('fields.dateHint')}
          placeholder={t('fields.datePh')} onChange={(e) => update('date', e.target.value)} />
        <button type="button" className="date-btn" title={t('fields.pickDate')}
          onClick={() => {
            const el = dateFieldRef.current;
            if (!el) return;
            try { el.showPicker ? el.showPicker() : el.focus(); } catch { el.focus(); }
          }}>
          <IconCalendar size={16} />
        </button>
        <input ref={dateFieldRef} type="date" className="date-native"
          value={/^\d{4}-\d{2}-\d{2}$/.test(meeting.date || '') ? meeting.date : ''}
          onChange={(e) => e.target.value && update('date', e.target.value)}
          tabIndex={-1} aria-hidden="true" />
      </div>
    </div>
  );

  // Time field: direct entry PLUS a dropdown of 30-minute options (native
  // combobox via <datalist>). Validates HH:MM format; the end time also checks
  // that it is not earlier than the start time.
  const timeField = (id) => {
    const val = meeting[id] || '';
    const trimmed = val.trim();
    const badFormat = trimmed !== '' && !TIME_RE.test(trimmed);
    let orderError = false;
    if (id === 'endTime' && !badFormat && trimmed) {
      const s = timeToMinutes(meeting.startTime || '');
      const e = timeToMinutes(trimmed);
      if (s != null && e != null && e < s) orderError = true;
    }
    const invalid = badFormat || orderError;
    return (
      <div className="mfield" key={id}>
        <label htmlFor={`f-${id}`}>{t(`fields.${id}`)}</label>
        <TimeCombo id={`f-${id}`} value={val} placeholder={t(`fields.${id}Ph`)}
          hint={t('fields.timeHint')}
          invalid={invalid} options={TIME_OPTIONS} onChange={(v) => update(id, v)} />
        {invalid && (
          <span className="field-error">{t(orderError ? 'fields.timeOrder' : 'fields.timeInvalid')}</span>
        )}
      </div>
    );
  };

  return (
    <div className="app">
      <TitleBar title={t('app.title')} />

      {/* hidden web open input */}
      <input ref={openInputRef} type="file" accept=".mtg,.json,application/json"
        style={{ display: 'none' }} onChange={onWebOpen} />
      {/* hidden media (image/video/audio) picker for the editor toolbar */}
      <input ref={mediaInputRef} type="file" accept={MEDIA_ACCEPT} multiple
        style={{ display: 'none' }} onChange={onMediaSelected} />

      <header className="toolbar" ref={toolbarRef}>
        <div className="toolbar-group">
          <div className="dropdown" ref={fileRef}>
            <button className="btn" title={t('tip.file')} onClick={() => setFileOpen((v) => !v)}>
              <IconFolder /> {t('toolbar.file')} <IconChevron size={14} />
            </button>
            {fileOpen && (
              <div className="dropdown-menu file-menu">
                <button className="dropdown-item" onClick={() => { setFileOpen(false); newDoc(); }}>
                  <IconFilePlus size={16} /> {t('toolbar.newDoc')}
                </button>
                <button className="dropdown-item" onClick={openMeeting}>
                  <IconFolder size={16} /> {t('open.browse')}
                </button>
                <button className="dropdown-item" disabled={empty} onClick={saveMeeting}>
                  <IconSave size={16} /> {t('toolbar.save')}
                </button>
                <button className="dropdown-item" disabled={empty} onClick={saveMeetingAs}>
                  <IconSaveAs size={16} /> {t('toolbar.saveAs')}
                </button>
                <button className="dropdown-item" disabled={empty} onClick={openPrint}>
                  <IconPrinter size={16} /> {t('toolbar.print')}
                </button>
                {isElectron && recent.files.length > 0 && (
                  <>
                    <div className="dropdown-head">{t('open.recent')}</div>
                    {recent.files.map((f) => (
                      <div key={f} className="recent-row">
                        <button className="dropdown-item recent-item" title={f} onClick={() => openRecent(f)}>
                          <IconPaper size={16} />
                          <span className="recent-text">
                            <span className="recent-name">{basenameOf(f)}</span>
                            <span className="recent-dir">{dirnameOf(f)}</span>
                          </span>
                        </button>
                        <button className="recent-del" title={t('open.remove')}
                          onClick={(e) => { e.stopPropagation(); removeRecent(f); }}>
                          <IconX size={14} />
                        </button>
                      </div>
                    ))}
                    <button className="dropdown-item danger" onClick={clearRecent}>
                      <IconTrash size={16} /> {t('open.clear')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="dropdown" ref={sampleRef}>
            <button className="btn" title={t('tip.sample')} onClick={() => setSampleOpen((v) => !v)}>
              <IconBulb /> {t('toolbar.sample')} <IconChevron size={14} />
            </button>
            {sampleOpen && (
              <div className="dropdown-menu template-menu">
                <div className="dropdown-head">{t('sample.pick')}</div>
                {TEMPLATES.map((tpl) => (
                  <button key={tpl.id} className="dropdown-item" onClick={() => loadTemplate(tpl)}>
                    <IconPaper size={16} /> {templateName(tpl, lang)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="dropdown" ref={exportRef}>
            <button className="btn" title={t('tip.export')} onClick={() => setExportOpen((v) => !v)} disabled={empty}>
              <IconExport /> {t('toolbar.export')} <IconChevron size={14} />
            </button>
            {exportOpen && (
              <div className="dropdown-menu export-menu">
                <div className="export-name">
                  <label>{t('export.filename')}</label>
                  <input
                    type="text"
                    value={exportName}
                    placeholder={baseName || 'meeting'}
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
          <button className="btn" title={t('tip.print')} onClick={openPrint} disabled={empty}>
            <IconPrinter /> {t('toolbar.printBtn')}
          </button>
          <button className="btn" title={t('tip.media')} onClick={pickMedia}>
            <IconImage /> {t('toolbar.media')}
          </button>
        </div>
        <div className="toolbar-group">
          <button className="iconbtn" title={t('fmt.undo')} onMouseDown={(e) => e.preventDefault()}
            onClick={editUndo} disabled={!canUndo}><IconUndo /></button>
          <button className="iconbtn" title={t('fmt.redo')} onMouseDown={(e) => e.preventDefault()}
            onClick={editRedo} disabled={!canRedo}><IconRedo /></button>
        </div>
        <div className="toolbar-group toolbar-font" title={t('tip.font')}>
          <select
            className="tb-font" title={t('settings.font')} aria-label={t('settings.font')}
            value={exportSettings.fontFamily || ''}
            style={exportSettings.fontFamily ? { fontFamily: `"${exportSettings.fontFamily}"` } : undefined}
            onChange={(e) => setExportSettings((s) => ({ ...s, fontFamily: e.target.value }))}
          >
            <option value="">{t('settings.fontDefault')}</option>
            {fontsWith(fonts, exportSettings.fontFamily).map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <input
            className="tb-size" type="number" min="6" max="48" step="0.5"
            title={t('settings.fontSize')} aria-label={t('settings.fontSize')}
            value={exportSettings.fontSizePt}
            onChange={(e) => setExportSettings((s) => ({ ...s, fontSizePt: Number(e.target.value) || 10 }))}
          />
        </div>
        <div className="toolbar-spacer" />
        <div className="toolbar-group">
          <button className="iconbtn" title={t('tip.clear')} onClick={clearAll} disabled={empty}><IconTrash /></button>
          <button className="iconbtn lang-btn" title={`${t('tip.lang')} — ${lang === 'ko' ? 'EN' : '한글'}`} onClick={toggleLang}>
            <IconGlobe /><span className="lang-code">{lang === 'ko' ? 'EN' : '한글'}</span>
          </button>
          <button className="iconbtn" title={t('tip.themeCycle')} onClick={cycleTheme}><IconRefresh /></button>
          <div className="dropdown" ref={themeRef}>
            <button
              className={`tb-theme${themeAuto ? ' on' : ''}`}
              title={`${t('tip.theme')} — ${t(`theme.${theme}`)}`}
              onClick={() => {
                setThemeOpen((v) => !v);
                setFileOpen(false);
                setSampleOpen(false);
                setExportOpen(false);
              }}
            >
              <span className="theme-swatch-mini" aria-hidden="true">
                {activeTheme.bars.map((c, i) => <i key={i} style={{ background: c }} />)}
              </span>
              <span className="tb-theme-name">{themeAuto ? t('theme.auto') : t(`theme.${theme}`)}</span>
              <IconChevron size={14} />
            </button>
            {themeOpen && (
              <div className="dropdown-menu theme-menu">
                <button className={`dropdown-item${themeAuto ? ' on' : ''}`} onClick={pickAutoTheme}>
                  <IconContrast size={16} />
                  <span>{t('theme.auto')}</span>
                  {themeAuto && <span className="tick"><IconCheck size={14} /></span>}
                </button>
                {['dark', 'light'].map((mode) => (
                  <React.Fragment key={mode}>
                    <div className="dropdown-head">{t(mode === 'dark' ? 'theme.groupDark' : 'theme.groupLight')}</div>
                    {themesByMode(mode).map((th) => (
                      <button
                        key={th.id}
                        className={`dropdown-item${theme === th.id && !themeAuto ? ' on' : ''}`}
                        onClick={() => pickTheme(th.id)}
                      >
                        <span className="theme-swatch-mini" aria-hidden="true">
                          {th.bars.map((c, i) => <i key={i} style={{ background: c }} />)}
                        </span>
                        <span>{t(`theme.${th.id}`)}</span>
                        {theme === th.id && !themeAuto && <span className="tick"><IconCheck size={14} /></span>}
                      </button>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
          <button className="iconbtn" title={t('tip.settings')} onClick={openSettings}><IconSettings /></button>
          <button className="iconbtn" title={t('tip.about')} onClick={openAbout}><IconInfo /></button>
        </div>
      </header>

      <div className="options">
        <label className="opt">
          <input type="checkbox" checked={numbering}
            onChange={(e) => setExportSettings((s) => ({ ...s, numbering: e.target.checked }))} />
          {t('opts.numbering')}
        </label>
        <label className="opt">
          <input type="checkbox" checked={exportSettings.coverPage !== false}
            onChange={(e) => setExportSettings((s) => ({ ...s, coverPage: e.target.checked }))} />
          {t('opts.cover')}
        </label>
        <label className="opt">
          <input type="checkbox" checked={exportSettings.tocPage !== false}
            onChange={(e) => setExportSettings((s) => ({ ...s, tocPage: e.target.checked }))} />
          {t('opts.toc')}
        </label>
        <label className="opt">
          <input type="checkbox" checked={exportSettings.showPageNumber !== false}
            onChange={(e) => setExportSettings((s) => ({ ...s, showPageNumber: e.target.checked }))} />
          {t('opts.pageNumber')}
        </label>
      </div>

      <main className="body" ref={bodyRef}>
        <aside className="sidebar" style={{ width: sidebarWidth, flex: '0 0 auto' }}>
          <div className="tabs">
            <button className={leftTab === 'details' ? 'tab active' : 'tab'} onClick={() => setLeftTab('details')}>{t('tab.details')}</button>
            <button className={leftTab === 'structure' ? 'tab active' : 'tab'} onClick={() => setLeftTab('structure')}>{t('tab.structure')}</button>
          </div>
          <div className="sidebar-body">
            {leftTab === 'details' ? (
              <div className="details-form">
                {field('title')}
                <div className="mfield-row">
                  {dateField()}
                  {field('location')}
                </div>
                <div className="mfield-row">
                  {timeField('startTime')}
                  {timeField('endTime')}
                </div>
                <div className="mfield-row">
                  {field('organizer')}
                  {field('recorder')}
                </div>
                {field('attendees', { area: true, rows: 3 })}
                {field('agenda', { area: true, rows: 3 })}
                {field('decisions', { area: true, rows: 3 })}
                {field('actions', { area: true, rows: 3, model: 'actionItems' })}
              </div>
            ) : (
              <OutlineTree outline={structure} onSelect={selectStructure} onItemContextMenu={outlineMenu} />
            )}
          </div>
        </aside>

        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          title={t('tip.resizePanel')}
          onMouseDown={startSidebarResize}
          onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT)}
        />

        <section className="main">
          <div className="main-head main-tabs">
            <button className={editMode === 'wysiwyg' ? 'tab active' : 'tab'} onClick={() => setEditMode('wysiwyg')}>
              {t('tab.edit')}
            </button>
            <button className={editMode === 'markdown' ? 'tab active' : 'tab'} onClick={() => setEditMode('markdown')}>
              {t('tab.markdown')}
            </button>
          </div>
          {editMode === 'wysiwyg' ? (
            <>
              <div className="format-bar" role="toolbar" aria-label={t('fmt.label')}>
                {FORMAT_ACTIONS.map((a, i) => {
                  if (a.sep) return <span className="fmt-sep" key={`s${i}`} />;
                  const Ico = a.icon;
                  return (
                    <button key={a.key} type="button" className={`fmt-btn${a.text ? ' fmt-text' : ''}`}
                      title={t(`fmt.${a.key}`)} onMouseDown={(e) => e.preventDefault()} onClick={a.run}>
                      {a.text ? a.text : <Ico size={16} />}
                    </button>
                  );
                })}
              </div>
              <div className="main-body">
                <RichEditor
                  markdown={meeting.body || ''}
                  docKey={docKey}
                  placeholder={t('fields.bodyPh')}
                  onChange={(md) => update('body', md)}
                  apiRef={richApi}
                  onContextMenu={editorMenu}
                  style={{ fontFamily: fontStack(exportSettings.fontFamily), fontSize: `${exportSettings.fontSizePt || 10}pt` }}
                />
              </div>
            </>
          ) : (
            <div className="main-body">
              <textarea
                ref={mdSourceRef}
                className="md-source"
                value={meeting.body || ''}
                placeholder={t('fields.bodyPh')}
                spellCheck={false}
                onChange={(e) => update('body', e.target.value)}
                onContextMenu={sourceMenu}
              />
            </div>
          )}
        </section>
      </main>

      <footer className="statusbar">
        <span className="status-text" title={status}>{status}</span>
        <div className="status-stats">
          <span className="stat" title={t('stat.attendees')}>{t('stat.aAbbr')} {stats.attendees}</span>
          <span className="stat" title={t('stat.agenda')}><IconHash size={13} /> {stats.agenda}</span>
          <span className="stat" title={t('stat.words')}>{t('stat.wAbbr')} {stats.words}</span>
          <span className="stat" title={t('stat.chars')}>{t('stat.cAbbr')} {stats.chars}</span>
          <span className="stat" title={t('settings.font')}>{exportSettings.fontFamily || t('settings.fontDefault')} · {exportSettings.fontSizePt}pt</span>
          <span className="stat" title={t('settings.theme')}>
            {themeAuto ? `${t('theme.auto')} · ` : ''}{t(`theme.${theme}`)}
          </span>
          {isElectron && (
            <span className="stat" title={docPath || t('status.unsavedFileHint')}>
              {docPath ? basenameOf(docPath) : t('status.unsavedFile')}
            </span>
          )}
        </div>
      </footer>

      <ContextMenu open={ctx.open} x={ctx.x} y={ctx.y} items={ctx.items} onClose={closeCtx} />
      <Toasts toasts={toasts} onDismiss={dismissToast} />
      <ExportProgressDialog open={!!exporting} label={exporting || ''} />
      <ExportResultDialog result={exportResult} onClose={() => setExportResult(null)} />
      <PrintDialog
        open={printOpen}
        busy={printBusy}
        pages={printDoc?.pages || 0}
        currentPage={printDoc?.currentPage || 0}
        html={printDoc?.html || ''}
        printers={printers}
        options={printOptions}
        onOptions={setPrintOptions}
        onPrint={doPrint}
        onClose={() => { if (!printBusy) { setPrintOpen(false); setPrintDoc(null); } }}
      />
      <ErrorDialog error={errorInfo} onClose={() => setErrorInfo(null)} />
      <Tooltip />
    </div>
  );
}
