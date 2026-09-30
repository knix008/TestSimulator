'use strict';

// The places a folder tree can be started from: the drives of the machine and
// the reader's own home folder.
//
// "Open folder…" answers the question "where is that book?" only when the
// reader already knows. Browsing — opening D:, looking through it — needs
// somewhere to begin, and on Windows that is a drive letter. There is no
// portable API for this, so each platform is asked in its own way.
//
// Kept out of main.js and given plain `fs`/`os`/`path` arguments so the listing
// can be tested without an Electron window.

const MOUNTS = ['/Volumes', '/media', '/mnt'];

/**
 * @returns {Array<{name: string, path: string, kind: 'drive'|'home'}>}
 */
function listDrives({ fs, os, path, platform = process.platform } = {}) {
  const out = [];
  // The reader's own folder is not a drive, and listing it among them says the
  // machine has one more disk than it has. It is offered on its own, beside
  // "Open folder", because it is the folder most books are under.
  const home = safe(() => os.homedir(), '');
  if (home) out.push({ name: basename(path, home), path: home, kind: 'home' });

  if (platform === 'win32') {
    // A and B were floppy drives, and asking about a floppy drive that is not
    // there is the one lookup here that can take seconds. Nothing has been
    // mounted there in thirty years, so the walk starts at C.
    for (let letter = 'C'.charCodeAt(0); letter <= 'Z'.charCodeAt(0); letter += 1) {
      const root = `${String.fromCharCode(letter)}:\\`;
      if (safe(() => fs.existsSync(root), false)) {
        out.push({ name: root.slice(0, 2), path: root, kind: 'drive' });
      }
    }
    return out;
  }

  out.push({ name: '/', path: '/', kind: 'drive' });
  // Removable and network volumes: macOS puts them under /Volumes, Linux under
  // /media or /mnt, often one level deeper under the user's name.
  const user = safe(() => os.userInfo().username, '');
  const bases = user ? [...MOUNTS, `/media/${user}`, `/run/media/${user}`] : MOUNTS;
  for (const base of bases) {
    const names = safe(() => fs.readdirSync(base), null);
    if (!names) continue;
    for (const name of names) {
      if (String(name).startsWith('.')) continue;
      const full = path.join(base, name);
      if (full === home) continue;
      if (!safe(() => fs.statSync(full).isDirectory(), false)) continue;
      if (out.some((entry) => entry.path === full)) continue;
      out.push({ name, path: full, kind: 'drive' });
    }
  }
  return out;
}

function basename(path, p) {
  return path.basename(String(p).replace(/[\\/]+$/, '')) || String(p);
}

function safe(fn, fallback) {
  try {
    const value = fn();
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

module.exports = { listDrives };
