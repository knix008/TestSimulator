'use strict';

const path = require('path');
const { Tray, Menu, nativeImage, app } = require('electron');

const menuIcons = require('./menu-icons');
const i18n = require('../shared/i18n');

let tray = null;

function iconPath() {
  const dir = path.join(__dirname, '..', '..', 'build');
  // macOS wants a template image so the icon adapts to light/dark menu bars.
  if (process.platform === 'darwin') return path.join(dir, 'trayTemplate.png');
  return path.join(dir, 'tray.png');
}

function create({ dockWindow, settingsWindow, themes, config, onThemeChange, onReload }) {
  let image = nativeImage.createFromPath(iconPath());
  if (image.isEmpty()) {
    image = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'build', 'icon.png'));
  }
  if (!image.isEmpty() && process.platform !== 'linux') {
    image = image.resize({ width: 16, height: 16 });
  }
  if (process.platform === 'darwin') image.setTemplateImage(true);

  tray = new Tray(image);
  tray.setToolTip('MyDockBar');
  rebuild({ dockWindow, settingsWindow, themes, config, onThemeChange, onReload });

  tray.on('double-click', () => dockWindow.toggleVisible());
  return tray;
}

function rebuild({ dockWindow, settingsWindow, themes, config, onThemeChange, onReload, onLocaleChange }) {
  if (!tray || tray.isDestroyed()) return;

  const current = config.get();
  const locale = i18n.resolve(current.locale, app.getLocale());
  const t = (key, vars) => i18n.translate(locale, key, vars);

  // Every entry carries an icon, so the "which one is active" mark has to live
  // in the icon itself rather than in a radio/checkbox tick.
  const themeItems = themes.list().map((theme) => ({
    label: theme.name,
    icon: menuIcons.get(theme.id === current.theme ? 'theme-active' : 'theme'),
    click: () => onThemeChange(theme.id),
  }));

  const positions = ['bottom', 'top', 'left', 'right'].map((pos) => ({
    label: t(`pos.${pos}`),
    icon: menuIcons.get(current.dock.position === pos ? `pos-${pos}-active` : `pos-${pos}`),
    click: () => {
      config.patch({ dock: { position: pos } });
      onReload();
    },
  }));

  // One item that switches to the other language rather than a submenu of
  // three: with only two languages, a submenu is a second click for an answer
  // there is only one of. Both the name and the flag are the language being
  // offered, not the one in force, so the item reads as the button it is.
  const otherLocale = locale === 'ko' ? 'en' : 'ko';
  const languageToggle = {
    label: t(`lang.${otherLocale}`),
    icon: menuIcons.get(otherLocale === 'ko' ? 'flag-ko' : 'flag-en'),
    click: () => onLocaleChange(otherLocale),
  };

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t('menu.app'), icon: menuIcons.get('dock'), enabled: false },
    { type: 'separator' },
    { label: t('menu.showHide'), icon: menuIcons.get('show'), click: () => dockWindow.toggleVisible() },
    {
      label: t('menu.theme'),
      icon: menuIcons.get('theme'),
      submenu: themeItems.length
        ? themeItems
        : [{ label: t('menu.noThemes'), icon: menuIcons.get('theme'), enabled: false }],
    },
    { label: t('menu.position'), icon: menuIcons.get(`pos-${current.dock.position}`), submenu: positions },
    languageToggle,
    {
      label: current.dock.lockItems ? t('menu.unlock') : t('menu.lock'),
      icon: menuIcons.get(current.dock.lockItems ? 'locked' : 'unlocked'),
      click: () => {
        config.patch({ dock: { lockItems: !current.dock.lockItems } });
        onReload();
      },
    },
    {
      label: current.dock.autoHide ? t('menu.autoHideOn') : t('menu.autoHideOff'),
      icon: menuIcons.get(current.dock.autoHide ? 'toggle-on' : 'toggle-off'),
      click: () => {
        config.patch({ dock: { autoHide: !current.dock.autoHide } });
        onReload();
      },
    },
    { type: 'separator' },
    { label: t('menu.settings'), icon: menuIcons.get('settings'), click: () => settingsWindow.open() },
    { label: t('menu.reload'), icon: menuIcons.get('reload'), click: onReload },
    { type: 'separator' },
    { label: t('menu.quit'), icon: menuIcons.get('quit'), click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

function destroy() {
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
}

module.exports = { create, rebuild, destroy, get: () => tray };
