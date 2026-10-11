'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const deliver = require('../src/shared/deliver');
const arrange = require('../src/shared/arrange');
const { loadHost, fence, baseState, fenceWindows } = require('./helpers/fakes');

// Position and size of the box that fence() creates. The math below relies on these values.
const BOX = { x: 100, y: 100, w: 400, h: 300 };

// Center of the icon picture in the nth cell of a box (screen coordinates).
// Releasing here drops onto that item. The dragged item is removed from the list,
// so n is the index after that item is taken out.
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

test('the drop target area matches the visible icon picture', () => {
  // .icon is 86px wide with 4px left/right padding and 8px top padding; the picture is 44x44, centered.
  // So the picture spans x 21..65 and y 8..52. The drop area must cover this,
  // only padded slightly around the edges to make it easier to hit.
  const art = { left: 21, right: 65, top: 8, bottom: 52 };
  const { PICTURE } = deliver;
  assert.ok(PICTURE.left <= art.left && PICTURE.right >= art.right, `only ${PICTURE.left}..${PICTURE.right} of picture ${art.left}..${art.right} accepts drops`);
  assert.ok(PICTURE.top <= art.top && PICTURE.bottom >= art.bottom, 'does not cover the full height of the picture');

  // Anywhere inside the picture accepts, not just the center.
  for (const x of [art.left, 32, 43, 54, art.right]) {
    for (const y of [art.top, 20, 30, 40, art.bottom]) {
      assert.equal(deliver.onPicture(x, y), true, `point (${x}, ${y}) inside the picture is not accepted`);
    }
  }

  // The left/right edges of a cell and the label row are left for "insert between".
  for (const [x, y] of [[0, 30], [8, 30], [78, 30], [85, 30], [43, 60], [43, 80]]) {
    assert.equal(deliver.onPicture(x, y), false, `cannot insert between items at (${x}, ${y})`);
  }

  // Each cell must keep enough room on both sides for inserting between items.
  assert.ok(PICTURE.left >= 12, 'no room on the left to insert between items');
  assert.ok(arrange.CELL_W - PICTURE.right >= 12, 'no room on the right to insert between items');
});

test('the drop area must be updated when the cell size changes', () => {
  // PICTURE in deliver.js is computed from the cell size in arrange.js and the values in fence.css.
  // If only one side changes, the picture and the drop area drift apart again.
  assert.equal(arrange.CELL_W, 86, 'update the math in deliver.js as well');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'fence.css'), 'utf8');
  assert.match(css, /\.icon \{[^}]*width: 86px;[^}]*padding: 8px 4px 0;/s, '.icon size or padding changed');
  assert.match(css, /\.icon img \{[^}]*width: 44px;/s, '.icon img size changed');
});

test('detects shortcuts and the Recycle Bin', () => {
  assert.equal(deliver.isShortcut('C:/Desktop/Chrome.lnk'), true);
  assert.equal(deliver.isShortcut('C:/Desktop/사이트.url'), true);
  assert.equal(deliver.isShortcut('C:/Desktop/앱.desktop'), true);
  assert.equal(deliver.isShortcut('C:/Desktop/노트.txt'), false);
  assert.equal(deliver.isRecycle('shell:RecycleBinFolder'), true);
  assert.equal(deliver.isRecycle('shell:MyComputerFolder'), false);
});

test('folders and folder shortcuts take files in; the Recycle Bin discards them', () => {
  // Drag and drop is a move, so only places that can take a moved file accept it.
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/Work', directory: true }), 'folder');
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/Work.lnk', shortcutDir: 'C:/Work' }), 'folder');
  assert.equal(deliver.receiveKind({ path: 'shell:RecycleBinFolder' }), 'trash');
  assert.equal(deliver.receiveKind(null), '');
  // Programs and documents do not accept drops. Dropping on them just moves the item into that box.
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/Chrome.lnk' }), '');
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/노트.txt' }), '');
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/tool.exe' }), '');
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/Work.lnk', shortcutDir: '' }), '');
});

