'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const files = require('../src/main/desktop/files');

test('finds at least one desktop folder', () => {
  const dirs = files.desktopDirectories();
  assert.ok(dirs.length >= 1, 'no desktop folder found');
  for (const dir of dirs) assert.equal(path.isAbsolute(dir), true);
});

test('pairs only items on the desktop with desktop icons', () => {
  const [desk] = files.desktopDirectories();
  assert.ok(files.isOnDesktop(path.join(desk, '아무거나.lnk')), 'should recognize a desktop file');
  assert.equal(files.isOnDesktop(path.join(desk, '하위폴더', 'a.lnk')), false, 'a subfolder is not the desktop');
  assert.equal(files.isOnDesktop(path.join(os.homedir(), 'Documents', 'a.lnk')), false);
  assert.equal(files.isOnDesktop(''), false);
  assert.equal(files.isOnDesktop(null), false);
});

test('the Recycle Bin path is a desktop item even though it is not a file', () => {
  assert.equal(files.isShellItem('shell:RecycleBinFolder'), true);
  assert.equal(files.isOnDesktop('shell:RecycleBinFolder'), true);
  assert.equal(files.isShellItem('C:/Desktop/노트.txt'), false);
  assert.equal(files.isShellItem(''), false);
  assert.equal(files.isShellItem(null), false);
});

test('hidden files and desktop config files are excluded from the list', () => {
  const names = files.listDesktopFiles().map((file) => file.name.toLowerCase());
  assert.equal(names.includes('desktop.ini'), false);
  assert.equal(names.includes('.localized'), false);
  assert.equal(names.includes('.ds_store'), false);
  assert.equal(names.some((name) => name.startsWith('.')), false);
});

test('shortcut names are compared without their extension', () => {
  assert.equal(files.labelOf('MyClock.lnk'), 'MyClock');
  assert.equal(files.labelOf('사이트.url'), '사이트');
  assert.equal(files.labelOf('보고서.txt'), '보고서.txt');

  assert.equal(files.sameName('MyClock', 'MyClock.lnk'), true);
  assert.equal(files.sameName('myclock', 'MyClock.lnk'), true, 'comparison should be case-insensitive');
  assert.equal(files.sameName('MyClock', 'MyClock2.lnk'), false);
  assert.equal(files.sameName('', 'MyClock.lnk'), false);
});

test('a desktop name with the extension hidden still matches its file', () => {
  const notes = { name: '노트.txt', path: 'D:/Desktop/노트.txt' };
  const link = { name: '시계.lnk', path: 'D:/Desktop/시계.lnk' };
  const photo = { name: '사진.png', path: 'D:/Desktop/사진.png' };
  const entries = [notes, link, photo];
  assert.equal(files.matchDesktopEntry('노트', entries), notes);
  assert.equal(files.matchDesktopEntry('노트.txt', entries), notes);
  assert.equal(files.matchDesktopEntry('시계', entries), link);
  assert.equal(files.matchDesktopEntry('사진', entries), photo);
  assert.equal(files.matchDesktopEntry('없는것', entries), null);
  assert.equal(files.matchDesktopEntry('', entries), null);
  // If two files share the same visible name, don't pick either.
  const twin = [notes, { name: '노트.md', path: 'D:/Desktop/노트.md' }];
  assert.equal(files.matchDesktopEntry('노트', twin), null);
});

// With extensions hidden, '보고서.docx' and '보고서.pdf' both appear as '보고서'.
// Simply discarding such names would make drag-and-drop fail for just those icons, so it
// would look like it works for some file types and not others. Instead, return all
// candidates and disambiguate by icon index.
test('returns all candidates when several files look like the same name', () => {
  const docx = { name: '보고서.docx', path: 'D:/Desktop/보고서.docx' };
  const pdf = { name: '보고서.pdf', path: 'D:/Desktop/보고서.pdf' };
  const notes = { name: '노트.txt', path: 'D:/Desktop/노트.txt' };
  const entries = [docx, pdf, notes];
  assert.deepEqual(files.matchDesktopEntries('보고서', entries), [docx, pdf]);
  assert.deepEqual(files.matchDesktopEntries('노트', entries), [notes]);
  // An exact name match returns just that one. This happens when extensions are shown.
  assert.deepEqual(files.matchDesktopEntries('보고서.pdf', entries), [pdf]);
  assert.deepEqual(files.matchDesktopEntries('없는것', entries), []);
  assert.deepEqual(files.matchDesktopEntries('', entries), []);
});

// Found by measurement. Sending LVM_SETWORKAREAS once makes every desktop icon's image
// disappear, leaving only the labels, until Explorer is restarted.
// normalizeList was sending this on every app launch.
// Experiment: restart Explorer, launch the app, then count how many of 27 icons show images.
//   nothing done                -> 27
//   only this message sent      -> 0
//   only icon positioning       -> 27
//   everything except this      -> 27
test('does not touch the desktop icon work area', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'desktop', 'windows.js'), 'utf8');
  assert.doesNotMatch(source, /SendMessage\w*\([^)]*LVM_SETWORKAREAS/, 'the message that erases icon images is back');
});

