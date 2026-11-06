import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import { Brand, ResizeGrip, startDragByHand, WindowControls } from './components/TitleBar';
import InfoPanel from './components/InfoPanel';
import Tooltip from './components/Tooltip';
import Toasts from './components/Toasts';
import ContextMenu from './components/ContextMenu';
import FileTable from './components/FileTable';
import StartScreen from './components/StartScreen';
import { ArchiveTree, DiskTree, DriveBar } from './components/FolderTree';
import { ThemeMenuList } from './components/ThemeMenu';
import CreateDialog from './components/dialogs/CreateDialog';
import {
  BenchmarkDialog, ConfirmDialog, ConflictDialog, CustomThemeDialog, CreateResult, ErrorDialog, ExtractDialog, ExtractResult, HashDialog, InfoDialog,
  JoinDialog, PasswordDialog, PreviewDialog, ProgressDialog, PromptDialog, RepairResult, SplitDialog, SplitResult, TestResult,
} from './components/dialogs/Dialogs';
import {
  IconArchive, IconBack, IconChevron, IconClose2, IconComment, IconConvert, IconCopy, IconDownload, IconEye, IconExternal, IconFile, IconFilePlus, IconFolderOpen,
  IconFolderPlus, IconFlagKR, IconFlagUK, IconGauge, IconHash, IconInfo, IconJoin, IconPack, IconRefresh, IconRepair, IconSelectAll, IconSettings, IconSplit,
  IconTest, IconTools, IconTrash, IconX, IconUnpack, IconEdit, IconHelp, IconPalette, IconHome, IconPanelLeft, IconPanelRight, IconArrowLeft, IconArrowRight, IconCollapseLeftPanel, IconCollapseRightPanel, IconExpandLeftPanel, IconExpandRightPanel,
} from './components/Icons';
import { baseName, dirName, downloadBytes, EngineError, invoke, isDesktop, joinPath, pickFiles, pickFolder, run, webAddFile, webFetch, webRemove } from './lib/host';
import { DEFAULT_SETTINGS, loadSettings, mirrorToDisk, pushRecent, saveSettings } from './lib/settings';
import { archiveStem, fileIconFor, FORMATS, formatSize, looksLikeArchive, suggestName, deleteSourcesProblem } from './lib/format';
import { buildTree, filterItems, findNode, nextSelection, parentPath, searchAll, sortItems } from './lib/tree';
import { ALL_THEME_IDS, applyCustomTheme, loadCustomTheme, nextThemeId, preferredThemeForMode, rememberThemePref, saveCustomTheme, systemThemeMode } from './lib/themes';

const THEME_IDS = ALL_THEME_IDS;
const SIDE_DEFAULT = 260;
const INFO_DEFAULT = 280;
const flag = (key, fallback) => {
  const v = localStorage.getItem(key);
  return v == null ? fallback : v === '1';
};

function initialTheme() {
  const s = localStorage.getItem('zm-theme');
  if (localStorage.getItem('zm-theme-auto') === '1' || !s) return preferredThemeForMode(systemThemeMode());
  return THEME_IDS.includes(s) ? s : 'dark';
}

let webSeq = 0;

