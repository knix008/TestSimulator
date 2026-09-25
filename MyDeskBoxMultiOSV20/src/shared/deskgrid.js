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
    const dx = smallestGap(xs, FALLBACK.dx);
    const dy = smallestGap(ys, FALLBACK.dy);
    return {
      x0: xs.length ? xs[0] : 0,
      y0: ys.length ? ys[0] : 0,
      dx,
      dy,
      // 격자의 위상. 맨 앞 아이콘이 어디에 있든 같은 값이 나온다.
      phaseX: xs.length ? wrap(xs[0], dx) : 0,
      phaseY: ys.length ? wrap(ys[0], dy) : 0,
    };
  }

  function wrap(value, span) {
    if (!span) return 0;
    return ((value % span) + span) % span;
  }

  // 흔들리지 않는 격자.
  //
  // metrics 의 x0 는 '맨 왼쪽 아이콘의 자리'다. 아이콘을 밀어내면 그 값이 바뀌므로,
  // 같은 바탕화면인데도 격자가 통째로 움직인다. 박스를 그 격자에 맞추면 박스가
  // 저 혼자 걸어 다닌다. 아이콘이 모두 한 격자 위에 있으면 나머지(위상)는 같으므로,
  // 맨 앞 자리 대신 위상을 원점으로 삼아 흔들리지 않게 한다.
  function steady(grid) {
    if (!grid || !grid.dx || !grid.dy) return grid;
    return {
      ...grid,
      x0: grid.phaseX === undefined ? wrap(grid.x0, grid.dx) : grid.phaseX,
      y0: grid.phaseY === undefined ? wrap(grid.y0, grid.dy) : grid.phaseY,
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
  function relocate(icons, blocks, area, grid = steady(metrics(icons))) {
    if (!icons.length || !blocks.length) return [];

    // 화면(작업 영역) 안에 온전히 들어오는 칸만 쓴다.
    const colFrom = Math.max(0, Math.ceil((area.x - grid.x0) / grid.dx));
    const rowFrom = Math.max(0, Math.ceil((area.y - grid.y0) / grid.dy));
    const colTo = Math.floor((area.x + area.width - grid.x0) / grid.dx) - 1;
    const rowTo = Math.floor((area.y + area.height - grid.y0) / grid.dy) - 1;

    const taken = new Set();
    const moving = [];
    for (const icon of icons) {
      const cell = cellOf(icon, grid);
      if (blocked(cell, grid, blocks)) moving.push(icon);
      else taken.add(key(cell));
    }
    if (!moving.length) return [];

    const free = [];
    for (let col = colFrom; col <= colTo; col += 1) {
      for (let row = rowFrom; row <= rowTo; row += 1) {
        const cell = { col, row };
        if (taken.has(key(cell))) continue;
        if (blocked(cell, grid, blocks)) continue;
        free.push(cell);
      }
    }

    const moves = [];
    for (const icon of moving) {
      // 밀려나는 아이콘은 제자리에서 가장 가까운 빈 칸으로 간다.
      // 늘 맨 앞 빈 칸으로 보내면 오른쪽 아래에 있던 아이콘이 왼쪽 위로 날아가,
      // 박스를 옮길 때마다 바탕화면 전체가 다시 정렬된 것처럼 보인다.
      // 비켜 주기만 하면 될 일이므로 옆 칸으로 한 걸음만 옮긴다.
      const at = nearestFree(icon, free, grid);
      // 놓을 자리가 없으면 그대로 둔다. 아무 데나 옮기는 것보다 낫다.
      if (!at) break;
      free.splice(at.index, 1);
      taken.add(key(at.cell));
      const point = pointOf(at.cell, grid);
      if (point.x === icon.x && point.y === icon.y) continue;
      moves.push({ index: icon.index, x: point.x, y: point.y });
    }
    return moves;
  }

  // 빈 칸 가운데 이 아이콘에서 가장 가까운 것. 같은 거리면 탐색기와 같은 차례로 고른다.
  function nearestFree(icon, free, grid) {
    if (!free.length) return null;
    const from = cellOf(icon, grid);
    let best = 0;
    let bestCost = Infinity;
    for (let i = 0; i < free.length; i += 1) {
      const cell = free[i];
      const dc = cell.col - from.col;
      const dr = cell.row - from.row;
      const cost = dc * dc + dr * dr;
      if (cost < bestCost) {
        bestCost = cost;
        best = i;
      }
    }
    return { index: best, cell: free[best] };
  }
  // 박스를 바탕화면 아이콘 격자에 맞춘다.
  //
  // 박스는 바탕화면 아이콘과 같은 줄에 서야 한다. 그래서 모서리를 칸 경계에 대고,
  // 크기도 칸의 배수로 맞춘다. 그러지 않으면 박스가 칸을 반만 덮어, 그 칸의
  // 아이콘을 밀어내고도 눈에는 한 칸이 빈 것처럼 보인다.
  //
  // 크기는 칸의 배수에 가까울 때만 붙인다. 그보다 멀면 그린 대로 둔다.
  // 자석이 닿는 거리. 한 칸의 1/5 쯤이면 손으로 맞추려 한 것으로 본다.
  const MAGNET = 0.2;

  function magnet(size, span, least) {
    const want = Math.max(least, size);
    const steps = Math.max(1, Math.round(want / span));
    const snapped = steps * span;
    // 칸 경계 가까이에서 손을 떼면 붙고, 그 사이의 크기는 그대로 쓴다.
    if (Math.abs(want - snapped) <= span * MAGNET && snapped >= least) return snapped;
    return want;
  }

  // 칸 경계에 가까우면 붙이고, 아니면 놓은 자리를 그대로 쓴다.
  function magnetTo(value, origin, span) {
    const steps = Math.round((value - origin) / span);
    const snapped = origin + steps * span;
    if (Math.abs(value - snapped) <= span * MAGNET) return snapped;
    return value;
  }

  // 박스를 격자에 '붙여' 준다. 묶어 두지는 않는다.
  //
  // 칸의 배수로만 자리와 크기를 정할 수 있으면 박스를 원하는 대로 만들 수 없다.
  // 그래서 칸 경계 가까이에서만 자석처럼 붙인다. 맞추려 할 때는 딱 맞게 붙고,
  // 그 사이의 자리와 크기도 그대로 쓸 수 있다.
  // 칸을 반만 덮어도 그 칸의 아이콘은 밖으로 비키므로 박스 밑에 깔리지 않는다.
  //
  // 자리를 옮겨 간 모서리에서 크기를 재면 박스가 왼쪽으로 반 칸 움직일 때마다
  // 한 칸씩 늘어난다. 그래서 크기는 박스 제 크기에서만 잰다.
  // what 으로 무엇을 붙일지 고른다. 크기만 바꾼 것이면 자리는 그대로 두어야 한다.
  // 크기를 바꿨을 뿐인데 박스가 옆으로 뛰면 손이 놀란다.
  function snapRect(rect, grid, cell = { width: 0, height: 0 }, area = null, what = { place: true, size: true }) {
    if (!rect || !grid || !grid.dx || !grid.dy) return rect;
    const out = {
      x: what.place === false ? rect.x : magnetTo(rect.x, grid.x0, grid.dx),
      y: what.place === false ? rect.y : magnetTo(rect.y, grid.y0, grid.dy),
      // 박스 안에도 아이콘이 들어가므로 한 칸보다 좁아지지 않게 한다.
      width: what.size === false ? rect.width : magnet(rect.width, grid.dx, cell.width || 1),
      height: what.size === false ? rect.height : magnet(rect.height, grid.dy, cell.height || 1),
    };
    return what.place === false ? out : edgeMagnet(out, grid, area);
  }

  // 화면 가장자리에도 붙인다.
  //
  // 아이콘 격자는 화면 끝에서 조금 들어와 시작한다(위상). 격자에만 붙이면
  // 가장자리에 딱 붙여 놓은 박스가 그 위상만큼 되튀어 틈이 생긴다.
  // 가장자리가 더 가까우면 가장자리를 고른다.
  function edgeMagnet(rect, grid, area) {
    if (!area || !area.width || !area.height) return rect;
    const nearX = grid.dx * MAGNET;
    const nearY = grid.dy * MAGNET;
    const out = { ...rect };
    const right = area.x + area.width;
    const bottom = area.y + area.height;
    if (Math.abs(out.x - area.x) <= nearX) out.x = area.x;
    else if (Math.abs(out.x + out.width - right) <= nearX) out.x = right - out.width;
    if (Math.abs(out.y - area.y) <= nearY) out.y = area.y;
    else if (Math.abs(out.y + out.height - bottom) <= nearY) out.y = bottom - out.height;
    return out;
  }

  // 박스끼리는 겹치지 않는다.
  //
  // 겹친 만큼 가장 짧은 쪽으로 밀어낸다. 옆으로 조금만 비키면 될 일을
  // 위아래로 크게 옮기지 않도록, 네 방향 가운데 가장 적게 움직이는 쪽을 고른다.
  // blocks 는 다른 박스들의 자리다.
  function pushOut(rect, blocks, area) {
    if (!rect || !blocks || !blocks.length) return rect;
    let out = { ...rect };
    // 여러 박스에 걸쳐 있으면 한 번에 풀리지 않는다. 몇 번 더 본다.
    for (let turn = 0; turn < 8; turn += 1) {
      const hit = blocks.find((block) => overlaps(out, block));
      if (!hit) break;
      const ways = [
        { x: hit.x - out.width, y: out.y, cost: Math.abs(hit.x - out.width - out.x) },
        { x: hit.x + hit.width, y: out.y, cost: Math.abs(hit.x + hit.width - out.x) },
        { x: out.x, y: hit.y - out.height, cost: Math.abs(hit.y - out.height - out.y) },
        { x: out.x, y: hit.y + hit.height, cost: Math.abs(hit.y + hit.height - out.y) },
      ].filter((way) => !area || (way.x >= area.x
        && way.y >= area.y
        && way.x + out.width <= area.x + area.width
        && way.y + out.height <= area.y + area.height));
      if (!ways.length) break;
      ways.sort((a, b) => a.cost - b.cost);
      // 값싼 쪽부터 보되, 거기서 또 다른 박스와 겹치는 자리는 건너뛴다.
      // 그러지 않으면 박스 둘 사이에 낀 박스가 좌우로 오가기만 한다.
      const clear = ways.find((way) => !blocks.some(
        (block) => overlaps({ ...out, x: way.x, y: way.y }, block)
      ));
      const best = clear || ways[0];
      out = { ...out, x: Math.round(best.x), y: Math.round(best.y) };
    }
    return out;
  }

  const api = { FALLBACK, INSET, MAGNET, metrics, steady, wrap, smallestGap, pushOut, cellOf, pointOf, iconRect, overlaps, inside, blocked, relocate, snapRect };

  root.DeskGrid = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
