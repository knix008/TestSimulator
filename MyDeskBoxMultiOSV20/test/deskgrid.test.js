'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const grid = require('../src/shared/deskgrid');

const AREA = { x: 0, y: 0, width: 1920, height: 1000 };

// Icons stacked vertically in 76 x 98 cells.
function column(count, col = 0) {
  return Array.from({ length: count }, (_, i) => ({ index: i, x: col * 76, y: i * 98 }));
}

test('infers the cell size from placed icons', () => {
  const found = grid.metrics([
    { x: 20, y: 10 }, { x: 20, y: 108 }, { x: 96, y: 10 }, { x: 96, y: 206 },
  ]);
  assert.deepEqual(
    { x0: found.x0, y0: found.y0, dx: found.dx, dy: found.dy },
    { x0: 20, y0: 10, dx: 76, dy: 98 }
  );
});

// If the grid origin were "the position of the first icon", the whole grid would shift every
// time icons get pushed aside, and boxes snapped to it would wander on their own.
// As long as icons sit on the same grid, the origin must be the same no matter where they are.
test('the grid stays put when icons are pushed aside', () => {
  const before = grid.steady(grid.metrics([
    { x: 20, y: 10 }, { x: 96, y: 10 }, { x: 20, y: 108 },
  ]));
  // After the first icon has been pushed down and to the right.
  const after = grid.steady(grid.metrics([
    { x: 96, y: 108 }, { x: 172, y: 108 }, { x: 96, y: 206 },
  ]));
  assert.deepEqual(before, after, 'the grid moved along with the icons');
});

test('if the grid stays put, boxes stay put too', () => {
  const first = grid.steady(grid.metrics([{ x: 20, y: 10 }, { x: 96, y: 10 }, { x: 20, y: 108 }]));
  const box = grid.snapRect({ x: 300, y: 300, width: 320, height: 300 }, first);
  // Re-snapping the same box after icons moved must give the same position.
  const later = grid.steady(grid.metrics([{ x: 96, y: 108 }, { x: 172, y: 108 }]));
  assert.deepEqual(grid.snapRect(box, later), box, 'the box moved on its own');
});

// Snapping the same position repeatedly must not drift.
// A box that has been snapped once must stay the same when snapped again, or it will wander.
test('a box snapped once stays the same when snapped again', () => {
  const metrics = grid.steady(grid.metrics([{ x: 20, y: 10 }, { x: 96, y: 10 }, { x: 20, y: 108 }]));
  for (const drawn of [
    { x: 300, y: 300, width: 320, height: 300 },
    { x: 317, y: 206, width: 231, height: 197 },
    { x: 96, y: 108, width: 152, height: 196 },
  ]) {
    let box = grid.snapRect(drawn, metrics);
    for (let turn = 0; turn < 6; turn += 1) box = grid.snapRect(box, metrics);
    assert.deepEqual(box, grid.snapRect(drawn, metrics), `position drifted: ${JSON.stringify(drawn)}`);
  }
});

// Boxes never overlap each other.
test('an overlapping box moves the shortest distance out of the way', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1200 };
  const other = { x: 500, y: 300, width: 400, height: 400 };
  // A slight overlap from the right moves it to the right.
  const moved = grid.pushOut({ x: 860, y: 300, width: 300, height: 300 }, [other], area);
  assert.equal(moved.x, 900, 'did not move to the nearest side');
  assert.equal(moved.y, 300, 'moved along an axis that did not need to change');
  assert.equal(grid.overlaps(moved, other), false, 'still overlapping');
});

test('a box that does not overlap is left alone', () => {
  const other = { x: 500, y: 300, width: 400, height: 400 };
  const kept = { x: 100, y: 100, width: 200, height: 200 };
  assert.deepEqual(grid.pushOut(kept, [other]), kept);
  assert.deepEqual(grid.pushOut(kept, []), kept);
});

test('resolves overlaps even among three boxes', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1200 };
  const others = [
    { x: 400, y: 200, width: 300, height: 300 },
    { x: 700, y: 200, width: 300, height: 300 },
  ];
  const moved = grid.pushOut({ x: 650, y: 250, width: 200, height: 200 }, others, area);
  for (const other of others) {
    assert.equal(grid.overlaps(moved, other), false, `still overlapping: ${JSON.stringify(moved)}`);
  }
});

