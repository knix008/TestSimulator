'use strict';

// 이 파일은 창에서 <script> 로도 읽고 메인에서 require 로도 읽는다.
// 여러 <script> 는 전역을 함께 쓰므로, 안에 든 이름이 서로 부딪히지 않게 감싸 둔다.
(function attach(root) {

  // 바탕화면 아이콘 자리 계산. 운영체제를 부르지 않는 순수한 셈만 한다.
  //
  // 박스가 놓인 자리에는 바탕화면 아이콘이 있으면 안 된다.
  // 겹친 아이콘을 박스 밖의 빈 칸으로 옮겨 주는 것이 여기서 하는 일이다.

  const FALLBACK = { dx: 76, dy: 98 };

  // 지금 놓인 아이콘들을 보고 칸의 크기와 시작 자리를 알아낸다.
  // 화면 배율이나 아이콘 크기 설정이 달라도 그대로 따라간다.
  function metrics(points) {
    const xs = [...new Set(points.map((p) => p.x))].sort((a, b) => a - b);
    const ys = [...new Set(points.map((p) => p.y))].sort((a, b) => a - b);
    return {
      x0: xs.length ? xs[0] : 0,
      y0: ys.length ? ys[0] : 0,
      dx: smallestGap(xs, FALLBACK.dx),
      dy: smallestGap(ys, FALLBACK.dy),
    };
  }

  // 값들 사이의 가장 좁은 간격. 같은 줄에 선 아이콘들이 한 칸 크기를 알려 준다.
  function smallestGap(values, fallback) {
    let best = Infinity;
    for (let i = 1; i < values.length; i += 1) {
      const gap = values[i] - values[i - 1];
      if (gap > 8 && gap < best) best = gap;
    }
    return Number.isFinite(best) ? best : fallback;
  }

  function cellOf(point, grid) {
    return {
      col: Math.max(0, Math.round((point.x - grid.x0) / grid.dx)),
      row: Math.max(0, Math.round((point.y - grid.y0) / grid.dy)),
    };
  }

  function pointOf(cell, grid) {
    return { x: grid.x0 + cell.col * grid.dx, y: grid.y0 + cell.row * grid.dy };
  }

  function overlaps(a, b) {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  }

  function inside(point, box) {
    return point.x >= box.x && point.x < box.x + box.width
      && point.y >= box.y && point.y < box.y + box.height;
  }

  // 아이콘이 실제로 차지하는 자리. 칸에서 가장자리를 조금 덜어낸 만큼이다.
  const INSET = 6;

  function iconRect(cell, grid) {
    const at = pointOf(cell, grid);
    return {
      x: at.x + INSET,
      y: at.y + INSET,
      width: Math.max(1, grid.dx - INSET * 2),
      height: Math.max(1, grid.dy - INSET * 2),
    };
  }

  // 그 칸이 박스에 가려지는가.
  // 조금이라도 겹치면 가려진 것으로 본다. 박스 아래에 아이콘이 비쳐 보이면 안 된다.
  function blocked(cell, grid, blocks) {
    const rect = iconRect(cell, grid);
    return blocks.some((block) => overlaps(rect, block));
  }

  const key = (cell) => `${cell.col},${cell.row}`;

  // 박스에 가려진 아이콘을 밖의 빈 칸으로 옮긴다.
  // icons 는 [{ index, x, y }], blocks 는 박스 자리, area 는 아이콘을 놓을 수 있는 넓이.
  // 돌려주는 값은 옮길 아이콘과 새 자리뿐이다. 건드릴 필요가 없으면 비어 있다.
  function relocate(icons, blocks, area, grid = metrics(icons)) {
    if (!icons.length || !blocks.length) return [];

    const rows = Math.max(1, Math.floor((area.height - (grid.y0 - area.y)) / grid.dy));
    const cols = Math.max(1, Math.floor((area.width - (grid.x0 - area.x)) / grid.dx));

    const taken = new Set();
    const moving = [];
    for (const icon of icons) {
      const cell = cellOf(icon, grid);
      if (blocked(cell, grid, blocks)) moving.push(icon);
      else taken.add(key(cell));
    }
    if (!moving.length) return [];

    // 탐색기와 같은 차례로 빈 칸을 찾는다. 위에서 아래로 내려간 뒤 오른쪽 줄로 넘어간다.
    const free = [];
    for (let col = 0; col < cols; col += 1) {
      for (let row = 0; row < rows; row += 1) {
        const cell = { col, row };
        if (taken.has(key(cell))) continue;
        if (blocked(cell, grid, blocks)) continue;
        free.push(cell);
      }
    }

    const moves = [];
    for (const icon of moving) {
      const cell = free.shift();
      // 놓을 자리가 없으면 그대로 둔다. 아무 데나 옮기는 것보다 낫다.
      if (!cell) break;
      taken.add(key(cell));
      const at = pointOf(cell, grid);
      if (at.x === icon.x && at.y === icon.y) continue;
      moves.push({ index: icon.index, x: at.x, y: at.y });
    }
    return moves;
  }
  const api = { FALLBACK, INSET, metrics, smallestGap, cellOf, pointOf, iconRect, overlaps, inside, blocked, relocate };

  root.DeskGrid = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
