'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

/** Subscribe helper that hands back an unsubscribe function. */
function on(channel, handler) {
  const wrapped = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('dockApi', {
  config: {
    get: () => invoke('config:get'),
    patch: (partial) => invoke('config:patch', partial),
    reset: () => invoke('config:reset'),
    export: () => invoke('config:export'),
    import: () => invoke('config:import'),
    onChange: (handler) => on('config:changed', handler),
  },

  items: {
    get: () => invoke('items:get'),
    set: (items) => invoke('items:set', items),
    add: (item) => invoke('items:add', item),
    addPaths: (paths) => invoke('items:add-paths', paths),
    insertPaths: (paths, index) => invoke('items:insert-paths', { paths, index }),
    update: (id, patch) => invoke('items:update', { id, patch }),
    remove: (id) => invoke('items:remove', id),
    move: (from, to) => invoke('items:move', { from, to }),
    launch: (id) => invoke('items:launch', id),
  },

  dock: {
    reportSize: (width, height) => ipcRenderer.send('dock:content-size', { width, height }),
    mouseEnter: () => ipcRenderer.send('dock:mouse-enter'),
    mouseLeave: () => ipcRenderer.send('dock:mouse-leave'),
    contextMenu: (itemId, insertIndex) => invoke('dock:context-menu', { itemId, insertIndex }),
    onHiddenChanged: (handler) => on('dock:hidden-changed', handler),
    onRunning: (handler) => on('dock:running', handler),
    onRunningApps: (handler) => on('dock:running-apps', handler),
    launchPath: (target) => invoke('items:launch-path', target),
    // The region that should capture clicks; the rest of the window stays
    // click-through so the desktop underneath keeps working.
    setInteractiveRect: (rect) => ipcRenderer.send('dock:interactive-rect', rect),
    reload: () => invoke('app:reload-dock'),
  },

  themes: {
    list: () => invoke('themes:list'),
    variables: (id) => invoke('themes:variables', id),
    openFolder: () => invoke('themes:open-folder'),
  },

  apps: {
    scan: (opts) => invoke('apps:scan', opts),
  },

  dialog: {
    addApp: () => invoke('dialog:add-app'),
    addFolder: () => invoke('dialog:add-folder'),
    pickIcon: () => invoke('dialog:pick-icon'),
    pickTarget: () => invoke('dialog:pick-target'),
  },

  system: {
    displays: () => invoke('system:displays'),
    autostart: () => invoke('system:autostart'),
    clearIconCache: () => invoke('system:clear-icon-cache'),
  },

  settings: {
    open: () => invoke('settings:open'),
    close: () => invoke('settings:close'),
    ok: () => invoke('settings:ok'),
    onFocusItem: (handler) => on('settings:focus-item', handler),
  },

  trash: {
    state: () => invoke('trash:state'),
    empty: () => invoke('trash:empty'),
    onChange: (handler) => on('dock:trash', handler),
  },

  icons: {
    fromProgram: (target) => invoke('icons:from-program', target),
    pickProgram: () => invoke('icons:pick-program'),
    useFile: (source) => invoke('icons:use-file', source),
  },

  app: {
    quit: () => invoke('app:quit'),
  },

  /**
   * Electron removed `File.path`; `webUtils.getPathForFile` is the supported
   * way to turn a dropped File back into a filesystem path.
   */
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
});
