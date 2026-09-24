'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ipcMain, dialog, Menu, shell, app, screen, BrowserWindow } = require('electron');

const themes = require('./themes');
const icons = require('./icons');
const launcher = require('./launcher');
const appScanner = require('./app-scanner');
const autostart = require('./autostart');
const settingsWindow = require('./settings-window');
const tray = require('./tray');
const menuIcons = require('./menu-icons');
const peIcons = require('./pe-icons');
const i18n = require('../shared/i18n');
const trash = require('./trash');
const appWindows = require('./app-windows');

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

/** Everything the renderer needs to draw itself in one payload. */
/** The locale actually in force, resolving 'auto' against the OS. */
function activeLocale(config) {
  return i18n.resolve(config.get().locale, app.getLocale());
}

function snapshot(config) {
  const data = config.get();
  const theme = themes.get(data.theme);
  return {
    locale: data.locale,
    resolvedLocale: activeLocale(config),
    dock: data.dock,
    themeId: data.theme,
    theme: theme
      ? { id: theme.id, name: theme.name, variables: theme.variables, ui: theme.ui, css: theme.css, dark: theme.dark }
      : null,
    items: data.items,
    startWithOS: data.startWithOS,
    platform: process.platform,
    version: app.getVersion(),
  };
}

async function withIcons(items) {
  return Promise.all(items.map(async (item) => ({
    ...item,
    protected: item.type === 'special',
    iconUrl: item.type === 'separator' ? null : await icons.resolve(item),
  })));
}

/** Build a dock item from a filesystem path the user dropped or picked. */
function itemFromPath(target, label) {
  const isDir = (() => {
    try { return fs.statSync(target).isDirectory(); } catch { return false; }
  })();

  if (process.platform === 'darwin' && target.endsWith('.app')) {
    return { id: newId(), type: 'app', label: label || path.basename(target, '.app'), path: target, args: '', icon: '' };
  }
  if (process.platform === 'linux' && target.endsWith('.desktop')) {
    const entry = appScanner.parseDesktopEntry(target);
    if (entry) {
      return { id: newId(), type: 'app', label: label || entry.label, path: entry.path, args: entry.args, icon: entry.icon };
    }
  }
  if (process.platform === 'win32' && target.toLowerCase().endsWith('.lnk')) {
    try {
      const info = shell.readShortcutLink(target);
      if (info.target) {
        return {
          id: newId(),
          type: 'app',
          label: label || path.basename(target, '.lnk'),
          path: info.target,
          args: info.args || '',
          icon: info.icon && fs.existsSync(info.icon) ? info.icon : '',
        };
      }
    } catch { /* fall through to the generic case */ }
  }

  // An installed application already has a name and an icon the system knows
  // it by; a bare filename like "notepad++.exe" is a poor substitute.
  const known = isDir ? null : appScanner.scan().find(
    (entry) => entry.path.toLowerCase() === target.toLowerCase(),
  );

  return {
    id: newId(),
    type: isDir ? 'folder' : 'app',
    label: label || (known && known.label) || prettyName(target),
    path: target,
    args: '',
    icon: (known && known.icon) || '',
  };
}

/**
 * Whether a newly created entry should be given its target's own icon.
 *
 * An icon that is already set stays: either the user chose it, or the
 * shortcut named one, and neither should be quietly overwritten. The dock's
 * own entries draw themselves, and a web link has no file to read an icon
 * out of.
 */
function canAdoptIcon(item) {
  if (!item || item.icon || item.type === 'separator' || item.type === 'url') return false;
  const target = item.path;
  if (!target || typeof target !== 'string') return false;
  return !target.startsWith('dock:') && !target.startsWith('system:');
}

/** "notepad++.exe" -> "Notepad++", as a last resort. */
function prettyName(target) {
  const base = path.basename(target, path.extname(target)) || target;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * The dock's HWND as a signed decimal string.
 *
 * The emptying progress dialog is owned by this window, so it stacks above a
 * dock that is always on top. A missing window means the desktop owns it.
 */
function dockHwnd(dockWindow) {
  if (!dockWindow || !dockWindow.alive()) return null;
  const buf = dockWindow.win.getNativeWindowHandle();
  if (!buf || buf.length < 4) return null;
  const bits = buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0));
  return BigInt.asIntN(64, bits).toString();
}

