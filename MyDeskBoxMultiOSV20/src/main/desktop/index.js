'use strict';

const files = require('./files');

const platform = process.platform === 'win32'
  ? require('./windows')
  : process.platform === 'darwin'
    ? require('./darwin')
    : require('./linux');

module.exports = {
  listDesktopFiles: files.listDesktopFiles,
  desktopEntries: files.desktopEntries,
  desktopDirectories: files.desktopDirectories,
  watchDesktop: files.watchDesktop,
  labelOf: files.labelOf,
  isOnDesktop: files.isOnDesktop,
  isShellItem: files.isShellItem,
  sameName: files.sameName,
  ...platform,
};