// Holding means moving the file into the box folder. Desktop icons are only nudged aside.
// A held file leaves the desktop folder and has no icon at all, so there is nothing to position.
test('icons are only nudged aside; holding is handled by the folder', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'desktop', 'windows.js'), 'utf8');
  assert.match(source, /function nudge\(blocks, live\)/, 'no path to nudge icons out of a box area');
  assert.equal(/function layoutGroups\(/.test(source), false, 'the path that gathers icons into box areas still exists');
  assert.equal(/function behindIcons\(/.test(source), false, 'the path that puts a panel behind the icon layer still exists');

  // With auto-arrange on, Explorer immediately undoes the nudged positions.
  assert.match(source, /function manualArrange\(list\)[\s\S]*?turnedOffAutoArrange = true/, 'does not record that auto-arrange was turned off');
  assert.match(source, /function restoreArrange\(\)[\s\S]*?LVS_AUTOARRANGE/, 'does not restore auto-arrange');

  // Snapping boxes to the grid requires knowing the cell size.
  assert.match(source, /function gridInfo\(\)/, 'no path to measure the desktop grid');

  // Never set the hidden attribute on user files. Only the storage folder is hidden.
  assert.equal(/function stashFile/.test(source), false, 'the path that moves files off the desktop still exists');
  assert.equal(/function hideFile\(/.test(source), false, 'the path that sets the hidden attribute on files still exists');
  assert.match(source, /function hidePath\(target\)/, 'no path to hide the storage folder');
});

test('the Recycle Bin icon differs between empty and full', { skip: process.platform !== 'win32' }, () => {
  const desktop = require('../src/main/desktop/windows');
  const empty = desktop.recycleBinIcon(false);
  const full = desktop.recycleBinIcon(true);
  assert.ok(empty && empty.width >= 32, 'no empty Recycle Bin icon');
  assert.ok(full && full.width >= 32, 'no full Recycle Bin icon');
  assert.equal(Buffer.compare(Buffer.from(empty.data), Buffer.from(full.data)) !== 0, true, 'empty and full icons are identical');
});

test('files stashed by earlier versions can be restored', { skip: process.platform !== 'win32' }, () => {
  const desktop = require('../src/main/desktop/windows');
  assert.equal(typeof desktop.stashFile, 'undefined', 'the path that stashes files is still exposed');
  assert.equal(typeof desktop.unstashFile, 'function', 'no path to restore');
});

// Boxes work from their own folders. Desktop icons are no longer touched.
// Moving them or hiding the layer starts an endless fight with Explorer.
test('does not move or hide desktop icons', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'desktop', 'windows.js'), 'utf8');
  assert.equal(/function gather\(/.test(source), false, 'the path that gathers icons still exists');
  assert.equal(/function keepHidden\(/.test(source), false, 'the path that re-hides icons still exists');
  assert.equal(/function holdParked\(/.test(source), false, 'the path that chases and re-hides icons still exists');
  assert.equal(
    /LVM_SETEXTENDEDLISTVIEWSTYLE, BigInt\(LVS_EX_SNAPTOGRID\), 0n/.test(source),
    false,
    'turns off snap-to-grid; that message triggers a full re-arrange'
  );
});

// Users upgrading from earlier versions still have what those versions did. It must be undone once.
test('keeps the paths that undo what earlier versions did', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'desktop', 'windows.js'), 'utf8');
  assert.match(source, /function homeAll/, 'no path to return off-screen icons to their places');
  assert.match(source, /function showLayer/, 'no path to restore the hidden icon layer');
  assert.match(source, /function release\(items\)[\s\S]*?showLayer\(true\)/, 'does not restore the layer when undoing');
  assert.match(source, /function release\(items\)[\s\S]*?homeAll\(\)/, 'does not restore icon positions when undoing');
});

// Double-clicking an empty spot on the desktop hides the boxes; double-clicking again shows them.
// This path talks to Explorer directly and can't be called from tests, so check the conditions in the source text.
test('double-click follows the OS-defined timing', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'desktop', 'windows.js'), 'utf8');

  // Hard-coding something like 320 ms misses double-clicks at normal speed.
  assert.match(source, /function doubleTime\(\)[\s\S]*?GetDoubleClickTime\(\)/, 'does not ask the OS for the interval');
  assert.match(source, /function doubleSlop\(\)[\s\S]*?SM_CXDOUBLECLK/, 'does not ask the OS for the tolerance');
  assert.doesNotMatch(source, /now - last < 320/, 'the interval is hard-coded');

  // Counting releases misses a fast hand's first click entirely. Presses must be counted.
  assert.match(source, /function watchDoubleClick\(onToggle\)[\s\S]*?if \(down && !wasDown\)/, 'does not count presses');
  // Polling often is needed to catch short clicks.
  const every = /function watchDoubleClick\(onToggle\)[\s\S]*?\}, (\d+)\);/.exec(source);
  assert.ok(every && Number(every[1]) <= 20, `polls too rarely: ${every && every[1]} ms`);

  // The desktop must be under the cursor. Checking only the foreground window would also catch clicks on a box.
  assert.match(source, /function watchDoubleClick\(onToggle\)[\s\S]*?desktopAt\(pos\)/, 'does not check what is under the cursor');
  assert.match(source, /function watchDoubleClick\(onToggle\)[\s\S]*?cursorOnIcon\(\)/, 'hides even when clicking on an icon');
  // Counting is delegated to a pure function.
  assert.match(source, /createDeskTaps\(/, 'does not use the double-click counter');
});

test('double-click is wired to toggle hiding', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
  assert.match(main, /watchDoubleClick\(\(\) => host\.toggleHidden\(\)\)/, 'double-clicking does not hide');
});

// The OS's 4 pixels is the threshold for double-clicking icons to open them.
// Demanding that precision for double-clicking empty desktop makes slight hand movement break the count.
test('uses a generous position tolerance for double-click', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'desktop', 'windows.js'), 'utf8');
  assert.match(source, /SLOP_FLOOR = (\d+)/, 'no minimum tolerance');
  const floor = Number(/SLOP_FLOOR = (\d+)/.exec(source)[1]);
  assert.ok(floor >= 20, `position tolerance is too narrow: ${floor} px`);
  assert.match(source, /function doubleSlop\(\)[\s\S]*?SLOP_FLOOR/, 'does not use the minimum tolerance');
});
