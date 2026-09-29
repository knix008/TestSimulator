'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const deliver = require('../src/shared/deliver');
const arrange = require('../src/shared/arrange');
const { loadHost, fence, baseState, fenceWindows } = require('./helpers/fakes');

// fence() 가 주는 박스의 자리와 크기. 아래 셈은 이 값을 딛고 선다.
const BOX = { x: 100, y: 100, w: 400, h: 300 };

// 박스 안 n 번째 칸의 그림 한가운데(화면 좌표).
// 여기서 손을 떼면 그 항목 위에 놓은 것이다. 끌고 있던 항목은 목록에서 빠지므로
// n 은 그 항목을 뺀 뒤의 차례이다.
function onPicture(index, box = BOX) {
  const spot = arrange.slotPoint(index, arrange.gridOf(box.w, box.h, false));
  return {
    x: box.x + spot.x + Math.round((deliver.PICTURE.left + deliver.PICTURE.right) / 2),
    y: box.y + spot.y + Math.round((deliver.PICTURE.top + deliver.PICTURE.bottom) / 2),
  };
}

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

test('받아 주는 자리가 눈에 보이는 그림과 맞는다', () => {
  // .icon 은 86픽셀 폭에 좌우 4픽셀 여백, 위 8픽셀 여백, 그림은 44×44 가운데 정렬.
  // 그래서 그림은 가로 21..65, 세로 8..52 에 놓인다. 받아 주는 자리는 여기에 맞고,
  // 겨누기 쉽도록 둘레로 조금 더 넓혔을 뿐이어야 한다.
  const art = { left: 21, right: 65, top: 8, bottom: 52 };
  const { PICTURE } = deliver;
  assert.ok(PICTURE.left <= art.left && PICTURE.right >= art.right, `그림 ${art.left}..${art.right} 중 ${PICTURE.left}..${PICTURE.right} 만 받는다`);
  assert.ok(PICTURE.top <= art.top && PICTURE.bottom >= art.bottom, '그림의 위아래를 다 받지 않는다');

  // 그림 안이면 어디를 겨눠도 받는다. 가운데만 되는 것이 아니다.
  for (const x of [art.left, 32, 43, 54, art.right]) {
    for (const y of [art.top, 20, 30, 40, art.bottom]) {
      assert.equal(deliver.onPicture(x, y), true, `그림 안 (${x}, ${y}) 을 받지 않는다`);
    }
  }

  // 칸 좌우 끝과 글자 줄은 '사이에 끼우기' 로 남겨 둔다.
  for (const [x, y] of [[0, 30], [8, 30], [78, 30], [85, 30], [43, 60], [43, 80]]) {
    assert.equal(deliver.onPicture(x, y), false, `(${x}, ${y}) 에서는 끼워 넣을 수 없다`);
  }

  // 끼워 넣을 자리가 칸마다 좌우로 넉넉히 남아 있어야 한다.
  assert.ok(PICTURE.left >= 12, '왼쪽에 끼워 넣을 자리가 없다');
  assert.ok(arrange.CELL_W - PICTURE.right >= 12, '오른쪽에 끼워 넣을 자리가 없다');
});

