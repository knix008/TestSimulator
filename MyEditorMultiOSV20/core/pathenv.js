// GUI launches (Start Menu / desktop) inherit Explorer's PATH, not a
// developer terminal. npm start works because the shell already has node,
// Python Scripts, and npm bins. Prepend those well-known folders plus the
// app's own toolsDir so packaged My Editor finds the same checkers.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function existingDir(p) {
  try { return p && fs.statSync(p).isDirectory() ? p : null; } catch { return null; }
}

function extraBinDirs(toolsDir) {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const out = [];
  const add = (p) => { const d = existingDir(p); if (d && !out.includes(d)) out.push(d); };

  if (toolsDir) {
    add(path.join(toolsDir, 'node', 'node_modules', '.bin'));
    add(path.join(toolsDir, 'runtime', 'node'));
    add(path.join(toolsDir, 'runtime', 'node', 'bin'));
    add(path.join(toolsDir, 'runtime', 'python'));
    add(path.join(toolsDir, 'runtime', 'python', 'Scripts'));
    add(path.join(toolsDir, 'runtime', 'python', 'bin'));
  }

  add(path.join(home, '.local', 'bin'));
  add(path.join(home, '.cargo', 'bin'));
  add(path.join(home, 'go', 'bin'));
  add(path.join(home, '.volta', 'bin'));

  if (process.platform === 'win32') {
    add(path.join(pf, 'nodejs'));
    add(path.join(local, 'Programs', 'nodejs'));
    add(path.join(roaming, 'npm'));
    add(path.join(home, 'scoop', 'shims'));
    add(path.join(home, 'scoop', 'apps', 'nodejs', 'current'));
    add(process.env.NVM_HOME);
    add(process.env.NVM_SYMLINK);
    add(path.join(roaming, 'nvm'));
    add(path.join(local, 'fnm'));
    add(path.join(local, 'Microsoft', 'WinGet', 'Links'));
    for (const base of [path.join(local, 'Programs', 'Python'), path.join(roaming, 'Python')]) {
      let names = [];
      try { names = fs.readdirSync(base); } catch { names = []; }
      for (const n of names) {
        add(path.join(base, n));
        add(path.join(base, n, 'Scripts'));
      }
    }
  } else {
    add('/usr/local/bin');
    add('/opt/homebrew/bin');
    add('/usr/bin');
  }
  return out;
}

function applyToolPath(toolsDir) {
  const extra = extraBinDirs(toolsDir);
  const cur = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const seen = new Set(cur.map((d) => d.toLowerCase()));
  const add = [];
  for (const d of extra) {
    const key = d.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    add.push(d);
  }
  if (add.length) process.env.PATH = add.concat(cur).join(path.delimiter);
  return add;
}

module.exports = { extraBinDirs, applyToolPath };
