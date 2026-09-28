'use strict';

// 리눅스 데스크톱은 환경마다 아이콘 창이 다르다.
// 박스는 작업 표시줄에 올라가지 않는 투명 창으로 두고, 파일은 XDG 바탕화면 폴더에서 읽는다.

function place(win) {
  if (!win || win.isDestroyed()) return;
  win.setVisibleOnAllWorkspaces(true);
  win.setAlwaysOnTop(false);
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
