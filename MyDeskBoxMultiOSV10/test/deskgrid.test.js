'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const grid = require('../src/shared/deskgrid');

const AREA = { x: 0, y: 0, width: 1920, height: 1000 };

// 76 x 98 칸에 세로로 늘어선 아이콘들
function column(count, col = 0) {
  return Array.from({ length: count }, (_, i) => ({ index: i, x: col * 76, y: i * 98 }));
}

test('놓인 아이콘을 보고 칸 크기를 알아낸다', () => {
  const found = grid.metrics([
    { x: 20, y: 10 }, { x: 20, y: 108 }, { x: 96, y: 10 }, { x: 96, y: 206 },
  ]);
  assert.deepEqual(found, { x0: 20, y0: 10, dx: 76, dy: 98 });
});

test('아이콘이 하나뿐이면 기본 칸 크기를 쓴다', () => {
  const found = grid.metrics([{ x: 5, y: 7 }]);
  assert.equal(found.dx, grid.FALLBACK.dx);
  assert.equal(found.dy, grid.FALLBACK.dy);
});

test('박스가 없으면 아무것도 옮기지 않는다', () => {
  assert.deepEqual(grid.relocate(column(5), [], AREA), []);
});

// 옮기고 난 뒤 박스에 조금이라도 걸친 아이콘이 남아 있으면 안 된다.
function leftovers(icons, blocks, moves, metrics) {
  const moved = new Map(moves.map((m) => [m.index, m]));
  return icons
    .map((icon) => moved.get(icon.index) || icon)
    .filter((icon) => {
      const cell = grid.cellOf(icon, metrics);
      return grid.blocked(cell, metrics, blocks);
    });
}

test('박스에 걸친 아이콘을 모두 밖으로 옮긴다', () => {
  const icons = column(5);
  const blocks = [{ x: 0, y: 90, width: 200, height: 200 }];
  const metrics = grid.metrics(icons);
  const moves = grid.relocate(icons, blocks, AREA);

  assert.ok(moves.length >= 2, '가려진 아이콘을 옮긴다');
  assert.deepEqual(leftovers(icons, blocks, moves, metrics), [], '박스에 걸친 아이콘이 남았다');
});

test('모서리만 살짝 걸쳐도 밀어낸다', () => {
  // 첫 아이콘 칸(0~98)의 아래쪽 8px 만 덮는 박스
  const icons = column(3);
  const blocks = [{ x: 0, y: 90, width: 200, height: 40 }];
  const moves = grid.relocate(icons, blocks, AREA);
  assert.ok(moves.some((m) => m.index === 0), '살짝 걸친 첫 아이콘도 옮긴다');
});

test('이미 아이콘이 있는 칸으로는 옮기지 않는다', () => {
  const icons = column(4);
  const blocks = [{ x: 0, y: 0, width: 100, height: 100 }];
  const moves = grid.relocate(icons, blocks, AREA);
  assert.ok(moves.length >= 1);

  const busy = new Set(icons.filter((i) => !moves.some((m) => m.index === i.index)).map((i) => `${i.x},${i.y}`));
  for (const move of moves) {
    assert.equal(busy.has(`${move.x},${move.y}`), false, '남의 자리를 빼앗았다');
    busy.add(`${move.x},${move.y}`);
  }
});

test('빈 칸은 위에서 아래로 채운 뒤 옆줄로 넘어간다', () => {
  // 첫 줄을 통째로 덮으면 둘째 줄 맨 위부터 차례로 내려간다.
  const icons = column(3);
  const blocks = [{ x: 0, y: 0, width: 76, height: 1000 }];
  const moves = grid.relocate(icons, blocks, AREA);
  assert.equal(moves.length, 3);
  assert.deepEqual(moves.map((m) => m.x), [76, 76, 76], '바로 옆줄로 간다');
  assert.deepEqual(moves.map((m) => m.y), [0, 98, 196], '위에서부터 채운다');
});

test('놓을 자리가 없으면 그대로 둔다', () => {
  const icons = column(3);
  const tiny = { x: 0, y: 0, width: 76, height: 300 };
  const blocks = [{ x: 0, y: 0, width: 2000, height: 2000 }];
  const moves = grid.relocate(icons, blocks, tiny);
  assert.deepEqual(moves, [], '갈 곳이 없으면 건드리지 않는다');
});

test('겹침 판정', () => {
  const a = { x: 0, y: 0, width: 10, height: 10 };
  assert.equal(grid.overlaps(a, { x: 5, y: 5, width: 10, height: 10 }), true);
  assert.equal(grid.overlaps(a, { x: 10, y: 0, width: 10, height: 10 }), false, '맞닿기만 한 것은 겹친 것이 아니다');
});
