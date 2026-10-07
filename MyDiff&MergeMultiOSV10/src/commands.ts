/**
 * Every action the app can perform, in one table.
 *
 * The toolbar, the menu bar, the context menus, the left panel and the keyboard all
 * read from here, so an action has one label, one icon, one shortcut and one
 * implementation no matter how it is reached — and the GUI test can drive any of them
 * by id.
 */
import { useCallback, useMemo } from "react";
import { DOC_EXTENSION } from "../core/appInfo.js";
import { conflictCount, layout, resolvedCount } from "../core/mergeDocument.js";
import { MAX_ZOOM, MIN_ZOOM } from "../core/settings.js";
import { counterpartOf, CUSTOM_THEME_ID, theme as themeOf, THEMES } from "../core/themes.js";
import { LANGUAGES } from "../core/i18n.js";
import type { MenuItem } from "./host.js";
import * as host from "./host.js";
import type { PrintPayload } from "./dialogs/PrintDialog.js";
import { baseName, useApp, type AppStore } from "./state.js";

export type Command = {
  id: string;
  label: string;
  icon: string;
  shortcut?: string;
  /** False greys the row out but keeps it visible, as a menu should. */
  enabled: boolean;
  checked?: boolean;
  hint?: string;
  run: () => void | Promise<void>;
};

export type CommandMap = Record<string, Command>;

