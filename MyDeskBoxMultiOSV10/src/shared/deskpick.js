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

function movedEnough(from, to) {
  if (!from || !to) return false;
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y) >= 8;
}

// 셸 목록에서 휴지통 같은 항목의 경로를 찾는다.
function shellPathFor(name, shellItems, sameName) {
  const found = (shellItems || []).find((item) => sameName(name, item.name));
  return found ? { name: found.name, path: found.path } : null;
}

const api = { isDesktopTarget, pickIcon, movedEnough, shellPathFor };
const root = typeof globalThis !== 'undefined' ? globalThis : this;
root.DeskPick = api;
if (typeof module === 'object' && module.exports) module.exports = api;
