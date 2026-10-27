/**
 * Wallpaper library: originals live as files in <userData>/backgrounds with a
 * library.json index (only a marker goes into settings.json), so there is no
 * import size limit. Decoding and downscaling are done by the Tauri program
 * (src-tauri/src/images.rs) — the jobs Electron's nativeImage did.
 */
const fs = require('fs');
const path = require('path');
const UTIF = require('utif');
const rpc = require('./rpc');
const { userDataDir } = require('./paths');
const { updateSettings } = require('./settings');

const BG_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const BG_EXTENSIONS = Object.keys(BG_MIME).map((ext) => ext.slice(1));

// Cap wallpaper dimensions so the generated CSS data URL stays small. A huge
// --bg-image value (e.g. a 6000×4500 photo → ~11 MB data URL) is silently
// dropped by the webview and also risks exceeding GPU texture limits, so the
// wallpaper never paints. 2560px on the long edge is ample for a background.
const BG_MAX_DIMENSION = 2560;

/** The webview cannot paint TIFF as CSS backgrounds; convert to PNG. */
async function tiffToPngBuffer(buf) {
  const ifds = UTIF.decode(buf);
  if (!ifds?.length) throw new Error('invalid_tiff');
  UTIF.decodeImage(buf, ifds[0]);
  const rgba = Buffer.from(UTIF.toRGBA8(ifds[0]));
  const width = ifds[0].width;
  const height = ifds[0].height;
  if (!width || !height || rgba.length < width * height * 4) {
    throw new Error('invalid_tiff');
  }
  const png = await rpc.call('image.encodePng', { width, height, rgba: rgba.toString('base64') });
  if (!png) throw new Error('tiff_decode_failed');
  return Buffer.from(png, 'base64');
}

async function prepareBackgroundBytes(buf, ext) {
  if (ext === '.tif' || ext === '.tiff') {
    return { buf: await tiffToPngBuffer(buf), ext: '.png', mime: 'image/png' };
  }
  const mime = BG_MIME[ext];
  if (!mime) return { error: 'unsupported_type' };
  return { buf, ext, mime };
}

function backgroundDir() {
  return path.join(userDataDir(), 'backgrounds');
}

function libraryMetaPath() {
  return path.join(backgroundDir(), 'library.json');
}