test('uses the default cell size when there is only one icon', () => {
  const found = grid.metrics([{ x: 5, y: 7 }]);
  assert.equal(found.dx, grid.FALLBACK.dx);
  assert.equal(found.dy, grid.FALLBACK.dy);
});

test('moves nothing when there are no boxes', () => {
  assert.deepEqual(grid.relocate(column(5), [], AREA), []);
});

// After relocation, no icon may still overlap a box even slightly.
function leftovers(icons, blocks, moves, metrics) {
  const moved = new Map(moves.map((m) => [m.index, m]));
  return icons
    .map((icon) => moved.get(icon.index) || icon)
    .filter((icon) => {
      const cell = grid.cellOf(icon, metrics);
      return grid.blocked(cell, metrics, blocks);
    });
}

test('moves every icon overlapping a box out of it', () => {
  const icons = column(5);
  const blocks = [{ x: 0, y: 90, width: 200, height: 200 }];
  const metrics = grid.metrics(icons);
  const moves = grid.relocate(icons, blocks, AREA);

  assert.ok(moves.length >= 2, 'covered icons should be moved');
  assert.deepEqual(leftovers(icons, blocks, moves, metrics), [], 'icons still overlap the box');
});

test('pushes an icon out even if only a corner overlaps', () => {
  // A box covering only the bottom 8px of the first icon cell (0-98).
  const icons = column(3);
  const blocks = [{ x: 0, y: 90, width: 200, height: 40 }];
  const moves = grid.relocate(icons, blocks, AREA);
  assert.ok(moves.some((m) => m.index === 0), 'the slightly overlapped first icon should also move');
});

test('never moves an icon into a cell that already has one', () => {
  const icons = column(4);
  const blocks = [{ x: 0, y: 0, width: 100, height: 100 }];
  const moves = grid.relocate(icons, blocks, AREA);
  assert.ok(moves.length >= 1);

  const busy = new Set(icons.filter((i) => !moves.some((m) => m.index === i.index)).map((i) => `${i.x},${i.y}`));
  for (const move of moves) {
    assert.equal(busy.has(`${move.x},${move.y}`), false, 'took a cell already in use');
    busy.add(`${move.x},${move.y}`);
  }
});

test('pushed icons go to the adjacent empty column', () => {
  // Covering the whole first column moves each icon one step to the same height in the next column.
  const icons = column(3);
  const blocks = [{ x: 0, y: 0, width: 76, height: 1000 }];
  const moves = grid.relocate(icons, blocks, AREA);
  assert.equal(moves.length, 3);
  assert.deepEqual(moves.map((m) => m.x), [76, 76, 76], 'should go to the adjacent column');
  assert.deepEqual(moves.map((m) => m.y), [0, 98, 196], 'should keep the original height');
});

// A pushed icon must go to the empty cell nearest its original position.
// Always sending it to the first empty cell makes the desktop look fully re-sorted whenever a box moves.
test('does not send a distant icon to the front of the screen', () => {
  // The top-left is empty and only one icon at the bottom right is covered by a box.
  const icons = [{ index: 0, x: 76 * 10, y: 98 * 5 }];
  const blocks = [{ x: 76 * 10 - 10, y: 98 * 5 - 10, width: 96, height: 118 }];
  const moves = grid.relocate(icons, blocks, AREA);

  assert.equal(moves.length, 1);
  const cell = grid.cellOf(moves[0], grid.steady(grid.metrics(icons)));
  assert.ok(Math.abs(cell.col - 10) <= 2 && Math.abs(cell.row - 5) <= 2, `moved too far: ${cell.col},${cell.row}`);
});

