/**
 * The context menus: what each place offers when it is right-clicked.
 *
 * A place says what it is with a `data-context` attribute (`data-context="path"`), and
 * may carry what it is about in `data-context-key` / `data-context-text` (an index, a
 * path, a commit). One window-level listener reads that and opens the menu listed here
 * for it, so a new place gets a menu by naming itself, and the menus themselves sit
 * together where they can be read — and tested — as one table.
 *
 * An entry in a menu is one of:
 *   - a command id from `commands.ts` (`view.refresh`), with its label, icon,
 *     shortcut and enabled state from the command table;
 *   - a local row (`text.*`, `ctx.*`, `term.*`) listed in `LOCAL_ITEMS` below, which
 *     acts on the thing that was clicked rather than on the active tab;
 *   - `@target`, which splices in the command table's own context menu for that
 *     target, so the menus `commands.ts` already has stay the single source;
 *   - `-`, a separator.
 *
 * Every row has an icon: the local ones are given one here, and a command has one by
 * construction. The WebView's own menu — no icons, and offering "Inspect" and "Back"
 * in a desktop app — is never shown: text fields get Cut/Copy/Paste here instead, and
 * everywhere else that has no menu of its own gets none.
 *
 * Kept free of JSX so the unit tests can import it.
 */
import { useEffect } from "react";
import type { StringKey, Translate } from "../core/i18n.js";
import type { CustomTheme } from "../core/themes.js";
import * as host from "./host.js";
import type { MenuItem } from "./host.js";

export type ContextTarget =
  // Filled by `contextMenu()` in commands.ts.
  | "pane" | "directory" | "conflict" | "git" | "tab" | "image" | "session" | "log"
  // Places with a menu of their own.
  | "session-panel" | "dir-entry" | "git-change" | "git-commit" | "recent" | "saved-session"
  | "conflicts-panel" | "merge-info" | "terminal" | "bottom-tabs" | "path" | "status";

/** The targets `contextMenu()` in commands.ts knows. */
export const COMMAND_TARGETS = ["pane", "directory", "conflict", "git", "tab", "image", "session", "log"] as const;
export type CommandTarget = (typeof COMMAND_TARGETS)[number];

