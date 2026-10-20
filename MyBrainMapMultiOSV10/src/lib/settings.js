// Default values of the Settings dialog / session (mirrors core/session.js).
// The session file is the source of truth; these fill in until it loads.

export const SETTINGS_DEFAULTS = {
  language: 'ko',
  theme: 'midnight',
  customThemes: [],
  mapFont: '',
  mapFontSize: 14,
  defaultLayout: 'map',
  defaultMapStyle: 'auto',
  restoreSession: true,
  showStartOnLaunch: false,
  autoSave: 'off',
  autoSaveDelay: 10,
  reloadChangedFiles: true,
  confirmClose: true,
  sidebarVisible: true,
  sidebarWidth: 250,
  sidebarTab: 'outline',
  panelVisible: true,
  panelWidth: 300,
  panelTab: 'format',
  toolbarVisible: true,
  statusBarVisible: true,
  overviewVisible: true,
  showGrid: true,
  showRulers: true,
  commentAuthor: '',
  tutorialDone: false,   // the guided tour has run once (it starts by itself on the first launch)
  animate: true,
  wheelZoom: false,
  autoBalance: true,
  spellCheck: true,
  view: 'map',
  exportScale: 2,
  exportPadding: 40,
  exportTransparent: false,
  printPaper: 'a4',
  printLandscape: true,
  printMargin: 10,
  printHeader: true,
  printFooter: true,
  printColor: true,
  printPages: 1,
  userTags: [],
  startScreen: { scene: 'radial', transparency: 80, motion: 20, cameraSpeed: 100, objectSpeed: 100, skySpeed: 100 },
};

export const SETTING_KEYS = Object.keys(SETTINGS_DEFAULTS);

// What Settings › 기본값으로 되돌리기 resets: the preferences the dialog
// edits — not the UI language and not the window layout (panes, bars).
export const RESET_KEYS = [
  'theme', 'mapFont', 'mapFontSize', 'defaultLayout', 'defaultMapStyle', 'restoreSession', 'showStartOnLaunch', 'autoSave', 'autoSaveDelay',
  'reloadChangedFiles', 'confirmClose', 'showGrid', 'showRulers', 'animate', 'wheelZoom', 'autoBalance', 'spellCheck', 'exportScale', 'exportPadding',
  'exportTransparent', 'printPaper', 'printLandscape', 'printMargin', 'printHeader', 'printFooter', 'printColor', 'printPages',
];
export const resetPatch = () => Object.fromEntries(RESET_KEYS.map((k) => [k, SETTINGS_DEFAULTS[k]]));

export function pickSettings(obj) {
  const out = {};
  for (const k of SETTING_KEYS) out[k] = obj && obj[k] !== undefined && obj[k] !== null ? obj[k] : SETTINGS_DEFAULTS[k];
  if (!out.startScreen || typeof out.startScreen !== 'object') out.startScreen = { ...SETTINGS_DEFAULTS.startScreen };
  else out.startScreen = { ...SETTINGS_DEFAULTS.startScreen, ...out.startScreen };
  if (!Array.isArray(out.userTags)) out.userTags = [];
  if (!['map', 'outline', 'gantt', 'kanban'].includes(out.view)) out.view = 'map';
  return out;
}

// UI fonts offered by the font picker (the input is free text too).
export const FONT_SUGGESTIONS = ['Segoe UI', 'Malgun Gothic', 'Noto Sans KR', 'Pretendard', 'Nanum Gothic', 'Nanum Square', 'Apple SD Gothic Neo', 'Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Georgia', 'Times New Roman', 'Noto Serif KR', 'Batang', 'Comic Sans MS', 'Segoe Print', 'Consolas', 'Cascadia Mono'];
