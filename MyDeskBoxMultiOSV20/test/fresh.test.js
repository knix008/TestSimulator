'use strict';

// When something newly created on the desktop collides by name with something held in a box.
//
// Held files live in the box folder, so Explorer can't see them. Explorer will
// therefore silently create a new folder or document with the same name.
// At that point we ask whether to replace or keep it; if replacing, it is moved into the box.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadHost, fence, baseState } = require('./helpers/fakes');

function deskDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-desk-'));
}

// Deferred prompts run separately. Wait briefly until the expected state is reached.
async function waitFor(check, what) {
  for (let turn = 0; turn < 60; turn += 1) {
    if (check()) return;
    await new Promise((done) => setTimeout(done, 10));
  }
  assert.fail(what);
}

// There is only one storage module, so leftover work from a previous test can touch the next test's folder.
// Wait for in-flight work to finish before ending a test.
function settle() {
  return new Promise((done) => setTimeout(done, 40));
}

// Open one box backed by a desktop folder and put one file in it.
async function withHeld(name, text) {
  const desk = deskDir();
  const state = baseState({ fences: [fence()] });
  const loaded = loadHost(state);
  loaded.desktop.useDesktop(desk);
  loaded.host.openAll();

  const onDesk = path.join(desk, name);
  fs.writeFileSync(onDesk, text);
  // Look once before dropping. This becomes the 'already existing' snapshot.
  loaded.host.refreshIcons();
  await loaded.host.dropFiles('a', [onDesk], 0);

  assert.equal(state.fences[0].items.length, 1, 'the box should hold one item');
  assert.equal(fs.existsSync(onDesk), false, 'a dropped item should leave the desktop');
  return { ...loaded, desk, state, held: state.fences[0].items[0].path };
}

test('asks whether to replace when creating something with a name already in a box', async () => {
  const room = await withHeld('메모.txt', '묵은 것');
  const again = path.join(room.desk, '메모.txt');
  fs.writeFileSync(again, '새로 만든 것');

  // Anything other than 0 means 'no'. Just check what is asked and leave things as-is.
  room.electron.setDialogAnswer(1);
  room.host.refreshIcons();

  await waitFor(() => room.asks.calls.length > 0, 'did not ask');
  await settle();
  const asked = room.asks.calls[0];
  assert.ok(asked.title.includes('메모.txt'), `prompt does not name the item: ${asked.title}`);
  assert.ok(asked.detail.includes(room.state.fences[0].title), 'prompt does not say which box');
  assert.equal(asked.cancel, '새로 만들기', 'keeping it as-is should also be an option');
});

test('replacing moves the new item into the box and sends the old one to the Recycle Bin', async () => {
  const room = await withHeld('메모.txt', '묵은 것');
  const again = path.join(room.desk, '메모.txt');
  fs.writeFileSync(again, '새로 만든 것');

  room.electron.setDialogAnswer(0);
  room.host.refreshIcons();

  await waitFor(() => room.electron.shell.trashed.length > 0, 'the old item was not sent to the Recycle Bin');
  assert.deepEqual(room.electron.shell.trashed, [room.held], 'only the item held in the box should be trashed');

  await waitFor(() => room.state.fences[0].items.length === 1, 'the box became empty or holds two items');
  const now = room.state.fences[0].items[0].path;
  assert.equal(fs.existsSync(now), true, 'the held file should be in place');
  assert.equal(fs.readFileSync(now, 'utf8'), '새로 만든 것', 'the new item should be held');
  assert.equal(fs.existsSync(again), false, 'nothing should remain on the desktop');
  await settle();
});

