/**
 * The automation hook the GUI test drives.
 *
 * It is deliberately thin: everything it offers goes through the same store actions
 * and the same DOM a user's clicks reach, so a passing test means the real paths work
 * rather than that a test-only shortcut works. It is installed in every build — it
 * costs nothing, and being able to ask a shipped app what it thinks its state is has
 * paid for itself more than once.
 */
import { THEMES } from "../core/themes.js";
import { closeDialog, closeMenu, openDialog } from "./host.js";
import { toolbarMinimumWidth } from "./measure.js";
import type { Command } from "./commands.js";
import type { AppStore } from "./state.js";

type Hook = Record<string, unknown>;

function store(): AppStore | null {
  return (window as unknown as { __mdmStore?: AppStore }).__mdmStore ?? null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function installSmokeHooks(): void {
  const hook: Hook = {
    /** A snapshot of everything the test asserts against. */
    state() {
      const app = store();
      if (!app) return null;
      return {
        ready: app.ready,
        status: app.status,
        dirty: app.dirty,
        activeId: app.activeId,
        settings: app.settings,
        undo: { canUndo: app.undo.canUndo, canRedo: app.undo.canRedo },
        tabs: app.tabs.map((tab) => ({
          id: tab.id,
          kind: tab.kind,
          title: tab.title,
          ...(tab.kind === "compare"
            ? {
              added: tab.summary.added,
              removed: tab.summary.removed,
              modified: tab.summary.modified,
              rowCount: tab.summary.rowCount,
              identical: tab.summary.identical,
              mode: tab.summary.mode,
              cursor: tab.cursor,
            }
            : {}),
          ...(tab.kind === "directory"
            ? {
              same: tab.result.same,
              different: tab.result.different,
              leftOnly: tab.result.leftOnly,
              rightOnly: tab.result.rightOnly,
              entries: tab.result.entries.length,
              sync: tab.sync,
            }
            : {}),
          ...(tab.kind === "merge"
            ? {
              conflicts: tab.document.regions.filter((region) => region.kind === "conflict").length,
              resolved: tab.document.regions
                .filter((region) => region.kind === "conflict" && region.hunk.resolution !== "unresolved").length,
              selectedConflict: tab.selectedConflict,
              merged: tab.info.mergedPath,
              dirty: tab.dirty,
            }
            : {}),
          ...(tab.kind === "git"
            ? { changes: tab.changes.length, branch: tab.repository.branch, conflicted: tab.conflicted.length }
            : {}),
        })),
      };
    },

    /* --------------------------------------------------- actions */

    async open(kind: string, paths: string[]) {
      const app = store();
      if (!app) throw new Error("no store");
      if (kind === "files") await app.openFiles(paths[0], paths[1]);
      else if (kind === "directories") await app.openDirectories(paths[0], paths[1]);
      else if (kind === "sync") await app.openDirectories(paths[0], paths[1], true);
      else if (kind === "merge") await app.openThreeWay(paths[0], paths[1], paths[2], paths[3]);
      else if (kind === "conflict") await app.openConflictFile(paths[0]);
      else if (kind === "repository") await app.openRepository(paths[0]);
      else if (kind === "session") await app.loadSessionDocument(paths[0]);
      await sleep(60);
      return (hook.state as () => unknown)();
    },

    /** Clicks a toolbar, menu or panel control by its command id. */
    click(selector: string) {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`no element: ${selector}`);
      element.click();
      return true;
    },

    /** Clicks a visible control for `id`. */
    command(id: string) {
      const element = document.querySelector<HTMLElement>(`[data-command="${id}"]`);
      if (!element) throw new Error(`no control for command: ${id}`);
      element.click();
      return true;
    },

    /** Runs a command from the table, whether or not it has a visible control. */
    async run(id: string) {
      const table = (window as unknown as { __mdmCommands?: Record<string, Command> }).__mdmCommands;
      const command = table?.[id];
      if (!command) throw new Error(`no such command: ${id}`);
      if (!command.enabled) throw new Error(`command is disabled: ${id}`);
      await command.run();
      await sleep(40);
      return true;
    },

    /** Every command id, so the test can check the table is complete. */
    commands() {
      const table = (window as unknown as { __mdmCommands?: Record<string, Command> }).__mdmCommands ?? {};
      return Object.values(table).map((command) => ({
        id: command.id,
        label: command.label,
        icon: command.icon,
        shortcut: command.shortcut ?? "",
        enabled: command.enabled,
      }));
    },

    resolve(resolution: string) {
      store()?.resolveConflict(resolution as never);
      return true;
    },

    selectConflict(index: number) {
      store()?.selectConflict(index);
      return true;
    },

    undo() {
      store()?.undo.undo();
      return true;
    },

    redo() {
      store()?.undo.redo();
      return true;
    },

    async save() {
      await store()?.saveMerge(false);
      return true;
    },

    async settings(patch: Record<string, unknown>) {
      await store()?.updateSettings(patch as never);
      await sleep(40);
      return store()?.settings ?? null;
    },

    closeTab(id?: string) {
      const app = store();
      if (!app) return false;
      app.closeTab(id ?? app.activeId ?? "");
      return true;
    },

    setActive(id: string) {
      store()?.setActive(id);
      return true;
    },

    /* ------------------------------------------------ inspection */

    query(selector: string) {
      return document.querySelectorAll(selector).length;
    },

    text(selector: string) {
      return document.querySelector(selector)?.textContent?.trim() ?? "";
    },

    attr(selector: string, name: string) {
      return document.querySelector(selector)?.getAttribute(name) ?? "";
    },

    /** Every toolbar button with its tooltip, so "all buttons have tooltips" is testable. */
    toolbar() {
      return [...document.querySelectorAll<HTMLElement>(".toolbar [data-command]")].map((button) => ({
        command: button.dataset.command ?? "",
        tooltip: button.getAttribute("title") ?? "",
        label: button.getAttribute("aria-label") ?? "",
        disabled: (button as HTMLButtonElement).disabled === true,
      }));
    },

    /** The toolbar's natural width — what the window's minimum width must cover. */
    toolbarWidth() {
      const toolbar = document.querySelector(".toolbar");
      return toolbar ? toolbarMinimumWidth(toolbar) : 0;
    },

    menuTitles() {
      return [...document.querySelectorAll<HTMLElement>(".menubar-item")].map((item) => item.dataset.menu ?? "");
    },

    openMenu(id: string) {
      const button = document.querySelector<HTMLElement>(`.menubar-item[data-menu="${id}"]`);
      if (!button) throw new Error(`no menu: ${id}`);
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }));
      return true;
    },

    /** Opens a popup directly, for the ones no ordinary click can reach on demand. */
    dialog(name: string, payload: Record<string, unknown> = {}) {
      void openDialog(name as never, payload);
      return true;
    },

    closeDialog(name: string) {
      closeDialog(name as never);
      return true;
    },

    closeMenu() {
      closeMenu();
      return true;
    },

    contextMenu(selector: string) {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`no element: ${selector}`);
      element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 200, clientY: 200 }));
      return true;
    },

    themes() {
      return THEMES.map((theme) => theme.id);
    },

    /**
     * Labels that are taller than one line of their own text — that is, labels that
     * wrapped. The rule is that none ever does.
     */
    wrapped(selector: string) {
      return [...document.querySelectorAll<HTMLElement>(selector)]
        .filter((element) => {
          const box = element.getBoundingClientRect();
          if (box.height === 0 || box.width === 0) return false;
          const style = getComputedStyle(element);
          const line = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
          return box.height > line * 1.6;
        })
        .map((element) => ({
          selector,
          text: (element.textContent ?? "").trim().slice(0, 40),
          height: Math.round(element.getBoundingClientRect().height),
        }));
    },

    cssVar(name: string) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    },

    /** Fires a Ctrl+Wheel, which is how the zoom shortcut is exercised. */
    wheelZoom(direction: number) {
      window.dispatchEvent(new WheelEvent("wheel", { deltaY: direction, ctrlKey: true, cancelable: true }));
      return true;
    },

    key(init: KeyboardEventInit) {
      window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
      return true;
    },

    /** Simulates a drop of real paths, the way the desktop build receives one. */
    async drop(paths: string[]) {
      await store()?.openDropped(paths);
      await sleep(60);
      return (hook.state as () => unknown)();
    },

    sleep,
  };

  (window as unknown as { __mdm?: Hook }).__mdm = hook;
}
