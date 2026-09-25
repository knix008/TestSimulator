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
  assert.deepEqual(
    { x0: found.x0, y0: found.y0, dx: found.dx, dy: found.dy },
    { x0: 20, y0: 10, dx: 76, dy: 98 }
  );
});

// 격자의 원점을 '맨 앞 아이콘의 자리'로 삼으면, 아이콘을 밀어낼 때마다 격자가 통째로
// 움직인다. 그 격자에 박스를 맞추면 박스가 저 혼자 걸어 다닌다.
// 같은 격자 위에 있는 한, 어느 아이콘이 어디에 있든 원점은 같아야 한다.
test('아이콘이 밀려나도 격자는 그대로다', () => {
  const before = grid.steady(grid.metrics([
    { x: 20, y: 10 }, { x: 96, y: 10 }, { x: 20, y: 108 },
  ]));
  // 맨 앞 아이콘이 오른쪽 아래로 밀려난 뒤.
  const after = grid.steady(grid.metrics([
    { x: 96, y: 108 }, { x: 172, y: 108 }, { x: 96, y: 206 },
  ]));
  assert.deepEqual(before, after, '아이콘이 움직였다고 격자가 따라 움직였다');
});

test('격자가 그대로면 박스도 제자리에 머문다', () => {
  const first = grid.steady(grid.metrics([{ x: 20, y: 10 }, { x: 96, y: 10 }, { x: 20, y: 108 }]));
  const box = grid.snapRect({ x: 300, y: 300, width: 320, height: 300 }, first);
  // 아이콘이 밀려난 뒤 같은 박스를 다시 맞춰도 자리가 같아야 한다.
  const later = grid.steady(grid.metrics([{ x: 96, y: 108 }, { x: 172, y: 108 }]));
  assert.deepEqual(grid.snapRect(box, later), box, '박스가 저 혼자 움직였다');
});

// 같은 자리를 되풀이해 맞춰도 값이 흘러가면 안 된다.
// 한 번 맞춘 박스는 다시 맞춰도 그대로여야 저 혼자 걸어 다니지 않는다.
test('한 번 맞춘 박스는 다시 맞춰도 그대로다', () => {
  const metrics = grid.steady(grid.metrics([{ x: 20, y: 10 }, { x: 96, y: 10 }, { x: 20, y: 108 }]));
  for (const drawn of [
    { x: 300, y: 300, width: 320, height: 300 },
    { x: 317, y: 206, width: 231, height: 197 },
    { x: 96, y: 108, width: 152, height: 196 },
  ]) {
    let box = grid.snapRect(drawn, metrics);
    for (let turn = 0; turn < 6; turn += 1) box = grid.snapRect(box, metrics);
    assert.deepEqual(box, grid.snapRect(drawn, metrics), `자리가 흘러갔다: ${JSON.stringify(drawn)}`);
  }
});

// 박스끼리는 겹치지 않는다.
test('겹친 박스는 가장 적게 움직이는 쪽으로 비킨다', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1200 };
  const other = { x: 500, y: 300, width: 400, height: 400 };
  // 오른쪽에서 조금 겹쳤으면 오른쪽으로 비킨다.
  const moved = grid.pushOut({ x: 860, y: 300, width: 300, height: 300 }, [other], area);
  assert.equal(moved.x, 900, '가장 가까운 쪽으로 비키지 않았다');
  assert.equal(moved.y, 300, '건드릴 까닭이 없는 쪽을 움직였다');
  assert.equal(grid.overlaps(moved, other), false, '아직 겹친다');
});

test('겹치지 않는 박스는 건드리지 않는다', () => {
  const other = { x: 500, y: 300, width: 400, height: 400 };
  const kept = { x: 100, y: 100, width: 200, height: 200 };
  assert.deepEqual(grid.pushOut(kept, [other]), kept);
  assert.deepEqual(grid.pushOut(kept, []), kept);
});

test('박스 셋이 겹쳐도 모두 풀어 준다', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1200 };
  const others = [
    { x: 400, y: 200, width: 300, height: 300 },
    { x: 700, y: 200, width: 300, height: 300 },
  ];
  const moved = grid.pushOut({ x: 650, y: 250, width: 200, height: 200 }, others, area);
  for (const other of others) {
    assert.equal(grid.overlaps(moved, other), false, `아직 겹친다: ${JSON.stringify(moved)}`);
  }
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

