/*
 * The only way the pages reach the rest of the application: window.dockApi
 * (and window.errorApi for the error window).
 *
 * It has the same shape the Electron preload exposed, so the page code is
 * unchanged. Every call below is a #[tauri::command] in src-tauri/src/lib.rs,
 * and every on…() hears a notification src-tauri/src/bridge.rs posts to this
 * window. Notifications sent before the page was listening are kept there and
 * handed over here the moment it starts (bridge_listen), so a page that loads
 * late misses nothing.
 */
(function () {
  'use strict';

  const internals = window.__TAURI_INTERNALS__;
  if (!internals || typeof internals.invoke !== 'function') return;

  const invoke = (command, args) => internals.invoke(command, args || {});
  /** Fire and forget: nothing waits for these, and a failure is not news. */
  const send = (command, args) => { invoke(command, args).catch(() => {}); };

  const current = () => window.__TAURI__.webviewWindow.getCurrentWebviewWindow();

  /** Subscribe to one notification; hands back an unsubscribe function. */
  function on(event, handler) {
    let stop = null;
    let cancelled = false;
    current()
      .listen(event, (message) => handler(message.payload))
      .then((unlisten) => {
        stop = unlisten;
        if (cancelled) { unlisten(); return null; }
        return invoke('bridge_listen', { event });
      })
      .then((queued) => {
        for (const payload of queued || []) handler(payload);
      })
      .catch(() => {});
    return () => { cancelled = true; if (stop) stop(); };
  }

  const ua = navigator.userAgent || '';
  const platform = /Windows/i.test(ua) ? 'win32' : /Mac/i.test(ua) ? 'darwin' : 'linux';

  /* ------------------------- dropped files -------------------------- */

  // Windows: the page keeps its own HTML5 drag and drop (Tauri's file drop
  // would replace it), and WebView2 turns the dropped File objects into
  // paths - see src-tauri/src/dropped_files.rs.
  const pending = new Map();
  let nextToken = 1;
  if (platform === 'win32') {
    on('dock:file-paths', (reply) => {
      const resolve = reply && pending.get(String(reply.token));
      if (!resolve) return;
      pending.delete(String(reply.token));
      resolve(Array.isArray(reply.paths) ? reply.paths : []);
    });
  }

  function pathsForFiles(files) {
    const list = Array.from(files || []);
    const webview = window.chrome && window.chrome.webview;
    if (!list.length || !webview || typeof webview.postMessageWithAdditionalObjects !== 'function') {
      return Promise.resolve([]);
    }
    const token = String(nextToken++);
    return new Promise((resolve) => {
      pending.set(token, resolve);
      webview.postMessageWithAdditionalObjects(`mydockbar-files:${token}`, list);
      setTimeout(() => {
        if (!pending.has(token)) return;
        pending.delete(token);
        resolve([]);
      }, 3000);
    });
  }

  /**
   * macOS and Linux: files dropped from the file manager arrive as the
   * window's own drag events, already carrying their paths. On macOS these
   * also stand in for the page's dragover/drop during a drag inside the page,
   * which the webview does not deliver there. Positions are page pixels.
   */
  function onNativeDrag(handler) {
    if (platform === 'win32') return () => {};
    const win = current();
    const pending = [];
    const forward = (type) => (message) => {
      const payload = message.payload || {};
      const position = payload.position || { x: 0, y: 0 };
      handler({ type, paths: payload.paths || [], position: { x: position.x, y: position.y } });
    };
    pending.push(win.listen('tauri://drag-enter', forward('enter')));
    pending.push(win.listen('tauri://drag-over', forward('over')));
    pending.push(win.listen('tauri://drag-drop', forward('drop')));
    pending.push(win.listen('tauri://drag-leave', forward('leave')));
    return () => { for (const p of pending) p.then((stop) => stop()).catch(() => {}); };
  }

  /* ------------------------------ API ------------------------------- */

  window.dockApi = {
    platform,

    config: {
      get: () => invoke('config_get'),
      patch: (partial) => invoke('config_patch', { partial: partial || {} }),
      reset: () => invoke('config_reset'),
      export: () => invoke('config_export'),
      import: () => invoke('config_import'),
      onChange: (handler) => on('config:changed', handler),
    },

    items: {
      get: () => invoke('items_get'),
      set: (items) => invoke('items_set', { items: items || [] }),
      add: (item) => invoke('items_add', { item: item || {} }),
      addPaths: (paths) => invoke('items_add_paths', { paths: paths || [] }),
      insertPaths: (paths, index) => invoke('items_insert_paths', { paths: paths || [], index: Number(index) || 0 }),
      update: (id, patch) => invoke('items_update', { id: String(id), patch: patch || {} }),
      remove: (id) => invoke('items_remove', { id: String(id) }),
      move: (from, to) => invoke('items_move', { from: Number(from), to: Number(to) }),
      launch: (id) => invoke('items_launch', { id: String(id) }),
    },

    dock: {
      reportSize: (width, height) => send('dock_content_size', { width: Number(width) || 0, height: Number(height) || 0 }),
      mouseEnter: () => send('dock_mouse_enter'),
      mouseLeave: () => send('dock_mouse_leave'),
      contextMenu: (itemId, insertIndex) => invoke('dock_context_menu', {
        itemId: itemId == null ? null : String(itemId),
        insertIndex: Number.isFinite(insertIndex) ? insertIndex : null,
      }),
      onHiddenChanged: (handler) => on('dock:hidden-changed', handler),
      onRunning: (handler) => on('dock:running', handler),
      onPointer: (handler) => on('dock:pointer', handler),
      onRunningApps: (handler) => on('dock:running-apps', handler),
      launchPath: (target) => invoke('items_launch_path', { target: String(target || '') }),
      prefetchWindows: (target) => send('dock_prefetch_windows', { target: String(target || '') }),
      // The region that should capture clicks; the rest of the window stays
      // click-through so the desktop underneath keeps working.
      setInteractiveRect: (rect) => send('dock_interactive_rect', { rect: rect || null }),
      reload: () => invoke('app_reload_dock'),
      onNativeDrag,
    },

    themes: {
      list: () => invoke('themes_list'),
      variables: (id) => invoke('themes_variables', { id: String(id || '') }),
      openFolder: () => invoke('themes_open_folder'),
    },

    apps: {
      scan: (opts) => invoke('apps_scan', { opts: opts || null }),
    },

    dialog: {
      addApp: () => invoke('dialog_add_app'),
      addFolder: () => invoke('dialog_add_folder'),
      pickIcon: () => invoke('dialog_pick_icon'),
      pickTarget: () => invoke('dialog_pick_target'),
    },

    system: {
      displays: () => invoke('system_displays'),
      autostart: () => invoke('system_autostart'),
      clearIconCache: () => invoke('system_clear_icon_cache'),
    },

    settings: {
      open: () => invoke('settings_open'),
      close: () => invoke('settings_close'),
      ok: () => invoke('settings_close'),
      onFocusItem: (handler) => on('settings:focus-item', handler),
    },

    trash: {
      state: () => invoke('trash_state'),
      empty: () => invoke('trash_empty'),
      onChange: (handler) => on('dock:trash', handler),
      // Only a real emptying, not every time the bin happens to become empty.
      onEmptied: (handler) => on('dock:trash-emptied', handler),
    },

    icons: {
      fromProgram: (target) => invoke('icons_from_program', { target: String(target || '') }),
      pickProgram: () => invoke('icons_pick_program'),
      useFile: (source) => invoke('icons_use_file', { source: String(source || '') }),
      /** A menu glyph, served by the app (src-tauri/src/protocol.rs). */
      glyphUrl: (name) => `${platform === 'win32' ? 'http://dock.localhost' : 'dock://localhost'}/menu/${name}.png`,
    },

    app: {
      quit: () => invoke('app_quit'),
      reportError: (error) => send('app_report_error', {
        text: error && error.stack ? String(error.stack) : String(error || ''),
      }),
    },

    /** Paths of dropped File objects (Windows); resolves to [] elsewhere. */
    pathsForFiles,
  };

  window.errorApi = {
    onShow: (handler) => on('error:show', handler),
    copy: async (text) => {
      try {
        await navigator.clipboard.writeText(String(text || ''));
        return true;
      } catch {
        // The textarea is already selected; the old command still works.
        return document.execCommand('copy');
      }
    },
  };
})();
