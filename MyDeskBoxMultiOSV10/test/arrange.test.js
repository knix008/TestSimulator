'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const arrange = require('../src/shared/arrange');

test('가로가 줄면 뒤의 아이콘만 다음 줄로 내려간다', () => {
  const wide = arrange.gridOf(400, 400, false);
  const narrow = arrange.gridOf(180, 400, false);
  assert.ok(wide.cols > narrow.cols);
  const widePts = arrange.reflowPoints(3, wide);
  const narrowPts = arrange.reflowPoints(3, narrow);
  assert.equal(widePts[0].y, widePts[1].y);
  assert.ok(narrowPts[1].y > narrowPts[0].y);
  assert.ok(narrowPts[0].x < narrowPts[1].x || narrow.cols === 1);
});

test('끌어 오는 칸은 비고 뒤 아이콘은 한 칸 밀린다', () => {
  const grid = arrange.gridOf(400, 400, false);
  const slots = arrange.gapSlots(3, 1, 2);
  assert.deepEqual(slots, [0, 2, 3]);
  const points = arrange.gapPoints(3, 1, { ...grid, cols: 2 });
  assert.notDeepEqual(points[1], points[0]);
  assert.equal(points[1].x, points[0].x);
  assert.ok(points[1].y > points[0].y);
});

test('삽입 위치는 아이콘 수를 넘지 않는다', () => {
  const grid = arrange.gridOf(400, 400, false);
  const at = arrange.insertIndex(grid.originX + grid.cellW, grid.originY, grid, 3);
  assert.equal(at, 1);
  assert.equal(arrange.insertIndex(-100, -100, grid, 3), 0);
  assert.ok(arrange.insertIndex(9999, 9999, grid, 3) <= 3);
});

test('이동은 한 번에 끝나지 않고 목표에 닿는다', () => {
  const step = arrange.ease(0, 100);
  assert.ok(step > 0 && step < 100);
  assert.equal(arrange.ease(98, 100), 100);
});

test('창은 박스보다 그림자 자리만큼 크고, 되돌리면 그대로다', () => {
  const fence = { x: 100, y: 200, w: 400, h: 300, collapsed: false };
  const outer = arrange.windowRect(fence);
  assert.equal(outer.x, 100 - arrange.SHADOW);
  assert.equal(outer.y, 200 - arrange.SHADOW);
  assert.equal(outer.width, 400 + arrange.SHADOW * 2);
  assert.equal(outer.height, 300 + arrange.SHADOW * 2);

  const back = arrange.panelRect(outer);
  assert.deepEqual(back, { x: 100, y: 200, width: 400, height: 300 });
});

test('접은 박스는 제목 줄만 남는다', () => {
  const fence = { x: 0, y: 0, w: 400, h: 300, collapsed: true };
  assert.equal(arrange.panelHeight(fence), arrange.TITLE_H + 4);
  assert.equal(arrange.windowRect(fence).height, arrange.TITLE_H + 4 + arrange.SHADOW * 2);
});
