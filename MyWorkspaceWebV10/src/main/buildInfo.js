const path = require('path');
const fs = require('fs');

const BUILD_INFO_PATH = path.join(__dirname, '..', '..', 'config', 'build-info.json');

function readBuildInfoFile() {
  try {
    if (fs.existsSync(BUILD_INFO_PATH)) {
      return JSON.parse(fs.readFileSync(BUILD_INFO_PATH, 'utf8'));
    }
  } catch {
    // ignore invalid or missing file
  }
  return null;
}

function getRuntimeBuildInfo() {
  return {
    buildDate: null,
    commit: '',
    branch: '',
    builtOnPlatform: process.platform,
    builtOnArch: process.arch,
    electronVersion: process.versions.electron || '',
    development: true
  };
}

function getBuildInfo() {
  const file = readBuildInfoFile();
  if (file) {
    return {
      buildDate: file.buildDate || null,
      commit: file.commit || '',
      branch: file.branch || '',
      builtOnPlatform: file.builtOnPlatform || process.platform,
      builtOnArch: file.builtOnArch || process.arch,
      electronVersion: process.versions.electron || file.electronVersion || '',
      development: false
    };
  }
  return getRuntimeBuildInfo();
}

module.exports = {
  getBuildInfo,
  BUILD_INFO_PATH
};