test('칸 크기가 바뀌면 받아 주는 자리도 함께 고쳐야 한다', () => {
  // deliver.js 의 PICTURE 는 arrange.js 의 칸 크기와 fence.css 의 값을 셈해 둔 것이다.
  // 한쪽만 바뀌면 그림과 받아 주는 자리가 다시 어긋난다.
  assert.equal(arrange.CELL_W, 86, 'deliver.js 의 셈을 함께 고쳐야 한다');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'fence.css'), 'utf8');
  assert.match(css, /\.icon \{[^}]*width: 86px;[^}]*padding: 8px 4px 0;/s, '.icon 의 크기나 여백이 바뀌었다');
  assert.match(css, /\.icon img \{[^}]*width: 44px;/s, '.icon img 의 크기가 바뀌었다');
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
  electron.shell.launch = (plan) => {
    electron.shell.launched = electron.shell.launched || [];
    electron.shell.launched.push(plan);
  };
  // 박스를 띄우면 담긴 것이 박스 폴더로 옮겨 간다. 그 뒤의 자리로 견준다.
  host.openAll();
  const held = (name) => state.fences[0].items.find((item) => item.name === name).path;
  const link = held('Editor.lnk');
  const note = held('노트.txt');
  electron.shell.links.set(link, {
    target: 'C:/Program Files/Editor/edit.exe',
    args: '/nologo',
    cwd: place.root,
  });

  // 끌고 있던 노트를 뺀 첫 칸이 Editor.lnk 다. 그 그림 위에서 손을 뗀다.
  const spot = onPicture(0);
  await host.transfer('a', note, spot.x, spot.y);

  assert.deepEqual(electron.shell.launched, [{
    command: 'C:/Program Files/Editor/edit.exe',
    args: ['/nologo', note],
    cwd: place.root,
  }]);
  assert.equal(fs.existsSync(note), true);
  assert.equal(state.fences[0].items.some((item) => item.path === note), true);
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

test('폴더를 다른 폴더 위에 놓으면 그 안으로 들어가고 박스에서는 빠진다', async () => {
  const place = desk();
  const bundle = path.join(place.root, '묶음');
  fs.mkdirSync(bundle);
  fs.writeFileSync(path.join(bundle, '안.txt'), 'in');
  const state = baseState({
    fences: [fence({
      items: [
        { name: 'Work', path: place.folder },
        { name: '묶음', path: bundle },
      ],
    })],
  });
  const { host } = loadHost(state);
  await host.dropFiles(state.fences[0].id, [bundle], 0, place.folder);
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['Work']);
  const work = state.fences[0].items[0].path;
  assert.equal(fs.existsSync(path.join(work, '묶음', '안.txt')), true, '폴더가 그 안으로 들어가지 않았다');
  assert.equal(fs.existsSync(bundle), false, '원래 자리에 폴더가 남아 있다');
});

// 이름 바꾸기가 거절되는 것만 흉내 낸 검사와 달리, 이쪽은 디스크를 실제로 건넌다.
// 바탕화면이 C: 이고 폴더 바로가기가 D: 를 가리키는 경우가 그것이다.
function otherPlace(from) {
  if (process.platform !== 'win32') return '';
  const mine = path.parse(path.resolve(from)).root.toLowerCase();
  const candidates = [];
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const root = `${letter}:\\`;
    if (root.toLowerCase() === mine) continue;
    candidates.push(path.join(root, 'Home'), root);
  }
  for (const dir of candidates) {
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
      const probe = fs.mkdtempSync(path.join(dir, 'mdb-probe-'));
      fs.rmSync(probe, { recursive: true, force: true });
      return dir;
    } catch (_err) {
      /* 쓸 수 없는 드라이브는 다음 것을 본다. */
    }
  }
  return '';
}

test('실제로 다른 드라이브의 폴더와 그 바로가기에 넣는다', { skip: process.platform !== 'win32' }, async (t) => {
  const place = desk();
  const sinkRoot = otherPlace(place.root);
  if (!sinkRoot) {
    t.skip('쓸 수 있는 다른 드라이브가 없다');
    return;
  }
  const sink = fs.mkdtempSync(path.join(sinkRoot, 'mdb-drop-'));
  const work = path.join(sink, 'Work');
  fs.mkdirSync(work);
  const bundle = path.join(place.root, '묶음');
  fs.mkdirSync(bundle);
  fs.writeFileSync(path.join(bundle, '안.txt'), 'in');
  try {
    const folderState = baseState({
      fences: [fence({ items: [{ name: '묶음', path: bundle }] })],
    });
    const folderHost = loadHost(folderState);
    await folderHost.host.dropFiles(folderState.fences[0].id, [bundle], 0, work);
    assert.equal(fs.existsSync(path.join(work, '묶음', '안.txt')), true, '폴더가 다른 드라이브로 들어가지 않았다');
    assert.equal(fs.existsSync(bundle), false, '원래 폴더가 남아 있다');
    assert.deepEqual(folderState.fences[0].items, [], '넣은 폴더가 박스에 남았다');

    const linkState = baseState({
      fences: [fence({
        items: [
          { name: 'Work.lnk', path: place.link },
          { name: '노트.txt', path: place.note },
        ],
      })],
    });
    const linkHost = loadHost(linkState);
    linkHost.electron.shell.links.set(place.link, { target: work });
    await linkHost.host.dropFiles(linkState.fences[0].id, [place.note], 0, place.link);
    assert.equal(fs.readFileSync(path.join(work, '노트.txt'), 'utf8'), 'hello', '바로가기가 가리키는 폴더로 들어가지 않았다');
    assert.equal(fs.existsSync(place.note), false, '바로가기에 넣은 파일이 원래 자리에 남았다');
    assert.deepEqual(linkState.fences[0].items.map((item) => item.name), ['Work.lnk'], '바로가기 자체가 빠졌다');
  } finally {
    fs.rmSync(sink, { recursive: true, force: true });
  }
});