/** Rows that belong to the context menus rather than to the command table. */
export const LOCAL_ITEMS: Record<string, { label: StringKey; icon: string }> = {
  // Any text field.
  "text.undo": { label: "text.undo", icon: "undo" },
  "text.redo": { label: "text.redo", icon: "redo" },
  "text.cut": { label: "text.cut", icon: "cut" },
  "text.copy": { label: "text.copy", icon: "copy" },
  "text.paste": { label: "text.paste", icon: "paste" },
  "text.delete": { label: "text.delete", icon: "eraser" },
  "text.selectAll": { label: "text.selectAll", icon: "selectAll" },
  "ctx.copySelection": { label: "ctx.copySelection", icon: "copy" },

  // Tabs and side panels.
  "ctx.closeOtherTabs": { label: "ctx.closeOtherTabs", icon: "close" },
  "ctx.closeAllTabs": { label: "ctx.closeAllTabs", icon: "clearAll" },
  "ctx.saveSession": { label: "ctx.saveSession", icon: "save" },
  "ctx.collapseLeft": { label: "ctx.collapseLeft", icon: "panelLeft" },
  "ctx.collapseRight": { label: "ctx.collapseRight", icon: "panelRight" },
  "ctx.open": { label: "ctx.open", icon: "open" },
  "ctx.copyPaths": { label: "ctx.copyPaths", icon: "copy" },
  "ctx.removeRecent": { label: "ctx.removeRecent", icon: "close" },
  "ctx.removeSession": { label: "ctx.removeSession", icon: "trash" },
  "ctx.copyMergedPath": { label: "ctx.copyMergedPath", icon: "copy" },

  // The log and the terminal.
  "ctx.copyLogLine": { label: "ctx.copyLogLine", icon: "copy" },
  "ctx.copyLog": { label: "ctx.copyLog", icon: "files" },
  "ctx.clearLog": { label: "ctx.clearLog", icon: "trash" },
  "term.copy": { label: "text.copy", icon: "copy" },
  "term.paste": { label: "text.paste", icon: "paste" },
  "term.selectAll": { label: "text.selectAll", icon: "selectAll" },
  "term.clear": { label: "ctx.termClear", icon: "clearAll" },
  "term.interrupt": { label: "ctx.termInterrupt", icon: "stop" },
  "term.settings": { label: "terminal.settings", icon: "settings" },

  // A path bar.
  "ctx.copyPath": { label: "ctx.copyPath", icon: "copy" },
  "ctx.browse": { label: "ctx.browse", icon: "open" },
  "ctx.parent": { label: "path.up", icon: "up" },
  "ctx.home": { label: "path.home", icon: "home" },
  "ctx.reveal": { label: "ctx.reveal", icon: "folder" },

  // A row of the folder comparison.
  "ctx.openEntry": { label: "ctx.openEntry", icon: "compareFiles" },
  "ctx.toggleFolder": { label: "ctx.toggleFolder", icon: "tree" },
  "ctx.copyRelPath": { label: "ctx.copyRelPath", icon: "link" },
  "ctx.copyLeftPath": { label: "ctx.copyLeftPath", icon: "local" },
  "ctx.copyRightPath": { label: "ctx.copyRightPath", icon: "remote" },

  // The repository view.
  "ctx.gitOpenDiff": { label: "ctx.gitOpenDiff", icon: "compareFiles" },
  "ctx.gitOpenConflict": { label: "ctx.gitOpenConflict", icon: "merge" },
  "ctx.gitShowCommit": { label: "ctx.gitShowCommit", icon: "commit" },
  "ctx.copySha": { label: "ctx.copySha", icon: "hash" },
  "ctx.copySubject": { label: "ctx.copySubject", icon: "comment" },

  // The status bar.
  "ctx.copyStatus": { label: "ctx.copyStatus", icon: "copy" },
};

/** Cut, copy and paste for whatever text field was right-clicked. */
export const TEXT_MENU: readonly string[] = [
  "text.undo", "text.redo", "-",
  "text.cut", "text.copy", "text.paste", "text.delete", "-",
  "text.selectAll",
];

/** Each place's menu, top to bottom. */
export const CONTEXT_MENUS: Record<ContextTarget, readonly string[]> = {
  pane: ["@pane"],
  directory: ["@directory"],
  conflict: ["@conflict"],
  git: ["@git"],
  image: ["@image"],
  tab: ["@tab", "-", "ctx.closeOtherTabs", "ctx.closeAllTabs"],
  session: ["@session"],
  "session-panel": ["ctx.saveSession", "-", "@session", "-", "ctx.collapseLeft"],
  log: ["ctx.copyLogLine", "ctx.copyLog", "ctx.clearLog", "-", "@log"],
  "dir-entry": [
    "ctx.openEntry", "ctx.toggleFolder", "-",
    "ctx.copyRelPath", "ctx.copyLeftPath", "ctx.copyRightPath", "-",
    "@directory",
  ],
  "git-change": ["ctx.gitOpenDiff", "ctx.gitOpenConflict", "-", "ctx.copyPath", "-", "@git"],
  "git-commit": ["ctx.gitShowCommit", "-", "ctx.copySha", "ctx.copySubject", "-", "@git"],
  recent: ["ctx.open", "ctx.copyPaths", "ctx.removeRecent", "-", "file.manageRecent", "file.clearRecent"],
  "saved-session": ["ctx.open", "ctx.copyPaths", "ctx.removeSession"],
  "conflicts-panel": ["@conflict", "-", "ctx.collapseLeft"],
  "merge-info": [
    "file.saveResult", "file.saveResultAs", "-",
    "merge.resolveAllLocal", "merge.resolveAllRemote", "-",
    "ctx.copyMergedPath", "-",
    "ctx.collapseRight",
  ],
  terminal: [
    "term.copy", "term.paste", "-",
    "term.selectAll", "term.clear", "term.interrupt", "-",
    "term.settings", "view.terminalPanel",
  ],
  "bottom-tabs": ["view.logPanel", "view.terminalPanel", "-", "term.settings"],
  path: ["ctx.copyPath", "-", "ctx.browse", "ctx.parent", "ctx.home", "-", "ctx.reveal"],
  status: ["ctx.copyStatus", "-", "view.logPanel", "view.statusBar"],
};