// For users with auto-arrange on, fill from the top left with no gaps, skipping around boxes.
test('auto-arrange skips cells covered by boxes and fills top to bottom', () => {
  const metrics = { x0: 0, y0: 0, dx: 76, dy: 98 };
  const area = { x: 0, y: 0, width: 76 * 3, height: 98 * 3 };
  // Four scattered icons, in order: top of column one, bottom of column one, column two, column three.
  const icons = [
    { index: 0, x: 0, y: 0 },
    { index: 1, x: 0, y: 98 * 2 },
    { index: 2, x: 76, y: 98 * 2 },
    { index: 3, x: 76 * 2, y: 0 },
  ];
  // A box covering the middle cell of the first column.
  const blocks = [{ x: 0, y: 98, width: 76, height: 98 }];
  const moves = grid.pack(icons, blocks, area, metrics);
  const at = new Map(icons.map((icon) => [icon.index, { x: icon.x, y: icon.y }]));
  for (const move of moves) at.set(move.index, { x: move.x, y: move.y });
  assert.deepEqual([...at.values()], [
    { x: 0, y: 0 },
    { x: 0, y: 98 * 2 },
    { x: 76, y: 0 },
    { x: 76, y: 98 },
  ]);
  // An arranged desktop stays the same when arranged again.
  const settled = icons.map((icon) => ({ index: icon.index, ...at.get(icon.index) }));
  assert.deepEqual(grid.pack(settled, blocks, area, metrics), []);
});

test('leaves icons alone when there is nowhere to put them', () => {
  const icons = column(3);
  const tiny = { x: 0, y: 0, width: 76, height: 300 };
  const blocks = [{ x: 0, y: 0, width: 2000, height: 2000 }];
  const moves = grid.relocate(icons, blocks, tiny);
  assert.deepEqual(moves, [], 'should not touch icons when there is nowhere to go');
});

test('very small gaps are not used as the cell size', () => {
  assert.equal(grid.smallestGap([0, 4, 80], 76), 76);
  assert.equal(grid.smallestGap([10], 98), 98);
  assert.equal(grid.smallestGap([], 98), 98);
});

test('the right and bottom edges of a cell do not belong to it', () => {
  const box = { x: 10, y: 20, width: 30, height: 40 };
  assert.equal(grid.inside({ x: 10, y: 20 }, box), true);
  assert.equal(grid.inside({ x: 39, y: 59 }, box), true);
  assert.equal(grid.inside({ x: 40, y: 20 }, box), false);
  assert.equal(grid.inside({ x: 10, y: 60 }, box), false);
});

test('the icon rect is the cell minus its inset', () => {
  const metrics = { x0: 0, y0: 0, dx: 76, dy: 98 };
  const rect = grid.iconRect({ col: 1, row: 0 }, metrics);
  assert.equal(rect.x, 76 + grid.INSET);
  assert.equal(rect.width, 76 - grid.INSET * 2);
  assert.equal(rect.height, 98 - grid.INSET * 2);
});

test('overlap detection', () => {
  const a = { x: 0, y: 0, width: 10, height: 10 };
  assert.equal(grid.overlaps(a, { x: 5, y: 5, width: 10, height: 10 }), true);
  assert.equal(grid.overlaps(a, { x: 10, y: 0, width: 10, height: 10 }), false, 'merely touching is not overlapping');
});

// Boxes sit on the same grid as desktop icons.
// Aligning corners to cell boundaries keeps a box from covering half a cell.
// Near a cell boundary, the box snaps to it like a magnet.
test('placing near a cell boundary snaps exactly to it', () => {
  const metrics = { x0: 20, y0: 30, dx: 80, dy: 100 };
  const snapped = grid.snapRect({ x: 105, y: 135, width: 316, height: 292 }, metrics);
  assert.equal(snapped.x, 100, 'x did not snap to the cell boundary');
  assert.equal(snapped.y, 130, 'y did not snap to the cell boundary');
  assert.equal(snapped.width, 320, 'width did not snap to the cells');
  assert.equal(snapped.height, 300, 'height did not snap to the cells');
});

// If position and size could only be multiples of a cell, users couldn't shape boxes freely.
// Far from a boundary, keep exactly what was placed.
test('positions and sizes between cell boundaries are kept as is', () => {
  const metrics = { x0: 20, y0: 30, dx: 80, dy: 100 };
  const free = { x: 140, y: 180, width: 360, height: 340 };
  assert.deepEqual(grid.snapRect(free, metrics), free, 'locked the desired position and size to the grid');
});

