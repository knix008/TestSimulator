import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import TitleBar from './components/TitleBar';
import OutlineTree from './components/OutlineTree';
import { THEMES } from './lib/themes';
import ContextMenu from './components/ContextMenu';
import Tooltip from './components/Tooltip';
import Toasts from './components/Toasts';
import ExportResultDialog from './components/ExportResultDialog';
import ExportProgressDialog from './components/ExportProgressDialog';
import ErrorDialog from './components/ErrorDialog';
import TimeCombo, { nowRounded } from './components/TimeCombo';
import RichEditor from './components/RichEditor';
import {
  IconFilePlus, IconFolder, IconSave, IconExport, IconChevron,
  IconMd, IconHtml, IconPdf, IconWord, IconPaper, IconTrash, IconInfo, IconSettings,
  IconSun, IconMoon, IconX, IconCopy, IconCut, IconPaste, IconSelectAll, IconTarget,
  IconStars, IconSnow, IconLeaf, IconFlower, IconSunrise, IconContrast, IconBulb,
  IconDroplet, IconCoffee, IconCloud, IconGlobe, IconHash, IconCalendar,
  IconBold, IconItalic, IconStrike, IconUnderline, IconHeading, IconList, IconListOrdered, IconChecklist,
  IconQuote, IconCode, IconLink, IconTable, IconRule, IconImage, IconUndo, IconRedo,
} from './components/Icons';
import { isElectron, api, saveText, readFileText, openTextFile, readPath, saveSettingsToDisk } from './lib/platform';
import { loadMedia, isMediaFile, MEDIA_ACCEPT } from './lib/media';
import { getOutline, DEFAULT_EXPORT_SETTINGS, fontStack } from './lib/markdown';
import { getSystemFonts } from './lib/fonts';
import { exportMarkdown, exportHtml, exportPdf, exportWord } from './lib/export';
import {
  createEmptyMeeting, meetingToMarkdown, meetingToPlainText,
  meetingBaseName, isMeetingEmpty, lines,
} from './lib/meeting';
import { TEMPLATES, templateName, templateMeeting } from './lib/templates';

const THEME_IDS = THEMES.map((t) => t.id);
// Each theme shows its own toolbar glyph so the current theme is recognizable.
const THEME_ICONS = {
  dark: IconMoon, light: IconSun, white: IconBulb, midnight: IconStars, nord: IconSnow,
  forest: IconLeaf, rose: IconFlower, solarized: IconSunrise, contrast: IconContrast,
  ocean: IconDroplet, mocha: IconCoffee, sky: IconCloud,
};

// Time combobox: 15-minute options for the dropdown + a validator.
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, '0');
  const m = String((i % 4) * 15).padStart(2, '0');
  return `${h}:${m}`;
});
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const timeToMinutes = (s) => {
  const m = String(s).trim().match(TIME_RE);
  if (!m) return null;
  const [hh, mm] = s.trim().split(':');
  return Number(hh) * 60 + Number(mm);
};

