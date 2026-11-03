/**
 * What colour each icon is.
 *
 * An icon is easier to find by its colour than by its outline: folders are amber, git
 * transfers blue/green, commits green, anything that deletes or discards red. Every name
 * in `icons.tsx` has a hue here; the hue is a *name*, and `icons.css` turns it into one
 * shade for light themes and another for dark ones (switched on `html[data-mode]`), so a
 * yellow never vanishes on a white menu nor a navy on a black one.
 *
 * Kept free of JSX so the unit tests can import it.
 */

export type Tone =
  | "blue" | "sky" | "indigo" | "purple" | "pink" | "red" | "orange" | "amber"
  | "yellow" | "green" | "teal" | "cyan" | "slate" | "brown";

export const TONES: readonly Tone[] = [
  "blue", "sky", "indigo", "purple", "pink", "red", "orange", "amber",
  "yellow", "green", "teal", "cyan", "slate", "brown",
];

export const ICON_TONE: Record<string, Tone> = {
  // Files, folders, places
  folder: "amber",
  open: "amber",
  folderPlus: "amber",
  filePlus: "blue",
  drive: "slate",
  home: "teal",
  browse: "sky",
  clone: "indigo",

  // Git
  branch: "orange",
  branchNew: "orange",
  merge: "purple",
  tag: "yellow",
  history: "indigo",
  clock: "slate",
  refresh: "teal",
  plus: "green",
  undo: "orange",
  discard: "red",
  commit: "green",
  fetch: "sky",
  pull: "blue",
  push: "purple",
  stash: "brown",
  stashPop: "brown",
  status: "cyan",
  hash: "slate",
  checkout: "orange",
  diff: "cyan",

  // Lists, export, print
  list: "cyan",
  export: "teal",
  snapshot: "pink",
  print: "slate",
  copy: "blue",
  save: "blue",
  search: "indigo",
  wrap: "teal",

  // Destructive / state
  trash: "red",
  stop: "red",
  alert: "red",
  close: "red",
  lock: "yellow",
  key: "yellow",
  eye: "sky",
  eyeOff: "slate",
  check: "green",
  info: "blue",

  // Appearance and app
  theme: "pink",
  palette: "pink",
  brush: "purple",
  language: "sky",
  prefs: "indigo",
  toolbar: "indigo",
  more: "slate",
  help: "blue",
  book: "indigo",
  tutorial: "green",
  edit: "orange",
  terminal: "slate",
  external: "teal",
  user: "purple",

  // Layout and navigation
  panelLeft: "indigo",
  panelRight: "indigo",
  panelBottom: "indigo",
  prev: "slate",
  next: "slate",
};

/**
 * Icons whose first drawn element is a closed shape: it gets a light wash of the icon's
 * own colour, which is what makes the set read as colourful rather than as outlines.
 */
export const DUOTONE: ReadonlySet<string> = new Set([
  "folder", "open", "folderPlus", "filePlus", "drive", "home", "prefs", "commit", "stash", "stashPop", "theme", "palette",
  "help", "info", "alert", "lock", "key", "terminal", "print", "save", "book", "tutorial", "clock", "browse",
  "panelLeft", "panelRight", "panelBottom", "tag", "check", "user", "copy", "snapshot", "toolbar", "clone",
]);

export function toneOf(name: string): Tone {
  return ICON_TONE[name] ?? "slate";
}
