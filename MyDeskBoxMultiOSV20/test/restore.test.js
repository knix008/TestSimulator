'use strict';

// The restore path run when the app is uninstalled or reinstalled.
//
// The installer calls 'MyDeskBox.exe --restore-desktop'.
// Files held in boxes must go back to their recorded location; unrecorded ones go to the desktop.
// desktop.shutdown restores the hidden Recycle Bin and the moved icon positions.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const hold = require('../src/main/hold');
const { restoreDesktop, strayFiles } = require('../src/main/restore');

function room(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `mydeskbox-${name}-`));
}

// Fake desktop module that records what was called.
function fakeDesktop() {
  const calls = { init: [], refreshed: [], shutdown: 0 };
  return {
    calls,
    init: (dir) => calls.init.push(dir),
    refreshFolder: (dir) => calls.refreshed.push(dir),
    shutdown: () => {
      calls.shutdown += 1;
    },
  };
}

// Sets up a box holding the given files. The hold module does the actual holding.
function held(names) {
  const userDir = room('user');
  const desk = room('desk');
  const root = path.join(userDir, 'boxes');
  hold.configure({ root, desktopDir: desk, userDir });
  const fence = { id: 'a', title: '일감', folder: '', items: [] };
  const made = [];
  for (const name of names) {
    const at = path.join(desk, name);
    fs.writeFileSync(at, name);
    made.push(hold.take(fence, { name, path: at }));
  }
  return { userDir, desk, root, fence, made };
}

test('held files are returned to their recorded location', () => {
  const place = held(['노트.txt', '사진.png']);
  const desktop = fakeDesktop();

  const report = restoreDesktop({
    hold,
    desktop,
    userDir: place.userDir,
    desktopDir: place.desk,
    root: place.root,
  });

  assert.equal(report.back.length, 2, 'files were not returned');
  assert.deepEqual(report.left, [], 'some files could not be restored');
  assert.deepEqual(fs.readdirSync(place.desk).sort(), ['노트.txt', '사진.png']);
  for (const item of place.made) {
    assert.equal(fs.existsSync(item.path), false, 'a file was left in the storage folder');
  }
});

test('empty box folders are removed, Explorer is notified, and icon positions are restored', () => {
  const place = held(['노트.txt']);
  const desktop = fakeDesktop();

  restoreDesktop({
    hold,
    desktop,
    userDir: place.userDir,
    desktopDir: place.desk,
    root: place.root,
  });

  assert.deepEqual(fs.readdirSync(path.join(place.root)), ['restore.json'], 'an empty box folder was left behind');
  assert.deepEqual(desktop.calls.init, [place.userDir], 'icon positions were not loaded');
  assert.ok(desktop.calls.refreshed.includes(place.desk), 'Explorer was not notified');
  assert.equal(desktop.calls.shutdown, 1, 'the hidden Recycle Bin and icon positions were not restored');
});

test('unrecorded files are also sent to the desktop', () => {
  // Either the app quit abruptly and the record was lost, or the user dropped the file into the box folder directly.
  // Left in storage, it would not be visible anywhere.
  const place = held(['노트.txt']);
  const box = path.join(place.root, place.fence.folder);
  fs.writeFileSync(path.join(box, '적히지않은.txt'), '기록 없음');
  const desktop = fakeDesktop();

  const report = restoreDesktop({
    hold,
    desktop,
    userDir: place.userDir,
    desktopDir: place.desk,
    root: place.root,
  });

  assert.deepEqual(report.strays.map((at) => path.basename(at)), ['적히지않은.txt']);
  assert.equal(fs.existsSync(path.join(place.desk, '적히지않은.txt')), true);
  assert.deepEqual(report.left, []);
});

test('a name clash on the desktop gets a number so both files are kept', () => {
  const place = held(['노트.txt']);
  // A file with the same name appeared on the desktop after holding.
  fs.writeFileSync(path.join(place.desk, '노트.txt'), '새로 만든 것');
  const desktop = fakeDesktop();

  const report = restoreDesktop({
    hold,
    desktop,
    userDir: place.userDir,
    desktopDir: place.desk,
    root: place.root,
  });

  assert.equal(report.back.length, 1);
  assert.deepEqual(fs.readdirSync(place.desk).sort(), ['노트 (2).txt', '노트.txt'], 'a file was overwritten or left behind');
});

test('nothing happens when nothing is held', () => {
  const userDir = room('user');
  const desk = room('desk');
  const desktop = fakeDesktop();

  const report = restoreDesktop({
    hold,
    desktop,
    userDir,
    desktopDir: desk,
    root: path.join(userDir, 'boxes'),
  });

  assert.deepEqual(report.back, []);
  assert.deepEqual(report.strays, []);
  assert.deepEqual(report.left, []);
  assert.equal(desktop.calls.shutdown, 1, 'the restore step must run even when nothing was hidden');
});

test('nothing is touched when the desktop folder is unknown', () => {
  const place = held(['노트.txt']);
  const desktop = fakeDesktop();

  const report = restoreDesktop({ hold, desktop, userDir: place.userDir, desktopDir: '', root: place.root });

  assert.deepEqual(report.back, []);
  assert.equal(desktop.calls.shutdown, 0, 'ran the shutdown step without knowing where to restore to');
  assert.equal(fs.existsSync(place.made[0].path), true, 'moved files without knowing where to restore them');
});

test('only leftover files in storage are counted, not the files storage itself uses', () => {
  const place = held(['노트.txt']);
  const found = strayFiles(place.root);
  assert.deepEqual(found.map((at) => path.basename(at)), ['노트.txt']);
  assert.equal(found.some((at) => at.endsWith('restore.json')), false, 'tried to move the record file');
});