export function useCommands(): {
  commands: CommandMap;
  menus: { id: string; label: string; icon: string; items: MenuItem[] }[];
  contextMenu: (
    target: "pane" | "directory" | "conflict" | "git" | "tab" | "image" | "session" | "log",
  ) => MenuItem[];
  run: (id: string) => void;
  toItems: (ids: (string | "-")[]) => MenuItem[];
} {
  const app = useApp();
  const { t, settings, active, undo } = app;

  const commands = useMemo<CommandMap>(() => build(app), [app]);

  const run = useCallback((id: string) => {
    const command = commands[id];
    if (!command || !command.enabled) return;
    void command.run();
  }, [commands]);

  const toItems = useCallback((ids: (string | "-")[]): MenuItem[] =>
    ids.map((id) => {
      if (id === "-") return { kind: "separator" as const };
      const command = commands[id];
      if (!command) return { kind: "separator" as const };
      return {
        kind: "item" as const,
        id: command.id,
        label: command.label,
        icon: command.icon,
        shortcut: command.shortcut,
        checked: command.checked,
        disabled: !command.enabled,
        hint: command.hint,
      };
    }), [commands]);

  const recentItems = useMemo<MenuItem[]>(() => {
    const entries = settings.recent ?? [];
    if (entries.length === 0) {
      return [{ kind: "item", id: "noop", label: t("cmd.file.recentEmpty"), icon: "dot", disabled: true }];
    }
    const rows: MenuItem[] = entries.map((entry, index) => ({
      kind: "item",
      id: `recent:${index}`,
      label: `${index + 1}. ${baseName(entry.paths[0] ?? "")}`,
      icon: recentIcon(entry.kind),
      hint: entry.paths.length > 1 ? `↔ ${baseName(entry.paths[1])}` : entry.paths[0],
    }));
    rows.push({ kind: "separator" });
    rows.push({ kind: "item", id: "file.manageRecent", label: t("cmd.file.manageRecent"), icon: "clock" });
    rows.push({ kind: "item", id: "file.clearRecent", label: t("cmd.file.clearRecent"), icon: "clearAll" });
    return rows;
  }, [settings.recent, t]);

  const themeItems = useMemo<MenuItem[]>(() => {
    const kind = themeOf(settings.theme, settings.customTheme).kind;
    const rows: MenuItem[] = THEMES.filter((item) => item.kind === kind).map((item) => ({
      kind: "item" as const,
      id: `theme:${item.id}`,
      label: app.language === "en" ? item.en : item.ko,
      icon: "palette",
      checked: settings.theme === item.id,
      swatches: [item.bg, item.panel, item.accent, item.text],
    }));
    rows.push({
      kind: "item",
      id: `theme:${CUSTOM_THEME_ID}`,
      label: t("settings.themeCustom"),
      icon: "palette",
      checked: settings.theme === CUSTOM_THEME_ID,
      swatches: [
        settings.customTheme.bg,
        settings.customTheme.panel,
        settings.customTheme.accent,
        settings.customTheme.text,
      ],
    });
    return rows;
  }, [app.language, settings.customTheme, settings.theme, t]);

  const languageItems = useMemo<MenuItem[]>(() =>
    LANGUAGES.map((item) => ({
      kind: "item" as const,
      id: `language:${item.id}`,
      label: item.label,
      icon: "language",
      checked: settings.language === item.id,
    })), [settings.language]);

  const menus = useMemo(() => [
    {
      id: "file",
      label: t("menu.file"),
      icon: "file",
      items: [
        ...toItems([
          "file.compareFiles",
          "file.compareDirectories",
          "-",
          "file.openThreeWay",
          "file.openConflict",
          "-",
          "file.openRepository",
          "-",
          "file.openSession",
          "file.saveSession",
          "-",
          "file.saveResult",
          "file.saveResultAs",
          "-",
        ]),
        { kind: "header" as const, label: t("cmd.file.recent") },
        ...recentItems,
        ...toItems(["-", "file.print", "file.printPreview", "-", "file.closeTab", "file.exit"]),
      ],
    },
    {
      id: "edit",
      label: t("menu.edit"),
      icon: "copy",
      items: toItems([
        "edit.undo",
        "edit.redo",
        "-",
        "edit.cut",
        "edit.copy",
        "edit.paste",
        "edit.selectAll",
        "-",
        "edit.find",
      ]),
    },
    {
      id: "view",
      label: t("menu.view"),
      icon: "eye",
      items: [
        ...toItems([
          "view.zoomIn", "view.zoomOut", "view.zoomReset",
          "-", "view.wordWrap", "view.wordHighlight", "view.differencesOnly", "-",
        ]),
        // The theme and the language live on the toolbar, where they are one
        // click rather than three, and listing forty themes here made the View
        // menu taller than the screen.
        ...toItems([
          "-",
          "view.ignoreComments",
          "view.ignoreQuoteStyle",
          "view.ignoreNumberFormat",
          "view.syntaxHighlight",
        ]),
        ...toItems(["-", "view.leftPanel", "view.rightPanel", "view.logPanel", "view.terminalPanel", "view.statusBar"]),
      ],
    },
    {
      id: "compare",
      label: t("menu.compare"),
      icon: "compareFiles",
      items: toItems([
        "nav.firstDiff",
        "nav.prevDiff",
        "nav.nextDiff",
        "nav.lastDiff",
        "-",
        "view.ignoreWhitespace",
        "view.ignoreCase",
        "view.differencesOnly",
        "-",
        "view.swap",
        "view.refresh",
      ]),
    },
    {
      id: "merge",
      label: t("menu.merge"),
      icon: "merge",
      items: toItems([
        "merge.takeBase",
        "merge.takeLocal",
        "merge.takeRemote",
        "merge.takeBoth",
        "merge.unresolve",
        "-",
        "merge.resolveAllLocal",
        "merge.resolveAllRemote",
        "-",
        "merge.prevConflict",
        "merge.nextConflict",
      ]),
    },
    {
      id: "tools",
      label: t("menu.tools"),
      icon: "settings",
      items: toItems([
        "tools.settings",
        "-",
        "tools.difftool",
        "tools.mergetool",
      ]),
    },
    {
      id: "help",
      label: t("menu.help"),
      icon: "help",
      items: toItems(["help.about"]),
    },
  ], [languageItems, recentItems, t, themeItems, toItems]);

  /*
   * The context menu follows what was right-clicked, and offers what can actually be
   * done there: a directory row can be copied across or deleted, a conflict can be
   * settled, a picture can be switched between its three views. A menu of actions
   * that do not apply to what is under the pointer is worse than no menu.
   */
  const contextMenu = useCallback((
    target: "pane" | "directory" | "conflict" | "git" | "tab" | "image" | "session" | "log",
  ): MenuItem[] => {
    if (target === "image") {
      return toItems(["view.refresh", "view.swap", "-", "edit.copy", "-", "file.print"]);
    }
    if (target === "session") {
      return toItems([
        "file.compareFiles",
        "file.compareDirectories",
        "file.syncDirectories",
        "file.openThreeWay",
        "-",
        "file.manageRecent",
        "file.clearRecent",
      ]);
    }
    if (target === "log") {
      return toItems(["view.logPanel", "view.terminalPanel"]);
    }
    if (target === "conflict") {
      return toItems([
        "merge.takeBase",
        "merge.takeLocal",
        "merge.takeRemote",
        "merge.takeBoth",
        "merge.unresolve",
        "-",
        "merge.prevConflict",
        "merge.nextConflict",
        "-",
        "edit.copy",
      ]);
    }
    if (target === "directory") {
      return toItems([
        "dir.copyToRight",
        "dir.copyToLeft",
        "-",
        "dir.deleteLeft",
        "dir.deleteRight",
        "-",
        "view.refresh",
        "view.swap",
        "-",
        "edit.copy",
        "file.print",
      ]);
    }
    if (target === "git") {
      return toItems(["view.refresh", "-", "tools.difftool", "tools.mergetool", "-", "edit.copy"]);
    }
    if (target === "tab") {
      return toItems(["file.closeTab", "-", "view.refresh", "view.swap", "-", "file.saveResult", "file.print"]);
    }
    return toItems([
      "edit.copy",
      "edit.paste",
      "edit.selectAll",
      "-",
      "nav.prevDiff",
      "nav.nextDiff",
      "-",
      "view.wordWrap",
      "view.zoomIn",
      "view.zoomOut",
      "-",
      "file.print",
    ]);
  }, [toItems]);

  void active;
  void undo;
  return { commands, menus, contextMenu, run, toItems };
}