test('dropping on a program shortcut moves the item there without launching it', { skip: process.platform !== 'win32' }, async () => {
  // Drag and drop is a move. Dropping on a program shortcut does not launch the program.
  // Previously this launched the program and left the file in place, so brushing past
  // an icon while dropping into a box would launch an unrelated program.
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
  const launched = [];
  electron.shell.launch = (plan) => launched.push(plan);
  host.openAll();
  const held = (name) => state.fences[0].items.find((item) => item.name === name).path;
  const link = held('Editor.lnk');
  const note = held('노트.txt');
  electron.shell.links.set(link, {
    target: 'C:/Program Files/Editor/edit.exe',
    args: '/nologo',
    cwd: place.root,
  });

  const spot = onPicture(0);
  await host.transfer('a', note, spot.x, spot.y);

  assert.deepEqual(launched, [], 'launched a program during a move');
  assert.equal(fs.existsSync(note), true, 'the file disappeared');
  assert.equal(state.fences[0].items.some((item) => item.path === note), true, 'removed from the box');
  assert.equal(state.fences[0].items.length, 2, 'the box does not hold two items');
});

// Explorer now draws the icon pictures directly on the box; we only need to know the item kind.
// The menu uses these flags to decide whether to offer "Empty Recycle Bin" or treat it as a shortcut.
test('reports the kind of each held item', async () => {
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

test('dropping a folder on another folder moves it inside and removes it from the box', async () => {
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
  assert.equal(fs.existsSync(path.join(work, '묶음', '안.txt')), true, 'the folder was not moved inside');
  assert.equal(fs.existsSync(bundle), false, 'the folder is still in its original location');
});

// Unlike the test that only simulates a rejected rename, this one actually crosses drives,
// e.g. when the desktop is on C: and a folder shortcut points to D:.
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
      /* If the drive is not writable, try the next one. */
    }
  }
  return '';
}

test('really moves into a folder and its shortcut on another drive', { skip: process.platform !== 'win32' }, async (t) => {
  const place = desk();
  const sinkRoot = otherPlace(place.root);
  if (!sinkRoot) {
    t.skip('no other writable drive available');
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
    assert.equal(fs.existsSync(path.join(work, '묶음', '안.txt')), true, 'the folder was not moved to the other drive');
    assert.equal(fs.existsSync(bundle), false, 'the original folder is still there');
    assert.deepEqual(folderState.fences[0].items, [], 'the moved folder is still in the box');

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
    assert.equal(fs.readFileSync(path.join(work, '노트.txt'), 'utf8'), 'hello', 'the file did not go into the folder the shortcut points to');
    assert.equal(fs.existsSync(place.note), false, 'the file dropped on the shortcut is still in its original location');
    assert.deepEqual(linkState.fences[0].items.map((item) => item.name), ['Work.lnk'], 'the shortcut itself was removed');
  } finally {
    fs.rmSync(sink, { recursive: true, force: true });
  }
});

test('moving into a folder on another drive does not crash and the folder moves', async () => {
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
  assert.equal(fs.existsSync(path.join(work, '묶음', '안.txt')), true, 'could not move across drives');
  assert.equal(fs.existsSync(bundle), false, 'copied but left the original folder behind');
});

