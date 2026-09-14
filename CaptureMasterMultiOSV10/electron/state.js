// Process-wide state shared by main.js, ipc.js and dialogs.js.
module.exports = {
  /** @type {import('electron').BrowserWindow|null} */
  mainWin: null,
  /** Set once the renderer has agreed to close; the close event then proceeds. */
  quitting: false,
  /** A file path from the shell that arrived before the renderer was ready. */
  pendingOpenPath: null,
  /** True when the executable changed under an existing profile (see main.js). */
  pendingInstallCheck: false,
  /** When the main window was created; during start-up the window follows its minimum size exactly. */
  windowCreatedAt: 0,
};
