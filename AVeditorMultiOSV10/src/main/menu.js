'use strict';
const { Menu, dialog, app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { prepareMenuIcons, icon } = require('./menuIcons');

let _mainWindow = null;
let _locale = 'en';
let _messages = { en: {}, ko: {} };

function loadMessages() {
  for (const locale of ['en', 'ko']) {
    try {
      const file = path.join(__dirname, `../renderer/locales/${locale}.json`);
      _messages[locale] = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.warn(`[menu] Failed to load locale ${locale}:`, e.message);
      _messages[locale] = {};
    }
  }
}

function t(key, fallback = '') {
  const parts = key.split('.');
  let val = _messages[_locale] || {};
  for (const part of parts) {
    val = val?.[part];
    if (val === undefined) break;
  }
  if (typeof val === 'string') return val;

  val = _messages.en || {};
  for (const part of parts) {
    val = val?.[part];
    if (val === undefined) break;
  }
  return typeof val === 'string' ? val : (fallback || key);
}

function item(opts) {
  const out = { ...opts };
  if (opts.iconName) {
    const img = icon(opts.iconName);
    if (img) out.icon = img;
    delete out.iconName;
  }
  return out;
}

function createMenu(mainWindow, locale = _locale) {
  _mainWindow = mainWindow;
  if (!_messages.en || !Object.keys(_messages.en).length) loadMessages();
  if (locale === 'en' || locale === 'ko') _locale = locale;

  const send = (action) => {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send('menu-action', action);
    }
  };

  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        item({ role: 'about', label: t('menu.about'), iconName: 'about' }),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        item({ role: 'quit', label: t('menu.quit'), iconName: 'quit' }),
      ],
    }] : []),

    {
      label: t('menu.file'),
      id: 'file',
      submenu: [
        item({
          label: t('menu.newProject'),
          id: 'new-project',
          accelerator: 'CmdOrCtrl+N',
          iconName: 'new',
          click: () => send('new-project'),
        }),
        item({
          label: t('menu.openProject'),
          id: 'open-project',
          accelerator: 'CmdOrCtrl+O',
          iconName: 'open',
          click: () => send('open-project'),
        }),
        { type: 'separator' },
        item({
          label: t('menu.saveProject'),
          id: 'save-project',
          accelerator: 'CmdOrCtrl+S',
          iconName: 'save',
          click: () => send('save-project'),
        }),
        item({
          label: t('menu.saveProjectAs'),
          id: 'save-project-as',
          accelerator: 'CmdOrCtrl+Shift+S',
          iconName: 'save',
          click: () => send('save-project-as'),
        }),
        item({
          label: t('menu.saveProjectModified'),
          id: 'save-project-modified',
          accelerator: 'CmdOrCtrl+Alt+S',
          iconName: 'save',
          click: () => send('save-project-modified'),
        }),
        { type: 'separator' },
        item({
          label: t('menu.importMedia'),
          id: 'import-media',
          accelerator: 'CmdOrCtrl+I',
          iconName: 'import',
          click: () => send('import-media'),
        }),
        { type: 'separator' },
        item({
          label: t('menu.export'),
          id: 'export',
          accelerator: 'CmdOrCtrl+E',
          iconName: 'export',
          click: () => send('export'),
        }),
        { type: 'separator' },
        ...(isMac ? [] : [item({ role: 'quit', label: t('menu.quit'), iconName: 'quit' })]),
      ],
    },

    {
      label: t('menu.ai'),
      id: 'ai',
      submenu: [
        item({
          label: t('menu.analyzeScenes'),
          id: 'analyze-scenes',
          accelerator: 'CmdOrCtrl+Shift+A',
          iconName: 'sparkles',
          click: () => send('analyze-scenes'),
        }),
        item({
          label: t('menu.viewAnalysis'),
          id: 'view-analysis',
          accelerator: 'CmdOrCtrl+Shift+V',
          iconName: 'list',
          click: () => send('view-analysis'),
        }),
        item({
          label: t('menu.generateSubtitles'),
          id: 'generate-subtitles',
          accelerator: 'CmdOrCtrl+Shift+T',
          iconName: 'subtitles',
          click: () => send('generate-subtitles'),
        }),
        item({
          label: t('menu.ollamaSettings'),
          id: 'ollama-settings',
          iconName: 'settings',
          click: () => send('ollama-settings'),
        }),
      ],
    },

    {
      label: t('menu.edit'),
      id: 'edit',
      submenu: [
        item({
          label: t('menu.undo'),
          accelerator: 'CmdOrCtrl+Z',
          iconName: 'undo',
          click: () => send('undo'),
        }),
        item({
          label: t('menu.redo'),
          accelerator: process.platform === 'darwin' ? 'CmdOrCtrl+Shift+Z' : 'CmdOrCtrl+Y',
          iconName: 'redo',
          click: () => send('redo'),
        }),
        { type: 'separator' },
        item({ role: 'cut', label: t('menu.cut'), iconName: 'cut' }),
        item({ role: 'copy', label: t('menu.copy'), iconName: 'copy' }),
        item({ role: 'paste', label: t('menu.paste'), iconName: 'paste' }),
        { type: 'separator' },
        item({
          label: t('menu.splitClip'),
          accelerator: 'CmdOrCtrl+B',
          iconName: 'split',
          click: () => send('split-clip'),
        }),
        item({
          label: t('menu.deleteClip'),
          accelerator: 'Delete',
          iconName: 'trash',
          click: () => send('delete-clip'),
        }),
        item({
          label: t('menu.selectAll'),
          accelerator: 'CmdOrCtrl+A',
          iconName: 'selectAll',
          click: () => send('select-all'),
        }),
      ],
    },

    {
      label: t('menu.view'),
      id: 'view',
      submenu: [
        item({
          label: t('menu.toggleTheme'),
          accelerator: 'CmdOrCtrl+T',
          iconName: 'theme',
          click: () => send('toggle-theme'),
        }),
        { type: 'separator' },
        item({
          label: t('menu.zoomInTimeline'),
          accelerator: 'CmdOrCtrl+Plus',
          iconName: 'zoomIn',
          click: () => send('zoom-in'),
        }),
        item({
          label: t('menu.zoomOutTimeline'),
          accelerator: 'CmdOrCtrl+-',
          iconName: 'zoomOut',
          click: () => send('zoom-out'),
        }),
        { type: 'separator' },
        item({ role: 'reload', label: t('menu.reload'), iconName: 'reload' }),
        item({ role: 'forceReload', label: t('menu.forceReload'), iconName: 'reload' }),
        item({ role: 'toggleDevTools', label: t('menu.toggleDevTools'), iconName: 'devtools' }),
        { type: 'separator' },
        item({ role: 'resetZoom', label: t('menu.resetZoom'), iconName: 'selectAll' }),
        item({ role: 'zoomIn', label: t('menu.zoomIn'), iconName: 'zoomIn' }),
        item({ role: 'zoomOut', label: t('menu.zoomOut'), iconName: 'zoomOut' }),
        { type: 'separator' },
        item({ role: 'togglefullscreen', label: t('menu.toggleFullscreen'), iconName: 'fullscreen' }),
      ],
    },

    {
      label: t('menu.language'),
      id: 'language',
      submenu: [
        item({
          label: 'English',
          type: 'radio',
          checked: _locale === 'en',
          id: 'lang-en',
          iconName: 'language',
          click: () => {
            setMenuLocale('en');
            send('set-language-en');
          },
        }),
        item({
          label: '한국어',
          type: 'radio',
          checked: _locale === 'ko',
          id: 'lang-ko',
          iconName: 'language',
          click: () => {
            setMenuLocale('ko');
            send('set-language-ko');
          },
        }),
      ],
    },

    {
      label: t('menu.help'),
      id: 'help',
      submenu: [
        item({
          label: t('menu.about'),
          iconName: 'about',
          click: () => {
            dialog.showMessageBox(_mainWindow, {
              type: 'info',
              title: t('about.title'),
              message: `${t('app.title')}  v${app.getVersion()}`,
              detail: `${t('about.description')}\n\n${t('about.copyright')}\n${t('about.author')}`,
              buttons: [t('dialog.ok')],
            });
          },
        }),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setMenuLocale(locale) {
  if (locale !== 'en' && locale !== 'ko') return;
  _locale = locale;
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    createMenu(_mainWindow, locale);
  }
}

function registerMenuIpc() {
  loadMessages();
  ipcMain.handle('set-menu-locale', (_event, locale) => {
    setMenuLocale(locale === 'ko' ? 'ko' : 'en');
    return { ok: true, locale: _locale };
  });
  ipcMain.handle('get-menu-locale', () => _locale);
}

module.exports = { createMenu, setMenuLocale, registerMenuIpc, prepareMenuIcons };
