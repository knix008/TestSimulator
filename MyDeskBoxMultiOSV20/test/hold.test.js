'use strict';

// The storage folder. Holding means moving a file in here,
// and ejecting means sending it back to the folder it came from.
// What came from where is recorded in restore.json inside the storage folder.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const hold = require('../src/main/hold');

function room(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `mydeskbox-${name}-`));
}

// Give each test a fresh, empty storage folder and desktop.
function fresh() {
  const root = room('hold');
  const desk = room('desk');
  const user = room('user');
  hold.configure({ root, desktopDir: desk, userDir: user });
  return { root, desk, user };
}

function fileIn(dir, name, body = '') {
  const at = path.join(dir, name);
  fs.writeFileSync(at, body);
  return { name, path: at };
}

function box(extra) {
  return { id: 'a', title: '일감', folder: '', items: [], ...extra };
}

// The storage folder is not meant for people to browse. On the desktop, anyone with
// 'Show hidden items' on would see an extra folder, so it lives in the user data folder.
test('uses boxes under the user data folder when no storage folder is configured', () => {
  const user = room('user');
  const desk = room('desk');
  hold.configure({ root: '', desktopDir: desk, userDir: user });
  assert.equal(hold.rootDir(), path.join(user, 'boxes'));
  assert.equal(hold.rootDir().includes('.MyDeskBox'), false, 'still uses the hidden desktop folder');
  assert.equal(hold.rootDir().startsWith(desk), false, 'placed under the desktop');
});

test('does not try to hide storage in the user folder', () => {
  const user = room('user');
  const desk = room('desk');
  const asked = [];
  hold.configure({ root: '', desktopDir: desk, userDir: user, hide: (dir) => asked.push(dir) });
  hold.ensureRoot();
  assert.deepEqual(asked, [], 'tried to hide a folder that has no reason to be hidden');
});

test('asks to hide storage configured to live on the desktop', () => {
  const desk = room('desk');
  const asked = [];
  const onDesk = path.join(desk, 'boxes');
  hold.configure({ root: onDesk, desktopDir: desk, hide: (dir) => asked.push(dir) });
  assert.equal(hold.ensureRoot(), onDesk);
  assert.deepEqual(asked, [onDesk], 'did not hide storage placed on the desktop');
});

// Earlier versions used a hidden folder under the desktop. Upgraded users' files must not be left behind.
test('migrates leftover storage from an earlier version on the desktop', () => {
  const desk = room('desk');
  const user = room('user');
  const legacy = path.join(desk, '.MyDeskBox');
  fs.mkdirSync(path.join(legacy, '지난 박스'), { recursive: true });
  fs.writeFileSync(path.join(legacy, '지난 박스', '담긴.txt'), '내용');
  fs.writeFileSync(path.join(legacy, 'restore.json'), '{"version":1,"items":[]}');

  hold.configure({ root: '', desktopDir: desk, userDir: user });
  const root = hold.ensureRoot();

  assert.equal(fs.existsSync(path.join(root, '지난 박스', '담긴.txt')), true, 'did not migrate the held file');
  assert.equal(fs.readFileSync(path.join(root, '지난 박스', '담긴.txt'), 'utf8'), '내용');
  assert.equal(fs.existsSync(legacy), false, 'left an empty folder on the desktop');
});

test('does not touch the desktop when there is nothing to migrate', () => {
  const desk = room('desk');
  const user = room('user');
  hold.configure({ root: '', desktopDir: desk, userDir: user });
  hold.ensureRoot();
  assert.deepEqual(fs.readdirSync(desk), [], 'created something on the desktop');
});

test('no storage folder when there is nowhere to put it', () => {
  hold.configure({ root: '', desktopDir: '', userDir: '' });
  assert.equal(hold.rootDir(), '');
  assert.equal(hold.ensureRoot(), '');
});

test('holding moves the file into the box folder', () => {
  const { root, desk } = fresh();
  const one = fileIn(desk, '보고서.txt', '내용');
  const fence = box();

  const moved = hold.take(fence, one);

  assert.equal(moved.path, path.join(root, '일감', '보고서.txt'));
  assert.equal(fs.existsSync(one.path), false, 'still left in its original place');
  assert.equal(fs.readFileSync(moved.path, 'utf8'), '내용', 'contents changed');
  assert.equal(moved.home, desk, 'did not record where it came from');
});

test('ejecting returns the file to its original folder', () => {
  const { desk } = fresh();
  const one = fileIn(desk, '노트.txt', '글');
  const fence = box();
  const moved = hold.take(fence, one);

  const back = hold.give(moved);

  assert.equal(back, path.join(desk, '노트.txt'));
  assert.equal(fs.existsSync(moved.path), false, 'still left in storage');
  assert.equal(fs.readFileSync(back, 'utf8'), '글');
});

test('goes to the desktop if the original folder is gone', () => {
  const { desk } = fresh();
  const gone = room('gone');
  const one = fileIn(gone, '떠돌이.txt');
  const moved = hold.take(box(), one);
  fs.rmSync(gone, { recursive: true, force: true });

  const back = hold.give(moved);

  assert.equal(path.dirname(back), desk, 'did not bring the orphaned file to the desktop');
});