test('밀려난 아이콘은 바로 옆의 빈 줄로 간다', () => {
  // 첫 줄을 통째로 덮으면 옆줄의 같은 높이로 한 걸음만 옮긴다.
  const icons = column(3);
  const blocks = [{ x: 0, y: 0, width: 76, height: 1000 }];
  const moves = grid.relocate(icons, blocks, AREA);
  assert.equal(moves.length, 3);
  assert.deepEqual(moves.map((m) => m.x), [76, 76, 76], '바로 옆줄로 간다');
  assert.deepEqual(moves.map((m) => m.y), [0, 98, 196], '있던 높이를 지킨다');
});

// 밀려나는 아이콘은 제자리에서 가장 가까운 빈 칸으로 가야 한다.
// 늘 맨 앞 빈 칸으로 보내면 박스를 옮길 때마다 바탕화면이 통째로 다시 정렬된 것처럼 보인다.
test('멀리 있던 아이콘을 화면 맨 앞으로 보내지 않는다', () => {
  // 왼쪽 위는 텅 비어 있고, 오른쪽 아래의 아이콘 하나만 박스에 가린다.
  const icons = [{ index: 0, x: 76 * 10, y: 98 * 5 }];
  const blocks = [{ x: 76 * 10 - 10, y: 98 * 5 - 10, width: 96, height: 118 }];
  const moves = grid.relocate(icons, blocks, AREA);

  assert.equal(moves.length, 1);
  const cell = grid.cellOf(moves[0], grid.steady(grid.metrics(icons)));
  assert.ok(Math.abs(cell.col - 10) <= 2 && Math.abs(cell.row - 5) <= 2, `너무 멀리 갔다: ${cell.col},${cell.row}`);
});

test('놓을 자리가 없으면 그대로 둔다', () => {
  const icons = column(3);
  const tiny = { x: 0, y: 0, width: 76, height: 300 };
  const blocks = [{ x: 0, y: 0, width: 2000, height: 2000 }];
  const moves = grid.relocate(icons, blocks, tiny);
  assert.deepEqual(moves, [], '갈 곳이 없으면 건드리지 않는다');
});

test('아주 좁은 간격은 칸 크기로 쓰지 않는다', () => {
  assert.equal(grid.smallestGap([0, 4, 80], 76), 76);
  assert.equal(grid.smallestGap([10], 98), 98);
  assert.equal(grid.smallestGap([], 98), 98);
});

test('칸의 오른쪽과 아래 경계는 그 칸에 속하지 않는다', () => {
  const box = { x: 10, y: 20, width: 30, height: 40 };
  assert.equal(grid.inside({ x: 10, y: 20 }, box), true);
  assert.equal(grid.inside({ x: 39, y: 59 }, box), true);
  assert.equal(grid.inside({ x: 40, y: 20 }, box), false);
  assert.equal(grid.inside({ x: 10, y: 60 }, box), false);
});

test('아이콘 자리는 칸에서 가장자리를 뺀 크기이다', () => {
  const metrics = { x0: 0, y0: 0, dx: 76, dy: 98 };
  const rect = grid.iconRect({ col: 1, row: 0 }, metrics);
  assert.equal(rect.x, 76 + grid.INSET);
  assert.equal(rect.width, 76 - grid.INSET * 2);
  assert.equal(rect.height, 98 - grid.INSET * 2);
});

test('겹침 판정', () => {
  const a = { x: 0, y: 0, width: 10, height: 10 };
  assert.equal(grid.overlaps(a, { x: 5, y: 5, width: 10, height: 10 }), true);
  assert.equal(grid.overlaps(a, { x: 10, y: 0, width: 10, height: 10 }), false, '맞닿기만 한 것은 겹친 것이 아니다');
});