function newBackgroundId() {
  return `bg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function fileToDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = BG_MIME[ext] || 'image/png';
  try {
    const url = await rpc.call('image.dataUrl', { path: filePath, mime, max: BG_MAX_DIMENSION });
    if (url) return url;
  } catch (_) {
    /* fall back to the raw bytes below */
  }
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function defaultLibrary() {
  return { items: [], activeId: '' };
}

function migrateLegacyWallpaper(lib) {
  const dir = backgroundDir();
  if (!fs.existsSync(dir)) return lib;
  const legacy = fs
    .readdirSync(dir)
    .find((name) => /^wallpaper\./i.test(name) && BG_MIME[path.extname(name).toLowerCase()]);
  if (!legacy) return lib;
  if (lib.items.some((item) => item.file === legacy)) return lib;
  const id = newBackgroundId();
  lib.items.unshift({
    id,
    file: legacy,
    name: 'Wallpaper',
    addedAt: Date.now(),
  });
  if (!lib.activeId) lib.activeId = id;
  return lib;
}

function readLibrary() {
  const dir = backgroundDir();
  fs.mkdirSync(dir, { recursive: true });
  let lib = defaultLibrary();
  const meta = libraryMetaPath();
  if (fs.existsSync(meta)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(meta, 'utf8'));
      if (parsed && Array.isArray(parsed.items)) {
        lib = {
          items: parsed.items
            .filter((item) => item && item.id && item.file)
            .map((item) => ({
              id: String(item.id),
              file: String(item.file),
              name: String(item.name || item.file),
              addedAt: Number(item.addedAt) || 0,
            })),
          activeId: typeof parsed.activeId === 'string' ? parsed.activeId : '',
        };
      }
    } catch (_) {
      lib = defaultLibrary();
    }
  }
  lib = migrateLegacyWallpaper(lib);
  // Drop missing files.
  lib.items = lib.items.filter((item) => fs.existsSync(path.join(dir, item.file)));
  if (lib.activeId && !lib.items.some((item) => item.id === lib.activeId)) {
    lib.activeId = '';
  }
  writeLibrary(lib);
  return lib;
}

function writeLibrary(lib) {
  const dir = backgroundDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    libraryMetaPath(),
    JSON.stringify(
      {
        items: lib.items || [],
        activeId: lib.activeId || '',
      },
      null,
      2
    ),
    'utf8'
  );
}

async function listBackgroundLibrary() {
  const dir = backgroundDir();
  const lib = readLibrary();
  const items = [];
  for (const item of lib.items) {
    let dataUrl = '';
    try {
      dataUrl = await fileToDataUrl(path.join(dir, item.file));
    } catch (_) {
      dataUrl = '';
    }
    if (dataUrl) items.push({ id: item.id, name: item.name, dataUrl });
  }
  return {
    ok: true,
    items,
    activeId: lib.activeId || '',
  };
}

async function getActiveBackgroundDataUrl() {
  const dir = backgroundDir();
  const lib = readLibrary();
  if (!lib.activeId) return null;
  const item = lib.items.find((entry) => entry.id === lib.activeId);
  if (!item) return null;
  const filePath = path.join(dir, item.file);
  if (!fs.existsSync(filePath)) return null;
  try {
    return await fileToDataUrl(filePath);
  } catch (_) {
    return null;
  }
}

/** Keep library activeId and settings wallpaper markers in sync across restarts. */
function syncBackgroundSelectionFromSettings(settings = {}) {
  try {
    const lib = readLibrary();
    const settingsId =
      typeof settings.backgroundImageId === 'string' ? settings.backgroundImageId : '';
    const wantsFile = settings.backgroundImage === 'file' || !!settingsId;
    let activeId = lib.activeId || '';
    if (settingsId && lib.items.some((item) => item.id === settingsId)) {
      activeId = settingsId;
    } else if (!activeId && wantsFile && lib.items.length) {
      activeId = lib.items[0].id;
    }
    if (activeId !== lib.activeId) {
      lib.activeId = activeId;
      writeLibrary(lib);
    }
    const hasImage = !!(activeId && lib.items.some((item) => item.id === activeId));
    const patch = {
      backgroundImage: hasImage ? 'file' : '',
      backgroundImageId: hasImage ? activeId : '',
    };
    if (settings.bgTransparency != null) {
      patch.bgTransparency = Math.max(
        0,
        Math.min(100, Number(settings.bgTransparency) || 0)
      );
    }
    if (typeof settings.backgroundFit === 'string' && settings.backgroundFit) {
      patch.backgroundFit = settings.backgroundFit;
    }
    updateSettings(patch);
  } catch (_) {
    /* ignore */
  }
}

/** A file the user picked (the program shows the open dialog): add it to the library. */
async function importBackground(src) {
  const srcExt = path.extname(src).toLowerCase();
  if (!BG_MIME[srcExt]) {
    return { ok: false, error: 'unsupported_type' };
  }

  let buf;
  try {
    buf = fs.readFileSync(src);
  } catch (err) {
    return { ok: false, error: err.message || 'read_failed' };
  }
  // No size cap: originals are stored as files and downscaled when a CSS data URL
  // is generated (see fileToDataUrl / BG_MAX_DIMENSION), so any resolution is fine.

  let prepared;
  try {
    prepared = await prepareBackgroundBytes(buf, srcExt);
  } catch (err) {
    return { ok: false, error: err.message || 'decode_failed' };
  }
  if (prepared.error) {
    return { ok: false, error: prepared.error };
  }

  const { buf: outBuf, ext, mime } = prepared;
  const dir = backgroundDir();
  fs.mkdirSync(dir, { recursive: true });
  const lib = readLibrary();
  const id = newBackgroundId();
  const baseName = path.basename(src, path.extname(src)) || 'Wallpaper';
  const file = `${id}${ext}`;
  fs.writeFileSync(path.join(dir, file), outBuf);
  lib.items.unshift({
    id,
    file,
    name: baseName,
    addedAt: Date.now(),
  });
  lib.activeId = id;
  writeLibrary(lib);

  const chosenDir = path.dirname(src);
  try {
    updateSettings({
      backgroundImageDir: chosenDir,
      backgroundImage: 'file',
      backgroundImageId: id,
    });
  } catch (_) {
    /* ignore */
  }

  const listed = await listBackgroundLibrary();
  return {
    ok: true,
    id,
    dataUrl: `data:${mime};base64,${outBuf.toString('base64')}`,
    directory: chosenDir,
    items: listed.items,
    activeId: listed.activeId,
  };
}

async function selectBackground(id) {
  const lib = readLibrary();
  const nextId = id == null ? '' : String(id);
  if (nextId && !lib.items.some((item) => item.id === nextId)) {
    return { ok: false, error: 'not_found', ...(await listBackgroundLibrary()) };
  }
  lib.activeId = nextId;
  writeLibrary(lib);
  const dataUrl = nextId ? await getActiveBackgroundDataUrl() : null;
  updateSettings({
    backgroundImage: dataUrl ? 'file' : '',
    backgroundImageId: nextId,
  });
  return {
    ok: true,
    id: nextId,
    dataUrl: dataUrl || '',
    ...(await listBackgroundLibrary()),
  };
}

async function removeBackground(id) {
  const targetId = String(id || '');
  if (!targetId) return { ok: false, error: 'missing_id' };
  const dir = backgroundDir();
  const lib = readLibrary();
  const item = lib.items.find((entry) => entry.id === targetId);
  if (!item) return { ok: false, error: 'not_found', ...(await listBackgroundLibrary()) };
  try {
    fs.unlinkSync(path.join(dir, item.file));
  } catch (_) {
    /* ignore missing file */
  }
  lib.items = lib.items.filter((entry) => entry.id !== targetId);
  if (lib.activeId === targetId) lib.activeId = '';
  writeLibrary(lib);
  const dataUrl = await getActiveBackgroundDataUrl();
  updateSettings({
    backgroundImage: dataUrl ? 'file' : '',
    backgroundImageId: lib.activeId || '',
  });
  return {
    ok: true,
    removedId: targetId,
    dataUrl: dataUrl || '',
    activeId: lib.activeId || '',
    ...(await listBackgroundLibrary()),
  };
}

async function loadBackground() {
  const dataUrl = await getActiveBackgroundDataUrl();
  const lib = readLibrary();
  return dataUrl
    ? { ok: true, dataUrl, activeId: lib.activeId || '' }
    : { ok: false, activeId: '' };
}

async function clearBackground() {
  const lib = readLibrary();
  lib.activeId = '';
  writeLibrary(lib);
  try {
    updateSettings({ backgroundImage: '', backgroundImageId: '' });
  } catch (_) {
    /* ignore */
  }
  return { ok: true, ...(await listBackgroundLibrary()) };
}

module.exports = {
  BG_MIME,
  BG_EXTENSIONS,
  BG_MAX_DIMENSION,
  backgroundDir,
  readLibrary,
  listBackgroundLibrary,
  syncBackgroundSelectionFromSettings,
  importBackground,
  selectBackground,
  removeBackground,
  loadBackground,
  clearBackground,
};