test('trashing a file does not crash the process and the file disappears', { skip: process.platform !== 'win32' }, async () => {
  const electron = require('electron');
  assert.equal(typeof electron, 'string', 'could not find the electron executable');
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
  assert.equal(fs.existsSync(file), false, 'the file is still there after being sent to the Recycle Bin');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('if the Recycle Bin refuses, the app does not crash and the file stays', async () => {
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
  assert.equal(fs.existsSync(place.note), true, 'the file disappeared even though trashing failed');
  assert.equal(state.fences[0].items.some((item) => item.path === place.note), true, 'removed from the box even though it failed');
});

test('dropping a file on a folder moves it inside and removes it from the box', async () => {
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
  // Only the Work folder remains in the box, and it has been moved into the box folder.
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['Work']);
  const work = state.fences[0].items[0].path;
  assert.equal(fs.existsSync(path.join(work, '노트.txt')), true, 'the dropped file is not in the folder');
  assert.equal(fs.existsSync(place.note), false, 'the file is still in its original location');
});

test('dropping on a shortcut to a folder moves the file into that folder', { skip: process.platform !== 'win32' }, async () => {
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

  assert.equal(fs.existsSync(path.join(place.folder, '노트.txt')), true, 'the file did not go into the folder the shortcut points to');
  // The shortcut stays in the box, but it now lives inside the box folder.
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['Work.lnk']);
});

test('dropping a file on the Recycle Bin discards it and removes it from the box', async () => {
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
  assert.equal(fs.existsSync(place.note), false, 'the file is still there after being sent to the Recycle Bin');
});

test('a name clash in the folder keeps the file in the box instead', async () => {
  const place = desk();
  fs.writeFileSync(path.join(place.folder, '노트.txt'), 'old');
  const state = baseState({
    fences: [fence({ items: [{ name: '노트.txt', path: place.note }, { name: 'Work', path: place.folder }] })],
  });
  const { host } = loadHost(state);
  await host.dropFiles(state.fences[0].id, [place.note], 0, place.folder);
  // An existing file with the same name is not overwritten; the dropped file stays in the box.
  const work = state.fences[0].items.find((item) => item.name === 'Work');
  assert.equal(fs.readFileSync(path.join(work.path, '노트.txt'), 'utf8'), 'old');
  assert.equal(state.fences[0].items.some((item) => item.name === '노트.txt'), true);
  const note = state.fences[0].items.find((item) => item.name === '노트.txt');
  assert.equal(fs.existsSync(note.path), true, 'the file left in the box disappeared');
});

test('dropping an item on itself leaves it alone', async () => {
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
  assert.equal(fs.existsSync(state.fences[0].items[0].path), true, 'the file disappeared after being dropped in place');
});

// Drag and drop is a move, so a program or document never receives the dropped files.
test('programs and documents do not accept drops; only folders and the Recycle Bin do', () => {
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/tool.exe' }), '');
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/노트.txt' }), '');
  assert.equal(deliver.receiveKind({ path: '/Applications/Edit.app' }), '');
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/할일.bat' }), '');
});

test('dropping on a program file does not launch it and the item stays in the box', async () => {
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
  const note = held('노트.txt');

  const spot = onPicture(0);
  await host.transfer('a', note, spot.x, spot.y);

  assert.deepEqual(launched, [], 'launched a program during a move');
  assert.equal(fs.existsSync(note), true, 'the file disappeared');
  assert.equal(state.fences[0].items.some((item) => item.path === note), true, 'removed from the box');
});

test('dropping from Explorer onto a program adds the file to the box without launching', async () => {
  const place = desk();
  const tool = path.join(place.root, 'tool.exe');
  fs.writeFileSync(tool, 'exe');
  const state = baseState({ fences: [fence({ items: [{ name: 'tool.exe', path: tool }] })] });
  const { host, electron } = loadHost(state);
  const launched = [];
  electron.shell.launch = (plan) => launched.push(plan);

  await host.dropFiles('a', [place.note], 0, tool);

  assert.deepEqual(launched, [], 'launched a program during a move');
  assert.equal(state.fences[0].items.some((item) => item.name === '노트.txt'), true, 'not added to the box');
  assert.equal(fs.existsSync(place.note), false, 'left in place instead of being moved');
});

// ── Drop targets must work the same no matter where the drag started ───────
//
// The main process picks the receiving item. When each window did this on its own, it could not
// see outside itself, so items dragged from another box or the desktop were never accepted.

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

