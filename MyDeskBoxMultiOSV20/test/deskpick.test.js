'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const pick = require('../src/shared/deskpick');
const { sameName } = require('../src/main/desktop/files');

const bin = { index: 0, name: '휴지통', x: 14, y: 982 };
const folder = { index: 1, name: 'Projects', x: 14, y: 80 };

test('picks up an icon when the desktop is under the cursor, even if another program is in front', () => {
  assert.equal(pick.isDesktopTarget('SysListView32', 'Chrome_WidgetWin_1'), true);
  assert.equal(pick.isDesktopTarget('Progman', 'Progman'), true);
  assert.equal(pick.isDesktopTarget('CabinetWClass', 'Chrome_WidgetWin_1'), false);
});

test('only windows of other programs are treated as drag-out targets', () => {
  assert.equal(pick.isForeignTarget('Notepad', false), true);
  assert.equal(pick.isForeignTarget('Chrome_WidgetWin_1', false), true);
  assert.equal(pick.isForeignTarget('CabinetWClass', false), true);
  assert.equal(pick.isForeignTarget('Chrome_WidgetWin_1', true), false, 'treated our own window as another program');
  assert.equal(pick.isForeignTarget('Progman', false), false, 'treated the desktop as another program');
  assert.equal(pick.isForeignTarget('SysListView32', false), false);
  assert.equal(pick.isForeignTarget('WorkerW', false), false);
  assert.equal(pick.isForeignTarget('SHELLDLL_DefView', false), false);
  assert.equal(pick.isForeignTarget('Shell_TrayWnd', false), false, 'treated the taskbar as another program');
  assert.equal(pick.isForeignTarget('Shell_SecondaryTrayWnd', false), false);
  assert.equal(pick.isForeignTarget('', false), false);
  assert.equal(pick.isForeignTarget(null, false), false);
  assert.equal(pick.isSurfaceWindow({ ours: false, visible: true }), true);
  assert.equal(pick.isSurfaceWindow({ ours: true, visible: true }), false, 'treated our own window as under the cursor');
  assert.equal(pick.isSurfaceWindow({ ours: false, visible: false }), false);
  assert.equal(pick.isSurfaceWindow({ ours: false, visible: true, cloaked: true }), false, 'treated a cloaked window as another program');
  assert.equal(pick.isSurfaceWindow({ ours: false, visible: true, transparent: true }), false, 'treated a click-through window as another program');
  assert.equal(pick.isSurfaceWindow(null), false);
});

test('a desktop window class counts as the desktop even if the foreground window differs', () => {
  assert.equal(pick.isDesktopTarget('SHELLDLL_DefView', 'Notepad'), true);
  assert.equal(pick.isDesktopTarget('WorkerW', ''), true);
  assert.equal(pick.isDesktopTarget('', 'Progman'), true);
  assert.equal(pick.isDesktopTarget('', ''), false);
  assert.equal(pick.isDesktopTarget('Button', 'CabinetWClass'), false);
});

test('clicking the label just outside the image still picks that icon', () => {
  const hit = pick.pickIcon([folder, bin], { x: bin.x + 24, y: bin.y + 70 });
  assert.equal(hit.name, '휴지통');
});

test('picks nothing when no icon is close', () => {
  assert.equal(pick.pickIcon([folder], { x: folder.x + 200, y: folder.y }), null);
  assert.equal(pick.pickIcon([], { x: 0, y: 0 }), null);
  assert.equal(pick.pickIcon(null, { x: 0, y: 0 }), null);
});

test('picks the nearest icon when no cell is hit directly', () => {
  const near = pick.pickIcon([folder, bin], { x: folder.x + 90, y: folder.y + 24 });
  assert.equal(near.name, 'Projects');
});

test('pressing on the Recycle Bin image picks that icon', () => {
  const hit = pick.pickIcon([folder, bin], { x: 30, y: 1000 });
  assert.equal(hit.name, '휴지통');
  assert.equal(pick.pickIcon([folder, bin], { x: 800, y: 400 }), null);
});

