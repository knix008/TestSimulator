/**
 * The main window's context menus.
 *
 * One `contextmenu` listener on the window decides every menu: a text field gets
 * Cut/Copy/Paste (followed by the menu of the place it sits in, if any), a place
 * marked with `data-context` gets its own menu from `contextMenus.ts`, the workspace
 * and the tab strip get the menu of the active tab, and everywhere else gets nothing —
 * never the WebView's own menu.
 *
 * The workspace and the tab strip still say which menu they want through their React
 * `onContextMenu`, as they always have; that handler now only labels the event
 * (`labelContextEvent`) and this listener, which runs after it, opens the menu.
 */
import { useEffect, useRef } from "react";
import { renderMessage, type AppStore } from "./state.js";
import type { MenuItem } from "./host.js";
import * as host from "./host.js";
import {
  buildMenu,
  CONTEXT_MENUS,
  COMMAND_TARGETS,
  editableTarget,
  isLocalItem,
  openContextMenuAt,
  runTextAction,
  sendContextAction,
  TEXT_MENU,
  textItemEnabled,
  withSelectionCopy,
  type CommandTarget,
  type ContextTarget,
  type TextField,
} from "./contextMenus.js";

const FALLBACK = Symbol("mcm.contextTarget");

/** Tags a right-click with the menu wanted when nothing more specific was clicked. */
export function labelContextEvent(event: { nativeEvent: Event }, target: ContextTarget): void {
  (event.nativeEvent as Event & { [FALLBACK]?: ContextTarget })[FALLBACK] = target;
}

/** What was right-clicked, captured before the menu opens and focus moves to it. */
type Clicked = {
  target: ContextTarget | null;
  holder: HTMLElement | null;
  field: TextField | null;
  node: Element | null;
  selection: string;
};

type Wiring = {
  app: AppStore;
  contextMenu: (target: CommandTarget) => MenuItem[];
  toItems: (ids: (string | "-")[]) => MenuItem[];
  choose: (id: string | null) => void;
};

export function useAppContextMenu(wiring: Wiring): void {
  // Read at the moment of the click, after the mouse-down it follows has re-rendered
  // (a tree row selects itself on mouse-down), so the menu's enabled states are fresh.
  const latest = useRef(wiring);
  latest.current = wiring;

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      const node = event.target instanceof Element ? event.target : null;
      const holder = node?.closest<HTMLElement>("[data-context]") ?? null;
      const declared = (holder?.dataset.context as ContextTarget | undefined) ?? null;
      const fallback = (event as MouseEvent & { [FALLBACK]?: ContextTarget })[FALLBACK] ?? null;
      const ownsInputs = holder?.dataset.contextInputs === "own";
      const field = ownsInputs ? null : editableTarget(node);
      const { clientX, clientY } = event;

      // One turn of the event loop: the mouse-down that preceded this event may have
      // changed the selection, and the menu has to describe the state after it.
      window.setTimeout(() => {
        const clicked: Clicked = {
          target: declared ?? (field ? null : fallback),
          holder,
          field,
          node,
          selection: window.getSelection()?.toString() ?? "",
        };
        void open(clicked, clientX, clientY);
      }, 0);
    };

    const open = async (clicked: Clicked, x: number, y: number) => {
      const { app, contextMenu, toItems, choose } = latest.current;
      const { t } = app;
      const resolve = (id: string): MenuItem[] => {
        if (id.startsWith("@")) {
          const target = id.slice(1);
          return (COMMAND_TARGETS as readonly string[]).includes(target) ? contextMenu(target as CommandTarget) : [];
        }
        return toItems([id]).filter((row) => row.kind !== "separator");
      };
      const enabled = (id: string) => localEnabled(id, clicked, app);

      let ids: string[] = [];
      if (clicked.field) ids = [...TEXT_MENU, ...(clicked.target ? ["-", ...CONTEXT_MENUS[clicked.target]] : [])];
      else if (clicked.target) ids = [...CONTEXT_MENUS[clicked.target]];

      let rows = buildMenu(ids, t, resolve, enabled);
      if (!clicked.field) rows = withSelectionCopy(rows, clicked.selection, t);
      if (rows.length === 0) return;

      const chosen = await openContextMenuAt(
        clicked.field ? "text" : clicked.target ?? "selection",
        rows,
        {
          theme: app.settings.theme,
          customTheme: app.settings.customTheme,
          language: app.settings.language,
          fontFamily: app.settings.font.family,
        },
        x,
        y,
      );
      if (!chosen) return;
      if (isLocalItem(chosen)) await runLocal(chosen, clicked, latest.current.app);
      else choose(chosen);
    };

    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, []);
}

