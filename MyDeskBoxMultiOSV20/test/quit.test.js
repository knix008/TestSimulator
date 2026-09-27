'use strict';

// 프로그램을 끝내면 바탕화면은 앱을 켜기 전과 같아야 한다.
//
// 담는다는 것은 파일을 박스 폴더로 옮긴다는 뜻이므로, 끝낼 때 그 파일을
// 하나도 빠짐없이 담기 전 폴더로 되돌려야 한다. 트레이로 끝내든, Ctrl+C 로 끊든,
// 큰 오류로 멈추든 같은 길을 지난다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadMain, fence, baseState } = require('./helpers/fakes');

const WINDOWS = path.join(__dirname, '..', 'src', 'main', 'desktop', 'windows.js');

// 검사마다 바탕화면으로 쓸 폴더를 새로 만든다. 서로 섞이면 무엇이 돌아왔는지 알 수 없다.
function desktopWith(...names) {
  const desk = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-quit-'));
  const made = names.map((name) => {
    const at = path.join(desk, name);
    fs.writeFileSync(at, name);
    return { name, path: at };
  });
  return { desk, made };
}

const RECYCLE = { name: '휴지통', path: 'shell:RecycleBinFolder' };

function boxed() {
  const { desk, made } = desktopWith('MyClock.lnk', '노트.txt', 'Photos');
  const state = baseState({
    fences: [
      fence({ id: 'a', items: [made[0], made[1]] }),
      fence({ id: 'b', x: 600, items: [RECYCLE, made[2]] }),
    ],
  });
  return { state, desk, made };
}

// 켠 뒤에 파일이 정말 박스 폴더로 옮겨 갔는지 확인한다.
function held(state) {
  return state.fences.flatMap((box) => box.items.map((item) => item.path));
}

test('켜면 담아 둔 파일이 박스 폴더로 옮겨 간다', async () => {
  const { state, desk } = boxed();
  const { stop } = await loadMain(state);
  try {
    assert.deepEqual(fs.readdirSync(desk).sort(), [], '바탕화면 폴더에 파일이 남았다');
    for (const at of held(state)) {
      if (at.startsWith('shell:')) continue;
      assert.equal(fs.existsSync(at), true, `${at} 이 박스 폴더에 없다`);
    }
  } finally {
    stop();
  }
});

test('프로그램을 끝내면 담아 둔 항목을 하나도 빼놓지 않고 돌려준다', async () => {
  const { state, desk } = boxed();
  const { desktop, quit } = await loadMain(state);
  await quit();

  assert.deepEqual(
    fs.readdirSync(desk).sort(),
    ['MyClock.lnk', 'Photos', '노트.txt'].sort(),
    '바탕화면에 돌아오지 않은 파일이 있다'
  );
  // 바탕화면은 비우기 전으로 돌아가되, 어느 박스에 무엇이 있었는지는 남긴다.
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['MyClock.lnk', '노트.txt']);
  assert.deepEqual(state.fences[1].items.map((item) => item.name), ['휴지통', 'Photos']);
  for (const item of state.fences.flatMap((box) => box.items)) {
    if (String(item.path).startsWith('shell:')) continue;
    assert.equal(path.dirname(item.path), desk, '기억한 자리가 바탕화면이 아니다');
    assert.equal(fs.existsSync(item.path), true, '기억한 파일이 바탕화면에 없다');
  }
  // 아이콘 자리를 되돌리는 일은 release 와 shutdown 이 한다.
  assert.ok(desktop.calls.release.at(-1), '아이콘 자리를 되돌리지 않았다');
});

