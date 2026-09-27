'use strict';

const electron = require('electron');

// ELECTRON_RUN_AS_NODE 가 남아 있으면 Electron 이 그냥 Node 처럼 켜져 창이 뜨지 않는다.
// 무슨 일인지 알 수 없는 오류 대신 할 일을 알려 준다. npm start 는 이 값을 걷어 내고 띄운다.
if (!electron || !electron.app) {
  console.error('Electron 이 아니라 Node 로 켜졌습니다. ELECTRON_RUN_AS_NODE 를 지우고 npm start 로 실행해 주세요.');
  process.exit(1);
}

const { app, dialog, clipboard } = electron;

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

// 설치 후 처음에는 바탕화면 항목을 폴더, 바로가기, 문서 같은 박스로 나눠 담을 수 있다.
// 담으면 파일이 박스 폴더로 옮겨 가므로, 나눠 보기만 하고 옮기지는 않는다.
function planDesktop(state, desktop) {
  const catalog = require('../shared/catalog');
  const i18n = require('../shared/i18n');
  const files = typeof desktop.listDesktopFiles === 'function' ? desktop.listDesktopFiles() : [];
  const shell = typeof desktop.shellItems === 'function' ? desktop.shellItems() : [];
  const lang = state.settings.lang;
  return catalog.planFences(files, shell, workArea(), (kind) => i18n.t(lang, `box.${kind}`));
}

