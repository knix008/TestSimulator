/**
 * Application state.
 *
 * One store holds the settings, the open tabs and the undo stack, and exposes the
 * operations the toolbar, the menus, the panels and the keyboard all call. Keeping
 * them in one place is what lets the same action be reachable four ways — a toolbar
 * button, a menu row, a context menu and a shortcut — without four implementations.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { APP_NAME, DOC_EXTENSION } from "../core/appInfo.js";
import type { DirectoryCompareResult } from "../core/dirCompare.js";
import { translator, type Language, type StringKey } from "../core/i18n.js";
import {
  buildResultText,
  conflictCount,
  isFullyResolved,
  resolvedCount,
  withAllResolutions,
  withCleanLine,
  withResolution,
  withResolvedLine,
  type ConflictResolution,
  type MergeDocument,
} from "../core/mergeDocument.js";
import { defaultSettings, recentKey, type AppSettings, type RecentEntry } from "../core/settings.js";
import { defaultSessionName, type SavedSession, type SessionKind } from "../core/sessions.js";
import type { FormatId } from "../core/formats.js";
import type { SyncMode, SyncPlan } from "../core/sync.js";
import { applyTheme } from "../core/themes.js";
import { UndoStack } from "../core/undo.js";
import {
  ApiFailure,
  api,
  type FileOperation,
  type Bootstrap,
  type CompareSummary,
  type GitChange,
  type GitViewSpec,
  type MergeSessionInfo,
  type RepoInfo,
} from "./api.js";
import * as host from "./host.js";

/* ------------------------------------------------------------------ *
 * Tabs
 * ------------------------------------------------------------------ */

export type CompareTab = {
  kind: "compare";
  id: string;
  title: string;
  summary: CompareSummary;
  /** Row the panes are focused on, so Previous/Next and the overview agree. */
  cursor: number;
};

export type DirectoryTab = {
  kind: "directory";
  id: string;
  title: string;
  directoryId: string;
  result: DirectoryCompareResult;
  selected: string | null;
  filters: { same: boolean; different: boolean; leftOnly: boolean; rightOnly: boolean; renamed: boolean };
  /**
   * Set when the tab was opened as a synchronisation rather than a comparison. The
   * plan is what the preview showed and what Run will carry out — kept here so the
   * two can never be different things.
   */
  sync: { mode: SyncMode; allowDaylightShift: boolean; plan: SyncPlan | null } | null;
};

export type MergeTab = {
  kind: "merge";
  id: string;
  title: string;
  info: MergeSessionInfo;
  document: MergeDocument;
  dirty: boolean;
  selectedConflict: number;
  cursor: number;
};

export type GitTab = {
  kind: "git";
  id: string;
  title: string;
  repository: RepoInfo;
  view: GitViewSpec;
  changes: GitChange[];
  conflicted: string[];
  selected: GitChange | null;
};

export type Tab = CompareTab | DirectoryTab | MergeTab | GitTab;

export type ErrorReport = { title: string; message: string; detail: string; code: string };

/**
 * Somewhere the user has been.
 *
 * A tab is not enough on its own: looking at a repository's changes and then at one
 * of its commits never leaves the tab, and going "back" has to return to the
 * changes. So a place is the tab *and* what was being shown in it.
 */
export type Place = { tabId: string; view?: GitViewSpec; cursor?: number };

/** How far back the history remembers. */
const MAX_HISTORY = 50;

/** One line of the activity log shown in the bottom panel. */
export type LogEntry = { at: number; kind: "info" | "error"; text: string };

/** How much of the log is kept; older lines fall off the top. */
const MAX_LOG = 500;

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

export type AppStore = {
  ready: boolean;
  bootstrap: Bootstrap | null;
  settings: AppSettings & { settingsPath: string };
  t: (key: StringKey, ...args: (string | number)[]) => string;
  language: Language;

  tabs: Tab[];
  activeId: string | null;
  active: Tab | null;
  setActive: (id: string) => void;
  closeTab: (id: string) => void;

  status: string;
  setStatus: (text: string) => void;

  /** Where the user has been, and how to go back and forward through it. */
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;

  /** Everything the status bar has said this session, newest last. */
  log: LogEntry[];
  clearLog: () => void;

  undo: UndoStack;
  undoVersion: number;

  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;

  openFiles: (left: string, right: string, forceHex?: boolean, format?: FormatId) => Promise<void>;
  openDirectories: (left: string, right: string, sync?: boolean) => Promise<void>;
  /** A folder here against one on an FTP server. */
  openRemoteDirectories: (local: string, remote: string, password: string) => Promise<void>;
  openDirectoryEntry: (tab: DirectoryTab, rel: string) => Promise<void>;
  openThreeWay: (base: string, local: string, remote: string, merged: string) => Promise<void>;
  openConflictFile: (path: string) => Promise<void>;
  openRepository: (path: string) => Promise<void>;
  openGitChange: (tab: GitTab, change: GitChange) => Promise<void>;
  openRepositoryConflict: (tab: GitTab, file: string) => Promise<void>;
  openDropped: (paths: string[]) => Promise<void>;
  openRecentEntry: (kind: string, paths: string[]) => Promise<void>;

  reloadActive: () => Promise<void>;
  swapActive: () => Promise<void>;
  /** Re-points one side of a directory comparison from its own path bar. */
  setDirectoryRoot: (tab: DirectoryTab, side: "left" | "right", root: string) => Promise<void>;
  /** Copy or delete entries between the two sides of a directory comparison. */
  directoryOperation: (tab: DirectoryTab, operation: FileOperation, relatives: string[]) => Promise<void>;
  /** Renames the selected entry on the side that has it. */
  renameDirectoryEntry: (tab: DirectoryTab) => Promise<void>;
  /** Re-plans a synchronisation; the preview is the plan. */
  planDirectorySync: (tab: DirectoryTab, patch: { mode?: SyncMode; allowDaylightShift?: boolean }) => Promise<void>;
  /** Carries out the plan that is on screen, after confirming it. */
  runDirectorySync: (tab: DirectoryTab) => Promise<void>;
  /** Copy rows from one side of a file comparison to the other, and write it out. */
  takeRows: (tab: CompareTab, target: "left" | "right", rows: number[]) => Promise<void>;
  /** Replace one line of one side and write it out. */
  editCompareRow: (tab: CompareTab, side: "left" | "right", row: number, text: string) => Promise<void>;
  /** Re-points one side of a file comparison from its own path bar. */
  setCompareSide: (tab: CompareTab, side: "left" | "right", file: string) => Promise<void>;

  resolveConflict: (resolution: ConflictResolution) => void;
  resolveAll: (resolution: ConflictResolution) => void;
  selectConflict: (index: number) => void;
  editLine: (region: number, line: number, text: string, conflict: number | null) => void;
  saveMerge: (saveAs: boolean) => Promise<void>;

  saveSessionDocument: (saveAs: boolean) => Promise<void>;
  loadSessionDocument: (path: string) => Promise<void>;

  /** Keeps the active tab in the session list under a name the user gives it. */
  saveSession: () => Promise<void>;
  openSavedSession: (session: SavedSession) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  removeRecent: (entry: Pick<RecentEntry, "kind" | "paths">) => Promise<void>;
  clearRecent: () => Promise<void>;

  setCursor: (row: number) => void;
  setDirectorySelection: (rel: string | null) => void;
  setDirectoryFilters: (filters: DirectoryTab["filters"]) => void;
  setGitSelection: (change: GitChange | null) => void;
  setGitView: (view: GitViewSpec) => Promise<void>;

  report: (error: unknown, title?: string) => void;
  withProgress: <T>(labelKey: StringKey, work: () => Promise<T>) => Promise<T>;
  dirty: boolean;
};

