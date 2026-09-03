import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import TitleBar from './components/TitleBar';
import FileList from './components/FileList';
import OutlineTree from './components/OutlineTree';
import { THEMES } from './lib/themes';
import ContextMenu from './components/ContextMenu';
import Tooltip from './components/Tooltip';
import Toasts from './components/Toasts';
import ExportResultDialog from './components/ExportResultDialog';
import ExportProgressDialog from './components/ExportProgressDialog';
import ImportProgressDialog from './components/ImportProgressDialog';
import {
  IconFolder, IconFilePlus, IconMerge, IconHash, IconExport, IconChevron,
  IconMd, IconHtml, IconPdf, IconWord, IconTrash, IconInfo, IconSettings,
  IconSun, IconMoon, IconUp, IconDown, IconX, IconCheckSquare, IconSquare,
  IconCopy, IconCut, IconPaste, IconSelectAll, IconTarget,
} from './components/Icons';
import { isElectron, api, readFileText, readFileDataURL, saveSettingsToDisk } from './lib/platform';
import { embedImages, resolveRelPath, IMAGE_EXTS } from './lib/images';
import {
  mergeFiles, renumberHeadings, getOutline, renderHtml, fontStack,
  sortFiles, parseExcludePatterns, isExcluded, DEFAULT_EXPORT_SETTINGS,
} from './lib/markdown';
import { exportMarkdown, exportHtml, exportPdf, exportWord } from './lib/export';

