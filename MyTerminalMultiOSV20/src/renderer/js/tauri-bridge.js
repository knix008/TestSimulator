// window.myTerminal for the Tauri build — the same API the Electron preload
// exposed, so the renderer (app.js, popup-app.js, dropdown-app.js) is
// unchanged. The program injects this file into every window before the page
// runs (src-tauri/src/lib.rs, initialization_script), with
// window.__MYTERMINAL_BOOT__ = { platform, label } set just before it.
//
// Calls go to one command, `mt`, named by the Electron IPC channel; the
// program answers window / dialog / clipboard channels itself and passes the
// rest to the Node host (src/host). Events arrive as `mt:<window label>`.
(function () {
  'use strict';
  const boot = window.__MYTERMINAL_BOOT__;
  if (!boot || window.myTerminal) return;

  const internals = () => window.__TAURI_INTERNALS__;
  const invoke = (ch, a) => internals().invoke('mt', { ch, a: a === undefined ? null : a });
  // A call made after a listener was added waits until that listener is
  // registered: a popup says "ready" right after listening for its init message.
  const call = (ch, a) =>
    listening ? listening.then(() => invoke(ch, a), () => invoke(ch, a)) : invoke(ch, a);
  // ipcRenderer.send: nobody waits for an answer.
  const send = (ch, a) => {
    call(ch, a).catch(() => {});
  };

  const listeners = new Map();
  let listening = null;
  function startListening() {
    if (listening) return listening;
    const handler = internals().transformCallback((event) => {
      const msg = event && event.payload;
      if (!msg || !msg.ch) return;
      const set = listeners.get(msg.ch);
      if (!set) return;
      for (const fn of [...set]) {
        try {
          fn(msg.p);
        } catch (err) {
          console.error(err);
        }
      }
    });
    listening = internals().invoke('plugin:event|listen', {
      event: `mt:${boot.label}`,
      target: { kind: 'Any' },
      handler,
    });
    return listening;
  }
  const on = (ch) => (cb) => {
    if (!listeners.has(ch)) listeners.set(ch, new Set());
    listeners.get(ch).add(cb);
    startListening();
    return () => listeners.get(ch)?.delete(cb);
  };

  // Popups and menus are measured while their window is still hidden, and a
  // hidden WebView2 never runs animation frames: then a timer stands in.
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  const fallbacks = new Map();
  window.requestAnimationFrame = (cb) => {
    let done = false;
    let id = 0;
    const run = (t) => {
      if (done) return;
      done = true;
      clearTimeout(fallbacks.get(id));
      fallbacks.delete(id);
      cb(typeof t === 'number' ? t : performance.now());
    };
    id = nativeRaf(run);
    if (document.hidden) fallbacks.set(id, setTimeout(run, 32));
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    clearTimeout(fallbacks.get(id));
    fallbacks.delete(id);
    nativeCancel(id);
  };

  // The toolbar and popup title bars move the window through CSS
  // `app-region: drag`. WebView2 (Windows) honours it natively; WebKit on
  // macOS / Linux does not, so a press there starts the system move.
  if (boot.platform !== 'win32') {
    const DRAG = '#toolbar, .popup-titlebar';
    const NO_DRAG = 'button, input, select, textarea, a, label, [role="tab"], .tb-menu, .tb-opacity, .tab-item';
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !e.target.closest) return;
      if (!e.target.closest(DRAG) || e.target.closest(NO_DRAG)) return;
      if (e.detail === 2 && e.target.closest('#toolbar')) {
        invoke('window:maximize');
        return;
      }
      invoke('window:startDragging').catch(() => {});
    });
  }

  // Electron's win.setOpacity: the window is transparent, so fading the page fades the window.
  let opacity = 1;
  function paintOpacity() {
    if (!document.body) return;
    document.body.style.opacity = opacity >= 1 ? '' : String(opacity);
  }
  document.addEventListener('DOMContentLoaded', paintOpacity);

  window.myTerminal = {
    platform: boot.platform,
    isElectron: true,
    isTauri: true,

    minimize: () => call('window:minimize'),
    maximize: () => call('window:maximize'),
    close: () => call('window:close'),
    quitApp: () => call('app:quit'),
    setWindowOpacity: (value) => {
      const n = Number(value);
      opacity = Math.max(0.2, Math.min(1, Number.isFinite(n) ? n : 1));
      paintOpacity();
      return Promise.resolve(true);
    },
    isMaximized: () => call('window:isMaximized'),
    getWindowBounds: () => call('window:getBounds'),
    setMinSize: (size) => call('window:setMinSize', size || {}),
    resizeWindowBy: (delta) => call('window:resizeBy', delta || {}),
    onMaximized: on('window:maximized'),

    getAppInfo: () => call('app:getInfo'),
    getSettings: () => call('settings:get'),
    setSettings: (settings) => call('settings:set', settings),
    openExternal: (url) => call('shell:openExternal', url),
    clipboardWriteText: (text) => call('clipboard:writeText', String(text ?? '')),
    clipboardReadText: () => call('clipboard:readText'),
    reportError: (info) => call('app:reportError', info || {}),
    onAppError: on('app:error'),
    onOpenSettings: on('tray:openSettings'),

    openPopup: (options) => call('popup:open', options || {}),
    closePopup: (id) => call('popup:close', id),
    focusPopup: (id) => call('popup:focus', id),
    showPopup: (id) => call('popup:show', id),
    fitPopup: (payload) => call('popup:fit', payload || {}),
    setPopupResizable: (id, resizable) => call('popup:setResizable', { id, resizable: resizable !== false }),
    popupSend: (id, message) => call('popup:send', { id, message }),
    popupGetId: () => call('popup:getId'),
    onPopupEvent: on('popup:event'),
    onPopupMessage: on('popup:message'),
    pickBackgroundImage: () => call('background:pick'),
    listBackgroundImages: () => call('background:list'),
    selectBackgroundImage: (id) => call('background:select', id),
    removeBackgroundImage: (id) => call('background:remove', id),
    loadBackgroundImage: () => call('background:load'),
    clearBackgroundImage: () => call('background:clear'),
    pickDirectory: (options) => call('dialog:pickDirectory', options || {}),

    ptyStart: (options) => call('pty:start', options),
    ptyWrite: (sessionId, data) => call('pty:write', { sessionId, data }),
    ptyResize: (sessionId, cols, rows) => call('pty:resize', { sessionId, cols, rows }),
    ptyKill: (sessionId) => call('pty:kill', { sessionId }),
    onPtyData: on('pty:data'),
    onPtyExit: on('pty:exit'),

    getPromptPresets: () => call('prompt:getPresets'),
    listShells: (options) => call('shells:list', options || {}),
    setPrompt: (template) => call('prompt:set', template),

    sshConnect: (config) => call('ssh:connect', config),
    sshDisconnect: (payload) => call('ssh:disconnect', payload || {}),
    sshStatus: (payload) => call('ssh:status', payload || {}),
    onSshDisconnected: on('ssh:disconnected'),

    detachSession: (payload) => call('session:detach', payload),
    attachSession: (payload) => call('session:attach', payload),
    takeAdopt: (sessionId) => call('session:takeAdopt', sessionId),
    findWindowAtPoint: (point) => call('window:findAtPoint', point || {}),
    destroyEmptyWindow: () => call('window:destroyEmpty'),
    showMergePreview: (payload) => send('session:mergePreview', payload || {}),
    clearMergePreview: () => send('session:mergePreviewClear'),
    onMergePreview: on('session:mergePreview'),
    onMergePreviewClear: on('session:mergePreviewClear'),
    onSessionDetached: on('session:detached'),
    onSessionAdopt: on('session:adopt'),

    showDetachPreview: (options) => call('detachPreview:show', options || {}),
    moveDetachPreview: (options) => send('detachPreview:move', options || {}),
    hideDetachPreview: () => call('detachPreview:hide'),

    openDropdown: (payload) => call('dropdown:open', payload || {}),
    closeDropdown: () => call('dropdown:close'),
    fitDropdown: (size) => call('dropdown:fit', size || {}),
    pickDropdown: (payload) => call('dropdown:pick', payload || {}),
    // The menu window is built ahead of time: it asks for its contents once it listens.
    onDropdownInit: (cb) => {
      const off = on('dropdown:init')(cb);
      Promise.resolve(listening)
        .then(() => call('dropdown:ready'))
        .then((payload) => {
          if (payload) cb(payload);
        })
        .catch(() => {});
      return off;
    },
    onDropdownEvent: on('dropdown:event'),
  };
})();
