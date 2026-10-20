// Session / settings persistence: one JSON file in the config directory
// (desktop: the profile folder the Tauri shell passes with --config; web:
// --config or ~/.config/my-thinkmap).
//
// Everything the UI wants to remember lives here — settings, window bounds,
// the open maps (with the unsaved ones kept as drafts), the recent-files list.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULTS = {
  language: 'ko',
  theme: 'midnight',
  customThemes: [],        // user-made themes (settings › theme): [{ id, label, mode, colors }]
  mapFont: '',             // font of the topics ('' = the UI font)
  mapFontSize: 14,         // base size of a subtopic in px (main topics and the central topic are larger)
  defaultLayout: 'map',    // layout of a new map: map · right · left · orgDown · orgUp · treeRight · treeLeft · timeline · fishbone
  defaultMapStyle: 'auto', // map style of a new map ('auto' follows the app theme)
  restoreSession: true,
  showStartOnLaunch: false,
  autoSave: 'off',         // off | blur | delay
  autoSaveDelay: 10,       // seconds after the last edit (autoSave = delay)
  reloadChangedFiles: true,
  confirmClose: true,
  sidebarVisible: true,    // left: outline of the map + find / filter
  sidebarWidth: 250,
  sidebarTab: 'outline',   // outline | find | markers
  panelVisible: true,      // right: the task pane (format · markers · notes · task · links · map)
  panelWidth: 300,
  panelTab: 'format',
  toolbarVisible: true,
  statusBarVisible: true,
  overviewVisible: true,   // the small overview of the whole map at the bottom right of the canvas
  showGrid: false,         // dot grid behind the map
  animate: true,           // smooth camera moves and collapse / expand
  wheelZoom: false,        // the mouse wheel zooms (off: it scrolls, Ctrl+wheel zooms)
  autoBalance: true,       // map layout: new main topics go to the lighter side
  spellCheck: true,        // the browser spell checker in the topic / notes editors
  view: 'map',             // main view: map | outline | gantt
  exportScale: 2,          // PNG / JPEG export: pixels per map pixel
  exportPadding: 40,
  exportTransparent: false,
  printPaper: 'a4',        // a4 · letter · legal · a3 · a5
  printLandscape: true,
  printMargin: 10,         // mm
  printHeader: true,       // the map's title at the top of the page
  printFooter: true,       // date and page number at the bottom
  printColor: true,
  printPages: 1,           // 1 = fit on one page; 2 / 4 / 6 / 9 = tiles
  userTags: [],            // tags offered in the tag picker (used ones are added)
  sessionVersion: 1,
  windowBounds: null,
  tabs: [],          // [{ path, name, draft, dirty, view: { zoom, x, y }, selected }]
  activeTab: 0,
  recent: [],        // most recent first, absolute paths
  themeBg: '#12161c',
  startScreen: { scene: 'network', transparency: 80, motion: 20, cameraSpeed: 100, objectSpeed: 100, skySpeed: 100 },
};

const MAX_RECENT = 12;
const MAX_DRAFT = 8 * 1024 * 1024;   // an unsaved map larger than this (embedded pictures) is not kept across restarts

function defaultConfigDir() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || os.homedir(), 'My ThinkMap');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'My ThinkMap');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'my-thinkmap');
}

function createSession(configDir) {
  const dir = configDir || defaultConfigDir();
  const file = path.join(dir, 'session.json');
  let data = null;

  function load() {
    if (data) return data;
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { /* first run */ }
    data = { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
    if (!Array.isArray(data.tabs)) data.tabs = [];
    if (!Array.isArray(data.recent)) data.recent = [];
    if (!Array.isArray(data.userTags)) data.userTags = [];
    if (!data.startScreen || typeof data.startScreen !== 'object') data.startScreen = { ...DEFAULTS.startScreen };
    data.sessionVersion = DEFAULTS.sessionVersion;
    return data;
  }

  function write() {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  return {
    dir,
    file,
    defaults: DEFAULTS,
    get: () => ({ ...load() }),
    save(patch) {
      load();
      Object.assign(data, patch || {});
      if (Array.isArray(data.tabs)) {
        data.tabs = data.tabs.map((t) => (t && typeof t.draft === 'string' && t.draft.length > MAX_DRAFT ? { ...t, draft: '', draftTooLarge: true } : t));
      }
      write();
      return { ...data };
    },
    touchRecent(p) {
      load();
      const list = data.recent.filter((x) => x !== p);
      list.unshift(p);
      data.recent = list.slice(0, MAX_RECENT);
      write();
      return data.recent.slice();
    },
    removeRecent(p) {
      load();
      data.recent = data.recent.filter((x) => x !== p);
      write();
      return data.recent.slice();
    },
    clearRecent() {
      load();
      data.recent = [];
      write();
      return [];
    },
  };
}

module.exports = { createSession, DEFAULTS, defaultConfigDir, MAX_DRAFT };
