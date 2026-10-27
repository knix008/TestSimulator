const fs = require('fs');
const path = require('path');
const { userDataDir } = require('./paths');
const { normalizePromptGitMode, normalizePrompt, normalizeCustomPrompts } = require('./prompt');
const { normalizeLsColors } = require('./ls-colors');

function settingsPath() {
  return path.join(userDataDir(), 'settings.json');
}

function readSettings() {
  try {
    const p = settingsPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (_) {
    /* ignore */
  }
  return {};
}

function writeSettings(settings) {
  const p = settingsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  // Write-then-rename: the Tauri program reads this file too (window placement).
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

/** Merge patch into settings.json so renderer updates cannot wipe window state. */
function updateSettings(patch = {}) {
  const next = { ...readSettings(), ...(patch || {}) };
  writeSettings(next);
  return next;
}

/**
 * Clean a settings:set patch (the renderer's whole persisted state) the way
 * the Electron main process did. `setStartDirectory` applies a changed start
 * directory to the open sessions and returns the stored value.
 */
function sanitizeSettingsPatch(settings, { setStartDirectory } = {}) {
  const patch = { ...(settings || {}) };
  // Always persist directory-related fields explicitly (including empty clear).
  if ('startDirectory' in patch) {
    const dir = typeof patch.startDirectory === 'string' ? patch.startDirectory : '';
    patch.startDirectory = setStartDirectory ? setStartDirectory(dir) : dir;
  }
  if ('backgroundImageDir' in patch) {
    patch.backgroundImageDir =
      typeof patch.backgroundImageDir === 'string' ? patch.backgroundImageDir : '';
  }
  if ('promptGitMode' in patch) {
    patch.promptGitMode = normalizePromptGitMode(patch.promptGitMode);
  }
  if ('promptPresetId' in patch) {
    patch.promptPresetId =
      typeof patch.promptPresetId === 'string' ? patch.promptPresetId : '';
  }
  if ('promptConfig' in patch) {
    patch.promptConfig =
      patch.promptConfig && typeof patch.promptConfig === 'object'
        ? normalizePrompt(patch.promptConfig)
        : null;
  }
  if ('promptTheme' in patch) {
    const t = patch.promptTheme;
    patch.promptTheme =
      t && typeof t === 'object'
        ? { accent: String(t.accent || ''), fg: String(t.fg || ''), bg: String(t.bg || '') }
        : null;
  }
  if ('customPrompts' in patch) {
    patch.customPrompts = normalizeCustomPrompts(patch.customPrompts);
  }
  if ('termCols' in patch || 'termRows' in patch) {
    if ('termCols' in patch) patch.termCols = Math.max(20, Math.min(500, Number.parseInt(patch.termCols, 10) || 120));
    if ('termRows' in patch) patch.termRows = Math.max(5, Math.min(200, Number.parseInt(patch.termRows, 10) || 25));
  }
  if ('terminalProfiles' in patch) {
    patch.terminalProfiles = (Array.isArray(patch.terminalProfiles) ? patch.terminalProfiles : [])
      .filter((item) => item && typeof item === 'object' && typeof item.id === 'string' && item.id)
      .map((item) => ({
        id: item.id,
        name: String(item.name || ''),
        cols: Math.max(20, Math.min(500, Number.parseInt(item.cols, 10) || 80)),
        rows: Math.max(5, Math.min(200, Number.parseInt(item.rows, 10) || 24)),
        fontId: String(item.fontId || ''),
        fontSize: Math.max(10, Math.min(28, Number.parseInt(item.fontSize, 10) || 14)),
        scrollback: Math.max(100, Math.min(100000, Number.parseInt(item.scrollback, 10) || 10000)),
        shellId: String(item.shellId || ''),
      }));
  }
  if ('sshProfiles' in patch) {
    patch.sshProfiles = (Array.isArray(patch.sshProfiles) ? patch.sshProfiles : [])
      .filter((item) => item && typeof item === 'object' && typeof item.id === 'string' && item.id)
      .map((item) => ({
        id: item.id,
        name: String(item.name || ''),
        host: String(item.host || ''),
        port: Math.max(1, Math.min(65535, Number.parseInt(item.port, 10) || 22)),
        username: String(item.username || ''),
        privateKey: String(item.privateKey || ''),
      }));
  }
  if ('themeOverrides' in patch) {
    patch.themeOverrides =
      patch.themeOverrides && typeof patch.themeOverrides === 'object' ? patch.themeOverrides : {};
  }
  if ('shellId' in patch) {
    patch.shellId = typeof patch.shellId === 'string' ? patch.shellId : '';
  }
  if ('shellCustomPath' in patch) {
    patch.shellCustomPath =
      typeof patch.shellCustomPath === 'string' ? patch.shellCustomPath.trim() : '';
  }
  if ('lsDirectoryColor' in patch || 'lsFileColor' in patch) {
    const current = readSettings();
    const colors = normalizeLsColors({
      directory:
        'lsDirectoryColor' in patch
          ? patch.lsDirectoryColor
          : current.lsDirectoryColor,
      file: 'lsFileColor' in patch ? patch.lsFileColor : current.lsFileColor,
    });
    patch.lsDirectoryColor = colors.directory;
    patch.lsFileColor = colors.file;
  }
  return patch;
}

module.exports = { settingsPath, readSettings, writeSettings, updateSettings, sanitizeSettingsPatch };