function loadExportSettings() {
  try {
    const raw = localStorage.getItem('mtg-export');
    if (raw) return { ...DEFAULT_EXPORT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_EXPORT_SETTINGS };
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
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const v = Number(localStorage.getItem('mtg-sidebar-w'));
    return v >= 240 && v <= 900 ? v : 340;
  });
  const [status, setStatus] = useState(t('status.ready'));
  const [exportOpen, setExportOpen] = useState(false);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [openOpen, setOpenOpen] = useState(false);
  const [recent, setRecent] = useState(loadRecent);
  const [theme, setTheme] = useState(() => {
    const s = localStorage.getItem('mtg-theme');
    return THEME_IDS.includes(s) ? s : 'dark';
  });
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
  const richApi = useRef(null);
  const [docKey, setDocKey] = useState(0);
  const bumpDoc = () => setDocKey((k) => k + 1);
  const exportRef = useRef(null);
  const sampleRef = useRef(null);
  const openRef = useRef(null);

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
  const empty = isMeetingEmpty(meeting);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('mtg-theme', theme);
    saveSettingsToDisk();
  }, [theme]);

  // Load the system font list once for the toolbar font picker.
  useEffect(() => {
    let alive = true;
    getSystemFonts().then((list) => { if (alive) setFonts(list); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Persist the sidebar width chosen via the splitter.
  useEffect(() => {
    try { localStorage.setItem('mtg-sidebar-w', String(Math.round(sidebarWidth))); } catch { /* ignore */ }
  }, [sidebarWidth]);

  // Drag the splitter to resize the sidebar (clamped so the editor keeps room).
  function startSidebarResize(e) {
    e.preventDefault();
    const onMove = (ev) => {
      const rect = bodyRef.current?.getBoundingClientRect();
      const left = rect ? rect.left : 0;
      const total = rect ? rect.width : window.innerWidth;
      const w = Math.max(240, Math.min(ev.clientX - left, total - 360));
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

  // Autosave the current meeting draft so a reload restores it.
  useEffect(() => {
    try { localStorage.setItem('mtg-doc', JSON.stringify(meeting)); } catch { /* ignore */ }
  }, [meeting]);

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
      const lg = localStorage.getItem('mtg-lang');
      if (lg && lg !== i18n.language) { i18n.changeLanguage(lg); setLang(lg); }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    if (!exportOpen && !sampleOpen && !openOpen) return;
    const onDown = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
      if (sampleRef.current && !sampleRef.current.contains(e.target)) setSampleOpen(false);
      if (openRef.current && !openRef.current.contains(e.target)) setOpenOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [exportOpen, sampleOpen, openOpen]);

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
    setOpenOpen(false);
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
    bumpDoc();
    setStatus(t('status.newDoc'));
  }
  function loadTemplate(tpl) {
    setSampleOpen(false);
    setMeeting(templateMeeting(tpl, lang));
    exportNameEdited.current = false;
    bumpDoc();
    setStatus(t('status.templateLoaded', { name: templateName(tpl, lang) }));
    notify(t('toast.opened'), { message: templateName(tpl, lang) });
  }
  function clearAll() {
    setMeeting(createEmptyMeeting());
    exportNameEdited.current = false;
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
    if (fullPath) rememberPath(fullPath);
    setStatus(t('status.opened', { path: name }));
    notify(t('toast.opened'));
    return true;
  }

  async function openMeeting() {
    setOpenOpen(false);
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
    setOpenOpen(false);
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

  async function saveMeeting() {
    try {
      const base = (exportName || baseName || 'meeting').trim() || 'meeting';
      const saved = await saveText({
        defaultName: `${base}.mtg`,
        content: JSON.stringify(meeting, null, 2),
        filters: FILE_FILTERS,
        defaultDir: recent.dir,
      });
      if (saved) {
        rememberPath(String(saved));
        setStatus(t('status.saved', { path: saved }));
        notify(t('toast.saved'), { message: String(saved), type: 'success' });
      } else {
        setStatus(t('status.saveCancel'));
      }
    } catch (err) {
      showError(t('status.exportErr', { msg: err?.message || String(err) }), err?.stack);
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

  function toggleLang() { changeLang(lang === 'ko' ? 'en' : 'ko'); }
  function changeLang(next) {
    i18n.changeLanguage(next);
    localStorage.setItem('mtg-lang', next);
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
      { icon: IconUndo, label: t('ctx.undo'), onClick: () => richApi.current?.cmd('undo') },
      { icon: IconRedo, label: t('ctx.redo'), onClick: () => richApi.current?.cmd('redo') },
      { separator: true },
      { icon: IconCut, label: t('ctx.cut'), disabled: !hasSel, onClick: () => richApi.current?.cmd('cut') },
      { icon: IconCopy, label: t('ctx.copy'), disabled: !hasSel, onClick: () => { document.execCommand('copy'); } },
      { icon: IconPaste, label: t('ctx.paste'), onClick: editorPaste },
      { icon: IconSelectAll, label: t('ctx.selectAll'), onClick: () => richApi.current?.cmd('selectAll') },
      { separator: true },
      { icon: IconImage, label: t('ctx.insertMedia'), onClick: pickMedia },
      { separator: true },
      { icon: IconSave, label: t('ctx.save'), onClick: saveMeeting },
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
      { icon: IconUndo, label: t('ctx.undo'), onClick: () => { ta.focus(); document.execCommand('undo'); } },
      { icon: IconRedo, label: t('ctx.redo'), onClick: () => { ta.focus(); document.execCommand('redo'); } },
      { separator: true },
      { icon: IconCut, label: t('ctx.cut'), disabled: !hasSel, onClick: () => { ta.focus(); document.execCommand('cut'); } },
      { icon: IconCopy, label: t('ctx.copy'), disabled: !hasSel, onClick: () => { ta.focus(); document.execCommand('copy'); } },
      { icon: IconPaste, label: t('ctx.paste'), onClick: () => { ta.focus(); document.execCommand('paste'); } },
      { icon: IconSelectAll, label: t('ctx.selectAll'), onClick: () => { ta.focus(); ta.select(); } },
    ]);
  }

  function outlineMenu(e, h) {
    openCtx(e, [
      { icon: IconTarget, label: t('ctx.goto'), onClick: () => scrollToHeading(h) },
      { icon: IconCopy, label: t('ctx.copyHeading'), onClick: () => copyText(h.text) },
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
  // file into an embedded base64 data: URL and drops it at the editor caret — so
  // it can go into the body or a table cell, and travels inside every export.
  const pickMedia = () => mediaInputRef.current?.click();
  async function onMediaSelected(e) {
    const files = Array.from(e.target.files || []).filter(isMediaFile);
    e.target.value = '';
    if (!files.length) return;
    for (const f of files) {
      try {
        rich()?.insertMedia(await loadMedia(f));
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

  const ThemeIcon = THEME_ICONS[theme] || IconSun;

  // A labeled text field for the details panel. Rendered via a plain function
  // (not a nested component) so inputs keep focus across re-renders.
  const field = (id, { area = false, rows = 3 } = {}) => (
    <div className={`mfield${area ? ' area' : ''}`} key={id}>
      <label htmlFor={`f-${id}`}>{t(`fields.${id}`)}</label>
      {area ? (
        <textarea id={`f-${id}`} rows={rows} value={meeting[id] || ''}
          placeholder={t(`fields.${id}Ph`)} onChange={(e) => update(id, e.target.value)} spellCheck={false} />
      ) : (
        <input id={`f-${id}`} type="text" value={meeting[id] || ''}
          placeholder={t(`fields.${id}Ph`)} onChange={(e) => update(id, e.target.value)} />
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
        <input id="f-date" type="text" value={meeting.date || ''}
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

      <header className="toolbar">
        <div className="toolbar-group">
          <button className="btn" title={t('tip.newDoc')} onClick={newDoc}><IconFilePlus /> {t('toolbar.newDoc')}</button>
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
        </div>
        <div className="toolbar-group">
          <div className="dropdown" ref={openRef}>
            <button className="btn" title={t('tip.open')} onClick={() => setOpenOpen((v) => !v)}>
              <IconFolder /> {t('toolbar.open')} <IconChevron size={14} />
            </button>
            {openOpen && (
              <div className="dropdown-menu recent-menu">
                <button className="dropdown-item" onClick={openMeeting}>
                  <IconFolder size={16} /> {t('open.browse')}
                </button>
                {isElectron && (
                  recent.files.length > 0 ? (
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
                          <button
                            className="recent-del"
                            title={t('open.remove')}
                            onClick={(e) => { e.stopPropagation(); removeRecent(f); }}
                          >
                            <IconX size={14} />
                          </button>
                        </div>
                      ))}
                      <div className="ctxmenu-sep" />
                      <button className="dropdown-item danger" onClick={clearRecent}>
                        <IconTrash size={16} /> {t('open.clear')}
                      </button>
                    </>
                  ) : (
                    <div className="dropdown-empty">{t('open.empty')}</div>
                  )
                )}
              </div>
            )}
          </div>
          <button className="btn" title={t('tip.save')} onClick={saveMeeting} disabled={empty}><IconSave /> {t('toolbar.save')}</button>
        </div>
        <div className="toolbar-group">
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
        </div>
        <div className="toolbar-group toolbar-font" title={t('tip.font')}>
          <select
            className="tb-font" title={t('settings.font')} aria-label={t('settings.font')}
            value={exportSettings.fontFamily || ''}
            style={exportSettings.fontFamily ? { fontFamily: `"${exportSettings.fontFamily}"` } : undefined}
            onChange={(e) => setExportSettings((s) => ({ ...s, fontFamily: e.target.value }))}
          >
            <option value="">{t('settings.fontDefault')}</option>
            {(fonts || []).map((f) => <option key={f} value={f}>{f}</option>)}
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
          <button className="iconbtn" title={`${t('tip.theme')} — ${t(`theme.${theme}`)}`} onClick={cycleTheme}><ThemeIcon /></button>
          <button className="iconbtn" title={t('tip.settings')} onClick={openSettings}><IconSettings /></button>
          <button className="iconbtn" title={t('tip.about')} onClick={openAbout}><IconInfo /></button>
        </div>
      </header>

      <div className="options">
        <span className="options-label">{t('opts.label')}</span>
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
                {field('actions', { area: true, rows: 3 })}
              </div>
            ) : (
              <OutlineTree outline={outline} onSelect={scrollToHeading} onItemContextMenu={outlineMenu} />
            )}
          </div>
        </aside>

        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          title={t('tip.resizePanel')}
          onMouseDown={startSidebarResize}
          onDoubleClick={() => setSidebarWidth(340)}
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
                <button type="button" className="fmt-btn" title={t('fmt.undo')}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => rich()?.cmd('undo')}>
                  <IconUndo size={16} />
                </button>
                <button type="button" className="fmt-btn" title={t('fmt.redo')}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => rich()?.cmd('redo')}>
                  <IconRedo size={16} />
                </button>
                <span className="fmt-sep" />
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
          <span className="stat" title={t('settings.theme')}>{t(`theme.${theme}`)}</span>
        </div>
      </footer>

      <ContextMenu open={ctx.open} x={ctx.x} y={ctx.y} items={ctx.items} onClose={closeCtx} />
      <Toasts toasts={toasts} onDismiss={dismissToast} />
      <ExportProgressDialog open={!!exporting} label={exporting || ''} />
      <ExportResultDialog result={exportResult} onClose={() => setExportResult(null)} />
      <ErrorDialog error={errorInfo} onClose={() => setErrorInfo(null)} />
      <Tooltip />
    </div>
  );
}