test('adds a number instead of overwriting when the name exists', () => {
  const { root, desk } = fresh();
  const fence = box();
  hold.take(fence, fileIn(desk, '같은이름.txt', '먼저'));
  const second = room('other');
  const moved = hold.take(fence, fileIn(second, '같은이름.txt', '나중'));

  assert.equal(moved.path, path.join(root, '일감', '같은이름 (2).txt'));
  assert.equal(fs.readFileSync(path.join(root, '일감', '같은이름.txt'), 'utf8'), '먼저', 'overwrote the earlier file');
});

test('leaves alone anything already in the box folder', () => {
  const { desk } = fresh();
  const fence = box();
  const moved = hold.take(fence, fileIn(desk, '한번.txt'));
  const again = hold.take(fence, moved);
  assert.equal(again.path, moved.path, 'moved again within the box');
  assert.equal(again.home, moved.home, 'forgot where it came from');
});

test('folder names come from the box name with invalid characters removed', () => {
  fresh();
  assert.equal(hold.safeName('보고서', 'id1'), '보고서');
  assert.equal(hold.safeName('a/b\\c:d*e?f"g<h>i|j', 'id1'), 'a b c d e f g h i j');
  assert.equal(hold.safeName('   ', 'abcdefghij'), 'box-abcdefgh', 'uses the box id when the name is entirely stripped');
  assert.equal(hold.safeName('끝에 점.', 'id1'), '끝에 점', 'Windows does not accept a trailing dot');
});

test('two boxes with the same name do not share a folder', () => {
  const { root } = fresh();
  const first = box({ id: 'a' });
  const second = box({ id: 'b' });
  hold.dirFor(first);
  hold.dirFor(second);
  assert.notEqual(first.folder, second.folder, 'two boxes share one folder');
  assert.equal(fs.existsSync(path.join(root, second.folder)), true);
});

test('a folder, once chosen, stays the same when the box is renamed', () => {
  fresh();
  const fence = box();
  hold.dirFor(fence);
  const folder = fence.folder;
  fence.title = '다른 이름';
  hold.dirFor(fence);
  assert.equal(fence.folder, folder);
});

test('lists the box folder contents by name', () => {
  const { desk } = fresh();
  const fence = box();
  hold.take(fence, fileIn(desk, 'a.txt'));
  hold.take(fence, fileIn(desk, 'b.txt'));
  assert.deepEqual(hold.names(fence).sort(), ['a.txt', 'b.txt']);
});

test('removes only empty box folders', () => {
  const { root, desk } = fresh();
  const fence = box();
  const moved = hold.take(fence, fileIn(desk, 'c.txt'));
  assert.equal(hold.drop(fence), false, 'removed the folder while it still had contents');
  hold.give(moved);
  assert.equal(hold.drop(fence), true);
  assert.equal(fs.existsSync(path.join(root, fence.folder)), false);
});

// If the app exits abruptly, layout.json may not get written. Restore from the record in storage.
test('can restore from the record kept in storage', () => {
  const { root, desk } = fresh();
  const fence = box();
  const moved = hold.take(fence, fileIn(desk, '남은.txt', '남은 것'));

  const noted = JSON.parse(fs.readFileSync(path.join(root, 'restore.json'), 'utf8'));
  assert.equal(noted.items.length, 1);
  assert.equal(noted.items[0].home, desk, 'did not record where it came from');

  // Clear in-memory state as if on next launch, and read only what is in the file.
  hold.configure({ root, desktopDir: desk });
  const back = hold.recover([]);

  assert.deepEqual(back, [path.join(desk, '남은.txt')]);
  assert.equal(fs.existsSync(moved.path), false, 'still left in storage');
  assert.equal(fs.readFileSync(path.join(desk, '남은.txt'), 'utf8'), '남은 것');
});

test('does not restore items a box still holds', () => {
  const { root, desk } = fresh();
  const fence = box();
  const kept = hold.take(fence, fileIn(desk, '담긴.txt'));
  const stray = hold.take(fence, fileIn(desk, '남은.txt'));

  hold.configure({ root, desktopDir: desk });
  const back = hold.recover([kept.path]);

  assert.deepEqual(back, [path.join(desk, '남은.txt')]);
  assert.equal(fs.existsSync(kept.path), true, 'sent back an item the box holds');
});

test('removes restored items from the record', () => {
  const { root, desk } = fresh();
  hold.take(box(), fileIn(desk, '한번만.txt'));
  hold.configure({ root, desktopDir: desk });
  hold.recover([]);
  const noted = JSON.parse(fs.readFileSync(path.join(root, 'restore.json'), 'utf8'));
  assert.deepEqual(noted.items, [], 'the record remained after restoring');
});

test('tells whether a file is inside storage', () => {
  const { root, desk } = fresh();
  assert.equal(hold.inside(path.join(root, '일감', 'a.txt')), true);
  assert.equal(hold.inside(path.join(desk, 'a.txt')), false);
  assert.equal(hold.inside(''), false);
});

