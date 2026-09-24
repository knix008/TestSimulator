'use strict';

// 바탕화면 아이콘을 집는 판단. 창과 운영체제 호출 없이 검사할 수 있게 떼어 둔다.

const DESKTOP_CLASS = new Set(['SysListView32', 'SHELLDLL_DefView', 'Progman', 'WorkerW']);

function isDesktopTarget(underClass, foregroundClass) {
  return DESKTOP_CLASS.has(underClass) || DESKTOP_CLASS.has(foregroundClass);
}

// 커서 아래의 아이콘. 그림과 이름 글자까지 포함한다.
function pickIcon(icons, pos) {
  let best = null;
  let bestD = 1e9;
  for (const icon of icons || []) {
    const dx = Math.abs(icon.x + 24 - pos.x);
    const dy = pos.y - icon.y;
    if (dx <= 56 && dy >= -12 && dy <= 100) return icon;
    const dist = dx + Math.abs(icon.y + 24 - pos.y);
    if (dist < bestD) {
      bestD = dist;
      best = icon;
    }
  }
  return bestD <= 90 ? best : null;
}

// 그림과 글자 위에 있을 때만 아이콘이다. 옆의 빈 곳은 빈 곳이다.
function iconAt(icons, pos) {
  if (!pos) return null;
  for (const icon of icons || []) {
    const dx = Math.abs(icon.x + 24 - pos.x);
    const dy = pos.y - icon.y;
    if (dx <= 56 && dy >= -12 && dy <= 100) return icon;
  }
  return null;
}

// 끌어 고른 사각형 안에 바탕화면 아이콘이 있으면 여러 개를 고른 것이다.
// 그 경우에는 새 박스를 만들지 묻지 않는다. 멀리 치워 둔 아이콘은 세지 않는다.
function rectCoversIcon(rect, icons) {
  if (!rect) return false;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  return (icons || []).some((icon) => {
    if (!icon || icon.x >= 19000 || icon.x < -1000 || icon.y < -1000) return false;
    const iconRight = icon.x + 72;
    const iconBottom = icon.y + 84;
    return icon.x < right && rect.x < iconRight && icon.y < bottom && rect.y < iconBottom;
  });
}

function shouldOfferFence(rect, icons) {
  if (!rect || rect.width < 120 || rect.height < 90) return false;
  return !rectCoversIcon(rect, icons);
}

// 바탕화면에서 아이콘을 옮기는 동안, 박스에 담긴 아이콘이 튀어나오면 다시 치운다.
// 지금 끌고 있는 아이콘과, 아직 박스에 없는 아이콘은 건드리지 않는다.
function dragIconAction(icon, choice) {
  const dragging = !!(choice && choice.dragging);
  const wanted = !!(choice && choice.wanted);
  const known = !!(choice && choice.known);
  const cursorOnIt = !!(choice && choice.cursorOnIt);
  const parked = !!(icon && (icon.parked || icon.x >= 19000 || icon.x < -1000 || icon.y < -1000));
  if (wanted && !parked) {
    if (dragging && cursorOnIt) return 'leave';
    return 'park';
  }
  if (dragging) return 'leave';
  if (parked && !known) return 'restore';
  if (!known && !parked) return 'loose';
  return 'leave';
}

function movedEnough(from, to) {
  if (!from || !to) return false;
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y) >= 8;
}

// 셸 목록에서 휴지통 같은 항목의 경로를 찾는다.
function shellPathFor(name, shellItems, sameName) {
  const found = (shellItems || []).find((item) => sameName(name, item.name));
  return found ? { name: found.name, path: found.path } : null;
}

const api = { isDesktopTarget, pickIcon, iconAt, movedEnough, rectCoversIcon, shouldOfferFence, dragIconAction, shellPathFor };
const root = typeof globalThis !== 'undefined' ? globalThis : this;
root.DeskPick = api;
if (typeof module === 'object' && module.exports) module.exports = api;