test('dropping on a folder in another box moves the file into that folder', async () => {
  const place = desk();
  const { host, state } = twoBoxes(
    [{ name: '노트.txt', path: place.note }],
    [{ name: 'Work', path: place.folder }]
  );
  const note = state.fences[0].items[0].path;
  const work = state.fences[1].items[0].path;

  const spot = onPicture(0, FAR);
  await host.transfer('a', note, spot.x, spot.y);

  assert.equal(fs.existsSync(path.join(work, '노트.txt')), true, 'did not go into the folder in the other box');
  assert.deepEqual(state.fences[0].items, [], 'still in the source box');
  assert.deepEqual(state.fences[1].items.map((item) => item.name), ['Work'], 'added next to the folder instead');
});

test('dragging out of one box onto the Recycle Bin in another discards it', async () => {
  const place = desk();
  const state = baseState({
    fences: [
      fence({ id: 'a', ...BOX, items: [{ name: '노트.txt', path: place.note }] }),
      fence({ id: 'b', ...FAR, items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] }),
    ],
  });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;
  electron.module.screen.getCursorScreenPoint = () => onPicture(0, FAR);
  const contents = fenceWindows(electron)[0].webContents;
  contents.startDrag = () => {};

  assert.equal(await host.dragOut(contents, held), true);
  assert.deepEqual(electron.shell.trashed, [held], 'the Recycle Bin in the other box did not accept it');
  assert.equal(state.fences[0].items.length, 0, 'the discarded item is still in the source box');
  assert.deepEqual(state.fences[1].items.map((item) => item.name), ['휴지통'], 'added next to the Recycle Bin instead');
});

test('sends to the Recycle Bin from another box even if the bin already has the same name', async () => {
  const place = desk();
  const state = baseState({
    fences: [
      fence({ id: 'a', ...BOX, items: [{ name: '노트.txt', path: place.note }] }),
      fence({ id: 'b', ...FAR, items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] }),
    ],
  });
  const { host, electron, desktop, asks } = loadHost(state);
  desktop.module.recycleHasName = (name) => name === '노트.txt';
  const kept = [];
  desktop.module.discardFile = async (filePath) => {
    kept.push(filePath);
    fs.rmSync(filePath, { force: true });
    return true;
  };
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;
  electron.module.screen.getCursorScreenPoint = () => onPicture(0, FAR);
  const contents = fenceWindows(electron)[0].webContents;
  contents.startDrag = () => {};

  assert.equal(await host.dragOut(contents, held), true);
  assert.equal(asks.calls.length, 0, 'asked whether to replace the same-named item in the Recycle Bin');
  assert.deepEqual(kept, [held], 'did not discard the same-named file as a separate item');
  assert.deepEqual(electron.shell.trashed, [], 'took the path that replaces the existing item');
  assert.equal(state.fences[0].items.length, 0, 'the discarded item is still in the source box');
  assert.equal(state.fences[1].items.some((item) => item.name === '노트.txt'), false, 'added to the box instead of the Recycle Bin');
  assert.equal(state.fences[1].items.some((item) => item.path === 'shell:RecycleBinFolder'), true, 'the Recycle Bin was removed');
});

test('dropping on the Recycle Bin in another box discards it', async () => {
  const place = desk();
  const { host, electron, state } = twoBoxes(
    [{ name: '노트.txt', path: place.note }],
    [{ name: '휴지통', path: 'shell:RecycleBinFolder' }]
  );
  const note = state.fences[0].items[0].path;

  const spot = onPicture(0, FAR);
  await host.transfer('a', note, spot.x, spot.y);

  assert.deepEqual(electron.shell.trashed, [note]);
  assert.deepEqual(state.fences[0].items, [], 'still in the box after being discarded');
  assert.deepEqual(state.fences[1].items.map((item) => item.name), ['휴지통'], 'added next to the Recycle Bin instead');
});

