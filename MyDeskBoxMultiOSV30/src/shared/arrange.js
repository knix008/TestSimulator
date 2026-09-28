'use strict';

// 이 파일은 창에서 <script> 로도 읽고 메인에서 require 로도 읽는다.
// 여러 <script> 는 전역을 함께 쓰므로, 안에 든 이름이 서로 부딪히지 않게 감싸 둔다.
(function attach(root) {

  // 박스 안 아이콘의 자리 계산. 화면과 운영체제에 의존하지 않는다.
  // 순서는 입력 배열 그대로다. 가로 칸이 줄면 뒤의 아이콘이 다음 줄로 넘어간다.

  const CELL_W = 86;
  // 그림 44, 글 두 줄, 위아래 여백까지 넣은 높이. 더 크게 잡으면 줄마다 빈 자리가 남는다.
  const CELL_H = 88;
  const PAD = 12;
  const TITLE_H = 36;
  // 창 가장자리에 남겨 두는 자리. 박스 그림자가 잘리지 않게 한다.
  // 창은 박스보다 사방으로 이만큼 크고, 박스는 그 안쪽에 놓인다.
  const SHADOW = 18;

  // 아이콘 그림과 이름 글씨의 크기. 박스마다 따로 고를 수 있다.
  // 칸은 그림 크기에서 나온다. 기본 그림 44 에서 위의 86x88 이 그대로 나와야 한다.
  const ICON = 44;
  const MIN_ICON = 28;
  const MAX_ICON = 80;
  const FONT = 11;
  const MIN_FONT = 9;
  const MAX_FONT = 16;
  // 칸에서 그림을 뺀 나머지. 좌우 여백과 이름 두 줄이 들어간다.
  const CELL_PAD_X = CELL_W - ICON;
  const CELL_PAD_Y = CELL_H - ICON;

  function clampNum(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  // 0 이나 빈 값은 '기본 크기' 를 뜻한다. 박스마다 적어 두지 않아도 되게 한다.
  function iconSize(look) {
    return clampNum(look && look.icon, MIN_ICON, MAX_ICON, ICON);
  }

  function fontSize(look) {
    return clampNum(look && look.font, MIN_FONT, MAX_FONT, FONT);
  }

  // 그림 크기에서 칸 크기가 나온다. 창과 메인이 같은 셈을 써야 놓는 자리가 맞는다.
  function cellOf(look) {
    const icon = iconSize(look);
    return { w: icon + CELL_PAD_X, h: icon + CELL_PAD_Y };
  }

  function gridOf(width, height, collapsed, look) {
    const cell = cellOf(look);
    const innerW = Math.max(cell.w, width - PAD * 2);
    const cols = Math.max(1, Math.floor(innerW / cell.w));
    const bodyH = collapsed ? 0 : Math.max(0, height - TITLE_H - PAD);
    const rows = Math.max(1, Math.floor(bodyH / cell.h) || 1);
    return {
      cols,
      rows,
      cellW: cell.w,
      cellH: cell.h,
      icon: iconSize(look),
      font: fontSize(look),
      pad: PAD,
      titleH: TITLE_H,
      originX: PAD,
      originY: TITLE_H,
    };
  }

  // 접힌 박스는 제목 줄만 남는다.
  function panelHeight(fence) {
    return fence.collapsed ? TITLE_H + 4 : fence.h;
  }

  // 박스 자리에서 창 자리를 구한다. 되돌릴 때는 panelRect 를 쓴다.
  function margin(shadow) {
    return shadow ? SHADOW : 0;
  }

  function windowRect(fence, shadow) {
    const pad = margin(shadow);
    return {
      x: Math.round(fence.x) - pad,
      y: Math.round(fence.y) - pad,
      width: Math.round(fence.w) + pad * 2,
      height: Math.round(panelHeight(fence)) + pad * 2,
    };
  }

  function panelRect(bounds, shadow) {
    const pad = margin(shadow);
    return {
      x: bounds.x + pad,
      y: bounds.y + pad,
      width: Math.max(0, bounds.width - pad * 2),
      height: Math.max(0, bounds.height - pad * 2),
    };
  }

  function placeIndex(n, cols) {
    const c = Math.max(1, cols);
    return { col: n % c, row: Math.floor(n / c) };
  }

  function slotPoint(slot, grid) {
    const { col, row } = placeIndex(slot, grid.cols);
    return {
      x: grid.originX + col * grid.cellW,
      y: grid.originY + row * grid.cellH,
    };
  }

  // 끌어 온 아이콘이 들어갈 칸. count 는 그 아이콘을 뺀 개수라서 맨 뒤는 count 다.
  function insertIndex(localX, localY, grid, count) {
    if (!count || count < 0) return 0;
    let col = Math.round((localX - grid.originX) / grid.cellW);
    let row = Math.round((localY - grid.originY) / grid.cellH);
    col = Math.max(0, Math.min(grid.cols - 1, col));
    row = Math.max(0, row);
    return Math.min(count, row * grid.cols + col);
  }

  // insertAt 칸은 비운다. 반환은 기존 아이콘 순서 그대로의 칸 번호.
  function gapSlots(count, insertAt, cols) {
    const at = Math.max(0, Math.min(insertAt, count));
    const slots = [];
    for (let n = 0; n < count; n += 1) {
      slots.push(n < at ? n : n + 1);
    }
    return slots;
  }

  function reflowPoints(count, grid) {
    const points = [];
    for (let n = 0; n < count; n += 1) points.push(slotPoint(n, grid));
    return points;
  }

  function gapPoints(count, insertAt, grid) {
    return gapSlots(count, insertAt, grid.cols).map((slot) => slotPoint(slot, grid));
  }

  // 목표까지 한 걸음. 멀리 있으면 조금씩, 가까우면 바로 붙는다.
  function ease(cur, goal) {
    const d = goal - cur;
    if (Math.abs(d) <= 3) return goal;
    let step = Math.round(d * 0.45);
    if (step === 0) step = Math.sign(d);
    step = Math.max(-28, Math.min(28, step));
    return cur + step;
  }
  const api = {
    CELL_W,
    CELL_H,
    PAD,
    TITLE_H,
    SHADOW,
    ICON,
    MIN_ICON,
    MAX_ICON,
    FONT,
    MIN_FONT,
    MAX_FONT,
    iconSize,
    fontSize,
    cellOf,
    panelHeight,
    windowRect,
    panelRect,
    gridOf,
    placeIndex,
    slotPoint,
    insertIndex,
    gapSlots,
    reflowPoints,
    gapPoints,
    ease,
  };

  root.DeskArrange = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