/** Rows that already copy the selection; with one of them in a menu, no extra Copy is added. */
const COPIES_SELECTION = new Set(["edit.copy", "term.copy", "text.copy"]);

export function isLocalItem(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(LOCAL_ITEMS, id);
}

/**
 * Turns a list of entries into menu rows.
 *
 * `resolve` supplies the rows for a command id or an `@target`; a local row is built
 * here, enabled or not as `enabled` says. Separators are tidied afterwards — none at
 * either end and never two in a row — since a spliced menu can start or end with one.
 */
export function buildMenu(
  ids: readonly string[],
  t: Translate,
  resolve: (id: string) => MenuItem[],
  enabled: (id: string) => boolean = () => true,
): MenuItem[] {
  const rows: MenuItem[] = [];
  for (const id of ids) {
    if (id === "-") rows.push({ kind: "separator" });
    else if (isLocalItem(id)) {
      const item = LOCAL_ITEMS[id];
      rows.push({ kind: "item", id, label: t(item.label), icon: item.icon, disabled: !enabled(id) });
    } else rows.push(...resolve(id));
  }
  return tidySeparators(rows);
}

export function tidySeparators(rows: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const row of rows) {
    if (row.kind === "separator" && (out.length === 0 || out[out.length - 1].kind === "separator")) continue;
    out.push(row);
  }
  while (out.length > 0 && out[out.length - 1].kind === "separator") out.pop();
  return out;
}

/** With text selected and no Copy of its own in the menu, one is put at the top. */
export function withSelectionCopy(rows: MenuItem[], selection: string, t: Translate): MenuItem[] {
  if (!selection.trim()) return rows;
  if (rows.some((row) => (!row.kind || row.kind === "item") && COPIES_SELECTION.has(row.id))) return rows;
  const copy: MenuItem = {
    kind: "item",
    id: "ctx.copySelection",
    label: t(LOCAL_ITEMS["ctx.copySelection"].label),
    icon: LOCAL_ITEMS["ctx.copySelection"].icon,
  };
  return tidySeparators([copy, { kind: "separator" }, ...rows]);
}

/* ------------------------------------------------------------------ *
 * Text fields
 * ------------------------------------------------------------------ */

export type TextField = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

const TEXT_INPUTS = new Set(["", "text", "search", "url", "tel", "password", "email", "number"]);

/** The text field `node` is in, if it is in one. */
export function editableTarget(node: EventTarget | null): TextField | null {
  if (!(node instanceof Element)) return null;
  if (node instanceof HTMLTextAreaElement) return node;
  if (node instanceof HTMLInputElement) return TEXT_INPUTS.has(node.type) ? node : null;
  const editable = node.closest<HTMLElement>("[contenteditable]:not([contenteditable=false])");
  return editable && editable.isContentEditable ? editable : null;
}

function isFormField(field: TextField): field is HTMLInputElement | HTMLTextAreaElement {
  return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement;
}

/** The selected part of a field — or, for an editable block, of the page. */
export function fieldSelection(field: TextField): string {
  if (isFormField(field)) {
    try {
      const start = field.selectionStart;
      const end = field.selectionEnd;
      if (start === null || end === null) return "";
      return field.value.slice(start, end);
    } catch {
      return "";
    }
  }
  return window.getSelection()?.toString() ?? "";
}