test('choosing to create anew leaves it on the desktop and does not touch the box', async () => {
  const room = await withHeld('메모.txt', '묵은 것');
  const again = path.join(room.desk, '메모.txt');
  fs.writeFileSync(again, '새로 만든 것');

  // Anything other than 0 means 'no'. Here that is 'Create new'.
  room.electron.setDialogAnswer(1);
  room.host.refreshIcons();

  await waitFor(() => room.asks.calls.length > 0, 'did not ask');
  await new Promise((done) => setTimeout(done, 30));

  assert.deepEqual(room.electron.shell.trashed, [], 'nothing should be trashed');
  assert.equal(fs.existsSync(again), true, 'the new item should remain on the desktop');
  assert.deepEqual(room.state.fences[0].items.map((item) => item.path), [room.held], 'the box should be unchanged');
  assert.equal(fs.readFileSync(room.held, 'utf8'), '묵은 것');
});

test('does not ask again about something already asked', async () => {
  const room = await withHeld('메모.txt', '묵은 것');
  fs.writeFileSync(path.join(room.desk, '메모.txt'), '새로 만든 것');

  room.electron.setDialogAnswer(1);
  room.host.refreshIcons();
  await waitFor(() => room.asks.calls.length > 0, 'did not ask');

  room.host.refreshIcons();
  room.host.refreshIcons();
  await new Promise((done) => setTimeout(done, 30));

  assert.equal(room.asks.calls.length, 1, `asked ${room.asks.calls.length} times`);
});

test('does not ask when no names collide', async () => {
  const room = await withHeld('메모.txt', '묵은 것');
  fs.writeFileSync(path.join(room.desk, '다른 것.txt'), '새로 만든 것');

  room.electron.setDialogAnswer(0);
  room.host.refreshIcons();
  await new Promise((done) => setTimeout(done, 30));

  assert.deepEqual(room.asks.calls, [], 'asked when it should have stayed quiet');
  assert.deepEqual(room.electron.shell.trashed, [], 'nothing should be trashed');
});

test('does not ask about each item already on the desktop at startup', async () => {
  const desk = deskDir();
  const room = path.join(desk, '메모.txt');
  fs.writeFileSync(room, '처음부터 있던 것');

  const state = baseState({ fences: [fence({ items: [{ name: '메모.txt', path: room }] })] });
  const loaded = loadHost(state);
  loaded.desktop.useDesktop(desk);
  loaded.electron.setDialogAnswer(0);
  loaded.host.openAll();
  await new Promise((done) => setTimeout(done, 30));

  assert.deepEqual(loaded.asks.calls, [], 'asked right at startup');
});

test('replacing keeps the item in the same position in the box', async () => {
  const desk = deskDir();
  const state = baseState({ fences: [fence()] });
  const loaded = loadHost(state);
  loaded.desktop.useDesktop(desk);
  loaded.host.openAll();

  // Hold three items and replace the middle one.
  const names = ['하나.txt', '둘.txt', '셋.txt'];
  for (const name of names) fs.writeFileSync(path.join(desk, name), name);
  loaded.host.refreshIcons();
  await loaded.host.dropFiles('a', names.map((name) => path.join(desk, name)), 0);
  assert.deepEqual(state.fences[0].items.map((item) => item.name), names, 'items should be held in drop order');

  fs.writeFileSync(path.join(desk, '둘.txt'), '새로 만든 것');
  loaded.electron.setDialogAnswer(0);
  loaded.host.refreshIcons();

  await waitFor(() => loaded.electron.shell.trashed.length > 0, 'did not replace');
  await waitFor(() => state.fences[0].items.length === 3, 'the box item count changed');
  assert.deepEqual(
    state.fences[0].items.map((item) => item.name),
    names,
    'the replaced item was pushed to the end'
  );
  const middle = state.fences[0].items[1].path;
  assert.equal(fs.readFileSync(middle, 'utf8'), '새로 만든 것');
  await settle();
});

