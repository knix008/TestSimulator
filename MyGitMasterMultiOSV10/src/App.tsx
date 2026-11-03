import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import appIcon from "./appIcon";
import type { PrefsTab } from "./settings/types";
import { ApiError, api, type CommitDetail, type CommitInfo, type FileEntry, type ReleaseInfo, type RepoInfo, type Settings, type TreeResponse, type WorkState } from "./api";
import { CommitHistory } from "./CommitHistory";
import { DiffView } from "./DiffView";
import { openToolWindow } from "./toolLaunch";
import { translate, type Lang } from "./i18n";
import { publishAppearance } from "../core/appearance";
import { usesBuiltinMerge } from "../core/mergeTool";
import { applyTheme, nextThemeId, setCustomThemes, themeById, type CustomTheme } from "../core/themes";
import { GitToolbar, rowWidth } from "./GitToolbar";
import { beginProgress, setProgressDetail, useProgress } from "./progress";
import { Flag, Icon, MenuGlyph, type IconName } from "./icons";
import { TerminalPanes, TerminalTabStrip } from "./TerminalTabs";
import { buildHistoryReport } from "./exportReport";
import type { Report } from "../core/report";
import packageJson from "../package.json";
import { anchorFor, anchorForPoint, closeDialog, closeMenu, isDialogOpen, onSettingsPublished, openDialog, openGuide, openMenu, publishSettings, updateDialog } from "./host";
import { chosenTheme, openActionMenu, THEME_MENU_SETTINGS, type ActionItem } from "./menuPopup";
import { dialogPayload, type AppDialogResult, type Creds, type DialogState } from "./dialogs/AppDialogs";
import { StartPage } from "./StartPage";
import { startPrefs } from "./startControls";
import { applyStartupChoice, hideStartScreen, showStartScreen, toggleStartScreen, useStartScreen } from "./startScreen";
import { startTutorial, TutorialTour } from "./TutorialTour";
import { TutorialWelcome } from "./TutorialWelcome";

type MenuItem = { label: string; icon: IconName; disabled?: boolean; shortcut?: string; action: () => void };

