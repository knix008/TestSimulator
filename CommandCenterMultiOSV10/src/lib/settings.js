// Default values of the Settings dialog / session.
export const SETTINGS_DEFAULTS = {
  language: 'ko',
  theme: 'midnight',
  showHidden: false,
  fontSize: 13,
  confirmDelete: true,
  splitSizeMB: 10,
  restoreFolders: true,
  autoRefresh: true,
  termShell: '',      // shell of a new terminal (id from term.shells); '' = the first one offered
  termCwd: '',        // where new terminals start; '' = the active panel's folder
};
