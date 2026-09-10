// Application shell: menu bar, scope sidebar, view host, status bar, dialogs.
// It owns the analysis lifecycle (scan → read → worker → result) and the
// exports; every view below it is a pure function of the result object.
//
// The window is frameless — this file draws the title bar (brand, drag handle,
// program info and the minimize/maximize/close controls). Everything the user
// operates, menus included, lives on the toolbar below it.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { platform } from './platform/adapter.js';
import { hydrate } from './core/analyze.js';
import { defaultSettings, normalizeSettings } from './core/settings.js';
import { LANGUAGES, detectLanguages, detectLanguagesFromExtensions, baseName } from './core/languages.js';
import { applyTheme, DEFAULT_THEME, THEMES, getTheme } from './themes.js';
import { buildReport, functionRowsForCsv } from './report/builder.js';
import { toHtml, toMarkdown, toDocx, toCsv } from './report/writers.js';
import { exportDiagram } from './report/diagramExport.js';
import buildInfo from './build-info.json';
import { UI_LANGUAGES } from './i18n.js';

import { Toast, resetDiagramTransforms } from './components/common.jsx';
import { WindowControls, ContextMenu, useContextMenu } from './components/chrome.jsx';
import {
  IconFile, IconSettings, IconOpen, IconSave, IconImport, IconExport,
  IconReport, IconTable, IconImage, IconPalette, IconInfo, IconRefresh,
  IconSidebar, IconSearch, IconDashboard, IconChevronDown, IconPlay, IconStop,
  LANGUAGE_ICONS, themeSwatchIcon, VIEW_ICONS,
} from './components/icons.jsx';

import SetupPanel from './views/SetupPanel.jsx';
import SummaryView from './views/SummaryView.jsx';
import CallGraphView from './views/CallGraphView.jsx';
import MetricsView from './views/MetricsView.jsx';
import { ClassDiagramView, ErdView, RelationGraphView } from './views/StructureViews.jsx';
import { SequenceDiagramView, DataFlowView } from './views/FlowViews.jsx';
import { DuplicateCodeView, GlobalVariablesView, TableAccessView, BugRiskView, SecurityView } from './views/TableViews.jsx';
import { SettingsDialog, AboutDialog, ReportDialog, DiagramExportDialog, ProgressDialog } from './views/Dialogs.jsx';

const READ_BATCH = 60;

/** Item count above which switching views is worth a progress window. */
const HEAVY_VIEW_COST = 4000;

/** A run shorter than this finishes before a dialog would be readable. */
const PROGRESS_DIALOG_DELAY_MS = 700;

/** View catalog. `diagram: true` means the view can be exported as an image. */
const VIEWS = [
  { id: 'summary', labelKey: 'views.summary' },
  { id: 'callGraph', labelKey: 'views.callGraph', diagram: true },
  { id: 'classDiagram', labelKey: 'views.classDiagram', diagram: true },
  { id: 'inheritance', labelKey: 'views.inheritance', diagram: true },
  { id: 'sequence', labelKey: 'views.sequence', diagram: true },
  { id: 'dataFlow', labelKey: 'views.dataFlow', diagram: true },
  { id: 'fileRelations', labelKey: 'views.fileRelations', diagram: true },
  { id: 'directoryRelations', labelKey: 'views.directoryRelations', diagram: true },
  { id: 'metrics', labelKey: 'views.metrics' },
  { id: 'duplicates', labelKey: 'views.duplicates' },
  { id: 'globals', labelKey: 'views.globals' },
  { id: 'erd', labelKey: 'views.erd', diagram: true },
  { id: 'tableAccess', labelKey: 'views.tableAccess' },
  { id: 'bugRisk', labelKey: 'views.bugRisk' },
  { id: 'security', labelKey: 'views.security' },
];

