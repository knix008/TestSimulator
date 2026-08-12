const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');

const MAX_RECENT = 40;
const MAX_HISTORY = 200;

/** @type {{ lastWorkingDirectory: string, recentPaths: Array<{path:string,kind:string,at:number}>, commandHistory: string[] } | null} */
let cache = null;

function memoryFilePath() {
  return path.join(app.getPath('userData'), 'shell-memory.json');
}

function emptyMemory() {
  return {
    lastWorkingDirectory: '',
    recentPaths: [],
    commandHistory: [],
  };
}

function loadMemory() {
  if (cache) return cache;
  try {
    const p = memoryFilePath();
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      cache = {
        lastWorkingDirectory:
          typeof parsed.lastWorkingDirectory === 'string'
            ? parsed.lastWorkingDirectory
            : '',
        recentPaths: Array.isArray(parsed.recentPaths)
          ? parsed.recentPaths
              .filter((item) => item && typeof item.path === 'string')
              .map((item) => ({
                path: item.path,
                kind: item.kind === 'file' ? 'file' : 'dir',
                at: Number(item.at) || 0,
              }))
          : [],
        commandHistory: Array.isArray(parsed.commandHistory)
          ? parsed.commandHistory.filter((line) => typeof line === 'string' && line.trim())
          : [],
      };
      return cache;
    }
  } catch (_) {
    /* ignore */
  }
  cache = emptyMemory();
  return cache;
}

function saveMemory() {
  if (!cache) return;
  try {
    const p = memoryFilePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cache, null, 2), 'utf8');
  } catch (_) {
    /* ignore */
  }
}

function normalizeExistingPath(target) {
  if (!target || typeof target !== 'string') return '';
  let dir = target.trim();
  if (!dir) return '';
  if (dir === '~') dir = os.homedir();
  else if (dir.startsWith('~/') || dir.startsWith('~\\')) {
    dir = path.join(os.homedir(), dir.slice(2));
  }
  try {
    dir = path.resolve(dir);
    if (fs.existsSync(dir)) return dir;
  } catch (_) {
    /* ignore */
  }
  return '';
}

function getLastWorkingDirectory() {
  const mem = loadMemory();
  return normalizeExistingPath(mem.lastWorkingDirectory);
}

function rememberWorkingDirectory(dir) {
  const full = normalizeExistingPath(dir);
  if (!full || !fs.statSync(full).isDirectory()) return;
  const mem = loadMemory();
  mem.lastWorkingDirectory = full;
  rememberPath(full, 'dir', { persist: false });
  saveMemory();
}

function rememberPath(target, kind = 'dir', { persist = true } = {}) {
  const full = normalizeExistingPath(target);
  if (!full) return;
  let resolvedKind = kind === 'file' ? 'file' : 'dir';
  try {
    resolvedKind = fs.statSync(full).isDirectory() ? 'dir' : 'file';
  } catch (_) {
    return;
  }
  const mem = loadMemory();
  mem.recentPaths = [
    { path: full, kind: resolvedKind, at: Date.now() },
    ...mem.recentPaths.filter((item) => item.path !== full),
  ].slice(0, MAX_RECENT);
  if (persist) saveMemory();
}

function rememberCommand(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return;
  const mem = loadMemory();
  if (mem.commandHistory[mem.commandHistory.length - 1] === trimmed) return;
  mem.commandHistory.push(trimmed);
  if (mem.commandHistory.length > MAX_HISTORY) {
    mem.commandHistory = mem.commandHistory.slice(-MAX_HISTORY);
  }
  saveMemory();
}

function getCommandHistory() {
  return [...loadMemory().commandHistory];
}

function getRecentPaths() {
  const mem = loadMemory();
  return mem.recentPaths
    .map((item) => {
      const full = normalizeExistingPath(item.path);
      if (!full) return null;
      let kind = item.kind;
      try {
        kind = fs.statSync(full).isDirectory() ? 'dir' : 'file';
      } catch (_) {
        return null;
      }
      return { path: full, kind, at: item.at };
    })
    .filter(Boolean);
}

module.exports = {
  getLastWorkingDirectory,
  rememberWorkingDirectory,
  rememberPath,
  rememberCommand,
  getCommandHistory,
  getRecentPaths,
};