const StoreContext = createContext<AppStore | null>(null);

export function useApp(): AppStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useApp must be used inside <AppProvider>");
  return store;
}

let tabCounter = 0;
const newTabId = () => `tab-${(tabCounter += 1)}`;

export function AppProvider({ children }: { children: ReactNode }) {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [settings, setSettings] = useState<AppSettings & { settingsPath: string } | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatusText] = useState<string>("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [history, setHistory] = useState<Place[]>([]);
  const [historyAt, setHistoryAt] = useState(-1);
  /** Set while Back or Forward is moving us, so the move is not itself recorded. */
  const travelling = useRef(false);
  const [undoVersion, setUndoVersion] = useState(0);
  const undo = useRef(new UndoStack()).current;
  const tabsRef = useRef<Tab[]>([]);
  tabsRef.current = tabs;
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeId;
  // Read by the session actions, which must see the settings as they are now
  // rather than as they were when the callback was made.
  const settingsRef = useRef<(AppSettings & { settingsPath: string }) | null>(null);
  settingsRef.current = settings;

  useEffect(() => undo.subscribe(() => setUndoVersion((value) => value + 1)), [undo]);

  /*
   * The status bar and the log are the same stream seen two ways: the bar shows the
   * last line, the panel keeps them all. Routing every message through here is what
   * makes the log complete without a logging call at each of the fifty call sites.
   */
  const append = useCallback((kind: LogEntry["kind"], text: string) => {
    if (!text) return;
    setLog((entries) => [...entries, { at: Date.now(), kind, text }].slice(-MAX_LOG));
  }, []);

  const setStatus = useCallback((text: string) => {
    setStatusText(text);
    append("info", text);
  }, [append]);

  const clearLog = useCallback(() => setLog([]), []);

  /*
   * Recording a place.
   *
   * Everything that changes what is on screen calls this, and it drops anything
   * ahead of the current point — going back and then somewhere new abandons the
   * forward branch, which is what every browser does and what people expect.
   */
  const visit = useCallback((place: Place) => {
    if (travelling.current) return;
    setHistory((current) => {
      const trimmed = current.slice(0, historyAtRef.current + 1);
      const last = trimmed[trimmed.length - 1];
      if (last && last.tabId === place.tabId && sameView(last.view, place.view)) return current;
      const next = [...trimmed, place].slice(-MAX_HISTORY);
      historyAtRef.current = next.length - 1;
      setHistoryAt(next.length - 1);
      return next;
    });
  }, []);

  const historyAtRef = useRef(-1);
  historyAtRef.current = historyAt;

  const language: Language = settings?.language ?? "ko";
  const t = useMemo(() => translator(language), [language]);

  /* ------------------------------------------------------- bootstrap */

  const report = useCallback((error: unknown, title?: string) => {
    const failure = error instanceof ApiFailure
      ? error
      : new ApiFailure(error instanceof Error ? error.message : String(error), "ERROR", String(error), 0);
    const payload: ErrorReport = {
      title: title ?? "",
      message: failure.message,
      detail: failure.detail || failure.message,
      code: failure.code,
    };
    host.openDialog("error", payload);
    setStatusText(failure.message);
    append("error", failure.detail || failure.message);
  }, [append]);

  const withProgress = useCallback(async <T,>(labelKey: StringKey, work: () => Promise<T>): Promise<T> => {
    // Only slow work gets a popup; flashing one up for 40ms would be worse than none.
    let shown = false;
    const timer = setTimeout(() => {
      shown = true;
      host.openDialog("progress", { label: labelKey });
    }, 350);
    try {
      return await work();
    } finally {
      clearTimeout(timer);
      if (shown) host.closeDialog("progress");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.bootstrap()
      .then((data) => {
        if (cancelled) return;
        setBootstrap(data);
        setSettings(data.settings);
      })
      .catch((error) => {
        if (!cancelled) report(error);
      });
    return () => {
      cancelled = true;
    };
  }, [report]);

  /* --------------------------------------------------------- theming */

  // Settings written from another window (the Settings dialog is its own window)
  // come back through the host and replace ours.
  useEffect(() => host.onSettingsPublished((saved) => {
    if (saved && typeof saved === "object") setSettings(saved as AppSettings & { settingsPath: string });
  }), []);

  useEffect(() => {
    if (!settings) return;
    const applied = applyTheme(settings.theme, settings.customTheme);
    host.setBackgroundColor(applied.background);
    host.setNativeTheme(applied.kind);
    const root = document.documentElement;
    root.style.setProperty("--pane-font", settings.font.family);
    root.style.setProperty("--pane-font-size", `${settings.font.size}px`);
    root.style.setProperty("--pane-font-weight", settings.font.weight);
    root.style.setProperty("--pane-font-style", settings.font.style);
    root.style.setProperty("--zoom", String(settings.zoom / 100));
    root.lang = settings.language;
    host.broadcastSettings(settings);
  }, [settings]);

  /* ------------------------------------------------------- tab state */

  const active = useMemo(() => tabs.find((tab) => tab.id === activeId) ?? null, [tabs, activeId]);

  const patchTab = useCallback(<T extends Tab>(id: string, patch: (tab: T) => T) => {
    setTabs((current) => current.map((tab) => (tab.id === id ? patch(tab as T) : tab)));
  }, []);

  const addTab = useCallback((tab: Tab) => {
    setTabs((current) => [...current, tab]);
    setActiveId(tab.id);
    visit({ tabId: tab.id });
  }, [visit]);

  /** Switching tab by hand is a place too, so Back comes back to this one. */
  const setActive = useCallback((id: string) => {
    setActiveId(id);
    const tab = tabsRef.current.find((item) => item.id === id);
    visit({ tabId: id, view: tab?.kind === "git" ? tab.view : undefined });
  }, [visit]);

  const closeTab = useCallback((id: string) => {
    setTabs((current) => {
      const next = current.filter((tab) => tab.id !== id);
      if (activeRef.current === id) setActiveId(next.length > 0 ? next[next.length - 1].id : null);
      return next;
    });
    const tab = tabsRef.current.find((item) => item.id === id);
    if (tab?.kind === "compare") api.closeCompare(tab.summary.id).catch(() => {});
  }, []);

  /* -------------------------------------------------------- settings */

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    // Applied locally first so the UI never lags a click behind the disk write.
    setSettings((current) => (current ? { ...current, ...patch } : current));
    try {
      const saved = await api.updateSettings(patch);
      setSettings(saved);
    } catch (error) {
      report(error);
    }
  }, [report]);

  const resetSettings = useCallback(async () => {
    try {
      setSettings(await api.resetSettings());
    } catch (error) {
      report(error);
    }
  }, [report]);

  /* ----------------------------------------------------------- open */

  const openFiles = useCallback(async (
    left: string,
    right: string,
    forceHex = false,
    format?: FormatId,
  ) => {
    try {
      const summary = await withProgress("progress.readingFiles",
        () => api.compareFiles(left, right, forceHex, format));
      addTab({
        kind: "compare",
        id: newTabId(),
        title: `${baseName(summary.left.label)} ↔ ${baseName(summary.right.label)}`,
        summary,
        cursor: summary.diffBlocks[0] ?? 0,
      });
      setStatus(summary.identical ? t("status.identicalFiles") : summaryText(summary, t));
      setSettings(await api.settings());
    } catch (error) {
      report(error);
    }
  }, [addTab, report, t, withProgress]);

  const openDirectories = useCallback(async (left: string, right: string, sync = false) => {
    try {
      const directory = await withProgress("progress.comparingDirs", () => api.compareDirectories(left, right));
      addTab({
        kind: "directory",
        id: newTabId(),
        title: `${baseName(directory.result.left)} ↔ ${baseName(directory.result.right)}`,
        directoryId: directory.id,
        result: directory.result,
        selected: null,
        filters: { same: true, different: true, leftOnly: true, rightOnly: true, renamed: true },
        sync: sync ? { mode: "updateToRight", allowDaylightShift: true, plan: null } : null,
      });
      setStatus(directoryStatus(directory.result, t));
      setSettings(await api.settings());
    } catch (error) {
      report(error);
    }
  }, [addTab, report, t, withProgress]);

  const openRemoteDirectories = useCallback(async (
    local: string,
    remote: string,
    password: string,
  ) => {
    try {
      const directory = await withProgress("progress.comparingDirs",
        () => api.compareRemote(local, remote, password));
      addTab({
        kind: "directory",
        id: newTabId(),
        title: `${baseName(directory.result.left)} \u2194 ${baseName(directory.result.right)}`,
        directoryId: directory.id,
        result: directory.result,
        selected: null,
        filters: { same: true, different: true, leftOnly: true, rightOnly: true, renamed: true },
        sync: null,
      });
      setStatus(directoryStatus(directory.result, t));
    } catch (error) {
      report(error);
    }
  }, [addTab, report, setStatus, t, withProgress]);

  const openDirectoryEntry = useCallback(async (tab: DirectoryTab, rel: string) => {
    try {
      const summary = await withProgress("progress.readingFiles", () =>
        api.openDirectoryEntry(tab.directoryId, rel));
      addTab({
        kind: "compare",
        id: newTabId(),
        title: baseName(rel),
        summary,
        cursor: summary.diffBlocks[0] ?? 0,
      });
      setStatus(summaryText(summary, t));
    } catch (error) {
      report(error);
    }
  }, [addTab, report, t, withProgress]);

  const addMergeTab = useCallback((info: MergeSessionInfo) => {
    addTab({
      kind: "merge",
      id: newTabId(),
      title: baseName(info.mergedPath),
      info,
      document: info.document,
      dirty: false,
      selectedConflict: 0,
      cursor: 0,
    });
    undo.clear();
  }, [addTab, undo]);

  const openThreeWay = useCallback(async (base: string, local: string, remote: string, merged: string) => {
    try {
      const info = await withProgress("progress.readingFiles", () => api.openThreeWay(base, local, remote, merged));
      addMergeTab(info);
      setStatus(mergeStatus(info.document, t));
      setSettings(await api.settings());
    } catch (error) {
      report(error);
    }
  }, [addMergeTab, report, t, withProgress]);

  const openConflictFile = useCallback(async (path: string) => {
    try {
      const info = await withProgress("progress.readingFiles", () => api.openConflictFile(path));
      addMergeTab(info);
      setStatus(mergeStatus(info.document, t));
      setSettings(await api.settings());
    } catch (error) {
      report(error);
    }
  }, [addMergeTab, report, t, withProgress]);

  const openRepository = useCallback(async (path: string) => {
    try {
      const result = await withProgress("progress.loadingRepo", () => api.openRepository(path));
      addTab({
        kind: "git",
        id: newTabId(),
        title: baseName(result.repository.path),
        repository: result.repository,
        view: { mode: "work" },
        changes: result.changes,
        conflicted: result.conflicted,
        selected: result.changes[0] ?? null,
      });
      setStatus(`${result.repository.branch ?? result.repository.head ?? ""} — ${result.changes.length}`);
      setSettings(await api.settings());
    } catch (error) {
      report(error);
    }
  }, [addTab, report, withProgress]);

  const openGitChange = useCallback(async (tab: GitTab, change: GitChange) => {
    try {
      const summary = await withProgress("progress.readingFiles", () => api.openChange(tab.view, change));
      patchTab<GitTab>(tab.id, (current) => ({ ...current, selected: change }));
      addTab({
        kind: "compare",
        id: newTabId(),
        title: baseName(change.path),
        summary,
        cursor: summary.diffBlocks[0] ?? 0,
      });
    } catch (error) {
      report(error);
    }
  }, [addTab, patchTab, report, withProgress]);

  const openRepositoryConflict = useCallback(async (tab: GitTab, file: string) => {
    try {
      const info = await withProgress("progress.readingFiles", () =>
        api.openRepositoryConflict(tab.repository.path, file));
      addMergeTab(info);
      setStatus(mergeStatus(info.document, t));
    } catch (error) {
      report(error);
    }
  }, [addMergeTab, report, t, withProgress]);

  /** Drag & drop and the command line both land here. */
  const openDropped = useCallback(async (paths: string[]) => {
    const list = paths.filter(Boolean);
    if (list.length === 0) return;
    if (list.length >= 4) {
      await openThreeWay(list[0], list[1], list[2], list[3]);
      return;
    }
    if (list.length >= 2) {
      // Two folders compare as trees, two files as text; a mix is an error the server reports.
      const looksLikeDirectory = (value: string) => !/\.[A-Za-z0-9]{1,8}$/.test(value);
      if (looksLikeDirectory(list[0]) && looksLikeDirectory(list[1])) {
        await openDirectories(list[0], list[1]);
      } else {
        await openFiles(list[0], list[1]);
      }
      return;
    }
    const single = list[0];
    if (single.toLowerCase().endsWith(`.${DOC_EXTENSION}`)) {
      await loadSessionDocumentRef.current(single);
      return;
    }
    await openConflictFile(single).catch(() => {});
  }, [openConflictFile, openDirectories, openFiles, openThreeWay]);

  const openRecentEntry = useCallback(async (kind: string, paths: string[]) => {
    if (kind === "files" && paths.length >= 2) return openFiles(paths[0], paths[1]);
    if (kind === "directories" && paths.length >= 2) return openDirectories(paths[0], paths[1]);
    if (kind === "merge" && paths.length >= 4) return openThreeWay(paths[0], paths[1], paths[2], paths[3]);
    if (kind === "conflict" && paths.length >= 1) return openConflictFile(paths[0]);
    if (kind === "repository" && paths.length >= 1) return openRepository(paths[0]);
    if (kind === "session" && paths.length >= 1) return loadSessionDocumentRef.current(paths[0]);
    return undefined;
  }, [openConflictFile, openDirectories, openFiles, openRepository, openThreeWay]);

  /* --------------------------------------------------------- reload */

  const reloadActive = useCallback(async () => {
    const tab = tabsRef.current.find((item) => item.id === activeRef.current);
    if (!tab) return;
    try {
      if (tab.kind === "compare") {
        const summary = await withProgress("progress.readingFiles", () => api.reloadCompare(tab.summary.id));
        patchTab<CompareTab>(tab.id, (current) => ({ ...current, summary }));
        setStatus(summaryText(summary, t));
      } else if (tab.kind === "directory") {
        const directory = await withProgress("progress.comparingDirs", () => api.reloadDirectory(tab.directoryId));
        patchTab<DirectoryTab>(tab.id, (current) => ({ ...current, result: directory.result }));
        setStatus(directoryStatus(directory.result, t));
      } else if (tab.kind === "git") {
        const result = await withProgress("progress.loadingRepo", () => api.gitChanges(tab.view));
        patchTab<GitTab>(tab.id, (current) => ({
          ...current,
          repository: result.repository,
          changes: result.changes,
          conflicted: result.conflicted,
        }));
      }
    } catch (error) {
      report(error);
    }
  }, [patchTab, report, t, withProgress]);

  const swapActive = useCallback(async () => {
    const tab = tabsRef.current.find((item) => item.id === activeRef.current);
    if (!tab) return;
    if (tab.kind === "compare" && tab.summary.left.path && tab.summary.right.path) {
      closeTab(tab.id);
      await openFiles(tab.summary.right.path, tab.summary.left.path);
    } else if (tab.kind === "directory") {
      closeTab(tab.id);
      await openDirectories(tab.result.right, tab.result.left);
    }
  }, [closeTab, openDirectories, openFiles]);

  /**
   * Changing one side's path re-runs the comparison in place: the tab keeps its
   * position in the strip rather than a new one appearing beside it.
   */
  const setDirectoryRoot = useCallback(async (tab: DirectoryTab, side: "left" | "right", root: string) => {
    const left = side === "left" ? root : tab.result.left;
    const right = side === "right" ? root : tab.result.right;
    try {
      const directory = await withProgress("progress.comparingDirs", () => api.compareDirectories(left, right));
      patchTab<DirectoryTab>(tab.id, (current) => ({
        ...current,
        directoryId: directory.id,
        result: directory.result,
        selected: null,
        title: `${baseName(directory.result.left)} ↔ ${baseName(directory.result.right)}`,
      }));
      setStatus(directoryStatus(directory.result, t));
      setSettings(await api.settings());
    } catch (error) {
      report(error);
    }
  }, [patchTab, report, t, withProgress]);

  const directoryOperation = useCallback(async (
    tab: DirectoryTab,
    operation: FileOperation,
    relatives: string[],
  ) => {
    if (relatives.length === 0) return;
    if (operation === "deleteLeft" || operation === "deleteRight") {
      const confirmed = await host.openDialog<boolean>("confirm", {
        title: t("dlg.remove"),
        message: t("dir.confirmDelete", relatives.join(", ")),
      });
      if (!confirmed) return;
    }
    try {
      const response = await withProgress("progress.copying", () =>
        api.directoryOperate(tab.directoryId, operation, relatives));
      patchTab<DirectoryTab>(tab.id, (current) => ({
        ...current,
        directoryId: response.directory.id,
        result: response.directory.result,
      }));
      const failed = response.result.failed;
      setStatus(failed.length === 0
        ? t("dir.done", response.result.done.length)
        : t("dir.partly", response.result.done.length, failed.length));
      if (failed.length > 0) {
        report(new Error(failed.map((item) => `${item.rel}: ${item.reason}`).join("\n")));
      }
    } catch (error) {
      report(error);
    }
  }, [patchTab, report, t, withProgress]);

  const renameDirectoryEntry = useCallback(async (tab: DirectoryTab) => {
    const rel = tab.selected;
    if (!rel) return;
    const entry = tab.result.entries.find((item) => item.rel === rel);
    // Rename on the side that actually has the file; when both do, the left is the
    // one being edited, which is the convention everywhere else in the app.
    const side: "left" | "right" = entry?.status === "rightOnly" ? "right" : "left";

    const next = await host.askText({
      title: t("dir.rename"),
      label: t("dir.rename"),
      value: rel,
      hint: t("dir.renameHint"),
    });
    if (!next || next === rel) return;

    try {
      const response = await api.renameDirectoryEntry(tab.directoryId, side, rel, next);
      patchTab<DirectoryTab>(tab.id, (current) => ({
        ...current,
        directoryId: response.directory.id,
        result: response.directory.result,
        selected: next,
      }));
      setStatus(`${t("dir.rename")}: ${rel} → ${next}`);
    } catch (error) {
      report(error);
    }
  }, [patchTab, report, setStatus, t]);

  const planDirectorySync = useCallback(async (
    tab: DirectoryTab,
    patch: { mode?: SyncMode; allowDaylightShift?: boolean },
  ) => {
    const settings = {
      mode: patch.mode ?? tab.sync?.mode ?? "updateToRight",
      allowDaylightShift: patch.allowDaylightShift ?? tab.sync?.allowDaylightShift ?? true,
    };
    try {
      const plan = await api.syncPlan(tab.directoryId, settings.mode, {
        allowDaylightShift: settings.allowDaylightShift,
      });
      patchTab<DirectoryTab>(tab.id, (current) => ({ ...current, sync: { ...settings, plan } }));
      setStatus(t("sync.planned", plan.actions.length, plan.skipped));
    } catch (error) {
      report(error);
    }
  }, [patchTab, report, setStatus, t]);

  const runDirectorySync = useCallback(async (tab: DirectoryTab) => {
    const plan = tab.sync?.plan;
    if (!plan || plan.actions.length === 0) return;

    // Deletions are the part worth being sure about, so they are counted in the
    // question rather than buried in a total.
    const deletions = plan.actions.filter((action) => action.operation.startsWith("delete")).length;
    const confirmed = await host.openDialog<boolean>("confirm", {
      title: t("sync.run"),
      message: t("sync.confirm", plan.actions.length - deletions, deletions),
    });
    if (!confirmed) return;

    try {
      const response = await withProgress("progress.copying", () => api.syncApply(tab.directoryId, plan));
      const done = response.results.reduce((total, item) => total + item.done.length, 0);
      const failed = response.results.flatMap((item) => item.failed);
      patchTab<DirectoryTab>(tab.id, (current) => ({
        ...current,
        directoryId: response.directory.id,
        result: response.directory.result,
        sync: current.sync ? { ...current.sync, plan: null } : null,
      }));
      setStatus(failed.length === 0 ? t("dir.done", done) : t("dir.partly", done, failed.length));
      if (failed.length > 0) {
        report(new Error(failed.map((item) => `${item.rel}: ${item.reason}`).join("\n")));
      }
    } catch (error) {
      report(error);
    }
  }, [patchTab, report, setStatus, t, withProgress]);

  const takeRows = useCallback(async (tab: CompareTab, target: "left" | "right", rows: number[]) => {
    if (rows.length === 0) return;
    try {
      const summary = await withProgress("progress.saving", () => api.takeRows(tab.summary.id, target, rows));
      patchTab<CompareTab>(tab.id, (current) => ({ ...current, summary }));
      setStatus(summaryText(summary, t));
    } catch (error) {
      report(error);
    }
  }, [patchTab, report, t, withProgress]);

  const editCompareRow = useCallback(async (
    tab: CompareTab,
    side: "left" | "right",
    row: number,
    text_: string,
  ) => {
    try {
      const summary = await withProgress("progress.saving", () =>
        api.editRow(tab.summary.id, side, row, text_));
      patchTab<CompareTab>(tab.id, (current) => ({ ...current, summary }));
      setStatus(summaryText(summary, t));
    } catch (error) {
      report(error);
    }
  }, [patchTab, report, t, withProgress]);

  const setCompareSide = useCallback(async (tab: CompareTab, side: "left" | "right", file: string) => {
    const left = side === "left" ? file : tab.summary.left.path ?? tab.summary.left.label;
    const right = side === "right" ? file : tab.summary.right.path ?? tab.summary.right.label;
    try {
      const summary = await withProgress("progress.readingFiles", () => api.compareFiles(left, right));
      patchTab<CompareTab>(tab.id, (current) => ({
        ...current,
        summary,
        cursor: summary.diffBlocks[0] ?? 0,
        title: `${baseName(summary.left.label)} ↔ ${baseName(summary.right.label)}`,
      }));
      setStatus(summary.identical ? t("status.identicalFiles") : summaryText(summary, t));
      setSettings(await api.settings());
    } catch (error) {
      report(error);
    }
  }, [patchTab, report, t, withProgress]);

  /* ---------------------------------------------------------- merge */

  const applyMerge = useCallback((tabId: string, next: MergeDocument, label: string) => {
    const previous = (tabsRef.current.find((item) => item.id === tabId) as MergeTab | undefined)?.document;
    if (!previous) return;
    const set = (document: MergeDocument, dirty: boolean) => {
      patchTab<MergeTab>(tabId, (current) => ({ ...current, document, dirty }));
      // The status bar follows the resolution count, including through undo.
      setStatus(mergeStatus(document, t));
    };
    set(next, true);
    undo.push({
      label,
      undo: () => set(previous, true),
      redo: () => set(next, true),
    });
  }, [patchTab, t, undo]);

  const resolveConflict = useCallback((resolution: ConflictResolution) => {
    const tab = tabsRef.current.find((item) => item.id === activeRef.current);
    if (tab?.kind !== "merge") return;
    applyMerge(tab.id, withResolution(tab.document, tab.selectedConflict, resolution), `resolve:${resolution}`);
  }, [applyMerge]);

  const resolveAll = useCallback((resolution: ConflictResolution) => {
    const tab = tabsRef.current.find((item) => item.id === activeRef.current);
    if (tab?.kind !== "merge") return;
    applyMerge(tab.id, withAllResolutions(tab.document, resolution), `resolveAll:${resolution}`);
  }, [applyMerge]);

  const selectConflict = useCallback((index: number) => {
    const tab = tabsRef.current.find((item) => item.id === activeRef.current);
    if (tab?.kind !== "merge") return;
    const total = conflictCount(tab.document);
    if (total === 0) return;
    const clamped = ((index % total) + total) % total;
    patchTab<MergeTab>(tab.id, (current) => ({ ...current, selectedConflict: clamped }));
  }, [patchTab]);

  const editLine = useCallback((region: number, line: number, text: string, conflict: number | null) => {
    const tab = tabsRef.current.find((item) => item.id === activeRef.current);
    if (tab?.kind !== "merge") return;
    const next = conflict === null
      ? withCleanLine(tab.document, region, line, text)
      : withResolvedLine(tab.document, conflict, line, text);
    applyMerge(tab.id, next, "edit");
  }, [applyMerge]);

  const saveMerge = useCallback(async (saveAs: boolean) => {
    const tab = tabsRef.current.find((item) => item.id === activeRef.current);
    if (tab?.kind !== "merge") return;

    let target = tab.info.mergedPath;
    if (saveAs) {
      const chosen = await host.pickSave({ title: t("cmd.file.saveResultAs"), defaultPath: tab.info.mergedPath });
      if (!chosen) return;
      target = chosen;
    }

    const unresolved = conflictCount(tab.document) - resolvedCount(tab.document);
    if (unresolved > 0) {
      const confirmed = await host.openDialog<boolean>("confirm", {
        title: t("menu.merge"),
        message: t("misc.unresolvedWarning", unresolved),
      });
      if (!confirmed) return;
    }

    try {
      const result = await withProgress("progress.saving", () => api.saveMerge(tab.info.id, tab.document, target));
      patchTab<MergeTab>(tab.id, (current) => ({
        ...current,
        dirty: false,
        title: baseName(result.path),
        info: { ...current.info, mergedPath: result.path },
      }));
      if (isFullyResolved(tab.document)) host.reportMergeSaved();
      setStatus(`${t("status.saved")}: ${result.path}${result.staged ? " (git add)" : ""}`);
    } catch (error) {
      report(error);
    }
  }, [patchTab, report, t, withProgress]);

  /* ----------------------------------------------- session documents */

  const sessionPayload = useCallback(() => ({
    tabs: tabsRef.current.map((tab) => {
      if (tab.kind === "compare") {
        return { kind: "compare", left: tab.summary.left.path, right: tab.summary.right.path };
      }
      if (tab.kind === "directory") return { kind: "directory", left: tab.result.left, right: tab.result.right };
      if (tab.kind === "merge") {
        return {
          kind: "merge",
          source: tab.info.source,
          merged: tab.info.mergedPath,
          base: tab.info.basePath,
          local: tab.info.localPath,
          remote: tab.info.remotePath,
          document: tab.document,
        };
      }
      return { kind: "git", repository: tab.repository.path };
    }),
    activeIndex: tabsRef.current.findIndex((tab) => tab.id === activeRef.current),
  }), []);

  /*
   * A saved session is the active tab's kind and the paths it was opened on. It is
   * kept in the settings rather than in a file, because the point of the list is
   * that it is there next time without anyone having to go and find a file. The
   * name comes from the paths; the id is the paths, so saving the same comparison
   * twice updates one entry instead of making two.
   */
  const describeActive = useCallback((): { kind: SessionKind; paths: string[] } | null => {
    const tab = tabsRef.current.find((item) => item.id === activeRef.current);
    if (!tab) return null;
    if (tab.kind === "compare") {
      const left = tab.summary.left.path;
      const right = tab.summary.right.path;
      if (!left || !right) return null;
      const kind: SessionKind = tab.summary.mode === "binary" ? "hex-compare" : "text-compare";
      return { kind, paths: [left, right] };
    }
    if (tab.kind === "directory") {
      return { kind: "folder-compare", paths: [tab.result.left, tab.result.right] };
    }
    if (tab.kind === "merge") {
      const { basePath, localPath, remotePath, mergedPath } = tab.info;
      if (!basePath || !localPath || !remotePath || !mergedPath) return null;
      return { kind: "text-merge", paths: [basePath, localPath, remotePath, mergedPath] };
    }
    if (tab.kind === "git") return { kind: "repository", paths: [tab.repository.path] };
    return null;
  }, []);

  const saveSession = useCallback(async () => {
    const described = describeActive();
    if (!described) return;
    const entry: SavedSession = {
      id: `${described.kind}:${described.paths.join("|")}`,
      name: defaultSessionName(described.paths),
      kind: described.kind,
      paths: described.paths,
      at: Date.now(),
    };
    const rest = (settingsRef.current?.sessions ?? []).filter((item) => item.id !== entry.id);
    await updateSettings({ sessions: [entry, ...rest] });
    setStatus(`${t("session.saved")}: ${entry.name}`);
  }, [describeActive, setStatus, t, updateSettings]);

  const openSavedSession = useCallback(async (session: SavedSession) => {
    const rest = (settingsRef.current?.sessions ?? []).filter((item) => item.id !== session.id);
    await updateSettings({ sessions: [{ ...session, at: Date.now() }, ...rest] });
    const [a, b, c, d] = session.paths;
    switch (session.kind) {
      case "folder-compare":
      case "folder-sync":
        return openDirectories(a, b);
      case "text-merge":
        return openThreeWay(a, b, c, d);
      case "conflict":
        return openConflictFile(a);
      case "repository":
        return openRepository(a);
      default:
        return openFiles(a, b);
    }
  }, [openConflictFile, openDirectories, openFiles, openRepository, openThreeWay, updateSettings]);

  const removeSession = useCallback(async (id: string) => {
    const rest = (settingsRef.current?.sessions ?? []).filter((item) => item.id !== id);
    await updateSettings({ sessions: rest });
  }, [updateSettings]);

  /*
   * Recent entries go by identity rather than by position: the list is rewritten
   * every time something is opened, so the index the panel drew a row at is not
   * necessarily the row still there when the remove button is pressed.
   */
  const removeRecent = useCallback(async (entry: Pick<RecentEntry, "kind" | "paths">) => {
    const key = recentKey(entry);
    const rest = (settingsRef.current?.recent ?? []).filter((item) => recentKey(item) !== key);
    await updateSettings({ recent: rest });
  }, [updateSettings]);

  const clearRecent = useCallback(async () => {
    await updateSettings({ recent: [] });
  }, [updateSettings]);

  const saveSessionDocument = useCallback(async (saveAs: boolean) => {
    const target = await host.pickSave({
      title: t("cmd.file.saveSessionAs"),
      defaultPath: `session.${DOC_EXTENSION}`,
      filters: [{ name: "My Diff & Merge Session", extensions: [DOC_EXTENSION] }],
    });
    if (!target) return;
    void saveAs;
    try {
      const saved = await api.saveSession(target, sessionPayload());
      setStatus(`${t("status.saved")}: ${saved}`);
      setSettings(await api.settings());
    } catch (error) {
      report(error);
    }
  }, [report, sessionPayload, t]);

  const loadSessionDocument = useCallback(async (path: string) => {
    try {
      const loaded = await api.loadSession(path);
      const payload = loaded.payload as { tabs?: Record<string, string | null>[] } | null;
      for (const entry of payload?.tabs ?? []) {
        if (entry.kind === "compare" && entry.left && entry.right) await openFiles(entry.left, entry.right);
        else if (entry.kind === "directory" && entry.left && entry.right) await openDirectories(entry.left, entry.right);
        else if (entry.kind === "merge" && entry.merged) {
          if (entry.base && entry.local && entry.remote) {
            await openThreeWay(entry.base, entry.local, entry.remote, entry.merged);
          } else {
            await openConflictFile(entry.merged);
          }
        } else if (entry.kind === "git" && entry.repository) await openRepository(entry.repository);
      }
      setSettings(await api.settings());
    } catch (error) {
      report(error);
    }
  }, [openConflictFile, openDirectories, openFiles, openRepository, openThreeWay, report]);

  // `openDropped` needs the loader before it is defined; a ref keeps the dependency
  // graph honest instead of reordering the callbacks around it.
  const loadSessionDocumentRef = useRef(loadSessionDocument);
  loadSessionDocumentRef.current = loadSessionDocument;

  /* --------------------------------------------------- small setters */

  const setCursor = useCallback((row: number) => {
    const id = activeRef.current;
    if (!id) return;
    setTabs((current) => current.map((tab) => {
      if (tab.id !== id) return tab;
      if (tab.kind === "compare" || tab.kind === "merge") return { ...tab, cursor: row };
      return tab;
    }));
  }, []);

  const setDirectorySelection = useCallback((rel: string | null) => {
    const tab = tabsRef.current.find((item) => item.id === activeRef.current);
    if (tab?.kind !== "directory") return;
    patchTab<DirectoryTab>(tab.id, (current) => ({ ...current, selected: rel }));
  }, [patchTab]);

  const setDirectoryFilters = useCallback((filters: DirectoryTab["filters"]) => {
    const tab = tabsRef.current.find((item) => item.id === activeRef.current);
    if (tab?.kind !== "directory") return;
    patchTab<DirectoryTab>(tab.id, (current) => ({ ...current, filters }));
  }, [patchTab]);

  const setGitSelection = useCallback((change: GitChange | null) => {
    const tab = tabsRef.current.find((item) => item.id === activeRef.current);
    if (tab?.kind !== "git") return;
    patchTab<GitTab>(tab.id, (current) => ({ ...current, selected: change }));
  }, [patchTab]);

  const setGitView = useCallback(async (view: GitViewSpec) => {
    const tab = tabsRef.current.find((item) => item.id === activeRef.current);
    if (tab?.kind !== "git") return;
    try {
      const result = await withProgress("progress.loadingRepo", () => api.gitChanges(view));
      patchTab<GitTab>(tab.id, (current) => ({
        ...current,
        view,
        changes: result.changes,
        conflicted: result.conflicted,
        selected: result.changes[0] ?? null,
      }));
      // Moving between a repository's changes and one of its commits never leaves
      // the tab, so without this Back would skip straight past it.
      visit({ tabId: tab.id, view });
    } catch (error) {
      report(error);
    }
  }, [patchTab, report, visit, withProgress]);

  /* ------------------------------------------------- pending request */

  const pendingHandled = useRef(false);
  useEffect(() => {
    if (!bootstrap || pendingHandled.current) return;
    pendingHandled.current = true;
    const request = bootstrap.pending;
    if (!request) return;
    if (request.kind === "diff") void openFiles(request.left, request.right);
    else if (request.kind === "merge") void openThreeWay(request.base, request.local, request.remote, request.merged);
    else if (request.kind === "conflict") void openConflictFile(request.file);
    else if (request.kind === "repository") void openRepository(request.path);
    else if (request.kind === "session") void loadSessionDocument(request.file);
  }, [bootstrap, loadSessionDocument, openConflictFile, openFiles, openRepository, openThreeWay]);

  /* ------------------------------------------------------- the title */

  const dirty = tabs.some((tab) => tab.kind === "merge" && tab.dirty);

  useEffect(() => {
    if (!bootstrap) return;
    const name = active ? `${active.title} — ` : "";
    host.setTitle(`${name}${bootstrap.app.title}${dirty ? " *" : ""}`);
  }, [active, bootstrap, dirty]);

  /**
   * Returns to a place: the tab, and what was being shown in it.
   *
   * `travelling` is raised for the duration so that restoring a place does not
   * record it as a new one — otherwise Back would push the thing it just went back
   * to and the history would never move.
   */
  const travelTo = useCallback(async (index: number) => {
    const place = history[index];
    if (!place) return;
    const tab = tabsRef.current.find((item) => item.id === place.tabId);
    if (!tab) return;

    travelling.current = true;
    try {
      setActiveId(place.tabId);
      setHistoryAt(index);
      historyAtRef.current = index;
      if (place.view && tab.kind === "git" && !sameView(tab.view, place.view)) {
        await setGitViewRef.current(place.view);
      }
    } finally {
      travelling.current = false;
    }
  }, [history]);

  const setGitViewRef = useRef(setGitView);
  setGitViewRef.current = setGitView;

  // A place whose tab has since been closed is skipped rather than refusing to
  // move: closing a tab should not strand the history behind it.
  const findPlace = useCallback((from: number, step: -1 | 1): number => {
    const open = new Set(tabsRef.current.map((tab) => tab.id));
    for (let index = from + step; index >= 0 && index < history.length; index += step) {
      if (open.has(history[index].tabId)) return index;
    }
    return -1;
  }, [history]);

  const goBack = useCallback(() => {
    const index = findPlace(historyAt, -1);
    if (index >= 0) void travelTo(index);
  }, [findPlace, historyAt, travelTo]);

  const goForward = useCallback(() => {
    const index = findPlace(historyAt, 1);
    if (index >= 0) void travelTo(index);
  }, [findPlace, historyAt, travelTo]);

  const store: AppStore = {
    ready: Boolean(bootstrap && settings),
    bootstrap,
    // Until the real settings arrive the defaults stand in, complete. An empty
    // object here would be a half-built settings object for one render, and
    // anything reading a nested value — the theme menu reads `customTheme.bg` —
    // would take the whole window down before it had finished starting.
    settings: settings ?? { ...defaultSettings(), settingsPath: "" },
    t,
    language,
    tabs,
    activeId,
    active,
    setActive,
    closeTab,
    status: status || (settings ? t("status.ready") : APP_NAME),
    canGoBack: findPlace(historyAt, -1) >= 0,
    canGoForward: findPlace(historyAt, 1) >= 0,
    goBack,
    goForward,
    log,
    clearLog,
    setStatus,
    undo,
    undoVersion,
    updateSettings,
    resetSettings,
    openFiles,
    openDirectories,
    openRemoteDirectories,
    openDirectoryEntry,
    openThreeWay,
    openConflictFile,
    openRepository,
    openGitChange,
    openRepositoryConflict,
    openDropped,
    openRecentEntry,
    reloadActive,
    swapActive,
    setDirectoryRoot,
    setCompareSide,
    directoryOperation,
    renameDirectoryEntry,
    planDirectorySync,
    runDirectorySync,
    takeRows,
    editCompareRow,
    resolveConflict,
    resolveAll,
    selectConflict,
    editLine,
    saveMerge,
    saveSessionDocument,
    loadSessionDocument,
    saveSession,
    openSavedSession,
    removeSession,
    removeRecent,
    clearRecent,
    setCursor,
    setDirectorySelection,
    setDirectoryFilters,
    setGitSelection,
    setGitView,
    report,
    withProgress,
    dirty,
  };

  // The automation hook reads the live store rather than a copy of it, so what the
  // GUI test asserts is exactly what the app believes.
  (window as unknown as { __mdmStore?: AppStore }).__mdmStore = store;

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/* ------------------------------------------------------------------ *
 * formatting helpers
 * ------------------------------------------------------------------ */

export function baseName(target: string): string {
  if (!target) return "";
  const parts = target.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? target;
}

export function summaryText(summary: CompareSummary, t: AppStore["t"]): string {
  if (summary.identical) return t("status.identicalFiles");
  return `+${summary.added}  -${summary.removed}  ~${summary.modified}`;
}

export function directoryStatus(result: DirectoryCompareResult, t: AppStore["t"]): string {
  return [
    `${t("status.same")} ${result.same}`,
    `${t("status.different")} ${result.different}`,
    `${t("status.leftOnly")} ${result.leftOnly}`,
    `${t("status.rightOnly")} ${result.rightOnly}`,
  ].join("   ");
}

export function mergeStatus(document: MergeDocument, t: AppStore["t"]): string {
  const total = conflictCount(document);
  const resolved = resolvedCount(document);
  return `${t("status.conflicts")} ${resolved}/${total}`;
}

export { buildResultText };

/** Two git views are the same place when they show the same thing. */
function sameView(a: GitViewSpec | undefined, b: GitViewSpec | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.mode !== b.mode) return false;
  if (a.mode === "commit" && b.mode === "commit") return a.sha === b.sha;
  if (a.mode === "range" && b.mode === "range") return a.from === b.from && a.to === b.to;
  return true;
}