/* ------------------------------------------------------------------ *
 * The local rows
 * ------------------------------------------------------------------ */

function key(clicked: Clicked): string {
  return clicked.holder?.dataset.contextKey ?? "";
}

function recentEntry(clicked: Clicked, app: AppStore) {
  return app.settings.recent?.[Number(key(clicked))] ?? null;
}

function savedSession(clicked: Clicked, app: AppStore) {
  return (app.settings.sessions ?? []).find((item) => item.id === key(clicked)) ?? null;
}

function directoryEntry(clicked: Clicked, app: AppStore) {
  const tab = app.active?.kind === "directory" ? app.active : null;
  const rel = key(clicked);
  if (!tab || !rel) return null;
  const entry = tab.result.entries.find((item) => item.rel === rel) ?? null;
  // A folder is either listed as an entry with no size, or not listed at all and only
  // implied by the paths under it.
  const folder = clicked.holder?.dataset.contextKind === "directory";
  return { tab, rel, entry, folder };
}

function gitChange(clicked: Clicked, app: AppStore) {
  const tab = app.active?.kind === "git" ? app.active : null;
  const change = tab?.changes[Number(key(clicked))] ?? null;
  if (!tab || !change) return null;
  const conflicted = change.scope === "conflicted" || tab.conflicted.includes(change.path);
  return { tab, change, conflicted };
}

/** Joins a root and a forward-slashed relative path with the root's own separator. */
function joinPath(root: string, rel: string): string {
  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  const trimmed = root.replace(/[\\/]+$/, "");
  return `${trimmed}${separator}${rel.split("/").join(separator)}`;
}

