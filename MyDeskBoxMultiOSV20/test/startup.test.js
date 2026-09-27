'use strict';

// 켜고 끄는 언저리. 시작프로그램 등록, 트레이에만 있기, 자리와 설정 기억하기.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadHost, loadMain, fence, baseState, fenceWindows } = require('./helpers/fakes');

// ── 시작할 때 스스로 켜지기 ────────────────────────────────────────────────

test('켤 때 설정대로 시작프로그램에 자기를 적는다', async () => {
  const state = baseState({ settings: { openAtLogin: true } });
  const app = await loadMain(state);
  try {
    assert.equal(app.electron.module.app.login.openAtLogin, true, '시작프로그램으로 적힌다');
    assert.equal(app.electron.module.app.login.path, process.execPath, '지금 자리로 적힌다');
  } finally {
    app.stop();
  }
});

test('끄기로 해 둔 사람에게는 켤 때 아무것도 적지 않는다', async () => {
  const state = baseState({ settings: { openAtLogin: false } });
  const app = await loadMain(state);
  try {
    assert.deepEqual(app.electron.module.app.login, { openAtLogin: false, path: '' }, '건드리지 않는다');
  } finally {
    app.stop();
  }
});

test('설정에서 끄면 시작프로그램에서 빠지고 그 값이 남는다', () => {
  const state = baseState({ settings: { openAtLogin: true } });
  const { host, electron } = loadHost(state);

  host.setLogin(false);
  assert.equal(state.settings.openAtLogin, false);
  assert.equal(electron.module.app.login.openAtLogin, false, '운영체제에서도 빠진다');

  host.setLogin(true);
  assert.equal(state.settings.openAtLogin, true);
  assert.equal(electron.module.app.login.openAtLogin, true);
});

test('개발 중에 띄운 것은 시작프로그램에 적지 않는다', () => {
  const state = baseState({ settings: { openAtLogin: true } });
  const { host, electron } = loadHost(state);
  electron.module.app.isPackaged = false;

  host.setLogin(true);

  assert.equal(state.settings.openAtLogin, true, '고른 값은 그대로 남는다');
  assert.deepEqual(electron.module.app.login, { openAtLogin: false, path: '' }, '운영체제에는 적지 않는다');
});

// ── 트레이에만 있기 ────────────────────────────────────────────────────────

test('어느 창도 작업 표시줄에 나타나지 않는다', async () => {
  const state = baseState({ fences: [fence()] });
  const { host, electron } = loadHost(state);
  host.openAll();
  host.beginDraw();
  host.openPrefs();
  host.openSettings('a');
  for (const win of electron.windows) win.ready();

  assert.ok(electron.windows.length >= 4, '볼 창이 있어야 검사가 뜻을 가진다');
  for (const win of electron.windows) {
    assert.equal(win.options.skipTaskbar, true, `${win.loaded && win.loaded.file} 가 작업 표시줄에 뜬다`);
    assert.equal(win.options.frame, false, `${win.loaded && win.loaded.file} 에 창틀이 있다`);
  }
});

test('트레이 아이콘 하나로 끝까지 다룰 수 있다', () => {
  const state = baseState({ fences: [fence()] });
  const loaded = loadHost(state);
  const tray = loaded.installTray();
  assert.equal(loaded.electron.trays.length, 1, '트레이 아이콘은 하나다');
  assert.ok(tray.menu, '메뉴가 달려 있다');
});

// ── 자리와 설정 기억하기 ───────────────────────────────────────────────────

