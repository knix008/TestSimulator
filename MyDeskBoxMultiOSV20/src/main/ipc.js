'use strict';

const { ipcMain } = require('electron');

function install(host) {
  ipcMain.on('fence:ready', (_event, id) => {
    host.push(id);
  });

  ipcMain.on('fence:bounds', (_event, rect) => {
    host.applyBounds(rect.id, rect, false);
  });

  ipcMain.on('fence:bounds-save', (_event, rect) => {
    host.applyBounds(rect.id, rect, true);
    host.push(rect.id);
  });

  ipcMain.on('fence:scroll', (_event, payload) => {
    host.setScroll(payload.id, payload.top);
  });

  // 어느 박스에서 고르기를 시작했다. 다른 박스의 고른 표시는 거둔다.
  ipcMain.on('fence:picked', (_event, id) => {
    host.clearPicks(id);
  });

  // 아이콘을 끄는 동안 어디쯤인지 알려 온다.
  // 커서 아래의 박스는 놓을 자리를 비워 두고, 박스 밖에서는 따라다니는 그림이 그린다.
  // 이 길이 없으면 박스 밖으로 나간 아이콘이 눈에서 사라진다.
  ipcMain.on('fence:hover', (_event, payload) => {
    if (!payload || !payload.filePath) host.clearHover();
    else host.hover(payload.filePath, payload.screenX, payload.screenY, payload.icon);
  });

  // 창이 끄는 도중에 묻는다. 답이 와야 그 손짓을 운영체제에 넘길지 정하므로 바로 돌려준다.
  ipcMain.on('fence:over-foreign', (event, payload) => {
    const point = payload || {};
    event.returnValue = !!host.overForeign(point.screenX, point.screenY);
  });

  // 다른 프로그램으로 파일을 넘긴다. 마우스를 누른 동안 끝나야 하므로 여기서 기다린다.
  ipcMain.on('fence:drag-out', (event, filePath) => {
    event.returnValue = !!host.dragOut(event.sender, filePath);
  });

  // 마우스를 움직이는 메시지 안에서 바로 넘기면 운영체제가 끌기를 곧 끝낸다.
  // 그 메시지가 끝난 다음에 넘긴다. 단추는 아직 눌려 있다.
  ipcMain.on('fence:drag-out-later', (event, filePath) => {
    const contents = event.sender;
    setImmediate(() => {
      if (!contents || contents.isDestroyed()) return;
      host.dragOut(contents, filePath);
    });
  });

  ipcMain.handle('fence:collapse', (_event, payload) => {
    host.setCollapsed(payload.id, payload.collapsed);
  });

  // 받을 항목은 메인이 손을 뗀 자리에서 다시 잰다. 창은 어디서 뗐는지만 알려 준다.
  ipcMain.handle('fence:transfer', (_event, payload) => host.transfer(
    payload.id,
    payload.filePath,
    payload.screenX,
    payload.screenY,
    payload.paths
  ));

  ipcMain.handle('fence:copy', (_event, payload) => host.copyItem(payload.id, payload.filePath));

  ipcMain.handle('fence:cut', (_event, payload) => host.cutItem(payload.id, payload.filePath));

  ipcMain.handle('fence:delete', (_event, payload) => host.trashItems(payload.id, payload.paths));

  ipcMain.handle('fence:paste', (_event, id) => host.pasteFiles(id));

  ipcMain.handle('fence:drop', (_event, payload) => host.dropFiles(
    payload.id,
    payload.paths,
    payload.index,
    payload.into
  ));

  ipcMain.on('box:open', (_event, id) => host.openSettings(id));

  ipcMain.on('box:ready', (_event, id) => host.pushSettings(id));

  ipcMain.on('box:change', (_event, payload) => host.changeBox(payload.id, payload.patch));

  ipcMain.on('box:close', (_event, id) => host.closeSettings(id));

  ipcMain.on('box:reset', (_event, id) => host.resetBox(id));

  // 프로그램 전체 설정 창
  ipcMain.on('prefs:ready', () => host.pushPrefs());

  ipcMain.on('prefs:change', (_event, patch) => host.changePrefs(patch));

  ipcMain.handle('prefs:action', (_event, what) => host.prefsAction(what));

  ipcMain.on('prefs:close', () => host.closePrefs());

  ipcMain.on('box:size', (_event, payload) => host.fitSettings(payload.id, payload.height));

  ipcMain.handle('fence:open', (_event, filePath) => host.openItem(filePath));

  ipcMain.handle('fence:menu', (_event, payload) => host.showMenu(payload.id, payload.filePath, payload.paths));

  ipcMain.handle('fence:rename', (_event, payload) => host.rename(payload.id, payload.title));

  // 박스에 담긴 항목 하나의 이름. 박스 폴더 안의 파일 이름이 바뀐다.
  ipcMain.handle('fence:rename-item', (_event, payload) => host.renameItem(payload.id, payload.filePath, payload.name));

  ipcMain.handle('fence:remove', (_event, id) => host.removeFence(id));

  ipcMain.handle('draw:finish', (_event, rect) => host.finishDraw(rect));

  ipcMain.handle('draw:cancel', () => host.cancelDraw());

  ipcMain.handle('app:draw', () => host.beginDraw());

  ipcMain.handle('app:toggle', () => host.toggleHidden());
}

module.exports = { install };