test('the magnet only pulls within 1/5 of a cell', () => {
  const metrics = { x0: 0, y0: 0, dx: 100, dy: 100 };
  // 15px gets pulled; 25px is left alone.
  assert.equal(grid.snapRect({ x: 215, y: 0, width: 100, height: 100 }, metrics).x, 200);
  assert.equal(grid.snapRect({ x: 225, y: 0, width: 100, height: 100 }, metrics).x, 225);
});

test('a box never gets smaller than one cell, however small it is sized', () => {
  const metrics = { x0: 0, y0: 0, dx: 80, dy: 100 };
  const snapped = grid.snapRect({ x: 0, y: 0, width: 4, height: 4 }, metrics, { width: 110, height: 132 });
  assert.ok(snapped.width >= 110, `too narrow: ${snapped.width}`);
  assert.ok(snapped.height >= 132, `too short: ${snapped.height}`);
});

// Counting cells from the moved corner adds a cell every time the box moves half a cell left.
// After a few drags the box would cover the screen. Count cells from the box's own size only.
test('moving a box many times does not grow it', () => {
  const metrics = { x0: 20, y0: 30, dx: 80, dy: 100 };
  let rect = grid.snapRect({ x: 105, y: 135, width: 300, height: 240 }, metrics);
  const first = { ...rect };
  // Nudge it a little at a time like a hand drag, snapping each time.
  for (const [dx, dy] of [[-9, -12], [7, 5], [-31, -44], [18, 26], [-3, -7]]) {
    rect = grid.snapRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, metrics);
    assert.equal(rect.width, first.width, `width grew: ${rect.width}`);
    assert.equal(rect.height, first.height, `height grew: ${rect.height}`);
  }
});

test('a one-cell box stays one cell', () => {
  const metrics = { x0: 0, y0: 0, dx: 80, dy: 100 };
  const snapped = grid.snapRect({ x: 0, y: 0, width: 80, height: 100 }, metrics);
  assert.deepEqual([snapped.width, snapped.height], [80, 100]);
});

test('a box never gets smaller than one cell, however small it is drawn', () => {
  const metrics = { x0: 0, y0: 0, dx: 80, dy: 100 };
  const snapped = grid.snapRect({ x: 0, y: 0, width: 4, height: 4 }, metrics, { width: 110, height: 132 });
  assert.equal(snapped.width, 110, 'one icon cell does not fit inside the box');
  assert.equal(snapped.height, 132);
});

test('without a known grid, the drawn rect is returned as is', () => {
  const drawn = { x: 11, y: 13, width: 17, height: 19 };
  assert.deepEqual(grid.snapRect(drawn, null), drawn);
  assert.deepEqual(grid.snapRect(drawn, { x0: 0, y0: 0, dx: 0, dy: 0 }), drawn);
});

// For a grid-snapped box, every cell inside it must be reported as blocked.
test('a grid-snapped box blocks every cell it covers', () => {
  const metrics = { x0: 0, y0: 0, dx: 80, dy: 100 };
  const block = grid.snapRect({ x: 85, y: 105, width: 150, height: 150 }, metrics);
  for (const cell of [{ col: 1, row: 1 }, { col: 2, row: 1 }, { col: 1, row: 2 }, { col: 2, row: 2 }]) {
    assert.equal(grid.blocked(cell, metrics, [block]), true, `cell ${cell.col},${cell.row} is not blocked`);
  }
  assert.equal(grid.blocked({ col: 0, row: 0 }, metrics, [block]), false, 'blocked a cell outside the box');
});

// The icon grid starts slightly inset from the screen edge (a 14px offset).
// Snapping only to the grid would bounce a box placed flush against the edge back by that much, leaving a gap.
test('a box placed flush against the screen edge stays flush', () => {
  const metrics = { x0: 14, y0: 2, dx: 76, dy: 98 };
  const area = { x: 0, y: 0, width: 1920, height: 1160 };
  const flush = grid.snapRect({ x: 0, y: 0, width: 380, height: 294 }, metrics, { width: 0, height: 0 }, area);
  assert.equal(flush.x, 0, `bounced off the left edge: ${flush.x}`);
  assert.equal(flush.y, 0, `bounced off the top edge: ${flush.y}`);
});

