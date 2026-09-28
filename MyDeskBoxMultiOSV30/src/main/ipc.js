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

  // 아이콘을 끄는 동안 어디쯤인지 알려 온다.
  // 커서 아래의 박스는 놓을 자리를 비워 두고, 박스 밖에서는 따라다니는 그림이 그린다.
  // 이 길이 없으면 박스 밖으로 나간 아이콘이 눈에서 사라진다.
  ipcMain.on('fence:hover', (_event, payload) => {
    if (!payload || !payload.filePath) host.clearHover();
    else host.hover(payload.filePath, payload.screenX, payload.screenY, payload.icon);
  });

  ipcMain.handle('fence:collapse', (_event, payload) => {
    host.setCollapsed(payload.id, payload.collapsed);
  });

  // 받을 항목은 메인이 손을 뗀 자리에서 다시 잰다. 창은 어디서 뗐는지만 알려 준다.
  ipcMain.handle('fence:transfer', (_event, payload) => host.transfer(
    payload.id,
    payload.filePath,
    payload.screenX,
    payload.screenY
  ));

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

  // 규칙·페이지·스냅샷을 고치는 길. 무엇을 하라는 것인지는 payload.act 에 적혀 온다.
  ipcMain.handle('prefs:edit', (_event, payload) => host.prefsEdit(payload));

  ipcMain.on('prefs:close', () => host.closePrefs());

  ipcMain.on('box:size', (_event, payload) => host.fitSettings(payload.id, payload.height));

  ipcMain.handle('fence:open', (_event, filePath) => host.openItem(filePath));

  ipcMain.handle('fence:menu', (_event, payload) => host.showMenu(payload.id, payload.filePath));

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
