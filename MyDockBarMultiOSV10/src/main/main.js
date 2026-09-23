'use strict';

const path = require('path');
const { app, BrowserWindow } = require('electron');

const { Config } = require('./config');
const { DockWindow } = require('./dock-window');
const ipc = require('./ipc');
const tray = require('./tray');
const themes = require('./themes');
const autostart = require('./autostart');
const appScanner = require('./app-scanner');
const seed = require('./seed');
const { PointerWatch } = require('./pointer-watch');
const { RunningWatch } = require('./running');

// Transparent, click-through-free windows need the compositor on Linux, and
// several distros still ship it off by default under X11.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
  app.commandLine.appendSwitch('disable-gpu-compositing');
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  start();
}

function start() {
  const config = new Config();
  let dockWindow = null;

  app.on('second-instance', () => {
    // A second launch means "show me the dock", not "start another copy".
    if (dockWindow && dockWindow.alive()) {
      dockWindow.reveal();
      if (!dockWindow.win.isVisible()) dockWindow.win.showInactive();
    }
  });

  app.whenReady().then(async () => {
    config.load();
    themes.ensureUserDir();

    if (config.get().firstRun) {
      const found = appScanner.scan({ force: true });
      config.patch({ items: seed.build(found), firstRun: false });
    } else {
      seed.ensureDefaults(config);
    }

    // Keep the stored preference and the OS in sync on every launch.
    if (config.get().startWithOS !== autostart.isEnabled()) {
      autostart.set(config.get().startWithOS);
    }

    dockWindow = new DockWindow(config);
    dockWindow.create();

    const pointerWatch = new PointerWatch(dockWindow);
    pointerWatch.start();

    const runningWatch = new RunningWatch(async (payload) => {
      dockWindow.send('dock:running', payload.names);
      dockWindow.send('dock:running-apps', await api.decorateRunningApps(payload.apps));
    });

    const syncRunningWatch = () => {
      const dock = config.get().dock;
      if (dock.showRunningIndicator || dock.showRunningApps) {
        runningWatch.start({ apps: dock.showRunningApps });
      } else {
        runningWatch.stop();
      }
    };

    const api = ipc.register({
      config,
      dockWindow,
      pointerWatch,
      syncRunningWatch,
      // Lets a dock click skip the window lookup for programs that are not
      // running, which is what made launching feel sluggish.
      // null means 'not being tracked', which falls back to asking the OS.
      runningNames: () => (runningWatch.timer ? runningWatch.names : null),
      reloadAll: () => {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.reload();
        }
        dockWindow.applyConfig();
      },
    });

    syncRunningWatch();
    tray.create(api.trayDeps());

    app.on('activate', () => {
      if (dockWindow && dockWindow.alive()) dockWindow.win.showInactive();
      else {
        dockWindow = new DockWindow(config);
        dockWindow.create();
      }
    });
  });

  // The dock lives in the tray; closing the settings window must not end the
  // process. Registering a listener at all suppresses the default quit.
  app.on('window-all-closed', () => {
    if (app.isQuitting) app.quit();
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
    config.saveNow();
  });

  app.on('will-quit', () => tray.destroy());
}

// macOS: the dock is chrome, so keep it out of the system Dock and app switcher.
if (process.platform === 'darwin') {
  app.whenReady().then(() => {
    if (app.dock) app.dock.hide();
  });
}

app.setAppUserModelId('com.suhokwon.mydockbar');
app.setPath('crashDumps', path.join(app.getPath('temp'), 'mydockbar-crashes'));