// 저장해 둔 값을 읽어 오는 길 자체는 test/store.test.js 가 본다.
// 여기서는 읽어 온 값대로 창이 서는지를 본다.
test('다시 켜면 박스가 지난번 자리에 그대로 선다', () => {
  const state = baseState({ fences: [fence({ x: 640, y: 360, w: 300, h: 260 })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  const win = fenceWindows(electron)[0];
  assert.equal(win.bounds.x, 640, '켤 때 자리를 손보지 않는다');
  assert.equal(win.bounds.y, 360);
  assert.equal(state.fences[0].w, 300);
  assert.equal(state.fences[0].h, 260);
});

test('숨겨 둔 채로 끝냈으면 다시 켜도 숨어 있다', () => {
  const state = baseState({ hidden: true, fences: [fence()] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  assert.equal(fenceWindows(electron).every((win) => !win.isVisible()), true);
});

test('작업 관리자에 사람이 읽을 이름으로 적힌다', () => {
  const state = baseState({ settings: { openAtLogin: false } });
  const { host, electron } = loadHost(state);

  host.setLogin(true);

  const { login } = electron.module.app;
  // 이름을 주지 않으면 'com.suhokwon.mydeskbox' 가 적힌다. 제거 프로그램도 이 이름으로 찾는다.
  assert.equal(login.name, 'MyDeskBox');
  assert.equal(login.path, process.execPath, '지금 실행 파일을 적는다');
  assert.deepEqual(login.args, [], '남는 인자 없이 그대로 켠다');
});

test('시작프로그램에서 빠져 있으면 켤 때 다시 적는다', () => {
  const state = baseState({ settings: { openAtLogin: true } });
  const { host, electron } = loadHost(state);
  host.setLogin(true);

  // 사람이 작업 관리자에서 지운 것처럼 만든다.
  electron.module.app.login = { openAtLogin: false, path: '' };
  assert.equal(electron.module.app.getLoginItemSettings().openAtLogin, false);

  // 다시 켠 셈 치고 맞추는 길을 부른다.
  assert.equal(host.syncLogin(), true, '다시 적지 않았다');
  assert.equal(electron.module.app.login.openAtLogin, true);
  assert.equal(electron.module.app.login.path, process.execPath);
});

test('끄기로 해 둔 사람에게는 맞추는 길이 아무것도 하지 않는다', () => {
  const state = baseState({ settings: { openAtLogin: false } });
  const { host, electron } = loadHost(state);

  assert.equal(host.syncLogin(), false, '없는 것을 또 지운다');
  assert.deepEqual(electron.module.app.login, { openAtLogin: false, path: '' });
});

test('운영체제가 거절해도 고른 값은 남는다', () => {
  const state = baseState({ settings: { openAtLogin: false } });
  const { host, electron } = loadHost(state);
  electron.module.app.setLoginItemSettings = () => {
    throw new Error('운영체제가 거절했다');
  };

  host.setLogin(true);

  assert.equal(state.settings.openAtLogin, true, '고른 값까지 잃었다');
});

test('설정 창에서 꺼도 같은 길을 간다', () => {
  const state = baseState({ settings: { openAtLogin: true } });
  const { host, electron } = loadHost(state);
  host.setLogin(true);
  assert.equal(electron.module.app.login.openAtLogin, true);

  host.changePrefs({ openAtLogin: false });

  assert.equal(state.settings.openAtLogin, false);
  assert.equal(electron.module.app.login.openAtLogin, false, '운영체제에서 빠지지 않았다');
});

test('트레이의 시작할 때 실행이 지금 값을 보여 주고 눌러 바꾼다', () => {
  const state = baseState({ settings: { openAtLogin: true } });
  const loaded = loadHost(state);
  loaded.installTray();

  const find = () => {
    const menu = loaded.electron.menus.at(-1);
    const quick = menu.find((row) => row.submenu && row.submenu.some((entry) => entry.label === '시작할 때 실행'));
    assert.ok(quick, '빠른 설정에 시작할 때 실행이 없다');
    return quick.submenu.find((entry) => entry.label === '시작할 때 실행');
  };

  const on = find();
  assert.equal(on.type, 'checkbox');
  assert.equal(on.checked, true, '켜져 있는데 꺼진 것으로 보여 준다');

  // 눌러서 끈다. 메뉴는 누른 뒤의 값을 담아 다시 그려진다.
  on.click({ checked: false });
  assert.equal(state.settings.openAtLogin, false);
  assert.equal(loaded.electron.module.app.login.openAtLogin, false);
  assert.equal(find().checked, false, '끈 뒤에도 켜진 것으로 보여 준다');
});

test('창을 띄우는 자리마다 작업 표시줄에서 빼 둔다', () => {
  // loadHost 는 묻는 창(ask.js)을 가짜로 바꿔 끼우므로 창 수로는 볼 수 없다.
  // 창을 띄우는 자리가 늘어날 때를 대비해 소스에서 직접 센다.
  const root = path.join(__dirname, '..', 'src', 'main');
  let seen = 0;
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith('.js')) continue;
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    const made = (text.match(/new BrowserWindow\(/g) || []).length;
    if (!made) continue;
    const skipped = (text.match(/skipTaskbar: true/g) || []).length;
    assert.equal(skipped, made, `${name} 에서 창 ${made}개 중 ${skipped}개만 작업 표시줄에서 뺐다`);
    seen += made;
  }
  assert.ok(seen >= 6, `창을 띄우는 자리가 ${seen}곳뿐이다. 검사가 무엇도 보고 있지 않다`);
});

// ── 다음 실행을 위해 적어 두기 ─────────────────────────────────────────────
//
// 위의 검사는 읽어 온 값대로 창이 서는지를 본다. 아래는 그 값이 실제로
// layout.json 에 적히는지를 본다. 둘이 이어져야 다시 켰을 때 그대로 돌아온다.

function written(loaded) {
  return JSON.parse(fs.readFileSync(path.join(loaded.userData, 'layout.json'), 'utf8'));
}

test('박스를 옮기면 그 자리가 곧바로 적힌다', () => {
  const state = baseState({ fences: [fence()] });
  const loaded = loadHost(state);
  loaded.host.openAll();
  for (const win of loaded.electron.windows) win.ready();

  loaded.host.applyBounds('a', { id: 'a', x: 720, y: 480, w: 360, h: 300 }, true);

  const box = written(loaded).fences[0];
  assert.deepEqual([box.x, box.y, box.w, box.h], [720, 480, 360, 300], '옮긴 자리가 적히지 않았다');
});

test('끄는 동안에는 적지 않고 손을 뗄 때 적는다', () => {
  const state = baseState({ fences: [fence()] });
  const loaded = loadHost(state);
  loaded.host.openAll();
  for (const win of loaded.electron.windows) win.ready();
  loaded.host.applyBounds('a', { id: 'a', x: 300, y: 300, w: 400, h: 300 }, true);

  // 끄는 중(save 가 거짓)에는 저장하지 않는다. 한 번 끌 때마다 파일을 쓰지 않기 위해서다.
  loaded.host.applyBounds('a', { id: 'a', x: 500, y: 500, w: 400, h: 300 }, false);
  assert.equal(written(loaded).fences[0].x, 300, '끄는 동안에도 파일을 썼다');

  loaded.host.applyBounds('a', { id: 'a', x: 500, y: 500, w: 400, h: 300 }, true);
  assert.equal(written(loaded).fences[0].x, 500, '손을 뗀 뒤에도 적지 않았다');
});

test('설정을 바꾸면 다음 실행을 위해 적어 둔다', () => {
  const state = baseState();
  const loaded = loadHost(state);

  loaded.host.setLang('en');
  loaded.host.setDefaultTheme('cherry');
  loaded.host.setDefaultOpacity(0.7);
  loaded.host.setOpenWith('single');
  loaded.host.setShadow(true);
  loaded.host.setLogin(false);

  assert.deepEqual(
    (({ lang, theme, opacity, openWith, shadow, openAtLogin }) => ({ lang, theme, opacity, openWith, shadow, openAtLogin }))(written(loaded).settings),
    { lang: 'en', theme: 'cherry', opacity: 0.7, openWith: 'single', shadow: true, openAtLogin: false }
  );
});

test('접어 두거나 숨겨 둔 것도 적어 둔다', () => {
  const state = baseState({ fences: [fence()] });
  const loaded = loadHost(state);
  loaded.host.openAll();
  for (const win of loaded.electron.windows) win.ready();

  loaded.host.setCollapsed('a', true);
  loaded.host.setHidden(true);

  const saved = written(loaded);
  assert.equal(saved.fences[0].collapsed, true, '접은 것을 적지 않았다');
  assert.equal(saved.hidden, true, '숨긴 것을 적지 않았다');
});

test('박스 이름과 테마를 바꾼 것도 적어 둔다', () => {
  const state = baseState({ fences: [fence()] });
  const loaded = loadHost(state);
  loaded.host.openAll();

  loaded.host.rename('a', '일감');
  loaded.host.restyle('a', { theme: 'forest', corner: 4 });

  const box = written(loaded).fences[0];
  assert.equal(box.title, '일감');
  assert.equal(box.theme, 'forest');
});