function logLine(at: number, kind: string, text: string): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${time}\t${kind === "error" ? "ERROR" : "INFO"}\t${text}`;
}

function localEnabled(id: string, clicked: Clicked, app: AppStore): boolean {
  if (id.startsWith("text.")) return clicked.field ? textItemEnabled(clicked.field, id) : false;
  switch (id) {
    case "ctx.closeOtherTabs":
      return app.tabs.length > 1;
    case "ctx.closeAllTabs":
      return app.tabs.length > 0;
    case "ctx.saveSession":
      return Boolean(app.active);
    case "ctx.open":
    case "ctx.copyPaths":
    case "ctx.removeRecent":
    case "ctx.removeSession":
      return clicked.target === "recent" ? Boolean(recentEntry(clicked, app)) : Boolean(savedSession(clicked, app));
    case "ctx.copyMergedPath":
      return app.active?.kind === "merge" && Boolean(app.active.info.mergedPath);
    case "ctx.copyLogLine":
      return Boolean(clicked.node?.closest(".log-row"));
    case "ctx.copyLog":
    case "ctx.clearLog":
      return app.log.length > 0;
    case "term.copy":
      return clicked.selection.length > 0;
    case "ctx.copyPath":
      return clicked.target === "git-change" ? Boolean(gitChange(clicked, app)) : Boolean(key(clicked));
    case "ctx.reveal":
      return Boolean(key(clicked)) && host.isDesktop();
    case "ctx.parent":
    case "ctx.home":
      return clicked.holder?.dataset.contextKind === "directory" && (id === "ctx.home" || Boolean(key(clicked)));
    case "ctx.openEntry":
      return Boolean(directoryEntry(clicked, app)) && !directoryEntry(clicked, app)?.folder;
    case "ctx.toggleFolder":
      return Boolean(directoryEntry(clicked, app)?.folder);
    case "ctx.copyRelPath":
      return Boolean(directoryEntry(clicked, app));
    case "ctx.copyLeftPath": {
      const found = directoryEntry(clicked, app);
      return Boolean(found && clicked.holder?.dataset.contextLeft === "1");
    }
    case "ctx.copyRightPath": {
      const found = directoryEntry(clicked, app);
      return Boolean(found && clicked.holder?.dataset.contextRight === "1");
    }
    case "ctx.gitOpenDiff":
      return Boolean(gitChange(clicked, app));
    case "ctx.gitOpenConflict":
      return Boolean(gitChange(clicked, app)?.conflicted);
    case "ctx.gitShowCommit":
    case "ctx.copySha":
      return Boolean(key(clicked));
    case "ctx.copySubject":
      return Boolean(clicked.holder?.dataset.contextText);
    case "ctx.copyStatus":
      return Boolean(app.status);
    default:
      return true;
  }
}

async function copy(app: AppStore, text: string): Promise<void> {
  if (!text) return;
  await host.copyText(text);
  app.setStatus((t) => t("dlg.copied"));
}

async function runLocal(id: string, clicked: Clicked, app: AppStore): Promise<void> {
  if (id.startsWith("text.")) {
    if (clicked.field) await runTextAction(clicked.field, id);
    return;
  }
  // The rows a component carries out itself, because what they act on is its own
  // state: the terminal's transcript, the path bar's draft, the tree's open folders.
  if (id.startsWith("term.") && id !== "term.settings" && id !== "term.copy") {
    if (clicked.holder) sendContextAction(clicked.holder, id.slice(5));
    return;
  }
  switch (id) {
    case "ctx.copySelection":
    case "term.copy":
      await copy(app, clicked.selection);
      return;
    case "term.settings":
      void host.openDialog("settings", { tab: "terminal" });
      return;
    case "ctx.closeOtherTabs":
    case "ctx.closeAllTabs":
      // Unsaved merge results are left open: closing a tab from a menu row must not
      // throw away work the way an explicit close of that one tab can.
      for (const tab of app.tabs) {
        if (id === "ctx.closeOtherTabs" && tab.id === app.activeId) continue;
        if (tab.kind === "merge" && tab.dirty) continue;
        app.closeTab(tab.id);
      }
      return;
    case "ctx.saveSession":
      await app.saveSession();
      return;
    case "ctx.collapseLeft":
      await app.updateSettings({ showLeftPanel: false });
      return;
    case "ctx.collapseRight":
      await app.updateSettings({ showRightPanel: false });
      return;
    case "ctx.open": {
      if (clicked.target === "recent") {
        const entry = recentEntry(clicked, app);
        if (entry) await app.openRecentEntry(entry.kind, entry.paths);
      } else {
        const session = savedSession(clicked, app);
        if (session) await app.openSavedSession(session);
      }
      return;
    }
    case "ctx.copyPaths": {
      const paths = clicked.target === "recent"
        ? recentEntry(clicked, app)?.paths
        : savedSession(clicked, app)?.paths;
      await copy(app, (paths ?? []).join("\n"));
      return;
    }
    case "ctx.removeRecent": {
      const entry = recentEntry(clicked, app);
      if (entry) await app.removeRecent(entry);
      return;
    }
    case "ctx.removeSession": {
      const session = savedSession(clicked, app);
      if (session) await app.removeSession(session.id);
      return;
    }
    case "ctx.copyMergedPath":
      if (app.active?.kind === "merge") await copy(app, app.active.info.mergedPath);
      return;
    case "ctx.copyLogLine": {
      const row = clicked.node?.closest(".log-row");
      const index = row ? Number((row as HTMLElement).dataset.logIndex) : NaN;
      const entry = app.log[index];
      if (entry) await copy(app, logLine(entry.at, entry.kind, renderMessage(entry.text, app.t)));
      return;
    }
    case "ctx.copyLog":
      await copy(app, app.log.map((entry) => logLine(entry.at, entry.kind, renderMessage(entry.text, app.t))).join("\n"));
      return;
    case "ctx.clearLog":
      app.clearLog();
      return;
    case "ctx.copyPath":
      await copy(app, clicked.target === "git-change" ? gitChange(clicked, app)?.change.path ?? "" : key(clicked));
      return;
    case "ctx.reveal":
      host.revealInFolder(key(clicked));
      return;
    case "ctx.browse":
    case "ctx.parent":
    case "ctx.home":
    case "ctx.toggleFolder":
      if (clicked.holder) sendContextAction(clicked.holder, id.slice(4));
      return;
    case "ctx.openEntry": {
      const found = directoryEntry(clicked, app);
      if (found && !found.folder) await app.openDirectoryEntry(found.tab, found.rel);
      return;
    }
    case "ctx.copyRelPath": {
      const found = directoryEntry(clicked, app);
      if (found) await copy(app, found.rel);
      return;
    }
    case "ctx.copyLeftPath":
    case "ctx.copyRightPath": {
      const found = directoryEntry(clicked, app);
      if (!found) return;
      const root = id === "ctx.copyLeftPath" ? found.tab.result.left : found.tab.result.right;
      await copy(app, joinPath(root, found.rel));
      return;
    }
    case "ctx.gitOpenDiff": {
      const found = gitChange(clicked, app);
      if (found) await app.openGitChange(found.tab, found.change);
      return;
    }
    case "ctx.gitOpenConflict": {
      const found = gitChange(clicked, app);
      if (found?.conflicted) await app.openRepositoryConflict(found.tab, found.change.path);
      return;
    }
    case "ctx.gitShowCommit":
      if (key(clicked)) await app.setGitView({ mode: "commit", sha: key(clicked) });
      return;
    case "ctx.copySha":
      await copy(app, key(clicked));
      return;
    case "ctx.copySubject":
      await copy(app, clicked.holder?.dataset.contextText ?? "");
      return;
    case "ctx.copyStatus":
      await copy(app, app.status);
      return;
  }
}
