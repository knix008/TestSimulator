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

test('바로가기는 바로가기로, 폴더는 폴더로, 휴지통은 휴지통으로 표시한다', async () => {
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
  assert.equal(byName.Work.folder, true);
  assert.equal(byName.Work.shortcut, false);
  assert.equal(byName['Work.lnk'].shortcut, true);
  assert.equal(byName['Work.lnk'].folder, false);
  assert.equal(byName['노트.txt'].shortcut, false);
  assert.equal(byName['노트.txt'].folder, false);
  assert.equal(byName['휴지통'].recycle, true);
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
  assert.equal(fs.existsSync(path.join(place.folder, '노트.txt')), true);
  assert.equal(fs.existsSync(place.note), false);
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['Work']);
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
  assert.equal(fs.existsSync(path.join(place.folder, '노트.txt')), true);
  assert.deepEqual(state.fences[0].items.map((item) => item.path), [place.link]);
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
  assert.equal(fs.existsSync(place.note), true, '휴지통으로 보낸 파일은 테스트에서 지워지지 않는다');
});

test('같은 이름이 이미 있으면 폴더로 넣지 않고 박스에 남긴다', async () => {
  const place = desk();
  fs.writeFileSync(path.join(place.folder, '노트.txt'), 'old');
  const state = baseState({
    fences: [fence({ items: [{ name: '노트.txt', path: place.note }, { name: 'Work', path: place.folder }] })],
  });
  const { host } = loadHost(state);
  await host.dropFiles(state.fences[0].id, [place.note], 0, place.folder);
  assert.equal(fs.readFileSync(path.join(place.folder, '노트.txt'), 'utf8'), 'old');
  assert.equal(fs.existsSync(place.note), true);
  assert.equal(state.fences[0].items.some((item) => item.path === place.note), true);
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
  assert.equal(fs.existsSync(place.note), true);
});