/** Which of the text rows apply to this field just now. */
export function textItemEnabled(field: TextField, id: string): boolean {
  const writable = isFormField(field) ? !field.readOnly && !field.disabled : field.isContentEditable;
  const selected = fieldSelection(field).length > 0;
  const secret = field instanceof HTMLInputElement && field.type === "password";
  const hasText = isFormField(field) ? field.value.length > 0 : (field.textContent ?? "").length > 0;
  switch (id) {
    case "text.undo":
    case "text.redo":
    case "text.paste":
      return writable;
    case "text.cut":
      return writable && selected && !secret;
    case "text.copy":
      return selected && !secret;
    case "text.delete":
      return writable && selected;
    case "text.selectAll":
      return hasText;
    default:
      return true;
  }
}

/**
 * Carries out a text row on `field`.
 *
 * The edits go through `execCommand`, not by assigning `value`: that is what fires the
 * same `input` event typing does (so a React field sees the change) and what puts the
 * edit on the field's own undo stack (so Ctrl+Z takes it back).
 */
export async function runTextAction(field: TextField, id: string): Promise<void> {
  field.focus();
  switch (id) {
    case "text.undo":
      document.execCommand("undo");
      return;
    case "text.redo":
      document.execCommand("redo");
      return;
    case "text.copy": {
      const text = fieldSelection(field);
      if (text) await host.copyText(text);
      return;
    }
    case "text.cut": {
      const text = fieldSelection(field);
      if (!text) return;
      await host.copyText(text);
      field.focus();
      document.execCommand("delete");
      return;
    }
    case "text.paste": {
      const text = await host.readText();
      if (!text) return;
      field.focus();
      if (!document.execCommand("insertText", false, text) && isFormField(field)) {
        field.setRangeText(text, field.selectionStart ?? field.value.length, field.selectionEnd ?? field.value.length, "end");
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }
    case "text.delete":
      document.execCommand("delete");
      return;
    case "text.selectAll":
      if (isFormField(field)) field.select();
      else document.execCommand("selectAll");
      return;
  }
}

/* ------------------------------------------------------------------ *
 * Opening a menu
 * ------------------------------------------------------------------ */

export type MenuLook = {
  theme: string;
  customTheme?: CustomTheme;
  language: string;
  fontFamily: string;
};

/** Opens `items` at the pointer, in the app's menu window (or in-page on the web). */
export function openContextMenuAt(
  menu: string,
  items: MenuItem[],
  look: MenuLook,
  clientX: number,
  clientY: number,
): Promise<string | null> {
  return host.openMenu(
    { menu: `context:${menu}`, items, ...look, fontSize: 13 },
    host.anchorForPoint(clientX, clientY),
  );
}

/**
 * The context menu of a window that has nothing but text fields to offer one for — a
 * dialog window: Cut/Copy/Paste in a field, Copy over selected text, and nothing (not
 * the WebView's menu) anywhere else.
 */
export function useTextContextMenu(look: MenuLook | null, t: Translate | null): void {
  useEffect(() => {
    if (!look || !t) return;
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      const field = editableTarget(event.target);
      const selection = window.getSelection()?.toString() ?? "";
      const rows = field
        ? buildMenu(TEXT_MENU, t, () => [], (id) => textItemEnabled(field, id))
        : withSelectionCopy([], selection, t);
      if (rows.length === 0) return;
      void openContextMenuAt(field ? "text" : "selection", rows, look, event.clientX, event.clientY).then((chosen) => {
        if (!chosen) return;
        if (chosen === "ctx.copySelection") void host.copyText(selection);
        else if (field) void runTextAction(field, chosen);
      });
    };
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
    // The look is compared by value: a new object with the same theme is not a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look?.theme, look?.customTheme, look?.language, look?.fontFamily, t]);
}

/** The event a context row sends to the component that owns the clicked place. */
export const CONTEXT_ACTION_EVENT = "mcm-context-action";

/** Asks the component behind `element` to carry out `action` (browse, clear, ...). */
export function sendContextAction(element: Element, action: string): void {
  element.dispatchEvent(new CustomEvent(CONTEXT_ACTION_EVENT, { detail: action, bubbles: true }));
}
