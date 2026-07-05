const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const APP_FOLDER_NAME = 'MyWorkspaceWebV10';

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function getUserDataPaths() {
  const root = path.join(app.getPath('userData'), APP_FOLDER_NAME);
  return {
    root,
    localSettings: path.join(root, 'appsettings.local.json'),
    pageAssets: path.join(root, 'PageAssets'),
    templates: path.join(root, 'Templates', 'Pages')
  };
}

function loadConfig() {
  const bundled = readJson(path.join(__dirname, '..', '..', 'config', 'appsettings.json'), {});
  const paths = getUserDataPaths();
  const local = readJson(paths.localSettings, {});
  return deepMerge(bundled, local);
}

function saveLocalConfig(partial) {
  const paths = getUserDataPaths();
  const current = readJson(paths.localSettings, {});
  const merged = deepMerge(current, partial);
  writeJson(paths.localSettings, merged);
  return merged;
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deepMerge(result[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function resolveSqlitePath(config) {
  const paths = getUserDataPaths();
  const configured = config?.Database?.SqliteFilePath?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(paths.root, configured);
  }
  return path.join(paths.root, 'myworkspace.db');
}

module.exports = {
  APP_FOLDER_NAME,
  loadConfig,
  saveLocalConfig,
  getUserDataPaths,
  resolveSqlitePath
};
