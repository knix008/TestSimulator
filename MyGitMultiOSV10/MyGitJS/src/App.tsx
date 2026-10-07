import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from "react";
import { ApiError, api, type CommitDetail, type CommitInfo, type FileEntry, type ReleaseInfo, type RepoInfo, type Settings, type TreeResponse, type WorkState } from "./api";
import { CommitHistory } from "./CommitHistory";
import { DiffView } from "./DiffView";
import { openToolWindow } from "./toolLaunch";
import { translate, type Lang } from "./i18n";
import { ThemePicker } from "./ThemePicker";
import { publishAppearance } from "../core/appearance";
import { BUILTIN_MERGE_TOOL, isBuiltinMergeTool, usesBuiltinMerge } from "../core/mergeTool";
import { applyTheme, nextThemeId, THEMES, themeById } from "../core/themes";
import { Flag, Icon, MenuGlyph, type IconName } from "./icons";
import { TerminalPane } from "./TerminalPane";
import { buildHistoryReport, buildStatusReport, downloadReport, printReport } from "./exportReport";
import { PrintPreview } from "./PrintPreview";
import { defaultPageSetup, type PageSetup } from "../core/printLayout";
import type { Report, ReportFormat } from "../core/report";
import packageJson from "../package.json";

type MenuItem = { label: string; icon: IconName; disabled?: boolean; action: () => void };
type ContextMenu = { x: number; y: number; items: MenuItem[] };
type Creds = { username: string; password: string; remember?: boolean };