// 박스도 바탕화면 아이콘과 같은 격자 위에 선다.
// 모서리를 칸 경계에 대야 박스가 칸을 반만 덮는 일이 없다.
// 칸 경계에 가까우면 자석처럼 붙는다.
test('칸 경계 가까이에 놓으면 딱 맞게 붙는다', () => {
  const metrics = { x0: 20, y0: 30, dx: 80, dy: 100 };
  const snapped = grid.snapRect({ x: 105, y: 135, width: 316, height: 292 }, metrics);
  assert.equal(snapped.x, 100, '가로 자리가 칸 경계에 붙지 않았다');
  assert.equal(snapped.y, 130, '세로 자리가 칸 경계에 붙지 않았다');
  assert.equal(snapped.width, 320, '너비가 칸에 붙지 않았다');
  assert.equal(snapped.height, 300, '높이가 칸에 붙지 않았다');
});

// 칸의 배수로만 자리와 크기를 정할 수 있으면 박스를 원하는 대로 만들 수 없다.
// 경계에서 멀면 놓은 그대로 두어야 한다.
test('칸 사이의 자리와 크기는 그대로 쓴다', () => {
  const metrics = { x0: 20, y0: 30, dx: 80, dy: 100 };
  const free = { x: 140, y: 180, width: 360, height: 340 };
  assert.deepEqual(grid.snapRect(free, metrics), free, '원하는 자리와 크기를 묶어 버렸다');
});

test('자석은 한 칸의 1/5 안에서만 당긴다', () => {
  const metrics = { x0: 0, y0: 0, dx: 100, dy: 100 };
  // 15px 는 당긴다. 25px 는 두고 본다.
  assert.equal(grid.snapRect({ x: 215, y: 0, width: 100, height: 100 }, metrics).x, 200);
  assert.equal(grid.snapRect({ x: 225, y: 0, width: 100, height: 100 }, metrics).x, 225);
});

test('박스는 아무리 작게 잡아도 한 칸보다 작아지지 않는다', () => {
  const metrics = { x0: 0, y0: 0, dx: 80, dy: 100 };
  const snapped = grid.snapRect({ x: 0, y: 0, width: 4, height: 4 }, metrics, { width: 110, height: 132 });
  assert.ok(snapped.width >= 110, `너무 좁다: ${snapped.width}`);
  assert.ok(snapped.height >= 132, `너무 낮다: ${snapped.height}`);
});

// 옮겨 간 모서리에서 칸 수를 재면 왼쪽으로 반 칸 움직일 때마다 한 칸씩 늘어난다.
// 몇 번 끌고 나면 박스가 화면을 덮는다. 칸 수는 박스 제 크기에서만 잰다.
test('박스를 여러 번 옮겨도 크기가 자라지 않는다', () => {
  const metrics = { x0: 20, y0: 30, dx: 80, dy: 100 };
  let rect = grid.snapRect({ x: 105, y: 135, width: 300, height: 240 }, metrics);
  const first = { ...rect };
  // 손으로 끌듯 조금씩 옮기고 그때마다 격자에 맞춘다.
  for (const [dx, dy] of [[-9, -12], [7, 5], [-31, -44], [18, 26], [-3, -7]]) {
    rect = grid.snapRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, metrics);
    assert.equal(rect.width, first.width, `너비가 자랐다: ${rect.width}`);
    assert.equal(rect.height, first.height, `높이가 자랐다: ${rect.height}`);
  }
});

test('한 칸 크기의 박스는 한 칸으로 남는다', () => {
  const metrics = { x0: 0, y0: 0, dx: 80, dy: 100 };
  const snapped = grid.snapRect({ x: 0, y: 0, width: 80, height: 100 }, metrics);
  assert.deepEqual([snapped.width, snapped.height], [80, 100]);
});

test('박스는 아무리 작게 그려도 한 칸보다 작아지지 않는다', () => {
  const metrics = { x0: 0, y0: 0, dx: 80, dy: 100 };
  const snapped = grid.snapRect({ x: 0, y: 0, width: 4, height: 4 }, metrics, { width: 110, height: 132 });
  assert.equal(snapped.width, 110, '박스 안에 아이콘 한 칸이 들어가지 않는다');
  assert.equal(snapped.height, 132);
});

test('격자를 모르면 그린 자리를 그대로 준다', () => {
  const drawn = { x: 11, y: 13, width: 17, height: 19 };
  assert.deepEqual(grid.snapRect(drawn, null), drawn);
  assert.deepEqual(grid.snapRect(drawn, { x0: 0, y0: 0, dx: 0, dy: 0 }), drawn);
});