test('ignores requests to eject a missing file', () => {
  const { root } = fresh();
  assert.equal(hold.give({ path: path.join(root, '없는', 'x.txt'), home: '' }), '');
  assert.equal(hold.give(null), '');
  assert.equal(hold.take(box(), null), null);
});

// Moving from box to box. The source is the previous box's folder, but home is the desktop.
test('remembers the original folder when moving between boxes', () => {
  const { desk } = fresh();
  const first = box({ id: 'a', title: '첫 박스' });
  const second = box({ id: 'b', title: '둘째 박스' });
  const moved = hold.take(first, fileIn(desk, '옮길.txt', '글'));
  // Moves between boxes don't carry the home along; only the path is passed.
  const again = hold.take(second, { name: moved.name, path: moved.path });

  assert.equal(path.dirname(again.path), path.join(hold.rootDir(), '둘째 박스'), 'did not go to the second box');
  assert.equal(again.home, desk, 'recorded home as the previous box folder');
  assert.equal(hold.give(again), path.join(desk, '옮길.txt'), 'ejecting sent it to the previous box folder');
});

test('moving between boxes removes the previous box record', () => {
  const { root, desk } = fresh();
  const first = box({ id: 'a', title: '첫 박스' });
  const second = box({ id: 'b', title: '둘째 박스' });
  const moved = hold.take(first, fileIn(desk, '한번.txt'));
  const again = hold.take(second, { name: moved.name, path: moved.path });

  const noted = JSON.parse(fs.readFileSync(path.join(root, 'restore.json'), 'utf8'));
  assert.deepEqual(noted.items.map((row) => row.path), [again.path], 'the previous box record remained');
});

// The desktop and a box can each have an item with the same name. We must know before holding so we can ask.
test('reports a name-colliding file before holding', () => {
  const { root, desk } = fresh();
  const fence = box();
  hold.take(fence, fileIn(desk, '겹치는이름.txt', '먼저'));
  const other = room('other');
  const coming = fileIn(other, '겹치는이름.txt', '나중');

  assert.equal(hold.clash(fence, coming.path), path.join(root, '일감', '겹치는이름.txt'));
  assert.equal(hold.clash(fence, fileIn(other, '딴이름.txt').path), '', 'reports a collision for a non-colliding name');
  // Something already in the box folder does not collide with itself.
  assert.equal(hold.clash(fence, path.join(root, '일감', '겹치는이름.txt')), '');
  assert.equal(hold.clash(box({ folder: '' }), coming.path), '', 'a box without a folder has nothing to collide with');
});

test('renaming a file in a box carries its origin over to the new name', () => {
  const { root, desk } = fresh();
  const fence = box();
  const moved = hold.take(fence, fileIn(desk, '처음.txt', '글'));

  const next = hold.relabel(moved, '나중.txt');

  assert.equal(next.path, path.join(root, '일감', '나중.txt'));
  assert.equal(next.name, '나중.txt');
  assert.equal(next.home, desk, 'forgot where it came from');
  assert.equal(fs.existsSync(moved.path), false, 'the old name still exists');
  assert.equal(fs.readFileSync(next.path, 'utf8'), '글');
  assert.equal(hold.noted(next.path), desk, 'restore.json does not know the new name');
  assert.equal(hold.noted(moved.path), '', 'restore.json still has the old name');

  // Ejecting sends it to the original folder under the new name.
  assert.equal(hold.give(next), path.join(desk, '나중.txt'));
});

test('does not touch the file when the new name is invalid', () => {
  const { desk } = fresh();
  const fence = box();
  const moved = hold.take(fence, fileIn(desk, '그대로.txt', '글'));

  assert.equal(hold.relabel(moved, ''), null);
  assert.equal(hold.relabel(null, '뭐든.txt'), null);
  assert.equal(fs.existsSync(moved.path), true, 'failed to rename and lost the file');
});

test('marks stuck when the move fails', () => {
  // A file with the same name sits where the storage folder should go, so the folder can't be created.
  // With nowhere to move to, the file stays where it was.
  // The holding side (fences.js bringIn) checks this flag and does not hold it. Listing it as held
  // would show the file in the box while it is still on the desktop.
  const desk = room('desk');
  const user = room('user');
  const root = path.join(room('hold'), 'boxes');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, '일감'), '폴더가 아니다');
  hold.configure({ root, desktopDir: desk, userDir: user });
  const one = fileIn(desk, '메모.txt', '하나뿐');
  const got = hold.take(box({ folder: '일감' }), one);
  assert.equal(got.stuck, true, 'did not report the failed move');
  assert.equal(got.path, one.path, 'reports a different location despite failing to move');
  assert.equal(fs.existsSync(one.path), true, 'the file disappeared despite failing to move');
});

test('moved items are not marked stuck', () => {
  const { desk } = fresh();
  const got = hold.take(box(), fileIn(desk, '메모.txt', '하나뿐'));
  assert.equal(got.stuck, undefined, 'reports a successful move as failed');
});