test('also snaps to the right and bottom edges', () => {
  const metrics = { x0: 14, y0: 2, dx: 76, dy: 98 };
  const area = { x: 0, y: 0, width: 1920, height: 1160 };
  const flush = grid.snapRect(
    { x: 1920 - 380 - 5, y: 1160 - 294 - 5, width: 380, height: 294 },
    metrics, { width: 0, height: 0 }, area
  );
  assert.equal(flush.x + flush.width, 1920, 'did not snap to the right edge');
  assert.equal(flush.y + flush.height, 1160, 'did not snap to the bottom edge');
});

test('away from the edges, it snaps to the grid', () => {
  const metrics = { x0: 14, y0: 2, dx: 76, dy: 98 };
  const area = { x: 0, y: 0, width: 1920, height: 1160 };
  const near = grid.snapRect({ x: 620, y: 300, width: 380, height: 294 }, metrics, { width: 0, height: 0 }, area);
  assert.equal(grid.wrap(near.x - metrics.x0, metrics.dx), 0, 'did not snap to the grid');
});

// If a box jumps sideways when only its size changed, the result is confusing.
test('resizing only leaves the position untouched', () => {
  const metrics = { x0: 14, y0: 2, dx: 76, dy: 98 };
  const area = { x: 0, y: 0, width: 1920, height: 1160 };
  // Resize a box that sits off the grid.
  const resized = grid.snapRect(
    { x: 613, y: 297, width: 300, height: 240 },
    metrics, { width: 0, height: 0 }, area, { place: false, size: true }
  );
  assert.deepEqual([resized.x, resized.y], [613, 297], 'position moved on resize');
});

test('moving only leaves the size untouched', () => {
  const metrics = { x0: 14, y0: 2, dx: 76, dy: 98 };
  const moved = grid.snapRect(
    { x: 613, y: 297, width: 301, height: 241 },
    metrics, { width: 0, height: 0 }, null, { place: true, size: false }
  );
  assert.deepEqual([moved.width, moved.height], [301, 241], 'size changed on move');
});

// When a dragged box hits another box, it stops there.
// Pushing it out after the drop would make the box suddenly jump elsewhere.
test('a dragged box stops where it makes contact', () => {
  const wall = [{ x: 500, y: 300, width: 300, height: 300 }];
  const from = { x: 100, y: 350, width: 200, height: 200 };
  const to = { x: 600, y: 350, width: 200, height: 200 };
  const moved = grid.slideTo(from, to, wall);
  assert.equal(moved.x, 300, 'did not stop flush against the wall');
  assert.equal(grid.overlaps(moved, wall[0]), false, 'dug into the wall');
});

test('a path that passes by is not blocked', () => {
  const wall = [{ x: 500, y: 300, width: 300, height: 300 }];
  const from = { x: 100, y: 50, width: 200, height: 200 };
  const to = { x: 900, y: 50, width: 200, height: 200 };
  assert.deepEqual(grid.slideTo(from, to, wall), { ...to });
});

test('when blocked horizontally, it can still move vertically', () => {
  const wall = [{ x: 500, y: 300, width: 300, height: 300 }];
  const from = { x: 100, y: 350, width: 200, height: 200 };
  const to = { x: 600, y: 700, width: 200, height: 200 };
  const moved = grid.slideTo(from, to, wall);
  assert.equal(grid.overlaps(moved, wall[0]), false);
  assert.equal(moved.y, 700, 'blocked the vertical movement as well');
});

test('a box it already overlaps is not treated as a wall', () => {
  // A box saved while overlapping has no way to get out, so that other box is ignored.
  const wall = [{ x: 500, y: 300, width: 300, height: 300 }];
  const from = { x: 550, y: 350, width: 200, height: 200 };
  const to = { x: 560, y: 360, width: 200, height: 200 };
  assert.deepEqual(grid.slideTo(from, to, wall), { ...to });
});

test('with no walls, it goes where it was headed', () => {
  const from = { x: 0, y: 0, width: 100, height: 100 };
  const to = { x: 400, y: 400, width: 100, height: 100 };
  assert.deepEqual(grid.slideTo(from, to, []), { ...to });
});