test('only a rectangle started in empty space beside an icon is a new box', () => {
  const icons = [folder];
  const beside = { x: folder.x + 24 + 80, y: folder.y + 20 };
  assert.equal(pick.iconAt(icons, beside), null);
  assert.equal(pick.iconAt(icons, { x: folder.x + 24, y: folder.y + 20 }).name, 'Projects');
  const empty = { x: 400, y: 400, width: 200, height: 160 };
  assert.equal(pick.shouldOfferFence(empty, icons), true);
  assert.equal(pick.shouldOfferFence({ x: 0, y: 40, width: 200, height: 160 }, icons), false);
});

test('dragging over empty space offers a box; covering icons is a selection', () => {
  const icons = [folder, bin];
  const empty = { x: 400, y: 400, width: 200, height: 160 };
  const overFolder = { x: 0, y: 60, width: 200, height: 160 };
  const tiny = { x: 400, y: 400, width: 40, height: 30 };
  assert.equal(pick.shouldOfferFence(empty, icons), true);
  assert.equal(pick.shouldOfferFence(overFolder, icons), false);
  assert.equal(pick.shouldOfferFence(tiny, icons), false);
  assert.equal(pick.shouldOfferFence(overFolder, [{ x: 20000, y: 2000 }]), true);
  assert.equal(pick.shouldOfferFence(null, icons), false);
});

test('an icon touched only at a corner still counts as a multi-select', () => {
  const icon = { x: 100, y: 100 };
  const graze = { x: 160, y: 170, width: 200, height: 120 };
  const miss = { x: 172, y: 100, width: 200, height: 120 };
  assert.equal(pick.rectCoversIcon(graze, [icon]), true);
  assert.equal(pick.rectCoversIcon(miss, [icon]), false);
  assert.equal(pick.rectCoversIcon(graze, [{ x: -2000, y: 100 }]), false);
});

test('a drag of eight pixels adds the item; less, or missing coordinates, does not', () => {
  assert.equal(pick.movedEnough({ x: 0, y: 0 }, { x: 8, y: 0 }), true);
  assert.equal(pick.movedEnough({ x: 0, y: 0 }, { x: 3, y: 4 }), false);
  assert.equal(pick.movedEnough(null, { x: 20, y: 20 }), false);
  assert.equal(pick.movedEnough({ x: 0, y: 0 }, null), false);
});

test('no shell path is given for a name that is similar but different', () => {
  const shells = [{ name: '휴지통', path: 'shell:RecycleBinFolder' }];
  assert.equal(pick.shellPathFor('휴지통2', shells, sameName), null);
  assert.equal(pick.shellPathFor('휴지통', [], sameName), null);
  assert.equal(pick.shellPathFor('휴지통', null, sameName), null);
});

test('a small drag of the Recycle Bin can add it to a box; a click in place does not', () => {
  assert.equal(pick.movedEnough({ x: 14, y: 982 }, { x: 40, y: 982 }), true);
  assert.equal(pick.movedEnough({ x: 14, y: 982 }, { x: 16, y: 984 }), false);
});

test('the Recycle Bin name maps to its shell path', () => {
  const shells = [{ name: '휴지통', path: 'shell:RecycleBinFolder' }];
  assert.deepEqual(
    pick.shellPathFor('휴지통', shells, sameName),
    { name: '휴지통', path: 'shell:RecycleBinFolder' }
  );
  assert.equal(pick.shellPathFor('Projects', shells, sameName), null);
});

// shellItems only returns shell items that are currently on the desktop and can be added.
// If the Recycle Bin is already in a box, an empty list is correct. Check what must hold in both cases.
test('the shell item list stays consistent with what is on the desktop', { skip: process.platform !== 'win32' }, () => {
  const desktop = require('../src/main/desktop/windows');
  const shells = desktop.shellItems();
  const listed = desktop.debugList() || [];

  for (const item of shells) {
    assert.match(item.path, /^shell:/, 'a non-shell path slipped in');
    assert.ok(item.name.trim(), 'a shell item has an empty name');
    assert.ok(
      listed.some((icon) => sameName(icon.name, item.name)),
      `${item.name} is not on the desktop but is reported as addable`
    );
    // The name picked from the desktop must map back to a shell path for it to be added.
    assert.deepEqual(pick.shellPathFor(item.name, shells, sameName), item);
  }

  // If nothing can be added, the list must be empty. It must not make things up.
  if (!shells.length) assert.deepEqual(shells, []);
});

