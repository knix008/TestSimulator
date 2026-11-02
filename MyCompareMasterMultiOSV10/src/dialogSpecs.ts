/**
 * The size of every popup dialog window.
 *
 * No popup is resizable and none scrolls: each one's content is laid out to fit, with
 * tabs where there is too much for a single column. `fixed` keeps exactly this size;
 * the others take the height their content reports once, when they open. `resizable`
 * dialogs (the manual) get a normal frame the user can drag.
 *
 * The desktop shell reads this table through the bridge, so a new dialog only needs an
 * entry here.
 */
export type DialogSpec = { width: number; height: number; fixed?: boolean; resizable?: boolean };

export const DIALOG_SPECS = {
  // Wide and tall enough for the prompt editor, whose preview, preset cards and segment
  // fields are the largest thing in the dialog.
  settings: { width: 1060, height: 700, fixed: true },
  about: { width: 600, height: 372, fixed: true },
  print: { width: 1000, height: 760, fixed: true },
  error: { width: 660, height: 440, fixed: true },
  progress: { width: 420, height: 140, fixed: true },
  unsaved: { width: 520, height: 230 },
  recent: { width: 680, height: 480, fixed: true },
  confirm: { width: 500, height: 220 },
  prompt: { width: 560, height: 220 },
  text: { width: 460, height: 190 },
  remote: { width: 520, height: 420, fixed: true },
  // The user's guide: contents on the left, the text on the right. It scrolls, so the
  // user may make it any size; this is only where it starts.
  guide: { width: 1000, height: 720, resizable: true },
} satisfies Record<string, DialogSpec>;

/** Every dialog the app can open; adding an entry above is what makes a new one. */
export type DialogName = keyof typeof DIALOG_SPECS;

export const DEFAULT_DIALOG_SPEC: DialogSpec = { width: 520, height: 360 };

export function dialogSpec(name: string): DialogSpec {
  return (DIALOG_SPECS as Record<string, DialogSpec>)[name] ?? DEFAULT_DIALOG_SPEC;
}