test('다시 켜면 기억한 설정으로 박스 내용을 채운다', async () => {
  const { state, desk } = boxed();
  const first = await loadMain(state);
  await first.quit();
  assert.equal(fs.readdirSync(desk).length, 3, '끝내자 바탕화면이 비었다');

  const again = await loadMain(state);
  try {
    assert.deepEqual(fs.readdirSync(desk).sort(), [], '다시 켰는데 바탕화면에 파일이 남았다');
    assert.deepEqual(state.fences[0].items.map((item) => item.name), ['MyClock.lnk', '노트.txt']);
    assert.deepEqual(state.fences[1].items.map((item) => item.name), ['휴지통', 'Photos']);
    for (const item of state.fences.flatMap((box) => box.items)) {
      if (String(item.path).startsWith('shell:')) continue;
      assert.equal(fs.existsSync(item.path), true, `${item.name} 이 박스에 없다`);
      assert.notEqual(path.dirname(item.path), desk, '박스에 담지 않고 바탕화면에 두었다');
    }
    assert.equal(state.fences[0].x, 100, '박스 자리를 잊었다');
    assert.equal(state.fences[1].x, 600, '둘째 박스 자리를 잊었다');
  } finally {
    again.stop();
  }
});

test('돌려준 파일의 내용은 그대로다', async () => {
  const { state, desk } = boxed();
  const { quit } = await loadMain(state);
  await quit();
  assert.equal(fs.readFileSync(path.join(desk, '노트.txt'), 'utf8'), '노트.txt', '내용이 달라졌다');
});

test('끝낼 때 바탕화면 모듈에도 끝났다고 알린다', async () => {
  const { state } = boxed();
  const { desktop, quit } = await loadMain(state);
  assert.equal(desktop.calls.shutdown, 0);
  await quit();
  // shutdown 이 탐색기 설정(자동 정렬, 셸 아이콘)을 되돌린다.
  assert.equal(desktop.calls.shutdown, 1, '탐색기 설정을 되돌리지 않았다');
});

test('박스를 숨겨 둔 채 끝내도 담아 둔 파일을 돌려준다', async () => {
  const { state, desk } = boxed();
  state.hidden = true;
  const { quit } = await loadMain(state);
  await quit();
  assert.equal(fs.readdirSync(desk).length, 3, '숨긴 상태에서는 돌려주지 않았다');
});

test('박스가 하나도 없어도 끝내는 절차는 끝까지 간다', async () => {
  const { desktop, quit } = await loadMain(baseState({ fences: [] }));
  await quit();
  assert.deepEqual(desktop.calls.release.at(-1), []);
  assert.equal(desktop.calls.shutdown, 1);
});

// npm start 를 Ctrl+C 로 끊는 길. 창을 닫을 틈이 없어도 파일은 돌아와야 한다.
test('Ctrl+C 로 끊어도 담아 둔 파일이 바탕화면으로 돌아온다', async () => {
  const { state, desk } = boxed();
  const { signal } = await loadMain(state);
  signal('SIGINT');
  assert.deepEqual(
    fs.readdirSync(desk).sort(),
    ['MyClock.lnk', 'Photos', '노트.txt'].sort(),
    'Ctrl+C 로 끊으니 파일이 박스 폴더에 남았다'
  );
});

test('창을 닫지 못하고 끝나도 파일이 돌아온다', async () => {
  const { state, desk } = boxed();
  const { exit } = await loadMain(state);
  exit();
  assert.equal(fs.readdirSync(desk).length, 3, '갑자기 끝나니 파일이 남았다');
});

function fatalWindows(electron) {
  return electron.windows.filter((win) => win.loaded && /fatal\.html$/.test(win.loaded.file));
}

function fatalReport(win) {
  return JSON.parse(win.loaded.opts.query.report);
}