function register({
  config, dockWindow, pointerWatch, syncRunningWatch, syncTrashWatch, runningNames, reloadAll,
}) {
  const t = (key, vars) => i18n.translate(activeLocale(config), key, vars);

  /**
   * The lock is enforced here rather than only in the UI: the renderer's
   * buttons are the convenience, this is the guarantee.
   */
  const locked = () => !!config.get().dock.lockItems;

  /**
   * The dock's own entries (settings, trash, show desktop, home) cannot be
   * deleted - removing the settings button would leave no way back in.
   */
  const isProtected = (item) => !!item && item.type === 'special';

  const memoryKey = (item) => String((item && item.path) || '').toLowerCase();

  /** Remember the icon chosen for a target before its entry goes away. */
  function rememberIcon(item) {
    const key = memoryKey(item);
    if (!key || !item.icon) return;
    config.patch({ iconMemory: { [key]: item.icon } });
  }

  /**
   * Give a new entry an icon of its own.
   *
   * Everything added - dropped on the dock, picked from a dialog, chosen in
   * the settings window - arrives with its program's own icon already set,
   * rather than blank. The entry then shows the user a picture they can see
   * and swap out, and the icon picker's "automatic" option puts it back.
   */
  async function withDefaultIcon(item) {
    if (!canAdoptIcon(item)) return item;
    const adopted = await icons.adoptDefault(item.path);
    return adopted ? { ...item, icon: adopted } : item;
  }

  /** Reapply a previously chosen icon when the same target comes back. */
  function recallIcon(item) {
    if (!item || item.icon) return item;
    const remembered = config.get().iconMemory[memoryKey(item)];
    return remembered ? { ...item, icon: remembered } : item;
  }

  const broadcast = (channel, payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  };

  /**
   * Show a popup menu. The pointer watch has to know: a menu that is up takes
   * every mouse event away from the dock, so the dock has to be told where the
   * cursor goes by someone else until the menu is dismissed.
   */
  function popup(template, event) {
    const menu = Menu.buildFromTemplate(template);
    if (pointerWatch) pointerWatch.setMenuOpen(true);
    menu.popup({
      window: BrowserWindow.fromWebContents(event.sender),
      callback: () => { if (pointerWatch) pointerWatch.setMenuOpen(false); },
    });
  }

  const pushConfig = () => {
    // Adding or removing the Trash entry is what decides whether the bin is
    // worth watching at all.
    if (syncTrashWatch) syncTrashWatch();
    broadcast('config:changed', snapshot(config));
  };

  /* ------------------------------ config ------------------------------ */

  ipcMain.handle('config:get', () => snapshot(config));

  ipcMain.handle('config:patch', (_e, partial) => {
    config.patch(partial);
    if (partial && Object.prototype.hasOwnProperty.call(partial, 'startWithOS')) {
      autostart.set(!!partial.startWithOS);
    }
    if (syncRunningWatch) syncRunningWatch();
    dockWindow.applyConfig();
    tray.rebuild(trayDeps());
    pushConfig();
    return snapshot(config);
  });

  ipcMain.handle('settings:ok', () => { settingsWindow.close(); return true; });

  ipcMain.handle('config:reset', () => {
    config.reset();
    dockWindow.applyConfig();
    reloadAll();
    pushConfig();
    return snapshot(config);
  });

  ipcMain.handle('config:export', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export MyDockBar settings',
      defaultPath: 'mydockbar-config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false };
    config.exportTo(filePath);
    return { ok: true, filePath };
  });

  ipcMain.handle('config:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import MyDockBar settings',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePaths.length) return { ok: false };
    try {
      config.importFrom(filePaths[0]);
      dockWindow.applyConfig();
      reloadAll();
      pushConfig();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /* ------------------------------- items ------------------------------ */

  ipcMain.handle('items:get', () => withIcons(config.get().items));

  ipcMain.handle('items:set', async (_e, items) => {
    config.setItems(items);
    pushConfig();
    return withIcons(items);
  });

  ipcMain.handle('items:add-paths', async (_e, paths) => {
    if (locked()) return withIcons(config.get().items);
    const items = config.get().items.slice();
    for (const target of paths) {
      if (!target) continue;
      items.push(await withDefaultIcon(recallIcon(itemFromPath(target))));
    }
    config.setItems(items);
    pushConfig();
    return withIcons(items);
  });

  ipcMain.handle('items:insert-paths', async (_e, { paths, index }) => {
    if (locked()) return withIcons(config.get().items);
    const items = config.get().items.slice();
    const at = Math.max(0, Math.min(items.length, Number(index) || 0));
    const added = await Promise.all((paths || []).filter(Boolean)
      .map((target) => withDefaultIcon(recallIcon(itemFromPath(target)))));
    items.splice(at, 0, ...added);
    config.setItems(items);
    pushConfig();
    return withIcons(items);
  });

  ipcMain.handle('items:add', async (_e, item) => {
    if (locked()) return withIcons(config.get().items);
    const items = config.get().items.slice();
    items.push(await withDefaultIcon(recallIcon({
      id: newId(), type: 'app', label: 'New item', path: '', args: '', icon: '', ...item,
    })));
    config.setItems(items);
    pushConfig();
    return withIcons(items);
  });

  ipcMain.handle('items:update', async (_e, { id, patch }) => {
    const before = config.get().items.find((it) => it.id === id);
    let next = patch;
    // Pointing an entry at a different program: if its icon was only the old
    // program's, it should become the new one's rather than linger.
    if (before && patch && patch.path && patch.path !== before.path && !('icon' in patch)) {
      next = { ...patch, icon: '' };
      const withIcon = await withDefaultIcon({ ...before, ...next });
      next = { ...next, icon: withIcon.icon || '' };
    }
    const items = config.get().items.map((it) => (it.id === id ? { ...it, ...next } : it));
    if (next && 'icon' in next) rememberIcon(items.find((it) => it.id === id));
    config.setItems(items);
    pushConfig();
    return withIcons(items);
  });

  ipcMain.handle('items:remove', async (_e, id) => {
    const current = config.get().items;
    const victim = current.find((it) => it.id === id);
    if (locked() || isProtected(victim)) return withIcons(current);
    rememberIcon(victim);
    const items = current.filter((it) => it.id !== id);
    config.setItems(items);
    pushConfig();
    return withIcons(items);
  });

  ipcMain.handle('items:move', async (_e, { from, to }) => {
    if (locked()) return withIcons(config.get().items);
    const items = config.get().items.slice();
    if (from < 0 || from >= items.length) return withIcons(items);
    const [moved] = items.splice(from, 1);
    items.splice(Math.max(0, Math.min(items.length, to)), 0, moved);
    config.setItems(items);
    pushConfig();
    return withIcons(items);
  });

  /**
   * Raise what is already open rather than starting a second copy.
   *
   * Returns true when the click was handled by activating a window; false
   * means there was nothing running and the caller should launch normally.
   */
  async function raiseExisting(event, item) {
    if (!config.get().dock.focusRunningWindow) return false;
    if (!item.path || item.type === 'url' || item.type === 'folder') return false;
    if (item.path.startsWith('dock:') || item.path.startsWith('system:')) return false;

    // Only worth asking the OS about a program that is actually running. The
    // process list is already polled for the running indicator, so this is a
    // set lookup rather than a second, much slower, window enumeration. A null
    // set means nothing is being tracked, so fall through and ask properly.
    const known = runningNames && runningNames();
    const key = item.path.split(/[\\/]/).pop().toLowerCase();
    if (known && key && !known.has(key)) return false;

    let windows = [];
    try {
      windows = await appWindows.list(item.path);
    } catch (err) {
      console.warn('[ipc] window lookup failed:', err.message);
      return false;
    }

    if (!windows.length) return false;
    if (windows.length === 1) {
      // Awaited on purpose. If the window cannot be raised - it closed since
      // the list was cached, or the OS refused - saying so lets the caller
      // fall back to launching, instead of the click doing nothing at all.
      return appWindows.focus(windows[0].id);
    }

    // Several windows: let the user pick, showing each window's title beside
    // the application's own icon.
    const icon = menuIcons.forItem(item, await icons.resolve(item));
    const template = [
      { label: item.label || t('menu.unnamed'), icon, enabled: false },
      { type: 'separator' },
      ...windows.map((win) => ({
        label: win.title,
        icon,
        click: () => appWindows.focus(win.id),
      })),
      { type: 'separator' },
      { label: t('menu.newWindow'), icon: menuIcons.get('open'), click: () => launcher.launch(item) },
    ];

    popup(template, event);
    return true;
  }

  ipcMain.handle('items:launch', async (event, id) => {
    const item = config.get().items.find((it) => it.id === id);
    if (!item) return { ok: false, error: 'Item not found' };
    // The one action that needs a window reference, so it is handled here
    // rather than in the launcher.
    if (item.path === 'dock:settings') {
      settingsWindow.open();
      return { ok: true };
    }
    if (await raiseExisting(event, item)) return { ok: true };
    return launcher.launch(item);
  });

  /* ------------------------------ dock UI ----------------------------- */

  ipcMain.on('dock:content-size', (_e, { width, height }) => {
    dockWindow.setContentSize(width, height);
  });

  ipcMain.on('dock:mouse-enter', () => dockWindow.reveal());
  ipcMain.on('dock:mouse-leave', () => dockWindow.scheduleHide());

  // Warmed while the pointer is on an icon, so clicking it does not have to
  // wait for a window enumeration.
  ipcMain.on('dock:prefetch-windows', (_e, target) => {
    if (!config.get().dock.focusRunningWindow || !target) return;
    if (target.startsWith('dock:') || target.startsWith('system:')) return;
    const known = runningNames && runningNames();
    const key = String(target).split(/[\\/]/).pop().toLowerCase();
    if (known && key && !known.has(key)) return;
    appWindows.prefetch(target);
  });

  ipcMain.on('dock:interactive-rect', (_e, rect) => {
    if (pointerWatch) pointerWatch.setRect(rect);
  });

  ipcMain.handle('dock:context-menu', async (event, { itemId, insertIndex }) => {
    const data = config.get();
    const item = data.items.find((it) => it.id === itemId);
    const template = [];

    // Where the pointer was when the menu opened; anything added goes here.
    const at = Number.isFinite(insertIndex)
      ? Math.max(0, Math.min(data.items.length, insertIndex))
      : data.items.length;

    if (item) {
      // The header row shows the entry's real icon, so the menu names the thing
      // it is about both in words and in the picture the user just clicked.
      const resolved = item.type === 'separator' ? null : await icons.resolve(item);
      template.push(
        {
          label: item.type === 'separator' ? t('menu.separator') : (item.label || t('menu.unnamed')),
          icon: menuIcons.forItem(item, resolved),
          enabled: false,
        },
        { type: 'separator' },
      );

      if (item.type !== 'separator') {
        template.push({ label: t('menu.open'), icon: menuIcons.get('open'), click: () => launcher.launch(item) });
      }
      if (item.path === 'system:trash') {
        const full = await trash.state();
        template.push({
          label: t('menu.emptyTrash'),
          icon: menuIcons.get('trash-empty'),
          enabled: !full.empty,
          click: async () => {
            const result = await trash.empty(dockHwnd(dockWindow));
            if (!result.ok && result.error) console.error('[trash]', result.error);
            broadcast('dock:trash', await trash.state());
          },
        });
      }
      if (item.path && !item.path.startsWith('dock:') && !item.path.startsWith('system:') && item.type !== 'url') {
        template.push({
          label: t('menu.reveal'),
          icon: menuIcons.get('reveal'),
          click: () => launcher.revealInFileManager(item.path),
        });
      }
      template.push(
        { type: 'separator' },
        {
          label: t('menu.itemSettings'),
          icon: menuIcons.get('edit'),
          click: () => settingsWindow.focusItem(item.id),
        },
        {
          label: t('menu.removeItem'),
          icon: menuIcons.get('remove'),
          enabled: !data.dock.lockItems && !isProtected(item),
          click: () => {
            if (locked() || isProtected(item)) return;
            rememberIcon(item);
            config.setItems(data.items.filter((it) => it.id !== item.id));
            pushConfig();
          },
        },
        { type: 'separator' },
      );
    }

    const canEdit = !data.dock.lockItems;
    template.push(
      { label: t('menu.addApp'), icon: menuIcons.get('add-app'), enabled: canEdit, click: () => pickAndAdd(at) },
      { label: t('menu.addFolder'), icon: menuIcons.get('add-folder'), enabled: canEdit, click: () => pickFolderAndAdd(at) },
      {
        label: t('menu.addSeparator'),
        icon: menuIcons.get('separator'),
        enabled: canEdit,
        click: () => {
          if (locked()) return;
          const items = config.get().items.slice();
          items.splice(at, 0,
            { id: newId(), type: 'separator', label: '', path: '', args: '', icon: '' });
          config.setItems(items);
          pushConfig();
        },
      },
      { type: 'separator' },
      {
        label: data.dock.autoHide ? t('menu.autoHideOn') : t('menu.autoHideOff'),
        icon: menuIcons.get(data.dock.autoHide ? 'toggle-on' : 'toggle-off'),
        click: () => {
          config.patch({ dock: { autoHide: !data.dock.autoHide } });
          dockWindow.applyConfig();
          tray.rebuild(trayDeps());
          pushConfig();
        },
      },
      {
        label: data.dock.lockItems ? t('menu.unlock') : t('menu.lock'),
        icon: menuIcons.get(data.dock.lockItems ? 'locked' : 'unlocked'),
        click: () => {
          config.patch({ dock: { lockItems: !data.dock.lockItems } });
          tray.rebuild(trayDeps());
          pushConfig();
        },
      },
      // The same one-click language switch the tray menu offers, named and
      // flagged for the language it moves to rather than the one in force.
      (() => {
        const other = activeLocale(config) === 'ko' ? 'en' : 'ko';
        return {
          label: t(`lang.${other}`),
          icon: menuIcons.get(other === 'ko' ? 'flag-ko' : 'flag-en'),
          click: () => {
            config.patch({ locale: other });
            tray.rebuild(trayDeps());
            pushConfig();
          },
        };
      })(),
      { label: t('menu.dockSettings'), icon: menuIcons.get('settings'), click: () => settingsWindow.open() },
      { label: t('menu.reload'), icon: menuIcons.get('reload'), click: () => reloadAll() },
      { type: 'separator' },
      { label: t('menu.quit'), icon: menuIcons.get('quit'), click: () => { app.isQuitting = true; app.quit(); } },
    );

    popup(template, event);
    return true;
  });

  /**
   * Turn the raw list of running applications into dock-ready entries with
   * resolved icons. They are transient: never written to the config, and
   * skipped when the same program is already pinned.
   */
  async function decorateRunningApps(apps) {
    if (!config.get().dock.showRunningApps || !apps || !apps.length) return [];
    const pinned = new Set(
      config.get().items.map((item) => (item.path || '').toLowerCase()).filter(Boolean),
    );

    const own = process.execPath.toLowerCase();
    const transient = apps.filter((entry) => {
      const target = (entry.path || '').toLowerCase();
      return target && target !== own && !pinned.has(target);
    });
    return Promise.all(transient.map(async (entry) => ({
      id: `running:${entry.path}`,
      type: 'app',
      transient: true,
      label: entry.name,
      path: entry.path,
      args: '',
      icon: '',
      iconUrl: await icons.resolve({ path: entry.path }),
    })));
  }

  ipcMain.handle('items:launch-path', async (event, target) => {
    const item = { type: 'app', path: target, label: '' };
    if (await raiseExisting(event, item)) return { ok: true };
    return launcher.launch(item);
  });

  ipcMain.handle('trash:state', async () => trash.state());
  ipcMain.handle('trash:empty', async () => trash.empty(dockHwnd(dockWindow)));

  /* ------------------------------ themes ------------------------------ */

  ipcMain.handle('themes:list', () => themes.list().map((t) => ({
    id: t.id, name: t.name, author: t.author, description: t.description, dark: t.dark, builtin: t.builtin,
  })));

  ipcMain.handle('themes:variables', (_e, id) => {
    const theme = themes.get(id);
    if (!theme) return null;
    return { variables: theme.variables, ui: theme.ui, dark: theme.dark };
  });

  ipcMain.handle('themes:open-folder', () => shell.openPath(themes.ensureUserDir()));

  /* ------------------------------- apps ------------------------------- */

  ipcMain.handle('apps:scan', async (_e, opts) => {
    const found = appScanner.scan(opts || {});
    return Promise.all(found.map(async (entry) => ({
      ...entry,
      iconUrl: await icons.resolve({ path: entry.path, icon: entry.icon }),
    })));
  });

  /* ------------------------------ dialogs ----------------------------- */

  async function pickAndAdd(at) {
    if (locked()) return null;
    const filters = process.platform === 'win32'
      ? [{ name: 'Programs', extensions: ['exe', 'lnk', 'bat', 'cmd'] }, { name: 'All Files', extensions: ['*'] }]
      : [{ name: 'All Files', extensions: ['*'] }];
    const props = process.platform === 'darwin' ? ['openFile', 'multiSelections'] : ['openFile', 'multiSelections'];
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Add application to dock',
      properties: props,
      filters,
      defaultPath: process.platform === 'darwin' ? '/Applications' : undefined,
    });
    if (canceled || !filePaths.length) return null;
    const items = config.get().items.slice();
    const index = Number.isFinite(at) ? Math.max(0, Math.min(items.length, at)) : items.length;
    items.splice(index, 0, ...filePaths.map((p) => recallIcon(itemFromPath(p))));
    config.setItems(items);
    pushConfig();
    return items;
  }

  async function pickFolderAndAdd(at) {
    if (locked()) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Add folder to dock',
      properties: ['openDirectory'],
    });
    if (canceled || !filePaths.length) return null;
    const items = config.get().items.slice();
    const index = Number.isFinite(at) ? Math.max(0, Math.min(items.length, at)) : items.length;
    items.splice(index, 0, ...filePaths.map((p) => recallIcon(itemFromPath(p))));
    config.setItems(items);
    pushConfig();
    return items;
  }

  ipcMain.handle('dialog:add-app', () => pickAndAdd());
  ipcMain.handle('dialog:add-folder', () => pickFolderAndAdd());

  ipcMain.handle('dialog:pick-icon', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose an icon',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'svg', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'icns', 'bmp'] }],
    });
    if (canceled || !filePaths.length) return null;
    return icons.importCustomIcon(filePaths[0]);
  });

  /** Every icon stored inside a program file, RocketDock style. */
  ipcMain.handle('icons:from-program', async (_e, target) => {
    const outDir = path.join(app.getPath('userData'), 'extracted-icons');
    const found = peIcons.extractAll(target, outDir);
    return found.map((entry) => ({ ...entry, url: icons.pathToUrl(entry.file) }));
  });

  ipcMain.handle('icons:pick-program', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: t('m.iconFromExe'),
      properties: ['openFile'],
      filters: process.platform === 'win32'
        ? [{ name: 'Programs and libraries', extensions: ['exe', 'dll', 'ico', 'ocx', 'cpl', 'mun'] },
          { name: 'All Files', extensions: ['*'] }]
        : [{ name: 'All Files', extensions: ['*'] }],
      defaultPath: process.platform === 'win32' ? process.env.SystemRoot : undefined,
    });
    if (canceled || !filePaths.length) return null;
    return filePaths[0];
  });

  /** Store a chosen .ico/.png as this item's icon. */
  ipcMain.handle('icons:use-file', async (_e, source) => icons.importCustomIcon(source));

  ipcMain.handle('dialog:pick-target', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose a target',
      properties: ['openFile'],
    });
    if (canceled || !filePaths.length) return null;
    return filePaths[0];
  });

  /* ------------------------------ system ------------------------------ */

  ipcMain.handle('system:displays', () => screen.getAllDisplays().map((d) => ({
    id: String(d.id),
    label: d.label || `Display ${d.id}`,
    bounds: d.bounds,
    primary: d.id === screen.getPrimaryDisplay().id,
  })));

  ipcMain.handle('system:autostart', () => autostart.isEnabled());
  ipcMain.handle('system:clear-icon-cache', () => { icons.clearCache(); reloadAll(); return true; });
  ipcMain.handle('settings:open', () => { settingsWindow.open(); return true; });
  ipcMain.handle('settings:close', () => { settingsWindow.close(); return true; });
  ipcMain.handle('app:quit', () => { app.isQuitting = true; app.quit(); });
  ipcMain.handle('app:reload-dock', () => { reloadAll(); return true; });

  function trayDeps() {
    return {
      dockWindow,
      settingsWindow,
      themes,
      config,
      onThemeChange: (id) => {
        config.patch({ theme: id });
        pushConfig();
        tray.rebuild(trayDeps());
      },
      onLocaleChange: (locale) => {
        config.patch({ locale });
        pushConfig();
        tray.rebuild(trayDeps()); // the menu itself is what just changed language
      },
      onReload: reloadAll,
    };
  }

  return { snapshot: () => snapshot(config), pushConfig, trayDeps, itemFromPath, newId, decorateRunningApps };
}

module.exports = { register, snapshot, itemFromPath, newId, canAdoptIcon };