test('dropping on an empty spot in another box adds it to that box', async () => {
  const place = desk();
  const { host, state } = twoBoxes(
    [{ name: '노트.txt', path: place.note }],
    [{ name: 'Work', path: place.folder }]
  );
  const note = state.fences[0].items[0].path;
  const work = state.fences[1].items[0].path;

  // Drop on the empty cell to the right of the folder, not on its picture.
  const spot = onPicture(1, FAR);
  await host.transfer('a', note, spot.x, spot.y);

  assert.equal(fs.existsSync(path.join(work, '노트.txt')), false, 'went into the folder despite being dropped on an empty spot');
  assert.deepEqual(state.fences[1].items.map((item) => item.name), ['Work', '노트.txt']);
});

test('dropping on the edge of a cell inserts between items instead of dropping into it', async () => {
  const place = desk();
  const { host, state } = twoBoxes(
    [{ name: '노트.txt', path: place.note }],
    [{ name: 'Work', path: place.folder }]
  );
  const note = state.fences[0].items[0].path;
  const work = state.fences[1].items[0].path;

  // The left edge of the folder's cell. It is outside the picture, so the folder does not accept it.
  const slot = arrange.slotPoint(0, arrange.gridOf(FAR.w, FAR.h, false));
  await host.transfer('a', note, FAR.x + slot.x + 2, FAR.y + slot.y + 28);

  assert.equal(fs.existsSync(path.join(work, '노트.txt')), false, 'the folder accepted a drop on the edge');
  assert.equal(state.fences[1].items.length, 2, 'not added to the box either');
});

