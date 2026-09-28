'use strict';

const electron = require('electron');

// ELECTRON_RUN_AS_NODE 가 남아 있으면 Electron 이 그냥 Node 처럼 켜져 창이 뜨지 않는다.
// 무슨 일인지 알 수 없는 오류 대신 할 일을 알려 준다. npm start 는 이 값을 걷어 내고 띄운다.
if (!electron || !electron.app) {
  console.error('Electron 이 아니라 Node 로 켜졌습니다. ELECTRON_RUN_AS_NODE 를 지우고 npm start 로 실행해 주세요.');
  process.exit(1);
}

const { app, dialog } = electron;

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
  app.commandLine.appendSwitch('disable-gpu-compositing');
}

if (process.platform === 'win32') {
  // 박스는 늘 다른 창 아래에 있다. 가려졌다고 그리기를 멈추면
  // 창을 치웠을 때 빈 자리가 남으므로 그 판정을 끈다.
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}

// 같은 설정 폴더로 또 켠 경우. 먼저 켠 쪽이 박스를 그리므로 이 쪽은 조용히 물러난다.
// 다만 왜 아무 일도 없어 보이는지는 알려 준다.
if (!app.requestSingleInstanceLock()) {
  const i18n = require('../shared/i18n');
  // 앱이 준비되기 전이라 시스템 언어를 못 읽는다. 저장해 둔 설정을 쓴다.
  let lang = i18n.DEFAULT_LANG;
  try {
    lang = i18n.langOf(require('./store').load().settings.lang);
  } catch (_err) {
    lang = i18n.guessLang(typeof app.getLocale === 'function' ? app.getLocale() : '');
  }
  console.error(i18n.t(lang, 'alone.title'));
  console.error(i18n.t(lang, 'alone.running'));
  app.exit(0);
} else {
  app.setAppUserModelId('com.suhokwon.mydeskbox');
  if (process.platform === 'darwin') {
    app.whenReady().then(() => {
      if (app.dock) app.dock.hide();
    });
  }
  start();
}

function workArea() {
  try {
    const { screen } = require('electron');
    const area = screen.getPrimaryDisplay().workArea;
    return { x: area.x, y: area.y, width: area.width, height: area.height };
  } catch (_err) {
    return { x: 0, y: 0, width: 1280, height: 800 };
  }
}

// 설치 후 처음에는 바탕화면 항목을 폴더, 바로가기, 문서 같은 박스로 나눠 담는다.
function seedDesktop(state, desktop, store) {
  const catalog = require('../shared/catalog');
  const i18n = require('../shared/i18n');
  const files = typeof desktop.listDesktopFiles === 'function' ? desktop.listDesktopFiles() : [];
  const shell = typeof desktop.shellItems === 'function' ? desktop.shellItems() : [];
  const lang = state.settings.lang;
  const made = catalog.planFences(files, shell, workArea(), (kind) => i18n.t(lang, `box.${kind}`));
  if (!made.length) return;
  state.fences = made.map((raw) => store.normalizeFence(raw));
}

function start() {
  const store = require('./store');
  const i18n = require('../shared/i18n');
  const desktop = require('./desktop');
  const { createHost } = require('./fences');
  const tray = require('./tray');
  const ipc = require('./ipc');

  let host = null;
  let sweep = null;
  let stopWatch = () => {};
  let stopClick = () => {};
  let stopDrag = () => {};

  app.on('second-instance', () => {
    if (host) host.beginDraw();
  });

  app.on('window-all-closed', () => {});

  // 끝낼 때 바탕화면을 켜기 전 모습으로 돌려놓는다.
  // 담아 둔 파일은 원래 있던 폴더로, 밀어낸 아이콘은 적어 둔 자리로 간다.
  // 두 번 불러도 한 번만 한다. 어느 길로 끝나든 이 하나를 거친다.
  let restored = false;

  function restoreDesktop() {
    if (restored) return;
    restored = true;
    try {
      stopWatch();
      stopClick();
      stopDrag();
      if (sweep) clearInterval(sweep);
      if (host && typeof host.putBack === 'function') host.putBack();
      if (host) desktop.release(host.captured());
      desktop.shutdown();
    } catch (_err) {
      /* 끝나는 중에는 더 할 일이 없다. */
    }
  }

  app.on('before-quit', restoreDesktop);

  // 트레이로 끝내지 않는 길도 있다. npm start 를 Ctrl+C 로 끊거나,
  // 작업 관리자로 끊거나, 로그아웃으로 창이 닫히는 경우다.
  // 그때도 파일이 박스 폴더에 남아 있으면 바탕화면이 빈 채로 남는다.
  process.on('exit', restoreDesktop);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    try {
      process.on(signal, () => {
        restoreDesktop();
        app.exit(0);
      });
    } catch (_err) {
      /* 이 운영체제에 없는 신호면 그냥 넘어간다. */
    }
  }

  app.whenReady().then(() => {
    const state = store.load();
    // 바탕화면 아이콘은 하나뿐이라 두 벌이 함께 다루면 아이콘이 깜빡인다.
    // 설치본과 소스를 같이 켠 경우처럼 설정 폴더가 달라도 여기서 걸러진다.
    if (typeof desktop.claimSingleInstance === 'function' && !desktop.claimSingleInstance()) {
      const title = i18n.t(state.settings.lang, 'alone.title');
      const detail = i18n.t(state.settings.lang, 'alone.detail');
      console.error(`${title}
${detail}`);
      try {
        dialog.showErrorBox(title, detail);
      } catch (_err) {
        /* 창을 띄우지 못해도 알려 줄 만큼은 적었다. */
      }
      app.exit(0);
      return;
    }
    if (typeof desktop.init === 'function') desktop.init(app.getPath('userData'));
    host = createHost(state);
    ipc.install(host);
    tray.install(host);
    stopClick = desktop.watchDoubleClick(() => host.toggleHidden());
    stopDrag = desktop.watchDrag(
      (rect) => host.offerFence(rect),
      () => host.refreshIcons(),
      (item, dip) => host.acceptDesktopDrop(item, dip)
    );
    stopWatch = desktop.watchDesktop(() => host.refreshIcons());
    const firstRun = !state.didWelcome;
    if (firstRun) {
      state.didWelcome = true;
      seedDesktop(state, desktop, store);
      store.save(state);
    }
    host.openAll();
    sweep = setInterval(() => {
      if (!desktop.mouseDown()) host.refreshIcons();
    }, 3000);
    if (firstRun && !state.fences.length) host.beginDraw();
  });
}
