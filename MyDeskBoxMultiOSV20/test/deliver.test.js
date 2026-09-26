'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const deliver = require('../src/shared/deliver');
const { loadHost, fence, baseState, fenceWindows } = require('./helpers/fakes');

function desk() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-drop-'));
  const folder = path.join(root, 'Work');
  fs.mkdirSync(folder);
  const note = path.join(root, '노트.txt');
  fs.writeFileSync(note, 'hello');
  const link = path.join(root, 'Work.lnk');
  fs.writeFileSync(link, 'link');
  return { root, folder, note, link };
}

test('그림 위에 놓으면 그 항목으로 보내고, 사이는 밀어 배열한다', () => {
  assert.equal(deliver.onPicture(20, 24), true);
  assert.equal(deliver.onPicture(70, 24), false);
  assert.equal(deliver.onPicture(20, 70), false);
  assert.equal(deliver.onPicture(2, 20), false);
});

test('바로가기와 휴지통을 가려 낸다', () => {
  assert.equal(deliver.isShortcut('C:/Desktop/Chrome.lnk'), true);
  assert.equal(deliver.isShortcut('C:/Desktop/사이트.url'), true);
  assert.equal(deliver.isShortcut('C:/Desktop/앱.desktop'), true);
  assert.equal(deliver.isShortcut('C:/Desktop/노트.txt'), false);
  assert.equal(deliver.isRecycle('shell:RecycleBinFolder'), true);
  assert.equal(deliver.isRecycle('shell:MyComputerFolder'), false);
});

test('폴더와 폴더 바로가기에는 파일을 넣고, 휴지통에는 버린다', () => {
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/Work', directory: true }), 'folder');
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/Work.lnk', shortcutDir: 'C:/Work' }), 'folder');
  assert.equal(deliver.receiveKind({ path: 'shell:RecycleBinFolder' }), 'trash');
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/Chrome.lnk' }), 'hand');
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/노트.txt' }), '');
  assert.equal(deliver.receiveKind(null), '');
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/Work.lnk', shortcutDir: '' }), 'hand');
});

test('프로그램 바로가기는 올린 파일을 입력으로 받아 실행된다', () => {
  const plan = deliver.handPlan(
    { target: 'C:/Program Files/Editor/edit.exe', args: '/A "my opt"', cwd: 'C:/Work' },
    'C:/Desktop/노트.txt'
  );
  assert.equal(plan.command, 'C:/Program Files/Editor/edit.exe');
  assert.deepEqual(plan.args, ['/A', 'my opt', 'C:/Desktop/노트.txt']);
  assert.equal(plan.cwd, 'C:/Work');
  assert.equal(deliver.handPlan({ target: '' }, 'C:/Desktop/노트.txt'), null);
  assert.equal(deliver.handPlan(null, 'C:/Desktop/노트.txt'), null);
});

test('프로그램 바로가기 위에 놓으면 그 프로그램이 파일을 열고, 파일은 박스에 남는다', { skip: process.platform !== 'win32' }, async () => {
  const place = desk();
  const appLink = path.join(place.root, 'Editor.lnk');
  fs.writeFileSync(appLink, 'link');
  const state = baseState({
    fences: [fence({
      items: [
        { name: 'Editor.lnk', path: appLink },
        { name: '노트.txt', path: place.note },
      ],
    })],
  });
  const { host, electron } = loadHost(state);
  electron.shell.links.set(appLink, {
    target: 'C:/Program Files/Editor/edit.exe',
    args: '/nologo',
    cwd: place.root,
  });
  electron.shell.launch = (plan) => {
    electron.shell.launched = electron.shell.launched || [];
    electron.shell.launched.push(plan);
  };
  await host.transfer('a', place.note, 0, 0, appLink);
  assert.deepEqual(electron.shell.launched, [{
    command: 'C:/Program Files/Editor/edit.exe',
    args: ['/nologo', place.note],
    cwd: place.root,
  }]);
  assert.equal(fs.existsSync(place.note), true);
  assert.equal(state.fences[0].items.some((item) => item.path === place.note), true);
});