test('다른 드라이브의 폴더로 넣어도 죽지 않고 폴더가 들어간다', async () => {
  const place = desk();
  const bundle = path.join(place.root, '묶음');
  fs.mkdirSync(bundle);
  fs.writeFileSync(path.join(bundle, '안.txt'), 'in');
  const state = baseState({
    fences: [fence({
      items: [
        { name: 'Work', path: place.folder },
        { name: '묶음', path: bundle },
      ],
    })],
  });
  const { host } = loadHost(state);
  const rename = fs.promises.rename;
  fs.promises.rename = async () => {
    const err = new Error('EXDEV: cross-device link not permitted');
    err.code = 'EXDEV';
    throw err;
  };
  try {
    await host.dropFiles(state.fences[0].id, [bundle], 0, place.folder);
  } finally {
    fs.promises.rename = rename;
  }
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['Work']);
  const work = state.fences[0].items[0].path;
  assert.equal(fs.existsSync(path.join(work, '묶음', '안.txt')), true, '드라이브를 건너지 못했다');
  assert.equal(fs.existsSync(bundle), false, '복사만 하고 원래 폴더를 남겼다');
});

test('파일을 휴지통에 넣어도 프로세스가 죽지 않고 그 자리에서 사라진다', { skip: process.platform !== 'win32' }, async () => {
  const electron = require('electron');
  assert.equal(typeof electron, 'string', 'electron 실행 파일을 찾지 못했다');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdb-trash-'));
  const file = path.join(dir, '노트.txt');
  fs.writeFileSync(file, 'bye');
  const script = path.join(dir, 'trash.js');
  fs.writeFileSync(script, `'use strict';
const { app, shell } = require('electron');
const fs = require('fs');
const file = ${JSON.stringify(file)};
app.whenReady().then(async () => {
  try {
    await shell.trashItem(file);
    console.log(fs.existsSync(file) ? 'STILL' : 'GONE');
    app.exit(0);
  } catch (err) {
    console.error(err && err.stack || err);
    app.exit(2);
  }
});
`);
  const { spawn } = require('child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = await new Promise((resolve, reject) => {
    const child = spawn(electron, [script], { env });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out }));
  });
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /GONE/, result.out);
  assert.equal(fs.existsSync(file), false, '휴지통으로 보냈는데 파일이 남아 있다');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('휴지통이 거절해도 앱이 죽지 않고 파일은 그대로 남는다', async () => {
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
  electron.shell.trashItem = async () => {
    throw new Error('locked');
  };
  await host.dropFiles(state.fences[0].id, [place.note], 0, 'shell:RecycleBinFolder');
  assert.equal(fs.existsSync(place.note), true, '버리지 못했는데 파일이 사라졌다');
  assert.equal(state.fences[0].items.some((item) => item.path === place.note), true, '실패했는데 박스에서 빠졌다');
});

