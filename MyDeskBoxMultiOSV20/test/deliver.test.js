'use strict';

// 박스 창(렌더러)이 쓰는 src/shared/deliver.js 의 순수한 판단. 놓기를 처리하는 쪽은 Rust(src-tauri/src/host/tests_deliver.rs)가 검사한다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const deliver = require('../src/shared/deliver');
const arrange = require('../src/shared/arrange');

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

// Drag and drop is a move, so a program or document never receives the dropped files.
test('programs and documents do not accept drops; only folders and the Recycle Bin do', () => {
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/tool.exe' }), '');
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/노트.txt' }), '');
  assert.equal(deliver.receiveKind({ path: '/Applications/Edit.app' }), '');
  assert.equal(deliver.receiveKind({ path: 'C:/Desktop/할일.bat' }), '');
});