// 아이콘 그림은 이제 탐색기가 박스 위에 직접 그린다. 우리는 종류만 알면 된다.
// 메뉴가 휴지통 비우기를 보여 줄지, 바로가기로 다룰지를 이 값으로 고른다.
test('담긴 항목의 종류를 알려 준다', async () => {
  const place = desk();
  const state = baseState({
    fences: [fence({
      items: [
        { name: 'Work', path: place.folder },
        { name: 'Work.lnk', path: place.link },
        { name: '노트.txt', path: place.note },
        { name: '휴지통', path: 'shell:RecycleBinFolder' },
      ],
    })],
  });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  await host.push(state.fences[0].id);
  const shown = fenceWindows(electron)[0].messages('fence:state').at(-1).items;
  const byName = Object.fromEntries(shown.map((item) => [item.name, item]));
  assert.equal(byName.Work.shortcut, false);
  assert.equal(byName['Work.lnk'].shortcut, true);
  assert.equal(byName['노트.txt'].shortcut, false);
  assert.equal(byName['휴지통'].recycle, true);
  assert.equal(byName['노트.txt'].recycle, false);
});

test('파일을 폴더 위에 놓으면 그 폴더로 들어가고 박스에서는 빠진다', async () => {
  const place = desk();
  const state = baseState({
    fences: [fence({
      items: [
        { name: 'Work', path: place.folder },
        { name: '노트.txt', path: place.note },
      ],
    })],
  });
  const { host } = loadHost(state);
  await host.dropFiles(state.fences[0].id, [place.note], 0, place.folder);
  // 박스에 남은 것은 Work 폴더 하나이고, 그 폴더는 박스 폴더로 옮겨 가 있다.
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['Work']);
  const work = state.fences[0].items[0].path;
  assert.equal(fs.existsSync(path.join(work, '노트.txt')), true, '놓은 파일이 그 폴더에 없다');
  assert.equal(fs.existsSync(place.note), false, '원래 자리에 그대로 남아 있다');
});

test('폴더를 가리키는 바로가기 위에 놓아도 그 폴더로 들어간다', { skip: process.platform !== 'win32' }, async () => {
  const place = desk();
  const state = baseState({
    fences: [fence({
      items: [
        { name: 'Work.lnk', path: place.link },
        { name: '노트.txt', path: place.note },
      ],
    })],
  });
  const { host, electron } = loadHost(state);
  electron.shell.links.set(place.link, { target: place.folder });
  await host.transfer('a', place.note, 0, 0, place.link);
  assert.equal(fs.existsSync(path.join(place.folder, '노트.txt')), true, '바로가기가 가리키는 폴더로 들어가지 않았다');
  // 바로가기는 박스에 남는다. 다만 자리는 박스 폴더 안이다.
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['Work.lnk']);
});

test('파일을 휴지통 위에 놓으면 버리고 박스에서는 빠진다', async () => {
  const place = desk();
  const state = baseState({
    fences: [fence({
      items: [
        { name: '휴지통', path: 'shell:RecycleBinFolder' },
        { name: '노트.txt', path: place.note },
      ],
    })],
  });
  const { host, electron } = loadHost(state);
  await host.dropFiles(state.fences[0].id, [place.note], 0, 'shell:RecycleBinFolder');
  assert.deepEqual(electron.shell.trashed, [place.note]);
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['휴지통']);
  assert.equal(fs.existsSync(place.note), false, '휴지통으로 보냈는데 그 자리에 남아 있다');
});

test('같은 이름이 이미 있으면 폴더로 넣지 않고 박스에 남긴다', async () => {
  const place = desk();
  fs.writeFileSync(path.join(place.folder, '노트.txt'), 'old');
  const state = baseState({
    fences: [fence({ items: [{ name: '노트.txt', path: place.note }, { name: 'Work', path: place.folder }] })],
  });
  const { host } = loadHost(state);
  await host.dropFiles(state.fences[0].id, [place.note], 0, place.folder);
  // 같은 이름이 이미 있으면 덮지 않는다. 놓으려던 파일은 박스에 그대로 남는다.
  const work = state.fences[0].items.find((item) => item.name === 'Work');
  assert.equal(fs.readFileSync(path.join(work.path, '노트.txt'), 'utf8'), 'old');
  assert.equal(state.fences[0].items.some((item) => item.name === '노트.txt'), true);
  const note = state.fences[0].items.find((item) => item.name === '노트.txt');
  assert.equal(fs.existsSync(note.path), true, '박스에 남은 파일이 사라졌다');
});

test('항목을 자기 위에 놓으면 그대로 둔다', async () => {
  const place = desk();
  const state = baseState({
    fences: [fence({ items: [{ name: '노트.txt', path: place.note }] })],
  });
  const { host, electron } = loadHost(state);
  host.openAll();
  await host.transfer('a', place.note, 150, 150, place.note);
  assert.equal(electron.shell.trashed.length, 0);
  assert.equal(state.fences[0].items.length, 1);
  assert.equal(fs.existsSync(state.fences[0].items[0].path), true, '제자리에 놓았는데 파일이 사라졌다');
});

