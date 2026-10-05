'use strict';

// macOS 에서는 Finder 아이콘 좌표를 바꾸는 공개 API 가 없다.
// 박스는 바탕화면 위의 진짜 창이고, 안의 아이콘은 Desktop 폴더의 파일이다.

function blurBehind(win, on) {
  if (!win || win.isDestroyed()) return;
  try {
    win.setVibrancy(on ? 'under-window' : null);
  } catch (_err) {
    /* 흐림을 지원하지 않는 곳이다. */
  }
}

function place(win) {
  if (!win || win.isDestroyed()) return;
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  try {
    win.setAlwaysOnTop(true, 'desktop');
  } catch (_err) {
    win.setAlwaysOnTop(false);
  }
}

function gather() {
  return false;
}

function release() {}

function moveIcon() {
  return false;
}

function mouseDown() {
  return false;
}

function claimSingleInstance() {
  return true;
}

function shellItems() {
  return [];
}

function watchDrag() {
  return () => {};
}

function watchDoubleClick() {
  return () => {};
}

function emptyRecycle() {
  return false;
}

function shutdown() {}

module.exports = {
  nativeIcons: false,
  place,
  blurBehind,
  gather,
  release,
  moveIcon,
  mouseDown,
  claimSingleInstance,
  shellItems,
  watchDrag,
  watchDoubleClick,
  emptyRecycle,
  shutdown,
};