test('asks about multiple new items one at a time', async () => {
  const desk = deskDir();
  const state = baseState({ fences: [fence()] });
  const loaded = loadHost(state);
  loaded.desktop.useDesktop(desk);
  loaded.host.openAll();

  const names = ['하나.txt', '둘.txt'];
  for (const name of names) fs.writeFileSync(path.join(desk, name), '묵은 것');
  loaded.host.refreshIcons();
  await loaded.host.dropFiles('a', names.map((name) => path.join(desk, name)), 0);

  for (const name of names) fs.writeFileSync(path.join(desk, name), '새로 만든 것');
  loaded.electron.setDialogAnswer(0);
  loaded.host.refreshIcons();

  await waitFor(() => loaded.asks.calls.length === 2, 'did not ask about both');
  await waitFor(() => loaded.electron.shell.trashed.length === 2, 'did not replace both');
  assert.equal(state.fences[0].items.length, 2, 'the box should keep two items');
  for (const item of state.fences[0].items) {
    assert.equal(fs.readFileSync(item.path, 'utf8'), '새로 만든 것');
  }
  // The asked names differ, so the same item was not asked about twice.
  assert.equal(new Set(loaded.asks.calls.map((call) => call.title)).size, 2);
  await settle();
});

test('defers while another prompt is open and asks on the next scan', async () => {
  const room = await withHeld('메모.txt', '묵은 것');
  fs.writeFileSync(path.join(room.desk, '메모.txt'), '새로 만든 것');

  // Show the "create a box?" prompt and leave it unanswered. No other prompt should appear meanwhile.
  let answer = () => {};
  room.asks.hold = new Promise((done) => {
    answer = done;
  });
  const offered = room.host.offerFence({ x: 1200, y: 40, w: 300, h: 240 });
  await waitFor(() => room.asks.calls.length === 1, 'did not ask whether to create a box');

  // This scan cannot ask, so it defers.
  room.host.refreshIcons();
  await new Promise((done) => setTimeout(done, 20));
  assert.equal(room.asks.calls.length, 1, 'asked on top of the previous prompt');

  // Don't create the box, and answer 'Create new' for the deferred one too.
  room.asks.hold = null;
  room.electron.setDialogAnswer(1);
  answer();
  assert.equal(await offered, null, 'a box was created even though we declined');
  assert.equal(room.state.fences.length, 1);

  room.host.refreshIcons();
  await waitFor(() => room.asks.calls.length === 2, 'the deferred prompt was lost');
  assert.ok(room.asks.calls[1].title.includes('메모.txt'), 'did not ask about the deferred item');
  await settle();
});

test('a box holding the Recycle Bin does not collide with a new item of the same name', async () => {
  // Collisions are checked by file name only. Shell item paths carry a 'shell:' prefix,
  // so they can never equal any file name. Comparing by display name ('휴지통') would make
  // a user-created '휴지통' folder on the desktop try to trash the real Recycle Bin.
  const desk = deskDir();
  const state = baseState({ fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })] });
  const loaded = loadHost(state);
  loaded.desktop.useDesktop(desk);
  loaded.host.openAll();

  for (const name of ['휴지통', 'RecycleBinFolder', 'shell꞉RecycleBinFolder']) {
    fs.writeFileSync(path.join(desk, name), '새로 만든 것');
  }
  loaded.electron.setDialogAnswer(0);
  loaded.host.refreshIcons();
  await new Promise((done) => setTimeout(done, 30));

  assert.deepEqual(loaded.asks.calls, [], 'asked about a shell item');
  assert.deepEqual(loaded.electron.shell.trashed, [], 'tried to trash something that cannot be trashed');
  assert.equal(state.fences[0].items.length, 1, 'the Recycle Bin in the box was disturbed');
  assert.equal(state.fences[0].items[0].path, 'shell:RecycleBinFolder');
});