// 폴더도 바로가기도 휴지통도 아닌 항목 위에 놓으면, 그 항목을 실행하며 놓은 파일을 넘긴다.
test('그 밖의 항목에는 파일을 입력으로 넘긴다', () => {
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/tool.exe' }, 'linux'), 'hand', '프로그램 파일은 어디서나 받는다');
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/노트.txt' }, 'win32'), 'hand', 'Windows 는 셸이 넘겨 준다');
  assert.equal(deliver.receiveKind({ path: '/home/me/노트.txt' }, 'linux'), '', '넘길 프로그램을 모르는데 받는다고 한다');
  assert.equal(deliver.receiveKind({ path: '/Applications/Edit.app' }, 'darwin'), 'hand');
  assert.equal(deliver.isRunnable('C:/Desktop/tool.exe'), true);
  assert.equal(deliver.isRunnable('C:/Desktop/노트.txt'), false);
});

test('프로그램 파일은 그대로 부르고, 문서는 운영체제에 맡긴다', () => {
  assert.deepEqual(
    deliver.openPlan('C:/Tools/tool.exe', 'C:/Desktop/노트.txt', 'win32'),
    { command: 'C:/Tools/tool.exe', args: ['C:/Desktop/노트.txt'] }
  );
  assert.deepEqual(
    deliver.openPlan('C:/Desktop/보고서.docx', 'C:/Desktop/노트.txt', 'win32'),
    { command: 'cmd', args: ['/c', 'start', '', 'C:/Desktop/보고서.docx', 'C:/Desktop/노트.txt'] }
  );
  assert.deepEqual(
    deliver.openPlan('/Applications/Edit.app', '/Users/me/노트.txt', 'darwin'),
    { command: 'open', args: ['-a', '/Applications/Edit.app', '/Users/me/노트.txt'] }
  );
  assert.equal(deliver.openPlan('/home/me/노트.txt', '/home/me/그림.png', 'linux'), null);
  assert.equal(deliver.openPlan('', 'C:/Desktop/노트.txt', 'win32'), null);
  assert.equal(deliver.openPlan('C:/Tools/tool.exe', '', 'win32'), null);
});

test('프로그램 파일 위에 놓으면 그 프로그램이 파일을 열고, 파일은 박스에 남는다', async () => {
  const place = desk();
  const tool = path.join(place.root, 'tool.exe');
  fs.writeFileSync(tool, 'exe');
  const state = baseState({
    fences: [fence({
      items: [
        { name: 'tool.exe', path: tool },
        { name: '노트.txt', path: place.note },
      ],
    })],
  });
  const { host, electron } = loadHost(state);
  const launched = [];
  electron.shell.launch = (plan) => launched.push(plan);

  await host.transfer('a', place.note, 0, 0, tool);

  assert.deepEqual(launched, [{ command: tool, args: [place.note] }]);
  assert.equal(fs.existsSync(place.note), true, '넘겨주기만 하면 파일은 그대로 있어야 한다');
  assert.equal(state.fences[0].items.some((item) => item.path === place.note), true, '박스에서 빠졌다');
});

test('탐색기에서 프로그램 위에 놓으면 넘겨주기만 하고 박스에 담지 않는다', async () => {
  const place = desk();
  const tool = path.join(place.root, 'tool.exe');
  fs.writeFileSync(tool, 'exe');
  const state = baseState({ fences: [fence({ items: [{ name: 'tool.exe', path: tool }] })] });
  const { host, electron } = loadHost(state);
  const launched = [];
  electron.shell.launch = (plan) => launched.push(plan);

  await host.dropFiles('a', [place.note], 0, tool);

  assert.equal(launched.length, 1, '프로그램에 넘기지 않았다');
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['tool.exe'], '넘겨준 파일을 박스에 담았다');
  assert.equal(fs.existsSync(place.note), true, '넘겨준 파일을 옮겼다');
});

// Node 는 .bat 과 .cmd 를 직접 띄우지 못한다. 셸을 거쳐야 한다.
test('일괄 파일은 셸을 거쳐 넘긴다', () => {
  assert.equal(deliver.isRunnable('C:/Desktop/할일.bat'), false);
  assert.deepEqual(
    deliver.openPlan('C:/Desktop/할일.bat', 'C:/Desktop/노트.txt', 'win32'),
    { command: 'cmd', args: ['/c', 'start', '', 'C:/Desktop/할일.bat', 'C:/Desktop/노트.txt'] }
  );
});
