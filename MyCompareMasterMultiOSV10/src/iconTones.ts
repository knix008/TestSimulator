/**
 * What colour each icon is.
 *
 * An icon is easier to find by its colour than by its outline: folders are amber, files
 * blue, a merge purple, a conflict and anything that deletes red, git orange. So every
 * name in `icons.tsx` has a hue here, and the hue is a *name* rather than a colour —
 * `styles.css` turns it into one shade for light themes and another for dark ones
 * (`--tone-*`, switched on `html[data-theme-kind]`), which is what keeps a yellow from
 * vanishing on a white menu and a navy from vanishing on a black one.
 *
 * The five diff states are not hues of their own: they borrow the theme's own
 * `--added-accent`, `--removed-accent` and so on, so an "added" icon is the exact
 * green the added rows are drawn in, on every one of the themes.
 *
 * Kept free of JSX so the unit tests can import it.
 */

export type Tone =
  | "blue" | "sky" | "indigo" | "purple" | "pink" | "red" | "orange" | "amber"
  | "yellow" | "green" | "teal" | "cyan" | "slate" | "brown"
  | "added" | "removed" | "modified" | "conflict" | "resolved";

export const TONES: readonly Tone[] = [
  "blue", "sky", "indigo", "purple", "pink", "red", "orange", "amber",
  "yellow", "green", "teal", "cyan", "slate", "brown",
  "added", "removed", "modified", "conflict", "resolved",
];

export const ICON_TONE: Record<string, Tone> = {
  // Files and folders
  file: "blue",
  files: "blue",
  page: "blue",
  compareFiles: "sky",
  folder: "amber",
  folders: "amber",
  open: "amber",
  home: "teal",
  archive: "brown",
  image: "pink",
  video: "red",
  music: "pink",
  font: "indigo",
  binary: "slate",
  grid: "green",
  monitor: "blue",
  lock: "yellow",
  code: "cyan",
  hex: "indigo",

  // Merge and version control
  merge: "purple",
  conflict: "conflict",
  base: "brown",
  local: "teal",
  remote: "indigo",
  both: "purple",
  unresolve: "orange",
  resolveAll: "resolved",
  git: "orange",
  repository: "orange",
  commit: "orange",
  branch: "orange",
  stage: "green",

  // Saving and sessions
  save: "green",
  saveAs: "green",
  session: "indigo",
  download: "green",
  print: "slate",
  preview: "teal",
  exit: "red",
  close: "red",

  // Editing
  undo: "indigo",
  redo: "indigo",
  copy: "blue",
  paste: "brown",
  cut: "red",
  edit: "orange",
  eraser: "red",
  stop: "red",
  selectAll: "sky",
  find: "teal",
  zoomIn: "teal",
  zoomOut: "teal",
  zoomReset: "teal",
  filter: "purple",
  trash: "red",
  trashLeft: "red",
  trashRight: "red",
  clearAll: "red",
  plus: "green",
  minus: "red",
  refresh: "green",
  sync: "teal",
  swap: "purple",

  // Moving around
  prev: "sky",
  next: "sky",
  first: "sky",
  last: "sky",
  up: "sky",
  down: "sky",
  historyBack: "sky",
  historyForward: "sky",
  link: "sky",
  drag: "slate",

  // How things look
  theme: "pink",
  palette: "pink",
  sun: "amber",
  moon: "indigo",
  language: "sky",
  wrap: "cyan",
  highlight: "yellow",
  whitespace: "slate",
  letterCase: "indigo",
  comment: "teal",
  quote: "brown",
  hash: "indigo",
  bookmark: "amber",
  eye: "teal",
  panelLeft: "indigo",
  panelRight: "indigo",
  statusBar: "indigo",
  columns: "blue",
  tree: "green",
  list: "indigo",
  minimize: "slate",
  maximize: "slate",
  restore: "slate",

  // Tools and information
  settings: "slate",
  terminal: "green",
  cloud: "sky",
  clock: "orange",
  about: "blue",
  help: "purple",
  book: "brown",
  graduation: "purple",
  warning: "orange",
  error: "red",
  check: "green",
  dot: "slate",

  // The diff states: the theme's own colours for them.
  added: "added",
  removed: "removed",
  modified: "modified",
  equal: "slate",
  leftOnly: "removed",
  rightOnly: "added",
};

/**
 * Names drawn duotone: the outline plus a light wash of the same colour inside the
 * main shape. Only icons whose first sub-path is a closed body (a page, a folder, a
 * lens, a circle) are in the list — filling an open stroke such as an arrow or a merge
 * fork would fill the triangle it happens to enclose and blur the glyph at 14px.
 */
export const DUOTONE: ReadonlySet<string> = new Set([
  "file", "files", "page", "folder", "folders", "compareFiles", "save", "session",
  "preview", "eye", "find", "zoomIn", "zoomOut", "zoomReset", "conflict", "warning",
  "theme", "palette", "language", "about", "help", "error", "clock", "panelLeft",
  "panelRight", "statusBar", "image", "hex", "comment", "bookmark", "cloud", "archive",
  "video", "monitor", "terminal", "repository", "base", "commit", "sun", "moon",
  "maximize", "filter", "binary", "copy", "columns", "edit", "eraser", "stop",
]);

/** The hue for `name`; a name without one is drawn in the text colour. */
export function toneOf(name: string): Tone | undefined {
  return Object.prototype.hasOwnProperty.call(ICON_TONE, name) ? ICON_TONE[name] : undefined;
}

/**
 * The first sub-path of a path: what the duotone wash fills. `M` and `m` both start a
 * sub-path; the first one is at offset 0, so the search starts at 1.
 */
export function firstSubpath(path: string): string {
  const next = path.slice(1).search(/[Mm]/);
  return next < 0 ? path : path.slice(0, next + 1);
}