test('changes nothing if sending to the Recycle Bin fails', async () => {
  const room = await withHeld('메모.txt', '묵은 것');
  const again = path.join(room.desk, '메모.txt');
  fs.writeFileSync(again, '새로 만든 것');
  room.electron.shell.trashItem = async () => {
    throw new Error('휴지통이 막혔다');
  };

  room.electron.setDialogAnswer(0);
  room.host.refreshIcons();

  await waitFor(() => room.asks.calls.length > 0, 'did not ask');
  await settle();

  assert.equal(fs.existsSync(again), true, 'the new item disappeared from the desktop');
  assert.deepEqual(room.state.fences[0].items.map((item) => item.path), [room.held], 'the box was disturbed');
  assert.equal(fs.readFileSync(room.held, 'utf8'), '묵은 것', 'the item in the box was changed');
});

test('does not touch the box if the new item disappears while asking', async () => {
  const room = await withHeld('메모.txt', '묵은 것');
  const again = path.join(room.desk, '메모.txt');
  fs.writeFileSync(again, '새로 만든 것');

  // The user deletes it while choosing an answer.
  room.asks.before = () => fs.rmSync(again, { force: true });
  room.electron.setDialogAnswer(0);
  room.host.refreshIcons();

  await waitFor(() => room.asks.calls.length > 0, 'did not ask');
  await settle();

  assert.deepEqual(room.electron.shell.trashed, [], 'trashed the old item with nothing to replace it');
  assert.deepEqual(room.state.fences[0].items.map((item) => item.path), [room.held], 'the box became empty');
  assert.equal(fs.readFileSync(room.held, 'utf8'), '묵은 것');
});

test('does not ask again about an item taken out of the box', async () => {
  const room = await withHeld('메모.txt', '묵은 것');

  // Ejecting returns the file to the desktop, but the box no longer holds it.
  await room.host.eject('a', room.held);
  await waitFor(() => room.state.fences[0].items.length === 0, 'was not ejected');
  room.host.refreshIcons();
  await new Promise((done) => setTimeout(done, 30));

  assert.deepEqual(room.asks.calls, [], 'asked about an item it returned itself');
  assert.equal(fs.existsSync(path.join(room.desk, '메모.txt')), true, 'the ejected item is not on the desktop');
});

test('on Windows, names differing only in case are treated as the same', { skip: process.platform !== 'win32' }, async () => {
  const room = await withHeld('Memo.txt', '묵은 것');
  fs.writeFileSync(path.join(room.desk, 'MEMO.TXT'), '새로 만든 것');

  room.electron.setDialogAnswer(1);
  room.host.refreshIcons();

  await waitFor(() => room.asks.calls.length > 0, 'skipped because the case differed');
  await settle();
});

test('does not ask to replace a file moved from the box folder to the desktop', async () => {
  const room = await withHeld('메모.txt', '하나뿐인 것');
  const back = path.join(room.desk, '메모.txt');

  // The file was dragged from the box folder to the desktop in Explorer. It was moved, not created,
  // and it is the only copy. The box list still records it as held.
  fs.renameSync(room.held, back);
  room.host.refreshIcons();
  await settle();

  assert.deepEqual(room.asks.calls, [], 'asked to replace the only copy');
  assert.deepEqual(room.state.fences[0].items, [], 'still holds a file that no longer exists');
  assert.equal(fs.existsSync(back), true, 'the moved file disappeared');

  // Dropping it back into the box should not collide with anything either.
  await room.host.dropFiles('a', [back], 0);
  await settle();
  assert.deepEqual(room.asks.calls, [], 'asked to replace when dropping it back');
  assert.equal(room.state.fences[0].items.length, 1, 'was not held again');
  assert.equal(fs.readFileSync(room.state.fences[0].items[0].path, 'utf8'), '하나뿐인 것');
});

test('does not ask about a new item when the file the box claims to hold is gone', async () => {
  const room = await withHeld('메모.txt', '묵은 것');

  // The file in the box folder was deleted in Explorer. Only the box list remains.
  fs.rmSync(room.held);
  fs.writeFileSync(path.join(room.desk, '메모.txt'), '새로 만든 것');
  room.host.refreshIcons();
  await settle();

  assert.deepEqual(room.asks.calls, [], 'asked to replace with nothing to discard');
});