type DialogState =
  | { type: "open"; path: string }
  | { type: "clone"; url: string; destination: string; username: string; password: string }
  | { type: "browse"; url: string; username: string; password: string }
  | { type: "auth"; username: string; password: string; remember: boolean; resolve: (value: Creds | null) => void }
  | { type: "commit"; category: string; subject: string; body: string }
  | { type: "categories"; text: string }
  | { type: "prefs"; language: Lang; theme: string; tool: string; args: string; mergeTool: string; mergeArgs: string; shell: string }
  | { type: "confirm"; title: string; message: string; resolve: (value: boolean) => void }
  | { type: "prompt"; title: string; label: string; value: string; resolve: (value: string | null) => void }
  | { type: "text"; title: string; text: string; save?: boolean }
  | { type: "report"; report: Report }
  | { type: "print"; report: Report; setup: PageSetup }
  | { type: "about" }
  | { type: "error"; message: string; detail: string }
  | { type: "export"; sha: string; path: string };

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
  const [context, setContext] = useState<ContextMenu | null>(null);
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
  const prefsGen = useRef(0);
  filterRef.current = pathFilter;
  expandedRef.current = expanded;
  busyRef.current = busy;

  const lang: Lang = settings?.language ?? "ko";
  const t = useCallback((key: string) => translate(lang, key), [lang]);
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
    const controls = window.mygit?.window;
    if (!controls) return;
    void controls.isMaximized().then(setMaximized);
    return controls.onMaximized(setMaximized);
  }, []);

  useEffect(() => {
    if (!menu && !rail && !context) return;
    const close = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".menu, .tool-pop, .context")) return;
      setMenu(null);
      setRail(null);
      setContext(null);
    };
    window.addEventListener("mousedown", close, true);
    return () => window.removeEventListener("mousedown", close, true);
  }, [menu, rail, context]);

  useEffect(() => {
    if (settings?.theme) applyTheme(settings.theme);
  }, [settings?.theme]);

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

  const run = useCallback(async (label: string, action: () => Promise<string | void>) => {
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
      setBusy(false);
    }
  }, [appendLog, fail, reload]);

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
    if (!window.mygit) return null;
    return save ? window.mygit.pickSaveDirectory() : window.mygit.pickDirectory();
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
    try {
      const opened = await api.open(target);
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
    if (!window.mygit) setDialog({ type: "open", path: "" });
  }, [chooseDir, openOrBrowse]);

  const onOpen = useCallback(async () => {
    setMenu(null);
    const picked = await chooseDir(false);
    if (picked) {
      await openPath(picked);
      return;
    }
    if (!window.mygit) setDialog({ type: "open", path: "" });
  }, [chooseDir, openPath]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o" && !event.shiftKey) {
        event.preventDefault();
        void onOpen();
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

  const showContext = (event: ReactMouseEvent, items: MenuItem[]) => {
    event.preventDefault();
    event.stopPropagation();
    const width = 260;
    const height = Math.min(items.length * 32 + 12, window.innerHeight - 16);
    const x = Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8));
    const y = Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8));
    setContext({ x, y, items });
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
      if (ticket === prefsGen.current) setSettings(saved);
    }).catch((error) => {
      if (ticket === prefsGen.current) fail(error);
    });
  }

  function restoreDefaults(): Promise<Settings | null> {
    const ticket = ++prefsGen.current;
    const job = prefsChain.current.catch(() => undefined).then(async () => {
      const saved = await api.resetSettings();
      if (ticket !== prefsGen.current) return null;
      applyTheme(saved.theme);
      setSettings(saved);
      publishAppearance({ language: saved.language });
      return saved;
    }).catch((error) => {
      if (ticket === prefsGen.current) fail(error);
      return null;
    });
    prefsChain.current = job.then(() => undefined);
    return job;
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

  function openPrefs() {
    setMenu(null);
    setRail(null);
    setDialog({
      type: "prefs",
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
    <div className="app" onClick={() => { setMenu(null); setContext(null); setRail(null); }}>
      {!gitOk && <div className="banner">{t("gitMissing")}</div>}
      <div className="menubar" onClick={(event) => event.stopPropagation()}>
        <div className="app-title">
          <img src={`${import.meta.env.BASE_URL}icon.png`} alt="" />
          <strong>MyGit</strong>
          <span>{packageJson.version}</span>
        </div>
        <Menu icon="folder" label={t("file")} open={menu === "file"} onOpen={() => { setRail(null); setMenu(menu === "file" ? null : "file"); }} onDismiss={() => setMenu((current) => current === "file" ? null : current)} items={[
          { icon: "open", label: t("open"), action: () => void onOpen() },
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
          { icon: "branch", label: t("resolveConflict"), disabled: !writable || !mergeTarget, action: () => { if (mergeTarget) openMergeTool(mergeTarget); } },
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
          { icon: "help", label: t("about"), action: () => setDialog({ type: "about" }) },
        ]} />
        {window.mygit?.window && (
          <div className="window-controls">
            <button type="button" aria-label={t("minimize")} title={t("minimize")} onClick={() => void window.mygit?.window?.minimize()}>
              <WindowGlyph kind="minimize" />
            </button>
            <button type="button" aria-label={maximized ? t("restore") : t("maximize")} title={maximized ? t("restore") : t("maximize")} onClick={() => void window.mygit?.window?.toggleMaximize().then(setMaximized)}>
              <WindowGlyph kind={maximized ? "restore" : "maximize"} />
            </button>
            <button type="button" className="close" aria-label={t("close")} title={t("close")} onClick={() => void window.mygit?.window?.close()}>
              <WindowGlyph kind="close" />
            </button>
          </div>
        )}
      </div>
      <div className="toolbar" onClick={(event) => event.stopPropagation()}>
        <ToolButton icon="open" label={t("open")} onClick={() => void onOpen()} />
        <ToolButton icon="clone" label={t("clone")} onClick={() => setDialog({ type: "clone", url: "", destination: "", username: settings?.gitUsername ?? "", password: "" })} />
        <ToolButton icon="browse" label={t("browse")} onClick={() => setDialog({ type: "browse", url: "", username: settings?.gitUsername ?? "", password: "" })} />
        <ToolButton icon="print" label={t("printFile")} disabled={!repo || busy} onClick={() => void openPrint()} />
        <ToolButton icon="refresh" label={t("refresh")} disabled={!repo || busy} onClick={() => void refresh()} />
        <ToolButton icon="plus" label={t("gitAdd")} disabled={!writable || busy} onClick={() => void doAdd(selectedPath ? [selectedPath] : [])} />
        <ToolButton icon="commit" label={t("gitCommit")} disabled={!writable || busy} onClick={() => void doCommit()} />
        <ToolButton icon="branch" label={t("resolveConflict")} disabled={!writable || !mergeTarget || busy} onClick={() => { if (mergeTarget) openMergeTool(mergeTarget); }} />
        <ToolButton icon="pull" label={t("gitPull")} disabled={!writable || busy} onClick={() => void run(t("gitPull"), () => authed((creds) => api.pull(creds)).then((r) => r.message))} />
        <ToolButton icon="push" label={t("gitPush")} disabled={!writable || busy} onClick={() => void run(t("gitPush"), () => authed((creds) => api.push(creds)).then((r) => r.message))} />
        {busy && <ToolButton icon="stop" label={t("stop")} onClick={() => void api.cancel()} />}
        <ToolButton icon="panelLeft" label={t("panelLeft")} pressed={showLeft} onClick={() => setShowLeft((open) => !open)} />
        <ToolButton icon="panelRight" label={t("panelRight")} pressed={showRight} onClick={() => setShowRight((open) => !open)} />
        <ToolButton icon="panelBottom" label={t("panelBottom")} pressed={showBottom} onClick={() => setShowBottom((open) => !open)} />
        <div className="toolbar-end">
          <div className="pop-host" onMouseLeave={() => { if (rail === "theme") setRail(null); }}>
            <div className="split-tool">
              <ToolButton icon="theme" label={lang === "ko" ? themeById(settings?.theme).nameKo : themeById(settings?.theme).nameEn} onClick={cycleTheme} />
              <button type="button" className={rail === "theme" ? "caret active" : "caret"} aria-expanded={rail === "theme"} aria-label={t("theme")} title={t("theme")} onClick={() => { setMenu(null); setRail(rail === "theme" ? null : "theme"); }}>
                <svg className="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 6.5 8 10.5 12 6.5" /></svg>
              </button>
            </div>
            {rail === "theme" && (
              <ThemeMenu
                lang={lang}
                themeId={settings?.theme ?? "light-classic"}
                lightLabel={t("themeLight")}
                darkLabel={t("themeDark")}
                onChange={(theme) => void chooseTheme(theme)}
              />
            )}
          </div>
          <ToolButton icon="language" flag={lang === "ko" ? "gb" : "kr"} label={lang === "ko" ? "English" : "한국어"} onClick={() => { setMenu(null); setRail(null); chooseLanguage(lang === "ko" ? "en" : "ko"); }} />
          <ToolButton icon="prefs" label={t("prefsTitle")} onClick={openPrefs} />
          <ToolButton icon="help" label={t("about")} onClick={() => { setRail(null); setDialog({ type: "about" }); }} />
        </div>
      </div>
      <div className="workspace" style={{ gridTemplateRows: showBottom ? "minmax(0, 1fr) 6px var(--bottom)" : "minmax(0, 1fr)" }}>
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
            <div className="section"><i /><span>{t("repository")}</span></div>
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
            <span>{t("commitHistory")}{pathFilter ? ` — ${pathFilter}` : ""}</span>
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
            <div className="section"><i /><span>{t("commitDetails")}</span></div>
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
            <div className="section"><i /><span>{t("changedFiles")}</span></div>
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
              <i /><span>{t("diff")}</span>
              <button type="button" className="linkish" onClick={() => setWrap(!wrap)}>{t("wordWrap")}</button>
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
              <button type="button" className={bottomTab === "terminal" ? "active" : ""} aria-pressed={bottomTab === "terminal"} onClick={() => setBottomTab("terminal")}>
                <Icon name="terminal" />
                {t("terminal")}
              </button>
              {bottomTab === "log" && <button type="button" className="linkish" style={{ marginLeft: "auto" }} onClick={() => setLogs([])}>{t("clearLog")}</button>}
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
            <TerminalPane active={bottomTab === "terminal"} />
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
      {context && (
        <div className="context" style={{ left: context.x, top: context.y }} onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
          {context.items.map((item) => (
            <button key={item.label} type="button" className={item.disabled ? "is-disabled" : undefined} aria-disabled={item.disabled || undefined} onClick={() => { if (item.disabled) return; setContext(null); item.action(); }}>
              <MenuGlyph name={item.icon} />
              <span className="menu-label">{item.label}</span>
            </button>
          ))}
        </div>
      )}
      {dialog && (
        <DialogHost
          dialog={dialog}
          setDialog={setDialog}
          settings={settings}
          t={t}
          urls={settings?.recentCloneUrls ?? []}
          onDeleteUrl={async (url) => setSettings(await api.deleteRecentUrl(url))}
          onSubmit={(next) => void submitDialog(next)}
          onTheme={(theme) => chooseTheme(theme)}
          onPrefs={(patch) => applyPrefs(patch)}
          onRestore={restoreDefaults}
          onExport={(kind) => void exportOpenReport(kind)}
          onPrint={() => { if (dialog?.type === "print") printReport(dialog.report, dialog.setup); }}
        />
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
      setDialog({ type: "print", report: next, setup: defaultPageSetup(next.title) });
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

  async function exportOpenReport(kind: ReportFormat | "print") {
    if (!dialog) return;
    try {
      const report = dialog.type === "report"
        ? dialog.report
        : dialog.type === "text" && dialog.save
          ? buildStatusReport({ t, summary: await api.summary(), text: dialog.text })
          : null;
      if (!report) return;
      if (kind === "print") {
        setDialog({ type: "print", report, setup: defaultPageSetup(report.title) });
        return;
      }
      await downloadReport(report, kind);
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

function sameToolPath(left: string, right: string): boolean {
  if (!left || !right) return false;
  return /[\\]/.test(left) || /[\\]/.test(right) ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function isConflict(entry: FileEntry): boolean {
  return entry.staged === "Conflicted" || entry.workTree === "Conflicted";
}

function diffToolOptions(tools: { id: string; label: string; args: string }[], current: string, args: string) {
  if (!current || tools.some((item) => sameToolPath(item.id, current))) return tools;
  const name = current.split(/[/\\]/).pop() || current;
  return [...tools, { id: current, label: name, args }];
}

function selectedDiffTool(tools: { id: string; label: string; args: string }[], current: string): string {
  return tools.find((item) => sameToolPath(item.id, current))?.id ?? current;
}

function mergeToolOptions(tools: { id: string; label: string }[], current: string, builtinLabel: string) {
  const options = [{ id: BUILTIN_MERGE_TOOL, label: builtinLabel }, ...tools.map((item) => ({ id: item.id, label: item.label }))];
  if (current && !isBuiltinMergeTool(current) && !tools.some((item) => sameToolPath(item.id, current))) {
    options.push({ id: current, label: current.split(/[/\\]/).pop() || current });
  }
  return options;
}

function selectedMergeTool(tools: { id: string }[], current: string): string {
  if (isBuiltinMergeTool(current) || !current) return BUILTIN_MERGE_TOOL;
  return tools.find((item) => sameToolPath(item.id, current))?.id ?? current;
}

async function browseExternalTool(
  kind: "diff" | "merge",
  dialog: DialogState,
  tools: { id: string; label: string; args: string; mergeArgs: string }[],
  setDialog: Dispatch<SetStateAction<DialogState | null>>,
  onPrefs: (patch: Partial<Settings>) => void,
  t: (key: string) => string,
) {
  if (dialog.type !== "prefs") return;
  const current = kind === "diff" ? dialog.tool : dialog.mergeTool;
  const picked = window.mygit?.pickFile
    ? await window.mygit.pickFile()
    : window.prompt(t(kind === "diff" ? "diffTool" : "mergeTool"), current);
  if (!picked) return;
  const known = tools.find((item) => sameToolPath(item.id, picked));
  if (kind === "diff") {
    const args = known?.args || (dialog.args.includes("{left}") ? dialog.args : "\"{left}\" \"{right}\"");
    setDialog((next) => next?.type === "prefs" ? { ...next, tool: picked, args } : next);
    onPrefs({ externalDiffToolPath: picked, externalDiffToolArguments: args });
    return;
  }
  const mergeArgs = known?.mergeArgs || (dialog.mergeArgs.includes("{merged}") ? dialog.mergeArgs : "\"{base}\" \"{local}\" \"{remote}\" \"{merged}\"");
  setDialog((next) => next?.type === "prefs" ? { ...next, mergeTool: picked, mergeArgs } : next);
  onPrefs({ externalMergeToolPath: picked, externalMergeToolArguments: mergeArgs });
}

function ThemeMenu(props: {
  lang: Lang;
  themeId: string;
  lightLabel: string;
  darkLabel: string;
  onChange: (id: string) => void;
}) {
  const name = (item: (typeof THEMES)[number]) => props.lang === "ko" ? item.nameKo : item.nameEn;
  const groups = [
    { mode: "light" as const, label: props.lightLabel },
    { mode: "dark" as const, label: props.darkLabel },
  ];
  return (
    <div className="tool-pop theme" onClick={(event) => event.stopPropagation()}>
      <div className="theme-groups">
        {groups.map((group) => {
          const items = THEMES.filter((item) => item.mode === group.mode);
          const half = Math.ceil(items.length / 2);
          const columns = [items.slice(0, half), items.slice(half)];
          return (
            <section key={group.mode} className="theme-group">
              <div className="theme-group-title">{group.label}</div>
              <div className="theme-columns" role="listbox" aria-label={group.label}>
                {columns.map((column) => (
                  <div key={column[0]?.id}>
                    {column.map((item) => (
                      <button key={item.id} type="button" className={item.id === props.themeId ? "selected" : undefined} aria-selected={item.id === props.themeId} onClick={() => props.onChange(item.id)}>
                        <span className="swatches">{item.swatch.map((color, index) => <i key={index} style={{ background: color }} />)}</span>
                        {name(item)}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
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
  const openRef = useRef(props.open);
  const hideTimer = useRef<number | null>(null);
  openRef.current = props.open;
  const cancelHide = () => {
    if (hideTimer.current != null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  useEffect(() => cancelHide, []);
  return (
    <div
      className="menu"
      onMouseEnter={cancelHide}
      onMouseLeave={(event) => {
        if (!openRef.current) return;
        const next = event.relatedTarget;
        if (!(next instanceof Node) || event.currentTarget.contains(next)) return;
        cancelHide();
        hideTimer.current = window.setTimeout(() => {
          if (openRef.current) props.onDismiss();
        }, 200);
      }}
    >
      <button type="button" onClick={props.onOpen}><MenuGlyph name={props.icon} />{props.label}</button>
      {props.open && (
        <div className="menu-pop" onMouseEnter={cancelHide}>
          {props.items.map((item) => (
            <button key={item.label} type="button" className={item.disabled ? "is-disabled" : undefined} aria-disabled={item.disabled || undefined} onClick={() => { if (item.disabled) return; props.onDismiss(); item.action(); }}><MenuGlyph name={item.icon} />{item.label}</button>
          ))}
          {props.extra && props.extra.length > 0 && (
            <>
              <div className="sep" />
              <div className="group">{props.recentLabel}</div>
              {props.extra.map((item) => (
                <div className="recent-row" key={item}>
                  <button type="button" title={item} onClick={() => { props.onDismiss(); props.onRecent?.(item); }}><MenuGlyph name="clock" /><span>{item}</span></button>
                  <button type="button" className="recent-remove" aria-label={props.removeRecentLabel} title={props.removeRecentLabel} onClick={(event) => { event.stopPropagation(); props.onRemoveRecent?.(item); }}><MenuGlyph name="trash" /></button>
                </div>
              ))}
              <button type="button" onClick={(event) => { event.stopPropagation(); props.onClearRecent?.(); }}><MenuGlyph name="trash" />{props.clearRecentLabel}</button>
            </>
          )}
        </div>
      )}
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

function formatBuild(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function platformName(): string {
  const platform = window.mygit?.platform ?? navigator.platform;
  if (platform === "win32" || /^win/i.test(platform)) return "Windows";
  if (platform === "darwin" || /mac/i.test(platform)) return "macOS";
  if (platform === "linux" || /linux/i.test(platform)) return "Linux";
  return "Web";
}

function DialogHost(props: {
  dialog: DialogState;
  setDialog: Dispatch<SetStateAction<DialogState | null>>;
  settings: Settings | null;
  t: (key: string) => string;
  urls: string[];
  onDeleteUrl: (url: string) => void;
  onSubmit: (dialog: DialogState) => void;
  onTheme: (theme: string) => void;
  onPrefs: (patch: Partial<Settings>) => void;
  onRestore: () => Promise<Settings | null>;
  onExport: (kind: ReportFormat | "print") => void;
  onPrint: () => void;
}) {
  const { dialog, setDialog, t } = props;
  const [copied, setCopied] = useState(false);
  const [shells, setShells] = useState<{ id: string; label: string; command: string }[]>([]);
  const [preferredShell, setPreferredShell] = useState("");
  const [diffTools, setDiffTools] = useState<{ id: string; label: string; args: string; mergeArgs: string }[]>([]);
  const [prefsTab, setPrefsTab] = useState<"general" | "theme" | "tools">("general");
  useEffect(() => setCopied(false), [dialog]);
  useEffect(() => {
    if (dialog.type !== "prefs") return;
    let stop = false;
    api.shells().then((result) => {
      if (stop) return;
      setShells(result.shells);
      setPreferredShell(result.selected);
      setDialog((current) => {
        if (!current || current.type !== "prefs") return current;
        if (current.shell && result.shells.some((shell) => shell.id === current.shell)) return current;
        return { ...current, shell: result.selected };
      });
    }).catch(() => undefined);
    api.diffTools().then((result) => {
      if (!stop) setDiffTools(result.tools);
    }).catch(() => undefined);
    return () => { stop = true; };
  }, [dialog.type, setDialog]);
  const close = () => {
    if (dialog.type === "prefs") applyTheme(props.settings?.theme);
    if ("resolve" in dialog && dialog.resolve) dialog.resolve(null as never);
    setDialog(null);
  };
  const copyDetail = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.querySelector<HTMLTextAreaElement>(".error-detail");
      area?.focus();
      area?.select();
      document.execCommand("copy");
    }
    setCopied(true);
  };
  return (
    <div className="overlay" onMouseDown={close}>
      <form className={dialog.type === "prefs" ? "dialog prefs" : dialog.type === "error" ? "dialog wide" : dialog.type === "report" ? "dialog report" : dialog.type === "print" ? "dialog print-preview" : dialog.type === "about" ? "dialog about" : "dialog"} onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); if (dialog.type !== "error" && dialog.type !== "print") props.onSubmit(dialog); }}>
        <header><strong>{dialog.type === "about" ? <img className="dialog-app-icon" src={`${import.meta.env.BASE_URL}icon.png`} alt="" /> : <MenuGlyph name={iconOf(dialog, t)} />}<span>{titleOf(dialog, t)}</span></strong><button type="button" className="dialog-x" aria-label={t("close")} title={t("close")} onClick={close}><WindowGlyph kind="close" /></button></header>
        <div className="body">
          {dialog.type === "open" && <Field label={t("path")} value={dialog.path} onChange={(path) => setDialog({ ...dialog, path })} />}
          {(dialog.type === "clone" || dialog.type === "browse") && (
            <>
              <Field label={t("url")} value={dialog.url} onChange={(url) => setDialog({ ...dialog, url })} list={props.urls} onDelete={props.onDeleteUrl} />
              {dialog.type === "clone" && (
                <Field label={t("destination")} value={dialog.destination} onChange={(destination) => setDialog({ ...dialog, destination })} />
              )}
              <Field label={t("username")} value={dialog.username} onChange={(username) => setDialog({ ...dialog, username })} />
              <Field label={t("password")} value={dialog.password} password onChange={(password) => setDialog({ ...dialog, password })} />
            </>
          )}
          {dialog.type === "auth" && (
            <>
              <Field label={t("username")} value={dialog.username} onChange={(username) => setDialog({ ...dialog, username })} />
              <Field label={t("password")} value={dialog.password} password onChange={(password) => setDialog({ ...dialog, password })} />
              <label><span /><input type="checkbox" checked={dialog.remember} onChange={(event) => setDialog({ ...dialog, remember: event.target.checked })} /> {t("remember")}</label>
            </>
          )}
          {dialog.type === "commit" && props.settings && (
            <>
              <label>{t("category")}
                <select value={dialog.category} onChange={(event) => setDialog({ ...dialog, category: event.target.value })}>
                  {props.settings.commitCategories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              <Field label={t("subject")} value={dialog.subject} onChange={(subject) => setDialog({ ...dialog, subject })} />
              <label>{t("body")}<textarea value={dialog.body} onChange={(event) => setDialog({ ...dialog, body: event.target.value })} /></label>
              <button type="button" onClick={() => setDialog({ type: "categories", text: props.settings?.commitCategories.join("\n") ?? "" })}>{t("manageCategories")}</button>
            </>
          )}
          {dialog.type === "categories" && (
            <label>{t("category")}<textarea value={dialog.text} onChange={(event) => setDialog({ ...dialog, text: event.target.value })} /></label>
          )}
          {dialog.type === "prefs" && (
            <>
              <div className="prefs-tabs">
                <button type="button" className={prefsTab === "general" ? "active" : ""} aria-pressed={prefsTab === "general"} onClick={() => setPrefsTab("general")}>
                  <Icon name="prefs" />{t("prefsGeneral")}
                </button>
                <button type="button" className={prefsTab === "theme" ? "active" : ""} aria-pressed={prefsTab === "theme"} onClick={() => setPrefsTab("theme")}>
                  <Icon name="theme" />{t("theme")}
                </button>
                <button type="button" className={prefsTab === "tools" ? "active" : ""} aria-pressed={prefsTab === "tools"} onClick={() => setPrefsTab("tools")}>
                  <Icon name="snapshot" />{t("prefsTools")}
                </button>
              </div>
              <div className={prefsTab === "tools" ? "prefs-page tools" : "prefs-page"}>
                {prefsTab === "general" && (
                  <>
                    <label>{t("language")}
                      <select value={dialog.language} onChange={(event) => {
                        const language = event.target.value === "en" ? "en" : "ko";
                        setDialog({ ...dialog, language });
                        props.onPrefs({ language });
                      }}>
                        <option value="ko">한국어</option>
                        <option value="en">English</option>
                      </select>
                    </label>
                    <label>{t("terminalShell")}
                      <select value={dialog.shell} onChange={(event) => {
                        const shell = event.target.value;
                        setDialog({ ...dialog, shell });
                        props.onPrefs({ terminalShell: shell });
                      }}>
                        {shells.map((shell) => <option key={shell.id} value={shell.id}>{shell.label}</option>)}
                      </select>
                    </label>
                  </>
                )}
                {prefsTab === "theme" && dialog.type === "prefs" && (
                  <ThemePicker
                    lang={dialog.language}
                    value={dialog.theme}
                    lightLabel={t("themeLight")}
                    darkLabel={t("themeDark")}
                    onChange={(theme) => {
                      setDialog({ ...dialog, theme });
                      props.onTheme(theme);
                    }}
                  />
                )}
                {prefsTab === "tools" && dialog.type === "prefs" && (
                  <>
                    <div className="tool-block">
                      <div className="tool-line">
                        <span>{t("diffTool")}</span>
                        <span className="tool-pick">
                          <select value={selectedDiffTool(diffTools, dialog.tool)} onChange={(event) => {
                            const tool = event.target.value;
                            const known = diffTools.find((item) => sameToolPath(item.id, tool));
                            const args = known?.args || dialog.args;
                            setDialog({ ...dialog, tool, args });
                            props.onPrefs({ externalDiffToolPath: tool, externalDiffToolArguments: args });
                          }}>
                            <option value="">{t("empty")}</option>
                            {diffToolOptions(diffTools, dialog.tool, dialog.args).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                          </select>
                          <button type="button" onClick={() => void browseExternalTool("diff", dialog, diffTools, setDialog, props.onPrefs, t)}>{t("diffBrowse")}</button>
                        </span>
                      </div>
                      <div className="tool-line">
                        <span>{t("path")}</span>
                        <input value={dialog.tool} onChange={(event) => { const tool = event.target.value; setDialog({ ...dialog, tool }); props.onPrefs({ externalDiffToolPath: tool }); }} />
                      </div>
                      <div className="tool-line">
                        <span title={t("diffArgs")}>{t("toolArgs")}</span>
                        <input value={dialog.args} title={t("diffArgs")} onChange={(event) => { const args = event.target.value; setDialog({ ...dialog, args }); props.onPrefs({ externalDiffToolArguments: args }); }} />
                      </div>
                    </div>
                    <div className="tool-block">
                      <div className="tool-line">
                        <span title={t("mergeTool")}>{t("mergeTool")}</span>
                        <span className="tool-pick">
                          <select value={selectedMergeTool(diffTools, dialog.mergeTool)} onChange={(event) => {
                            const mergeTool = event.target.value;
                            if (isBuiltinMergeTool(mergeTool)) {
                              setDialog({ ...dialog, mergeTool: BUILTIN_MERGE_TOOL });
                              props.onPrefs({ externalMergeToolPath: BUILTIN_MERGE_TOOL });
                              return;
                            }
                            const known = diffTools.find((item) => sameToolPath(item.id, mergeTool));
                            const mergeArgs = known?.mergeArgs || dialog.mergeArgs;
                            setDialog({ ...dialog, mergeTool, mergeArgs });
                            props.onPrefs({ externalMergeToolPath: mergeTool, externalMergeToolArguments: mergeArgs });
                          }}>
                            {mergeToolOptions(diffTools, dialog.mergeTool, t("builtinMergeTool")).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                          </select>
                          <button type="button" onClick={() => void browseExternalTool("merge", dialog, diffTools, setDialog, props.onPrefs, t)}>{t("diffBrowse")}</button>
                        </span>
                      </div>
                      <div className="tool-line">
                        <span>{t("path")}</span>
                        <input
                          value={isBuiltinMergeTool(dialog.mergeTool) ? "" : dialog.mergeTool}
                          disabled={isBuiltinMergeTool(dialog.mergeTool)}
                          placeholder={isBuiltinMergeTool(dialog.mergeTool) ? t("builtinMergeTool") : ""}
                          onChange={(event) => { const mergeTool = event.target.value; setDialog({ ...dialog, mergeTool }); props.onPrefs({ externalMergeToolPath: mergeTool }); }}
                        />
                      </div>
                      <div className="tool-line">
                        <span title={t("mergeArgs")}>{t("toolArgs")}</span>
                        <input value={dialog.mergeArgs} title={t("mergeArgs")} disabled={isBuiltinMergeTool(dialog.mergeTool)} onChange={(event) => { const mergeArgs = event.target.value; setDialog({ ...dialog, mergeArgs }); props.onPrefs({ externalMergeToolArguments: mergeArgs }); }} />
                      </div>
                      <div className="tool-hint">{t("mergeToolHint")}</div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
          {dialog.type === "confirm" && <pre className="detail">{dialog.message}</pre>}
          {dialog.type === "prompt" && <Field label={dialog.label} value={dialog.value} onChange={(value) => setDialog({ ...dialog, value })} />}
          {dialog.type === "text" && <pre className="detail">{dialog.text}</pre>}
          {dialog.type === "report" && <ReportPreview report={dialog.report} more={t("reportListed")} />}
          {dialog.type === "print" && (
            <PrintPreview
              report={dialog.report}
              setup={dialog.setup}
              t={t}
              onSetup={(setup) => setDialog({ ...dialog, setup })}
            />
          )}
          {dialog.type === "about" && (
            <div className="about-body">
              <img className="about-icon" src={`${import.meta.env.BASE_URL}icon.png`} alt="" />
              <div className="about-copy">
                <p className="about-name"><strong>MyGit</strong><span>{packageJson.version}</span></p>
                <p>{t("aboutText")}</p>
              </div>
              <dl className="about-meta">
                <dt>{t("appVersion")}</dt>
                <dd>{packageJson.version}</dd>
                <dt>{t("buildInfo")}</dt>
                <dd>{formatBuild(__MYGIT_BUILD__)}</dd>
                <dt>{t("platform")}</dt>
                <dd>{platformName()}</dd>
                <dt>{t("creator")}</dt>
                <dd className="about-author">{t("authorName")}</dd>
                {props.settings?.settingsPath && (
                  <>
                    <dt>{t("settingsFile")}</dt>
                    <dd>{props.settings.settingsPath}</dd>
                  </>
                )}
              </dl>
            </div>
          )}
          {dialog.type === "error" && (
            <textarea className="error-detail" readOnly value={dialog.detail} onFocus={(event) => event.currentTarget.select()} />
          )}
          {dialog.type === "export" && <Field label={t("destination")} value={dialog.path} onChange={(path) => setDialog({ ...dialog, path })} />}
        </div>
        <footer>
          {dialog.type === "prefs" && (
            <button type="button" className="restore" onClick={() => void props.onRestore().then((saved) => {
              if (!saved) return;
              setDialog((current) => current?.type === "prefs" ? {
                ...current,
                language: saved.language,
                theme: saved.theme,
                tool: saved.externalDiffToolPath,
                args: saved.externalDiffToolArguments || "\"{left}\" \"{right}\"",
                mergeTool: saved.externalMergeToolPath,
                mergeArgs: saved.externalMergeToolArguments || "\"{base}\" \"{local}\" \"{remote}\" \"{merged}\"",
                shell: saved.terminalShell || preferredShell,
              } : current);
            })}>
              <Icon name="undo" />
              {t("restoreDefaults")}
            </button>
          )}
          {dialog.type !== "error" && dialog.type !== "text" && dialog.type !== "about" && dialog.type !== "report" && dialog.type !== "print" && (
            <button type="button" onClick={close}>{t("cancel")}</button>
          )}
          {dialog.type === "auth" && <button className="primary" type="button" onClick={() => { dialog.resolve({ username: dialog.username, password: dialog.password, remember: dialog.remember }); setDialog(null); }}>{t("ok")}</button>}
          {dialog.type === "confirm" && <button className="primary" type="button" onClick={() => { dialog.resolve(true); setDialog(null); }}>{t("ok")}</button>}
          {dialog.type === "prompt" && <button className="primary" type="button" onClick={() => { dialog.resolve(dialog.value.trim() || null); setDialog(null); }}>{t("ok")}</button>}
          {(dialog.type === "report" || (dialog.type === "text" && dialog.save)) && (
            <ReportActions t={t} onExport={props.onExport} />
          )}
          {dialog.type === "print" && <button type="button" onClick={close}>{t("close")}</button>}
          {dialog.type === "print" && <button className="primary" type="button" onClick={props.onPrint}>{t("print")}</button>}
          {(dialog.type === "open" || dialog.type === "clone" || dialog.type === "browse" || dialog.type === "commit" || dialog.type === "categories" || dialog.type === "prefs" || dialog.type === "export") && (
            <button className="primary" type="submit">{t("ok")}</button>
          )}
          {(dialog.type === "error" || dialog.type === "text" || dialog.type === "about" || dialog.type === "report") && (
            <>
              {dialog.type === "error" && (
                <button type="button" onClick={() => void copyDetail(dialog.detail)}>
                  <Icon name="copy" />
                  {copied ? t("copied") : t("copy")}
                </button>
              )}
              <button className="primary" type="button" onClick={close}>{t("close")}</button>
            </>
          )}
        </footer>
      </form>
    </div>
  );
}

function Field(props: { label: string; value: string; password?: boolean; list?: string[]; onChange: (value: string) => void; onDelete?: (url: string) => void }) {
  return (
    <label>
      {props.label}
      <input type={props.password ? "password" : "text"} value={props.value} list={props.list ? "recent-urls" : undefined} onChange={(event) => props.onChange(event.target.value)} />
      {props.list && (
        <datalist id="recent-urls">
          {props.list.map((url) => <option key={url} value={url} />)}
        </datalist>
      )}
    </label>
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

function iconOf(dialog: DialogState, t: (key: string) => string): IconName {
  switch (dialog.type) {
    case "open": return "open";
    case "clone": return "clone";
    case "browse": return "browse";
    case "auth": return "lock";
    case "commit": return "commit";
    case "categories": return "list";
    case "prefs": return "prefs";
    case "confirm":
      if (dialog.title === t("delete")) return "trash";
      if (dialog.title === t("discard")) return "discard";
      return "plus";
    case "prompt": return dialog.title === t("newFolder") ? "folderPlus" : "filePlus";
    case "text": return dialog.save ? "print" : "status";
    case "report": return "print";
    case "print": return "print";
    case "about": return "help";
    case "error": return "alert";
    case "export": return "snapshot";
  }
}

function titleOf(dialog: DialogState, t: (key: string) => string): string {
  switch (dialog.type) {
    case "open": return t("open");
    case "clone": return t("clone");
    case "browse": return t("browse");
    case "auth": return t("authTitle");
    case "commit": return t("commitTitle");
    case "categories": return t("categoriesTitle");
    case "prefs": return t("prefsTitle");
    case "confirm": return dialog.title;
    case "prompt": return dialog.title;
    case "text": return dialog.title;
    case "report": return dialog.report.title;
    case "print": return t("printFile");
    case "about": return t("about");
    case "error": return t("errorTitle");
    case "export": return t("exportCommit");
    default: return "";
  }
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

function ReportPreview({ report, more }: { report: Report; more: string }) {
  return (
    <div className="report-preview">
      <p className="meta">{report.generatedAt}</p>
      <table className="report-table">
        <tbody>
          {report.summary.map((row) => (
            <tr key={row.label}><th>{row.label}</th><td>{row.value}</td></tr>
          ))}
        </tbody>
      </table>
      {report.tables.map((table) => (
        <section key={table.title}>
          <h3>{table.title}</h3>
          <table className="report-table">
            <thead><tr>{table.headers.map((cell, index) => <th key={index}>{cell}</th>)}</tr></thead>
            <tbody>
              {table.rows.slice(0, 8).map((row, index) => (
                <tr key={index}>{table.headers.map((_, column) => <td key={column}>{row[column] ?? ""}</td>)}</tr>
              ))}
            </tbody>
          </table>
          {table.rows.length > 8 && <p className="meta">{more}: {table.rows.length}</p>}
        </section>
      ))}
      {report.text && (
        <section>
          <h3>{report.text.title}</h3>
          <pre className="detail">{report.text.body}</pre>
        </section>
      )}
    </div>
  );
}

function ReportActions(props: { t: (key: string) => string; onExport: (kind: ReportFormat | "print") => void }) {
  const items: { kind: ReportFormat | "print"; label: string; icon: IconName }[] = [
    { kind: "print", label: props.t("print"), icon: "print" },
    { kind: "md", label: props.t("saveMarkdown"), icon: "export" },
    { kind: "docx", label: props.t("saveWord"), icon: "export" },
    { kind: "xlsx", label: props.t("saveExcel"), icon: "export" },
    { kind: "csv", label: props.t("saveCsv"), icon: "export" },
    { kind: "pdf", label: props.t("savePdf"), icon: "export" },
  ];
  return (
    <>
      {items.map((item) => (
        <button key={item.kind} type="button" onClick={() => props.onExport(item.kind)}>
          <Icon name={item.icon} />
          {item.label}
        </button>
      ))}
    </>
  );
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