const emptyTree: TreeResponse = { local: [], remotes: [], tags: [], writable: false };

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [work, setWork] = useState<WorkState | null>(null);
  const [gitOk, setGitOk] = useState(true);
  const [tree, setTree] = useState<TreeResponse>(emptyTree);
  const [releases, setReleases] = useState<ReleaseInfo[]>([]);
  const [rootFiles, setRootFiles] = useState<FileEntry[]>([]);
  const [children, setChildren] = useState<Record<string, FileEntry[]>>({});
  const [expanded, setExpanded] = useState<string[]>([]);
  const [drives, setDrives] = useState<{ label: string; path: string }[]>([]);
  const [fsRoot, setFsRoot] = useState<string | null>(null);
  const [fsFiles, setFsFiles] = useState<FileEntry[]>([]);
  const [fsChildren, setFsChildren] = useState<Record<string, FileEntry[]>>({});
  const [fsExpanded, setFsExpanded] = useState<string[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [pathFilter, setPathFilter] = useState("");
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [flat, setFlat] = useState(false);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [diffFile, setDiffFile] = useState<string | null>(null);
  const [diffText, setDiffText] = useState("");
  const [wrap, setWrap] = useState(true);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [rail, setRail] = useState<null | "theme">(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [showBottom, setShowBottom] = useState(true);
  const [maximized, setMaximized] = useState(false);
  const [bottomTab, setBottomTab] = useState<"log" | "terminal">("log");
  const [logs, setLogs] = useState<{ id: number; time: string; level: "info" | "error"; text: string }[]>([]);
  const generation = useRef(0);
  const filterRef = useRef("");
  const expandedRef = useRef<string[]>([]);
  const busyRef = useRef(false);
  const logSeq = useRef(0);
  const logBox = useRef<HTMLDivElement>(null);
  const seenProgress = useRef<string | null>(null);
  const prefsChain = useRef(Promise.resolve());
  const menubarRef = useRef<HTMLDivElement>(null);
  const naturalWidths = useRef({ toolbar: 0, menubar: 0 });
  const minWidthTimer = useRef<number | null>(null);
  const sentMinWidth = useRef(0);
  const prefsGen = useRef(0);
  filterRef.current = pathFilter;
  expandedRef.current = expanded;
  busyRef.current = busy;

  const lang: Lang = settings?.language ?? "ko";
  const t = useCallback((key: string) => translate(lang, key), [lang]);
  // The start screen (StartPage.tsx): shown with no repository open, at startup when
  // Preferences › Start screen says so, and whenever the menu bar's Start button asks.
  const startShowOnStartup = startPrefs(settings).showOnStartup;
  const settingsLoaded = settings !== null;
  const onStart = useStartScreen(Boolean(repo), settingsLoaded && startShowOnStartup);
  useEffect(() => {
    if (settingsLoaded) applyStartupChoice(startShowOnStartup);
    // Once per launch, as soon as the saved settings are known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded]);
  // Opening another repository puts the workspace in front.
  const shownRepo = useRef<string | null | undefined>(undefined);
  const repoPath = repo?.path ?? null;
  useEffect(() => {
    if (!settingsLoaded) return;
    if (shownRepo.current !== undefined && repoPath && repoPath !== shownRepo.current) hideStartScreen();
    shownRepo.current = repoPath;
  }, [repoPath, settingsLoaded]);
  const writable = Boolean(repo && !repo.remoteView && !repo.bare);
  const appendLog = useCallback((text: string, level: "info" | "error" = "info") => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const time = new Date().toLocaleTimeString("sv-SE", { hour12: false });
    setLogs((current) => {
      const next = [...current, { id: logSeq.current += 1, time, level, text: trimmed }];
      return next.length > 500 ? next.slice(next.length - 500) : next;
    });
  }, []);

  useEffect(() => {
    const box = logBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [logs, showBottom]);

  useEffect(() => {
    const controls = window.mgm?.window;
    if (!controls) return;
    void controls.isMaximized().then(setMaximized);
    return controls.onMaximized(setMaximized);
  }, []);

  useEffect(() => {
    if (!menu && !rail) return;
    const close = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".menu, .tool-pop, .context")) return;
      setMenu(null);
      setRail(null);
    };
    window.addEventListener("mousedown", close, true);
    return () => window.removeEventListener("mousedown", close, true);
  }, [menu, rail]);

  // The menu row's natural width (its labels change with the language).
  useEffect(() => {
    const bar = menubarRef.current;
    if (!bar || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const width = rowWidth(bar);
      if (width === naturalWidths.current.menubar) return;
      naturalWidths.current.menubar = width;
      reportMinimumWidth();
    };
    const observer = new ResizeObserver(update);
    for (const child of Array.from(bar.children)) observer.observe(child);
    update();
    return () => observer.disconnect();
  }, [lang, Boolean(settings)]);

  const customThemes = settings?.customThemes as CustomTheme[] | undefined;
  useEffect(() => {
    // The user's themes first: the current theme may be one of them.
    setCustomThemes(customThemes);
    if (customThemes) publishAppearance({ customThemes });
    if (settings?.theme) applyTheme(settings.theme);
  }, [settings?.theme, customThemes]);

  const fail = useCallback((error: unknown) => {
    const report = describeError(error);
    setDialog({ type: "error", message: report.message, detail: report.detail });
    setStatus(report.message);
    appendLog(report.detail && report.detail !== report.message ? `${report.message}\n${report.detail}` : report.message, "error");
  }, [appendLog]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => fail(event.error ?? event.message);
    const onReject = (event: PromiseRejectionEvent) => fail(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onReject);
    };
  }, [fail]);

  const reload = useCallback(async (filter = filterRef.current) => {
    const [nextTree, files, history] = await Promise.all([
      api.tree(),
      api.files(""),
      api.log(filter),
    ]);
    const nested: Record<string, FileEntry[]> = {};
    await Promise.all(expandedRef.current.map(async (folder) => {
      nested[folder] = (await api.files(folder)).entries;
    }));
    setTree(nextTree);
    setRootFiles(files.entries);
    setChildren(nested);
    setCommits(history.commits);
    setFlat(history.flat);
    const tick = await api.tick();
    setRepo(tick.repo);
    setWork(tick.work);
    api.releases().then((result) => setReleases(result.releases)).catch(() => setReleases([]));
  }, []);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const boot = await api.bootstrap();
        if (stop) return;
        applyTheme(boot.settings.theme);
        setSettings(boot.settings);
        setRepo(boot.repo);
        setGitOk(boot.git);
        const tick = await api.tick();
        generation.current = tick.generation;
        if (boot.repo) {
          await reload("");
          appendLog(boot.repo.path);
        }
        const listed = await api.drives();
        if (!stop) setDrives(listed.drives);
      } catch (error) {
        if (!stop) fail(error);
      }
    })();
    const timer = window.setInterval(async () => {
      try {
        const tick = await api.tick();
        setProgress((current) => current === tick.progress ? current : tick.progress);
        setProgressDetail(tick.progress);
        if (tick.progress && tick.progress !== seenProgress.current) appendLog(tick.progress);
        seenProgress.current = tick.progress;
        if (tick.repo) setRepo((current) => sameRepo(current, tick.repo) ? current : tick.repo);
        setWork((current) => sameWork(current, tick.work) ? current : tick.work);
        if (tick.generation !== generation.current) {
          generation.current = tick.generation;
          if (!busyRef.current && tick.repo) await reload(filterRef.current);
        }
      } catch {
        /* server may be restarting */
      }
    }, 2000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [appendLog, fail, reload]);

  const showInAppDiff = useCallback((sha: string, file: string) => {
    setDiffFile(file);
    api.diff(sha, file).then((result) => setDiffText(result.text)).catch(fail);
  }, [fail]);

  const openBuiltinDiff = useCallback((sha: string, file: string) => {
    setDiffFile(file);
    api.diff(sha, file).then((result) => setDiffText(result.text)).catch(fail);
    if (!openToolWindow({ kind: "diff", sha, file })) fail(new Error(t("toolWindowBlocked")));
  }, [fail, t]);

  const openBuiltinMerge = useCallback((file: string) => {
    if (!openToolWindow({ kind: "merge", file })) fail(new Error(t("toolWindowBlocked")));
  }, [fail, t]);

  const openExternalDiff = useCallback((sha: string, file: string) => {
    setDiffFile(file);
    api.diff(sha, file).then((result) => setDiffText(result.text)).catch(fail);
    void api.externalDiff(sha, file, true).catch(fail);
  }, [fail]);

  const openExternalMerge = useCallback((file: string) => {
    void api.externalMerge(file).catch(fail);
  }, [fail]);

  const builtinMergeDefault = usesBuiltinMerge(settings?.externalMergeToolPath);

  const openMergeTool = useCallback((file: string) => {
    if (usesBuiltinMerge(settings?.externalMergeToolPath)) openBuiltinMerge(file);
    else openExternalMerge(file);
  }, [settings?.externalMergeToolPath, openBuiltinMerge, openExternalMerge]);

  useEffect(() => {
    if (!selectedSha) {
      setDetail(null);
      setDiffText("");
      return;
    }
    let stop = false;
    api.commit(selectedSha).then((next) => {
      if (stop) return;
      setDetail(next);
      setRelease(null);
      const first = next.files[0]?.path ?? null;
      if (first) showInAppDiff(selectedSha, first);
      else {
        setDiffFile(null);
        setDiffText("");
      }
    }).catch(fail);
    return () => { stop = true; };
  }, [selectedSha, fail, showInAppDiff]);

  const run = useCallback(async (label: string, action: () => Promise<string | void>, icon?: IconName) => {
    const endProgress = beginProgress(label, icon ?? progressIconOf(label, t));
    setBusy(true);
    setStatus(label);
    appendLog(label);
    try {
      const message = await action();
      const tick = await api.tick();
      generation.current = tick.generation;
      if (tick.repo) await reload(filterRef.current);
      setStatus(message || label);
      if (message && message !== label) appendLog(message);
    } catch (error) {
      if (!(error instanceof ApiError && error.code === "AUTH_REQUIRED")) fail(error);
      else fail(error);
    } finally {
      endProgress();
      setBusy(false);
    }
  }, [appendLog, fail, reload, t]);

  const ask = useCallback(<T,>(next: DialogState & { resolve: (value: T) => void }) => {
    return new Promise<T>((resolve) => {
      setDialog({ ...next, resolve } as DialogState);
    });
  }, []);

  const authed = useCallback(async <T,>(action: (creds?: Creds) => Promise<T>): Promise<T> => {
    try {
      return await action();
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== "AUTH_REQUIRED") throw error;
      const creds = await ask<Creds | null>({
        type: "auth",
        username: settings?.gitUsername ?? "",
        password: "",
        remember: true,
        resolve: () => undefined,
      });
      if (!creds) throw error;
      const saved = await api.saveCredentials(creds.username, creds.password, creds.remember !== false);
      setSettings(saved);
      return action(creds);
    }
  }, [ask, settings?.gitUsername]);

  const chooseDir = useCallback(async (save = false) => {
    if (!window.mgm) return null;
    return save ? window.mgm.pickSaveDirectory() : window.mgm.pickDirectory();
  }, []);

  const refresh = useCallback(() => {
    appendLog(t("refresh"));
    return reload().catch(fail);
  }, [appendLog, fail, reload, t]);

  const openPath = useCallback(async (target: string) => {
    await run(t("open"), async () => {
      const opened = await api.open(target);
      setRepo(opened.repo);
      setPathFilter("");
      setSelectedSha(null);
      setExpanded([]);
      filterRef.current = "";
      expandedRef.current = [];
      setFsRoot(null);
      return opened.repo.path;
    });
  }, [run, t]);

  const showDirectory = useCallback(async (target: string) => {
    const listed = await api.listDir(target);
    setFsRoot(listed.path);
    setFsFiles(listed.entries.map(asBrowseEntry));
    setFsChildren({});
    setFsExpanded([]);
    setSelectedPath(null);
    setStatus(listed.path);
    appendLog(listed.path);
  }, [appendLog]);

  const openOrBrowse = useCallback(async (target: string) => {
    const endProgress = beginProgress(t("open"), "open");
    try {
      const opened = await api.open(target).finally(endProgress);
      setRepo(opened.repo);
      setFsRoot(null);
      setPathFilter("");
      setSelectedSha(null);
      setExpanded([]);
      filterRef.current = "";
      expandedRef.current = [];
      const tick = await api.tick();
      generation.current = tick.generation;
      await reload("");
      setStatus(opened.repo.path);
      appendLog(opened.repo.path);
    } catch (error) {
      if (error instanceof ApiError && error.code === "NOT_A_REPO") {
        try {
          await showDirectory(target);
        } catch (listError) {
          fail(listError);
        }
        return;
      }
      fail(error);
    }
  }, [appendLog, fail, reload, showDirectory]);

  const openFolder = useCallback(async () => {
    const picked = await chooseDir(false);
    if (picked) {
      await openOrBrowse(picked);
      return;
    }
    if (!window.mgm) setDialog({ type: "open", path: "" });
  }, [chooseDir, openOrBrowse]);

  const onOpen = useCallback(async () => {
    setMenu(null);
    const picked = await chooseDir(false);
    if (picked) {
      await openPath(picked);
      return;
    }
    if (!window.mgm) setDialog({ type: "open", path: "" });
  }, [chooseDir, openPath]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o" && !event.shiftKey) {
        event.preventDefault();
        void onOpen();
      } else if (event.key === "F1" && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        openGuide();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);

  const requireWritable = useCallback(() => {
    if (writable) return true;
    setDialog({ type: "error", message: t("writableOnly"), detail: t("writableOnly") });
    return false;
  }, [t, writable]);

  const doAdd = useCallback(async (paths: string[]) => {
    if (!requireWritable()) return;
    const preview = await api.addPreview(paths);
    const ok = await ask<boolean>({
      type: "confirm",
      title: t("gitAdd"),
      message: preview.paths.length ? preview.paths.join("\n") : t("empty"),
      resolve: () => undefined,
    });
    if (!ok) return;
    await run(t("gitAdd"), async () => (await api.add(paths)).message);
  }, [ask, requireWritable, run, t]);

  const doCommit = useCallback(async () => {
    if (!requireWritable()) return;
    setMenu(null);
    setDialog({ type: "commit", category: settings?.commitCategories[0] ?? "", subject: "", body: "" });
  }, [requireWritable, settings?.commitCategories]);

  /** A right-click menu: its own window at the pointer, which may extend past the app. */
  const showContext = (event: ReactMouseEvent, items: MenuItem[]) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu(null);
    setRail(null);
    void openActionMenu(items, anchorForPoint(event.clientX, event.clientY)).then((chosen) => chosen?.());
  };

  const visibleFiles = useMemo(
    () => fsRoot ? flatten(fsFiles, fsExpanded, fsChildren) : flatten(rootFiles, expanded, children),
    [fsRoot, fsFiles, fsExpanded, fsChildren, rootFiles, expanded, children],
  );

  const mergeTarget = useMemo(() => {
    if (fsRoot) return null;
    const conflicts = visibleFiles.filter((item) => !item.entry.directory && isConflict(item.entry));
    if (!conflicts.length) return null;
    const picked = selectedPath ? conflicts.find((item) => item.entry.path === selectedPath) : null;
    return (picked ?? conflicts[0]).entry.path;
  }, [fsRoot, selectedPath, visibleFiles]);

  async function toggleDir(entry: FileEntry) {
    if (!entry.directory) {
      setSelectedPath(entry.path);
      return;
    }
    setSelectedPath(entry.path);
    if (fsRoot) {
      if (fsExpanded.includes(entry.path)) {
        setFsExpanded(fsExpanded.filter((item) => item !== entry.path));
        return;
      }
      if (!fsChildren[entry.path]) {
        const listed = await api.listDir(entry.path);
        setFsChildren((current) => ({ ...current, [entry.path]: listed.entries.map(asBrowseEntry) }));
      }
      setFsExpanded((current) => [...current, entry.path]);
      return;
    }
    if (expanded.includes(entry.path)) {
      setExpanded(expanded.filter((item) => item !== entry.path));
      return;
    }
    if (!children[entry.path]) {
      const listed = await api.files(entry.path);
      setChildren((current) => ({ ...current, [entry.path]: listed.entries }));
    }
    setExpanded((current) => [...current, entry.path]);
  }

  function applyPrefs(patch: Partial<Settings>) {
    const ticket = ++prefsGen.current;
    if (patch.language === "ko" || patch.language === "en") publishAppearance({ language: patch.language });
    setSettings((current) => current ? { ...current, ...patch } : current);
    prefsChain.current = prefsChain.current.catch(() => undefined).then(async () => {
      const saved = await api.saveSettings(patch);
      publishSettings(saved);
      if (ticket === prefsGen.current) setSettings(saved);
    }).catch((error) => {
      if (ticket === prefsGen.current) fail(error);
    });
  }

  function chooseLanguage(language: Lang) {
    applyPrefs({ language });
    setRail(null);
  }

  function chooseTheme(theme: string) {
    applyTheme(theme);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => applyPrefs({ theme }));
    });
  }

  function cycleTheme() {
    const shown = document.documentElement.dataset.theme || settings?.theme;
    chooseTheme(nextThemeId(shown));
    if (rail) setRail(null);
  }

  /** The window may not get narrower than the menu row or the toolbar row need. */
  // Reported once the value settles (fonts, language, buttons), and only when it changed;
  // the value is intrinsic, so resizing, maximizing or restoring the window never moves it.
  function reportMinimumWidth() {
    if (minWidthTimer.current != null) window.clearTimeout(minWidthTimer.current);
    minWidthTimer.current = window.setTimeout(sendMinimumWidth, 120);
  }

  function sendMinimumWidth() {
    minWidthTimer.current = null;
    const width = Math.max(naturalWidths.current.toolbar, naturalWidths.current.menubar);
    if (width <= 0 || width === sentMinWidth.current) return;
    if (document.hidden) {
      document.addEventListener("visibilitychange", reportMinimumWidth, { once: true });
      return;
    }
    sentMinWidth.current = width;
    // Also on the page, for the smoke tests and for the stylesheet's own minimum.
    document.documentElement.dataset.minWidth = String(width);
    if (window.mgm) document.documentElement.style.setProperty("--app-min-width", `${width}px`);
    void window.mgm?.setMinimumSize?.(width, 640)?.catch(() => undefined);
  }

  /*
   * Every dialog is a popup (src/dialogs/AppDialogs.tsx): an OS window of its own on the
   * desktop, an in-page modal in the browser. `dialog` is the one that is open; this
   * opens it, and routes its answer back to whoever asked (ask() callers still get their
   * value, forms still go through submitDialog).
   */
  const openedDialog = useRef<DialogState | null>(null);
  const dialogResult = useRef<(current: DialogState, result: AppDialogResult | null) => void>(() => undefined);
  dialogResult.current = (current, result) => {
    if (current.type === "auth") return current.resolve(result?.kind === "value" ? result.value as Creds : null);
    if (current.type === "confirm") return current.resolve(result?.kind === "value" && result.value === true);
    if (current.type === "prompt") return current.resolve(result?.kind === "value" && typeof result.value === "string" ? result.value : null);
    if (result?.kind === "categories") setDialog({ type: "categories", text: settings?.commitCategories.join("\n") ?? "" });
    else if (result?.kind === "submit") void submitDialog(result.dialog as DialogState);
  };
  useEffect(() => {
    // StrictMode runs this twice for one state; the second run has nothing to do.
    if (dialog === openedDialog.current) return;
    const previous = openedDialog.current;
    openedDialog.current = dialog;
    if (previous) {
      // Replaced or cleared before it answered: its window goes, its caller hears "no".
      if (!dialog || previous.type !== dialog.type) closeDialog(previous.type);
      dialogResult.current(previous, null);
    }
    if (!dialog) return;
    const current = dialog;
    void openDialog<AppDialogResult>(current.type, dialogPayload(current)).then((result) => {
      if (openedDialog.current !== current) return;
      openedDialog.current = null;
      setDialog((now) => (now === current ? null : now));
      dialogResult.current(current, result);
    });
  }, [dialog]);

  // Settings changed in another window (Preferences) — follow them here.
  useEffect(() => onSettingsPublished((saved) => {
    setCustomThemes(saved.customThemes as CustomTheme[] | undefined);
    setSettings(saved);
    publishAppearance({ language: saved.language });
  }), []);

  // The theme drop-down (▾ beside the theme button) is a menu window sized to its content.
  const themeCaret = useRef<HTMLButtonElement>(null);
  const themeWasOpen = useRef(false);
  const themeAnswer = useRef<(answer: string | null) => void>(() => undefined);
  themeAnswer.current = (answer) => {
    setRail((current) => (current === "theme" ? null : current));
    const theme = chosenTheme(answer);
    if (theme) chooseTheme(theme);
    else if (answer === THEME_MENU_SETTINGS) openPrefs("theme");
  };
  useEffect(() => {
    if (rail !== "theme" || !themeCaret.current) return;
    let live = true;
    void openMenu("theme", null, anchorFor(themeCaret.current)).then((answer) => {
      if (live) themeAnswer.current(answer);
    });
    return () => {
      live = false;
      closeMenu();
    };
  }, [rail]);

  function openPrefs(tab?: PrefsTab) {
    setMenu(null);
    setRail(null);
    setDialog({
      type: "prefs",
      tab,
      language: settings?.language ?? "ko",
      theme: settings?.theme ?? "light-classic",
      tool: settings?.externalDiffToolPath ?? "",
      args: settings?.externalDiffToolArguments || "\"{left}\" \"{right}\"",
      mergeTool: settings?.externalMergeToolPath ?? "",
      mergeArgs: settings?.externalMergeToolArguments || "\"{base}\" \"{local}\" \"{remote}\" \"{merged}\"",
      shell: settings?.terminalShell ?? "",
    });
  }

  return (
    <div className="app" onClick={() => { setMenu(null); setRail(null); }}>
      {!gitOk && <div className="banner">{t("gitMissing")}</div>}
      <div className="menubar" ref={menubarRef} onClick={(event) => event.stopPropagation()}>
        <div className="app-title">
          <img src={appIcon} alt="" />
          <strong>My Git Master</strong>
          <span>{packageJson.version}</span>
          <button
            type="button"
            className={onStart ? "start-toggle active" : "start-toggle"}
            aria-pressed={onStart}
            data-start-toggle=""
            title={t("startButtonTip")}
            onClick={(event) => {
              event.stopPropagation();
              setMenu(null);
              setRail(null);
              toggleStartScreen(Boolean(repo), settingsLoaded && startShowOnStartup);
            }}
          >
            <Icon name="home" />
            <span>{t("startButton")}</span>
          </button>
        </div>
        <Menu icon="folder" label={t("file")} open={menu === "file"} onOpen={() => { setRail(null); setMenu(menu === "file" ? null : "file"); }} onDismiss={() => setMenu((current) => current === "file" ? null : current)} items={[
          { icon: "open", label: t("open"), shortcut: "Ctrl+O", action: () => void onOpen() },
          { icon: "clone", label: t("clone"), action: () => setDialog({ type: "clone", url: "", destination: "", username: settings?.gitUsername ?? "", password: "" }) },
          { icon: "browse", label: t("browse"), action: () => setDialog({ type: "browse", url: "", username: settings?.gitUsername ?? "", password: "" }) },
          { icon: "print", label: t("printFile"), disabled: !repo, action: () => void openPrint() },
          { icon: "prefs", label: t("preferences"), action: () => openPrefs() },
        ]} extra={settings?.recentRepositoryPaths ?? []} onRecent={(target) => void openPath(target)} onRemoveRecent={(target) => void api.deleteRecentRepo(target).then(setSettings).catch(fail)} onClearRecent={() => void api.clearRecentRepos().then(setSettings).catch(fail)} recentLabel={t("recent")} removeRecentLabel={t("removeRecent")} clearRecentLabel={t("clearRecent")} />
        <Menu icon="branch" label={t("repository")} open={menu === "repository"} onOpen={() => { setRail(null); setMenu(menu === "repository" ? null : "repository"); }} onDismiss={() => setMenu((current) => current === "repository" ? null : current)} items={[
          { icon: "refresh", label: t("refresh"), disabled: !repo, action: () => void refresh() },
          { icon: "plus", label: t("gitAdd"), disabled: !writable, action: () => void doAdd(selectedPath ? [selectedPath] : []) },
          { icon: "undo", label: t("gitReset"), disabled: !writable, action: () => void run(t("gitReset"), async () => (await api.unstage(selectedPath ? [selectedPath] : [])).message) },
          { icon: "discard", label: t("discard"), disabled: !writable, action: () => void discard(selectedPath ? [selectedPath] : []) },
          { icon: "commit", label: t("gitCommit"), disabled: !writable, action: () => void doCommit() },
          { icon: "merge", label: t("resolveConflict"), disabled: !writable || !mergeTarget, action: () => { if (mergeTarget) openMergeTool(mergeTarget); } },
          { icon: "fetch", label: t("gitFetch"), disabled: !repo, action: () => void run(t("gitFetch"), () => authed((creds) => api.fetch(creds)).then((r) => r.message)) },
          { icon: "pull", label: t("gitPull"), disabled: !writable, action: () => void run(t("gitPull"), () => authed((creds) => api.pull(creds)).then((r) => r.message)) },
          { icon: "push", label: t("gitPush"), disabled: !writable, action: () => void run(t("gitPush"), () => authed((creds) => api.push(creds)).then((r) => r.message)) },
          { icon: "stash", label: t("gitStash"), disabled: !writable, action: () => void run(t("gitStash"), async () => (await api.stash()).message) },
          { icon: "stashPop", label: t("gitStashPop"), disabled: !writable, action: () => void run(t("gitStashPop"), async () => (await api.stashPop()).message) },
          { icon: "status", label: t("gitStatus"), disabled: !repo, action: () => void api.gitStatus().then((result) => setDialog({ type: "text", title: t("statusTitle"), text: result.text, save: true })).catch(fail) },
        ]} />
        <Menu icon="history" label={t("history")} open={menu === "history"} onOpen={() => { setRail(null); setMenu(menu === "history" ? null : "history"); }} onDismiss={() => setMenu((current) => current === "history" ? null : current)} items={[
          { icon: "list", label: t("showAll"), disabled: !repo, action: () => { setPathFilter(""); filterRef.current = ""; void reload(""); } },
          { icon: "print", label: t("exportSummary"), disabled: !repo, action: () => void showHistoryReport() },
          { icon: "snapshot", label: t("exportCommit"), disabled: !selectedSha, action: () => void exportSnapshot() },
        ]} />
        <Menu icon="help" label={t("help")} open={menu === "help"} onOpen={() => { setRail(null); setMenu(menu === "help" ? null : "help"); }} onDismiss={() => setMenu((current) => current === "help" ? null : current)} items={[
          { icon: "book", label: t("userGuide"), shortcut: "F1", action: () => { setMenu(null); openGuide(); } },
          { icon: "tutorial", label: t("tutorialMenu"), action: () => startTutorial() },
          { icon: "help", label: t("about"), action: () => setDialog({ type: "about" }) },
        ]} />
        {window.mgm?.window && (
          <div className="window-controls">
            <button type="button" aria-label={t("minimize")} title={t("minimize")} onClick={() => void window.mgm?.window?.minimize()}>
              <WindowGlyph kind="minimize" />
            </button>
            <button type="button" aria-label={maximized ? t("restore") : t("maximize")} title={maximized ? t("restore") : t("maximize")} onClick={() => void window.mgm?.window?.toggleMaximize().then(setMaximized)}>
              <WindowGlyph kind={maximized ? "restore" : "maximize"} />
            </button>
            <button type="button" className="close" aria-label={t("close")} title={t("close")} onClick={() => void window.mgm?.window?.close()}>
              <WindowGlyph kind="close" />
            </button>
          </div>
        )}
      </div>
      <div className="toolbar" onClick={(event) => event.stopPropagation()}>
        <GitToolbar moreLabel={t("toolbarMore")} overflow={!window.mgm} onNaturalWidth={(width) => { naturalWidths.current.toolbar = width; reportMinimumWidth(); }} commands={[
          { id: "open", group: "repo", icon: "open", label: t("open"), onClick: () => void onOpen() },
          { id: "clone", group: "repo", icon: "clone", label: t("clone"), onClick: () => setDialog({ type: "clone", url: "", destination: "", username: settings?.gitUsername ?? "", password: "" }) },
          { id: "browse", group: "repo", icon: "browse", label: t("browse"), onClick: () => setDialog({ type: "browse", url: "", username: settings?.gitUsername ?? "", password: "" }) },
          { id: "refresh", group: "repo", icon: "refresh", label: t("refresh"), disabled: !repo || busy, onClick: () => void refresh() },
          { id: "add", group: "work", icon: "plus", label: t("gitAdd"), disabled: !writable || busy, onClick: () => void doAdd(selectedPath ? [selectedPath] : []) },
          { id: "reset", group: "work", icon: "undo", label: t("gitReset"), disabled: !writable || busy, onClick: () => void run(t("gitReset"), async () => (await api.unstage(selectedPath ? [selectedPath] : [])).message) },
          { id: "discard", group: "work", icon: "discard", label: t("discard"), disabled: !writable || busy, onClick: () => void discard(selectedPath ? [selectedPath] : []) },
          { id: "commit", group: "work", icon: "commit", label: t("gitCommit"), disabled: !writable || busy, onClick: () => void doCommit() },
          { id: "resolve", group: "work", icon: "merge", label: t("resolveConflict"), disabled: !writable || !mergeTarget || busy, onClick: () => { if (mergeTarget) openMergeTool(mergeTarget); } },
          { id: "fetch", group: "remote", icon: "fetch", label: t("gitFetch"), disabled: !repo || busy, onClick: () => void run(t("gitFetch"), () => authed((creds) => api.fetch(creds)).then((r) => r.message)) },
          { id: "pull", group: "remote", icon: "pull", label: t("gitPull"), disabled: !writable || busy, onClick: () => void run(t("gitPull"), () => authed((creds) => api.pull(creds)).then((r) => r.message)) },
          { id: "push", group: "remote", icon: "push", label: t("gitPush"), disabled: !writable || busy, onClick: () => void run(t("gitPush"), () => authed((creds) => api.push(creds)).then((r) => r.message)) },
          { id: "stash", group: "stash", icon: "stash", label: t("gitStash"), disabled: !writable || busy, onClick: () => void run(t("gitStash"), async () => (await api.stash()).message) },
          { id: "stashPop", group: "stash", icon: "stashPop", label: t("gitStashPop"), disabled: !writable || busy, onClick: () => void run(t("gitStashPop"), async () => (await api.stashPop()).message) },
          { id: "status", group: "stash", icon: "status", label: t("gitStatus"), disabled: !repo, onClick: () => void api.gitStatus().then((result) => setDialog({ type: "text", title: t("statusTitle"), text: result.text, save: true })).catch(fail) },
          { id: "print", group: "output", icon: "print", label: t("printFile"), disabled: !repo || busy, onClick: () => void openPrint() },
          ...(busy ? [{ id: "stop", group: "output", icon: "stop" as const, label: t("stop"), onClick: () => void api.cancel() }] : []),
          { id: "panelLeft", group: "view", icon: "panelLeft", label: t("panelLeft"), pressed: showLeft, onClick: () => setShowLeft((open) => !open) },
          { id: "panelRight", group: "view", icon: "panelRight", label: t("panelRight"), pressed: showRight, onClick: () => setShowRight((open) => !open) },
          { id: "panelBottom", group: "view", icon: "panelBottom", label: t("panelBottom"), pressed: showBottom, onClick: () => setShowBottom((open) => !open) },
        ]} />
        <div className="toolbar-end">
          <div className="pop-host">
            <div className="split-tool">
              <ToolButton icon="theme" label={lang === "ko" ? themeById(settings?.theme).nameKo : themeById(settings?.theme).nameEn} onClick={cycleTheme} />
              <button ref={themeCaret} type="button" className={rail === "theme" ? "caret active" : "caret"} aria-expanded={rail === "theme"} aria-label={t("theme")} title={t("theme")} onPointerDown={() => { themeWasOpen.current = rail === "theme"; }} onClick={() => { setMenu(null); setRail(themeWasOpen.current ? null : "theme"); themeWasOpen.current = false; }}>
                <svg className="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 6.5 8 10.5 12 6.5" /></svg>
              </button>
            </div>
          </div>
          <ToolButton icon="language" flag={lang === "ko" ? "gb" : "kr"} label={lang === "ko" ? "English" : "한국어"} onClick={() => { setMenu(null); setRail(null); chooseLanguage(lang === "ko" ? "en" : "ko"); }} />
          <ToolButton icon="prefs" label={t("prefsTitle")} onClick={() => openPrefs()} />
          <ToolButton icon="help" label={t("about")} onClick={() => { setRail(null); setDialog({ type: "about" }); }} />
        </div>
      </div>
      {onStart && settings && (
        <StartPage
          settings={settings}
          lang={lang}
          t={t}
          version={packageJson.version}
          onPrefs={(patch) => applyPrefs(patch)}
          onOpen={() => void onOpen()}
          onOpenPath={(target) => {
            if (repo?.path === target) hideStartScreen();
            else void openPath(target);
          }}
          onClone={(url) => setDialog({ type: "clone", url: url ?? "", destination: "", username: settings?.gitUsername ?? "", password: "" })}
          onBrowse={(url) => setDialog({ type: "browse", url: url ?? "", username: settings?.gitUsername ?? "", password: "" })}
          onRemoveRecent={(target) => void api.deleteRecentRepo(target).then(setSettings).catch(fail)}
          onClearRecent={() => void api.clearRecentRepos().then(setSettings).catch(fail)}
          onRemoveUrl={(url) => void api.deleteRecentUrl(url).then(setSettings).catch(fail)}
          onTheme={(theme) => chooseTheme(theme)}
          onPreferences={(tab) => openPrefs(tab)}
          onTutorial={() => startTutorial()}
          onGuide={() => openGuide()}
          onOpenFolder={() => {
            hideStartScreen();
            void openFolder();
          }}
          onLanguage={() => chooseLanguage(lang === "ko" ? "en" : "ko")}
          onTerminal={() => {
            setShowBottom(true);
            setBottomTab("terminal");
            hideStartScreen();
          }}
          onAbout={() => setDialog({ type: "about" })}
          onExit={window.mgm?.window ? () => void window.mgm?.window?.close() : undefined}
        />
      )}
      <div className="workspace" style={{ display: onStart && settings ? "none" : undefined, gridTemplateRows: showBottom ? "minmax(0, 1fr) 6px var(--bottom)" : "minmax(0, 1fr)" }}>
        <div
          className="main-row"
          style={{ gridTemplateColumns: [showLeft ? "var(--left) 6px" : "", "minmax(0, 1fr)", showRight ? "6px var(--right)" : ""].filter(Boolean).join(" ") }}
        >
        {showLeft && (
        <div className="left-col panel">
          <section className="panel">
            <div className="section files-head">
              <i />
              {fsRoot && repo ? (
                <button type="button" className="linkish" title={t("repoFiles")} onClick={() => setFsRoot(null)}>{t("files")}</button>
              ) : (
                <span>{t("files")}{!fsRoot && pathFilter ? ` — ${pathFilter}` : ""}</span>
              )}
              {fsRoot && <span className="fs-path" title={fsRoot}>{fsRoot}</span>}
              <div className="drive-row">
                {drives.map((drive) => (
                  <button key={drive.path} type="button" className={driveActive(fsRoot, drive.path) ? "active" : ""} title={drive.path} onClick={() => void showDirectory(drive.path).catch(fail)}>
                    <Icon name="drive" />
                    {drive.label}
                  </button>
                ))}
                <button type="button" className="icon-only" aria-label={t("openFolder")} title={t("openFolder")} onClick={() => void openFolder()}>
                  <Icon name="folder" />
                </button>
              </div>
            </div>
            <div className="scroll">
              {visibleFiles.map(({ entry, depth, guides, first, last }) => {
                const open = (fsRoot ? fsExpanded : expanded).includes(entry.path);
                return (
                  <div
                    key={entry.path}
                    className={selectedPath === entry.path ? "file-row selected" : "file-row"}
                    onClick={() => void toggleDir(entry)}
                    onDoubleClick={() => {
                      if (entry.directory) return;
                      if (!fsRoot && isConflict(entry)) {
                        openBuiltinMerge(entry.path);
                        return;
                      }
                      void api.openPath(entry.path).catch(fail);
                    }}
                    onContextMenu={(event) => showContext(event, fsRoot ? browseMenu(entry) : fileMenu(entry))}
                    title={tooltip(entry, t)}
                  >
                    <span className="tree-guides" aria-hidden="true">
                      {guides.map((continues, level) => <i key={level} className={continues ? "bar" : ""} />)}
                      <i className={["joint", (depth > 0 || !first) ? "up" : "", !last ? "down" : "", depth > 0 ? "right" : ""].filter(Boolean).join(" ")} />
                    </span>
                    {open && <i className="stem" style={{ left: (depth + 1) * 16 + 9 }} />}
                    <span className="twist">{entry.directory ? (open ? "▾" : "▸") : "·"}</span>
                    <span className="name">{entry.name}</span>
                    {entry.badge && <b className="badge" style={{ color: entry.color }}>{entry.badge}</b>}
                  </div>
                );
              })}
            </div>
          </section>
          <div className="splitter h" onMouseDown={(event) => dragSize(event, "files")} />
          <section className="panel">
            <div className="section"><i /><span title={t("repository")}>{t("repository")}</span></div>
            <div className="scroll">
              {!repo && <div className="empty">{t("noRepo")}</div>}
              <BranchList title={t("localBranches")} items={tree.local.map((item) => ({ id: item.name, label: item.name, current: item.current, sha: item.sha }))} onContext={(event, item) => showContext(event, [
                { icon: "branch", label: t("checkout"), disabled: !writable || item.current, action: () => void run(t("checkout"), async () => (await api.checkout(item.label)).message) },
                { icon: "copy", label: t("copyName"), action: () => void navigator.clipboard.writeText(item.label) },
                { icon: "print", label: t("exportSummary"), action: () => void showHistoryReport() },
              ])} />
              {tree.remotes.map((group) => (
                <BranchList key={group.remote} title={`${t("remotes")} / ${group.remote}`} items={group.items.map((item) => ({ id: `${group.remote}/${item.name}`, label: item.name, sha: item.sha }))} onContext={(event, item) => showContext(event, [
                  { icon: "copy", label: t("copyName"), action: () => void navigator.clipboard.writeText(item.label) },
                ])} />
              ))}
              <BranchList title={t("tags")} items={tree.tags.map((item) => ({ id: item.name, label: item.name, sha: item.sha }))} onContext={(event, item) => showContext(event, [
                { icon: "copy", label: t("copyName"), action: () => void navigator.clipboard.writeText(item.label) },
                { icon: "hash", label: t("copySha"), action: () => void navigator.clipboard.writeText(item.sha) },
              ])} />
              <BranchList title={t("releases")} items={releases.map((item) => ({ id: item.tag, label: item.name, sha: item.tag }))} onSelect={(item) => setRelease(releases.find((entry) => entry.tag === item.sha) ?? null)} />
            </div>
          </section>
        </div>
        )}
        {showLeft && <div className="splitter" onMouseDown={(event) => dragSize(event, "left")} />}
        <section className="center-col panel">
          <div className="section">
            <i />
            <span title={`${t("commitHistory")}${pathFilter ? ` — ${pathFilter}` : ""}`}>{t("commitHistory")}{pathFilter ? ` — ${pathFilter}` : ""}</span>
            <button type="button" className="section-btn" disabled={!repo} onClick={() => void showHistoryReport()}>
              <Icon name="print" />
              {t("exportSummary")}
            </button>
            <input className="search" placeholder={t("search")} value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <CommitHistory
            commits={commits}
            flat={flat}
            selected={selectedSha}
            query={query}
            labels={{ graph: t("graph"), message: t("message"), sha: t("sha"), author: t("author"), date: t("date") }}
            onSelect={(sha) => setSelectedSha(sha)}
            onContext={(event, commit) => showContext(event, [
              { icon: "hash", label: t("copySha"), action: () => void navigator.clipboard.writeText(commit.sha) },
              { icon: "copy", label: t("copyMessage"), action: () => void navigator.clipboard.writeText(detail?.sha === commit.sha ? detail.message : commit.subject) },
              { icon: "print", label: t("exportSummary"), action: () => void showHistoryReport() },
              { icon: "snapshot", label: t("exportCommit"), action: () => void exportSnapshot(commit.sha) },
            ])}
          />
        </section>
        {showRight && <div className="splitter" onMouseDown={(event) => dragSize(event, "right")} />}
        {showRight && (
        <div className="right-col panel">
          <section className="panel">
            <div className="section"><i /><span title={t("commitDetails")}>{t("commitDetails")}</span></div>
            <div className="detail">
              {release && !detail && <ReleaseBody release={release} />}
              {detail && (
                <>
                  <h3>{detail.message.split("\n")[0]}</h3>
                  <div className="meta">{detail.authorName} &lt;{detail.authorEmail}&gt;</div>
                  <div className="meta">{detail.date.replace("T", " ").replace(/Z$/, "")}</div>
                  <div className="meta">{detail.sha}</div>
                  <p>{detail.message}</p>
                </>
              )}
              {release && detail && <ReleaseBody release={release} />}
              {!detail && !release && <div className="empty">{t("noRepo")}</div>}
            </div>
          </section>
          <section className="panel">
            <div className="section"><i /><span title={t("changedFiles")}>{t("changedFiles")}</span></div>
            <div className="scroll">
              {detail?.files.map((file) => (
                <div
                  key={file.path}
                  className={diffFile === file.path ? "changed-row selected" : "changed-row"}
                  onClick={() => {
                    if (selectedSha) showInAppDiff(selectedSha, file.path);
                  }}
                  onDoubleClick={() => {
                    if (selectedSha) openBuiltinDiff(selectedSha, file.path);
                  }}
                  onContextMenu={(event) => showContext(event, [
                    { icon: "browse", label: t("builtinDiff"), disabled: !selectedSha, action: () => { if (selectedSha) openBuiltinDiff(selectedSha, file.path); } },
                    { icon: "browse", label: t("openExternal"), disabled: !selectedSha, action: () => { if (selectedSha) openExternalDiff(selectedSha, file.path); } },
                    { icon: "copy", label: t("copyPath"), action: () => void navigator.clipboard.writeText(file.path) },
                  ])}
                >
                  <b style={{ color: "#2563eb" }}>{file.status}</b>
                  <span>{file.path}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="section">
              <i /><span title={t("diff")}>{t("diff")}</span>
              <button type="button" className="linkish" aria-pressed={wrap} onClick={() => setWrap(!wrap)}><Icon name="wrap" />{t("wordWrap")}</button>
            </div>
            {diffText ? <DiffView text={diffText} wrap={wrap} onContextMenu={(event) => showContext(event, [
              { icon: "copy", label: t("copy"), action: () => void navigator.clipboard.writeText(diffText) },
              { icon: "list", label: t("wordWrap"), action: () => setWrap(!wrap) },
            ])} /> : <div className="empty">{t("selectFile")}</div>}
          </section>
        </div>
        )}
        </div>
        {showBottom && <div className="splitter h" onMouseDown={(event) => dragSize(event, "bottom")} />}
        {showBottom && (
          <section className="panel log-panel">
            <div className="section bottom-tabs">
              <button type="button" className={bottomTab === "log" ? "active" : ""} aria-pressed={bottomTab === "log"} onClick={() => setBottomTab("log")}>
                <Icon name="list" />
                {t("outputLog")}
              </button>
              <TerminalTabStrip t={t} showing={bottomTab === "terminal"} onShow={() => setBottomTab("terminal")} />
              {bottomTab === "log" && <button type="button" className="linkish" style={{ marginLeft: "auto" }} onClick={() => setLogs([])}><Icon name="trash" />{t("clearLog")}</button>}
            </div>
            <div className="scroll log-list" hidden={bottomTab !== "log"} ref={logBox}>
              {logs.length === 0 && <div className="empty">{t("logEmpty")}</div>}
              {logs.map((entry) => (
                <div key={entry.id} className={entry.level === "error" ? "log-line error" : "log-line"}>
                  <time>{entry.time}</time>
                  <span>{entry.text}</span>
                </div>
              ))}
            </div>
            <TerminalPanes active={bottomTab === "terminal"} />
          </section>
        )}
      </div>
      <footer className="statusbar">
        <StatusCell icon={busy || progress ? "refresh" : "status"} text={progress || (busy ? t("sbWorking") : (status || t("sbReady")))} busy={Boolean(busy || progress)} wide />
        <StatusCell icon="commit" text={gitOk ? t("sbGit") : t("sbGitMissing")} warn={!gitOk} title={gitOk ? t("sbGit") : t("gitMissing")} />
        {repo ? (
          <>
            <StatusCell icon="branch" text={branchText(repo, work, t)} title={branchTitle(repo, work, t)} />
            <StatusCell icon="browse" text={repo.remoteView ? t("remoteView") : (repo.remoteUrl ? remoteText(repo.remoteUrl) : t("sbNoRemote"))} title={repo.remoteUrl || t("sbNoRemote")} />
            <StatusCell icon="status" text={changeText(repo, work, t)} title={changeText(repo, work, t)} wide />
            {!writable && <StatusCell icon="lock" text={t("sbReadOnly")} />}
          </>
        ) : <StatusCell icon="folder" text={t("sbNoRepo")} />}
        {selectedPath && <StatusCell icon="folder" text={selectedPath.split(/[/\\]/).pop() || selectedPath} title={selectedPath} />}
        {selectedSha && <StatusCell icon="hash" text={selectedSha.slice(0, 7)} title={selectedSha} />}
        {repo && <StatusCell icon="history" text={String(commits.length)} title={pathFilter ? `${t("sbFilter")}: ${pathFilter}` : t("sbCommits")} />}
        {pathFilter && <StatusCell icon="list" text={pathFilter} title={`${t("sbFilter")}: ${pathFilter}`} />}
        {fsRoot && <StatusCell icon="drive" text={fsRoot} title={fsRoot} />}
        <StatusCell icon="folder" text={repo?.path || ""} title={repo?.path} />
        <span className="status-end">
          <span className="status-panels" title={panelTitle(showLeft, showRight, showBottom, t)}>
            <i className={showLeft ? "on" : ""}><Icon name="panelLeft" /></i>
            <i className={showRight ? "on" : ""}><Icon name="panelRight" /></i>
            <i className={showBottom ? "on" : ""}><Icon name="panelBottom" /></i>
          </span>
          <StatusCell icon={bottomTab === "terminal" ? "terminal" : "list"} text={showBottom ? (bottomTab === "terminal" ? t("terminal") : t("outputLog")) : t("panelBottom")} />
          <StatusCell icon="language" text={lang === "ko" ? "한국어" : "English"} title={t("language")} />
        </span>
      </footer>
      <ProgressHost t={t} />
      {settings && (
        <TutorialTour
          t={t}
          showAtStart={settings.showTutorial !== false}
          onShowAtStart={(value) => applyPrefs({ showTutorial: value })}
          onView={(view) => (view === "start" ? showStartScreen() : hideStartScreen())}
        />
      )}
      {settings && onStart && (
        <TutorialWelcome t={t} showAtStart={settings.showTutorial !== false} onShowAtStart={(value) => applyPrefs({ showTutorial: value })} />
      )}
    </div>
  );

  function browseMenu(entry: FileEntry): MenuItem[] {
    return [
      { icon: "folder", label: t("openFolder"), disabled: !entry.directory, action: () => void openOrBrowse(entry.path) },
      { icon: "copy", label: t("copyPath"), action: () => void navigator.clipboard.writeText(entry.path) },
    ];
  }

  function fileMenu(entry: FileEntry): MenuItem[] {
    return [
      ...(isConflict(entry) ? [
        { icon: "branch" as const, label: t("resolveConflict"), disabled: !writable, action: () => openMergeTool(entry.path) },
        ...(builtinMergeDefault ? [] : [
          { icon: "browse" as const, label: t("builtinMerge"), disabled: !writable, action: () => openBuiltinMerge(entry.path) },
        ]),
      ] : []),
      { icon: "history", label: t("showLog"), action: () => { setPathFilter(entry.path); filterRef.current = entry.path; void reload(entry.path); } },
      { icon: "copy", label: t("copyPath"), action: () => void navigator.clipboard.writeText(entry.path) },
      { icon: "list", label: t("showAll"), action: () => { setPathFilter(""); filterRef.current = ""; void reload(""); } },
      { icon: "plus", label: t("gitAdd"), disabled: !writable, action: () => void doAdd([entry.path]) },
      { icon: "undo", label: t("gitReset"), disabled: !writable, action: () => void run(t("gitReset"), async () => (await api.unstage([entry.path])).message) },
      { icon: "discard", label: t("discard"), disabled: !writable, action: () => void discard([entry.path]) },
      { icon: "commit", label: t("gitCommit"), disabled: !writable, action: () => void doCommit() },
      { icon: "fetch", label: t("gitFetch"), disabled: !repo, action: () => void run(t("gitFetch"), () => authed((creds) => api.fetch(creds)).then((r) => r.message)) },
      { icon: "pull", label: t("gitPull"), disabled: !writable, action: () => void run(t("gitPull"), () => authed((creds) => api.pull(creds)).then((r) => r.message)) },
      { icon: "push", label: t("gitPush"), disabled: !writable, action: () => void run(t("gitPush"), () => authed((creds) => api.push(creds)).then((r) => r.message)) },
      { icon: "stash", label: t("gitStash"), disabled: !writable, action: () => void run(t("gitStash"), async () => (await api.stash()).message) },
      { icon: "stashPop", label: t("gitStashPop"), disabled: !writable, action: () => void run(t("gitStashPop"), async () => (await api.stashPop()).message) },
      { icon: "status", label: t("gitStatus"), disabled: !repo, action: () => void api.gitStatus().then((result) => setDialog({ type: "text", title: t("statusTitle"), text: result.text, save: true })).catch(fail) },
      { icon: "filePlus", label: t("newFile"), disabled: !writable, action: () => void createItem(entry, false) },
      { icon: "folderPlus", label: t("newFolder"), disabled: !writable, action: () => void createItem(entry, true) },
      { icon: "trash", label: t("delete"), disabled: !writable, action: () => void removeItem(entry) },
      { icon: "eyeOff", label: t("ignore"), disabled: !writable, action: () => void run(t("ignore"), async () => { await api.gitignore(entry.path, false); }) },
      { icon: "eye", label: t("unignore"), disabled: !writable, action: () => void run(t("unignore"), async () => { await api.gitignore(entry.path, true); }) },
    ];
  }

  async function discard(paths: string[]) {
    if (!requireWritable()) return;
    const ok = await ask<boolean>({ type: "confirm", title: t("discard"), message: paths.join("\n") || repo?.path || "", resolve: () => undefined });
    if (!ok) return;
    await run(t("discard"), async () => (await api.discard(paths)).message);
  }

  async function createItem(entry: FileEntry, directory: boolean) {
    const parent = entry.directory ? entry.path : entry.path.split("/").slice(0, -1).join("/");
    const name = await ask<string | null>({ type: "prompt", title: directory ? t("newFolder") : t("newFile"), label: t("namePrompt"), value: "", resolve: () => undefined });
    if (!name) return;
    const target = parent ? `${parent}/${name}` : name;
    await run(directory ? t("newFolder") : t("newFile"), async () => {
      if (directory) await api.newFolder(target);
      else await api.newFile(target);
    });
  }

  async function removeItem(entry: FileEntry) {
    const ok = await ask<boolean>({ type: "confirm", title: t("delete"), message: entry.path, resolve: () => undefined });
    if (!ok) return;
    await run(t("delete"), async () => { await api.deletePath(entry.path); });
  }

  async function openPrint(report?: Report) {
    try {
      const next = report ?? await historyReport();
      void openDialog("print", { report: next });
    } catch (error) {
      fail(error);
    }
  }

  async function historyReport(): Promise<Report> {
    const [summary, history] = await Promise.all([api.summary(), api.log(filterRef.current, 2000)]);
    return buildHistoryReport({ t, summary, commits: history.commits, filter: filterRef.current, query, work });
  }

  async function showHistoryReport() {
    try {
      setDialog({ type: "report", report: await historyReport() });
    } catch (error) {
      fail(error);
    }
  }

  async function exportSnapshot(sha = selectedSha) {
    if (!sha) return;
    const picked = await chooseDir(true);
    if (picked) {
      await run(t("exportCommit"), async () => {
        const result = await api.exportCommit(sha, picked);
        return `${result.count}`;
      });
      return;
    }
    setDialog({ type: "export", sha, path: "" });
  }

  async function submitDialog(next: DialogState) {
    try {
      if (next.type === "open") {
        setDialog(null);
        await openOrBrowse(next.path);
      } else if (next.type === "clone") {
        setDialog(null);
        await run(t("clone"), () => authed((creds) => api.clone(next.url, next.destination, creds ?? { username: next.username, password: next.password })).then((result) => {
          setRepo(result.repo);
          setPathFilter("");
          return result.repo.path;
        }));
      } else if (next.type === "browse") {
        setDialog(null);
        await run(t("browse"), () => authed((creds) => api.browse(next.url, creds ?? { username: next.username, password: next.password })).then((result) => {
          setRepo(result.repo);
          return result.repo.path;
        }));
      } else if (next.type === "commit") {
        const message = [`[${next.category}] ${next.subject.trim()}`, next.body.trim()].filter(Boolean).join("\n\n");
        setDialog(null);
        await run(t("gitCommit"), async () => (await api.commitMessage(message)).message);
      } else if (next.type === "categories") {
        const saved = await api.saveSettings({ commitCategories: next.text.split(/\r?\n/) });
        setSettings(saved);
        setDialog({ type: "commit", category: saved.commitCategories[0] ?? "", subject: "", body: "" });
      } else if (next.type === "prefs") {
        setDialog(null);
      } else if (next.type === "export") {
        setDialog(null);
        await run(t("exportCommit"), async () => `${(await api.exportCommit(next.sha, next.path)).count}`);
      }
    } catch (error) {
      if (next.type === "prefs") applyTheme(settings?.theme);
      fail(error);
    }
  }
}

function isConflict(entry: FileEntry): boolean {
  return entry.staged === "Conflicted" || entry.workTree === "Conflicted";
}

function Menu(props: {
  icon: IconName;
  label: string;
  open: boolean;
  onOpen: () => void;
  onDismiss: () => void;
  items: MenuItem[];
  extra?: string[];
  onRecent?: (path: string) => void;
  onRemoveRecent?: (path: string) => void;
  onClearRecent?: () => void;
  recentLabel?: string;
  removeRecentLabel?: string;
  clearRecentLabel?: string;
}) {
  const button = useRef<HTMLButtonElement>(null);
  // A press on the button while its menu is open closes the menu; the click after it
  // must not open it again.
  const wasOpen = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    if (!props.open || !button.current) return;
    const current = latest.current;
    const rows: ActionItem[] = [...current.items];
    if (current.extra && current.extra.length > 0) {
      rows.push({ kind: "separator" }, { kind: "header", label: current.recentLabel ?? "" });
      for (const item of current.extra) {
        rows.push({
          icon: "clock",
          label: item,
          action: () => current.onRecent?.(item),
          secondary: { icon: "trash", label: current.removeRecentLabel ?? "", action: () => current.onRemoveRecent?.(item) },
        });
      }
      rows.push({ icon: "trash", label: current.clearRecentLabel ?? "", action: () => current.onClearRecent?.() });
    }
    let live = true;
    void openActionMenu(rows, button.current).then((chosen) => {
      if (!live) return;
      latest.current.onDismiss();
      chosen?.();
    });
    return () => {
      live = false;
      closeMenu();
    };
  }, [props.open]);
  return (
    <div className="menu">
      <button
        ref={button}
        type="button"
        aria-expanded={props.open}
        className={props.open ? "active" : undefined}
        onPointerDown={() => { wasOpen.current = props.open; }}
        onClick={() => {
          if (wasOpen.current) props.onDismiss();
          else props.onOpen();
          wasOpen.current = false;
        }}
      >
        <MenuGlyph name={props.icon} />{props.label}
      </button>
    </div>
  );
}

