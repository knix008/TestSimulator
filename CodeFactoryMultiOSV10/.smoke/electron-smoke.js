// Launches the packaged renderer, waits for React to mount, reports any
// console error, then exits. Used as a build-time smoke test only.
const { app, BrowserWindow } = require('electron');
const path = require('path');

const errors = [];

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) errors.push(message);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    errors.push('render process gone: ' + JSON.stringify(details));
  });

  try {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    await new Promise((r) => setTimeout(r, 2500));

    const probe = await win.webContents.executeJavaScript(`(() => {
      const root = document.getElementById('root');
      return {
        mounted: !!(root && root.children.length > 0),
        menuButtons: [...document.querySelectorAll('.menu-button')].map((b) => b.textContent),
        viewOptions: [...document.querySelectorAll('.toolbar select option')].map((o) => o.textContent),
        languages: [...document.querySelectorAll('.sidebar .checkbox-row span')].map((s) => s.textContent),
        theme: document.documentElement.getAttribute('data-theme'),
        bg: getComputedStyle(document.body).backgroundColor,
        status: (document.querySelector('.statusbar span') || {}).textContent,
        isElectron: !!window.electronAPI,
      };
    })()`);

    console.log('SMOKE ' + JSON.stringify(probe, null, 2));
    console.log('ERRORS ' + JSON.stringify(errors, null, 2));
    process.exitCode = errors.length === 0 && probe.mounted ? 0 : 1;
  } catch (err) {
    console.log('SMOKE FAILED ' + err.message);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
