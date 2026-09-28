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

  ipcMain.handle('fence:collapse', (_event, payload) => {
    host.setCollapsed(payload.id, payload.collapsed);
  });

  ipcMain.handle('fence:transfer', (_event, payload) => host.transfer(
    payload.id,
    payload.filePath,
    payload.screenX,
    payload.screenY,
    payload.into
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

  ipcMain.on('box:size', (_event, payload) => host.fitSettings(payload.id, payload.height));

  ipcMain.handle('fence:open', (_event, filePath) => host.openItem(filePath));

  ipcMain.handle('fence:menu', (_event, payload) => host.showMenu(payload.id, payload.filePath));

  ipcMain.handle('fence:rename', (_event, payload) => host.rename(payload.id, payload.title));

  ipcMain.handle('fence:remove', (_event, id) => host.removeFence(id));

  ipcMain.handle('draw:finish', (_event, rect) => host.finishDraw(rect));

  ipcMain.handle('draw:cancel', () => host.cancelDraw());

  ipcMain.handle('app:draw', () => host.beginDraw());

  ipcMain.handle('app:toggle', () => host.toggleHidden());
}

module.exports = { install };