function ToolButton(props: { icon: IconName; flag?: "gb" | "kr"; label: string; disabled?: boolean; pressed?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={props.pressed ? "active" : undefined} aria-label={props.label} aria-pressed={props.pressed} disabled={props.disabled} title={props.label} onClick={props.onClick}>
      {props.flag ? <Flag country={props.flag} /> : <Icon name={props.icon} />}
    </button>
  );
}

function BranchList(props: {
  title: string;
  items: { id: string; label: string; sha: string; current?: boolean }[];
  onSelect?: (item: { id: string; label: string; sha: string }) => void;
  onContext?: (event: ReactMouseEvent, item: { id: string; label: string; sha: string; current?: boolean }) => void;
}) {
  if (props.items.length === 0) return null;
  return (
    <div>
      <div className="group">{props.title}</div>
      {props.items.map((item) => (
        <div
          key={item.id}
          className={item.current ? "tree-row current" : "tree-row"}
          onClick={() => props.onSelect?.(item)}
          onContextMenu={(event) => props.onContext?.(event, item)}
          title={item.sha}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}

function ReleaseBody({ release }: { release: ReleaseInfo }) {
  return (
    <div>
      <h3>{release.name}</h3>
      <div className="meta">{release.tag} {release.publishedAt.slice(0, 10)}</div>
      <p>{release.body}</p>
      {release.url && <a href={release.url} target="_blank" rel="noreferrer">{release.url}</a>}
    </div>
  );
}

function asBrowseEntry(entry: { name: string; path: string; directory: boolean }): FileEntry {
  return { ...entry, badge: "", color: "", staged: null, workTree: null, unpushed: false };
}

function driveActive(root: string | null, drivePath: string): boolean {
  if (!root) return false;
  const norm = (value: string) => value.replace(/[\\/]+$/, "").toLowerCase();
  const current = norm(root);
  const drive = norm(drivePath);
  if (!drive) return root === "/" || root === "\\";
  if (current === drive) return true;
  return current.startsWith(`${drive}\\`) || current.startsWith(`${drive}/`);
}

function describeError(error: unknown): { message: string; detail: string } {
  if (error instanceof ApiError) {
    const message = error.message || "Error";
    return { message, detail: error.detail?.trim() || message };
  }
  if (error instanceof Error) {
    const message = error.message || error.name || "Error";
    const cause = "cause" in error && error.cause ? `\n\n${describeError(error.cause).detail}` : "";
    return { message, detail: `${error.stack || `${error.name}: ${message}`}${cause}` };
  }
  const text = typeof error === "string" ? error : safeJson(error);
  return { message: text, detail: text };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function flatten(entries: FileEntry[], expanded: string[], children: Record<string, FileEntry[]>, ancestor: boolean[] = []): { entry: FileEntry; depth: number; guides: boolean[]; first: boolean; last: boolean }[] {
  const rows: { entry: FileEntry; depth: number; guides: boolean[]; first: boolean; last: boolean }[] = [];
  entries.forEach((entry, index) => {
    const first = index === 0;
    const last = index === entries.length - 1;
    rows.push({ entry, depth: ancestor.length, guides: ancestor, first, last });
    if (entry.directory && expanded.includes(entry.path)) {
      rows.push(...flatten(children[entry.path] ?? [], expanded, children, [...ancestor, !last]));
    }
  });
  return rows;
}

function tooltip(entry: FileEntry, t: (key: string) => string): string {
  return [entry.path, entry.workTree, entry.staged, entry.unpushed ? "unpushed" : ""].filter(Boolean).join("\n") || entry.path;
}

/** The progress pop-up, while a long operation runs (src/progress.ts). */
function ProgressHost(_props: { t: (key: string) => string }) {
  const state = useProgress();
  useEffect(() => {
    // Shown once an operation outlasts the delay; follows its latest line; gone when it ends.
    if (state?.visible) updateDialog("progress", state);
    else if (isDialogOpen("progress")) closeDialog("progress");
  }, [state]);
  useEffect(() => () => closeDialog("progress"), []);
  return null;
}

/** The icon of an operation run through run(), from its label. */
function progressIconOf(label: string, t: (key: string) => string): IconName {
  const icons: [string, IconName][] = [
    ["clone", "clone"], ["browse", "browse"], ["open", "open"], ["gitFetch", "fetch"], ["gitPull", "pull"],
    ["gitPush", "push"], ["gitCommit", "commit"], ["gitAdd", "plus"], ["gitReset", "undo"], ["discard", "discard"],
    ["gitStash", "stash"], ["gitStashPop", "stashPop"], ["checkout", "checkout"], ["exportCommit", "snapshot"],
  ];
  return icons.find(([key]) => t(key) === label)?.[1] ?? "refresh";
}

function StatusCell({ icon, text, title, warn, busy, wide }: { icon: IconName; text: string; title?: string; warn?: boolean; busy?: boolean; wide?: boolean }) {
  if (!text) return null;
  const tone = warn ? " warn" : busy ? " busy" : "";
  return (
    <span className={`status-cell${wide ? " wide" : ""}${tone}`} title={title || text}>
      <Icon name={icon} />
      <span>{text}</span>
    </span>
  );
}

function branchText(repo: RepoInfo, work: WorkState | null, t: (key: string) => string): string {
  if (repo.bare) return t("sbBare");
  const name = repo.detached ? `${t("sbDetached")} ${(repo.head ?? "").slice(0, 7)}` : (repo.branch ?? "HEAD");
  if (!work?.upstream) return name;
  return `${name}  ↑${work.ahead} ↓${work.behind}`;
}

function branchTitle(repo: RepoInfo, work: WorkState | null, t: (key: string) => string): string {
  const lines = [branchText(repo, work, t)];
  if (repo.head) lines.push(repo.head);
  if (work?.upstream) lines.push(work.upstream);
  return lines.join("\n");
}

function remoteText(url: string): string {
  return url.replace(/\.git$/i, "").replace(/^https?:\/\//, "").replace(/^git@/, "").replace(":", "/");
}

function changeText(repo: RepoInfo, work: WorkState | null, t: (key: string) => string): string {
  if (repo.remoteView) return t("remoteView");
  if (repo.bare) return t("sbBare");
  if (!work) return "";
  const parts = [
    work.staged ? `${t("sbStaged")} ${work.staged}` : "",
    work.modified ? `${t("sbModified")} ${work.modified}` : "",
    work.deleted ? `${t("sbDeleted")} ${work.deleted}` : "",
    work.untracked ? `${t("sbUntracked")} ${work.untracked}` : "",
    work.conflicted ? `${t("sbConflict")} ${work.conflicted}` : "",
    work.unpushed ? `${t("sbUnpushed")} ${work.unpushed}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : t("sbClean");
}

function panelTitle(left: boolean, right: boolean, bottom: boolean, t: (key: string) => string): string {
  return [
    [t("panelLeft"), left],
    [t("panelRight"), right],
    [t("panelBottom"), bottom],
  ].map(([label, open]) => `${label}: ${open ? t("sbOn") : t("sbOff")}`).join("\n");
}

function sameWork(current: WorkState | null, next: WorkState | null): boolean {
  if (current === next) return true;
  if (!current || !next) return false;
  return current.staged === next.staged
    && current.modified === next.modified
    && current.deleted === next.deleted
    && current.untracked === next.untracked
    && current.conflicted === next.conflicted
    && current.unpushed === next.unpushed
    && current.ahead === next.ahead
    && current.behind === next.behind
    && current.upstream === next.upstream;
}

function sameRepo(current: RepoInfo | null, next: RepoInfo | null): boolean {
  if (current === next) return true;
  if (!current || !next) return false;
  return current.path === next.path
    && current.branch === next.branch
    && current.head === next.head
    && current.bare === next.bare
    && current.remoteView === next.remoteView
    && current.remoteUrl === next.remoteUrl
    && current.detached === next.detached;
}

function WindowGlyph(props: { kind: "minimize" | "maximize" | "restore" | "close" }) {
  if (props.kind === "minimize") return <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5.5h8" /></svg>;
  if (props.kind === "maximize") return <svg viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" /></svg>;
  if (props.kind === "restore") return <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 2.5h4.5V7M2.5 4H7v4.5H2.5z" /></svg>;
  return <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2L2 8" /></svg>;
}

function dragSize(event: ReactMouseEvent, which: "left" | "right" | "files" | "bottom") {
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const root = document.documentElement;
  const startLeft = cssPx("--left", PANEL_MIN);
  const startRight = cssPx("--right", PANEL_MIN);
  const startFiles = cssPx("--files", 280);
  const startBottom = cssPx("--bottom", 180);
  const move = (ev: globalThis.MouseEvent) => {
    if (which === "left") root.style.setProperty("--left", `${Math.max(PANEL_MIN, startLeft + ev.clientX - startX)}px`);
    if (which === "right") root.style.setProperty("--right", `${Math.max(PANEL_MIN, startRight - (ev.clientX - startX))}px`);
    if (which === "files") root.style.setProperty("--files", `${Math.max(120, startFiles - (ev.clientY - startY))}px`);
    if (which === "bottom") root.style.setProperty("--bottom", `${Math.max(80, startBottom - (ev.clientY - startY))}px`);
  };
  const up = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
}

function cssPx(name: string, fallback: number): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const PANEL_MIN = 280;
