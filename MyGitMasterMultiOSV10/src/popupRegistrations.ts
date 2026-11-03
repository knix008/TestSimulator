/**
 * The table of popups (see src/popupRegistry.ts). Imported by main.tsx before anything
 * renders, in every window, so the main window and the popup windows agree on it.
 *
 * To add a popup dialog: give it a size in src/dialogSpecs.ts, a component taking
 * DialogComponentProps, and a `registerDialog` line here; then call
 * `host.openDialog(name, payload)`.
 */
import { AppDialog, APP_DIALOG_TYPES, dialogIcon, dialogTitle, type DialogPayload } from "./dialogs/AppDialogs";
import { PrintDialog } from "./dialogs/PrintDialog";
import { ProgressDialog } from "./dialogs/ProgressDialog";
import type { IconName } from "./icons";
import { ListMenu } from "./MenuList";
import { registerDialog, registerMenu } from "./popupRegistry";
import { ThemeMenuPopup } from "./ThemeMenuPopup";

registerMenu("list", { component: ListMenu });
registerMenu("theme", { component: ThemeMenuPopup });

// The app's own dialogs (src/dialogs/AppDialogs.tsx): the payload is the dialog's state.
for (const type of APP_DIALOG_TYPES) {
  registerDialog(type, {
    component: AppDialog,
    icon: (payload, t) => dialogIcon((payload ?? { type }) as DialogPayload, t),
    title: (t, payload) => (payload ? dialogTitle(payload as DialogPayload, t) : "") || t(type === "prefs" ? "prefsTitle" : type),
  });
}

registerDialog("progress", {
  component: ProgressDialog,
  icon: (payload) => (payload as { icon?: IconName } | null)?.icon ?? "refresh",
  title: (t, payload) => (payload as { label?: string } | null)?.label || t("progressTitle"),
});

registerDialog("print", {
  component: PrintDialog,
  icon: "print",
  title: (t) => `${t("print")} — ${t("printPreview")}`,
});