const MD_RE = /\.(md|markdown)$/i;
const THEME_IDS = THEMES.map((t) => t.id);
let uid = 0;
const nextId = () => `f${++uid}`;

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
  const [excludeText, setExcludeText] = useState('');
  const [insertFileHeaders, setInsertFileHeaders] = useState(false);
  const [numberHeadings, setNumberHeadings] = useState(true);

  const [merged, setMerged] = useState('');
  const [leftTab, setLeftTab] = useState('files');
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
  const previewHtml = useMemo(() => renderHtml(merged), [merged]);

  // Live preview: re-merge automatically whenever the selection or the merge
  // options change, so choosing files shows the result immediately. Manual
  // editor edits are intentionally superseded on the next selection change.
  const editedRef = useRef(false);
  useEffect(() => {
    const chosen = files.filter((f) => f.checked);
    if (!chosen.length) { setMerged(''); editedRef.current = false; return; }
    let out = mergeFiles(chosen, { insertFileHeaders });
    if (numberHeadings) out = renumberHeadings(out);
    setMerged(out);
    editedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, insertFileHeaders, numberHeadings]);

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

  // ── Import helpers (additive, deduped) ──────────────────
  function addImported(items) {
    const patterns = parseExcludePatterns(excludeText);
    let added = 0;
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.key));
      const additions = items
        .filter((it) => !isExcluded(it.relPath || it.name, patterns))
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
        it.content = await embedImages(raw, (src) => api.embedImage({ mdPath: it.fullPath, src }));
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
        it.content = await embedImages(it.content, (src) => api.embedImage({ mdPath: it.fullPath, src }));
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
        return file ? readFileDataURL(file) : null;
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
  function doMerge() {
    const chosen = files.filter((f) => f.checked);
    if (!chosen.length) return;
    let out = mergeFiles(chosen, { insertFileHeaders });
    if (numberHeadings) out = renumberHeadings(out);
    setMerged(out);
    setRightTab('preview');
    setLeftTab('structure');
    setStatus(t('status.merged', { count: chosen.length }));
    notify(t('toast.merged'), { message: t('status.merged', { count: chosen.length }) });
  }

  function doRenumber() {
    if (!merged) return;
    setMerged(renumberHeadings(merged));
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
    // Read the freshest settings from localStorage so changes made in the
    // separate settings window always apply, even if the live storage event
    // didn't reach this window.
    const fresh = loadSettings();
    setExportSettings(fresh);
    return {
      ...fresh,
      contentsLabel: t('export.contents'),
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

  function clearAll() {
    setFiles([]);
    setMerged('');
    setSourceDir('');
    setStatus(t('status.cleared'));
  }

  function scrollToHeading(h) {
    setRightTab('preview');
    requestAnimationFrame(() => {
      const el = previewRef.current?.querySelector(`#h-${h.index}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

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
      window.open(url, 'mmm-settings', 'width=700,height=880');
    }
  }

  function openAbout() {
    if (isElectron) {
      api.openAbout();
    } else {
      const url = `${window.location.pathname}${window.location.search}#about`;
      window.open(url, 'mmm-about', 'width=520,height=560');
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
      { separator: true },
      { icon: IconMerge, label: t('toolbar.merge'), disabled: !files.some((f) => f.checked), onClick: doMerge },
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

  function previewMenu(e) {
    const sel = selectionText();
    openCtx(e, [
      { icon: IconCopy, label: t('ctx.copy'), disabled: !sel, onClick: () => copyText(sel) },
      { icon: IconCopy, label: t('ctx.copyAll'), disabled: !merged, onClick: () => copyText(previewRef.current?.innerText || '') },
      { separator: true },
      { icon: IconHash, label: t('toolbar.renumber'), disabled: !merged, onClick: doRenumber },
      { separator: true },
      { icon: IconPdf, label: t('export.pdf'), disabled: !merged, onClick: () => doExport('pdf') },
      { icon: IconWord, label: t('export.word'), disabled: !merged, onClick: () => doExport('word') },
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
      { icon: IconHash, label: t('toolbar.renumber'), disabled: !merged, onClick: doRenumber },
    ]);
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

  const hasChecked = files.some((f) => f.checked);
  const checkedCount = files.filter((f) => f.checked).length;
  const stats = useMemo(() => {
    const trimmed = merged.trim();
    return {
      chars: merged.length,
      words: trimmed ? trimmed.split(/\s+/).length : 0,
    };
  }, [merged]);
  const ThemeIcon = theme === 'light' || theme === 'solarized' ? IconMoon : IconSun;

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
        </div>
        <div className="toolbar-group">
          <button className="btn primary" title={t('tip.merge')} onClick={doMerge} disabled={!hasChecked}><IconMerge /> {t('toolbar.merge')}</button>
          <button className="btn" title={t('tip.renumber')} onClick={doRenumber} disabled={!merged}><IconHash /> {t('toolbar.renumber')}</button>
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
        <div className="toolbar-spacer" />
        <div className="toolbar-group">
          <button className="iconbtn" title={t('tip.clear')} onClick={clearAll}><IconTrash /></button>
          <button className="iconbtn" title={t('tip.lang')} onClick={toggleLang}><span className="lang">{lang === 'ko' ? 'EN' : '한글'}</span></button>
          <button className="iconbtn" title={t('tip.theme')} onClick={cycleTheme}><ThemeIcon /></button>
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
        <label className="opt exclude">{t('opts.exclude')}:
          <input type="text" value={excludeText} placeholder={t('opts.excludePh')} onChange={(e) => setExcludeText(e.target.value)} />
        </label>
        <label className="opt"><input type="checkbox" checked={insertFileHeaders} onChange={(e) => setInsertFileHeaders(e.target.checked)} /> {t('opts.fileHeaders')}</label>
        <label className="opt"><input type="checkbox" checked={numberHeadings} onChange={(e) => setNumberHeadings(e.target.checked)} /> {t('opts.numbering')}</label>
      </div>

      <main className="body">
        <aside className="sidebar">
          <div className="tabs">
            <button className={leftTab === 'files' ? 'tab active' : 'tab'} onClick={() => setLeftTab('files')}>{t('tab.files')}</button>
            <button className={leftTab === 'structure' ? 'tab active' : 'tab'} onClick={() => setLeftTab('structure')}>{t('tab.structure')}</button>
          </div>
          <div className="sidebar-body">
            {leftTab === 'files'
              ? <FileList files={files} onToggle={toggle} onCheckAll={checkAll} onRemove={remove} onRemoveChecked={removeChecked} onMove={move} onReorder={reorder} onRowContextMenu={fileRowMenu} />
              : <OutlineTree outline={outline} onSelect={scrollToHeading} onItemContextMenu={outlineMenu} />}
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
                      fontSize: `${exportSettings.fontSizePt || 11}pt`,
                    }}
                    onContextMenu={previewMenu} dangerouslySetInnerHTML={{ __html: previewHtml }} />
                : <div className="empty"><p className="muted">{t('preview.empty')}</p></div>
            ) : (
              <textarea ref={editorRef} className="editor" value={merged}
                onChange={(e) => { editedRef.current = true; setMerged(e.target.value); }}
                onContextMenu={editorMenu} spellCheck={false} placeholder={t('preview.empty')} />
            )}
          </div>
        </section>
      </main>

      <footer className="statusbar">
        <span className="status-text" title={status}>{status}</span>
        <div className="status-stats">
          <span className="stat" title={t('stat.files')}><IconFilePlus size={13} /> {checkedCount}/{files.length}</span>
          <span className="stat" title={t('stat.headings')}><IconHash size={13} /> {outline.length}</span>
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
      <ExportProgressDialog open={!!exporting} label={exporting || ''} />
      <ExportResultDialog result={exportResult} onClose={() => setExportResult(null)} />
      <Tooltip />
    </div>
  );
}
