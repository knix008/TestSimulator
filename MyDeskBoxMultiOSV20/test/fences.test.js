'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadHost, fence, baseState, fenceWindows } = require('./helpers/fakes');

// Missing files are pruned from boxes automatically, so use real files.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-items-'));

function realItem(name) {
  const full = path.join(SANDBOX, name);
  fs.writeFileSync(full, '');
  return { name, path: full };
}

function openOne(extra) {
  const state = baseState({ fences: [fence(extra)] });
  const loaded = loadHost(state);
  loaded.host.openAll();
  for (const win of loaded.electron.windows) win.ready();
  return loaded;
}

test('drawing a box while hidden makes boxes visible again', () => {
  const state = baseState({ hidden: true, fences: [fence()] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  assert.equal(fenceWindows(electron).length, 1);
  assert.equal(fenceWindows(electron).every((win) => !win.isVisible()), true, 'boxes must not be visible while hidden');

  host.finishDraw({ x: 10, y: 10, w: 300, h: 240 });

  assert.equal(state.hidden, false, 'drawing a box must unhide');
  assert.equal(state.fences.length, 2);
  const shown = fenceWindows(electron);
  assert.equal(shown.length, 2, 'a new box window must be created');
  assert.equal(shown.every((win) => win.isVisible()), true, 'existing boxes must become visible too');
});

test('drawing too small creates no box and leaves hidden state alone', () => {
  const state = baseState({ hidden: true });
  const { host } = loadHost(state);
  assert.equal(host.finishDraw({ x: 0, y: 0, w: 20, h: 20 }), null);
  assert.equal(state.fences.length, 0);
  assert.equal(state.hidden, true);
});

test('hiding removes windows and showing brings them back', () => {
  const { host, electron, desktop } = openOne();
  const win = fenceWindows(electron)[0];
  assert.equal(win.isVisible(), true);

  host.toggleHidden();
  assert.equal(win.isVisible(), false);

  host.toggleHidden();
  assert.equal(win.isVisible(), true);
});

test('setting hidden to its current value does nothing', () => {
  const { host, electron } = openOne();
  const win = fenceWindows(electron)[0];
  const before = win.sent.length;
  host.setHidden(false);
  assert.equal(win.sent.length, before);
});

test('notifies listeners (the tray) when hidden state changes', () => {
  const { host } = openOne();
  let calls = 0;
  host.onChange(() => { calls += 1; });
  host.toggleHidden();
  assert.equal(calls, 1);
  host.toggleHidden();
  assert.equal(calls, 2);
});

// Adding a file to a box means moving it into the box's folder.
// Once moved, it leaves the Desktop folder, so Explorer no longer draws its icon.
test('adding a file to a box moves it into the box folder', async () => {
  const one = realItem('into-a.lnk');
  const from = one.path;
  const state = baseState({ fences: [fence({ title: '일감', items: [one] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();

  const box = state.fences[0];
  assert.equal(fs.existsSync(from), false, 'file was added but is still at its original location');
  assert.equal(box.items.length, 1);
  assert.equal(path.dirname(box.items[0].path), path.join(state.settings.root, box.folder), 'file did not go to the box folder');
  assert.equal(fs.existsSync(box.items[0].path), true, 'file was lost during the move');
  assert.equal(box.items[0].home, path.dirname(from), 'original folder was not recorded');
});

test('box folder name is derived from the box title', () => {
  const state = baseState({ fences: [fence({ title: '보고서 모음', items: [realItem('doc-a.txt')] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  assert.equal(state.fences[0].folder, '보고서 모음');
});

test('strips characters that are invalid in folder names', () => {
  const state = baseState({ fences: [fence({ title: 'a/b:c*d', items: [realItem('odd-a.txt')] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const box = state.fences[0];
  assert.doesNotMatch(box.folder, /[/\\:*?"<>|]/, 'invalid characters remain');
  assert.equal(fs.existsSync(path.join(state.settings.root, box.folder)), true, 'no folder was created with that name');
});

test('deleting a contained file in Explorer removes it from the box', () => {
  const one = realItem('gone-a.lnk');
  const state = baseState({ fences: [fence({ items: [one] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();

  fs.rmSync(state.fences[0].items[0].path);
  host.refreshIcons();
  assert.deepEqual(state.fences[0].items, [], 'deleted from the folder but still in the box');
});

// A box shows the contents of its folder.
test('files put into the box folder via Explorer appear in the box', () => {
  const state = baseState({ fences: [fence({ title: '일감', items: [realItem('seed-a.txt')] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();

  const dir = path.join(state.settings.root, state.fences[0].folder);
  fs.writeFileSync(path.join(dir, '바깥에서.txt'), '');
  host.refreshIcons();

  const names = state.fences[0].items.map((item) => item.name).sort();
  assert.deepEqual(names, ['seed-a.txt', '바깥에서.txt'], 'file put in the folder does not show in the box');
});

test('renaming a box keeps its folder and contained files', () => {
  const one = realItem('rename-a.lnk');
  const state = baseState({ fences: [fence({ title: '처음', items: [one] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const box = state.fences[0];
  const folder = box.folder;
  const kept = box.items[0].path;

  host.rename('a', '나중');
  assert.equal(box.title, '나중');
  assert.equal(box.folder, folder, 'renaming also moved the folder');
  assert.equal(box.items[0].path, kept, 'contained file path changed');
  assert.equal(fs.existsSync(kept), true);
});

test('hiding boxes leaves contained files in their folder', () => {
  const one = realItem('hide-a.lnk');
  const state = baseState({ fences: [fence({ items: [one] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const kept = state.fences[0].items[0].path;

  host.toggleHidden();
  assert.equal(fs.existsSync(kept), true, 'hiding must not move files');
  host.toggleHidden();
  assert.equal(state.fences[0].items[0].path, kept);
});

test('a rectangle dragged on the desktop becomes a box only after confirming', async () => {
  const state = baseState();
  const { host, electron } = loadHost(state);

  electron.setDialogAnswer(1); // Cancel
  assert.equal(await host.offerFence({ x: 10, y: 10, w: 300, h: 240 }), null);
  assert.equal(state.fences.length, 0, 'cancel must not create a box');

  electron.setDialogAnswer(0); // Create
  const made = await host.offerFence({ x: 10, y: 10, w: 300, h: 240 });
  assert.ok(made, 'choosing Create must create a box');
  assert.equal(state.fences.length, 1);
  assert.deepEqual([made.x, made.y], [10, 10]);
});

test('a drag that is too small does not even prompt', async () => {
  const state = baseState();
  const { host, electron } = loadHost(state);
  electron.setDialogAnswer(0);
  assert.equal(await host.offerFence({ x: 0, y: 0, w: 40, h: 30 }), null);
  assert.equal(state.fences.length, 0);
});

test('drag-creating a box while hidden makes boxes visible again', async () => {
  const state = baseState({ hidden: true, fences: [fence()] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  electron.setDialogAnswer(0);
  await host.offerFence({ x: 10, y: 10, w: 300, h: 240 });
  assert.equal(state.hidden, false);
});

test('only one instance of the desktop app runs at a time', () => {
  const desktop = require('../src/main/desktop');
  assert.equal(typeof desktop.claimSingleInstance, 'function', 'there is no single-instance guard');
  // Asking twice in the same process keeps returning the first result.
  const first = desktop.claimSingleInstance();
  assert.equal(typeof first, 'boolean');
  assert.equal(desktop.claimSingleInstance(), first);
});

// The Recycle Bin is a shell item, not a file. There is nothing to move into a folder, so it
// is only added to the list and its desktop icon is hidden. The box window draws it instead,
// so it must not appear in both places.
test('adding the Recycle Bin hides it on the desktop', () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, desktop } = loadHost(state);
  host.openAll();
  host.refreshIcons();

  assert.deepEqual(desktop.calls.shell.at(-1), ['shell:RecycleBinFolder'], 'Recycle Bin was not hidden');
  assert.deepEqual(state.fences[0].items.map((item) => item.path), ['shell:RecycleBinFolder']);
});

test('shell items not in a box stay on the desktop', () => {
  const state = baseState({ fences: [fence({ items: [] })] });
  const { host, desktop } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  assert.deepEqual(desktop.calls.shell.at(-1), [], 'hid an item that was never added');
});

test('hiding boxes restores the Recycle Bin on the desktop', () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, desktop } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  host.toggleHidden();
  assert.deepEqual(desktop.calls.shell.at(-1), [], 'boxes were hidden but the Recycle Bin stayed hidden');
});

test('ejecting the Recycle Bin restores it on the desktop', async () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, desktop } = loadHost(state);
  host.openAll();
  host.refreshIcons();

  await host.eject('a', 'shell:RecycleBinFolder');

  assert.deepEqual(state.fences[0].items, [], 'was not removed from the box');
  assert.deepEqual(desktop.calls.shell.at(-1), [], 'ejected but not restored on the desktop');
});

// Ejecting sends a file back to the folder it came from.
test('ejecting a file from a box returns it to its original folder', async () => {
  const one = realItem('out-a.lnk');
  const home = path.dirname(one.path);
  const state = baseState({ fences: [fence({ title: '일감', items: [one] })] });
  const { host, desktop } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;
  assert.notEqual(held, one.path, 'file was not added');

  await host.eject('a', held);

  assert.deepEqual(state.fences[0].items, [], 'was not removed from the box');
  assert.equal(fs.existsSync(held), false, 'file stayed in the box folder');
  assert.equal(fs.existsSync(path.join(home, 'out-a.lnk')), true, 'file did not return to its original folder');
  assert.deepEqual(desktop.calls.homed.at(-1), ['out-a.lnk'], 'icon was not put back in place');
});

// A file held open by another program (e.g. an open .pptx) cannot be moved.
// Failing silently makes it look like some files go in and others don't.
// It has nothing to do with file type, so the user must be told why it failed.
test('a file that cannot be moved is not added and the user is told why', async () => {
  const one = realItem('busy-a.txt');
  // Make the storage folder impossible to create so the move is blocked.
  const blocked = path.join(SANDBOX, 'busy-root');
  fs.writeFileSync(blocked, '폴더가 아니다');
  const state = baseState({ settings: { root: blocked }, fences: [fence({ title: '일감' })] });
  const { host, asks } = loadHost(state);
  host.openAll();

  await host.dropFiles('a', [one.path], 0);
  await new Promise((done) => setTimeout(done, 30));

  assert.deepEqual(state.fences[0].items, [], 'move failed but the file was recorded as added');
  assert.equal(fs.existsSync(one.path), true, 'move failed but the file disappeared');
  assert.equal(asks.calls.length, 1, 'user was not told why the file was not added');
  assert.ok(asks.calls[0].title.includes('busy-a.txt'), `does not say which file: ${asks.calls[0].title}`);
  assert.ok(asks.calls[0].detail.includes('다른 프로그램'), 'does not explain the reason');
});

test('ejected items are always visible: the hidden attribute is cleared', async () => {
  // If a file hidden while in the box is ejected still hidden, it sits on the desktop
  // with no icon. To the user, the eject looks like it failed.
  const one = realItem('reveal-a.lnk');
  const state = baseState({ fences: [fence({ title: '일감', items: [one] })] });
  const { host, desktop } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;
  desktop.module.hideFile(held);

  await host.eject('a', held);

  assert.ok(desktop.calls.revealed.includes(held), 'ejected without clearing the hidden attribute');
  assert.deepEqual(state.fences[0].items, [], 'was not removed from the box');
});

// Deleting a box must return every single item it contained.
test('deleting a box returns all contained files and removes its folder', async () => {
  const items = ['del-a.txt', 'del-b.txt'].map(realItem);
  const home = path.dirname(items[0].path);
  const state = baseState({ fences: [fence({ title: '지울 것', items })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const folder = path.join(state.settings.root, state.fences[0].folder);
  assert.equal(fs.readdirSync(folder).length, 2);

  electron.setDialogAnswer(0); // Delete
  await host.removeFence('a');

  assert.equal(state.fences.length, 0, 'box was not deleted');
  for (const item of items) {
    assert.equal(fs.existsSync(path.join(home, path.basename(item.path))), true, `${item.name} was not returned`);
  }
  assert.equal(fs.existsSync(folder), false, 'empty box folder was left behind');
});

test('cancelling box deletion leaves contained files in place', async () => {
  const one = realItem('keep-a.txt');
  const state = baseState({ fences: [fence({ items: [one] })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;

  electron.setDialogAnswer(1); // Cancel
  await host.removeFence('a');

  assert.equal(state.fences.length, 1);
  assert.equal(fs.existsSync(held), true, 'cancelled but files were moved');
});

// The tray's "Return all to desktop". Boxes stay; only their contents are emptied.
test('returning all keeps boxes and sends only files to the desktop', async () => {
  const items = ['back-a.txt', 'back-b.txt'].map(realItem);
  const home = path.dirname(items[0].path);
  const state = baseState({ fences: [fence({ items: [items[0]] }), fence({ id: 'b', x: 600, items: [items[1]] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();

  const count = await host.returnAll();

  assert.equal(count, 2, 'returned count is wrong');
  assert.equal(state.fences.length, 2, 'boxes were removed too');
  for (const fenceRow of state.fences) assert.deepEqual(fenceRow.items, []);
  for (const item of items) {
    assert.equal(fs.existsSync(path.join(home, path.basename(item.path))), true, `${item.name} was not returned`);
  }
});

// Desktop icons under a box must move out of the way. The box takes priority.
test('pushes desktop icons out from under a box', () => {
  const state = baseState({ fences: [fence({ x: 100, y: 100, w: 400, h: 300 })] });
  const { host, desktop, electron } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();

  const walls = desktop.calls.nudged.at(-1);
  assert.ok(walls && walls.length === 1, 'box area was not reported');
  assert.deepEqual(
    { x: walls[0].x, y: walls[0].y },
    { x: 100, y: 100 },
    'push-out area differs from the box area'
  );
});

test('hiding boxes puts pushed-out icons back in place', () => {
  const state = baseState({ fences: [fence()] });
  const { host, desktop } = loadHost(state);
  host.openAll();
  host.toggleHidden();
  assert.deepEqual(desktop.calls.release.at(-1), [], 'icons were not released on hide');
});

// Boxes snap only near grid lines; they are not forced to multiples of the cell size.
test('a box drawn near grid lines snaps to them', () => {
  const state = baseState();
  const { host, desktop } = loadHost(state);
  desktop.useGrid({ x0: 20, y0: 30, dx: 80, dy: 100 });

  const made = host.finishDraw({ x: 105, y: 135, w: 316, h: 292 });

  assert.deepEqual([made.x, made.y], [100, 130], 'did not snap to grid lines');
  assert.deepEqual([made.w, made.h], [320, 300], 'size did not snap to the grid');
});

test('a box drawn between grid lines keeps its drawn bounds', () => {
  const state = baseState();
  const { host, desktop } = loadHost(state);
  desktop.useGrid({ x0: 20, y0: 30, dx: 80, dy: 100 });

  const made = host.finishDraw({ x: 140, y: 180, w: 360, h: 340 });

  assert.deepEqual([made.x, made.y, made.w, made.h], [140, 180, 360, 340], 'cannot create a box at the desired size');
});

test('uses the drawn bounds as-is when the grid cannot be measured', () => {
  const state = baseState();
  const { host } = loadHost(state);
  const made = host.finishDraw({ x: 105, y: 135, w: 300, h: 240 });
  assert.deepEqual([made.x, made.y], [105, 135]);
});

// Box to box: the file moves to the new box's folder, but its home stays where it originally came from.
test('moving between boxes also changes the folder', async () => {
  const one = realItem('move-a.txt');
  const home = path.dirname(one.path);
  const state = baseState({
    fences: [fence({ id: 'a', title: '첫 박스', items: [one] }), fence({ id: 'b', title: '둘째 박스', x: 700 })],
  });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;

  // Simulate releasing over the second box.
  const target = fenceWindows(electron)[1].getBounds();
  await host.transfer('a', held, target.x + 30, target.y + 60);

  assert.deepEqual(state.fences[0].items, [], 'was not removed from the first box');
  assert.equal(state.fences[1].items.length, 1, 'did not go to the second box');
  const moved = state.fences[1].items[0];
  assert.equal(path.dirname(moved.path), path.join(state.settings.root, state.fences[1].folder));
  assert.equal(fs.existsSync(moved.path), true, 'file was lost during the move');
  assert.equal(fs.existsSync(held), false, 'file stayed in the previous box folder');

  // Ejecting goes back to the original location, not the previous box.
  await host.eject('b', moved.path);
  assert.equal(fs.existsSync(path.join(home, 'move-a.txt')), true, 'did not return to its original location');
});

test('dropping outside any box returns the file to the desktop', async () => {
  const one = realItem('outside-a.txt');
  const home = path.dirname(one.path);
  const state = baseState({ fences: [fence({ items: [one] })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;

  // A spot far away from any box.
  await host.transfer('a', held, 1800, 1000);

  assert.deepEqual(state.fences[0].items, []);
  assert.equal(fs.existsSync(path.join(home, 'outside-a.txt')), true, 'did not return to the desktop');
});

test('dragging onto the desktop ejects at the drop point', async () => {
  const one = realItem('deskdrop-a.txt');
  const link = realItem('deskdrop-b.lnk');
  const home = path.dirname(one.path);
  const state = baseState({ fences: [fence({ items: [one, link] })] });
  const { host, electron, desktop } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();

  await host.transfer('a', state.fences[0].items[0].path, 1200, 360);
  await host.transfer('a', state.fences[0].items[0].path, 1400, 240);

  assert.deepEqual(state.fences[0].items, [], 'dropped on the desktop but stayed in the box');
  assert.equal(fs.existsSync(path.join(home, 'deskdrop-a.txt')), true, 'file did not go to the desktop');
  assert.equal(fs.existsSync(path.join(home, 'deskdrop-b.lnk')), true, 'shortcut did not go to the desktop');
  assert.deepEqual(desktop.calls.placedAt.map((entry) => entry.point), [
    { x: 1200, y: 360 },
    { x: 1400, y: 240 },
  ]);
});

test('dragging the Recycle Bin onto the desktop removes it from the box', async () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron, desktop } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();

  await host.transfer('a', 'shell:RecycleBinFolder', 1400, 220);

  assert.deepEqual(state.fences[0].items, [], 'Recycle Bin stayed in the box');
  assert.deepEqual(desktop.calls.placedAt.at(-1), { name: '휴지통', point: { x: 1400, y: 220 } });
});

test('while dragging in from the desktop, shows the drop slot without a ghost window', () => {
  const one = realItem('incoming-a.txt');
  const state = baseState({ fences: [fence({ id: 'a', items: [] }), fence({ id: 'b', x: 700 })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  const where = fenceWindows(electron)[1].getBounds();

  host.hoverIncoming(one.path, where.x + 40, where.y + 80);
  const ghost = electron.windows.find((win) => win.loaded && /ghost\.html$/.test(win.loaded.file));
  assert.equal(ghost.isVisible(), false, 'our image was overlaid on a desktop drag');
  const hover = fenceWindows(electron)[1].messages('fence:hover').at(-1);
  assert.equal(hover.filePath, one.path, 'target box is unaware of the drag');

  host.hoverIncoming(null, 0, 0);
  assert.equal(fenceWindows(electron)[1].messages('fence:hover').at(-1), null, 'drop slot remained after release');
});

test('dragging from the desktop into a box adds the file', async () => {
  const one = realItem('indrop-a.txt');
  const state = baseState({ fences: [fence({ title: '받는 박스' })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();

  const bounds = fenceWindows(electron)[0].getBounds();
  await host.acceptDesktopDrop(one, { x: bounds.x + 20, y: bounds.y + 50 });

  assert.equal(state.fences[0].items.length, 1, 'was not added to the box');
  assert.equal(fs.existsSync(one.path), false, 'stayed on the desktop');
  assert.equal(path.dirname(state.fences[0].items[0].path), path.join(state.settings.root, state.fences[0].folder));
});

test('dragging a multi-selection from the desktop adds all of them', async () => {
  // Explorer moves the whole selection. Adding only the item under the cursor would leave
  // the rest on the desktop, making it look like the move did nothing.
  const many = [realItem('indrop-many-1.txt'), realItem('indrop-many-2.txt'), realItem('indrop-many-3.txt')];
  const state = baseState({ fences: [fence({ title: '받는 박스' })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();

  const bounds = fenceWindows(electron)[0].getBounds();
  await host.acceptDesktopDrop(many, { x: bounds.x + 20, y: bounds.y + 50 });

  assert.equal(state.fences[0].items.length, 3, 'not all selected items were added');
  for (const one of many) {
    assert.equal(fs.existsSync(one.path), false, `${one.name} stayed on the desktop`);
  }
  const names = state.fences[0].items.map((item) => item.name).sort();
  assert.deepEqual(names, ['indrop-many-1.txt', 'indrop-many-2.txt', 'indrop-many-3.txt']);
});

// The icon must never vanish from view while dragging.
// The box under the cursor opens a drop slot; outside boxes, a ghost window draws it.
test('reports which box is under the cursor while dragging', () => {
  const one = realItem('drag-a.txt');
  const state = baseState({ fences: [fence({ id: 'a', items: [one] }), fence({ id: 'b', x: 700 })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;
  const [first, second] = fenceWindows(electron);

  const where = second.getBounds();
  host.hover(held, where.x + 40, where.y + 50, 'data:image/png;base64,끌기');

  const toSecond = second.messages('fence:hover').at(-1);
  assert.ok(toSecond, 'box under the cursor was not notified');
  assert.equal(toSecond.filePath, held);
  assert.equal(first.messages('fence:hover').at(-1), null, 'drop slot in the other box was not cleared');

  // Outside boxes, the ghost window draws the icon.
  host.hover(held, 1800, 1000, 'data:image/png;base64,끌기');
  const ghost = electron.windows.find((win) => win.loaded && /ghost\.html$/.test(win.loaded.file));
  assert.ok(ghost, 'there is no ghost window');
  assert.equal(ghost.isVisible(), true, 'icon vanished outside the boxes');

  host.clearHover();
  assert.equal(ghost.isVisible(), false, 'image remained after release');
  for (const win of [first, second]) {
    assert.equal(win.messages('fence:hover').at(-1), null, 'drop slot remained after release');
  }
});

// Files and shortcuts are handed off so other programs can receive them.
// The Recycle Bin is not a file, so there is nothing to hand off.
test('files and shortcuts can be dragged out to other programs', () => {
  const file = realItem('hand-a.txt');
  const link = realItem('hand-b.lnk');
  const state = baseState({ fences: [fence({ items: [file, link] })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();
  const dragged = [];
  const contents = fenceWindows(electron)[0].webContents;
  contents.startDrag = (item) => dragged.push(item);

  for (const item of state.fences[0].items) {
    assert.equal(host.dragOut(contents, item.path), true, `failed to hand off ${item.name}`);
  }
  assert.deepEqual(dragged.map((item) => item.file), state.fences[0].items.map((item) => path.resolve(item.path)));
  assert.equal(dragged.every((item) => item.icon), true, 'drag image is missing');
  assert.equal(state.fences[0].items.length, 2, 'a file that was only copied was removed from the box');
});

test('dragging a multi-selection hands off all of them at once', () => {
  const many = [realItem('hand-many-1.txt'), realItem('hand-many-2.txt'), realItem('hand-many-3.txt')];
  const state = baseState({ fences: [fence({ items: many })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();
  const held = state.fences[0].items.map((item) => item.path);
  const dragged = [];
  const contents = fenceWindows(electron)[0].webContents;
  contents.startDrag = (item) => {
    dragged.push(item);
    for (const file of item.files || [item.file]) fs.rmSync(file);
  };

  assert.equal(host.dragOut(contents, [held[1], held[0], held[2], 'shell:RecycleBinFolder']), true);
  assert.equal(dragged.length, 1, 'not handed off in a single drag');
  assert.equal(dragged[0].file, path.resolve(held[1]), 'the dragged item is not first');
  assert.deepEqual(dragged[0].files, [held[1], held[0], held[2]].map((file) => path.resolve(file)));
  assert.deepEqual(state.fences[0].items, [], 'files taken out remained in the box');
});

test('re-reads the shortcut icon when a reinstall changes the program', { skip: process.platform !== 'win32' }, async () => {
  const program = realItem('reinstall-app.exe');
  const link = realItem('reinstall-app.lnk');
  const state = baseState({ fences: [fence({ items: [link] })] });
  const { host, electron, desktop } = loadHost(state);
  const reads = [];
  desktop.module.iconOfFile = (file) => {
    reads.push(file);
    return { width: 32, height: 32, data: Buffer.alloc(32 * 32 * 4) };
  };
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();
  electron.shell.links.set(state.fences[0].items[0].path, { target: program.path });
  await host.push('a');
  const first = reads.length;
  assert.ok(first > 0, 'icon was not extracted from the program file');
  assert.equal(reads.at(-1), program.path);

  await host.push('a');
  assert.equal(reads.length, first, 'icon was re-read although nothing changed');

  // The installer leaves the shortcut alone and replaces only the program file.
  fs.writeFileSync(program.path, 'new build');
  const sent = fenceWindows(electron)[0].messages('fence:state').length;
  host.refreshIcons();
  for (let turn = 0; turn < 20 && reads.length === first; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(reads.length > first, 'icon of the changed program was not re-read');
  for (let turn = 0; turn < 20 && fenceWindows(electron)[0].messages('fence:state').length === sent; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(fenceWindows(electron)[0].messages('fence:state').length > sent, 'new icon was not sent to the box');
});

test('the Recycle Bin cannot be dragged out to other programs', () => {
  const state = baseState({ fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  const dragged = [];
  const contents = fenceWindows(electron)[0].webContents;
  contents.startDrag = (item) => dragged.push(item);

  assert.equal(host.dragOut(contents, 'shell:RecycleBinFolder'), false);
  assert.equal(dragged.length, 0, 'Recycle Bin was handed off to another program');
  assert.equal(state.fences[0].items[0].path, 'shell:RecycleBinFolder');
});

test('dropping on the desktop removes the file from the box', () => {
  const one = realItem('out-desk.txt');
  const home = path.dirname(one.path);
  const state = baseState({ fences: [fence({ items: [one] })] });
  const { host, electron, desktop } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;
  desktop.module.onDesktop = () => true;
  const contents = fenceWindows(electron)[0].webContents;
  contents.startDrag = () => {};

  assert.equal(host.dragOut(contents, held), true);
  assert.deepEqual(state.fences[0].items, [], 'dropped on the desktop but stayed in the box');
  assert.equal(fs.existsSync(held), false, 'file remained in the box folder');
  assert.equal(fs.existsSync(path.join(home, 'out-desk.txt')), true, 'file did not return to the desktop');
});

test('when the desktop copies the file, the copy left in the box is removed', () => {
  const one = realItem('out-copy.txt');
  const home = path.dirname(one.path);
  const deskDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-desk-'));
  const state = baseState({ fences: [fence({ items: [one] })] });
  const { host, electron, desktop } = loadHost(state);
  desktop.useDesktop(deskDir);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;
  desktop.module.onDesktop = () => true;
  const contents = fenceWindows(electron)[0].webContents;
  contents.startDrag = (item) => fs.copyFileSync(item.file, path.join(deskDir, path.basename(item.file)));

  assert.equal(host.dragOut(contents, held), true);
  assert.deepEqual(state.fences[0].items, [], 'copied file remained in the box');
  assert.equal(fs.existsSync(held), false, 'file remained in the box folder');
  assert.equal(fs.existsSync(path.join(deskDir, 'out-copy.txt')), true, 'the copy on the desktop disappeared');
  assert.equal(fs.existsSync(path.join(home, 'out-copy.txt')), false, 'the same file ended up duplicated');
});

test('ejecting a shortcut moves only the shortcut; its target stays put', async () => {
  // Everything is a file. A shortcut is a file too, so ejecting it moves just that one file.
  // The file it points to stays in the box, and the shortcut keeps pointing at it.
  // Previously this asked "Replace shortcut only" vs "Create new". The user had only
  // dragged one file out, so it was unclear what they were being asked to choose.
  const file = realItem('aim-stay.txt');
  const link = realItem('aim-stay.lnk');
  const home = path.dirname(file.path);
  const state = baseState({ fences: [fence({ items: [file, link] })] });
  const { host, electron, asks } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();
  const heldLink = state.fences[0].items.find((item) => item.name === 'aim-stay.lnk');
  const heldFile = state.fences[0].items.find((item) => item.name === 'aim-stay.txt');
  electron.shell.links.set(heldLink.path, { target: heldFile.path });

  await host.eject('a', heldLink.path);

  assert.deepEqual(asks.calls, [], 'prompted the user during a move');
  assert.equal(state.fences[0].items.length, 1, 'the target item was moved out too');
  assert.equal(state.fences[0].items[0].path, heldFile.path);
  assert.equal(fs.existsSync(path.join(home, 'aim-stay.lnk')), true, 'shortcut was not moved out');
  assert.equal(fs.existsSync(heldFile.path), true, 'the target item disappeared from the box');
});

test('if only a shortcut is created, the item itself is moved out of the box', async () => {
  const one = realItem('linked-item.txt');
  const home = path.dirname(one.path);
  const deskDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-link-'));
  const state = baseState({ fences: [fence({ items: [one] })] });
  const { host, electron, desktop, asks } = loadHost(state);
  desktop.useDesktop(deskDir);
  desktop.module.onDesktop = () => false;
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;
  const contents = fenceWindows(electron)[0].webContents;
  contents.startDrag = (item) => {
    const lnk = path.join(deskDir, 'linked-item.txt.lnk');
    fs.writeFileSync(lnk, '');
    electron.shell.links.set(lnk, { target: item.file });
  };
  assert.equal(await host.dragOut(contents, held), true);
  assert.deepEqual(asks.calls, [], 'prompted the user during a move');
  assert.equal(state.fences[0].items.length, 0, 'only a shortcut went out; the item stayed in the box');
  assert.equal(fs.existsSync(held), false, 'item remained in the box folder');
  assert.equal(fs.existsSync(path.join(home, 'linked-item.txt')), true, 'item was not moved out of the box');
  assert.equal(fs.existsSync(path.join(deskDir, 'linked-item.txt.lnk')), false, 'a bare shortcut was left on the desktop');
});

test('when another program takes the file, it is removed from the box', () => {
  const one = realItem('taken-a.txt');
  const state = baseState({ fences: [fence({ items: [one] })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;
  const contents = fenceWindows(electron)[0].webContents;
  contents.startDrag = (item) => fs.rmSync(item.file);

  assert.equal(host.dragOut(contents, held), true);
  assert.equal(fs.existsSync(held), false);
  assert.deepEqual(state.fences[0].items, [], 'files taken out remained in the box');
});

test('asks the desktop layer whether the cursor is over another program', () => {
  const { host, desktop } = openOne();
  assert.equal(host.overForeign(3, 4), false, 'treats an unknown spot as another program');
  let seen = null;
  desktop.module.foreignAt = (point, handles) => {
    seen = { point, handles };
    return point.x === 9;
  };
  assert.equal(host.overForeign(9, 8), true);
  assert.deepEqual(seen.point, { x: 9, y: 8 });
  assert.ok(seen.handles.length > 0, 'our window handles were not passed');
  assert.equal(host.overForeign(1, 2), false);
});

// A box must stay where the user put it. It must not wander on its own.
test('repeatedly applying the same bounds does not make the box drift', () => {
  const state = baseState({ fences: [fence({ x: 300, y: 200, w: 320, h: 300 })] });
  const { host, desktop, electron } = loadHost(state);
  desktop.useGrid({ x0: 20, y0: 30, dx: 80, dy: 100 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();

  const box = state.fences[0];
  host.applyBounds('a', { x: box.x, y: box.y, w: box.w, h: box.h }, true);
  const settled = { x: box.x, y: box.y, w: box.w, h: box.h };

  for (let turn = 0; turn < 6; turn += 1) {
    host.applyBounds('a', { x: box.x, y: box.y, w: box.w, h: box.h }, true);
  }

  assert.deepEqual({ x: box.x, y: box.y, w: box.w, h: box.h }, settled, 'box moved on its own');
});

// Boxes do not overlap each other.
test('dropping onto another box shifts it aside', () => {
  const state = baseState({
    fences: [
      fence({ id: 'a', x: 500, y: 300, w: 400, h: 400 }),
      fence({ id: 'b', x: 1200, y: 300, w: 300, h: 300 }),
    ],
  });
  const { host, desktop, electron } = loadHost(state);
  desktop.useGrid({ x0: 0, y0: 0, dx: 80, dy: 100 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();

  // Place b overlapping a.
  host.applyBounds('b', { x: 600, y: 350, w: 300, h: 300 }, true);

  const [a, b] = state.fences;
  const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  assert.equal(overlap, false, `boxes were left overlapping: a=${a.x},${a.y} b=${b.x},${b.y}`);
});

// Startup leaves boxes alone. A box placed yesterday must be in the same spot today.
test('startup does not move boxes', () => {
  const state = baseState({ fences: [fence({ x: 613, y: 297, w: 321, h: 243 })] });
  const { host, desktop, electron } = loadHost(state);
  desktop.useGrid({ x0: 14, y0: 2, dx: 76, dy: 98 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  const box = state.fences[0];
  assert.deepEqual([box.x, box.y, box.w, box.h], [613, 297, 321, 243], 'box was adjusted at startup');
});

// Boxes saved overlapping are also left alone at startup; they shift only on user moves.
test('boxes saved overlapping are not pushed apart at startup', () => {
  const state = baseState({
    fences: [
      fence({ id: 'a', x: 100, y: 100, w: 400, h: 400 }),
      fence({ id: 'b', x: 200, y: 200, w: 400, h: 400 }),
    ],
  });
  const { host, desktop, electron } = loadHost(state);
  desktop.useGrid({ x0: 14, y0: 2, dx: 76, dy: 98 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  assert.deepEqual([state.fences[1].x, state.fences[1].y], [200, 200], 'box was pushed at startup');
});

test('pushing icons away does not shift the box position', () => {
  const state = baseState({ fences: [fence({ x: 300, y: 200, w: 320, h: 300 })] });
  const { host, desktop, electron } = loadHost(state);
  desktop.useGrid({ x0: 20, y0: 30, dx: 80, dy: 100 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  const box = state.fences[0];
  host.applyBounds('a', { x: box.x, y: box.y, w: box.w, h: box.h }, true);
  const settled = { x: box.x, y: box.y, w: box.w, h: box.h };

  // Simulate the grid's "first icon" changing because icons were pushed away.
  // As long as the grid itself is stable, the box must stay put.
  desktop.useGrid({ x0: 100, y0: 130, dx: 80, dy: 100 });
  host.applyBounds('a', { x: box.x, y: box.y, w: box.w, h: box.h }, true);

  assert.deepEqual({ x: box.x, y: box.y, w: box.w, h: box.h }, settled, 'box followed when the grid moved');
});

// Only the cells covered by a box need to be cleared. The whole desktop is not rearranged.
test('clears only the box area and leaves other icons alone', () => {
  const deskgrid = require('../src/shared/deskgrid');
  const area = { x: 0, y: 0, width: 1920, height: 1000 };
  const metrics = { x0: 0, y0: 0, dx: 80, dy: 100, phaseX: 0, phaseY: 0 };
  // Nine icons across three rows.
  const icons = [];
  let n = 0;
  for (let col = 0; col < 3; col += 1) {
    for (let row = 0; row < 3; row += 1) {
      icons.push({ index: n, x: col * 80, y: row * 100 });
      n += 1;
    }
  }
  // A box covering only the middle cell.
  const blocks = [{ x: 80, y: 100, width: 80, height: 100 }];
  const moves = deskgrid.relocate(icons, blocks, area, metrics);

  assert.equal(moves.length, 1, 'only the one covered icon should move');
  assert.equal(moves[0].index, 4, 'moved the wrong icon');
});

// Resizing alone must not make the box jump sideways.
test('resizing only keeps the box position', () => {
  const state = baseState({ fences: [fence({ x: 613, y: 297, w: 320, h: 300 })] });
  const { host, desktop, electron } = loadHost(state);
  desktop.useGrid({ x0: 14, y0: 2, dx: 76, dy: 98 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  const box = state.fences[0];
  // Start from the position aligned once at startup.
  const at = { x: box.x, y: box.y };

  host.applyBounds('a', { x: box.x, y: box.y, w: 420, h: 380 }, true);

  assert.deepEqual({ x: box.x, y: box.y }, at, 'only the size changed but the position moved');
  assert.ok(box.w >= 400 && box.h >= 360, `unexpected size: ${box.w}x${box.h}`);
});

// A box docked to an edge must stay docked.
test('a box docked to the left screen edge does not bounce back', () => {
  const state = baseState({ fences: [fence({ x: 600, y: 300, w: 320, h: 300 })] });
  const { host, desktop, electron } = loadHost(state);
  // The icon grid starts 14px in from the screen edge.
  desktop.useGrid({ x0: 14, y0: 2, dx: 76, dy: 98 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();

  // Drag it by hand into the top-left corner.
  host.applyBounds('a', { x: 0, y: 0, w: 320, h: 300 }, true);

  const box = state.fences[0];
  assert.deepEqual([box.x, box.y], [0, 0], `bounced back from the edge: ${box.x},${box.y}`);
});

// When growing a box hits a neighbor, stop at the contact point instead of moving the box.
test('growing a box into a neighbor stops at the neighbor', () => {
  const state = baseState({
    fences: [
      fence({ id: 'a', x: 200, y: 200, w: 300, h: 300 }),
      fence({ id: 'b', x: 700, y: 200, w: 300, h: 300 }),
    ],
  });
  const { host, desktop, electron } = loadHost(state);
  desktop.useGrid({ x0: 14, y0: 2, dx: 76, dy: 98 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  const [a, b] = state.fences;
  const at = { x: a.x, y: a.y };

  // Grow a far to the right, enough to overlap b.
  host.applyBounds('a', { x: a.x, y: a.y, w: 700, h: a.h }, true);

  assert.deepEqual({ x: a.x, y: a.y }, at, 'box moved when it was grown');
  const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  assert.equal(overlap, false, 'covered the neighboring box');
  assert.ok(a.x + a.w <= b.x, `did not stop at the neighboring box: ${a.x + a.w} > ${b.x}`);
});

// On the desktop, image files show as previews. Boxes must do the same.
test('image files show the image itself instead of a file-type icon', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'fences.js'), 'utf8');
  assert.match(source, /const PICTURE = .*png.*jpe\?g/, 'image files are not detected');
  assert.match(source, /function pictureOf\(filePath\)[\s\S]*?createFromPath\(filePath\)/, 'the image is not loaded');
  assert.match(source, /function pictureOf\(filePath\)[\s\S]*?resize\(/, 'large images are not downscaled');
  // Check this before the shell icon; otherwise the file-type icon wins.
  assert.match(
    source,
    /async function iconOf\(filePath\)[\s\S]*?pictureOf\(filePath\)[\s\S]*?desktop\.fileIcon/,
    'the file-type icon is picked first'
  );
  // Loading very large images stalls box rendering.
  assert.match(source, /PICTURE_MAX/, 'large images are not filtered out');
});

// When a dragged box hits another box, it stops there. It must not jump after release.
test('a dragged box does not cut into another box', () => {
  const state = baseState({
    fences: [
      fence({ id: 'a', x: 100, y: 300, w: 200, h: 200 }),
      fence({ id: 'b', x: 500, y: 300, w: 300, h: 300 }),
    ],
  });
  const { host, desktop, electron } = loadHost(state);
  desktop.useGrid({ x0: 14, y0: 2, dx: 76, dy: 98 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();

  // Drag a all the way toward b (not released yet).
  host.applyBounds('a', { x: 600, y: 300, w: 200, h: 200 }, false);

  const [a, b] = state.fences;
  assert.equal(a.x, 300, `did not stop against the wall: ${a.x}`);
  const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  assert.equal(overlap, false, 'cut into the box while dragging');
});

test('on release, the box lands where it was shown during the drag', () => {
  const state = baseState({
    fences: [
      fence({ id: 'a', x: 100, y: 300, w: 200, h: 200 }),
      fence({ id: 'b', x: 500, y: 300, w: 300, h: 300 }),
    ],
  });
  const { host, desktop, electron } = loadHost(state);
  desktop.useGrid({ x0: 14, y0: 2, dx: 76, dy: 98 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();

  host.applyBounds('a', { x: 600, y: 300, w: 200, h: 200 }, false);
  const shown = { x: state.fences[0].x, y: state.fences[0].y };
  host.applyBounds('a', { x: 600, y: 300, w: 200, h: 200 }, true);

  const a = state.fences[0];
  assert.ok(Math.abs(a.x - shown.x) <= 2 && Math.abs(a.y - shown.y) <= 2,
    `box jumped on release: ${shown.x},${shown.y} -> ${a.x},${a.y}`);
});

// Unlike a box title, renaming an item actually renames the file in the box folder.
test('renames an item in a box', async () => {
  const state = baseState({ fences: [fence({ title: '일감', items: [realItem('바꿀 것.txt')] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const before = state.fences[0].items[0].path;

  await host.renameItem('a', before, '새 이름.txt');

  const item = state.fences[0].items[0];
  assert.equal(item.name, '새 이름.txt');
  assert.equal(item.path, path.join(path.dirname(before), '새 이름.txt'), 'left the box folder');
  assert.equal(fs.existsSync(before), false, 'the old name still exists');
  assert.equal(fs.existsSync(item.path), true, 'no file with the new name');
});

// When Explorer hides extensions, the box shows the name without one too.
// The user edited that name, so we re-append the extension.
test('items with hidden extensions keep their extension on rename', async () => {
  const state = baseState({ fences: [fence({ items: [realItem('바로가기.lnk')] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const before = state.fences[0].items[0].path;

  await host.renameItem('a', before, '새 바로가기');

  assert.equal(state.fences[0].items[0].name, '새 바로가기.lnk', 'the extension was lost');
});

test('does not rename shell items or use invalid names', async () => {
  const bin = { name: '휴지통', path: 'shell:RecycleBinFolder' };
  const state = baseState({ fences: [fence({ items: [realItem('그대로.txt'), bin] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const at = state.fences[0].items.find((item) => item.name === '그대로.txt').path;

  // Names containing path separators and blank names are rejected.
  await host.renameItem('a', at, 'a/b');
  await host.renameItem('a', at, '   ');
  assert.equal(fs.existsSync(at), true, 'file was lost to an invalid name');
  assert.equal(state.fences[0].items.find((item) => item.path === at).name, '그대로.txt');

  // The Recycle Bin has no file to rename.
  await host.renameItem('a', 'shell:RecycleBinFolder', '새 휴지통');
  assert.equal(state.fences[0].items.find((item) => item.path === bin.path).name, '휴지통');
});

test('asks whether to replace when the new name already exists in the box', async () => {
  const state = baseState({
    fences: [fence({ items: [realItem('먼저.txt'), realItem('나중.txt')] })],
  });
  const { host, electron, asks } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const [first, second] = state.fences[0].items.map((item) => item.path);

  // The default answer is "No", in which case nothing changes.
  await host.renameItem('a', second, '먼저.txt');
  assert.equal(asks.calls.length, 1, 'did not ask whether to replace');
  assert.equal(fs.existsSync(second), true, 'renamed despite declining to replace');
  assert.equal(state.fences[0].items.length, 2);

  electron.setDialogAnswer(0); // Choose Replace
  await host.renameItem('a', second, '먼저.txt');
  assert.deepEqual(electron.shell.trashed, [first], 'the existing item was not sent to the Recycle Bin');
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['먼저.txt'], 'two items remain in the box');
});

// The desktop and a box can each hold a different item with the same name.
// Moving one into the box must keep both without asking.
test('moving into a box never asks to replace; name collisions get a number', async () => {
  // A move is not a replace. An item lives in only one place (desktop or box), so
  // drag-and-drop never produces a counterpart to replace. If a different file with the
  // same name is already in the box folder, a number is appended and both are kept.
  // Nothing is discarded.
  const state = baseState({ fences: [fence({ title: '일감' })] });
  const { host, electron, asks } = loadHost(state);
  host.openAll();
  const mine = path.join(SANDBOX, 'clash-먼저');
  fs.mkdirSync(mine, { recursive: true });
  const first = path.join(mine, '보고서.txt');
  fs.writeFileSync(first, '먼저');

  await host.dropFiles('a', [first], 0);
  assert.equal(asks.calls.length, 0, 'asked although there was no collision');
  assert.equal(state.fences[0].items.length, 1);

  const other = path.join(SANDBOX, 'clash-나중');
  fs.mkdirSync(other, { recursive: true });
  const second = path.join(other, '보고서.txt');
  fs.writeFileSync(second, '나중');

  await host.dropFiles('a', [second], 0);
  assert.equal(asks.calls.length, 0, 'asked to replace during a move');
  assert.deepEqual(electron.shell.trashed, [], 'discarded an existing file during a move');
  assert.equal(fs.existsSync(second), false, 'file was not moved in');
  assert.equal(state.fences[0].items.length, 2, 'not both files were added');
  const names = state.fences[0].items.map((item) => item.name).sort();
  assert.deepEqual(names, ['보고서 (2).txt', '보고서.txt'], `no number was appended: ${names}`);
  const texts = state.fences[0].items.map((item) => fs.readFileSync(item.path, 'utf8')).sort();
  assert.deepEqual(texts, ['나중', '먼저'], 'one of them was overwritten');
});

// Drag-and-drop moves. Copy-paste keeps the desktop original and creates a copy in the box.
test('copying from the desktop and pasting into a box keeps the original', async () => {
  const desk = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-copy-'));
  const source = path.join(desk, '노트.txt');
  fs.writeFileSync(source, '남김');
  const state = baseState({ fences: [fence({ title: '받는 박스' })] });
  const { host, desktop } = loadHost(state);
  desktop.useDesktop(desk);
  host.openAll();
  const clipfiles = require('../src/main/clipfiles');
  clipfiles.write([source], clipfiles.COPY);

  assert.equal(await host.pasteFiles('a'), true);
  assert.equal(fs.existsSync(source), true, 'a copy removed the desktop file');
  assert.equal(fs.readFileSync(source, 'utf8'), '남김');
  assert.equal(state.fences[0].items.length, 1, 'no copy in the box');
  assert.equal(fs.readFileSync(state.fences[0].items[0].path, 'utf8'), '남김');
  assert.equal(path.dirname(state.fences[0].items[0].path) === path.dirname(source), false, 'the copy was created on the desktop');
  assert.equal(clipfiles.read().paths.length, 1, 'a copy stays on the clipboard after one paste');
});

// Cut-paste moves: the file leaves the desktop and the clipboard is cleared.
test('cutting from the desktop and pasting into a box moves the original to the box folder', async () => {
  const desk = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-cut-'));
  const source = path.join(desk, '옮길.txt');
  fs.writeFileSync(source, '이동');
  const state = baseState({ fences: [fence()] });
  const { host } = loadHost(state);
  host.openAll();
  const clipfiles = require('../src/main/clipfiles');
  clipfiles.write([source], clipfiles.MOVE);

  assert.equal(await host.pasteFiles('a'), true);
  assert.equal(fs.existsSync(source), false, 'cut and pasted but it stayed on the desktop');
  assert.equal(state.fences[0].items.length, 1);
  assert.equal(fs.readFileSync(state.fences[0].items[0].path, 'utf8'), '이동');
  assert.equal(clipfiles.read().paths.length, 0, 'still on the clipboard after cut-paste');
});

test('copying from a box keeps the file and puts it on the clipboard for desktop paste', () => {
  const state = baseState({ fences: [fence({ items: [realItem('copy-me.txt')] })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;
  const clipfiles = require('../src/main/clipfiles');

  assert.equal(host.copyItem('a', held), true);
  const clip = clipfiles.read();
  assert.equal(clip.cut, false, 'copy was recorded as cut');
  assert.deepEqual(clip.paths, [held]);
  assert.equal(fs.existsSync(held), true, 'copying removed the box file');
  assert.equal(state.fences[0].items.length, 1);
});

test('cutting from a box and pasting on the desktop removes it from the box', () => {
  const desk = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-out-'));
  const state = baseState({ fences: [fence({ items: [realItem('cut-me.txt')] })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;
  const clipfiles = require('../src/main/clipfiles');

  assert.equal(host.cutItem('a', held), true);
  const clip = clipfiles.read();
  assert.equal(clip.cut, true, 'cut was recorded as copy');
  assert.deepEqual(clip.paths, [held]);
  // On desktop paste, Explorer moves the file. Once it leaves the box folder, drop it from the box.
  fs.renameSync(held, path.join(desk, 'cut-me.txt'));
  host.refreshIcons();
  assert.equal(state.fences[0].items.length, 0, 'moved to the desktop but stayed in the box');
  assert.equal(fs.existsSync(path.join(desk, 'cut-me.txt')), true);
});

test('copies a multi-selection at once and moves it to another box', async () => {
  const state = baseState({
    fences: [
      fence({ id: 'a', title: '첫 박스', items: [realItem('묶음-가.txt'), realItem('묶음-나.txt')] }),
      fence({ id: 'b', title: '둘째 박스', x: 700 }),
    ],
  });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();
  const paths = state.fences[0].items.map((item) => item.path);
  const clipfiles = require('../src/main/clipfiles');

  assert.equal(host.copyItem('a', paths), true);
  assert.deepEqual(clipfiles.read().paths, paths, 'not all selected items were copied');
  assert.equal(state.fences[0].items.length, 2, 'originals were removed while copying');

  assert.equal(host.cutItem('a', paths), true);
  assert.equal(clipfiles.read().cut, true);
  assert.deepEqual(clipfiles.read().paths, paths);

  const target = fenceWindows(electron)[1].getBounds();
  await host.transfer('a', paths[0], target.x + 30, target.y + 60, paths);
  assert.equal(state.fences[0].items.length, 0, 'moved items remained in the first box');
  assert.equal(state.fences[1].items.length, 2, 'did not all go to the second box');
});

test('deleting a multi-selection asks once and sends all to the Recycle Bin', async () => {
  const state = baseState({
    fences: [fence({ items: [realItem('지움-가.txt'), realItem('지움-나.txt')] })],
  });
  const { host, electron, asks } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();
  const paths = state.fences[0].items.map((item) => item.path);

  electron.setDialogAnswer(0);
  assert.equal(await host.trashItems('a', paths), true);
  assert.equal(asks.calls.length, 1, 'asked separately for each item');
  assert.match(asks.calls[0].title, /2개/);
  assert.deepEqual(electron.shell.trashed, paths);
  assert.equal(state.fences[0].items.length, 0);
});

test('the Recycle Bin cannot be copied or cut, and an empty clipboard is not pasted', async () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }, realItem('plain.txt')] })],
  });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  host.refreshIcons();
  host.showMenu('a', 'shell:RecycleBinFolder');
  const labels = electron.menus.at(-1).filter((item) => item.label).map((item) => item.label);
  assert.ok(labels.includes('복사'));
  assert.ok(labels.includes('잘라내기'));
  assert.ok(labels.includes('붙여넣기'));
  const copy = electron.menus.at(-1).find((item) => item.label === '복사');
  const cut = electron.menus.at(-1).find((item) => item.label === '잘라내기');
  assert.equal(copy.enabled, false, 'the Recycle Bin can be copied');
  assert.equal(cut.enabled, false, 'the Recycle Bin can be cut');
  assert.equal(host.copyItem('a', 'shell:RecycleBinFolder'), false);
  assert.equal(await host.pasteFiles('a'), false, 'pasted an empty clipboard');

  host.showMenu('a', null);
  const paste = electron.menus.at(-1).find((item) => item.label === '붙여넣기');
  assert.equal(paste.enabled, false, 'Paste is enabled with nothing to paste');
});