export default function App() {
  const { t } = useTranslation();

  // ── Preferences ─────────────────────────────────────────────────────────────────────────────
  const [settings, setSettingsState] = useState(loadSettings);
  const setSettings = useCallback((update) => {
    setSettingsState((s) => {
      const next = typeof update === 'function' ? update(s) : { ...s, ...update };
      saveSettings(next);
      return next;
    });
  }, []);
  const [theme, setTheme] = useState(initialTheme);
  const [themeAuto, setThemeAuto] = useState(() => localStorage.getItem('zm-theme-auto') === '1' || !localStorage.getItem('zm-theme'));
  const [lang, setLang] = useState(i18n.language);
  const [sideWidth, setSideWidth] = useState(() => Number(localStorage.getItem('zm-side-width')) || SIDE_DEFAULT);
  const [infoWidth, setInfoWidth] = useState(() => Number(localStorage.getItem('zm-info-width')) || INFO_DEFAULT);
  const [leftOpen, setLeftOpen] = useState(() => flag('zm-left-open', true));
  const [rightOpen, setRightOpen] = useState(() => flag('zm-right-open', true));
  const [picked, setPicked] = useState({ path: null, info: null, locked: false });
  const [tabs, setTabs] = useState([]); // one per open archive: { path, archive, cwd }
  const [tabOverflow, setTabOverflow] = useState({ left: false, right: false });
  const tabsRef = useRef(null);
  const [appInfo, setAppInfo] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang;
  }, [theme, lang]);

  useEffect(() => {
    // While a number is being typed it passes through values like 1 and 15: never shrink to those.
    const scale = Number(settings.uiScale);
    document.documentElement.style.zoom = String((scale >= 80 && scale <= 150 ? scale : 100) / 100);
  }, [settings.uiScale]);

  useEffect(() => {
    if (isDesktop) invoke('app_info').then(setAppInfo).catch(() => {});
    if (!themeAuto) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = () => setTheme(preferredThemeForMode(systemThemeMode()));
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [themeAuto]);

  const customizeRef = useRef(() => {});

  // The settings window talks to this one through storage events.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'zm-settings' && e.newValue) setSettingsState(loadSettings());
      else if (e.key === 'zm-custom-theme') applyCustomTheme(loadCustomTheme());
      else if (e.key === 'zm-theme-action' && e.newValue) customizeRef.current();
      else if (e.key === 'zm-theme-auto' && e.newValue === '1') {
        setThemeAuto(true);
        setTheme(preferredThemeForMode(systemThemeMode()));
      }
      else if (e.key === 'zm-theme' && THEME_IDS.includes(e.newValue)) {
        setTheme(e.newValue);
        setThemeAuto(localStorage.getItem('zm-theme-auto') === '1');
      } else if (e.key === 'zm-lang' && e.newValue) {
        i18n.changeLanguage(e.newValue);
        setLang(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const pickTheme = (id) => {
    setTheme(id);
    setThemeAuto(false);
    localStorage.setItem('zm-theme', id);
    localStorage.setItem('zm-theme-auto', '0');
    rememberThemePref(id);
    setOpenMenu(null);
    mirrorToDisk();
  };
  const pickAutoTheme = () => {
    setThemeAuto(true);
    localStorage.setItem('zm-theme-auto', '1');
    setTheme(preferredThemeForMode(systemThemeMode()));
    setOpenMenu(null);
    mirrorToDisk();
  };
  const toggleLang = () => {
    const next = lang === 'ko' ? 'en' : 'ko';
    i18n.changeLanguage(next);
    localStorage.setItem('zm-lang', next);
    setLang(next);
    mirrorToDisk();
  };

  // ── What is on screen ───────────────────────────────────────────────────────────────────────
  const [archive, setArchive] = useState(null); // { info, password, encoding }
  // The desktop's start screen: undecided until we know whether we were started on a file.
  const [start, setStart] = useState(null);
  const [cwd, setCwd] = useState(''); // inside the archive
  const [folder, setFolder] = useState(null); // on disk (desktop)
  const [folderItems, setFolderItems] = useState([]);
  const [webItems, setWebItems] = useState([]); // the web build's list of files to compress
  const [selected, setSelected] = useState(() => new Set());
  const anchor = useRef(null);
  const [sort, setSort] = useState({ key: 'name', descending: false });
  const [filter, setFilter] = useState('');
  const [openMenu, setOpenMenu] = useState(null);
  const [menu, setMenu] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [job, setJob] = useState(null);
  const [dragging, setDragging] = useState(false);
  const filterRef = useRef(null);
  const toolbarRef = useRef(null);
  const fileInput = useRef(null);
  const folderInput = useRef(null);
  const webPick = useRef(null);
  const tableRef = useRef(null);

  const toast = useCallback((type, title, message) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, type, title, message }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 3600);
  }, []);

  const showError = useCallback((e) => {
    if (e?.code === 'cancelled') {
      toast('info', t('toast.cancelled'));
      return;
    }
    setDialog({ type: 'error', code: e?.code ?? 'io', detail: e?.detail ?? String(e?.message ?? e), stack: e?.code ? undefined : e?.stack });
  }, [t, toast]);

  // Runs an engine operation behind the progress window.
  const runJob = useCallback((op, options) => {
    const handle = run(op, options, (done, total, name) => setJob((j) => (j && j.op === op ? { ...j, done, total, name } : j)));
    const shown = { op, done: 0, total: 0, name: '', cancel: handle.cancel, cancelling: false };
    setJob(shown);
    return handle.promise.finally(() => setJob(null));
  }, []);

  const askPassword = useCallback((wrong) => new Promise((resolve) => {
    setDialog({
      type: 'password',
      wrong,
      onSubmit: (value) => {
        setDialog(null);
        resolve(value);
      },
      onCancel: () => {
        setDialog(null);
        resolve(null);
      },
    });
  }), []);

  // Runs something that may need the archive's password, asking until it works or the user stops.
  const withPassword = useCallback(async (password, attempt) => {
    let current = password ?? null;
    let wrong = false;
    for (;;) {
      try {
        return { value: await attempt(current ?? undefined), password: current };
      } catch (e) {
        if (e.code !== 'password_required' && e.code !== 'wrong_password') throw e;
        wrong = e.code === 'wrong_password';
        const answer = await askPassword(wrong);
        if (answer == null) throw new EngineError('cancelled');
        current = answer;
      }
    }
  }, [askPassword]);

  const encodingOf = useCallback((enc) => (enc && enc !== 'auto' ? enc : undefined), []);

  // ── Folder browsing (desktop) ───────────────────────────────────────────────────────────────
  const openFolder = useCallback(async (path, { quiet } = {}) => {
    try {
      const items = await invoke('list_dir', { path });
      if (!quiet) setStart(false);
      setFolder(path);
      setFolderItems(items);
      setSelected(new Set());
      setFilter('');
    } catch (e) {
      showError(e);
    }
  }, [t, toast]);

  const refreshFolder = useCallback(async () => {
    if (!isDesktop || !folder) return;
    try {
      setFolderItems(await invoke('list_dir', { path: folder }));
    } catch { /* it may have gone away */ }
  }, [folder]);

  useEffect(() => {
    if (!isDesktop) return;
    invoke('fs_roots').then((roots) => {
      const home = roots.find((r) => r.kind === 'home') ?? roots[0];
      if (home) openFolder(home.path, { quiet: true });
    }).catch(() => {});
  }, [openFolder]);

  // The desktop test drives navigation without depending on what this machine's folders hold.
  useEffect(() => {
    if (appInfo?.test) window.__zmOpenFolder = openFolder;
  }, [appInfo, openFolder]);

  // ── Opening an archive ──────────────────────────────────────────────────────────────────────
  const openArchive = useCallback(async (path, opts = {}) => {
    const encoding = opts.encoding ?? settings.encoding;
    try {
      const { value: info, password } = await withPassword(opts.password, (pw) => runJob('list', { path, password: pw, encoding: encodingOf(encoding) }));
      setArchive({ info, password, encoding });
      setStart(false);
      setCwd(opts.keepCwd ? opts.keepCwd : '');
      setSelected(new Set());
      setFilter('');
      setDialog(null);
      if (isDesktop) setSettings((s) => ({ ...s, recent: pushRecent(s.recent, path) }));
      return info;
    } catch (e) {
      showError(e);
      return null;
    }
  }, [encodingOf, runJob, setSettings, settings.encoding, showError, withPassword]);

  const reopen = useCallback((password, keepCwd) => openArchive(archive.info.path, { password, keepCwd, encoding: archive.encoding }), [archive, openArchive]);

  // Tabs: the one on screen lives in `archive` and `cwd`, and each change is copied to its tab.
  useEffect(() => {
    if (!archive) return;
    const path = archive.info.path;
    setTabs((list) => {
      const entry = { path, archive, cwd };
      const at = list.findIndex((x) => x.path === path);
      if (at < 0) return [...list, entry];
      const next = [...list];
      next[at] = entry;
      return next;
    });
  }, [archive, cwd]);

  const selectTab = useCallback((path) => {
    const tab = path ? tabs.find((x) => x.path === path) : null;
    setArchive(tab ? tab.archive : null);
    setCwd(tab ? tab.cwd : '');
    setSelected(new Set());
    setFilter('');
    setStart((v) => (v === null ? v : false));
  }, [tabs]);

  const closeTab = useCallback((path) => {
    const at = tabs.findIndex((x) => x.path === path);
    const rest = tabs.filter((x) => x.path !== path);
    setTabs(rest);
    if (!isDesktop) {
      const dir = dirName(path);
      if (!rest.some((x) => dirName(x.path) === dir)) webRemove(dir);
    }
    if (archive?.info.path === path) {
      // Its neighbour takes over, as tabs do; with none left, the file list.
      const next = rest[Math.min(at, rest.length - 1)] ?? null;
      setArchive(next ? next.archive : null);
      setCwd(next ? next.cwd : '');
      setSelected(new Set());
      setFilter('');
    }
  }, [archive, tabs]);

  const closeArchive = useCallback(() => {
    if (archive) closeTab(archive.info.path);
  }, [archive, closeTab]);

  const measureTabs = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    const left = el.scrollLeft > 0;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setTabOverflow((o) => (o.left === left && o.right === right ? o : { left, right }));
  }, []);

  const scrollTabs = (direction) => {
    const el = tabsRef.current;
    if (el) el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.6) });
  };

  // The strip's room changes with the tabs, the panels and the window.
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return undefined;
    measureTabs();
    const watcher = new ResizeObserver(measureTabs);
    watcher.observe(el);
    return () => watcher.disconnect();
  });

  // The tab on screen is never scrolled out of sight.
  useEffect(() => {
    const el = tabsRef.current?.querySelector('.ztab.on');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    measureTabs();
  }, [archive?.info.path, tabs.length, measureTabs]);

  // ── Files arriving in the web build ─────────────────────────────────────────────────────────
  const stageWebFiles = useCallback((files) => {
    webSeq += 1;
    const base = `/in/${webSeq}`;
    const tops = new Map();
    for (const file of files) {
      const rel = file.webkitRelativePath || file.name;
      const path = `${base}/${rel}`;
      webAddFile(path, file);
      const top = rel.split('/')[0];
      const isDir = rel.includes('/');
      const current = tops.get(top) ?? { key: `${base}/${top}`, path: `${base}/${top}`, name: top, label: top, isDir, size: 0, mtime: Math.floor(file.lastModified / 1000) };
      current.size += file.size;
      tops.set(top, current);
    }
    return [...tops.values()];
  }, []);

  const pickWeb = useCallback((kind, then) => {
    webPick.current = then;
    (kind === 'folder' ? folderInput : fileInput).current.click();
  }, []);

  const onWebFiles = useCallback((e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const then = webPick.current;
    webPick.current = null;
    const items = stageWebFiles(files);
    if (then) then(items);
    else setWebItems((list) => [...list, ...items]);
  }, [stageWebFiles]);

  // Files dropped or chosen in the web build: an archive opens (with every part of its set),
  // anything else joins the list.
  const receiveWebFiles = useCallback((files) => {
    const archives = files.filter((f) => looksLikeArchive(f.name));
    if (archives.length && archives.length === files.length) {
      const items = stageWebFiles(files);
      const stems = new Set(files.map((f) => archiveStem(f.name)));
      if (stems.size === 1) {
        const first = [...items].sort((a, b) => a.name.localeCompare(b.name))[0];
        openArchive(first.path);
        return;
      }
      setWebItems((list) => [...list, ...items]);
      return;
    }
    setWebItems((list) => [...list, ...stageWebFiles(files)]);
  }, [openArchive, stageWebFiles]);

  // ── Drag and drop ───────────────────────────────────────────────────────────────────────────
  const receivePaths = useCallback(async (paths) => {
    if (!paths.length) return;
    if (paths.length === 1 && looksLikeArchive(baseName(paths[0]))) {
      openArchive(paths[0]);
      return;
    }
    const info = await invoke('path_info', { paths });
    const items = info.filter(Boolean).map((i) => ({ path: i.path, label: i.name, isDir: i.isDir }));
    if (items.length) openCreateRef.current(items);
  }, [openArchive]);

  const openCreateRef = useRef(() => {});
  const shellRef = useRef(() => {});

  useEffect(() => {
    if (!isDesktop) return undefined;
    let off = () => {};
    let dead = false;
    (async () => {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      const un = await getCurrentWebview().onDragDropEvent((e) => {
        const kind = e.payload.type;
        if (kind === 'enter' || kind === 'over') setDragging(true);
        else if (kind === 'leave') setDragging(false);
        else if (kind === 'drop') {
          setDragging(false);
          receivePaths(e.payload.paths ?? []);
        }
      });
      if (dead) un();
      else off = un;
    })().catch(() => {});
    return () => {
      dead = true;
      off();
    };
  }, [receivePaths]);

  const webDropHandlers = isDesktop ? {} : {
    onDragOver: (e) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e) => {
      if (e.target === e.currentTarget) setDragging(false);
    },
    onDrop: async (e) => {
      e.preventDefault();
      setDragging(false);
      const files = await droppedFiles(e.dataTransfer);
      if (files.length) receiveWebFiles(files);
    },
  };

  // Launch arguments, and files macOS hands over later.
  useEffect(() => {
    if (!isDesktop) return undefined;
    // Started on a file: straight to it. Otherwise the start screen.
    Promise.all([invoke('take_launch_files'), invoke('take_shell_request')]).then(([paths, shell]) => {
      setStart(paths.length === 0 && !shell && loadSettings().showStart !== false);
      if (paths.length) receivePaths(paths);
      if (shell) shellRef.current(shell);
    }).catch(() => setStart(loadSettings().showStart !== false));
    let off = () => {};
    let dead = false;
    import('@tauri-apps/api/event').then(({ listen }) => listen('open-files', (e) => receivePaths(e.payload))).then((un) => {
      if (dead) un();
      else off = un;
    }).catch(() => {});
    return () => {
      dead = true;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── What the table shows ────────────────────────────────────────────────────────────────────
  const tree = useMemo(() => (archive ? buildTree(archive.info.entries) : null), [archive]);
  const searching = !!archive && !!filter.trim();
  const rows = useMemo(() => {
    let items;
    if (archive) {
      if (searching) {
        items = searchAll(tree, filter);
      } else {
        const node = findNode(tree, cwd) ?? tree;
        items = [...node.children.values()];
      }
      items = items.map((n) => ({ ...n, key: n.path }));
    } else if (isDesktop) {
      items = folderItems
        .filter((i) => settings.showHidden || !i.name.startsWith('.'))
        .map((i) => ({ ...i, key: i.path }));
      items = filterItems(items, filter);
    } else {
      items = filterItems(webItems, filter);
    }
    return sortItems(items, sort.key, sort.descending);
  }, [archive, cwd, filter, folderItems, searching, settings.showHidden, sort, tree, webItems]);
  const orderedKeys = useMemo(() => rows.map((r) => r.key), [rows]);
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.key)), [rows, selected]);
  const empty = !archive && !isDesktop && !webItems.length;
  const showStart = start === true || (!isDesktop && empty && !tabs.length && !archive);
  const undecided = isDesktop && start === null && !archive;
  // Nothing behind the start screen to go back to: the web build before anything has been added.
  const startLocked = !isDesktop && empty && !tabs.length && !archive;
  useEffect(() => {
    if (isDesktop && !undecided) invoke('window_ready').catch(() => {});
  }, [undecided]);
  const hasLeft = !showStart && !undecided && (!!archive || isDesktop);
  const hasRight = !showStart && !undecided;


  const readOnly = !!archive?.info.readOnly;

  // A single archive selected in the list: the right panel shows what is in it. Quietly, with no
  // progress window, and whatever was running for the last selection is dropped.
  const pickedPath = !archive && rightOpen && selectedRows.length === 1 && !selectedRows[0].isDir && looksLikeArchive(selectedRows[0].name) ? selectedRows[0].path : null;
  useEffect(() => {
    if (!pickedPath) {
      setPicked({ path: null, info: null, locked: false });
      return undefined;
    }
    let live = true;
    const timer = setTimeout(() => {
      const job = run('list', { path: pickedPath, encoding: settings.encoding !== 'auto' ? settings.encoding : undefined });
      job.promise.then((info) => {
        if (live) setPicked({ path: pickedPath, info, locked: false });
      }).catch((e) => {
        if (live) setPicked({ path: pickedPath, info: null, locked: e.code === 'password_required' || e.code === 'wrong_password' });
      });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [pickedPath, settings.encoding]);

  const onRowClick = (e, item) => {
    const r = nextSelection(selected, orderedKeys, item.key, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, anchor: anchor.current });
    anchor.current = r.anchor;
    setSelected(r.selected);
  };

  const showPreview = useCallback((item) => {
    setDialog({ type: 'preview', entry: { path: item.path, name: item.name, size: item.size } });
  }, []);

  const onRowOpen = (item) => {
    if (archive) {
      if (item.isDir) {
        setFilter('');
        setCwd(item.path);
        setSelected(new Set());
      } else showPreview(item);
    } else if (isDesktop) {
      if (item.isDir) openFolder(item.path);
      else openArchive(item.path);
    }
  };

  const goUp = useCallback(() => {
    if (archive) {
      if (cwd) {
        setCwd(parentPath(cwd));
        setSelected(new Set());
      }
    } else if (isDesktop && folder) {
      const parent = dirName(folder);
      if (parent && parent !== folder) openFolder(parent);
    }
  }, [archive, cwd, folder, openFolder]);

  // ── Compress ────────────────────────────────────────────────────────────────────────────────
  const blankForm = useCallback((sources, output) => ({
    sources,
    output,
    format: settings.format,
    method: FORMATS[settings.format]?.methods[0] ?? '',
    level: Number(settings.level),
    split: settings.split,
    splitText: settings.splitText,
    splitUnit: settings.splitUnit,
    zipStyle: settings.zipStyle,
    password: '',
    confirm: '',
    cipher: settings.cipher,
    encryptNames: false,
    solid: !!settings.solid,
    recovery: 0,
    rarVersion: 'rar5',
    comment: '',
    rootFolder: '',
    exclude: '',
    smartStore: settings.smartStore,
    sfx: false,
  }), [settings]);

  const openCreate = useCallback((sources = [], mode = 'create') => {
    const dir = isDesktop ? (sources[0] ? dirName(sources[0].path) : folder ?? '') : '/out';
    const stem = suggestName(sources.map((s) => s.label ?? baseName(s.path)));
    const ext = FORMATS[settings.format]?.ext ?? 'zip';
    setDialog({ type: 'create', mode, initial: blankForm(sources, joinPath(dir, `${stem}.${ext}`)) });
  }, [blankForm, folder, settings.format]);
  openCreateRef.current = openCreate;

  const sourcesFromSelection = useCallback(() => {
    if (archive) return [];
    // The web build's list exists to be compressed: with nothing selected, it means all of it.
    const list = selectedRows.length ? selectedRows : isDesktop ? [] : webItems;
    return list.map((r) => ({ path: r.path, label: r.name, isDir: r.isDir }));
  }, [archive, selectedRows, webItems]);

  // Sources go to the trash only once the new archive has been read back whole.
  const removeSources = async (form, report, opts) => {
    if (!isDesktop || !form.deleteSources || form.convert || deleteSourcesProblem(form)) return null;
    try {
      const check = await runJob('test', { path: report.volumes[report.volumes.length - 1].path, password: opts.password, encoding: encodingOf(settings.encoding) });
      if (!check.ok) return { state: 'kept' };
      await invoke('trash_paths', { paths: form.sources.map((s) => s.path) });
      return { state: 'done', count: form.sources.length };
    } catch (e) {
      return { state: 'kept', detail: e?.code ?? String(e) };
    }
  };

  const submitCreate = async (form, options, overwrite = false) => {
    const opts = { ...options, overwrite };
    setDialog(null);
    try {
      const report = await runJob('create', opts);
      const sourcesRemoved = await removeSources(form, report, opts);
      if (isDesktop) refreshFolder();
      setDialog({ type: 'createResult', report: { ...report, sourcesRemoved } });
    } catch (e) {
      if (e.code === 'exists') {
        setDialog({
          type: 'confirm',
          title: t('confirm.overwriteTitle'),
          body: t('confirm.overwriteBody', { name: baseName(e.detail || options.output) }),
          onYes: () => submitCreate(form, options, true),
          onNo: () => setDialog({ type: 'create', mode: form.convert ? 'convert' : 'create', initial: form }),
        });
        return;
      }
      showError(e);
    }
  };

  // ── Extract ─────────────────────────────────────────────────────────────────────────────────
  const destFor = useCallback((archivePath) => {
    const stem = archiveStem(baseName(archivePath));
    if (!isDesktop) return `/out/x${(webSeq += 1)}`;
    return settings.extractSubfolder ? joinPath(dirName(archivePath), stem) : dirName(archivePath);
  }, [settings.extractSubfolder]);

  const openExtract = useCallback((paths, entries) => {
    const first = paths[0];
    setDialog({
      type: 'extract',
      paths,
      selectionCount: entries?.length ?? 0,
      initial: {
        dest: destFor(first),
        scope: entries?.length ? 'selected' : 'all',
        overwrite: settings.overwrite,
        flatten: false,
        keepBroken: !!settings.keepBroken,
        openAfter: settings.openAfterExtract,
        entries: entries ?? [],
      },
    });
  }, [destFor, settings.keepBroken, settings.openAfterExtract, settings.overwrite]);

  const runExtract = useCallback(async (paths, form, knownPassword) => {
    setDialog(null);
    const encoding = archive?.encoding ?? settings.encoding;
    const selection = form.scope === 'selected' ? form.entries : [];
    const strip = form.scope === 'selected' && archive && cwd ? cwd : undefined;
    let total = null;
    let password = knownPassword;
    try {
      for (const path of paths) {
        const dest = paths.length > 1 ? joinPath(form.dest, archiveStem(baseName(path))) : form.dest;
        const base = {
          path,
          dest,
          selection,
          stripPrefix: strip,
          flatten: form.flatten,
          keepBroken: form.keepBroken,
          encoding: encodingOf(encoding),
        };
        let overwrite = form.overwrite;
        const attempt = async (pw) => {
          if (overwrite === 'ask') {
            const names = await runJob('conflicts', { ...base, password: pw });
            if (names.length) {
              const answer = await new Promise((resolve) => setDialog({
                type: 'conflict',
                names,
                onChoose: (mode) => {
                  setDialog(null);
                  resolve(mode);
                },
                onCancel: () => {
                  setDialog(null);
                  resolve(null);
                },
              }));
              if (!answer) throw new EngineError('cancelled');
              overwrite = answer;
            } else overwrite = 'overwrite';
          }
          return runJob('extract', { ...base, password: pw, overwrite });
        };
        const { value: report, password: used } = await withPassword(password, attempt);
        password = used;
        total = total
          ? {
            ...total,
            files: total.files + report.files,
            bytes: total.bytes + report.bytes,
            skipped: [...total.skipped, ...report.skipped],
            renamed: [...total.renamed, ...report.renamed],
            unsafePaths: [...total.unsafePaths, ...report.unsafePaths],
            links: [...total.links, ...report.links],
            failed: [...total.failed, ...report.failed],
            written: [...total.written, ...report.written],
          }
          : report;
      }
      if (isDesktop) {
        refreshFolder();
        if (form.openAfter) invoke('reveal_path', { path: form.dest }).catch(() => {});
      }
      if (archive && password && !archive.password) setArchive((a) => ({ ...a, password }));
      setDialog({ type: 'extractResult', report: { ...total, dest: form.dest } });
    } catch (e) {
      showError(e);
    }
  }, [archive, cwd, encodingOf, refreshFolder, runJob, settings.encoding, showError, withPassword]);

  // "Here" and "to a named folder" skip the dialog.
  const quickExtract = useCallback((paths, named) => {
    const dest = named ? destFor(paths[0]) : (isDesktop ? dirName(paths[0]) : destFor(paths[0]));
    runExtract(paths, { dest: paths.length > 1 ? dirName(paths[0]) : dest, scope: 'all', overwrite: settings.overwrite, flatten: false, keepBroken: false, openAfter: false, entries: [] }, archive?.password);
  }, [archive, destFor, runExtract, settings.overwrite]);

  // ── Test, repair, convert ───────────────────────────────────────────────────────────────────
  const selectedArchivePaths = useCallback(() => {
    if (archive) return [archive.info.path];
    return selectedRows.filter((r) => !r.isDir && looksLikeArchive(r.name)).map((r) => r.path);
  }, [archive, selectedRows]);

  const testArchive = useCallback(async (path) => {
    try {
      const { value: report, password } = await withPassword(archive?.password, (pw) => runJob('test', { path, password: pw, encoding: encodingOf(archive?.encoding) }));
      if (archive && password && !archive.password) setArchive((a) => ({ ...a, password }));
      setDialog({ type: 'testResult', report });
    } catch (e) {
      showError(e);
    }
  }, [archive, encodingOf, runJob, showError, withPassword]);
  const runTest = useCallback(() => {
    const path = selectedArchivePaths()[0];
    return path ? testArchive(path) : undefined;
  }, [selectedArchivePaths, testArchive]);
  // What the file manager's menu asked for when it started this window.
  shellRef.current = ({ action, paths }) => {
    if (!paths.length) return;
    if (action === 'add') openCreateRef.current(paths.map((path) => ({ path, label: baseName(path), isDir: false })));
    else if (action === 'extract-here') quickExtract(paths, false);
    else if (action === 'extract-folder') quickExtract(paths, true);
    else if (action === 'test') testArchive(paths[0]);
  };

  const runRepair = useCallback(async (given) => {
    const path = given ?? selectedArchivePaths()[0];
    if (!path) return;
    const options = { path };
    if (!isDesktop) options.output = `/out/repaired${(webSeq += 1)}/${archiveStem(baseName(path))}.repaired.${baseName(path).split('.').pop()}`;
    try {
      const report = await runJob('repair', options);
      if (isDesktop) refreshFolder();
      setDialog({ type: 'repairResult', report });
    } catch (e) {
      showError(e);
    }
  }, [refreshFolder, runJob, selectedArchivePaths, showError]);

  const openConvert = useCallback(() => {
    const path = selectedArchivePaths()[0];
    if (!path) return;
    const stem = archiveStem(baseName(path));
    const dir = isDesktop ? dirName(path) : '/out';
    setDialog({ type: 'create', mode: 'convert', source: path, initial: { ...blankForm([], joinPath(dir, `${stem}.${FORMATS[settings.format].ext}`)), convert: true } });
  }, [blankForm, selectedArchivePaths, settings.format]);

  const submitConvert = async (source, form, options, overwrite = false) => {
    setDialog(null);
    const { sources, ...create } = { ...options, overwrite };
    try {
      const { value: report } = await withPassword(archive?.password, (pw) => runJob('convert', { path: source, password: pw, encoding: encodingOf(archive?.encoding), create }));
      if (isDesktop) refreshFolder();
      setDialog({ type: 'createResult', report, title: t('result.convertTitle') });
    } catch (e) {
      if (e.code === 'exists') {
        setDialog({
          type: 'confirm',
          title: t('confirm.overwriteTitle'),
          body: t('confirm.overwriteBody', { name: baseName(e.detail || options.output) }),
          onYes: () => submitConvert(source, form, options, true),
          onNo: () => setDialog(null),
        });
        return;
      }
      showError(e);
    }
  };

  // ── Changing an archive ─────────────────────────────────────────────────────────────────────
  const modify = useCallback(async (changes, doneMessage) => {
    try {
      const { value: info, password } = await withPassword(archive.password, (pw) => runJob('modify', { path: archive.info.path, password: pw, encoding: encodingOf(archive.encoding), ...changes }));
      setArchive((a) => ({ ...a, info, password: password ?? a.password }));
      setSelected(new Set());
      setDialog(null);
      if (doneMessage) toast('success', doneMessage);
      return true;
    } catch (e) {
      showError(e);
      return false;
    }
  }, [archive, encodingOf, runJob, showError, toast, withPassword]);

  const addToArchive = useCallback(async (kind) => {
    const prefix = cwd ? `${cwd}/` : '';
    const send = (items) => modify({ add: items.map((i) => ({ path: i.path, name: `${prefix}${i.label ?? baseName(i.path)}` })) }, t('toast.added'));
    if (!isDesktop) {
      pickWeb(kind === 'folder' ? 'folder' : 'files', send);
      return;
    }
    if (kind === 'folder') {
      const path = await pickFolder({ title: t('toolbar.addFolder') });
      if (path) send([{ path, label: baseName(path) }]);
      return;
    }
    const paths = await pickFiles({ title: t('toolbar.addFiles') });
    if (paths) send(paths.map((path) => ({ path, label: baseName(path) })));
  }, [cwd, modify, pickWeb, t]);

  const deleteSelected = useCallback(() => {
    const names = selectedRows.map((r) => r.path);
    if (!names.length || readOnly) return;
    const go = () => modify({ delete: names }, t('toast.deleted'));
    if (!settings.confirmDelete) {
      go();
      return;
    }
    setDialog({ type: 'confirm', danger: true, title: t('confirm.deleteTitle'), body: t('confirm.deleteBody', { count: names.length }), onYes: go, onNo: () => setDialog(null) });
  }, [modify, readOnly, selectedRows, settings.confirmDelete, t]);

  // On disk a delete goes to the recycle bin, and asks first. In the web list it only takes the
  // item off the list.
  const deleteFiles = useCallback((items) => {
    if (!items.length) return;
    if (!isDesktop) {
      for (const r of items) webRemove(r.path);
      setWebItems((l) => l.filter((x) => !items.some((r) => r.key === x.key)));
      setSelected(new Set());
      return;
    }
    setDialog({
      type: 'confirm',
      danger: true,
      title: t('confirm.deleteTitle'),
      body: t('confirm.trashBody', { count: items.length }),
      onNo: () => setDialog(null),
      onYes: async () => {
        setDialog(null);
        try {
          await invoke('trash_paths', { paths: items.map((r) => r.path) });
          setSelected(new Set());
          toast('success', t('toast.deleted'));
        } catch (e) {
          showError(new EngineError('io', String(e)));
        }
        refreshFolder();
      },
    });
  }, [refreshFolder, showError, t, toast]);

  const renameSelected = useCallback(() => {
    const item = selectedRows[0];
    if (!item || readOnly) return;
    setDialog({
      type: 'prompt',
      title: t('prompt.renameTitle'),
      label: t('prompt.newName'),
      initial: item.name,
      onSubmit: (name) => {
        const parent = parentPath(item.path);
        modify({ rename: [{ from: item.path, to: parent ? `${parent}/${name}` : name }] }, t('toast.renamed'));
      },
    });
  }, [modify, readOnly, selectedRows, t]);

  const newFolder = useCallback(() => {
    if (readOnly) return;
    setDialog({
      type: 'prompt',
      title: t('prompt.folderTitle'),
      label: t('prompt.folderName'),
      initial: '',
      onSubmit: (name) => modify({ mkdir: [cwd ? `${cwd}/${name}` : name] }, t('toast.folderMade')),
    });
  }, [cwd, modify, readOnly, t]);

  const openExternal = useCallback(async (item) => {
    try {
      await invoke('open_entry', { options: { path: archive.info.path, entry: item.path, password: archive.password ?? undefined, encoding: encodingOf(archive.encoding) } });
    } catch (e) {
      let parsed = null;
      try { parsed = JSON.parse(String(e)); } catch { /* not ours */ }
      if (parsed?.code === 'password_required' || parsed?.code === 'wrong_password') {
        const answer = await askPassword(parsed.code === 'wrong_password');
        if (answer) {
          setArchive((a) => ({ ...a, password: answer }));
        }
        return;
      }
      showError(new EngineError(parsed?.code ?? 'io', parsed?.detail ?? String(e)));
    }
  }, [archive, askPassword, encodingOf, showError]);

  // ── Web output ──────────────────────────────────────────────────────────────────────────────
  const downloadExtractedAsZip = useCallback(async (report) => {
    const name = `extracted-${Date.now()}.zip`;
    const output = `/out/z/${name}`;
    try {
      const made = await runJob('create', { output, format: 'zip', level: 5, sources: [{ path: report.dest, name: 'extracted' }] });
      downloadBytes(await webFetch(made.volumes[0].path), name);
    } catch (e) {
      showError(e);
    }
  }, [runJob, showError]);

  const saveExtractedToFolder = useCallback(async (report) => {
    try {
      const root = await window.showDirectoryPicker({ mode: 'readwrite' });
      for (const path of report.written) {
        const rel = path.slice(report.dest.length).replace(/^\/+/, '');
        const parts = rel.split('/');
        let dir = root;
        for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
        const handle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
        const w = await handle.createWritable();
        await w.write(await webFetch(path));
        await w.close();
      }
      toast('success', t('toast.extracted'));
    } catch (e) {
      if (e.name !== 'AbortError') showError(e);
    }
  }, [showError, t, toast]);

  // ── Tools ───────────────────────────────────────────────────────────────────────────────────
  const hashFiles = useCallback(async (paths, algorithms) => {
    try {
      return await runJob('hash', { paths, algorithms });
    } catch (e) {
      showError(e);
      return null;
    }
  }, [runJob, showError]);

  const splitFile = useCallback(async (options) => {
    setDialog(null);
    try {
      const files = await runJob('split', isDesktop ? options : { ...options, outDir: `/out/s${(webSeq += 1)}` });
      if (isDesktop) refreshFolder();
      setDialog({ type: 'splitResult', files });
    } catch (e) {
      showError(e);
    }
  }, [refreshFolder, runJob, showError]);

  const joinFiles = useCallback(async (options, overwrite = false) => {
    setDialog(null);
    try {
      const file = await runJob('join', { ...options, overwrite, output: isDesktop ? options.output : `/out/j${(webSeq += 1)}/${baseName(options.path).replace(/\.\d+$/, '')}` });
      if (isDesktop) refreshFolder();
      setDialog({ type: 'splitResult', files: [file], join: true });
    } catch (e) {
      if (e.code === 'exists') {
        setDialog({
          type: 'confirm',
          title: t('confirm.overwriteTitle'),
          body: t('confirm.overwriteBody', { name: baseName(e.detail) }),
          onYes: () => joinFiles(options, true),
          onNo: () => setDialog(null),
        });
        return;
      }
      showError(e);
    }
  }, [refreshFolder, runJob, showError, t]);

  const benchmark = useCallback(async (megabytes) => {
    try {
      return await runJob('benchmark', { megabytes });
    } catch (e) {
      showError(e);
      return null;
    }
  }, [runJob, showError]);

  const reveal = useCallback((path) => invoke('reveal_path', { path }).catch(() => {}), []);

  const openSettings = () => {
    if (isDesktop) invoke('open_settings_window').catch(() => {});
    else window.open('#settings', 'zm-settings', 'width=580,height=640');
  };
  const togglePanel = (side) => {
    const set = side === 'left' ? setLeftOpen : setRightOpen;
    set((open) => {
      localStorage.setItem(side === 'left' ? 'zm-left-open' : 'zm-right-open', open ? '0' : '1');
      mirrorToDisk();
      return !open;
    });
  };
  const openGuide = () => {
    // A guide already open comes back to this window's language.
    localStorage.setItem('zm-lang', lang);
    localStorage.setItem('zm-guide-open', String(Date.now()));
    if (isDesktop) invoke('open_guide_window').catch(() => {});
    else window.open('#guide', 'zm-guide', 'width=900,height=720');
  };
  // The dialog tries colours on the real window; cancelling restores what was there.
  const openCustomTheme = () => {
    setOpenMenu(null);
    const before = { theme, auto: themeAuto, colors: loadCustomTheme() };
    document.documentElement.dataset.theme = 'custom';
    setDialog({
      type: 'customTheme',
      initial: before.colors,
      onCancel: () => {
        applyCustomTheme(before.colors);
        document.documentElement.dataset.theme = before.theme;
        setDialog(null);
      },
      onSave: (colors) => {
        saveCustomTheme(colors);
        setDialog(null);
        pickTheme('custom');
      },
    });
  };
  customizeRef.current = openCustomTheme;
  const openAbout = () => {
    if (isDesktop) invoke('open_about_window').catch(() => {});
    else window.open('#about', 'zm-about', 'width=560,height=520');
  };

  // ── Toolbar actions ─────────────────────────────────────────────────────────────────────────
  const doPack = () => openCreate(archive ? [] : sourcesFromSelection());
  const doUnpack = () => {
    if (archive) {
      openExtract([archive.info.path], selectedRows.map((r) => r.path));
      return;
    }
    const paths = selectedArchivePaths();
    if (paths.length) openExtract(paths);
  };
  const deleteAny = () => {
    if (archive) deleteSelected();
    else deleteFiles(selectedRows);
  };
  const doView = () => {
    if (selectedRows[0]) onRowOpen(selectedRows[0]);
  };
  const canAct = !showStart && (!!archive || selectedArchivePaths().length > 0);
  const oneSelected = selectedRows.length === 1 ? selectedRows[0] : null;
  const canView = !showStart && !!oneSelected && (archive ? true : isDesktop && (oneSelected.isDir || looksLikeArchive(oneSelected.name)));
  const canAdd = !showStart && !!archive && !readOnly;
  const canDelete = !showStart && selectedRows.length > 0 && (archive ? !readOnly : true);

  const onSort = (key) => setSort((s) => (s.key === key ? { key, descending: !s.descending } : { key, descending: false }));

  // ── Menus ───────────────────────────────────────────────────────────────────────────────────
  // Above everything, since the toolbar clips what overflows it. Those near the right edge hang
  // from their button's right side.
  // On the desktop the theme menu is a window of its own, free to pass the main window's edge. It
  // hides when it loses focus, so a click on this button right after that means "close".
  const themeMenuClosedAt = useRef(0);
  const themeMenuOpen = useRef(false);
  const openThemeMenu = (e) => {
    if (!isDesktop) {
      toggleMenu('theme', e);
      return;
    }
    if (Date.now() - themeMenuClosedAt.current < 300) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (themeMenuOpen.current) {
      invoke('hide_theme_menu').catch(() => {});
      return;
    }
    themeMenuOpen.current = true;
    invoke('show_theme_menu', { x: r.right, y: r.bottom + 4 }).catch(() => {});
  };
  useEffect(() => {
    if (!isDesktop) return undefined;
    let off = () => {};
    let dead = false;
    import('@tauri-apps/api/event').then(({ listen }) => listen('theme-menu-closed', () => {
      themeMenuOpen.current = false;
      themeMenuClosedAt.current = Date.now();
    })).then((un) => {
      if (dead) un();
      else off = un;
    }).catch(() => {});
    // If it never got the focus, it never loses it: a click here still closes it.
    const onDown = (e) => {
      if (themeMenuOpen.current && !e.target.closest?.('[data-testid="btn-theme"]')) invoke('hide_theme_menu').catch(() => {});
    };
    window.addEventListener('mousedown', onDown, true);
    return () => {
      dead = true;
      off();
      window.removeEventListener('mousedown', onDown, true);
    };
  }, []);

  const toggleMenu = (name, e) => {
    if (openMenu?.name === name) {
      setOpenMenu(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const top = r.bottom + 4;
    if (name === 'theme') setOpenMenu({ name, top, right: Math.max(8, window.innerWidth - r.right) });
    else setOpenMenu({ name, top, left: r.left });
  };

  useEffect(() => {
    if (!openMenu) return undefined;
    const close = (e) => {
      if (!e.target.closest?.('.portal-menu') && !e.target.closest?.('[data-testid^="btn-"]')) setOpenMenu(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', () => setOpenMenu(null), { once: true });
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  const rowMenuItems = (item) => {
    const many = selectedRows.length > 1;
    if (archive) {
      return [
        { id: 'open', icon: item.isDir ? IconFolderOpen : IconEye, label: item.isDir ? t('menu.open') : t('menu.preview'), disabled: many, onClick: () => onRowOpen(item) },
        { id: 'external', icon: IconExternal, label: t('menu.openExternal'), disabled: many || item.isDir || !isDesktop, onClick: () => openExternal(item) },
        { id: 'extract', icon: IconUnpack, label: t('menu.extract'), onClick: () => openExtract([archive.info.path], selectedRows.length ? selectedRows.map((r) => r.path) : [item.path]) },
        { separator: true },
        { id: 'rename', icon: IconEdit, label: t('menu.rename'), disabled: readOnly || many, onClick: renameSelected },
        { id: 'delete', icon: IconTrash, label: t('menu.del'), danger: true, disabled: readOnly, onClick: deleteSelected },
        { separator: true },
        { id: 'newFolder', icon: IconFolderPlus, label: t('menu.newFolder'), disabled: readOnly, onClick: newFolder },
        { id: 'add', icon: IconFilePlus, label: t('menu.add'), disabled: readOnly, onClick: () => addToArchive('files') },
        { id: 'selectAll', icon: IconSelectAll, label: t('menu.selectAll'), onClick: () => setSelected(new Set(orderedKeys)) },
      ];
    }
    const items = selectedRows.length && selected.has(item.key) ? selectedRows : [item];
    const sources = items.map((r) => ({ path: r.path, label: r.name, isDir: r.isDir }));
    const archives = items.filter((r) => !r.isDir && looksLikeArchive(r.name)).map((r) => r.path);
    return [
      { id: 'open', icon: item.isDir ? IconFolderOpen : IconArchive, label: t('menu.open'), disabled: !isDesktop || items.length > 1 || !(item.isDir || looksLikeArchive(item.name)), onClick: () => onRowOpen(item) },
      { id: 'pack', icon: IconPack, label: t('menu.pack'), onClick: () => openCreate(sources) },
      { id: 'extract', icon: IconUnpack, label: t('menu.extract'), disabled: !archives.length, onClick: () => openExtract(archives) },
      { id: 'hash', icon: IconHash, label: t('menu.hash'), onClick: () => setDialog({ type: 'hash', initial: sources }) },
      { separator: true },
      { id: 'reveal', icon: IconFile, label: t('menu.reveal'), disabled: !isDesktop || items.length > 1, onClick: () => reveal(item.path) },
      { id: 'copyPath', icon: IconCopy, label: t('menu.copyPath'), disabled: !isDesktop || items.length > 1, onClick: () => navigator.clipboard.writeText(item.path).then(() => toast('success', t('toast.copied'))) },
      { separator: true },
      { id: 'delete', icon: IconTrash, label: isDesktop ? t('menu.del') : t('menu.removeFromList'), danger: true, onClick: () => deleteFiles(items) },
    ];
  };

  // ── Keyboard ────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (dialog || job || (showStart && e.key !== 'F1' && !e.ctrlKey && !e.metaKey)) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        if (isDesktop) openArchiveDialog();
        else fileInput.current.click();
      } else if (ctrl && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        doPack();
      } else if (ctrl && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        doUnpack();
      } else if (ctrl && e.key.toLowerCase() === 't') {
        e.preventDefault();
        if (canAct) runTest();
      } else if (ctrl && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        filterRef.current?.focus();
      } else if (typing) {
        if (e.key === 'Escape') {
          setFilter('');
          e.target.blur();
        }
      } else if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelected(new Set(orderedKeys));
      } else if (e.key === 'F1') {
        e.preventDefault();
        openGuide();
      } else if (e.key === 'F5') {
        e.preventDefault();
        if (archive) reopen(archive.password, cwd);
        else refreshFolder();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        goUp();
      } else if (e.key === 'Enter' && e.altKey) {
        e.preventDefault();
        if (archive) setDialog({ type: 'info' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        doView();
      } else if (e.key === 'Delete') {
        if (canDelete) deleteAny();
      } else if (e.key === 'F2') {
        e.preventDefault();
        if (archive) renameSelected();
      } else if (e.key === 'Escape' && archive) {
        if (selected.size) setSelected(new Set());
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const at = orderedKeys.findIndex((k) => selected.has(k));
        const next = e.key === 'ArrowDown' ? Math.min(orderedKeys.length - 1, at + 1) : Math.max(0, at - 1);
        if (orderedKeys[next] != null) {
          const r = nextSelection(selected, orderedKeys, orderedKeys[next], { shift: e.shiftKey, ctrl: false, anchor: anchor.current });
          anchor.current = r.anchor;
          setSelected(r.selected);
          tableRef.current?.querySelector(`tr[data-key="${CSS.escape(orderedKeys[next])}"]`)?.scrollIntoView({ block: 'nearest' });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const openArchiveDialog = async () => {
    const paths = await pickFiles({ multiple: false, title: t('toolbar.open') });
    if (paths?.[0]) openArchive(paths[0]);
  };

  // ── The window may never be narrower than its toolbar ───────────────────────────────────────
  useLayoutEffect(() => {
    if (!isDesktop || !toolbarRef.current) return;
    const bar = toolbarRef.current;
    const style = getComputedStyle(bar);
    let need = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const kids = [...bar.children];
    const gap = parseFloat(style.columnGap) || 0;
    for (const k of kids) {
      if (!k.classList.contains('toolbar-spacer')) need += k.getBoundingClientRect().width;
    }
    need += gap * Math.max(0, kids.length - 1);
    invoke('set_min_window_size', { width: Math.ceil(need) + 2, height: 480 }).catch(() => {});
  }, [lang, archive?.info.format, readOnly, !!archive]);

  // ── Splitter ────────────────────────────────────────────────────────────────────────────────
  const startResize = (e, side) => {
    e.preventDefault();
    const x0 = e.clientX;
    const left = side === 'left';
    const w0 = left ? sideWidth : infoWidth;
    const set = left ? setSideWidth : setInfoWidth;
    const move = (ev) => {
      const delta = ev.clientX - x0;
      set(Math.max(left ? 150 : 180, Math.min(520, left ? w0 + delta : w0 - delta)));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      set((w) => {
        localStorage.setItem(left ? 'zm-side-width' : 'zm-info-width', String(w));
        mirrorToDisk();
        return w;
      });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // ── Rendering ───────────────────────────────────────────────────────────────────────────────
  const title = archive ? `${baseName(archive.info.path)} - MyZipMaster` : 'MyZipMaster';
  useEffect(() => {
    document.title = title;
  }, [title]);

  const crumbs = [];
  if (archive) {
    crumbs.push({ label: baseName(archive.info.path), go: () => setCwd('') });
    let at = '';
    for (const part of cwd.split('/').filter(Boolean)) {
      at = at ? `${at}/${part}` : part;
      const target = at;
      crumbs.push({ label: part, go: () => setCwd(target) });
    }
  } else if (isDesktop && folder) {
    const sep = folder.includes('\\') ? '\\' : '/';
    const parts = folder.split(/[\\/]/).filter(Boolean);
    let at = folder.startsWith('/') ? '/' : '';
    parts.forEach((part, i) => {
      at = i === 0 ? (at === '/' ? `/${part}` : `${part}${sep}`) : (at.endsWith(sep) ? `${at}${part}` : `${at}${sep}${part}`);
      const target = at;
      crumbs.push({ label: part, go: () => openFolder(target) });
    });
  }

  const totalSize = rows.reduce((n, r) => n + (r.size ?? 0), 0);
  const selectedSize = selectedRows.reduce((n, r) => n + (r.size ?? 0), 0);
  const fileMenu = (
    <div className="dropdown-menu" role="menu" data-testid="file-menu" style={{ minWidth: 260 }}>
      {isDesktop && <button className="dropdown-item" data-testid="menu-start" onClick={() => { setOpenMenu(null); selectTab(null); setStart(true); }}><IconHome size={16} />{t('toolbar.startScreen')}</button>}
      <button className="dropdown-item" data-testid="menu-new" onClick={() => { setOpenMenu(null); doPack(); }}><IconFilePlus size={16} />{t('toolbar.newArchive')}</button>
      <button className="dropdown-item" data-testid="menu-open" onClick={() => { setOpenMenu(null); if (isDesktop) openArchiveDialog(); else fileInput.current.click(); }}><IconFolderOpen size={16} />{t('toolbar.open')}</button>
      {archive && <button className="dropdown-item" data-testid="menu-close" onClick={() => { setOpenMenu(null); closeArchive(); }}><IconClose2 size={16} />{t('toolbar.closeArchive')}</button>}
      {isDesktop && (
        <>
          <div className="dropdown-head">{t('toolbar.recent')}</div>
          {settings.recent.length === 0 && <div className="dropdown-empty">{t('toolbar.noRecent')}</div>}
          {settings.recent.map((p) => (
            <button key={p} className="dropdown-item recent-item" data-recent={p} onClick={() => { setOpenMenu(null); openArchive(p); }}>
              <IconArchive size={16} />
              <span className="recent-text"><span className="recent-name">{baseName(p)}</span><span className="recent-dir">{dirName(p)}</span></span>
            </button>
          ))}
          {settings.recent.length > 0 && <button className="dropdown-item" data-testid="recent-clear" onClick={() => { setOpenMenu(null); setSettings((s) => ({ ...s, recent: [] })); }}><IconTrash size={16} />{t('toolbar.clearRecent')}</button>}
        </>
      )}
    </div>
  );
  const toolsMenu = (
    <div className="dropdown-menu" role="menu" data-testid="tools-menu" style={{ minWidth: 220 }}>
      <button className="dropdown-item" data-testid="tool-hash" onClick={() => { setOpenMenu(null); setDialog({ type: 'hash', initial: sourcesFromSelection() }); }}><IconHash size={16} />{t('toolbar.hash')}</button>
      <button className="dropdown-item" data-testid="tool-split" onClick={() => { setOpenMenu(null); setDialog({ type: 'split' }); }}><IconSplit size={16} />{t('toolbar.split')}</button>
      <button className="dropdown-item" data-testid="tool-join" onClick={() => { setOpenMenu(null); setDialog({ type: 'join' }); }}><IconJoin size={16} />{t('toolbar.join')}</button>
      <button className="dropdown-item" data-testid="tool-benchmark" onClick={() => { setOpenMenu(null); setDialog({ type: 'benchmark' }); }}><IconGauge size={16} />{t('toolbar.benchmark')}</button>
      {isDesktop && appInfo?.sfx && <button className="dropdown-item" data-testid="tool-sfx" onClick={() => { setOpenMenu(null); setDialog({ type: 'create', mode: 'sfx', initial: { ...blankForm(sourcesFromSelection(), joinPath(folder ?? '', `archive.${FORMATS.zip.ext}`)), format: 'zip', method: 'deflate' } }); }}><IconPack size={16} />{t('toolbar.sfx')}</button>}
    </div>
  );
  const unpackMenu = (
    <div className="dropdown-menu" role="menu" data-testid="unpack-menu" style={{ minWidth: 230 }}>
      <button className="dropdown-item" data-testid="unpack-to" onClick={() => { setOpenMenu(null); doUnpack(); }}><IconUnpack size={16} />{t('toolbar.unpackTo')}</button>
      {isDesktop && <button className="dropdown-item" data-testid="unpack-here" onClick={() => { setOpenMenu(null); quickExtract(selectedArchivePaths(), false); }}><IconUnpack size={16} />{t('toolbar.unpackHere')}</button>}
      {isDesktop && <button className="dropdown-item" data-testid="unpack-named" onClick={() => { setOpenMenu(null); quickExtract(selectedArchivePaths(), true); }}><IconFolderOpen size={16} />{t('toolbar.unpackFolder')}</button>}
    </div>
  );

  return (
    <div className="app" {...webDropHandlers}>
      <input ref={fileInput} data-testid="web-file-input" type="file" multiple style={{ display: 'none' }} onChange={onWebPicked} />
      <input ref={folderInput} data-testid="web-folder-input" type="file" webkitdirectory="" style={{ display: 'none' }} onChange={onWebFiles} />

      <header className="toolbar" ref={toolbarRef} data-testid="toolbar" onMouseDown={startDragByHand}>
        <Brand startOpen={showStart} startDisabled={startLocked || undecided} startTip={t('tip.start')} onToggleStart={() => setStart(!showStart)} />
        <div className="tool-sep" />
        <div className="toolbar-group">
          <button className="tbtn" data-testid="btn-file" title={t('tip.file')} aria-label={t('tip.file')} onClick={(e) => toggleMenu('file', e)}><IconFolderOpen size={20} /></button>
          <button className="tbtn" data-testid="btn-pack" title={t('tip.pack')} aria-label={t('tip.pack')} onClick={doPack}><IconPack size={20} /></button>
          <button className="tbtn" data-testid="btn-unpack" title={t('tip.unpack')} aria-label={t('tip.unpack')} disabled={!canAct} onClick={doUnpack}><IconUnpack size={20} /></button>
          <button className="tbtn narrow" data-testid="btn-unpack-more" title={t('tip.unpackMore')} aria-label={t('tip.unpackMore')} disabled={!canAct} onClick={(e) => toggleMenu('unpack', e)}><IconChevron size={14} /></button>
          <button className="tbtn" data-testid="btn-test" title={t('tip.test')} aria-label={t('tip.test')} disabled={!canAct} onClick={runTest}><IconTest size={20} /></button>
        </div>
        <div className="tool-sep" />
        <div className="toolbar-group">
          <button className="tbtn" data-testid="btn-view" title={t('tip.view')} aria-label={t('tip.view')} disabled={!canView} onClick={doView}><IconEye size={20} /></button>
          <button className="tbtn" data-testid="btn-add" title={t('tip.add')} aria-label={t('tip.add')} disabled={!canAdd} onClick={() => addToArchive('files')}><IconFilePlus size={20} /></button>
          <button className="tbtn" data-testid="btn-delete" title={t('tip.del')} aria-label={t('tip.del')} disabled={!canDelete} onClick={deleteAny}><IconTrash size={20} /></button>
        </div>
        <div className="tool-sep" />
        <div className="toolbar-group">
          <button className="tbtn" data-testid="btn-convert" title={t('tip.convert')} aria-label={t('tip.convert')} disabled={!canAct} onClick={openConvert}><IconConvert size={20} /></button>
          <button className="tbtn" data-testid="btn-repair" title={t('tip.repair')} aria-label={t('tip.repair')} disabled={!canAct} onClick={() => runRepair()}><IconRepair size={20} /></button>
          <button className="tbtn" data-testid="btn-info" title={t('tip.info')} aria-label={t('tip.info')} disabled={showStart || !archive} onClick={() => setDialog({ type: 'info' })}><IconComment size={20} /></button>
          <button className="tbtn" data-testid="btn-tools" title={t('tip.tools')} aria-label={t('tip.tools')} onClick={(e) => toggleMenu('tools', e)}><IconTools size={20} /></button>
          {!isDesktop && archive && <button className="tbtn" data-testid="btn-download" title={t('toolbar.download')} aria-label={t('toolbar.download')} onClick={async () => downloadBytes(await webFetch(archive.info.path), baseName(archive.info.path))}><IconDownload size={20} /></button>}
        </div>
        <div className="tool-sep" />
        <div className="toolbar-group">
          <button className={`tbtn${leftOpen ? ' on' : ''}`} data-testid="btn-left" title={t('tip.leftPanel')} aria-label={t('tip.leftPanel')} aria-pressed={leftOpen} disabled={!hasLeft} onClick={() => togglePanel('left')}><IconPanelLeft size={20} /></button>
          <button className={`tbtn${rightOpen ? ' on' : ''}`} data-testid="btn-right" title={t('tip.rightPanel')} aria-label={t('tip.rightPanel')} aria-pressed={rightOpen} disabled={!hasRight} onClick={() => togglePanel('right')}><IconPanelRight size={20} /></button>
        </div>
        <div className="toolbar-spacer" />
        <div className="toolbar-group">
          <button className="tbtn lang-btn" data-testid="btn-lang" title={`${t('tip.lang')} — ${lang === 'ko' ? 'English' : '한국어'}`} aria-label={lang === 'ko' ? 'English' : '한국어'} onClick={toggleLang}>
            {lang === 'ko' ? <IconFlagUK /> : <IconFlagKR />}
          </button>
          <button className="tbtn" data-testid="btn-theme-cycle" title={t('tip.themeCycle')} aria-label={t('tip.themeCycle')} onClick={() => pickTheme(nextThemeId(theme))}><IconPalette size={22} /></button>
          <button className={`theme-drop${themeAuto ? ' on' : ''}`} data-testid="btn-theme" title={`${t('tip.theme')} — ${themeAuto ? t('theme.auto') : t(`theme.${theme}`)}`} aria-label={t('tip.theme')} onClick={openThemeMenu}>
            <i className="theme-drop-dot" aria-hidden="true" />
            <span className="theme-drop-name" data-testid="theme-current">{themeAuto ? t('theme.auto') : t(`theme.${theme}`)}</span>
            <span className="theme-drop-caret" aria-hidden="true">▾</span>
          </button>
          <button className="tbtn" data-testid="btn-help" title={t('tip.help')} aria-label={t('tip.help')} onClick={openGuide}><IconHelp size={20} /></button>
          <button className="tbtn" data-testid="btn-settings" title={t('tip.settings')} aria-label={t('tip.settings')} onClick={openSettings}><IconSettings size={20} /></button>
          <button className="tbtn" data-testid="btn-about" title={t('tip.about')} aria-label={t('tip.about')} onClick={openAbout}><IconInfo size={20} /></button>
        </div>
        {isDesktop && <div className="tool-sep" />}
        <WindowControls />
      </header>
      {openMenu && createPortal(
        <div className={`portal-menu${openMenu.name === 'theme' ? ' theme-menu' : ''}`} style={openMenu.right != null ? { top: openMenu.top, right: openMenu.right } : { top: openMenu.top, left: openMenu.left }}>
          {openMenu.name === 'file' && fileMenu}
          {openMenu.name === 'unpack' && unpackMenu}
          {openMenu.name === 'tools' && toolsMenu}
          {openMenu.name === 'theme' && (
            <div className="dropdown-menu theme-menu" role="menu" data-testid="theme-menu">
              <ThemeMenuList theme={theme} themeAuto={themeAuto} onAuto={pickAutoTheme} onPick={pickTheme} onCustomize={openCustomTheme} />
            </div>
          )}
        </div>,
        document.body,
      )}

      {showStart && (
        <StartScreen
          recent={settings.recent}
          onNew={() => openCreate([])}
          onOpen={openArchiveDialog}
          onBrowse={() => (folder ? openFolder(folder) : setStart(false))}
          onRecent={(p) => openArchive(p)}
          onPickFiles={() => fileInput.current.click()}
          onPickFolder={() => folderInput.current.click()}
          onGuide={openGuide}
          showAtStart={settings.showStart !== false}
          onShowAtStart={(on) => setSettings((v) => ({ ...v, showStart: on }))}
          background={{ kind: settings.startBg, transparency: settings.startBgTransparency, speed: settings.startBgSpeed }}
          onBackground={(patch) => setSettings((v) => ({ ...v, ...patch }))}
          layout={settings.startLayout}
          onLayout={(startLayout) => setSettings((v) => ({ ...v, startLayout }))}
        />
      )}
      {undecided && <div className="start" />}
      {!showStart && !undecided && (
      <>
      <main className="body">
        {hasLeft && (leftOpen ? (
          <>
            <aside className="sidebar narrow-side" data-testid="left-panel" style={{ width: sideWidth, flex: '0 0 auto' }}>
              <div className="panel-head" data-testid="left-head">
                <span className="panel-title"><IconFolderOpen size={16} />{t('panel.folders')}</span>
                <button className="iconbtn sm" data-testid="left-collapse" title={t('panel.collapse')} aria-label={t('panel.collapse')} onClick={() => togglePanel('left')}><IconCollapseLeftPanel size={16} /></button>
              </div>
              {isDesktop && <DriveBar current={archive ? archive.info.path : folder} onPick={(d) => { selectTab(null); openFolder(d); }} />}
              <div className="sidebar-body">
                {archive
                  ? <ArchiveTree root={tree} name={baseName(archive.info.path)} cwd={cwd} onPick={(p) => { setFilter(''); setCwd(p); setSelected(new Set()); }} />
                  : <DiskTree cwd={folder} onPick={openFolder} showHidden={settings.showHidden} />}
              </div>
            </aside>
            <div className="splitter" title={t('tip.resizePanel')} onMouseDown={(e) => startResize(e, 'left')} onDoubleClick={() => setSideWidth(SIDE_DEFAULT)} />
          </>
        ) : (
          <div className="panel-rail" data-testid="left-rail">
            <button className="iconbtn sm" data-testid="left-expand" title={t('panel.expand')} aria-label={t('panel.expand')} onClick={() => togglePanel('left')}><IconExpandLeftPanel size={16} /></button>
            <span className="panel-rail-title" data-testid="left-rail-title"><IconFolderOpen size={16} /><span>{t('panel.folders')}</span></span>
          </div>
        ))}
        <section className="main">
          <div className="tabstrip" data-testid="tabstrip">
            <div className="tabs-scroll" ref={tabsRef} data-testid="tabs-scroll" onScroll={measureTabs}>
              <button className={`ztab${archive ? '' : ' on'}`} data-testid="tab-files" data-tab="files" title={isDesktop ? t('tab.files') : t('tab.list')} onClick={() => selectTab(null)}>
                <IconFolderOpen size={15} />
                <span className="ztab-name">{isDesktop ? t('tab.files') : t('tab.list')}</span>
              </button>
              {tabs.map((tab) => {
                const name = baseName(tab.path);
                const icon = fileIconFor(name);
                const on = archive?.info.path === tab.path;
                return (
                  <div key={tab.path} className={`ztab${on ? ' on' : ''}`} data-tab={name} title={tab.path} onClick={() => selectTab(tab.path)}>
                    {icon ? <img src={`./file-icons/${icon}.svg`} alt="" /> : <IconArchive size={15} />}
                    <span className="ztab-name">{name}</span>
                    <button className="ztab-close" data-tab-close={name} title={t('tab.close')} aria-label={t('tab.close')} onClick={(e) => { e.stopPropagation(); closeTab(tab.path); }}><IconX size={12} /></button>
                  </div>
                );
              })}
            </div>
            <div className="tabs-nav">
              <button className="iconbtn sm" data-testid="tabs-prev" title={t('tab.prev')} aria-label={t('tab.prev')} disabled={!tabOverflow.left} onClick={() => scrollTabs(-1)}><IconArrowLeft size={14} /></button>
              <button className="iconbtn sm" data-testid="tabs-next" title={t('tab.next')} aria-label={t('tab.next')} disabled={!tabOverflow.right} onClick={() => scrollTabs(1)}><IconArrowRight size={14} /></button>
            </div>
          </div>
          <div className="pathbar">
            <button className="iconbtn sm" data-testid="btn-up" title={t('tip.up')} disabled={archive ? !cwd : !isDesktop} onClick={goUp}><IconBack size={15} /></button>
            <button className="iconbtn sm" data-testid="btn-refresh" title={t('tip.refresh')} disabled={!archive && !isDesktop} onClick={() => (archive ? reopen(archive.password, cwd) : refreshFolder())}><IconRefresh size={15} /></button>
            <div className="crumbs" data-testid="crumbs">
              {crumbs.map((c, i) => (
                <React.Fragment key={`${c.label}-${i}`}>
                  {i > 0 && <span className="crumb-sep">›</span>}
                  <button className={`crumb${i === crumbs.length - 1 ? ' current' : ''}`} title={c.label} onClick={c.go}>{c.label}</button>
                </React.Fragment>
              ))}
            </div>
            {!isDesktop && !archive && (
              <>
                <button className="iconbtn" data-testid="web-add-files" title={t('toolbar.addFiles')} aria-label={t('toolbar.addFiles')} onClick={() => fileInput.current.click()}><IconFilePlus size={17} /></button>
                <button className="iconbtn" data-testid="web-add-folder" title={t('toolbar.addFolder')} aria-label={t('toolbar.addFolder')} onClick={() => folderInput.current.click()}><IconFolderPlus size={17} /></button>
                <button className="iconbtn" data-testid="web-clear" title={t('toolbar.clearList')} aria-label={t('toolbar.clearList')} onClick={() => { for (const w of webItems) webRemove(w.path); setWebItems([]); setSelected(new Set()); }}><IconTrash size={17} /></button>
              </>
            )}
            <input ref={filterRef} className="filter-box" data-testid="filter" placeholder="🔍" title={t('tip.filter')} value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          {(
            <div className="table-wrap" ref={tableRef} tabIndex={0} onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(new Set()); }} onContextMenu={(e) => { if (archive && e.target.closest('tr') == null) { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, items: [
              { id: 'newFolder', icon: IconFolderPlus, label: t('menu.newFolder'), disabled: readOnly, onClick: newFolder },
              { id: 'add', icon: IconFilePlus, label: t('menu.add'), disabled: readOnly, onClick: () => addToArchive('files') },
              { id: 'selectAll', icon: IconSelectAll, label: t('menu.selectAll'), disabled: !orderedKeys.length, onClick: () => setSelected(new Set(orderedKeys)) },
              { separator: true },
              { id: 'rename', icon: IconEdit, label: t('menu.rename'), disabled: true },
              { id: 'delete', icon: IconTrash, label: t('menu.del'), danger: true, disabled: true },
            ] }); } }}>
              <FileTable
                mode={archive ? 'archive' : 'files'}
                items={rows}
                selected={selected}
                sortKey={sort.key}
                descending={sort.descending}
                onSort={onSort}
                onRowClick={onRowClick}
                onRowOpen={onRowOpen}
                onRowMenu={(e, item) => {
                  if (!selected.has(item.key)) {
                    setSelected(new Set([item.key]));
                    anchor.current = item.key;
                  }
                  setMenu({ x: e.clientX, y: e.clientY, items: rowMenuItems(item) });
                }}
                showPath={searching}
              />
              {!rows.length && <div className="empty muted" data-testid="empty-note">{filter ? t('welcome.noMatch') : t('welcome.emptyFolder')}</div>}
            </div>
          )}
        </section>
        {hasRight && (rightOpen ? (
          <>
            <div className="splitter right" title={t('tip.resizePanel')} onMouseDown={(e) => startResize(e, 'right')} onDoubleClick={() => setInfoWidth(INFO_DEFAULT)} />
            <aside className="sidebar right-side" data-testid="right-panel" style={{ width: infoWidth, flex: '0 0 auto' }}>
              <div className="panel-head" data-testid="right-head">
                <span className="panel-title"><IconInfo size={16} />{t('panel.info')}</span>
                <button className="iconbtn sm" data-testid="right-collapse" title={t('panel.collapse')} aria-label={t('panel.collapse')} onClick={() => togglePanel('right')}><IconCollapseRightPanel size={16} /></button>
              </div>
              <div className="sidebar-body">
                <InfoPanel archive={archive} selection={selectedRows} picked={picked.path === pickedPath ? picked.info : null} pickedLocked={picked.path === pickedPath && picked.locked} />
              </div>
            </aside>
          </>
        ) : (
          <div className="panel-rail right" data-testid="right-rail">
            <button className="iconbtn sm" data-testid="right-expand" title={t('panel.expand')} aria-label={t('panel.expand')} onClick={() => togglePanel('right')}><IconExpandRightPanel size={16} /></button>
            <span className="panel-rail-title" data-testid="right-rail-title"><IconInfo size={16} /><span>{t('panel.info')}</span></span>
          </div>
        ))}
      </main>

      </>
      )}

      <footer className="statusbar" data-testid="statusbar">
        <span className="status-text" data-testid="status-text">
          {showStart || undecided
            ? t('status.ready')
            : selected.size > 0
            ? `${t('status.selected', { count: selected.size })} · ${formatSize(selectedSize)}`
            : `${t('status.items', { count: rows.length })} · ${t('status.total', { size: formatSize(totalSize) })}`}
        </span>
        {archive && (
          <span className="status-stats" data-testid="status-archive">
            <span className="stat" data-testid="status-format">{archive.info.format.toUpperCase()}</span>
            {archive.info.volumes.length > 1 && <span className="stat" data-testid="status-volumes">{t('status.volumes', { count: archive.info.volumes.length })}</span>}
            {archive.info.encrypted && <span className="stat badge">{t('status.encrypted')}</span>}
            {archive.info.solid && <span className="stat">{t('status.solid')}</span>}
            {archive.info.hasRecovery && <span className="stat">{t('status.recovery')}</span>}
            {readOnly && <span className="badge-ro" data-testid="status-readonly">{t('status.readOnly')}</span>}
            <select className="status-enc" data-testid="encoding" title={t('tip.encoding')} value={archive.encoding} onChange={(e) => openArchive(archive.info.path, { password: archive.password, encoding: e.target.value })}>
              {['auto', 'euc-kr', 'shift_jis', 'gbk', 'big5', 'utf-8', 'windows-1252'].map((enc) => <option key={enc} value={enc}>{t(`encoding.${enc}`)}</option>)}
            </select>
          </span>
        )}
        <ResizeGrip />
      </footer>

      {dragging && <div className="drop-veil" data-testid="drop-veil">{t('welcome.dropHere')}</div>}
      <ContextMenu open={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} items={menu?.items ?? []} onClose={() => setMenu(null)} />
      <Tooltip />
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((l) => l.filter((x) => x.id !== id))} />

      {renderDialog()}
      {job && (
        <ProgressDialog
          title={t(`progress.${job.op}`)}
          done={job.done}
          total={job.total}
          name={job.name}
          cancelling={job.cancelling}
          onCancel={() => {
            setJob((j) => (j ? { ...j, cancelling: true } : j));
            job.cancel();
          }}
        />
      )}
    </div>
  );

  function onWebPicked(e) {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const then = webPick.current;
    if (then) {
      webPick.current = null;
      then(stageWebFiles(files));
      return;
    }
    receiveWebFiles(files);
  }

  function renderDialog() {
    if (!dialog) return null;
    const close = () => setDialog(null);
    switch (dialog.type) {
      case 'customTheme':
        return <CustomThemeDialog initial={dialog.initial} onChange={applyCustomTheme} onSave={dialog.onSave} onCancel={dialog.onCancel} />;
      case 'error':
        return <ErrorDialog code={dialog.code} detail={dialog.detail} stack={dialog.stack} onClose={close} />;
      case 'password':
        return <PasswordDialog wrong={dialog.wrong} onSubmit={dialog.onSubmit} onCancel={dialog.onCancel} />;
      case 'confirm':
        return <ConfirmDialog title={dialog.title} body={dialog.body} danger={dialog.danger} onYes={dialog.onYes} onNo={dialog.onNo} />;
      case 'prompt':
        return <PromptDialog title={dialog.title} label={dialog.label} initial={dialog.initial} onSubmit={dialog.onSubmit} onCancel={close} />;
      case 'create':
        return (
          <CreateDialog
            initial={dialog.initial}
            mode={dialog.mode}
            canSfx={isDesktop && !!appInfo?.sfx}
            windows={appInfo?.platform === 'windows'}
            onCancel={close}
            onAddWebFiles={pickWeb}
            onSubmit={(form, options) => (dialog.mode === 'convert' ? submitConvert(dialog.source, form, options) : submitCreate(form, options))}
          />
        );
      case 'createResult':
        return <CreateResult report={dialog.report} title={dialog.title} onClose={close} onOpen={(p) => { close(); openArchive(p); }} onReveal={reveal} />;
      case 'extract':
        return <ExtractDialog initial={dialog.initial} selectionCount={dialog.selectionCount} archiveCount={dialog.paths.length} onCancel={close} onSubmit={(form) => runExtract(dialog.paths, form, archive?.password)} />;
      case 'conflict':
        return <ConflictDialog names={dialog.names} onChoose={dialog.onChoose} onCancel={dialog.onCancel} />;
      case 'extractResult':
        return <ExtractResult report={dialog.report} onClose={close} onReveal={reveal} onDownloadZip={() => downloadExtractedAsZip(dialog.report)} onSaveFolder={() => saveExtractedToFolder(dialog.report)} />;
      case 'testResult':
        return <TestResult report={dialog.report} onClose={close} />;
      case 'repairResult':
        return <RepairResult report={dialog.report} onClose={close} onOpen={(p) => { close(); openArchive(p); }} />;
      case 'info':
        return <InfoDialog info={archive.info} onClose={close} onSaveComment={(comment) => modify({ comment }, t('toast.commentSaved'))} />;
      case 'preview':
        return (
          <PreviewDialog
            archive={archive.info.path}
            password={archive.password}
            encoding={archive.encoding}
            entry={dialog.entry}
            onClose={close}
            onOpenExternal={() => openExternal(dialog.entry)}
            onError={async (e) => {
              if (e.code === 'password_required' || e.code === 'wrong_password') {
                const entry = dialog.entry;
                const answer = await askPassword(e.code === 'wrong_password');
                if (answer) {
                  setArchive((a) => ({ ...a, password: answer }));
                  setDialog({ type: 'preview', entry });
                }
                return;
              }
              close();
              showError(e);
            }}
          />
        );
      case 'hash':
        return <HashDialog initial={dialog.initial} onRun={hashFiles} onAddWeb={pickWeb} onClose={close} onCopied={() => toast('success', t('toast.copied'))} />;
      case 'split':
        return <SplitDialog onRun={splitFile} onPickWeb={(then) => pickWeb('files', then)} onClose={close} />;
      case 'splitResult':
        return <SplitResult files={dialog.files} onClose={close} onReveal={reveal} />;
      case 'join':
        return <JoinDialog onRun={joinFiles} onPickWeb={(then) => pickWeb('files', then)} onClose={close} />;
      case 'benchmark':
        return <BenchmarkDialog onRun={benchmark} onClose={close} />;
      default:
        return null;
    }
  }
}

// Reads a drop, walking into folders where the browser lets us.
async function droppedFiles(dataTransfer) {
  const entries = [...(dataTransfer.items ?? [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...(dataTransfer.files ?? [])];
  const out = [];
  const walk = async (entry, prefix) => {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      if (prefix) Object.defineProperty(file, 'webkitRelativePath', { value: `${prefix}/${file.name}` });
      out.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      for (;;) {
        const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const child of batch) await walk(child, path);
      }
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
}

export { DEFAULT_SETTINGS };
