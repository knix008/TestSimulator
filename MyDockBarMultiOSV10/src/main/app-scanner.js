'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { shell } = require('electron');

/* ------------------------------ Windows ------------------------------ */

function windowsStartMenuRoots() {
  const roots = [];
  if (process.env.ProgramData) {
    roots.push(path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
  }
  if (process.env.APPDATA) {
    roots.push(path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
  }
  return roots;
}

function walk(dir, depth, out, accept) {
  if (depth < 0) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, depth - 1, out, accept);
    else if (accept(entry.name)) out.push(full);
  }
  return out;
}

function scanWindows() {
  const found = new Map();
  const unreadable = [];
  const skip = /uninstall|설치\s*제거|제거|readme|help|웹\s*사이트|website|documentation|license|설명서/i;

  for (const root of windowsStartMenuRoots()) {
    const links = walk(root, 4, [], (name) => name.toLowerCase().endsWith('.lnk'));
    for (const link of links) {
      const label = path.basename(link, '.lnk');
      if (skip.test(label)) continue;
      let target = '';
      let args = '';
      let icon = '';
      try {
        const info = shell.readShortcutLink(link);
        target = info.target || '';
        args = info.args || '';
        icon = info.icon || '';
      } catch {
        // Shell-namespace shortcuts (Control Panel, Run, ...) have no file
        // target and legitimately fail here. Counted rather than logged per
        // item, so a genuinely shorter list is still visible in the log.
        unreadable.push(label);
        continue;
      }
      if (!target || !/\.(exe|bat|cmd|com)$/i.test(target)) continue;
      if (!fs.existsSync(target)) continue;

      const key = `${target.toLowerCase()}|${args.toLowerCase()}`;
      if (found.has(key)) continue;
      found.set(key, {
        label,
        path: target,
        args,
        icon: icon && fs.existsSync(icon) ? icon : '',
        source: link,
      });
    }
  }
  if (unreadable.length) {
    console.log(`[app-scanner] ${unreadable.length} shortcut(s) had no file target: ${unreadable.join(', ')}`);
  }
  return [...found.values()];
}

/* ------------------------------- macOS ------------------------------- */

function scanMac() {
  const roots = [
    '/Applications',
    '/Applications/Utilities',
    '/System/Applications',
    '/System/Applications/Utilities',
    path.join(os.homedir(), 'Applications'),
  ];
  const found = new Map();

  for (const root of roots) {
    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.name.endsWith('.app')) continue;
      const full = path.join(root, entry.name);
      if (found.has(full)) continue;
      found.set(full, {
        label: path.basename(entry.name, '.app'),
        path: full,
        args: '',
        icon: '',
        source: full,
      });
    }
  }
  return [...found.values()];
}

/* ------------------------------- Linux ------------------------------- */

function desktopFileRoots() {
  const dirs = [
    path.join(os.homedir(), '.local', 'share', 'applications'),
    '/usr/share/applications',
    '/usr/local/share/applications',
    '/var/lib/flatpak/exports/share/applications',
    path.join(os.homedir(), '.local', 'share', 'flatpak', 'exports', 'share', 'applications'),
    '/var/lib/snapd/desktop/applications',
  ];
  const extra = process.env.XDG_DATA_DIRS;
  if (extra) {
    for (const base of extra.split(':')) {
      if (base) dirs.push(path.join(base, 'applications'));
    }
  }
  return [...new Set(dirs)];
}

/** Minimal .desktop parser: we only care about the `[Desktop Entry]` group. */
function parseDesktopEntry(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }

  const entry = {};
  let inGroup = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('[')) {
      inGroup = trimmed === '[Desktop Entry]';
      continue;
    }
    if (!inGroup) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    entry[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }

  if (entry.Type && entry.Type !== 'Application') return null;
  if (entry.NoDisplay === 'true' || entry.Hidden === 'true') return null;
  if (!entry.Exec) return null;

  // Strip the field codes (%f %U %i ...) the spec lets launchers substitute.
  const exec = entry.Exec.replace(/%[fFuUdDnNickvm]/g, '').trim();
  const argv = splitExec(exec);
  if (!argv.length) return null;

  return {
    label: entry.Name || path.basename(file, '.desktop'),
    path: argv[0],
    args: argv.slice(1).join(' '),
    icon: entry.Icon || '',
    terminal: entry.Terminal === 'true',
    source: file,
  };
}

/** Split a command line honouring quotes, the way a shell would. */
function splitExec(line) {
  const out = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current) out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) out.push(current);
  return out;
}

function scanLinux() {
  const found = new Map();
  for (const root of desktopFileRoots()) {
    const files = walk(root, 2, [], (name) => name.endsWith('.desktop'));
    for (const file of files) {
      const entry = parseDesktopEntry(file);
      if (!entry) continue;
      const key = path.basename(file);
      if (!found.has(key)) found.set(key, entry);
    }
  }
  return [...found.values()];
}

/* ------------------------------ public ------------------------------- */

let cache = null;
let cachedAt = 0;
const TTL = 60_000;

function scan({ force = false } = {}) {
  if (!force && cache && Date.now() - cachedAt < TTL) return cache;

  let result;
  if (process.platform === 'win32') result = scanWindows();
  else if (process.platform === 'darwin') result = scanMac();
  else result = scanLinux();

  result.sort((a, b) => a.label.localeCompare(b.label));
  cache = result;
  cachedAt = Date.now();
  return result;
}

module.exports = { scan, parseDesktopEntry, splitExec };