// 큰 오류로 멈출 때도 먼저 바탕화면을 되돌리고, 무슨 일이었는지 알려 준다.
test('큰 오류가 나면 파일을 돌려준 뒤에 알린다', async () => {
  const { state, desk } = boxed();
  const { electron, crash } = await loadMain(state);

  crash(new Error('일부러 낸 오류'));

  assert.equal(fs.readdirSync(desk).length, 3, '오류가 났다고 파일을 두고 갔다');
  const shown = fatalWindows(electron);
  assert.equal(shown.length, 1, '오류를 알리지 않았다');
  assert.equal(electron.errors.length, 0, '우리 창과 시스템 창이 함께 떴다');
  const report = fatalReport(shown[0]);
  assert.match(report.text, /일부러 낸 오류/, '무슨 오류인지 보여 주지 않았다');
  assert.match(report.text, /quit\.test\.js/, '어디서 났는지 보여 주지 않았다');
  assert.equal(shown[0].options.alwaysOnTop, true, '오류 창이 다른 창 아래로 숨는다');
  assert.equal(shown[0].options.skipTaskbar, true, '오류 창이 작업 표시줄에 따로 뜬다');
});

test('오류 창에서 고르면 내용이 클립보드로 간다', async () => {
  const { state } = boxed();
  const { electron, crash } = await loadMain(state);

  crash(new Error('베낄 오류'));
  electron.module.ipcMain.emit('fatal:copy');

  assert.equal(electron.copied.length, 1, '복사를 골랐는데 클립보드로 가지 않았다');
  assert.match(electron.copied[0], /베낄 오류/);
  assert.match(electron.copied[0], /MyDeskBox/, '어느 판에서 났는지 함께 담지 않았다');
  const shown = fatalWindows(electron);
  assert.equal(shown[0].isDestroyed(), false, '복사하면 창이 닫혀 글을 다시 볼 수 없다');
  assert.equal(shown[0].messages('fatal:copied').length, 1, '복사했는지를 창에 알려 주지 않았다');
});

