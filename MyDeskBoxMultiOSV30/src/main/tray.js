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

  // 바탕화면 페이지. 고르면 그 페이지의 박스만 화면에 남는다.
  const pagesMenu = () => {
    const { state } = host;
    const rows = state.pages.map((page) => ({
      label: host.pageLabel(page),
      icon: icons.menu('page'),
      type: 'radio',
      checked: state.page === page.id,
      click: () => host.showPage(page.id),
    }));
    rows.push({ type: 'separator' });
    rows.push({ label: say('page.add'), icon: icons.menu('page'), click: () => host.addPage('') });
    rows.push({
      label: say('page.drop'),
      icon: icons.menu('remove'),
      // 페이지가 하나뿐이면 지울 수 없다. 박스가 갈 데가 없어진다.
      enabled: state.pages.length > 1,
      click: () => host.removePage(state.page),
    });
    return rows;
  };

  // 배치 스냅샷. 박스의 자리와 모습만 적어 둔다. 담긴 파일은 건드리지 않는다.
  const snapsMenu = () => {
    const { state } = host;
    const rows = [{ label: say('snap.save'), icon: icons.menu('snapshot'), click: () => host.saveSnap('') }];
    if (!state.snaps.length) {
      rows.push({ label: say('snap.none'), icon: icons.menu('info'), enabled: false });
      return rows;
    }
    rows.push({ type: 'separator' });
    for (const snap of state.snaps) {
      rows.push({
        label: snap.name || host.snapName(snap.at),
        icon: icons.menu('snapshot'),
        submenu: [
          { label: say('snap.apply'), icon: icons.menu('eject'), click: () => host.applySnap(snap.id) },
          { label: say('snap.boxes', { n: snap.boxes.length }), icon: icons.menu('info'), enabled: false },
          { type: 'separator' },
          { label: say('snap.drop'), icon: icons.menu('remove'), click: () => host.removeSnap(snap.id) },
        ],
      });
    }
    return rows;
  };

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
      // 담을 때 파일을 옮길지, 있는 자리에 두고 가리킬지. 파일이 움직이는 일이라 눈에 띄게 둔다.
      {
        label: say('tray.takeWith'),
        icon: icons.menu('gather'),
        submenu: [
          {
            label: say('tray.takeKeep'),
            icon: icons.menu('portal'),
            type: 'radio',
            checked: settings.takeWith !== 'move',
            click: () => host.setTakeWith('keep'),
          },
          {
            label: say('tray.takeMove'),
            icon: icons.menu('gather'),
            type: 'radio',
            checked: settings.takeWith === 'move',
            click: () => host.setTakeWith('move'),
          },
        ],
      },
      { type: 'separator' },
      // 새로 생긴 바탕화면 항목을 규칙대로 담는다. 파일이 저절로 옮겨 가는 일이라
      // 사람이 켜 주기 전에는 하지 않는다. 규칙은 설정 창의 '규칙' 탭에서 적는다.
      {
        label: say('tray.autoSort'),
        icon: icons.menu('gather'),
        type: 'checkbox',
        checked: !!settings.autoSort,
        click: (item) => host.setAutoSort(item.checked),
      },
      {
        label: say('tray.sortNow'),
        icon: icons.menu('gather'),
        enabled: settings.rules.length > 0,
        click: () => host.sortNow(),
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
      // 폴더 포털. 디스크에 있는 폴더를 그대로 비추는 박스다. 파일을 옮기지 않는다.
      { label: say('tray.newPortal'), icon: icons.menu('portal'), click: () => host.createPortal() },
      {
        label: say(state.hidden ? 'tray.show' : 'tray.hide'),
        icon: icons.menu(state.hidden ? 'show' : 'hide'),
        click: () => host.toggleHidden(),
      },
      { type: 'separator' },
      { label: say('tray.pages'), icon: icons.menu('page'), submenu: pagesMenu() },
      { label: say('tray.snaps'), icon: icons.menu('snapshot'), submenu: snapsMenu() },
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
