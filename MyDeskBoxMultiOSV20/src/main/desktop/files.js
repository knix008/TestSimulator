'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

function expandWin(value) {
  return value.replace(/%([^%]+)%/gi, (_, key) => process.env[key] || '');
}

function windowsDesktops() {
  const found = [];
  try {
    const out = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders', '/v', 'Desktop'],
      { encoding: 'utf8', windowsHide: true }
    );
    const line = out.split(/\r?\n/).find((row) => /REG_/.test(row) && /Desktop/.test(row));
    if (line) {
      const value = line.split(/REG_(?:EXPAND_)?SZ/i).pop().trim();
      if (value) found.push(expandWin(value));
    }
  } catch (_err) {
    /* 레지스트리를 못 읽으면 기본 폴더를 쓴다. */
  }
  if (process.env.USERPROFILE) found.push(path.join(process.env.USERPROFILE, 'Desktop'));
  if (process.env.PUBLIC) found.push(path.join(process.env.PUBLIC, 'Desktop'));
  return found;
}

function linuxDesktop() {
  try {
    const out = execFileSync('xdg-user-dir', ['DESKTOP'], { encoding: 'utf8' }).trim();
    if (out) return [out];
  } catch (_err) {
    /* xdg-user-dir 가 없는 배포판은 ~/Desktop 을 쓴다. */
  }
  return [path.join(os.homedir(), 'Desktop')];
}

// 바탕화면 폴더는 거의 바뀌지 않는다. 잠깐 기억해 두고 쓴다.
// 매번 레지스트리를 읽으면 느릴 뿐 아니라, 한 번 실패했을 때
// 담아 둔 아이콘을 바탕화면으로 되돌리는 일이 생긴다.
let cachedDirs = null;
let cachedAt = 0;
const CACHE_MS = 30000;

function desktopDirectories() {
  const now = Date.now();
  if (cachedDirs && now - cachedAt < CACHE_MS) return cachedDirs;
  const found = readDesktopDirectories();
  // 못 찾았으면 예전에 찾아 둔 것을 그대로 쓴다.
  if (found.length) {
    cachedDirs = found;
    cachedAt = now;
  }
  return cachedDirs || found;
}

function readDesktopDirectories() {
  let dirs;
  if (process.platform === 'win32') dirs = windowsDesktops();
  else if (process.platform === 'darwin') dirs = [path.join(os.homedir(), 'Desktop')];
  else dirs = linuxDesktop();
  const seen = new Set();
  const out = [];
  for (const dir of dirs) {
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    try {
      if (fs.statSync(dir).isDirectory()) out.push(dir);
    } catch (_err) {
      /* 없는 경로는 건너뛴다. */
    }
  }
  return out;
}

const SKIP = new Set(['desktop.ini', '.localized', '.ds_store']);

// 바탕화면에 놓인 것의 이름과 자리. 파일인지 폴더인지는 보지 않는다.
// 항목마다 stat 을 부르지 않으므로, 몇 초마다 훑어도 가볍다.
function desktopEntries() {
  const found = [];
  for (const dir of desktopDirectories()) {
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch (_err) {
      continue;
    }
    for (const name of names) {
      if (SKIP.has(name.toLowerCase()) || name.startsWith('.')) continue;
      found.push({ name, path: path.join(dir, name) });
    }
  }
  return found;
}

// 위와 같되 폴더인지까지 본다. 첫 실행에 종류별로 나눠 담을 때 쓴다.
function listDesktopFiles() {
  const files = [];
  for (const entry of desktopEntries()) {
    let dirent = false;
    try {
      dirent = fs.statSync(entry.path).isDirectory();
    } catch (_err) {
      continue;
    }
    files.push({ name: entry.name, path: entry.path, directory: dirent });
  }
  return files;
}

// 바탕화면 폴더 안에 있는 파일만 바탕화면 아이콘과 짝지을 수 있다.
// 다른 폴더에서 끌어 온 항목은 애초에 바탕화면에 없으므로 건드리지 않는다.
// 휴지통처럼 파일이 아닌 항목도 바탕화면에 놓여 있다.
function isShellItem(filePath) {
  return String(filePath || '').startsWith('shell:');
}

function isOnDesktop(filePath) {
  if (!filePath) return false;
  if (isShellItem(filePath)) return true;
  const parent = path.dirname(String(filePath));
  return desktopDirectories().some((dir) => path.relative(dir, parent) === '');
}

function labelOf(name) {
  return String(name).replace(/\.(lnk|url)$/i, '');
}

function sameName(iconText, fileName) {
  const a = String(iconText || '').trim().toLowerCase();
  const b = String(fileName || '').trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || a === labelOf(b).toLowerCase();
}

// 바탕화면 아이콘에 적힌 글과 같은 파일. 탐색기는 확장자를 감추기도 한다.
// '노트' 는 노트.txt 다. 같은 글에 파일이 둘이면 어느 것인지 모르므로 집지 않는다.
function matchDesktopEntry(iconText, entries) {
  const text = String(iconText || '').trim().toLowerCase();
  if (!text) return null;
  const list = entries || [];
  const exact = list.find((entry) => entry && String(entry.name).toLowerCase() === text);
  if (exact) return exact;
  const hits = list.filter((entry) => {
    if (!entry || !entry.name) return false;
    const name = String(entry.name).toLowerCase();
    if (sameName(text, name)) return true;
    const dot = name.lastIndexOf('.');
    return dot > 0 && name.slice(0, dot) === text;
  });
  return hits.length === 1 ? hits[0] : null;
}

function watchDesktop(onChange) {
  const watchers = [];
  let timer = null;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 400);
  };
  for (const dir of desktopDirectories()) {
    try {
      watchers.push(fs.watch(dir, fire));
    } catch (_err) {
      /* 감시할 수 없는 폴더는 주기적인 확인에 맡긴다. */
    }
  }
  return () => {
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
  };
}

module.exports = {
  desktopDirectories,
  desktopEntries,
  isOnDesktop,
  isShellItem,
  listDesktopFiles,
  labelOf,
  sameName,
  matchDesktopEntry,
  watchDesktop,
};