test('오류 글은 창에서 골라 복사할 수 있다', () => {
  const dir = path.join(__dirname, '..', 'src', 'renderer');
  const html = fs.readFileSync(path.join(dir, 'fatal.html'), 'utf8');
  const css = fs.readFileSync(path.join(dir, 'fatal.css'), 'utf8');
  const js = fs.readFileSync(path.join(dir, 'fatal.js'), 'utf8');
  assert.match(html, /<textarea[^>]*id="report"/, '오류 글을 담을 글상자가 없다');
  assert.match(html, /readonly/, '글을 고치는 칸이 되었다');
  assert.match(css, /user-select:\s*text/, '글상자 안을 고를 수 없다');
  assert.match(js, /fatalCopy/, '전체를 복사하는 단추가 없다');
  assert.match(js, /select\(/, '뜨자마자 글을 골라 두지 않는다');
});

test('오류 창을 띄우지 못하면 시스템 창으로 알리고 복사할 수 있다', async () => {
  const { state, desk } = boxed();
  const { electron, crash } = await loadMain(state);
  electron.module.BrowserWindow = class {
    constructor() {
      throw new Error('창 없음');
    }
  };
  electron.copyOnFatal();

  crash(new Error('시스템 창 오류'));

  assert.equal(fs.readdirSync(desk).length, 3, '시스템 창으로 알릴 때도 파일을 두고 갔다');
  assert.equal(fatalWindows(electron).length, 0, '뜨지 못한 창이 남아 있다');
  const shown = electron.errors.at(-1);
  assert.ok(shown, '시스템 창으로도 알리지 않았다');
  assert.match(shown.detail, /시스템 창 오류/);
  assert.deepEqual(shown.buttons, ['복사', '닫기']);
  assert.equal(electron.copied.length, 1, '시스템 창에서 복사가 되지 않았다');
  assert.match(electron.copied[0], /시스템 창 오류/);
});

test('오류를 두 번 만나도 한 번만 알린다', async () => {
  const { state } = boxed();
  const { electron, crash, hooks } = await loadMain(state);
  crash(new Error('처음'));
  for (const fn of hooks.get('uncaughtException')) fn(new Error('두 번째'));
  assert.equal(fatalWindows(electron).length, 1, '오류 창이 두 번 떴다');
});

// 앱이 끝날 때 넘긴 값을 모은다. main.js 는 app 을 그대로 쥐고 있으므로 바꿔 끼우면 보인다.
function watchExit(electron) {
  const codes = [];
  electron.module.app.exit = (code) => codes.push(code);
  return codes;
}

test('오류 창이 떠 있는 동안에는 앱이 끝나지 않는다', async () => {
  const { state } = boxed();
  const { electron, crash } = await loadMain(state);
  const codes = watchExit(electron);

  crash(new Error('기다리는 오류'));
  electron.module.ipcMain.emit('fatal:copy');

  assert.deepEqual(codes, [], '글을 베끼기 전에 앱이 끝났다');
  assert.equal(fatalWindows(electron)[0].isDestroyed(), false, '오류 창이 저절로 닫혔다');
});

test('오류 창의 닫기를 누르면 창을 닫고 앱을 끝낸다', async () => {
  const { state } = boxed();
  const { electron, crash } = await loadMain(state);
  const codes = watchExit(electron);

  crash(new Error('닫을 오류'));
  electron.module.ipcMain.emit('fatal:close');

  assert.deepEqual(codes, [1], '닫기를 눌렀는데 오류로 끝내지 않았다');
  assert.equal(fatalWindows(electron)[0].isDestroyed(), true, '닫기를 눌렀는데 창이 남았다');

  // 닫은 뒤에는 손잡이도 떼어 낸다. 남으면 없는 창에 복사를 시도한다.
  electron.module.ipcMain.emit('fatal:copy');
  electron.module.ipcMain.emit('fatal:close');
  assert.deepEqual(electron.copied, [], '닫은 창의 복사 단추가 아직 살아 있다');
  assert.deepEqual(codes, [1], '앱을 두 번 끝냈다');
});

test('오류 창을 창 틀로 닫아도 앱을 끝낸다', async () => {
  const { state } = boxed();
  const { electron, crash } = await loadMain(state);
  const codes = watchExit(electron);

  crash(new Error('틀로 닫을 오류'));
  fatalWindows(electron)[0].close();

  assert.deepEqual(codes, [1], '창을 닫았는데 앱이 남았다');
});

test('오류 창이 글을 읽지 못하면 시스템 창으로 알리고 한 번만 끝낸다', async () => {
  const { state, desk } = boxed();
  const { electron, crash } = await loadMain(state);
  const codes = watchExit(electron);
  const Base = electron.module.BrowserWindow;
  const made = [];
  electron.module.BrowserWindow = class extends Base {
    constructor(options) {
      super(options);
      made.push(this);
    }

    loadFile() {
      throw new Error('읽지 못함');
    }
  };

  crash(new Error('읽기 실패 오류'));

  assert.equal(fs.readdirSync(desk).length, 3, '파일을 두고 갔다');
  assert.equal(made.length, 1, '오류 창을 만들어 보지 않았다');
  assert.equal(made[0].isDestroyed(), true, '글을 읽지 못한 창을 닫지 않았다');
  assert.match(electron.errors.at(-1).detail, /읽기 실패 오류/, '시스템 창으로 넘기지 않았다');
  assert.deepEqual(codes, [1], '앱을 끝내지 않았거나 두 번 끝냈다');
});

test('영어로 쓰면 오류 창도 영어로 보인다', async () => {
  const { desk, made } = desktopWith('노트.txt');
  const state = baseState({ settings: { lang: 'en' }, fences: [fence({ items: made })] });
  const { electron, crash } = await loadMain(state);

  crash(new Error('english error'));

  assert.equal(fs.readdirSync(desk).length, 1);
  const report = fatalReport(fatalWindows(electron)[0]);
  assert.equal(report.title, 'MyDeskBox cannot continue');
  assert.equal(report.copy, 'Copy');
  assert.equal(report.close, 'Close');
  assert.match(report.copied, /^Copied\./);
});

test('오류 창의 글은 두 언어 모두 갖추고 있다', () => {
  const i18n = require('../src/shared/i18n');
  for (const lang of Object.keys(i18n.TEXT)) {
    for (const key of ['fatal.title', 'fatal.detail', 'fatal.copied', 'fatal.copy', 'fatal.close']) {
      assert.ok(i18n.TEXT[lang][key], `${lang} 에 ${key} 가 없다`);
    }
  }
});

test('약속이 깨진 오류도 창으로 알리고 그대로 복사한다', async () => {
  const { state } = boxed();
  const { electron, hooks, stop } = await loadMain(state);
  try {
    for (const fn of hooks.get('unhandledRejection')) fn('깨진 약속');
    electron.module.ipcMain.emit('fatal:copy');
  } finally {
    stop();
  }
  const report = fatalReport(fatalWindows(electron)[0]);
  assert.match(report.text, /깨진 약속/, '글로 된 오류를 보여 주지 않았다');
  assert.equal(electron.copied[0], report.text, '보여 준 글과 복사한 글이 다르다');
});

test('Error 가 아닌 것을 던져도 내용을 풀어 보여 준다', async () => {
  const { state } = boxed();
  const { electron, crash } = await loadMain(state);

  crash({ code: 'E_BOX', where: '박스' });

  const report = fatalReport(fatalWindows(electron)[0]);
  assert.match(report.text, /"code": "E_BOX"/, '던진 값을 풀어 적지 않았다');
  assert.match(report.text, /"where": "박스"/);
  assert.match(report.text, /^MyDeskBox 1\.0\.0/, '어느 판인지 앞에 적지 않았다');
});

test('긴 오류 글도 자르지 않고 전부 복사한다', async () => {
  const { state } = boxed();
  const { electron, crash } = await loadMain(state);
  const err = new Error('긴 오류');
  err.stack = ['Error: 긴 오류', ...Array.from({ length: 400 }, (_, i) => `    at 자리${i} (file${i}.js:${i}:1)`)].join('\n');

  crash(err);
  electron.module.ipcMain.emit('fatal:copy');

  const report = fatalReport(fatalWindows(electron)[0]);
  assert.match(report.text, /자리399 \(file399\.js:399:1\)/, '긴 자취가 창에서 잘렸다');
  assert.match(electron.copied[0], /자리0 \(file0\.js:0:1\)[\s\S]*자리399/, '복사한 글이 잘렸다');
});

// 앞선 실행이 전원 내림처럼 아무 길도 지나지 못하고 끝난 경우.
// 보관함에 남은 파일은 다음에 켤 때 제자리로 돌아가야 한다.
test('앞선 실행이 남긴 파일을 켤 때 되돌린다', async () => {
  const { desk } = desktopWith();
  const room = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-left-'));
  const box = path.join(room, '지난 박스');
  fs.mkdirSync(box, { recursive: true });
  const stray = path.join(box, '남은.txt');
  fs.writeFileSync(stray, '남은 것');
  fs.writeFileSync(path.join(room, 'restore.json'), JSON.stringify({
    version: 1,
    items: [{ path: stray, home: desk }],
  }));

  const state = baseState({ settings: { root: room }, fences: [] });
  const { stop } = await loadMain(state);
  try {
    assert.equal(fs.existsSync(stray), false, '보관함에 그대로 남았다');
    assert.equal(fs.existsSync(path.join(desk, '남은.txt')), true, '바탕화면으로 돌아오지 않았다');
  } finally {
    stop();
  }
});

test('박스가 아직 들고 있는 파일은 켤 때 건드리지 않는다', async () => {
  const { state } = boxed();
  const { stop } = await loadMain(state);
  const kept = held(state).filter((at) => !at.startsWith('shell:'));
  stop();

  const { stop: stopAgain } = await loadMain(state);
  try {
    for (const at of kept) assert.equal(fs.existsSync(at), true, `${at} 을 멋대로 돌려보냈다`);
  } finally {
    stopAgain();
  }
});

// 여기부터는 Windows 쪽 되돌리기 절차가 빠지지 않았는지 글로 확인한다.
// 탐색기를 실제로 건드리는 코드라 검사에서 부를 수 없다.
test('Windows 되돌리기 절차가 모두 제자리에 있다', () => {
  const source = fs.readFileSync(WINDOWS, 'utf8');

  assert.match(source, /function homeAll/, '화면 밖 아이콘을 제자리로 보내는 길이 없다');
  assert.match(source, /function shutdown\(\)[\s\S]*?homeAll\(\)/, '끝낼 때 아이콘을 돌려주지 않는다');
  assert.match(source, /function shutdown\(\)[\s\S]*?restoreShellIcons\(\)/, '끝낼 때 셸 아이콘을 되돌리지 않는다');
  assert.match(source, /function shutdown\(\)[\s\S]*?restoreArrange\(\)/, '끝낼 때 탐색기 설정을 되돌리지 않는다');

  // 창을 닫지 못하고 끝나는 경우까지 대비한다.
  assert.match(source, /process\.once\('exit'[\s\S]*?homeAll\(\)/, '갑자기 끝날 때 아이콘을 돌려주지 않는다');
  assert.match(source, /process\.once\('exit'[\s\S]*?restoreArrange\(\)/, '갑자기 끝날 때 탐색기 설정을 되돌리지 않는다');
  assert.match(source, /process\.once\('exit'[\s\S]*?restoreShellIcons\(\)/, '갑자기 끝날 때 셸 아이콘을 되돌리지 않는다');

  // 감춰 둔 아이콘 층은 반드시 다시 보이게 해야 한다. 아니면 바탕화면이 빈 채로 남는다.
  assert.match(source, /function homeAll\(\)[\s\S]*?showLayer\(true\)/, '끝낼 때 아이콘 층을 되살리지 않는다');
  assert.match(source, /function release\(items\)[\s\S]*?showLayer\(true\)/, '박스를 숨길 때 아이콘 층을 되살리지 않는다');
  assert.match(source, /function restoreArrange\(\)[\s\S]*?normalizeList\(\)/, '탐색기 설정을 제자리로 돌리지 않는다');
  assert.match(source, /function normalizeList\(\)[\s\S]*?showLayer\(true\)/, '앞선 판이 감춘 층을 되살리지 않는다');
  assert.match(source, /function normalizeList\(\)[\s\S]*?restoreShellIcons\(\)/, '앞선 판이 감춘 셸 아이콘을 되살리지 않는다');

  // 박스가 가려서 밀어낸 아이콘도 되돌려야 바탕화면이 켜기 전 모습이 된다.
  // 밀어낸 자리는 화면 안이라 homeAll 의 '화면 밖' 검사에 걸리지 않는다. 따로 적어 둔다.
  assert.match(source, /function nudge\(blocks, live\)[\s\S]*?homes\.set\(key/, '밀어내기 전 자리를 적어 두지 않는다');
  assert.match(source, /function nudge\(blocks, live\)[\s\S]*?nudged\.add\(key\)/, '무엇을 밀어냈는지 적어 두지 않는다');
  assert.match(source, /function homeAll\(\)[\s\S]*?nudged\.has\(key\)/, '밀어낸 아이콘을 제자리로 돌리지 않는다');

  // 셸 아이콘을 되돌릴 때 SHCNE_ASSOCCHANGED 를 부르면 아이콘 그림 곳간이 통째로 다시 만들어진다.
  // 그동안 바탕화면은 그림 없이 이름만 그려진다. 바탕화면 보기 새로 고침만 보내야 한다.
  assert.doesNotMatch(source, /SHChangeNotify\(0x08000000/, '아이콘 그림 곳간을 통째로 다시 만들게 한다');
  assert.match(source, /function refreshShellIcons\(\)[\s\S]*?DESKTOP_REFRESH/, '바탕화면 보기를 새로 고치지 않는다');
});

// 끝내는 길은 모두 한 곳(restoreDesktop)으로 모여야 한다. 하나라도 빠지면 파일이 남는다.
test('끝내는 길이 하나도 빠지지 않았다', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
  assert.match(source, /app\.on\('before-quit', restoreDesktop\)/, '트레이로 끝내는 길이 없다');
  assert.match(source, /process\.on\('exit', restoreDesktop\)/, '갑자기 끝나는 길이 없다');
  assert.match(source, /SIGINT/, 'Ctrl+C 로 끊는 길이 없다');
  assert.match(source, /process\.on\('uncaughtException', fatal\)/, '큰 오류로 멈추는 길이 없다');
  assert.match(source, /process\.on\('unhandledRejection', fatal\)/, '약속이 깨진 길이 없다');
  // 알리기 전에 먼저 되돌려야 한다. 창 앞에서 손이 멈춰 있는 동안에도 바탕화면은 제 모습이어야 한다.
  assert.match(source, /function fatal\([\s\S]*?restoreDesktop\(\)[\s\S]*?tell\(text\)/, '되돌리기보다 알림이 먼저다');
  assert.match(source, /putBack/, '담아 둔 파일을 돌려주지 않는다');
});

test('이 컴퓨터에서 끝내기 절차를 부를 수 있다', { skip: process.platform !== 'win32' }, () => {
  const desktop = require('../src/main/desktop/windows');
  for (const name of ['release', 'shutdown', 'fileIcon', 'shellItems', 'nudge', 'gridInfo', 'hidePath']) {
    assert.equal(typeof desktop[name], 'function', `${name} 이 없다`);
  }
});

// 박스가 비켜 간 자리로는 밀어냈던 아이콘이 돌아와야 한다.
// 그러지 않으면 박스가 지나간 자리마다 구멍이 남아 바탕화면이 점점 흐트러진다.
test('밀어냈던 아이콘을 제자리로 들이는 길이 있다', () => {
  const source = fs.readFileSync(WINDOWS, 'utf8');
  assert.match(source, /function homecoming\(/, '돌려놓는 길이 없다');
  assert.match(source, /function nudge\(blocks, live\)[\s\S]*?homecoming\(/, '밀어낼 때 돌려놓지 않는다');
  // 돌아갈 자리가 아직 박스에 가렸으면 그대로 두어야 한다.
  assert.match(source, /function homecoming\([\s\S]*?deskgrid\.blocked\(/, '박스 밑으로 도로 들여보낸다');
  // 남이 쓰고 있는 자리로 보내면 아이콘이 겹친다.
  assert.match(source, /function homecoming\([\s\S]*?taken\.has\(/, '남의 자리로 들여보낸다');
  // 돌려놓은 것은 '밀어낸 것' 목록에서 빼야 끝낼 때 또 옮기지 않는다.
  assert.match(source, /function homecoming\([\s\S]*?nudged\.delete\(key\)/, '돌려놓고도 적어 둔 채로 둔다');
});

// 탐색기가 바탕화면에 그리는 이름과 박스에 적는 이름이 같아야 한다.
test('박스의 이름은 셸에게 묻는다', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'fences.js'), 'utf8');
  assert.match(source, /desktop\.displayName\(item\.path\)/, '셸에게 이름을 묻지 않는다');
  const win = fs.readFileSync(WINDOWS, 'utf8');
  assert.match(win, /function displayName\(filePath\)[\s\S]*?SHGFI_DISPLAYNAME/, '셸 이름을 가져오지 않는다');
});

// 휴지통은 비었을 때와 찼을 때 그림이 다르다.
test('휴지통 그림은 찬 상태에 따라 다시 가져온다', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'fences.js'), 'utf8');
  // 그림을 기억해 두는 열쇠에 휴지통 상태가 들어가야 상태가 바뀔 때 다시 가져온다.
  assert.match(source, /\$\{filePath\}:\$\{binState\(\)\}/, '휴지통 상태를 열쇠에 넣지 않는다');
  assert.match(source, /function watchBin\(\)[\s\S]*?pushAll\(\)/, '상태가 바뀌어도 다시 그리지 않는다');
});