test('a file dropped on the window goes to the Recycle Bin even if the bin has the same name', async () => {
  const place = desk();
  const state = baseState({
    fences: [fence({ ...BOX, items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron, desktop, asks } = loadHost(state);
  desktop.module.recycleHasName = (name) => name === '노트.txt';
  const kept = [];
  desktop.module.discardFile = async (filePath) => {
    kept.push(filePath);
    return true;
  };
  host.openAll();

  await host.dropFiles('a', [place.note], 0, 'shell:RecycleBinFolder');

  assert.equal(asks.calls.length, 0, 'asked whether to replace the same-named item in the Recycle Bin');
  assert.deepEqual(kept, [place.note], 'did not discard the same-named file as a separate item');
  assert.deepEqual(electron.shell.trashed, [], 'took the path that replaces the existing item');
  assert.equal(state.fences[0].items.some((item) => item.name === '노트.txt'), false, 'added to the box instead of the Recycle Bin');
  assert.equal(state.fences[0].items.some((item) => item.path === 'shell:RecycleBinFolder'), true);
});

test('an item dragged from the desktop goes to the Recycle Bin even if the bin has the same name', async () => {
  const place = desk();
  const state = baseState({
    fences: [fence({ ...BOX, items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron, desktop, asks } = loadHost(state);
  desktop.module.recycleHasName = (name) => name === '노트.txt';
  const kept = [];
  desktop.module.discardFile = async (filePath) => {
    kept.push(filePath);
    return true;
  };
  host.openAll();

  const spot = onPicture(0);
  await host.acceptDesktopDrop({ name: '노트.txt', path: place.note }, spot);

  assert.equal(asks.calls.length, 0, 'asked whether to replace the same-named item in the Recycle Bin');
  assert.deepEqual(kept, [place.note], 'did not discard the same-named file as a separate item');
  assert.deepEqual(electron.shell.trashed, [], 'took the path that replaces the existing item');
  assert.equal(state.fences[0].items.some((item) => item.path === 'shell:RecycleBinFolder'), true, 'the Recycle Bin was removed from the box');
  assert.equal(state.fences[0].items.some((item) => item.name === '노트.txt'), false, 'added to the box instead of the Recycle Bin');
});

test('the Recycle Bin in a box accepts items dragged from the desktop', async () => {
  const place = desk();
  const state = baseState({
    fences: [fence({ ...BOX, items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron } = loadHost(state);
  host.openAll();

  const spot = onPicture(0);
  await host.acceptDesktopDrop({ name: '노트.txt', path: place.note }, spot);

  assert.deepEqual(electron.shell.trashed, [place.note], 'the item dragged from the desktop was not discarded');
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['휴지통'], 'the discarded item was added to the box');
});

test('a folder in a box accepts items dragged from the desktop', async () => {
  const place = desk();
  const state = baseState({
    fences: [fence({ ...BOX, items: [{ name: 'Work', path: place.folder }] })],
  });
  const { host } = loadHost(state);
  host.openAll();
  const work = state.fences[0].items[0].path;

  const spot = onPicture(0);
  await host.acceptDesktopDrop({ name: '노트.txt', path: place.note }, spot);

  assert.equal(fs.existsSync(path.join(work, '노트.txt')), true, 'did not go into the folder');
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['Work'], 'added separately next to the folder');
});

test('an item dragged from the desktop onto an empty spot is simply added', async () => {
  const place = desk();
  const state = baseState({
    fences: [fence({ ...BOX, items: [{ name: 'Work', path: place.folder }] })],
  });
  const { host } = loadHost(state);
  host.openAll();
  const work = state.fences[0].items[0].path;

  await host.acceptDesktopDrop({ name: '노트.txt', path: place.note }, onPicture(1));

  assert.equal(fs.existsSync(path.join(work, '노트.txt')), false, 'went into the folder despite being dropped on an empty spot');
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['Work', '노트.txt']);
});

test('while dragging, the target box is told which item will receive the drop', () => {
  const place = desk();
  const { host, electron, state } = twoBoxes(
    [{ name: '노트.txt', path: place.note }],
    [{ name: 'Work', path: place.folder }]
  );
  const note = state.fences[0].items[0].path;
  const work = state.fences[1].items[0].path;
  const far = fenceWindows(electron).find((win) => win.loaded.opts.query.id === 'b');

  // Over the folder's picture.
  const on = onPicture(0, FAR);
  host.hover(note, on.x, on.y, '');
  assert.equal(far.messages('fence:hover').at(-1).into, work, 'did not report the receiving item');

  // The empty cell next to it.
  const off = onPicture(1, FAR);
  host.hover(note, off.x, off.y, '');
  assert.equal(far.messages('fence:hover').at(-1).into, null, 'reported a receiver over an empty spot');
});

test('hovering over a document picture does not report it as a receiver', () => {
  // Only folders and the Recycle Bin accept drops. Highlighting an item that cannot accept
  // would make it look like dropping on the highlighted icon did nothing.
  const place = desk();
  const other = path.join(place.root, '보고서.txt');
  fs.writeFileSync(other, '문서');
  const { host, electron, state } = twoBoxes(
    [{ name: '노트.txt', path: place.note }],
    [{ name: '보고서.txt', path: other }]
  );
  const note = state.fences[0].items[0].path;
  const far = fenceWindows(electron).find((win) => win.loaded.opts.query.id === 'b');

  const on = onPicture(0, FAR);
  host.hover(note, on.x, on.y, '');
  assert.equal(far.messages('fence:hover').at(-1).into, null, 'reported a document as a receiver');
});

test('hovering over itself does not report it as a receiver', () => {
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

  assert.equal(win.messages('fence:hover').at(-1).into, null, 'tried to drop an item into itself');
});

test('the visible item receives the drop even when the box is scrolled', async () => {
  const place = desk();
  // At 400px wide there are four cells per row. The folder goes in the first cell of the second row.
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
  assert.equal(grid.cols, 4, 'the assumption of four cells per row no longer holds');
  const work = state.fences[0].items[4].path;
  const note = state.fences[1].items[0].path;

  // Scrolling down one row puts the second-row folder where the first row was.
  host.setScroll('a', grid.cellH);
  const spot = onPicture(0, BOX);
  await host.transfer('b', note, spot.x, spot.y);

  assert.equal(
    fs.existsSync(path.join(work, '노트.txt')),
    true,
    'scroll offset was not accounted for, so the wrong item received the drop'
  );
});
