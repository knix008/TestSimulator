const { dialog } = require('electron');

async function showOpenDialog(window, options = {}) {
  const result = await dialog.showOpenDialog(window, {
    properties: ['openFile'],
    ...options
  });
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  return result.filePaths[0];
}

async function showSaveDialog(window, options = {}) {
  const result = await dialog.showSaveDialog(window, options);
  if (result.canceled || !result.filePath) {
    return null;
  }
  return result.filePath;
}

async function showOpenDirectoryDialog(window, options = {}) {
  const result = await dialog.showOpenDialog(window, {
    properties: ['openDirectory', 'createDirectory'],
    ...options
  });
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  return result.filePaths[0];
}

module.exports = {
  showOpenDialog,
  showSaveDialog,
  showOpenDirectoryDialog
};