export default function App() {
  const { t, i18n } = useTranslation();

  const [settings, setSettings] = useState(() => defaultSettings());
  const [platformInfo, setPlatformInfo] = useState(null);
  const [root, setRoot] = useState(null);
  const [directories, setDirectories] = useState([]);
  const [checkedDirs, setCheckedDirs] = useState(() => new Set());
  const [expandedDirs, setExpandedDirs] = useState(() => new Set());
  const [detectedLanguages, setDetectedLanguages] = useState([]);

  const [result, setResult] = useState(null);
  const [view, setView] = useState('summary');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [status, setStatus] = useState('');
  const [toast, setToast] = useState(null);
  const [dialog, setDialog] = useState(null);
  // The open menu, anchored to the toolbar button that opened it.
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  // A long analysis gets its own progress window; a quick one must not flash it.
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  // Switching to an expensive view blocks the main thread, so the overlay has
  // to be painted *before* the heavy render is committed.
  const [viewBusy, setViewBusy] = useState(null);

  const workerRef = useRef(null);
  const cancelRef = useRef(false);
  const diagramRef = useRef(null);
  const searchRef = useRef(null);
  const contextMenu = useContextMenu();
  const themeButtonRef = useRef(null);
  const pendingSaveRef = useRef(null);
  // The export handlers are defined below this effect, so they are reached
  // through refs rather than by reordering the whole file.
  const generateReportRef = useRef(() => {});
  const diagramExportRef = useRef(() => {});
  const settingsRef = useRef(settings);
  const platformInfoRef = useRef(null);
  const [themeMenu, setThemeMenu] = useState(null);

  /* ------------------------------------------------------------- startup */

  useEffect(() => {
    let alive = true;
    (async () => {
      const [info, stored] = await Promise.all([platform.getInfo(), platform.loadSettings()]);
      if (!alive) return;
      setPlatformInfo(info);
      const merged = normalizeSettings(stored);
      setSettings(merged);
      applyTheme(merged.theme || DEFAULT_THEME);
      i18n.changeLanguage(merged.uiLanguage || 'ko');
    })();
    return () => {
      alive = false;
    };
  }, [i18n]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    platformInfoRef.current = platformInfo;
  }, [platformInfo]);

  useEffect(() => {
    applyTheme(settings.theme || DEFAULT_THEME);
    // Dialog windows are separate renderers; they need telling.
    const windows = platform.dialogWindows;
    if (windows && windows.available) {
      windows.broadcastAppearance({ theme: settings.theme, uiLanguage: settings.uiLanguage });
    }
  }, [settings.theme, settings.uiLanguage]);

  // Flushes a settings change made through a functional update (see the theme
  // actions). Kept out of the updater itself because that is a pure function.
  useEffect(() => {
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    platform.saveSettings(pending);
    const theme = getTheme(pending.theme);
    setStatus(t('theme.changed', { name: i18n.language === 'en' ? theme.labelEn : theme.label }));
  }, [settings, t, i18n.language]);

  useEffect(() => {
    if (settings.uiLanguage && settings.uiLanguage !== i18n.language) i18n.changeLanguage(settings.uiLanguage);
  }, [settings.uiLanguage, i18n]);

  // Ctrl+F focuses the search box, matching the Windows build's shortcut.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (searchRef.current) searchRef.current.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Show the progress window only once the run has proven slow — a small
  // project finishes in well under a second and a dialog would just flash.
  useEffect(() => {
    if (!busy) {
      setShowProgressDialog(false);
      return undefined;
    }
    const timer = setTimeout(() => setShowProgressDialog(true), PROGRESS_DIALOG_DELAY_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  const persist = useCallback((next) => {
    setSettings(next);
    platform.saveSettings(next);
  }, []);

  const notify = useCallback((message, tone) => setToast({ message, tone }), []);

  /* ------------------------------------------------------------- dialogs */

  // In Electron a dialog is a real window, so it can be dragged clear of the
  // app; in a browser tab there is no such thing, and it stays in the page.
  const closeDialog = useCallback((name) => {
    const windows = platform.dialogWindows;
    if (windows && windows.available) windows.close(name);
    setDialog((current) => (current === name ? null : current));
  }, []);

  const openDialog = useCallback(
    (name) => {
      const windows = platform.dialogWindows;
      if (!windows || !windows.available) {
        setDialog(name);
        return;
      }
      windows.open(name, {
        appearance: { theme: settingsRef.current.theme, uiLanguage: settingsRef.current.uiLanguage },
        settings: name === 'settings' ? settingsRef.current : undefined,
        platformInfo: name === 'about' ? platformInfoRef.current : undefined,
      });
    },
    [],
  );

  /* --------------------------------------------------------------- theme */

  // Applying a theme is immediate: the settings update pushes the new tokens
  // onto :root in the same commit. There is no separate "apply" step —
  // pressing the button *is* the change.
  //
  // Both of these go through a functional update rather than reading
  // `settings.theme` from the closure: three quick presses land in one React
  // batch, and a closure read would make all three compute the same "next"
  // theme, so the user would step forward only once.
  const applyThemeChoice = useCallback((themeId) => {
    setSettings((prev) => {
      if (prev.theme === themeId) return prev;
      const next = { ...prev, theme: themeId };
      pendingSaveRef.current = next;
      return next;
    });
  }, []);

  /** Advances to the next theme in the catalogue, wrapping at the end. */
  const cycleTheme = useCallback(() => {
    setSettings((prev) => {
      const index = THEMES.findIndex((theme) => theme.id === prev.theme);
      const next = { ...prev, theme: THEMES[(index + 1 + THEMES.length) % THEMES.length].id };
      pendingSaveRef.current = next;
      return next;
    });
  }, []);

  /** Same contract as the theme: pressing it *is* the change. */
  const applyLanguage = useCallback((languageId) => {
    setSettings((prev) => {
      if (prev.uiLanguage === languageId) return prev;
      const next = { ...prev, uiLanguage: languageId };
      pendingSaveRef.current = next;
      return next;
    });
  }, []);

  const openThemeMenu = useCallback(() => {
    const button = themeButtonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    setThemeMenu({ x: rect.left, y: rect.bottom + 4 });
  }, []);

  const themeMenuItems = useMemo(
    () =>
      THEMES.map((theme) => ({
        label: i18n.language === 'en' ? theme.labelEn : theme.label,
        icon: themeSwatchIcon(theme),
        action: () => applyThemeChoice(theme.id),
        hint: theme.id === settings.theme ? '✓' : undefined,
      })),
    [settings.theme, applyThemeChoice, i18n.language],
  );

  /* ---------------------------------------------------- view switching --- */

  /**
   * Rough cost of rendering a view, in "items". Used only to decide whether the
   * switch is worth a progress window — an exact figure is not needed, but a
   * wrong *order of magnitude* would either flash a needless dialog or freeze
   * the window with no explanation.
   */
  const viewCost = useCallback(
    (id) => {
      if (!result) return 0;
      switch (id) {
        case 'callGraph':
        case 'sequence':
          return result.stats.edgeCount * 2;
        case 'classDiagram':
        case 'inheritance':
          return result.typeMetrics.length * 12;
        case 'dataFlow':
          return result.functions.length;
        case 'fileRelations':
          return result.fileRelations.nodes.length * 6 + result.fileRelations.edges.length;
        case 'directoryRelations':
          return result.directoryRelations.nodes.length * 6 + result.directoryRelations.edges.length;
        case 'metrics':
          return result.functions.length + result.files.length + result.typeMetrics.length;
        case 'duplicates':
          return result.duplicates.groups.length * 4;
        case 'globals':
          return result.globals.length + result.globalAccesses.length;
        case 'erd':
          return result.schema.tables.length * 14 + result.schema.relations.length;
        case 'tableAccess':
          return result.schema.accesses.length + result.schema.columnAccesses.length;
        case 'bugRisk':
          return result.bugRisk.total * 2;
        case 'security':
          return result.security.total * 2;
        default:
          return result.files.length;
      }
    },
    [result],
  );

  /**
   * Switches views, showing a progress window first when the new view is large
   * enough that the render will visibly block. React commits synchronously, so
   * the overlay has to be painted in an earlier frame than the heavy render —
   * hence the nested requestAnimationFrame rather than a plain setState.
   */
  const requestView = useCallback(
    (id) => {
      if (id === view) return;
      const label = t((VIEWS.find((entry) => entry.id === id) || {}).labelKey || id);

      if (viewCost(id) < HEAVY_VIEW_COST) {
        setView(id);
        return;
      }

      setViewBusy({ id, label });
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setView(id);
          // One more frame so the new view has actually painted before the
          // overlay disappears.
          requestAnimationFrame(() => requestAnimationFrame(() => setViewBusy(null)));
        }),
      );
    },
    [view, viewCost, t],
  );

  /* ---------------------------------------------------------- directory */

  const rescanDirectories = useCallback(
    async (nextRoot, languageIds) => {
      setBusy(true);
      setStatus(t('progress.scanning'));
      try {
        const entries = await platform.scanDirectories(nextRoot, languageIds);
        setDirectories(entries);


        // Everything is in scope except the conventional build/vendor folders,
        // which is the same default the Windows build ships with.
        const checked = new Set(entries.filter((entry) => !entry.skipByDefault && entry.ownFileCount > 0).map((entry) => entry.path));
        // A skipped directory's descendants are out of scope too.
        for (const entry of entries) {
          if (entry.skipByDefault) {
            for (const other of entries) {
              if (other.path.startsWith(entry.path + '/') || other.path.startsWith(entry.path + '\\')) checked.delete(other.path);
            }
          }
        }
        setCheckedDirs(checked);
        setExpandedDirs(new Set(entries.filter((entry) => entry.depth <= 1).map((entry) => entry.path)));
        setStatus('');
      } catch (error) {
        notify(String((error && error.message) || error), 'error');
      } finally {
        setBusy(false);
      }
    },
    [t, notify],
  );

  /**
   * Which programming languages the *selected* directories contain, and — unless
   * the user has taken the selection into their own hands — which ones to tick.
   *
   * This follows the directory selection rather than running once per scan:
   * ticking a folder should bring its languages with it.
   */
  useEffect(() => {
    if (directories.length === 0) return;

    const totals = Object.create(null);
    for (const entry of directories) {
      if (!checkedDirs.has(entry.path)) continue;
      for (const [ext, count] of Object.entries(entry.extensionCounts || {})) {
        totals[ext] = (totals[ext] || 0) + count;
      }
    }

    const detected = detectLanguagesFromExtensions(totals);
    setDetectedLanguages(detected);

    if (detected.length === 0) return;
    const current = settingsRef.current;
    if (current.languageSelectionCustomized) return;

    const next = detected.map((entry) => entry.id);
    const unchanged =
      next.length === current.languageIds.length && next.every((id) => current.languageIds.includes(id));
    if (!unchanged) persist({ ...current, languageIds: next });
  }, [directories, checkedDirs, persist]);

  const pickRoot = useCallback(async () => {
    const picked = await platform.pickDirectory(settings.lastRootDirectory);
    if (!picked) return;
    setRoot(picked);
    setResult(null);
    // A new project starts from "all languages", and the directory selection
    // narrows it from there.
    persist({
      ...settings,
      lastRootDirectory: picked.path,
      languageIds: LANGUAGES.map((language) => language.id),
      languageSelectionCustomized: false,
    });
    await rescanDirectories(picked, settings.languageIds);
  }, [settings, persist, rescanDirectories]);

  const uploadFolder = useCallback(
    async (fileList) => {
      const picked = platform.useUploadedFiles(fileList);
      if (!picked) return;
      setRoot(picked);
      setResult(null);
      const detected = detectLanguages([...fileList].map((file) => file.webkitRelativePath || file.name));
      setDetectedLanguages(detected);
      await rescanDirectories(picked, settings.languageIds);
    },
    [settings.languageIds, rescanDirectories],
  );

  const toggleDir = useCallback((node) => {
    setCheckedDirs((prev) => {
      const next = new Set(prev);
      const turnOn = !next.has(node.path);
      // Toggling a directory takes its whole subtree with it — the behaviour a
      // checkbox tree is expected to have.
      const apply = (entry) => {
        if (turnOn) next.add(entry.path);
        else next.delete(entry.path);
        for (const child of entry.children || []) apply(child);
      };
      apply(node);
      return next;
    });
  }, []);

  const toggleExpand = useCallback((path) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleLanguage = useCallback(
    (id) => {
      const current = settings.languageIds.length === 0 ? LANGUAGES.map((l) => l.id) : settings.languageIds;
      const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
      persist({ ...settings, languageIds: next, languageSelectionCustomized: true });
    },
    [settings, persist],
  );

  /* ----------------------------------------------------------- analysis */

  const runAnalysis = useCallback(async () => {
    if (!root || checkedDirs.size === 0 || settings.languageIds.length === 0) return;

    cancelRef.current = false;
    setBusy(true);
    setResult(null);
    setProgress({ percent: 0, message: t('progress.scanning') });

    try {
      const languageIds = settings.languageIds;
      const entries = await platform.listFiles(root, [...checkedDirs], languageIds);
      if (cancelRef.current) throw new CancelledError();

      if (entries.length === 0) {
        notify(t('common.noData'), 'error');
        return;
      }

      setDetectedLanguages(detectLanguages(entries.map((entry) => entry.path)));

      // A fresh worker per run: it guarantees no state survives from the last
      // analysis, and terminating it is how cancellation actually stops work.
      if (workerRef.current) workerRef.current.terminate();
      const worker = new Worker(new URL('./worker/analyzer.worker.js', import.meta.url), { type: 'module' });
      workerRef.current = worker;

      const finished = new Promise((resolve, reject) => {
        worker.onmessage = (event) => {
          const message = event.data;
          if (message.type === 'progress') {
            setProgress({
              percent: message.progress.percent,
              message: t('progress.analyzing', { message: message.progress.message }),
            });
          } else if (message.type === 'result') {
            resolve(message.result);
          } else if (message.type === 'cancelled') {
            reject(new CancelledError());
          } else if (message.type === 'error') {
            reject(new Error(message.message));
          }
        };
        worker.onerror = (event) => reject(new Error(event.message || 'worker error'));
      });

      for (let i = 0; i < entries.length; i += READ_BATCH) {
        if (cancelRef.current) throw new CancelledError();
        const batch = entries.slice(i, i + READ_BATCH);
        const files = await platform.readFiles(root, batch);
        worker.postMessage({ type: 'addFiles', files });
        setProgress({
          percent: Math.round(((i + batch.length) / entries.length) * 25),
          message: t('progress.reading', { done: Math.min(i + READ_BATCH, entries.length), total: entries.length }),
        });
      }

      const gitChurn = await platform.gitChurn(root).catch(() => null);
      worker.postMessage({ type: 'run', settings, gitChurn });

      const raw = await finished;
      worker.terminate();
      workerRef.current = null;

      const hydrated = hydrate(raw);
      // Transforms remembered for the previous project mean nothing here.
      resetDiagramTransforms();
      setResult(hydrated);
      setView('summary'); // always cheap; no need for the deferred path
      setStatus(
        t('progress.done', {
          files: hydrated.stats.fileCount.toLocaleString('en-US'),
          functions: hydrated.stats.functionCount.toLocaleString('en-US'),
          seconds: (hydrated.durationMs / 1000).toFixed(1),
        }),
      );
    } catch (error) {
      if (error instanceof CancelledError) {
        setStatus(t('progress.cancelled'));
      } else {
        notify(t('progress.failed', { message: (error && error.message) || String(error) }), 'error');
        setStatus('');
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [root, checkedDirs, settings, t, notify]);

  const cancelAnalysis = useCallback(() => {
    cancelRef.current = true;
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setBusy(false);
    setProgress(null);
    setStatus(t('progress.cancelled'));
  }, [t]);

  /* ------------------------------------------------------------ exports */

  const openSource = useCallback(
    async (target) => {
      if (!target || !target.filePath) return;
      if (platform.kind === 'electron') {
        await platform.revealFile(target.filePath);
      } else {
        navigator.clipboard
          .writeText(target.filePath + ':' + (target.lineNumber || 1))
          .then(() => notify(t('common.copied')))
          .catch(() => {});
      }
    },
    [notify, t],
  );

  const generateReport = useCallback(
    async (format, sections) => {
      if (!result) return;
      setExportBusy(true);
      try {
        const doc = buildReport(result, {
          lang: i18n.language === 'en' ? 'en' : 'ko',
          sections,
          rootPath: root ? root.path : '',
          appInfo: { author: { name: 'SHKWON', email: 'knix008@naver.com' }, version: buildInfo.version },
        });
        const stem = 'code-analysis-' + (root ? baseName(root.path) : 'report') + '-' + stamp();

        let savedTo = null;
        if (format === 'html') {
          savedTo = await platform.saveTextFile({
            defaultName: stem + '.html',
            filters: [{ name: 'HTML', extensions: ['html'] }],
            text: toHtml(doc, { theme: settings.theme }),
            mime: 'text/html;charset=utf-8',
          });
        } else if (format === 'markdown') {
          savedTo = await platform.saveTextFile({
            defaultName: stem + '.md',
            filters: [{ name: 'Markdown', extensions: ['md'] }],
            text: toMarkdown(doc),
            mime: 'text/markdown;charset=utf-8',
          });
        } else if (format === 'docx') {
          savedTo = await platform.saveBinaryFile({
            defaultName: stem + '.docx',
            filters: [{ name: 'Word', extensions: ['docx'] }],
            data: toDocx(doc),
            mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          });
        } else {
          savedTo = await platform.exportPdf({
            html: toHtml(doc, { theme: 'daylight' }),
            defaultName: stem + '.pdf',
          });
        }

        if (savedTo) notify(t('report.generated', { path: savedTo }));
        closeDialog('report');
      } catch (error) {
        notify(String((error && error.message) || error), 'error');
        closeDialog('report');
      } finally {
        setExportBusy(false);
      }
    },
    [result, root, settings.theme, i18n.language, notify, t],
  );

  const exportCsv = useCallback(async () => {
    if (!result) return;
    const { header, rows } = functionRowsForCsv(result);
    const savedTo = await platform.saveTextFile({
      defaultName: 'code-metrics-' + stamp() + '.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      text: toCsv(header, rows),
      mime: 'text/csv;charset=utf-8',
    });
    if (savedTo) notify(t('report.generated', { path: savedTo }));
  }, [result, notify, t]);

  const exportResultJson = useCallback(async () => {
    if (!result) return;
    // The hydrated Maps cannot be serialized; the stored form is the raw one.
    const { graph, ...rest } = result;
    const payload = { ...rest, graph: { nodes: graph.nodes, edges: graph.edges, entryPointIds: graph.entryPointIds } };
    const savedTo = await platform.saveTextFile({
      defaultName: 'code-analysis-' + stamp() + '.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      text: JSON.stringify(payload, null, 2),
      mime: 'application/json;charset=utf-8',
    });
    if (savedTo) notify(t('report.generated', { path: savedTo }));
  }, [result, notify, t]);

  const loadResultJson = useCallback(async () => {
    const opened = await platform.openTextFile([{ name: 'JSON', extensions: ['json'] }]);
    if (!opened) return;
    try {
      const parsed = JSON.parse(opened.text);
      if (!parsed || !parsed.graph || !parsed.summary) throw new Error('Not a CodeFactory analysis result.');
      resetDiagramTransforms();
      setResult(hydrate(parsed));
      setView('summary');
      setStatus(opened.path);
    } catch (error) {
      notify(String((error && error.message) || error), 'error');
    }
  }, [notify]);

  const saveProject = useCallback(async () => {
    const project = {
      schemaVersion: 1,
      rootDirectory: root ? root.path : '',
      includedDirectories: [...checkedDirs],
      languageIds: settings.languageIds,
      settings,
    };
    const savedTo = await platform.saveTextFile({
      defaultName: (root ? baseName(root.path) : 'project') + '.cfproj',
      filters: [{ name: 'CodeFactory project', extensions: ['cfproj', 'json'] }],
      text: JSON.stringify(project, null, 2),
      mime: 'application/json;charset=utf-8',
    });
    if (savedTo) notify(t('report.generated', { path: savedTo }));
  }, [root, checkedDirs, settings, notify, t]);

  const openProject = useCallback(async () => {
    const opened = await platform.openTextFile([{ name: 'CodeFactory project', extensions: ['cfproj', 'json'] }]);
    if (!opened) return;
    try {
      const project = JSON.parse(opened.text);
      const merged = normalizeSettings(project.settings);
      persist(merged);

      if (project.rootDirectory && platform.kind === 'electron') {
        const exists = await window.electronAPI.exists(project.rootDirectory);
        if (exists) {
          const nextRoot = { path: project.rootDirectory, handle: null };
          setRoot(nextRoot);
          await rescanDirectories(nextRoot, merged.languageIds);
          if (project.includedDirectories && project.includedDirectories.length > 0) {
            setCheckedDirs(new Set(project.includedDirectories));
          }
        } else {
          notify(project.rootDirectory + ' — ' + t('setup.noRoot'), 'error');
        }
      } else if (project.rootDirectory) {
        // The browser cannot re-open a path; settings are restored, the folder
        // has to be picked again.
        notify(t('setup.webHint'));
      }
    } catch (error) {
      notify(String((error && error.message) || error), 'error');
    }
  }, [persist, rescanDirectories, notify, t]);

  // A dialog window reports the user's decision here; this window owns the
  // analysis result, so it is the one that can act on it.
  useEffect(() => {
    const windows = platform.dialogWindows;
    if (!windows || !windows.available) return undefined;

    return windows.onResult(({ name, data }) => {
      if (name === 'settings' && data && data.settings) {
        persist(normalizeSettings(data.settings));
      } else if (name === 'report' && data) {
        generateReportRef.current(data.format, data.sections);
      } else if (name === 'diagram' && data) {
        diagramExportRef.current(data.format);
      }
    });
  }, [persist]);

  const runDiagramExport = useCallback(
    async (format) => {
      setExportBusy(true);
      try {
        const currentView = VIEWS.find((entry) => entry.id === view);
        const savedTo = await exportDiagram(diagramRef.current, format, {
          platform,
          themeId: settings.theme,
          fileName: view + '-' + stamp(),
          title: currentView ? t(currentView.labelKey) : view,
        });
        if (savedTo) notify(t('report.generated', { path: savedTo }));
        closeDialog('diagram');
      } catch (error) {
        notify(String((error && error.message) || error), 'error');
        closeDialog('diagram');
      } finally {
        setExportBusy(false);
      }
    },
    [view, settings.theme, notify, t],
  );

  useEffect(() => {
    generateReportRef.current = generateReport;
    diagramExportRef.current = runDiagramExport;
  }, [generateReport, runDiagramExport]);

  /* -------------------------------------------------------------- render */

  const currentLanguage = UI_LANGUAGES.find((entry) => entry.id === i18n.language) || UI_LANGUAGES[0];
  const nextLanguage = UI_LANGUAGES[(UI_LANGUAGES.indexOf(currentLanguage) + 1) % UI_LANGUAGES.length];
  const CurrentLanguageIcon = LANGUAGE_ICONS[currentLanguage.id] || LANGUAGE_ICONS.ko;

  const currentTheme = getTheme(settings.theme);
  const nextTheme = THEMES[(THEMES.findIndex((theme) => theme.id === currentTheme.id) + 1) % THEMES.length];
  const currentThemeName = i18n.language === 'en' ? currentTheme.labelEn : currentTheme.label;
  const nextThemeName = i18n.language === 'en' ? nextTheme.labelEn : nextTheme.label;

  const currentView = VIEWS.find((entry) => entry.id === view) || VIEWS[0];
  const isDiagramView = !!currentView.diagram;
  const CurrentViewIcon = VIEW_ICONS[currentView.id] || IconDashboard;

  const viewProps = { result, onOpenSource: openSource, search, diagramRef };

  const body = useMemo(() => {
    if (!result) {
      return (
        <div className="empty-state">
          <img src="./icon.svg" alt="" width="72" height="72" style={{ opacity: 0.6 }} />
          <div className="big">{t('common.notAnalyzed')}</div>
          <div>{t('setup.noRoot')}</div>
        </div>
      );
    }

    switch (view) {
      case 'callGraph':
        return <CallGraphView {...viewProps} />;
      case 'classDiagram':
        return <ClassDiagramView {...viewProps} />;
      case 'inheritance':
        return <ClassDiagramView {...viewProps} inheritanceOnly />;
      case 'sequence':
        return <SequenceDiagramView {...viewProps} />;
      case 'dataFlow':
        return <DataFlowView {...viewProps} />;
      case 'fileRelations':
        return <RelationGraphView {...viewProps} mode="file" />;
      case 'directoryRelations':
        return <RelationGraphView {...viewProps} mode="directory" />;
      case 'metrics':
        return <MetricsView result={result} onOpenSource={openSource} search={search} />;
      case 'duplicates':
        return <DuplicateCodeView result={result} onOpenSource={openSource} search={search} />;
      case 'globals':
        return <GlobalVariablesView result={result} onOpenSource={openSource} search={search} />;
      case 'erd':
        return <ErdView {...viewProps} />;
      case 'tableAccess':
        return <TableAccessView result={result} onOpenSource={openSource} search={search} />;
      case 'bugRisk':
        return <BugRiskView result={result} onOpenSource={openSource} search={search} />;
      case 'security':
        return <SecurityView result={result} onOpenSource={openSource} search={search} />;
      default:
        return <SummaryView result={result} onNavigate={requestView} onOpenSource={openSource} />;
    }
    // viewProps is rebuilt every render by design; the deps below are what
    // actually change the rendered output.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, view, search, t, openSource]);

  /** Right-click menu for the view area: the actions that apply to what is on screen. */
  const viewContextItems = useCallback(
    () => [
      { label: t('views.' + currentView.id.replace(/^summary$/, 'summary')), icon: CurrentViewIcon, action: () => {}, disabled: true },
      '-',
      { label: t('context.exportDiagram'), icon: IconImage, action: () => openDialog('diagram'), disabled: !result || !isDiagramView },
      { label: t('context.exportReport'), icon: IconReport, action: () => openDialog('report'), disabled: !result },
      { label: t('context.exportCsv'), icon: IconTable, action: exportCsv, disabled: !result },
      '-',
      { label: t('context.goSummary'), icon: IconDashboard, action: () => requestView('summary'), disabled: !result || view === 'summary' },
      { label: t('context.clearSearch'), icon: IconSearch, action: () => setSearch(''), disabled: !search },
      { label: t('context.toggleSidebar'), icon: IconSidebar, action: () => setSidebarOpen((open) => !open) },
      '-',
      { label: t('context.reanalyze'), icon: IconRefresh, action: runAnalysis, disabled: busy || !root },
      { label: t('context.settings'), icon: IconSettings, action: () => openDialog('settings') },
    ],
    [t, currentView, CurrentViewIcon, result, isDiagramView, exportCsv, view, search, runAnalysis, busy, root],
  );

  /**
   * A menu button for the toolbar.
   *
   * The popup is rendered as a fixed-position ContextMenu rather than absolutely
   * inside the button: the toolbar clips its overflow (that is what keeps it to
   * one row), so an in-flow popup would be cut off at the toolbar's edge.
   *
   * `stopPropagation` matters here — ContextMenu dismisses itself on any window
   * click, and without it the click that opens a menu would immediately close it.
   */
  const menu = (id, label, Icon, items) => (
    <button
      type="button"
      className={'btn menu-button' + (menuAnchor && menuAnchor.id === id ? ' open' : '')}
      title={label}
      aria-haspopup="menu"
      aria-expanded={!!(menuAnchor && menuAnchor.id === id)}
      onClick={(e) => {
        e.stopPropagation();
        if (menuAnchor && menuAnchor.id === id) {
          setMenuAnchor(null);
          return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        setMenuAnchor({ id, x: rect.left, y: rect.bottom + 4, items });
      }}
    >
      <Icon size={15} />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="app">
      <div className="menubar">
        <div className="brand">
          <img src="./icon.svg" alt="" />
          CodeFactory
        </div>

        <div className="spacer" />

        {/* Program info sits immediately left of the window controls, and both
            live in the title bar — which is what this row is. */}
        <button
          type="button"
          className="win-btn"
          title={t('toolbar.about')}
          aria-label={t('toolbar.about')}
          onClick={() => openDialog('about')}
        >
          <IconInfo size={14} />
        </button>
        <WindowControls controls={platform.windowControls} />
      </div>

      <div className="toolbar">
        {menu('file', t('menu.file'), IconFile, [
          { label: t('menu.openProject'), icon: IconOpen, action: openProject },
          { label: t('menu.saveProject'), icon: IconSave, action: saveProject, disabled: !root },
          '-',
          { label: t('menu.loadResult'), icon: IconImport, action: loadResultJson },
          { label: t('menu.saveResult'), icon: IconExport, action: exportResultJson, disabled: !result },
          '-',
          { label: t('menu.exportReport'), icon: IconReport, action: () => openDialog('report'), disabled: !result },
          { label: t('menu.exportMetricsCsv'), icon: IconTable, action: exportCsv, disabled: !result },
          { label: t('menu.exportDiagram'), icon: IconImage, action: () => openDialog('diagram'), disabled: !result || !isDiagramView },
        ])}

        <div className="toolbar-sep" />

        <span className="field-label view-label" title={t('toolbar.view')}>
          <CurrentViewIcon size={15} />
          <span>{t('menu.view')}</span>
        </span>
        <select
          className="input"
          value={view}
          onChange={(e) => requestView(e.target.value)}
          disabled={!result}
          title={t('toolbar.view')}
          style={{ width: 180 }}
        >
          {VIEWS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {t(entry.labelKey)}
            </option>
          ))}
        </select>

        {/* The magnifier sits inside the field, so the box reads as a search box
            even when it is empty and its placeholder is truncated. */}
        <div className="search-field" title={t('toolbar.search')}>
          <IconSearch size={14} />
          <input
            ref={searchRef}
            className="input"
            type="search"
            placeholder={t('common.searchPlaceholder')}
            title={t('toolbar.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={!result}
          />
        </div>

        <div className="toolbar-sep" />

        {/* The primary action: run, or cancel while a run is in flight. */}
        {busy ? (
          <button type="button" className="btn danger run-button" title={t('toolbar.cancel')} onClick={cancelAnalysis}>
            <IconStop size={14} />
            <span>{t('setup.cancel')}</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn primary run-button"
            title={result ? t('toolbar.reanalyze') : t('toolbar.run')}
            onClick={runAnalysis}
            disabled={!root || checkedDirs.size === 0 || settings.languageIds.length === 0}
          >
            {result ? <IconRefresh size={14} /> : <IconPlay size={13} />}
            <span>{result ? t('setup.reanalyze') : t('setup.run')}</span>
          </button>
        )}

        <div className="toolbar-sep" />

        <button type="button" className="btn icon-only" title={t('toolbar.report')} aria-label={t('toolbar.report')} onClick={() => openDialog('report')} disabled={!result}>
          <IconReport size={15} />
        </button>
        <button type="button" className="btn icon-only" title={t('toolbar.diagram')} aria-label={t('toolbar.diagram')} onClick={() => openDialog('diagram')} disabled={!result || !isDiagramView}>
          <IconImage size={15} />
        </button>
        <button type="button" className="btn icon-only" title={t('toolbar.csv')} aria-label={t('toolbar.csv')} onClick={exportCsv} disabled={!result}>
          <IconTable size={15} />
        </button>
        <button type="button" className="btn icon-only" title={t('toolbar.sidebar')} aria-label={t('toolbar.sidebar')} onClick={() => setSidebarOpen((open) => !open)}>
          <IconSidebar size={15} />
        </button>

        <div className="toolbar-sep" />

        {/* Theme lives here rather than in Settings: it is a look-and-see
            choice, so every press applies at once. The palette button steps to
            the next theme; the caret opens the full list. */}
        <div className="theme-control">
          <button
            type="button"
            className="btn icon-only theme-cycle"
            title={t('toolbar.themeCycle', { current: currentThemeName, next: nextThemeName })}
            aria-label={t('toolbar.themeCycle', { current: currentThemeName, next: nextThemeName })}
            onClick={cycleTheme}
          >
            <IconPalette size={15} />
          </button>
          <button
            type="button"
            ref={themeButtonRef}
            className="btn icon-only theme-pick"
            title={t('toolbar.themePick', { current: currentThemeName })}
            aria-label={t('toolbar.themePick', { current: currentThemeName })}
            onClick={(e) => {
              e.stopPropagation();
              openThemeMenu();
            }}
          >
            <IconChevronDown size={13} />
          </button>
        </div>

        <div className="toolbar-spacer" />

        {/* Right-aligned, in this order: settings, UI language, program info.
            None of the three is about the analysis — they are about the app. */}
        <button
          type="button"
          data-action="settings"
          className="btn"
          title={t('toolbar.settings')}
          onClick={() => openDialog('settings')}
        >
          <IconSettings size={15} />
          <span>{t('menu.settings')}</span>
        </button>

        {/* One icon, like every other toolbar action: pressing it switches to
            the other language at once. The tooltip names both. */}
        <button
          type="button"
          data-action="language"
          className="btn icon-only"
          title={t('toolbar.language', { current: currentLanguage.label, next: nextLanguage.label })}
          aria-label={t('toolbar.language', { current: currentLanguage.label, next: nextLanguage.label })}
          onClick={() => applyLanguage(nextLanguage.id)}
        >
          {/* The glyph names the language that is on, so the button reports
              state as well as offering the switch. */}
          <CurrentLanguageIcon size={15} />
        </button>

        <button
          type="button"
          data-action="about"
          className="btn"
          title={t('toolbar.about')}
          onClick={() => openDialog('about')}
        >
          <IconInfo size={15} />
          <span>{t('menu.info')}</span>
        </button>
      </div>

      <div className="main">
        <div className={'sidebar' + (sidebarOpen ? '' : ' collapsed')}>
          <SetupPanel
            platform={platform}
            root={root}
            directories={directories}
            checkedDirs={checkedDirs}
            expandedDirs={expandedDirs}
            languageIds={settings.languageIds}
            detectedLanguages={detectedLanguages}
            busy={busy}
            onPickRoot={pickRoot}
            onUploadFolder={uploadFolder}
            onToggleDir={toggleDir}
            onExpandDir={toggleExpand}
            onSetCheckedDirs={setCheckedDirs}
            onToggleLanguage={toggleLanguage}
            onSetLanguages={(ids) => persist({ ...settings, languageIds: ids, languageSelectionCustomized: true })}
          />
        </div>

        <div className="content" onContextMenu={(e) => contextMenu.open(e, viewContextItems())}>
          <div className={'view-body' + (view === 'summary' ? '' : ' flush')}>{body}</div>
        </div>
      </div>

      <div className="statusbar">
        <span>{progress ? progress.message : status || t('app.tagline')}</span>
        <div className="spacer" />
        {progress ? (
          <>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: progress.percent + '%' }} />
            </div>
            <span>{progress.percent}%</span>
          </>
        ) : null}
        {result ? (
          <span>
            {result.stats.fileCount.toLocaleString('en-US')} files · {result.stats.functionCount.toLocaleString('en-US')} fn ·{' '}
            {result.summary.totalCodeLines.toLocaleString('en-US')} LOC
          </span>
        ) : null}
        <span style={{ color: 'var(--text-faint)' }}>{platform.kind === 'electron' ? 'Electron' : 'Web'}</span>
      </div>

      {dialog === 'settings' ? (
        <SettingsDialog
          settings={settings}
          platformInfo={platformInfo}
          onClose={() => setDialog(null)}
          onApply={(next) => {
            persist(normalizeSettings(next));
            setDialog(null);
          }}
        />
      ) : null}

      {dialog === 'about' ? (
        <AboutDialog onClose={() => setDialog(null)} platformInfo={platformInfo} onOpenExternal={(url) => platform.openExternal(url)} />
      ) : null}

      {dialog === 'report' ? <ReportDialog onClose={() => setDialog(null)} onGenerate={generateReport} busy={exportBusy} /> : null}

      {dialog === 'diagram' ? <DiagramExportDialog onClose={() => setDialog(null)} onExport={runDiagramExport} busy={exportBusy} /> : null}

      {contextMenu.menu ? (
        <ContextMenu x={contextMenu.menu.x} y={contextMenu.menu.y} items={contextMenu.menu.items} onClose={contextMenu.close} />
      ) : null}

      {menuAnchor ? (
        <ContextMenu x={menuAnchor.x} y={menuAnchor.y} items={menuAnchor.items} onClose={() => setMenuAnchor(null)} />
      ) : null}

      {themeMenu ? (
        <ContextMenu x={themeMenu.x} y={themeMenu.y} items={themeMenuItems} onClose={() => setThemeMenu(null)} />
      ) : null}

      {showProgressDialog && progress ? (
        <ProgressDialog
          title={t('progress.title')}
          message={progress.message}
          percent={progress.percent}
          onCancel={cancelAnalysis}
        />
      ) : null}

      {viewBusy ? <ProgressDialog title={t('progress.rendering')} message={viewBusy.label} indeterminate /> : null}

      <Toast message={toast ? toast.message : null} tone={toast ? toast.tone : null} onDismiss={() => setToast(null)} />
    </div>
  );
}

class CancelledError extends Error {}

function stamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes())
  );
}