function recentIcon(kind: string): string {
  if (kind === "directories") return "folders";
  if (kind === "merge") return "merge";
  if (kind === "conflict") return "conflict";
  if (kind === "repository") return "repository";
  if (kind === "session") return "session";
  return "compareFiles";
}

/* ------------------------------------------------------------------ *
 * The table itself
 * ------------------------------------------------------------------ */

function build(app: AppStore): CommandMap {
  const { t, settings, active, undo } = app;
  const merge = active?.kind === "merge" ? active : null;
  const compare = active?.kind === "compare" ? active : null;
  const directory = active?.kind === "directory" ? active : null;
  const hasConflicts = merge ? conflictCount(merge.document) > 0 : false;
  const list: Command[] = [];

  const add = (command: Command) => list.push(command);
  const set = (patch: Parameters<AppStore["updateSettings"]>[0]) => {
    void app.updateSettings(patch);
  };

  /* ---------------------------------------------------------- file */

  add({
    id: "file.compareFiles",
    label: t("cmd.file.compareFiles"),
    icon: "compareFiles",
    shortcut: "Ctrl+O",
    enabled: true,
    run: async () => {
      const left = await host.pickFile({ title: `${t("pane.left")} — ${t("cmd.file.compareFiles")}` });
      if (!left) return;
      const right = await host.pickFile({ title: `${t("pane.right")} — ${t("cmd.file.compareFiles")}` });
      if (!right) return;
      await app.openFiles(left, right);
    },
  });

  add({
    id: "file.syncDirectories",
    label: t("cmd.file.syncDirectories"),
    icon: "sync",
    enabled: true,
    run: async () => {
      const left = await host.pickDirectory({ title: `${t("pane.left")} — ${t("cmd.file.syncDirectories")}` });
      if (!left) return;
      const right = await host.pickDirectory({ title: `${t("pane.right")} — ${t("cmd.file.syncDirectories")}` });
      if (!right) return;
      await app.openDirectories(left, right, true);
    },
  });

  add({
    id: "file.compareRemote",
    label: t("cmd.file.compareRemote"),
    icon: "cloud",
    enabled: true,
    run: async () => {
      const local = await host.pickDirectory({ title: `${t("pane.left")} — ${t("cmd.file.compareRemote")}` });
      if (!local) return;
      const where = await host.openDialog<{ remote: string; password: string }>("remote", { local });
      if (!where?.remote) return;
      await app.openRemoteDirectories(local, where.remote, where.password ?? "");
    },
  });

  add({
    id: "file.compareImages",
    label: t("cmd.file.compareImages"),
    icon: "image",
    enabled: true,
    run: async () => {
      const left = await host.pickFile({ title: `${t("pane.left")} — ${t("cmd.file.compareImages")}` });
      if (!left) return;
      const right = await host.pickFile({ title: `${t("pane.right")} — ${t("cmd.file.compareImages")}` });
      if (!right) return;
      // The picture view picks itself up from the file extensions, so this opens an
      // ordinary comparison and lets it decide.
      await app.openFiles(left, right);
    },
  });
  /*
   * The structured comparisons. Each one is an ordinary file comparison with a
   * format forced on it, so the whole of the rest of the app — the diff, the
   * search, the printing — needs to know nothing about tables or ID3 tags.
   */
  for (const [id, format, icon] of [
    ["file.compareTable", "table", "grid"],
    ["file.compareAudio", "audio", "music"],
    ["file.compareVersion", "version", "about"],
    ["file.compareRegistry", "registry", "settings"],
  ] as const) {
    add({
      id,
      label: t(`cmd.${id}` as never),
      icon,
      enabled: true,
      run: async () => {
        const left = await host.pickFile({ title: `${t("pane.left")} — ${t(`cmd.${id}` as never)}` });
        if (!left) return;
        const right = await host.pickFile({ title: `${t("pane.right")} — ${t(`cmd.${id}` as never)}` });
        if (!right) return;
        await app.openFiles(left, right, false, format);
      },
    });
  }

  add({
    id: "file.compareHex",
    label: t("cmd.file.compareHex"),
    icon: "hex",
    enabled: true,
    run: async () => {
      const left = await host.pickFile({ title: `${t("pane.left")} — ${t("cmd.file.compareHex")}` });
      if (!left) return;
      const right = await host.pickFile({ title: `${t("pane.right")} — ${t("cmd.file.compareHex")}` });
      if (!right) return;
      // Forced: a hex session is for reading bytes, even of a text file.
      await app.openFiles(left, right, true);
    },
  });

  add({
    id: "file.compareDirectories",
    label: t("cmd.file.compareDirs"),
    icon: "folders",
    shortcut: "Ctrl+Shift+O",
    enabled: true,
    run: async () => {
      const left = await host.pickDirectory({ title: `${t("pane.left")} — ${t("cmd.file.compareDirs")}` });
      if (!left) return;
      const right = await host.pickDirectory({ title: `${t("pane.right")} — ${t("cmd.file.compareDirs")}` });
      if (!right) return;
      await app.openDirectories(left, right);
    },
  });

  add({
    id: "file.openThreeWay",
    label: t("cmd.file.openThreeWay"),
    icon: "merge",
    enabled: true,
    run: async () => {
      const base = await host.pickFile({ title: t("pane.base") });
      if (!base) return;
      const local = await host.pickFile({ title: t("pane.local") });
      if (!local) return;
      const remote = await host.pickFile({ title: t("pane.remote") });
      if (!remote) return;
      const merged = await host.pickSave({ title: t("pane.result"), defaultPath: local });
      if (!merged) return;
      await app.openThreeWay(base, local, remote, merged);
    },
  });

  add({
    id: "file.openConflict",
    label: t("cmd.file.openConflict"),
    icon: "conflict",
    enabled: true,
    run: async () => {
      const file = await host.pickFile({ title: t("cmd.file.openConflict") });
      if (file) await app.openConflictFile(file);
    },
  });

  add({
    id: "file.openRepository",
    label: t("cmd.file.openRepo"),
    icon: "repository",
    enabled: true,
    run: async () => {
      const repo = await host.pickDirectory({ title: t("cmd.file.openRepo") });
      if (repo) await app.openRepository(repo);
    },
  });

  add({
    id: "file.openSession",
    label: t("cmd.file.openSession"),
    icon: "session",
    enabled: true,
    run: async () => {
      const file = await host.pickFile({
        title: t("cmd.file.openSession"),
        filters: [{ name: "My Diff & Merge Session", extensions: [DOC_EXTENSION] }],
      });
      if (file) await app.loadSessionDocument(file);
    },
  });

  add({
    id: "file.saveSession",
    label: t("cmd.file.saveSessionAs"),
    icon: "saveAs",
    enabled: app.tabs.length > 0,
    run: () => app.saveSessionDocument(true),
  });

  add({
    id: "file.saveResult",
    label: t("cmd.file.saveResult"),
    icon: "save",
    shortcut: "Ctrl+S",
    enabled: Boolean(merge),
    hint: merge ? `${resolvedCount(merge.document)}/${conflictCount(merge.document)}` : undefined,
    run: () => app.saveMerge(false),
  });

  add({
    id: "file.saveResultAs",
    label: t("cmd.file.saveResultAs"),
    icon: "saveAs",
    shortcut: "Ctrl+Shift+S",
    enabled: Boolean(merge),
    run: () => app.saveMerge(true),
  });

  add({
    id: "file.manageRecent",
    label: t("cmd.file.manageRecent"),
    icon: "clock",
    enabled: true,
    run: () => {
      host.openDialog("recent", {});
    },
  });

  add({
    id: "file.clearRecent",
    label: t("cmd.file.clearRecent"),
    icon: "clearAll",
    enabled: (settings.recent ?? []).length > 0,
    run: async () => {
      await app.updateSettings({ recent: [] });
    },
  });

  const printJob = () => {
    void host.openDialog("print", buildPrintJob(app));
  };

  add({
    id: "file.print",
    label: t("cmd.file.print"),
    icon: "print",
    shortcut: "Ctrl+P",
    enabled: Boolean(active),
    run: printJob,
  });

  add({
    id: "file.printPreview",
    label: t("cmd.file.printPreview"),
    icon: "preview",
    enabled: Boolean(active),
    run: printJob,
  });

  add({
    id: "file.closeTab",
    label: t("cmd.file.closeTab"),
    icon: "close",
    shortcut: "Ctrl+W",
    enabled: Boolean(active),
    run: () => {
      if (active) app.closeTab(active.id);
    },
  });

  add({
    id: "file.exit",
    label: t("cmd.file.exit"),
    icon: "exit",
    shortcut: "Alt+F4",
    enabled: true,
    run: async () => {
      if (app.dirty && settings.confirmExit) {
        const answer = await host.openDialog<"save" | "discard" | null>("unsaved", {});
        if (answer === null) return;
        if (answer === "save") await app.saveMerge(false);
      }
      host.closeAllDialogs();
      host.quit();
    },
  });

  /* ---------------------------------------------------------- edit */

  add({
    id: "edit.undo",
    label: t("cmd.edit.undo"),
    icon: "undo",
    shortcut: "Ctrl+Z",
    enabled: undo.canUndo,
    hint: undo.undoLabel || undefined,
    run: () => {
      undo.undo();
    },
  });

  add({
    id: "edit.redo",
    label: t("cmd.edit.redo"),
    icon: "redo",
    shortcut: "Ctrl+Y",
    enabled: undo.canRedo,
    hint: undo.redoLabel || undefined,
    run: () => {
      undo.redo();
    },
  });

  add({
    id: "edit.cut",
    label: t("cmd.edit.cut"),
    icon: "cut",
    shortcut: "Ctrl+X",
    enabled: Boolean(merge),
    run: () => {
      document.execCommand("cut");
    },
  });

  add({
    id: "edit.copy",
    label: t("cmd.edit.copy"),
    icon: "copy",
    shortcut: "Ctrl+C",
    enabled: Boolean(active),
    run: async () => {
      const text = window.getSelection()?.toString() ?? "";
      if (text) {
        await host.copyText(text);
        app.setStatus((t) => t("dlg.copied"));
      }
    },
  });

  add({
    id: "edit.paste",
    label: t("cmd.edit.paste"),
    icon: "paste",
    shortcut: "Ctrl+V",
    enabled: Boolean(merge),
    run: async () => {
      const text = await host.readText();
      if (!text) return;
      const target = document.activeElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        const start = target.selectionStart ?? target.value.length;
        const end = target.selectionEnd ?? start;
        target.value = target.value.slice(0, start) + text + target.value.slice(end);
        target.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
  });

  add({
    id: "edit.selectAll",
    label: t("cmd.edit.selectAll"),
    icon: "selectAll",
    shortcut: "Ctrl+A",
    enabled: Boolean(active),
    run: () => {
      const pane = document.querySelector(".pane-body");
      if (!pane) return;
      const range = document.createRange();
      range.selectNodeContents(pane);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    },
  });

  add({
    id: "edit.find",
    label: t("cmd.edit.find"),
    icon: "find",
    shortcut: "Ctrl+F",
    enabled: Boolean(active),
    run: () => {
      const input = document.querySelector<HTMLInputElement>(".find-input");
      input?.focus();
      input?.select();
    },
  });

  /* ---------------------------------------------------- navigation */

  const blocks = compare ? compare.summary.diffBlocks : [];
  const jump = (index: number) => {
    if (blocks.length === 0) return;
    const clamped = Math.max(0, Math.min(index, blocks.length - 1));
    app.setCursor(blocks[clamped]);
  };
  const currentBlock = () => {
    if (!compare) return 0;
    const index = blocks.findIndex((row) => row >= compare.cursor);
    return index < 0 ? blocks.length - 1 : index;
  };

  add({
    id: "nav.firstDiff",
    label: t("cmd.nav.firstDiff"),
    icon: "first",
    shortcut: "Ctrl+Home",
    enabled: blocks.length > 0,
    run: () => jump(0),
  });
  add({
    id: "nav.prevDiff",
    label: t("cmd.nav.prevDiff"),
    icon: "prev",
    shortcut: "F7",
    enabled: blocks.length > 0,
    run: () => jump(currentBlock() - 1),
  });
  add({
    id: "nav.nextDiff",
    label: t("cmd.nav.nextDiff"),
    icon: "next",
    shortcut: "F8",
    enabled: blocks.length > 0,
    run: () => jump(currentBlock() + 1),
  });
  add({
    id: "nav.lastDiff",
    label: t("cmd.nav.lastDiff"),
    icon: "last",
    shortcut: "Ctrl+End",
    enabled: blocks.length > 0,
    run: () => jump(blocks.length - 1),
  });

  /* --------------------------------------------------------- merge */

  const resolution = merge
    ? merge.document.regions.filter((region) => region.kind === "conflict")[merge.selectedConflict]
    : undefined;
  const currentResolution = resolution && resolution.kind === "conflict" ? resolution.hunk.resolution : "unresolved";

  add({
    id: "merge.takeBase",
    label: t("cmd.merge.takeBase"),
    icon: "base",
    shortcut: "Ctrl+1",
    enabled: hasConflicts,
    checked: currentResolution === "base",
    run: () => app.resolveConflict("base"),
  });
  add({
    id: "merge.takeLocal",
    label: t("cmd.merge.takeLocal"),
    icon: "local",
    shortcut: "Ctrl+2",
    enabled: hasConflicts,
    checked: currentResolution === "local",
    run: () => app.resolveConflict("local"),
  });
  add({
    id: "merge.takeRemote",
    label: t("cmd.merge.takeRemote"),
    icon: "remote",
    shortcut: "Ctrl+3",
    enabled: hasConflicts,
    checked: currentResolution === "remote",
    run: () => app.resolveConflict("remote"),
  });
  add({
    id: "merge.takeBoth",
    label: t("cmd.merge.takeBoth"),
    icon: "both",
    shortcut: "Ctrl+4",
    enabled: hasConflicts,
    checked: currentResolution === "both",
    run: () => app.resolveConflict("both"),
  });
  add({
    id: "merge.unresolve",
    label: t("cmd.merge.unresolve"),
    icon: "unresolve",
    shortcut: "Ctrl+Shift+0",
    enabled: hasConflicts,
    checked: currentResolution === "unresolved",
    run: () => app.resolveConflict("unresolved"),
  });
  add({
    id: "merge.resolveAllLocal",
    label: t("cmd.merge.resolveAllLocal"),
    icon: "resolveAll",
    enabled: hasConflicts,
    run: () => app.resolveAll("local"),
  });
  add({
    id: "merge.resolveAllRemote",
    label: t("cmd.merge.resolveAllRemote"),
    icon: "resolveAll",
    enabled: hasConflicts,
    run: () => app.resolveAll("remote"),
  });
  add({
    id: "merge.prevConflict",
    label: t("cmd.merge.prevConflict"),
    icon: "prev",
    shortcut: "Shift+F7",
    enabled: hasConflicts,
    run: () => app.selectConflict((merge?.selectedConflict ?? 0) - 1),
  });
  add({
    id: "merge.nextConflict",
    label: t("cmd.merge.nextConflict"),
    icon: "next",
    shortcut: "Shift+F8",
    enabled: hasConflicts,
    run: () => app.selectConflict((merge?.selectedConflict ?? 0) + 1),
  });

  /* ---------------------------------------------------------- view */

  add({
    id: "view.zoomIn",
    label: t("cmd.view.zoomIn"),
    icon: "zoomIn",
    shortcut: "Ctrl++",
    enabled: settings.zoom < MAX_ZOOM,
    run: () => set({ zoom: Math.min(MAX_ZOOM, settings.zoom + 10) }),
  });
  add({
    id: "view.zoomOut",
    label: t("cmd.view.zoomOut"),
    icon: "zoomOut",
    shortcut: "Ctrl+-",
    enabled: settings.zoom > MIN_ZOOM,
    run: () => set({ zoom: Math.max(MIN_ZOOM, settings.zoom - 10) }),
  });
  add({
    id: "view.zoomReset",
    label: t("cmd.view.zoomReset"),
    icon: "zoomReset",
    shortcut: "Ctrl+0",
    enabled: settings.zoom !== 100,
    run: () => set({ zoom: 100 }),
  });
  add({
    id: "view.wordWrap",
    label: t("cmd.view.wordWrap"),
    icon: "wrap",
    enabled: true,
    checked: settings.wordWrap,
    run: () => set({ wordWrap: !settings.wordWrap }),
  });
  add({
    id: "view.differencesOnly",
    label: t("view.differencesOnly"),
    icon: "filter",
    shortcut: "Ctrl+D",
    enabled: Boolean(compare),
    checked: settings.differencesOnly,
    run: () => set({ differencesOnly: !settings.differencesOnly }),
  });
  add({
    id: "view.wordHighlight",
    label: t("cmd.view.wordHighlight"),
    icon: "highlight",
    enabled: true,
    checked: settings.wordHighlight,
    run: () => set({ wordHighlight: !settings.wordHighlight }),
  });
  add({
    id: "view.ignoreWhitespace",
    label: t("cmd.view.ignoreWhitespace"),
    icon: "whitespace",
    enabled: true,
    checked: settings.ignoreWhitespace,
    run: async () => {
      await app.updateSettings({ ignoreWhitespace: !settings.ignoreWhitespace });
      await app.reloadActive();
    },
  });
  add({
    id: "view.ignoreCase",
    label: t("cmd.view.ignoreCase"),
    icon: "letterCase",
    enabled: true,
    checked: settings.ignoreCase,
    run: async () => {
      await app.updateSettings({ ignoreCase: !settings.ignoreCase });
      await app.reloadActive();
    },
  });
  for (const rule of ["ignoreComments", "ignoreQuoteStyle", "ignoreNumberFormat"] as const) {
    add({
      id: `view.${rule}`,
      label: t(`cmd.view.${rule}` as never),
      icon: rule === "ignoreComments" ? "comment" : rule === "ignoreQuoteStyle" ? "quote" : "hash",
      enabled: true,
      checked: settings[rule],
      run: async () => {
        await app.updateSettings({ [rule]: !settings[rule] } as never);
        // The rules change what counts as a difference, so the comparison has to be
        // worked out again — unlike a display option, this is not just a repaint.
        await app.reloadActive();
      },
    });
  }

  add({
    id: "view.syntaxHighlight",
    label: t("cmd.view.syntaxHighlight"),
    icon: "code",
    enabled: true,
    checked: settings.syntaxHighlight,
    run: () => set({ syntaxHighlight: !settings.syntaxHighlight }),
  });

  add({
    id: "view.leftPanel",
    label: t("cmd.view.leftPanel"),
    icon: "panelLeft",
    // The panels belong to a merge; on any other tab the switch has nothing to show.
    enabled: active?.kind === "merge",
    checked: settings.showLeftPanel,
    run: () => set({ showLeftPanel: !settings.showLeftPanel }),
  });
  add({
    id: "view.rightPanel",
    label: t("cmd.view.rightPanel"),
    icon: "panelRight",
    enabled: active?.kind === "merge",
    checked: settings.showRightPanel,
    run: () => set({ showRightPanel: !settings.showRightPanel }),
  });
  // Each tab of the bottom panel has its own switch, and turning one on also brings it to
  // the front: otherwise opening the terminal would show the log, which is not what was
  // asked for.
  add({
    id: "view.logPanel",
    label: t("cmd.view.logPanel"),
    icon: "list",
    enabled: true,
    checked: settings.showLogPanel,
    run: () => set(settings.showLogPanel
      ? { showLogPanel: false }
      : { showLogPanel: true, bottomPanel: "log" }),
  });
  add({
    id: "view.terminalPanel",
    label: t("cmd.view.terminalPanel"),
    icon: "terminal",
    shortcut: "Ctrl+`",
    enabled: true,
    checked: settings.showTerminalPanel,
    run: () => set(settings.showTerminalPanel
      ? { showTerminalPanel: false }
      : { showTerminalPanel: true, bottomPanel: "terminal" }),
  });
  add({
    id: "view.statusBar",
    label: t("cmd.view.statusBar"),
    icon: "statusBar",
    enabled: true,
    checked: settings.showStatusBar,
    run: () => set({ showStatusBar: !settings.showStatusBar }),
  });
  add({
    id: "view.swap",
    label: t("cmd.view.swap"),
    icon: "swap",
    enabled: Boolean(compare || directory),
    run: () => app.swapActive(),
  });
  /*
   * The four folder operations, as commands rather than only as buttons in the
   * directory view: that is what puts them in the context menu and the Compare menu
   * with their state — disabled until something is selected — worked out once.
   */
  for (const operation of ["copyToRight", "copyToLeft", "deleteLeft", "deleteRight"] as const) {
    const directory = active?.kind === "directory" ? active : null;
    add({
      id: `dir.${operation}`,
      label: t(`dir.${operation === "copyToRight" ? "copyToRight" : operation === "copyToLeft" ? "copyToLeft" : operation === "deleteLeft" ? "deleteLeft" : "deleteRight"}` as never),
      icon: operation.startsWith("copy")
        ? (operation === "copyToRight" ? "rightOnly" : "leftOnly")
        : operation === "deleteLeft" ? "trashLeft" : "trashRight",
      enabled: Boolean(directory?.selected),
      run: async () => {
        if (!directory?.selected) return;
        await app.directoryOperation(directory, operation, [directory.selected]);
      },
    });
  }

  /*
   * Back and forward through what has been looked at. A comparison session wanders
   * — a repository, then a commit, then one file's diff — and getting back to
   * where you were should not mean finding it again.
   */
  add({
    id: "nav.back",
    label: t("cmd.nav.back"),
    icon: "historyBack",
    shortcut: "Alt+Left",
    enabled: app.canGoBack,
    run: () => app.goBack(),
  });
  add({
    id: "nav.forward",
    label: t("cmd.nav.forward"),
    icon: "historyForward",
    shortcut: "Alt+Right",
    enabled: app.canGoForward,
    run: () => app.goForward(),
  });

  add({
    id: "view.refresh",
    label: t("cmd.view.refresh"),
    icon: "refresh",
    shortcut: "F5",
    enabled: Boolean(active),
    run: () => app.reloadActive(),
  });

  /* --------------------------------------------------------- tools */

  add({
    id: "tools.settings",
    label: t("cmd.tools.settings"),
    icon: "settings",
    shortcut: "Ctrl+,",
    enabled: true,
    run: () => {
      host.openDialog("settings", {});
    },
  });
  add({
    id: "tools.difftool",
    label: t("cmd.tools.difftool"),
    icon: "git",
    enabled: true,
    run: () => {
      host.openDialog("settings", { tab: "git" });
    },
  });
  add({
    id: "tools.mergetool",
    label: t("cmd.tools.mergetool"),
    icon: "merge",
    enabled: true,
    run: () => {
      host.openDialog("settings", { tab: "git" });
    },
  });
  add({
    id: "view.themeToggle",
    label: t("cmd.view.themeToggle"),
    icon: "palette",
    shortcut: "Ctrl+T",
    enabled: true,
    hint: themeOf(settings.theme, settings.customTheme).kind === "dark" ? "●" : "○",
    run: () => set({ theme: counterpartOf(settings.theme, settings.customTheme) }),
  });

  /* ---------------------------------------------------------- help */

  add({
    id: "help.about",
    label: t("cmd.help.about"),
    icon: "about",
    shortcut: "F1",
    enabled: true,
    run: () => {
      host.openDialog("about", {});
    },
  });

  const map: CommandMap = {};
  for (const command of list) map[command.id] = command;
  return map;
}

/**
 * What the print dialog is given.
 *
 * A comparison can be enormous, so only its id travels and the dialog streams the rows
 * from the server. Everything else is already in memory and small enough to hand over
 * whole — a merge result, a directory listing, a repository's changes.
 */
function buildPrintJob(app: AppStore): PrintPayload {
  const active = app.active;
  const { t } = app;

  if (active?.kind === "compare") {
    return {
      kind: "compare",
      title: active.title,
      leftHeading: active.summary.left.label,
      rightHeading: active.summary.right.label,
      compareId: active.summary.id,
      rowCount: active.summary.rowCount,
    };
  }

  if (active?.kind === "merge") {
    const rows = layout(active.document);
    return {
      kind: "merge",
      title: active.title,
      leftHeading: t("pane.local"),
      rightHeading: t("pane.result"),
      rows: rows.result.map((row, index) => ({
        left: rows.local[index]?.text ?? null,
        right: row.text,
        leftNo: rows.local[index]?.lineNo ?? null,
        rightNo: row.lineNo,
        kind: row.kind,
      })),
    };
  }

  if (active?.kind === "directory") {
    return {
      kind: "directory",
      title: active.title,
      leftHeading: active.result.left,
      rightHeading: active.result.right,
      rows: active.result.entries.map((entry, index) => ({
        left: entry.rel,
        right: `${t(`status.${entry.status}` as Parameters<typeof t>[0])}`,
        leftNo: index + 1,
        rightNo: null,
        kind: entry.status === "same" ? "same" : entry.status === "leftOnly" ? "removed" : entry.status === "rightOnly" ? "added" : "modified",
      })),
    };
  }

  if (active?.kind === "git") {
    return {
      kind: "git",
      title: active.title,
      leftHeading: active.repository.path,
      rightHeading: active.repository.branch ?? active.repository.head ?? "",
      rows: active.changes.map((change, index) => ({
        left: change.path,
        right: change.status,
        leftNo: index + 1,
        rightNo: null,
        kind: change.code.startsWith("A") ? "added" : change.code.startsWith("D") ? "removed" : "modified",
      })),
    };
  }

  return { kind: "compare", title: "", leftHeading: "", rightHeading: "", rows: [] };
}
