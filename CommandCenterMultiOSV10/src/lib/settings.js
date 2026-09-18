// Default values of the Settings dialog / session.
import { PROMPT_DEFAULT } from './prompt';

export const SETTINGS_DEFAULTS = {
  // general
  language: 'ko',
  theme: 'midnight',
  fontSize: 12,
  confirmDelete: true,
  restoreFolders: true,
  autoRefresh: true,
  historyMax: 50,       // undo steps kept
  splitSizeMB: 10,      // default split size when compressing
  // panels
  showHidden: false,
  showPerm: true,
  showDate: true,
  showType: true,
  showSize: true,
  quickSearch: true,    // typing letters jumps to a file
  spaceMeasures: true,  // Space on a folder measures it
  compareToleranceSec: 2, // "newer" in compare directories
  showToolbar: true,
  fnBar: true,
  imagePreview: true,   // a click on an image in the list opens / updates the preview window
  // opening files
  textOpen: 'app',      // what Enter / double-click does with a text file: app | viewer | editor | custom
  textApp: '',          // program for textOpen = custom
  textExts: 'txt md log ini cfg conf json yml yaml xml csv js jsx ts tsx css html htm py java c cpp h sh ps1 bat cmd',
  // viewer / editor
  viewerWrap: true,
  viewerFontSize: 12,
  editorFontSize: 12,
  editorTabSize: 4,
  editorWrap: false,
  printFontSize: 10,    // pt, on paper (Ctrl+P — text files, the viewer, the editor)
  // windows
  separateWindows: true, // tools open as separate windows (else as dialogs inside the app)
  // terminal
  termShell: '',      // shell of a new terminal (id from term.shells); '' = the first one offered
  termCwd: '',        // where new terminals start; '' = the active panel's folder
  termColor: true,    // output in colour (the programs' ANSI colours + error / warning / link highlighting); false = plain
  termEol: 'auto',    // line ending Enter sends to a running program: auto (the shell's own) | lf | crlf
  termCr: 'overwrite', // a lone CR in the output: overwrite (redraw the line, like a terminal) | newline | strip
  termScrollback: 10000, // lines kept per terminal transcript
  prompt: PROMPT_DEFAULT, // terminal prompt theme (see prompt.js)
  customPrompts: [],      // user-saved prompt themes (settings › terminal › prompt): [{ id, label, config }]
  customThemes: [],       // user-made themes (settings › theme): [{ id, label, mode, colors }]
};

// Keys the Settings dialog edits (everything else in the session — paths, bounds, hotlist — is left alone).
export const SETTINGS_KEYS = Object.keys(SETTINGS_DEFAULTS);

// Extension → is it a "text file" under the current setting?
export function isTextFile(name, exts) {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const set = String(exts || SETTINGS_DEFAULTS.textExts).toLowerCase().split(/[\s,;]+/).filter(Boolean);
  return ext ? set.includes(ext) : false;
}