// 첫 실행에 파일을 옮겨도 되는지 묻는다. 거절하면 빈 바탕화면으로 시작한다.
async function askSort(lang, count) {
  const i18n = require('../shared/i18n');
  const ask = require('./ask');
  try {
    return await ask.confirm({
      title: i18n.t(lang, 'dialog.sort'),
      detail: i18n.t(lang, 'dialog.sortDetail', { n: count }),
      confirm: i18n.t(lang, 'dialog.sortGo'),
      cancel: i18n.t(lang, 'dialog.cancel'),
    });
  } catch (_err) {
    return false;
  }
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

  // 큰 오류로 더 갈 수 없을 때.
  //
  // 먼저 바탕화면을 원래대로 돌려놓고, 그 다음에 무슨 일이었는지 알려 준다.
  // 순서가 중요하다. 알림 창에서 손이 멈춰 있는 동안에도 담아 둔 파일은
  // 이미 바탕화면에 돌아와 있어야 한다.
  let dying = false;

  function fatal(err) {
    if (dying) return;
    dying = true;
    const text = describe(err);
    try {
      console.error(text);
    } catch (_err) {
      /* 콘솔이 없어도 창으로는 알려 준다. */
    }
    restoreDesktop();
    // 우리 창이 떠 있으면 그 창이 닫힐 때 끝낸다. 글을 베끼기 전에 꺼지면 안 된다.
    if (!tell(text)) app.exit(1);
  }

  // 오류를 그대로 옮겨 적는다. 붙여 넣어 보낼 수 있어야 하므로 자취까지 담는다.
  function describe(err) {
    const when = new Date().toISOString();
    let body = '';
    if (err instanceof Error) body = err.stack || `${err.name}: ${err.message}`;
    else if (typeof err === 'string') body = err;
    else {
      try {
        body = JSON.stringify(err, null, 2);
      } catch (_err) {
        body = String(err);
      }
    }
    const version = typeof app.getVersion === 'function' ? app.getVersion() : '';
    return [
      `MyDeskBox ${version}`,
      `${process.platform} ${process.arch} · Electron ${process.versions.electron || ''}`,
      when,
      '',
      body,
    ].join('\n');
  }

  // 오류 글을 보여 주는 창. 글은 골라 복사할 수 있고, '복사'를 누르면 전부 클립보드로 간다.
  // 창을 띄우지 못하면 시스템 창으로 알린다. 그때는 우리 창을 믿을 수 없는 상태다.
  // 창이 떠 있으면 true. 호출한 쪽은 창이 닫힐 때까지 끝내지 않는다.
  function tell(text) {
    try {
      if (openReport(text)) return true;
    } catch (_err) {
      /* 아래에서 시스템 창으로 알린다. */
    }
    tellSystem(text);
    return false;
  }

  function openReport(text) {
    const path = require('path');
    const i18n = require('../shared/i18n');
    const { BrowserWindow, ipcMain, screen, nativeImage } = electron;
    const lang = i18n.langOf(spoken);
    const report = {
      title: i18n.t(lang, 'fatal.title'),
      detail: i18n.t(lang, 'fatal.detail'),
      copied: i18n.t(lang, 'fatal.copied'),
      copy: i18n.t(lang, 'fatal.copy'),
      close: i18n.t(lang, 'fatal.close'),
      text,
    };
    const width = 520;
    const height = 420;
    let bounds = { width, height };
    try {
      const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
      bounds = {
        x: Math.round(area.x + (area.width - width) / 2),
        y: Math.round(area.y + (area.height - height) / 2.4),
        width,
        height,
      };
    } catch (_err) {
      /* 화면을 모르면 기본 자리에 띄운다. */
    }

    let win;
    try {
      win = new BrowserWindow({
        ...bounds,
        title: report.title,
        frame: false,
        transparent: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        hasShadow: false,
        roundedCorners: false,
        thickFrame: false,
        show: false,
        icon: nativeImage.createEmpty(),
        backgroundColor: '#00000000',
        webPreferences: {
          preload: path.join(__dirname, '../preload/preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
        },
      });
    } catch (_err) {
      return false;
    }

    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      try { ipcMain.removeListener('fatal:copy', onCopy); } catch (_err) {}
      try { ipcMain.removeListener('fatal:close', onClose); } catch (_err) {}
      try { if (!win.isDestroyed()) win.close(); } catch (_err) {}
      try { app.exit(1); } catch (_err) {}
    };
    const onCopy = () => {
      try {
        clipboard.writeText(text);
      } catch (_err) {
        return;
      }
      try {
        if (!win.isDestroyed()) win.webContents.send('fatal:copied', report.copied);
      } catch (_err) {
        /* 창이 글을 못 받아도 클립보드에는 들어가 있다. */
      }
    };
    const onClose = () => leave();

    try {
      ipcMain.on('fatal:copy', onCopy);
      ipcMain.on('fatal:close', onClose);
      win.on('closed', leave);
      win.loadFile(path.join(__dirname, '../renderer/fatal.html'), {
        query: { report: JSON.stringify(report) },
      });
    } catch (_err) {
      try { ipcMain.removeListener('fatal:copy', onCopy); } catch (_clean) {}
      try { ipcMain.removeListener('fatal:close', onClose); } catch (_clean) {}
      try { win.removeAllListeners('closed'); } catch (_clean) {}
      try { if (!win.isDestroyed()) win.close(); } catch (_clean) {}
      return false;
    }

    const reveal = () => {
      try {
        if (left || win.isDestroyed()) return;
        win.show();
        win.setAlwaysOnTop(true);
        win.focus();
      } catch (_err) {
        /* 이미 보였거나 창이 없다. */
      }
    };
    try { win.once('ready-to-show', reveal); } catch (_err) {}
    setTimeout(reveal, 400);
    return true;
  }

  // 우리 창을 띄우지 못했을 때의 알림. '복사'를 고르면 오류 글이 클립보드로 간다.
  function tellSystem(text) {
    const i18n = require('../shared/i18n');
    const lang = i18n.langOf(spoken);
    for (let turn = 0; turn < 3; turn += 1) {
      let picked = 1;
      try {
        picked = dialog.showMessageBoxSync({
          type: 'error',
          title: i18n.t(lang, 'fatal.title'),
          message: i18n.t(lang, 'fatal.title'),
          detail: `${i18n.t(lang, turn ? 'fatal.copied' : 'fatal.detail')}\n\n${text}`,
          buttons: [i18n.t(lang, 'fatal.copy'), i18n.t(lang, 'fatal.close')],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        });
      } catch (_err) {
        return;
      }
      if (picked !== 0) return;
      try {
        clipboard.writeText(text);
      } catch (_err) {
        return;
      }
    }
  }

  // 오류 창에 쓸 언어. 설정을 읽기 전에는 기본값이다.
  let spoken = i18n.DEFAULT_LANG;

  process.on('uncaughtException', fatal);
  process.on('unhandledRejection', fatal);

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

  app.whenReady().then(async () => {
    const state = store.load();
    spoken = state.settings.lang;
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
    // 설치한 뒤 처음 켤 때 시작프로그램으로 자기를 적어 둔다.
    // 그래야 시스템을 다시 켜도 박스가 그대로 돌아온다. 설정에서 끈 사람은 건드리지 않는다.
    host.syncLogin();
    ipc.install(host);
    tray.install(host);
    stopClick = desktop.watchDoubleClick(() => host.toggleHidden());
    stopDrag = desktop.watchDrag(
      (rect) => host.offerFence(rect),
      () => host.refreshIcons(),
      (item, dip) => host.acceptDesktopDrop(item, dip)
    );
    stopWatch = desktop.watchDesktop(() => host.refreshIcons());
    // 앞선 실행이 갑자기 끝나 보관함에 남은 파일이 있으면 먼저 제자리로 돌려놓는다.
    // 박스가 아직 들고 있는 것은 그대로 둔다.
    host.recoverHeld();
    const firstRun = !state.didWelcome;
    if (firstRun) {
      state.didWelcome = true;
      // 나눠 담으면 파일이 박스 폴더로 옮겨 간다. 그래서 먼저 묻는다.
      const planned = planDesktop(state, desktop);
      const count = planned.reduce((sum, box) => sum + box.items.length, 0);
      if (count && await askSort(state.settings.lang, count)) {
        state.fences = planned.map((raw) => store.normalizeFence(raw));
      }
      store.save(state);
    }
    host.openAll();
    sweep = setInterval(() => {
      if (!desktop.mouseDown()) host.refreshIcons();
    }, 3000);
    if (firstRun && !state.fences.length) host.beginDraw();
  });
}
