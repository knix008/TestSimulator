'use strict';

// 프로그램을 끝내면 바탕화면은 앱을 켜기 전과 같아야 한다.
// 담아 둔 아이콘은 제자리로 돌아오고, 숨긴 셸 항목과 탐색기 설정도 되돌아간다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadMain, fence, baseState } = require('./helpers/fakes');

const WINDOWS = path.join(__dirname, '..', 'src', 'main', 'desktop', 'windows.js');

// 없는 파일은 박스에서 저절로 빠지므로, 검사에서도 진짜 파일을 쓴다.
const desk = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mydeskbox-quit-'));
const made = ['MyClock.lnk', '노트.txt', 'Photos'].map((name) => {
  const at = path.join(desk, name);
  fs.writeFileSync(at, '');
  return { name, path: at };
});
const RECYCLE = { name: '휴지통', path: 'shell:RecycleBinFolder' };
// 담기면 파일이 박스 폴더로 옮겨 가 경로가 바뀐다. 이름으로 견준다.
const ALL = [...made.map((item) => item.name), RECYCLE.path].sort();

function boxed() {
  return baseState({
    fences: [
      fence({ id: 'a', items: [made[0], made[1]] }),
      fence({ id: 'b', x: 600, items: [RECYCLE, made[2]] }),
    ],
  });
}

test('프로그램을 끝내면 담아 둔 항목을 하나도 빼놓지 않고 돌려준다', async () => {
  const { desktop, quit } = await loadMain(boxed());
  await quit();

  const given = desktop.calls.release.at(-1);
  assert.ok(given, '끝낼 때 바탕화면에 돌려주지 않았다');
  // 셸 항목은 파일이 아니라 경로 그대로 간다.
  const names = given.map((at) => (String(at).startsWith('shell:') ? String(at) : path.basename(String(at)))).sort();
  assert.deepEqual(names, ALL, '박스 하나만 돌려주었거나 셸 항목을 빠뜨렸다');
});

test('끝낼 때 바탕화면 모듈에도 끝났다고 알린다', async () => {
  const { desktop, quit } = await loadMain(boxed());
  assert.equal(desktop.calls.shutdown, 0);
  await quit();
  // shutdown 이 탐색기 설정(자동 정렬, 아이콘 영역, 목록 창 크기)을 되돌린다.
  assert.equal(desktop.calls.shutdown, 1, '탐색기 설정을 되돌리지 않았다');
});

test('박스를 숨겨 둔 채 끝내도 담아 둔 항목을 돌려준다', async () => {
  const state = boxed();
  state.hidden = true;
  const { desktop, quit } = await loadMain(state);
  await quit();
  const given = desktop.calls.release.at(-1);
  assert.equal(given.length, 4, '숨긴 상태에서는 돌려주지 않았다');
});

test('박스가 하나도 없어도 끝내는 절차는 끝까지 간다', async () => {
  const { desktop, quit } = await loadMain(baseState({ fences: [] }));
  await quit();
  assert.deepEqual(desktop.calls.release.at(-1), []);
  assert.equal(desktop.calls.shutdown, 1);
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
  assert.match(source, /function nudge\(blocks\)[\s\S]*?homes\.set\(key/, '밀어내기 전 자리를 적어 두지 않는다');
  assert.match(source, /function nudge\(blocks\)[\s\S]*?nudged\.add\(key\)/, '무엇을 밀어냈는지 적어 두지 않는다');
  assert.match(source, /function homeAll\(\)[\s\S]*?nudged\.has\(key\)/, '밀어낸 아이콘을 제자리로 돌리지 않는다');

  // 셸 아이콘을 되돌릴 때 SHCNE_ASSOCCHANGED 를 부르면 아이콘 그림 곳간이 통째로 다시 만들어진다.
  // 그동안 바탕화면은 그림 없이 이름만 그려진다. 바탕화면 보기 새로 고침만 보내야 한다.
  assert.doesNotMatch(source, /SHChangeNotify\(0x08000000/, '아이콘 그림 곳간을 통째로 다시 만들게 한다');
  assert.match(source, /function refreshShellIcons\(\)[\s\S]*?DESKTOP_REFRESH/, '바탕화면 보기를 새로 고치지 않는다');
});

test('이 컴퓨터에서 끝내기 절차를 부를 수 있다', { skip: process.platform !== 'win32' }, () => {
  const desktop = require('../src/main/desktop/windows');
  for (const name of ['release', 'shutdown', 'fileIcon', 'shellItems']) {
    assert.equal(typeof desktop[name], 'function', `${name} 이 없다`);
  }
});

// 앱을 끝내면 바탕화면은 켜기 전 모습으로 돌아가야 한다.
// 파일은 처음부터 옮기지 않으므로, 담으면서 바꿔 둔 아이콘 자리만 되돌리면 된다.
test('끝내도 담아 둔 파일은 있던 자리에 그대로 있다', async () => {
  const room = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mydeskbox-home-'));
  const file = path.join(room, '보고서.txt');
  fs.writeFileSync(file, '내용');

  const state = baseState({ fences: [fence({ title: '일감', items: [{ name: '보고서.txt', path: file }] })] });
  const { desktop, quit } = await loadMain(state);
  assert.equal(state.fences[0].items[0].path, file, '켤 때 파일을 옮겼다');
  assert.equal(fs.existsSync(file), true);

  await quit();

  assert.equal(fs.existsSync(file), true, '끝내면서 파일을 옮겼다');
  assert.equal(fs.readFileSync(file, 'utf8'), '내용', '내용이 달라졌다');
  // 아이콘 자리를 되돌리는 일은 release 와 shutdown 이 한다.
  assert.equal(desktop.calls.release.length > 0, true, '아이콘 자리를 되돌리지 않았다');
  assert.equal(desktop.calls.shutdown, 1);
});

// 박스에 담는 동안에도 바탕화면 폴더의 내용은 바뀌면 안 된다.
test('켜고 끄는 동안 바탕화면 폴더의 내용이 바뀌지 않는다', async () => {
  const desk = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mydeskbox-desk-'));
  const file = path.join(desk, '메모.txt');
  fs.writeFileSync(file, '');
  const before = fs.readdirSync(desk).sort();

  const state = baseState({ fences: [fence({ items: [{ name: '메모.txt', path: file }] })] });
  const { desktop, quit } = await loadMain(state);
  assert.deepEqual(fs.readdirSync(desk).sort(), before, '켜면서 바탕화면 폴더가 바뀌었다');
  assert.equal(desktop.calls.hidden.length, 0, '파일을 감췄다');

  await quit();
  assert.deepEqual(fs.readdirSync(desk).sort(), before, '끝내면서 바탕화면 폴더가 바뀌었다');
});