// 격자에 맞춘 박스 자리에서는, 그 안의 칸이 모두 가려진 것으로 나와야 한다.
test('격자에 맞춘 박스는 덮은 칸을 남김없이 가린다', () => {
  const metrics = { x0: 0, y0: 0, dx: 80, dy: 100 };
  const block = grid.snapRect({ x: 85, y: 105, width: 150, height: 150 }, metrics);
  for (const cell of [{ col: 1, row: 1 }, { col: 2, row: 1 }, { col: 1, row: 2 }, { col: 2, row: 2 }]) {
    assert.equal(grid.blocked(cell, metrics, [block]), true, `${cell.col},${cell.row} 칸이 가려지지 않았다`);
  }
  assert.equal(grid.blocked({ col: 0, row: 0 }, metrics, [block]), false, '박스 밖의 칸까지 가렸다');
});

// 아이콘 격자는 화면 끝에서 조금 들어와 시작한다(위상 14px).
// 격자에만 붙이면 가장자리에 딱 붙여 놓은 박스가 그만큼 되튀어 틈이 생긴다.
test('화면 가장자리에 붙여 놓으면 그대로 붙어 있는다', () => {
  const metrics = { x0: 14, y0: 2, dx: 76, dy: 98 };
  const area = { x: 0, y: 0, width: 1920, height: 1160 };
  const flush = grid.snapRect({ x: 0, y: 0, width: 380, height: 294 }, metrics, { width: 0, height: 0 }, area);
  assert.equal(flush.x, 0, `왼쪽 끝에서 되튀었다: ${flush.x}`);
  assert.equal(flush.y, 0, `위쪽 끝에서 되튀었다: ${flush.y}`);
});

test('오른쪽과 아래 가장자리에도 붙는다', () => {
  const metrics = { x0: 14, y0: 2, dx: 76, dy: 98 };
  const area = { x: 0, y: 0, width: 1920, height: 1160 };
  const flush = grid.snapRect(
    { x: 1920 - 380 - 5, y: 1160 - 294 - 5, width: 380, height: 294 },
    metrics, { width: 0, height: 0 }, area
  );
  assert.equal(flush.x + flush.width, 1920, '오른쪽 끝에 붙지 않았다');
  assert.equal(flush.y + flush.height, 1160, '아래쪽 끝에 붙지 않았다');
});

test('가장자리에서 멀면 격자에 붙는다', () => {
  const metrics = { x0: 14, y0: 2, dx: 76, dy: 98 };
  const area = { x: 0, y: 0, width: 1920, height: 1160 };
  const near = grid.snapRect({ x: 620, y: 300, width: 380, height: 294 }, metrics, { width: 0, height: 0 }, area);
  assert.equal(grid.wrap(near.x - metrics.x0, metrics.dx), 0, '격자에 붙지 않았다');
});

// 크기만 바꿨는데 박스가 옆으로 뛰면 무엇을 한 것인지 알 수 없다.
test('크기만 바꾸면 자리는 손대지 않는다', () => {
  const metrics = { x0: 14, y0: 2, dx: 76, dy: 98 };
  const area = { x: 0, y: 0, width: 1920, height: 1160 };
  // 격자에서 벗어난 자리에 있는 박스의 크기만 바꾼다.
  const resized = grid.snapRect(
    { x: 613, y: 297, width: 300, height: 240 },
    metrics, { width: 0, height: 0 }, area, { place: false, size: true }
  );
  assert.deepEqual([resized.x, resized.y], [613, 297], '크기를 바꿨는데 자리가 움직였다');
});

test('자리만 옮기면 크기는 손대지 않는다', () => {
  const metrics = { x0: 14, y0: 2, dx: 76, dy: 98 };
  const moved = grid.snapRect(
    { x: 613, y: 297, width: 301, height: 241 },
    metrics, { width: 0, height: 0 }, null, { place: true, size: false }
  );
  assert.deepEqual([moved.width, moved.height], [301, 241], '자리를 옮겼는데 크기가 바뀌었다');
});
