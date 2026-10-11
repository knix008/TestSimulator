'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const arrange = require('../src/shared/arrange');

test('when width shrinks, only trailing icons wrap to the next row', () => {
  const wide = arrange.gridOf(400, 400, false);
  const narrow = arrange.gridOf(180, 400, false);
  assert.ok(wide.cols > narrow.cols);
  const widePts = arrange.reflowPoints(3, wide);
  const narrowPts = arrange.reflowPoints(3, narrow);
  assert.equal(widePts[0].y, widePts[1].y);
  assert.ok(narrowPts[1].y > narrowPts[0].y);
  assert.ok(narrowPts[0].x < narrowPts[1].x || narrow.cols === 1);
});

test('the drop slot opens up and later icons shift by one slot', () => {
  const grid = arrange.gridOf(400, 400, false);
  const slots = arrange.gapSlots(3, 1, 2);
  assert.deepEqual(slots, [0, 2, 3]);
  const points = arrange.gapPoints(3, 1, { ...grid, cols: 2 });
  assert.notDeepEqual(points[1], points[0]);
  assert.equal(points[1].x, points[0].x);
  assert.ok(points[1].y > points[0].y);
});

test('insert index never exceeds the icon count', () => {
  const grid = arrange.gridOf(400, 400, false);
  const at = arrange.insertIndex(grid.originX + grid.cellW, grid.originY, grid, 3);
  assert.equal(at, 1);
  assert.equal(arrange.insertIndex(-100, -100, grid, 3), 0);
  assert.ok(arrange.insertIndex(9999, 9999, grid, 3) <= 3);
});

test('movement reaches the target over several steps, not in one jump', () => {
  const step = arrange.ease(0, 100);
  assert.ok(step > 0 && step < 100);
  assert.equal(arrange.ease(98, 100), 100);
});

test('the window is larger than the box by the shadow margin and converts back exactly', () => {
  const fence = { x: 100, y: 200, w: 400, h: 300, collapsed: false };
  const plain = arrange.windowRect(fence);
  assert.equal(plain.x, 100);
  assert.equal(plain.y, 200);
  assert.equal(plain.width, 400);
  assert.equal(plain.height, 300);
  assert.deepEqual(arrange.panelRect(plain), { x: 100, y: 200, width: 400, height: 300 });

  const outer = arrange.windowRect(fence, true);
  assert.equal(outer.x, 100 - arrange.SHADOW);
  assert.equal(outer.y, 200 - arrange.SHADOW);
  assert.equal(outer.width, 400 + arrange.SHADOW * 2);
  assert.equal(outer.height, 300 + arrange.SHADOW * 2);

  const back = arrange.panelRect(outer, true);
  assert.deepEqual(back, { x: 100, y: 200, width: 400, height: 300 });
});

test('a single step is at most 28 and moves toward the target', () => {
  assert.equal(arrange.ease(0, 200), 28);
  assert.equal(arrange.ease(200, 0), 172);
  assert.equal(arrange.ease(10, 11), 11);
});

test('inserting at the start or end opens only that slot', () => {
  assert.deepEqual(arrange.gapSlots(3, 0, 2), [1, 2, 3]);
  assert.deepEqual(arrange.gapSlots(3, 3, 2), [0, 1, 2]);
  assert.deepEqual(arrange.gapSlots(3, 99, 2), [0, 1, 2]);
  assert.deepEqual(arrange.gapSlots(0, 0, 2), []);
});

test('slot indexes run left to right, then wrap to the next row', () => {
  assert.deepEqual(arrange.placeIndex(0, 3), { col: 0, row: 0 });
  assert.deepEqual(arrange.placeIndex(3, 3), { col: 0, row: 1 });
  assert.deepEqual(arrange.placeIndex(5, 3), { col: 2, row: 1 });
});

test('when collapsed, there are no icon rows but one row of slots remains', () => {
  const grid = arrange.gridOf(400, 40, true);
  assert.equal(grid.rows, 1);
  assert.ok(grid.cols >= 1);
});

test('a collapsed box keeps only its title bar', () => {
  const fence = { x: 0, y: 0, w: 400, h: 300, collapsed: true };
  assert.equal(arrange.panelHeight(fence), arrange.TITLE_H + 4);
  assert.equal(arrange.windowRect(fence).height, arrange.TITLE_H + 4);
  assert.equal(arrange.windowRect(fence, true).height, arrange.TITLE_H + 4 + arrange.SHADOW * 2);
});

test('a drag-selection rectangle picks only the icons it touches', () => {
  // Wide enough for three slots per row. Each slot is 86 wide with a 12px left margin.
  const grid = arrange.gridOf(400, 400, false);
  assert.ok(grid.cols >= 3);
  const points = arrange.reflowPoints(3, grid);
  // A rectangle around just the first slot.
  const one = {
    x1: points[0].x + 2,
    y1: points[0].y + 2,
    x2: points[0].x + grid.cellW - 2,
    y2: points[0].y + grid.cellH - 2,
  };
  assert.deepEqual(arrange.bandPicks(one, 3, grid), [0]);
  // A rectangle spanning the first and second slots.
  const two = { x1: points[0].x + 40, y1: points[0].y + 4, x2: points[1].x + 40, y2: points[1].y + 40 };
  assert.deepEqual(arrange.bandPicks(two, 3, grid), [0, 1]);
  // Dragging backwards (bottom-right to top-left) gives the same result.
  const back = { x1: two.x2, y1: two.y2, x2: two.x1, y2: two.y1 };
  assert.deepEqual(arrange.bandPicks(back, 3, grid), [0, 1]);
});

test('brushing only the gap between slots picks nothing', () => {
  const grid = arrange.gridOf(400, 400, false);
  const points = arrange.reflowPoints(2, grid);
  // Between the right edge of the first slot and the left edge of the second, where no icon is drawn.
  const gap = {
    x1: points[1].x - 4,
    y1: points[0].y + 40,
    x2: points[1].x + 4,
    y2: points[0].y + 44,
  };
  assert.deepEqual(arrange.bandPicks(gap, 2, grid), []);
  // The same goes for the vertical gap between rows.
  const between = { x1: points[0].x + 40, y1: points[0].y - 5, x2: points[0].x + 44, y2: points[0].y + 2 };
  assert.deepEqual(arrange.bandPicks(between, 2, grid), []);
});

test('with no icons, the selection rectangle picks nothing', () => {
  const grid = arrange.gridOf(400, 400, false);
  assert.deepEqual(arrange.bandPicks({ x1: 0, y1: 0, x2: 400, y2: 400 }, 0, grid), []);
  assert.deepEqual(arrange.bandPicks(null, 3, grid), []);
});
