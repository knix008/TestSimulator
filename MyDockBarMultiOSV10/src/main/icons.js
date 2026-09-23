'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { app, nativeImage } = require('electron');

const DIRECT = new Set(['.png', '.svg', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);

function cacheDir() {
  const dir = path.join(app.getPath('userData'), 'icon-cache');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function hash(str) {
  return crypto.createHash('sha1').update(str).digest('hex').slice(0, 20);
}

function toDataUrl(image) {
  if (!image || image.isEmpty()) return null;
  return image.toDataURL();
}

/** Cache a NativeImage to disk so we do not re-extract on every launch. */
function store(key, image) {
  if (!image || image.isEmpty()) return null;
  const target = path.join(cacheDir(), `${hash(key)}.png`);
  try {
    fs.writeFileSync(target, image.toPNG());
    return target;
  } catch (err) {
    console.error('[icons] cache write failed:', err.message);
    return null;
  }
}

function readCached(key, mtimeMs) {
  const target = path.join(cacheDir(), `${hash(key)}.png`);
  try {
    const stat = fs.statSync(target);
    // Invalidate when the source binary is newer than the cached bitmap.
    if (mtimeMs && stat.mtimeMs < mtimeMs) return null;
    return target;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Linux: freedesktop icon-theme lookup for bare `Icon=firefox` names.
 * ------------------------------------------------------------------ */

const LINUX_ICON_ROOTS = [
  path.join(os.homedir(), '.local', 'share', 'icons'),
  path.join(os.homedir(), '.icons'),
  '/usr/share/icons',
  '/usr/local/share/icons',
  '/usr/share/pixmaps',
  '/var/lib/flatpak/exports/share/icons',
  path.join(os.homedir(), '.local', 'share', 'flatpak', 'exports', 'share', 'icons'),
];

const PREFERRED_SIZES = ['512x512', '256x256', '192x192', '128x128', '96x96', '64x64', '48x48', 'scalable'];

function findLinuxThemeIcon(name) {
  const exts = ['.png', '.svg', '.xpm'];
  for (const root of LINUX_ICON_ROOTS) {
    // Flat directories such as /usr/share/pixmaps.
    for (const ext of exts) {
      const flat = path.join(root, name + ext);
      if (fs.existsSync(flat)) return flat;
    }
    let themes;
    try {
      themes = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory());
    } catch {
      continue;
    }
    // Look in well-known themes first, then anything else present.
    const ordered = [...themes].sort((a, b) => rankTheme(a.name) - rankTheme(b.name));
    for (const theme of ordered) {
      for (const size of PREFERRED_SIZES) {
        for (const category of ['apps', 'devices', 'mimetypes', 'places']) {
          for (const ext of exts) {
            const candidate = path.join(root, theme.name, size, category, name + ext);
            if (fs.existsSync(candidate)) return candidate;
          }
        }
      }
    }
  }
  return null;
}

function rankTheme(name) {
  const order = ['hicolor', 'Adwaita', 'breeze', 'Papirus', 'gnome'];
  const idx = order.indexOf(name);
  return idx === -1 ? order.length : idx;
}

/* ------------------------------------------------------------------ */

/**
 * Resolve an icon for a dock item to something the renderer can display.
 * Returns a `file://` URL, a data URL, or null when nothing could be found.
 */
async function resolve(item) {
  const explicit = item.icon;
  if (explicit) {
    const ext = path.extname(explicit).toLowerCase();
    if (DIRECT.has(ext) && fs.existsSync(explicit)) return pathToUrl(explicit);
    if (explicit.startsWith('data:')) return explicit;
    if (process.platform === 'linux' && !explicit.includes(path.sep)) {
      const found = findLinuxThemeIcon(explicit);
      if (found) return pathToUrl(found);
    }
    if (fs.existsSync(explicit)) {
      const extracted = await extract(explicit);
      if (extracted) return extracted;
    }
  }

  const target = item.path;
  if (!target) return null;

  const ext = path.extname(target).toLowerCase();
  if (DIRECT.has(ext) && fs.existsSync(target)) return pathToUrl(target);

  return extract(target);
}

/** Pull the icon out of an executable / .app / .lnk, using the on-disk cache. */
async function extract(target) {
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(target).mtimeMs;
  } catch {
    return null;
  }

  const cached = readCached(target, mtimeMs);
  if (cached) return pathToUrl(cached);

  try {
    const image = await app.getFileIcon(target, { size: 'large' });
    const saved = store(target, image);
    if (saved) return pathToUrl(saved);
    return toDataUrl(image);
  } catch (err) {
    console.error(`[icons] extraction failed for ${target}:`, err.message);
    return null;
  }
}

function pathToUrl(p) {
  let resolved = path.resolve(p).replace(/\\/g, '/');
  if (!resolved.startsWith('/')) resolved = `/${resolved}`;
  return `file://${encodeURI(resolved)}`;
}

/** Copy a user-picked image into the app's own storage so it survives moves. */
function importCustomIcon(sourcePath) {
  const dir = path.join(app.getPath('userData'), 'custom-icons');
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(sourcePath).toLowerCase() || '.png';
  const target = path.join(dir, `${hash(sourcePath + Date.now())}${ext}`);

  if (DIRECT.has(ext)) {
    fs.copyFileSync(sourcePath, target);
    return target;
  }
  // .ico / .exe / .icns -> rasterise to png first.
  const image = nativeImage.createFromPath(sourcePath);
  if (image.isEmpty()) return sourcePath;
  const png = target.replace(/\.[^.]+$/, '.png');
  fs.writeFileSync(png, image.toPNG());
  return png;
}

function clearCache() {
  const dir = cacheDir();
  for (const file of fs.readdirSync(dir)) {
    try {
      fs.unlinkSync(path.join(dir, file));
    } catch { /* leave locked files alone */ }
  }
}

module.exports = { resolve, extract, importCustomIcon, clearCache, pathToUrl, findLinuxThemeIcon };
