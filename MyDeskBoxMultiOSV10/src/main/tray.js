'use strict';

const { Menu, Tray, app, shell } = require('electron');
const ask = require('./ask');
const icons = require('./icons');
const themes = require('./themes');
const i18n = require('../shared/i18n');

function install(host) {
  const tray = new Tray(icons.tray());

  const say = (key, vars) => i18n.t(host.state.settings.lang, key, vars);

  // 국기와 이름을 함께 보여 준다. 언어 이름은 그 언어로 적는다.
  const languageMenu = () => i18n.LANGS.map((lang) => ({
    label: lang.label,
    icon: icons.flag(lang.id),
    type: 'radio',
    checked: host.state.settings.lang === lang.id,
    click: () => host.setLang(lang.id),
  }));

  const settingsMenu = () => {
    const { settings } = host.state;
    return [
      {
        label: say('tray.language'),
        icon: icons.flag(settings.lang),
        submenu: languageMenu(),
      },
      { type: 'separator' },
      {
        label: say('tray.startup'),
        icon: icons.menu('startup'),
        type: 'checkbox',
        checked: !!settings.openAtLogin,
        click: (item) => host.setLogin(item.checked),
      },
      { type: 'separator' },
      {
        label: say('tray.newTheme'),
        icon: icons.themeChip(settings.theme),
        submenu: themes.THEMES.map((theme) => ({
          label: themes.themeLabel(theme, settings.lang),
          icon: icons.themeChip(theme.id),
          type: 'radio',
          checked: settings.theme === theme.id,
          click: () => host.setDefaultTheme(theme.id),
        })),
      },
      {
        label: say('tray.newCorner'),
        icon: icons.corner(settings.corner),
        submenu: themes.CORNERS.map((corner) => ({
          label: corner.label[settings.lang] || corner.label.ko,
          icon: icons.corner(corner.radius),
          type: 'radio',
          checked: themes.cornerRadius(settings.corner) === corner.radius,
          click: () => host.setDefaultCorner(corner.radius),
        })),
      },
      {
        label: say('tray.newOpacity'),
        icon: icons.opacityLevel(settings.opacity),
        submenu: themes.OPACITIES.map((value) => ({
          label: `${Math.round(value * 100)}%`,
          icon: icons.opacityLevel(value),
          type: 'radio',
          checked: Math.abs(settings.opacity - value) < 0.05,
          click: () => host.setDefaultOpacity(value),
        })),
      },
      { type: 'separator' },
      {
        label: say('tray.folder'),
        icon: icons.menu('folder'),
        click: () => shell.openPath(app.getPath('userData')),
      },
    ];
  };

  // 프로그램 정보. 이름과 판, 만든 이를 보여 준다.
  const showAbout = () => {
    const made = app.getName();
    const lines = [
      `${say('about.version')} ${app.getVersion()}`,
      `${say('about.made')} Suho Kwon`,
    ];
    ask.notice({
      title: made,
      detail: lines.join('\n'),
      confirm: say('settings.ok'),
      icon: icons.app(),
    });
  };

  const refresh = () => {
    const { state } = host;
    tray.setToolTip(say('tray.tip'));
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: say('tray.draw'), icon: icons.menu('draw'), click: () => host.beginDraw() },
      {
        label: say(state.hidden ? 'tray.show' : 'tray.hide'),
        icon: icons.menu(state.hidden ? 'show' : 'hide'),
        click: () => host.toggleHidden(),
      },
      { type: 'separator' },
      // 자주 바꾸는 값이라 설정 안과 밖 모두에 둔다.
      {
        label: say('tray.language'),
        icon: icons.flag(state.settings.lang),
        submenu: languageMenu(),
      },
      { label: say('tray.settings'), icon: icons.menu('settings'), submenu: settingsMenu() },
      { type: 'separator' },
      { label: say('tray.about'), icon: icons.menu('info'), click: showAbout },
      { label: say('tray.quit'), icon: icons.menu('quit'), click: () => app.quit() },
    ]));
  };

  tray.on('click', () => host.beginDraw());
  // 바탕화면을 두 번 눌러 숨기거나 언어를 바꾼 경우에도 메뉴가 맞도록 한다.
  if (typeof host.onChange === 'function') host.onChange(refresh);
  refresh();
  return tray;
}

module.exports = { install };
