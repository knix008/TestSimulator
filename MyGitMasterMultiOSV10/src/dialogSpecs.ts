/**
 * The size of every popup dialog window.
 *
 * On the desktop each dialog is its own OS window (src-tauri/src/popups.rs), so it may
 * be dragged anywhere, even off the main window. `fixed` keeps exactly this size; the
 * others start at it and then take the height their content reports. `resizable`
 * dialogs get a frame the user can drag. In the browser the same numbers size the
 * in-page modal.
 *
 * A new dialog needs an entry here and a `registerDialog` call (src/popupRegistry.ts).
 */
import type { PopupSpec } from "./global";

export type DialogSpec = PopupSpec;

export const DIALOG_SPECS = {
  // Vertical tabs on the left; the user may resize it, never below its minimum.
  prefs: { width: 900, height: 600, resizable: true, minWidth: 640, minHeight: 420 },
  about: { width: 600, height: 380, fixed: true },
  error: { width: 660, height: 440, fixed: true },
  // Long operations: shown without taking the keyboard away from the main window.
  progress: { width: 440, height: 210, fixed: true, noFocus: true },
  confirm: { width: 500, height: 210 },
  prompt: { width: 560, height: 220 },
  text: { width: 620, height: 420 },
  open: { width: 620, height: 240 },
  clone: { width: 640, height: 320 },
  browse: { width: 640, height: 300 },
  auth: { width: 520, height: 300 },
  commit: { width: 640, height: 460 },
  categories: { width: 520, height: 420 },
  export: { width: 620, height: 240 },
  report: { width: 900, height: 640, fixed: true },
  // Print preview: a window of its own the user can move anywhere and resize.
  print: { width: 1040, height: 760, resizable: true, minWidth: 640, minHeight: 420 },
} satisfies Record<string, DialogSpec>;

export type DialogName = keyof typeof DIALOG_SPECS;

export const DEFAULT_DIALOG_SPEC: DialogSpec = { width: 520, height: 360 };

export function dialogSpec(name: string): DialogSpec {
  return (DIALOG_SPECS as Record<string, DialogSpec>)[name] ?? DEFAULT_DIALOG_SPEC;
}