test('없는 프로그램에 넘겨도 앱이 죽지 않고 파일은 박스에 남는다', async () => {
  const place = desk();
  const missing = path.join(place.root, '없는 프로그램.exe');
  // 파일은 있으나 실행할 수 없는 것이다. 띄우기가 실패해도 앱이 죽으면 안 된다.
  fs.writeFileSync(missing, 'not a program');
  const state = baseState({
    fences: [fence({
      items: [
        { name: '없는 프로그램.exe', path: missing },
        { name: '노트.txt', path: place.note },
      ],
    })],
  });
  const { host } = loadHost(state);
  host.openAll();
  const held = (name) => state.fences[0].items.find((item) => item.name === name).path;
  await host.transfer('a', held('노트.txt'), onPicture(0).x, onPicture(0).y);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const note = held('노트.txt');
  assert.equal(fs.existsSync(note), true, '넘기지 못했는데 파일이 사라졌다');
  assert.equal(state.fences[0].items.some((item) => item.path === note), true);
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
  host.openAll();
  const held = (name) => state.fences[0].items.find((item) => item.name === name).path;
  electron.shell.links.set(held('Work.lnk'), { target: place.folder });

  const spot = onPicture(0);
  await host.transfer('a', held('노트.txt'), spot.x, spot.y);

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
  const spot = onPicture(0);
  await host.transfer('a', place.note, spot.x, spot.y);
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
  host.openAll();
  const held = (name) => state.fences[0].items.find((item) => item.name === name).path;
  const inBox = held('tool.exe');
  const note = held('노트.txt');

  const spot = onPicture(0);
  await host.transfer('a', note, spot.x, spot.y);

  assert.deepEqual(launched, [{ command: inBox, args: [note] }]);
  assert.equal(fs.existsSync(note), true, '넘겨주기만 하면 파일은 그대로 있어야 한다');
  assert.equal(state.fences[0].items.some((item) => item.path === note), true, '박스에서 빠졌다');
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

// ── 어디서 끌어 왔든 같은 자리에 놓을 수 있어야 한다 ───────────────────────
//
// 받을 항목을 고르는 일은 메인이 한다. 창이 제 안에서만 하면 제 창 밖은 알 수 없어,
// 다른 박스나 바탕화면에서 끌어 온 것은 아무리 겨눠도 받아 주지 못했다.

const FAR = { x: 700, y: 100, w: 400, h: 300 };

function twoBoxes(near, far) {
  const state = baseState({
    fences: [
      fence({ id: 'a', ...BOX, items: near }),
      fence({ id: 'b', ...FAR, items: far }),
    ],
  });
  const loaded = loadHost(state);
  loaded.host.openAll();
  return { ...loaded, state };
}

test('다른 박스의 폴더 위에 놓아도 그 폴더로 들어간다', async () => {
  const place = desk();
  const { host, state } = twoBoxes(
    [{ name: '노트.txt', path: place.note }],
    [{ name: 'Work', path: place.folder }]
  );
  const note = state.fences[0].items[0].path;
  const work = state.fences[1].items[0].path;

  const spot = onPicture(0, FAR);
  await host.transfer('a', note, spot.x, spot.y);

  assert.equal(fs.existsSync(path.join(work, '노트.txt')), true, '건너간 폴더로 들어가지 않았다');
  assert.deepEqual(state.fences[0].items, [], '보낸 박스에 그대로 남았다');
  assert.deepEqual(state.fences[1].items.map((item) => item.name), ['Work'], '폴더 옆에 나란히 담겼다');
});

test('다른 박스의 휴지통 위에 놓으면 버린다', async () => {
  const place = desk();
  const { host, electron, state } = twoBoxes(
    [{ name: '노트.txt', path: place.note }],
    [{ name: '휴지통', path: 'shell:RecycleBinFolder' }]
  );
  const note = state.fences[0].items[0].path;

  const spot = onPicture(0, FAR);
  await host.transfer('a', note, spot.x, spot.y);

  assert.deepEqual(electron.shell.trashed, [note]);
  assert.deepEqual(state.fences[0].items, [], '버렸는데 박스에 남아 있다');
  assert.deepEqual(state.fences[1].items.map((item) => item.name), ['휴지통'], '휴지통 옆에 담겼다');
});

test('다른 박스의 빈 자리에 놓으면 그 박스에 담긴다', async () => {
  const place = desk();
  const { host, state } = twoBoxes(
    [{ name: '노트.txt', path: place.note }],
    [{ name: 'Work', path: place.folder }]
  );
  const note = state.fences[0].items[0].path;
  const work = state.fences[1].items[0].path;

  // 폴더의 그림이 아니라 그 오른쪽 칸(빈 자리)에 놓는다.
  const spot = onPicture(1, FAR);
  await host.transfer('a', note, spot.x, spot.y);

  assert.equal(fs.existsSync(path.join(work, '노트.txt')), false, '빈 자리에 놓았는데 폴더로 들어갔다');
  assert.deepEqual(state.fences[1].items.map((item) => item.name), ['Work', '노트.txt']);
});

test('칸의 가장자리에 놓으면 받아 주지 않고 사이에 끼운다', async () => {
  const place = desk();
  const { host, state } = twoBoxes(
    [{ name: '노트.txt', path: place.note }],
    [{ name: 'Work', path: place.folder }]
  );
  const note = state.fences[0].items[0].path;
  const work = state.fences[1].items[0].path;

  // 폴더 칸의 왼쪽 끝. 그림 밖이므로 폴더가 받지 않는다.
  const slot = arrange.slotPoint(0, arrange.gridOf(FAR.w, FAR.h, false));
  await host.transfer('a', note, FAR.x + slot.x + 2, FAR.y + slot.y + 28);

  assert.equal(fs.existsSync(path.join(work, '노트.txt')), false, '가장자리인데 폴더가 받았다');
  assert.equal(state.fences[1].items.length, 2, '박스에 담기지도 않았다');
});

test('휴지통에 이미 버린 것이 있으면 창에 놓은 바탕화면 파일도 박스에 담는다', async () => {
  const place = desk();
  const state = baseState({
    fences: [fence({ ...BOX, items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron, desktop, asks } = loadHost(state);
  desktop.module.recycleCount = () => 2;
  host.openAll();

  await host.dropFiles('a', [place.note], 0, 'shell:RecycleBinFolder');

  assert.equal(asks.calls.length, 0, '휴지통에 있던 것을 바꿀지 물었다');
  assert.deepEqual(electron.shell.trashed, [], '휴지통에 있던 것을 바꾸려 했다');
  assert.equal(state.fences[0].items.some((item) => item.name === '노트.txt'), true, '새 항목을 박스에 담지 않았다');
  assert.equal(state.fences[0].items.some((item) => item.path === 'shell:RecycleBinFolder'), true);
});

test('휴지통에 이미 버린 것이 있으면 바탕화면에서 끌어 온 항목은 박스에 담는다', async () => {
  const place = desk();
  const state = baseState({
    fences: [fence({ ...BOX, items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron, desktop, asks } = loadHost(state);
  desktop.module.recycleCount = () => 3;
  host.openAll();

  const spot = onPicture(0);
  await host.acceptDesktopDrop({ name: '노트.txt', path: place.note }, spot);

  assert.equal(asks.calls.length, 0, '휴지통에 있던 것을 바꿀지 물었다');
  assert.deepEqual(electron.shell.trashed, [], '휴지통에 있던 것을 바꾸려 했다');
  assert.equal(state.fences[0].items.some((item) => item.path === 'shell:RecycleBinFolder'), true, '휴지통이 박스에서 빠졌다');
  assert.equal(state.fences[0].items.some((item) => item.name === '노트.txt'), true, '새 항목을 박스에 담지 않았다');
  assert.equal(fs.existsSync(place.note), false, '바탕화면 파일이 박스 폴더로 옮겨 가지 않았다');
});

test('바탕화면에서 끌어 온 것도 박스 안 휴지통이 받는다', async () => {
  const place = desk();
  const state = baseState({
    fences: [fence({ ...BOX, items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron } = loadHost(state);
  host.openAll();

  const spot = onPicture(0);
  await host.acceptDesktopDrop({ name: '노트.txt', path: place.note }, spot);

  assert.deepEqual(electron.shell.trashed, [place.note], '바탕화면에서 끌어 온 것을 버리지 않았다');
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['휴지통'], '버린 것을 박스에 담았다');
});

test('바탕화면에서 끌어 온 것도 박스 안 폴더가 받는다', async () => {
  const place = desk();
  const state = baseState({
    fences: [fence({ ...BOX, items: [{ name: 'Work', path: place.folder }] })],
  });
  const { host } = loadHost(state);
  host.openAll();
  const work = state.fences[0].items[0].path;

  const spot = onPicture(0);
  await host.acceptDesktopDrop({ name: '노트.txt', path: place.note }, spot);

  assert.equal(fs.existsSync(path.join(work, '노트.txt')), true, '폴더로 들어가지 않았다');
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['Work'], '폴더 옆에 따로 담겼다');
});

test('바탕화면에서 끌어 온 것을 빈 자리에 놓으면 그냥 담는다', async () => {
  const place = desk();
  const state = baseState({
    fences: [fence({ ...BOX, items: [{ name: 'Work', path: place.folder }] })],
  });
  const { host } = loadHost(state);
  host.openAll();
  const work = state.fences[0].items[0].path;

  await host.acceptDesktopDrop({ name: '노트.txt', path: place.note }, onPicture(1));

  assert.equal(fs.existsSync(path.join(work, '노트.txt')), false, '빈 자리인데 폴더로 들어갔다');
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['Work', '노트.txt']);
});

test('끌고 가는 동안 어느 항목이 받을지 그 박스에 알려 준다', () => {
  const place = desk();
  const { host, electron, state } = twoBoxes(
    [{ name: '노트.txt', path: place.note }],
    [{ name: 'Work', path: place.folder }]
  );
  const note = state.fences[0].items[0].path;
  const work = state.fences[1].items[0].path;
  const far = fenceWindows(electron).find((win) => win.loaded.opts.query.id === 'b');

  // 폴더의 그림 위.
  const on = onPicture(0, FAR);
  host.hover(note, on.x, on.y, '');
  assert.equal(far.messages('fence:hover').at(-1).into, work, '받을 항목을 알려 주지 않았다');

  // 그 옆 빈 칸.
  const off = onPicture(1, FAR);
  host.hover(note, off.x, off.y, '');
  assert.equal(far.messages('fence:hover').at(-1).into, null, '빈 자리인데 받는다고 알렸다');
});

test('제 자신 위에서는 받는다고 알리지 않는다', () => {
  const place = desk();
  const state = baseState({
    fences: [fence({ ...BOX, items: [{ name: 'Work', path: place.folder }] })],
  });
  const { host, electron } = loadHost(state);
  host.openAll();
  const work = state.fences[0].items[0].path;
  const win = fenceWindows(electron)[0];

  const spot = onPicture(0);
  host.hover(work, spot.x, spot.y, '');

  assert.equal(win.messages('fence:hover').at(-1).into, null, '제 자신에게 넣으려 든다');
});

test('박스를 내려 본 상태에서도 눈에 보이는 항목이 받는다', async () => {
  const place = desk();
  // 400픽셀 폭이면 한 줄에 네 칸이다. 폴더는 둘째 줄 첫 칸에 둔다.
  const fillers = ['가.txt', '나.txt', '다.txt', '라.txt'].map((name) => {
    const at = path.join(place.root, name);
    fs.writeFileSync(at, name);
    return { name, path: at };
  });
  const { host, state } = twoBoxes(
    [...fillers, { name: 'Work', path: place.folder }],
    [{ name: '노트.txt', path: place.note }]
  );
  const grid = arrange.gridOf(BOX.w, BOX.h, false);
  assert.equal(grid.cols, 4, '한 줄에 네 칸이라는 앞선 셈이 어긋났다');
  const work = state.fences[0].items[4].path;
  const note = state.fences[1].items[0].path;

  // 한 줄만큼 내려 보면 둘째 줄의 폴더가 첫 줄 자리에 와 있다.
  host.setScroll('a', grid.cellH);
  const spot = onPicture(0, BOX);
  await host.transfer('b', note, spot.x, spot.y);

  assert.equal(
    fs.existsSync(path.join(work, '노트.txt')),
    true,
    '내려 본 만큼을 셈에 넣지 않아 엉뚱한 항목이 받았다'
  );
});
