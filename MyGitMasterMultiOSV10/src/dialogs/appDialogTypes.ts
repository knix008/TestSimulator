/**
 * The app's dialogs as data: what App describes (`DialogState`), what travels to the
 * dialog's window (`DialogPayload`, without the callback), what comes back
 * (`AppDialogResult`), and each dialog's icon and title. No React here, so the tests
 * can check it under Node; the dialogs themselves are in AppDialogs.tsx.
 */
import type { Report } from "../../core/report";
import type { Lang } from "../i18n";
import type { IconName } from "../icons";
import type { PrefsTab } from "../settings/types";

export type Creds = { username: string; password: string; remember?: boolean };

export type DialogState =
  | { type: "open"; path: string }
  | { type: "clone"; url: string; destination: string; username: string; password: string }
  | { type: "browse"; url: string; username: string; password: string }
  | { type: "auth"; username: string; password: string; remember: boolean; resolve: (value: Creds | null) => void }
  | { type: "commit"; category: string; subject: string; body: string }
  | { type: "categories"; text: string }
  | { type: "prefs"; language: Lang; theme: string; tool: string; args: string; mergeTool: string; mergeArgs: string; shell: string; tab?: PrefsTab }
  | { type: "confirm"; title: string; message: string; resolve: (value: boolean) => void }
  | { type: "prompt"; title: string; label: string; value: string; resolve: (value: string | null) => void }
  | { type: "text"; title: string; text: string; save?: boolean }
  | { type: "report"; report: Report }
  | { type: "about" }
  | { type: "error"; message: string; detail: string }
  | { type: "export"; sha: string; path: string };

export type DialogType = DialogState["type"];

/** A dialog's state as it travels to its window: functions stay with the opener. */
export type DialogPayload = DialogState extends infer S ? (S extends { resolve: unknown } ? Omit<S, "resolve"> : S) : never;

export type AppDialogResult =
  | { kind: "submit"; dialog: DialogPayload }
  | { kind: "value"; value: unknown }
  | { kind: "categories" };

export const APP_DIALOG_TYPES: DialogType[] = [
  "open", "clone", "browse", "auth", "commit", "categories", "prefs", "confirm", "prompt", "text", "report", "about", "error", "export",
];

/** The dialog's state without its callback, ready to send to another window. */
export function dialogPayload(dialog: DialogState): DialogPayload {
  const { resolve: _resolve, ...rest } = dialog as DialogState & { resolve?: unknown };
  return rest as DialogPayload;
}

export function dialogIcon(dialog: DialogPayload, t: (key: string) => string): IconName {
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
    case "about": return "help";
    case "error": return "alert";
    case "export": return "snapshot";
  }
}

export function dialogTitle(dialog: DialogPayload, t: (key: string) => string): string {
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
    case "about": return t("about");
    case "error": return t("errorTitle");
    case "export": return t("exportCommit");
    default: return "";
  }
}