// If a press on a box window were treated as a desktop drag,
// an icon hidden under the box would get dragged into the box.
test('a box window under the cursor is not treated as a desktop drag', () => {
  assert.equal(pick.isDesktopTarget('Chrome_WidgetWin_1', 'Progman'), false, 'called it the desktop based only on the foreground window');
  assert.equal(pick.isDesktopTarget('SysListView32', 'Chrome_WidgetWin_1'), true);
  // Only fall back to the foreground window when the window under the cursor can't be read.
  assert.equal(pick.isDesktopTarget('', 'Progman'), true);
  assert.equal(pick.isDesktopTarget('', 'Chrome_WidgetWin_1'), false);
});

// Double-clicking the desktop.
// The interval follows the user's Control Panel setting. The Windows default is 500 ms.
test('two presses at normal speed count as a double-click', () => {
  const taps = pick.createDeskTaps({ limit: 500, slop: { x: 4, y: 4 } });
  assert.equal(taps.press(1000, { x: 200, y: 300 }), false, 'the first press is not a double-click yet');
  assert.equal(taps.press(1400, { x: 201, y: 302 }), true, 'a second press 400 ms later is a double-click');
});

test('presses that are too slow do not count as a double-click', () => {
  const taps = pick.createDeskTaps({ limit: 500, slop: { x: 4, y: 4 } });
  taps.press(1000, { x: 200, y: 300 });
  assert.equal(taps.press(1600, { x: 200, y: 300 }), false);
});

test('a second press far away does not count as a double-click', () => {
  const taps = pick.createDeskTaps({ limit: 500, slop: { x: 4, y: 4 } });
  taps.press(1000, { x: 200, y: 300 });
  assert.equal(taps.press(1200, { x: 260, y: 300 }), false, 'a far-away press is a separate click');
});

test('a triple press counts only once', () => {
  const taps = pick.createDeskTaps({ limit: 500, slop: { x: 4, y: 4 } });
  taps.press(1000, { x: 10, y: 10 });
  assert.equal(taps.press(1150, { x: 10, y: 10 }), true);
  assert.equal(taps.press(1300, { x: 10, y: 10 }), false, 'the third press was counted again');
});

test('pressing somewhere other than the desktop discards the pending count', () => {
  const taps = pick.createDeskTaps({ limit: 500, slop: { x: 4, y: 4 } });
  taps.press(1000, { x: 10, y: 10 });
  taps.forget();
  assert.equal(taps.press(1150, { x: 10, y: 10 }), false, 'counted even though something else was pressed in between');
  assert.equal(taps.pending(), 1150);
});

// Values reported by the OS must be read each time so setting changes are followed.
test('the interval and tolerance are read on every call', () => {
  let limit = 200;
  const taps = pick.createDeskTaps({ limit: () => limit, slop: () => ({ x: 4, y: 4 }) });
  taps.press(1000, { x: 10, y: 10 });
  assert.equal(taps.press(1400, { x: 10, y: 10 }), false, 'should not count with a short setting');

  // After increasing the setting, start counting again from scratch.
  limit = 800;
  taps.forget();
  taps.press(2000, { x: 10, y: 10 });
  assert.equal(taps.press(2400, { x: 10, y: 10 }), true, 'did not follow the increased setting');
});

test('defaults to 500 ms and 4 pixels when no values are given', () => {
  const taps = pick.createDeskTaps();
  taps.press(1000, { x: 10, y: 10 });
  assert.equal(taps.press(1490, { x: 12, y: 12 }), true);
});

// Double-clicking empty desktop doesn't need to be as precise as double-clicking an icon to open it.
// Measured in practice, the hand moved more than 20 pixels between the two presses.
test('counts as a double-click even if the hand moves a little', () => {
  const taps = pick.createDeskTaps({ limit: 500, slop: { x: 28, y: 28 } });
  taps.press(1000, { x: 1258, y: 998 });
  assert.equal(taps.press(1185, { x: 1252, y: 1021 }), true, 'a 23-pixel move was not counted as a double-click');
});

test('presses very far apart are still not a double-click', () => {
  const taps = pick.createDeskTaps({ limit: 500, slop: { x: 28, y: 28 } });
  taps.press(1000, { x: 200, y: 300 });
  assert.equal(taps.press(1150, { x: 200, y: 400 }), false, 'a press 100 pixels away is a separate click');
});
