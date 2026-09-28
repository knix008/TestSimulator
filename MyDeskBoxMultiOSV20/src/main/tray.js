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
      {
        label: say('tray.openWith'),
        icon: icons.menu('open'),
        submenu: [
          {
            label: say('tray.openDouble'),
            icon: icons.menu('open'),
            type: 'radio',
            checked: settings.openWith !== 'single',
            click: () => host.setOpenWith('double'),
          },
          {
            label: say('tray.openSingle'),
            icon: icons.menu('open'),
            type: 'radio',
            checked: settings.openWith === 'single',
            click: () => host.setOpenWith('single'),
          },
        ],
      },
      {
        label: say('tray.shadow'),
        icon: icons.menu('draw'),
        type: 'checkbox',
        checked: !!settings.shadow,
        click: (item) => host.setShadow(item.checked),
      },
      { type: 'separator' },
      {
        label: say('tray.putBack'),
        icon: icons.menu('eject'),
        // 박스는 그대로 두고 안의 파일만 바탕화면으로 돌려준다.
        // 끝낼 때 부르는 putBack 과 달리 앱은 계속 돌아간다.
        click: () => host.returnAll(),
      },
      {
        label: say('tray.boxRoot'),
        icon: icons.menu('folder'),
        click: () => shell.openPath(host.boxRoot()),
      },
      {
        label: say('tray.folder'),
        icon: icons.menu('folder'),
        click: () => shell.openPath(app.getPath('userData')),
      },
    ];
  };

  // 프로그램 정보. 설정 창의 정보 탭과 같은 것을 보여 준다.
  const showAbout = () => {
    const who = host.AUTHOR || { name: '', email: '' };
    const lines = [
      `${say('about.version')} ${app.getVersion()}`,
      `${say('about.made')} ${who.name}`,
      `${say('about.mail')} ${who.email}`,
    ];
    ask.notice({
      title: app.getName(),
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
      // 누르면 설정 창이 열린다. 자주 바꾸는 값은 눌러 들어가지 않아도 되게 아래에 함께 둔다.
      { label: say('tray.settings'), icon: icons.menu('settings'), click: () => host.openPrefs() },
      { label: say('tray.quickSettings'), icon: icons.menu('settings'), submenu: settingsMenu() },
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
