// Application state and the actions every part of the UI shares: what is being
// browsed (a folder, a catalog selection, a search, the basket, a date), the
// listed items, the selection, the mode (Manage / View / Edit / Dashboard),
// navigation history, file operations and organizing.
import { baseName, Catalog, joinPath, parentOf, TEXT_FIELDS } from './catalog/catalog.js';
import { history } from './history.js';
import { editJpegExif, embedJpegXmp } from './formats/exif-edit.js';
import { embedXmp, readEmbeddedXmp } from './formats/xmpembed.js';
import { readXmpPacket } from './formats/jpeg-meta.js';
import { groupItems, sortItems } from './catalog/listing.js';
import { matchFilters, matchSearch, parseSearch, passesListFilter, smartMatches } from './catalog/query.js';
import { isArchive, isMedia, IMAGE_EXTENSIONS, MEDIA_EXTENSIONS, kindOf } from './formats/types.js';
import { readMetadata } from './formats/exif.js';
import { quickSize } from './formats/decode.js';
import { buildXmp, sidecarName, updateXmp } from './formats/xmp.js';
import { plural, t } from './i18n.js';
import { fs } from './platform/fs.js';
import { errorText, isDesktop, invoke } from './platform/native.js';
import { rememberFile, rememberFolder, saveSettings } from './settings.js';
import { thumbs } from './thumbs/thumbs.js';
import { confirmDialog, progressDialog, promptDialog, toast } from './ui/dialog.js';

const listeners = new Map();

export const app = {
  settings: null,
  catalog: new Catalog(),
  state: {
    mode: 'manage',
    source: { type: 'welcome' },
    items: [],
    list: [],
    groups: [],
    selection: new Set(),
    focus: null,
    anchor: null,
    loading: false,
    error: null,
    history: { back: [], forward: [] },
    listFilter: { rating: 0, label: null, tagged: false, kinds: null, text: '' },
    clipboard: null,
    viewPath: null,
  },

  on(event, listener) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(listener);
    return () => listeners.get(event).delete(listener);
  },

  emit(event, data) {
    for (const listener of listeners.get(event) ?? []) {
      try { listener(data); } catch (error) { console.error(error); }
    }
  },

  saveSettings() {
    saveSettings(app.settings);
    app.emit('settings', app.settings);
  },
};

const recordOf = (path) => app.catalog.get(path);

// ───────────────────────── catalog persistence

let catalogTimer = null;
let catalogSaving = Promise.resolve();
// Desktop: the catalog lives in SQLite (catalog.sqlite). Each save writes only
// the records whose JSON changed since the last save, and removes deleted ones.
let savedRecords = null; // path → JSON last written to the database (null = JSON file storage)

export async function loadCatalog() {
  try {
    let fromDb;
    if (isDesktop()) fromDb = await invoke('catalog_db_load').catch((error) => { console.warn('catalog database', error); return undefined; });
    if (typeof fromDb === 'string') {
      const data = JSON.parse(fromDb);
      app.catalog = new Catalog(data);
      savedRecords = new Map(Object.entries(data.files ?? {}).map(([path, record]) => [path, JSON.stringify(record)]));
    } else {
      // Web, or the first desktop start: the JSON catalog (migrated into the database by the next save).
      const text = await fs.readData('catalog.json');
      const data = typeof text === 'string' ? JSON.parse(text) : text;
      app.catalog = new Catalog(data);
      if (fromDb === null) {
        savedRecords = new Map();
        app.catalog.dirty = true;
        saveCatalogSoon(0);
      }
    }
  } catch (error) {
    console.error('catalog', error);
    app.catalog = new Catalog();
    toast(t('catalog.loadFailed', { error: errorText(error) }), 'error', 6000);
  }
  app.catalog.onChange(onCatalogChange);
}

function onCatalogChange(change) {
  saveCatalogSoon();
  app.emit('catalog', change);
  if ((app.settings?.xmpSidecar || app.settings?.xmpEmbed) && ['rating', 'label', 'keywords', 'categories', 'fields'].includes(change.what)) writeSidecars(change.paths);
}

export function saveCatalogSoon(delay = 1200) {
  clearTimeout(catalogTimer);
  catalogTimer = setTimeout(saveCatalogNow, delay);
}

export function saveCatalogNow() {
  clearTimeout(catalogTimer);
  if (!app.catalog.dirty) return catalogSaving;
  app.catalog.dirty = false;
  const data = app.catalog.toJSON();
  if (savedRecords) {
    const upserts = [];
    const present = new Set();
    for (const [path, record] of Object.entries(data.files)) {
      const json = JSON.stringify(record);
      present.add(path);
      if (savedRecords.get(path) !== json) upserts.push([path, json]);
    }
    const removes = [...savedRecords.keys()].filter((path) => !present.has(path));
    const meta = Object.entries(data).filter(([key]) => key !== 'files').map(([key, value]) => [key, JSON.stringify(value)]);
    catalogSaving = catalogSaving.then(async () => {
      await invoke('catalog_db_save', { upserts, removes, meta });
      for (const [path, json] of upserts) savedRecords.set(path, json);
      for (const path of removes) savedRecords.delete(path);
    }).catch((error) => {
      app.catalog.dirty = true;
      console.error('catalog save', error);
    });
    return catalogSaving;
  }
  catalogSaving = catalogSaving.then(() => fs.writeData('catalog.json', isDesktop() ? JSON.stringify(data) : data)).catch((error) => {
    app.catalog.dirty = true;
    console.error('catalog save', error);
  });
  return catalogSaving;
}

function xmpFields(record) {
  const fields = { rating: record.rating, label: record.label, keywords: record.keywords, categories: record.categories };
  for (const key of TEXT_FIELDS) if (record[key]) fields[key] = record[key];
  return fields;
}

const isJpegName = (path) => /\.(jpe?g|jpe|jfif)$/i.test(path);
const embedsXmp = (path) => /\.(png|webp|tiff?)$/i.test(path);

/**
 * Writes what the catalog knows (rating, label, keywords, categories, IPTC
 * fields) into the files: embedded XMP in JPEG, PNG, WebP and TIFF when `embed`,
 * otherwise an XMP sidecar next to the photo. Returns the number of files written.
 */
export async function writeMetadataToFiles(paths, { embed = app.settings.xmpEmbed } = {}) {
  if (!fs.caps.write) return 0;
  let written = 0;
  for (const path of paths) {
    if (fs.isReadOnly?.(path)) continue;
    const record = recordOf(path) ?? {};
    try {
      if (embed && isJpegName(path)) {
        const bytes = await fs.read(path);
        const existing = readXmpPacket(bytes);
        let out = embedJpegXmp(bytes, existing ? updateXmp(existing, xmpFields(record)) : buildXmp(xmpFields(record)));
        const exifChanges = {};
        if (record.author) exifChanges.artist = record.author;
        if (record.copyright) exifChanges.copyright = record.copyright;
        if (record.caption) exifChanges.description = record.caption;
        if (record.geotagged && record.meta?.lat != null) exifChanges.gps = { lat: record.meta.lat, lon: record.meta.lon, alt: record.meta.alt };
        if (Object.keys(exifChanges).length) out = editJpegExif(out, exifChanges);
        await fs.write(path, out);
        thumbs.invalidate(path);
        const [stat] = await fs.stat([path]).catch(() => [null]);
        if (stat) { record.size = stat.size; record.modified = stat.modified; }
      } else if (embed && embedsXmp(path)) {
        const bytes = await fs.read(path);
        const existing = readEmbeddedXmp(bytes);
        await fs.write(path, embedXmp(bytes, existing ? updateXmp(existing, xmpFields(record)) : buildXmp(xmpFields(record))));
        thumbs.invalidate(path);
        const [stat] = await fs.stat([path]).catch(() => [null]);
        if (stat) { record.size = stat.size; record.modified = stat.modified; }
      } else {
        const sidecar = joinPath(parentOf(path), sidecarName(path.split(/[\\/]/).pop()));
        let existing = null;
        try { existing = new TextDecoder().decode(await fs.read(sidecar)); } catch { /* none yet */ }
        const text = existing ? updateXmp(existing, xmpFields(record)) : buildXmp(xmpFields(record));
        await fs.write(sidecar, new TextEncoder().encode(text));
      }
      written += 1;
    } catch (error) {
      console.warn('metadata', path, error);
    }
  }
  return written;
}

function writeSidecars(paths) {
  return writeMetadataToFiles(paths);
}

// Thumbnails tell the catalog what they learned (metadata, pixel size).
let itemIndex = new Map();
let indexedItems = null;
thumbs.onInfo = (path, result) => {
  if (indexedItems !== app.state.items) { itemIndex = new Map(app.state.items.map((i) => [i.path, i])); indexedItems = app.state.items; }
  const item = itemIndex.get(path);
  const record = app.catalog.get(path);
  if (item && (!record?.indexed || !app.catalog.isCurrent(path, item.size, item.modified) || (!record.width && result.width))) {
    app.catalog.setInfo(path, { size: item.size, modified: item.modified, meta: result.meta ?? {}, width: result.width, height: result.height });
    if (result.hash) app.catalog.get(path).hash = result.hash;
    saveCatalogSoon(3000);
    app.emit('info', path);
  }
};

// ───────────────────────── sources

const sameSource = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Shows `source` in the file list: { type: 'folder', path } | { type: 'filter', filters, title } | … */
export async function openSource(source, { history = true, select = null } = {}) {
  const { state } = app;
  if (history && state.source.type !== 'welcome' && !sameSource(state.source, source)) {
    state.history.back.push(state.source);
    if (state.history.back.length > 50) state.history.back.shift();
    state.history.forward = [];
  }
  state.source = source;
  state.loading = true;
  state.error = null;
  app.emit('source', source);
  try {
    state.items = await loadItems(source);
  } catch (error) {
    state.items = [];
    state.error = errorText(error);
  }
  state.loading = false;
  if (source.type === 'folder') {
    rememberFolder(app.settings, source.path);
    app.saveSettings();
    // Thumbnails stored for this folder show at once (one read of its index).
    await thumbs.useFolder(source.path, state.items).catch(() => 0);
  }
  rebuildList();
  const keep = select ? new Set([].concat(select)) : new Set();
  state.selection = new Set(state.list.filter((item) => keep.has(item.path)).map((item) => item.path));
  state.focus = [...state.selection][0] ?? null;
  state.anchor = state.focus;
  app.emit('items', { reset: true });
  app.emit('selection');
  thumbs.cancelExcept(state.list.filter((item) => !item.isDir));
}

async function loadItems(source) {
  const { settings } = app;
  switch (source.type) {
    case 'folder': {
      const listing = await fs.list(source.path, { hidden: settings.showHidden });
      const dirs = settings.showFolders ? listing.dirs.map((dir) => ({ ...dir, isDir: true })) : [];
      const files = listing.files.filter((file) => settings.showAllFiles || isMedia(file.name) || isArchive(file.name)).map((file) => ({ ...file, isDir: false }));
      return [...dirs, ...files];
    }
    case 'filter': case 'search': case 'calendar': {
      const terms = source.type === 'search' ? parseSearch(source.text) : null;
      const out = [];
      for (const [path, record] of app.catalog.files) {
        if (!record.indexed && !source.includeUnindexed) continue;
        const item = itemFromRecord(path, record);
        if (source.scope && !path.toLowerCase().startsWith(source.scope.toLowerCase())) continue;
        if (terms ? matchSearch(terms, item, record) : matchFilters(source.filters, item, record, source.mode ?? app.settings.catalogMatch)) out.push(item);
      }
      return out;
    }
    case 'basket':
      return app.catalog.basket.map((path) => itemFromRecord(path, recordOf(path) ?? {}));
    case 'collection': {
      const collection = app.catalog.collection(source.id);
      if (!collection) return [];
      if (!collection.smart) return collection.paths.map((path) => itemFromRecord(path, recordOf(path) ?? {}));
      const out = [];
      for (const [path, record] of app.catalog.files) {
        if (!record.indexed) continue;
        const item = itemFromRecord(path, record);
        if (smartMatches(collection.rules, collection.match, item, record)) out.push(item);
      }
      return out;
    }
    case 'paths':
      return source.paths.map((path) => itemFromRecord(path, recordOf(path) ?? {}));
    default:
      return [];
  }
}

export function itemFromRecord(path, record) {
  return { path, name: path.split(/[\\/]/).pop(), isDir: false, size: record.size ?? 0, modified: record.modified ?? 0, created: record.modified ?? 0 };
}

/** Sort, filter and group the loaded items (after a setting or catalog change). */
export function rebuildList() {
  const { state, settings } = app;
  const filtered = state.items.filter((item) => passesListFilter(state.listFilter, item, recordOf(item.path)));
  const sorted = sortItems(filtered, settings.sort, recordOf);
  state.groups = groupItems(sorted, settings.groupBy, recordOf);
  state.list = state.groups.flatMap((group) => group.items);
  const present = new Set(state.list.map((item) => item.path));
  for (const path of [...state.selection]) if (!present.has(path)) state.selection.delete(path);
  if (state.focus && !present.has(state.focus)) state.focus = null;
}

export function refreshList({ keepScroll = true } = {}) {
  rebuildList();
  app.emit('items', { reset: !keepScroll });
  app.emit('selection');
}

export async function reload() {
  const selection = [...app.state.selection];
  const scroll = app.state.source;
  await openSource(scroll, { history: false, select: selection });
}

export function openFolder(path, options) {
  return openSource({ type: 'folder', path }, options);
}

export function goBack() {
  const previous = app.state.history.back.pop();
  if (!previous) return;
  app.state.history.forward.push(app.state.source);
  openSource(previous, { history: false });
}

export function goForward() {
  const next = app.state.history.forward.pop();
  if (!next) return;
  app.state.history.back.push(app.state.source);
  openSource(next, { history: false });
}

export function goUp() {
  const { source } = app.state;
  if (source.type !== 'folder') return;
  const parent = parentOf(source.path);
  if (parent && parent !== source.path) openFolder(parent, { select: source.path });
}

// ───────────────────────── selection

export const selectedItems = () => app.state.list.filter((item) => app.state.selection.has(item.path));
export const selectedFiles = () => selectedItems().filter((item) => !item.isDir);
export const focusedItem = () => app.state.list.find((item) => item.path === app.state.focus) ?? null;

/** Paths to act on: the selection, else the focused item. */
export function targetPaths({ filesOnly = false } = {}) {
  const items = selectedItems();
  const list = items.length ? items : [focusedItem()].filter(Boolean);
  return (filesOnly ? list.filter((item) => !item.isDir) : list).map((item) => item.path);
}

export function setSelection(paths, focus = null) {
  app.state.selection = new Set(paths);
  app.state.focus = focus ?? paths[paths.length - 1] ?? null;
  app.state.anchor = app.state.focus;
  app.emit('selection');
}

export function selectItem(path, { toggle = false, range = false } = {}) {
  const { state } = app;
  if (range && state.anchor) {
    const paths = state.list.map((item) => item.path);
    const a = paths.indexOf(state.anchor);
    const b = paths.indexOf(path);
    if (a >= 0 && b >= 0) {
      const slice = paths.slice(Math.min(a, b), Math.max(a, b) + 1);
      state.selection = toggle ? new Set([...state.selection, ...slice]) : new Set(slice);
      state.focus = path;
      app.emit('selection');
      return;
    }
  }
  if (toggle) {
    if (state.selection.has(path)) state.selection.delete(path); else state.selection.add(path);
  } else {
    state.selection = new Set([path]);
  }
  state.focus = path;
  state.anchor = path;
  app.emit('selection');
}

export function selectAll() { setSelection(app.state.list.map((item) => item.path), app.state.focus); }
export function selectNone() { setSelection([]); }
export function invertSelection() { setSelection(app.state.list.filter((item) => !app.state.selection.has(item.path)).map((item) => item.path)); }
export function selectFilesOnly() { setSelection(app.state.list.filter((item) => !item.isDir).map((item) => item.path)); }

// ───────────────────────── modes

let modeGuard = null;
/** Return false to refuse a mode change (for example while a background removal is running). */
export function setModeGuard(fn) { modeGuard = fn; }

export function setMode(mode, { path } = {}) {
  if (modeGuard?.(mode, path) === false) return;
  if (path) app.state.viewPath = path;
  if (app.state.mode === mode && !path) return;
  app.state.mode = mode;
  app.emit('mode', mode);
}

/** Opens the viewer on an item (or the focused one). */
export function viewItem(path = app.state.focus) {
  const item = app.state.list.find((i) => i.path === path);
  if (!item) return;
  if (item.isDir) { openFolder(item.path); return; }
  if (isArchive(item.name)) { app.emit('open-archive', item.path); return; }
  if (!path.startsWith('@')) { rememberFile(app.settings, path); app.saveSettings(); }
  setMode('view', { path });
}

/** Images of the current list (the viewer's sequence). */
export const viewableList = () => app.state.list.filter((item) => !item.isDir && kindOf(item.name));

// ───────────────────────── organizing

function organizeTargets(paths) {
  return (paths ?? targetPaths({ filesOnly: true })).filter(Boolean);
}

export function rate(rating, paths) {
  const list = organizeTargets(paths);
  if (!list.length) return;
  app.catalog.setRating(list, rating);
  toast(rating ? t('organize.rated', { n: rating, count: list.length }) : t('organize.unrated', { count: list.length }), 'info', 1600);
}

export function setLabel(label, paths) {
  const list = organizeTargets(paths);
  if (!list.length) return;
  app.catalog.setLabel(list, label);
}

export function toggleTag(paths) {
  const list = organizeTargets(paths);
  if (!list.length) return;
  app.catalog.toggleTagged(list);
}

export function addToBasket(paths = targetPaths({ filesOnly: true })) {
  if (!paths.length) return;
  app.catalog.addToBasket(paths);
  toast(plural('basket.added', paths.length), 'info', 1600);
}

// ───────────────────────── file operations

export async function newFolder(dir) {
  const parent = dir || (app.state.source.type === 'folder' ? app.state.source.path : '');
  if (!parent || !fs.caps.mkdir || fs.isReadOnly?.(parent)) return;
  const name = await promptDialog(t('file.newFolderName'), t('file.newFolderDefault'), { title: t('file.newFolder') });
  if (!name) return;
  try {
    const path = await fs.mkdir(parent, name.trim());
    history.push({
      label: t('file.newFolder'),
      undo: async () => {
        const { dirs, files } = await fs.list(path, { hidden: true, probe: false });
        if (dirs.length || files.length) throw new Error(t('undo.folderNotEmpty'));
        await fs.remove([path], false);
        await afterUndo(parentOf(path));
      },
      redo: async () => { await fs.mkdir(parentOf(path), baseName(path)); await afterUndo(parentOf(path), [path]); },
    });
    const showing = app.state.source.type === 'folder' && app.state.source.path.replace(/[\\/]+$/, '').toLowerCase() === parent.replace(/[\\/]+$/, '').toLowerCase();
    app.emit('folders-changed', parent);
    if (showing) { await reload(); setSelection([path], path); }
  } catch (error) {
    toast(errorText(error), 'error', 5000);
  }
}

export async function renameItem(path = app.state.focus) {
  if (!path || !fs.caps.rename) return;
  const name = path.split(/[\\/]/).pop();
  const next = await promptDialog(t('file.renameTo'), name, {
    title: t('file.rename'),
    selectStem: true,
    validate: (value) => (!value.trim() ? t('file.nameEmpty') : /[\\/:*?"<>|]/.test(value) ? t('file.nameInvalid') : null),
  });
  if (!next || next === name) return;
  try {
    const target = await fs.rename(path, next.trim());
    app.catalog.movePath(path, target);
    thumbs.invalidate(path);
    history.push({
      label: t('file.rename'),
      undo: async () => { const back = await fs.rename(target, name); app.catalog.movePath(target, back); thumbs.invalidate(target); await afterUndo(parentOf(back), [back]); },
      redo: async () => { const again = await fs.rename(path, next.trim()); app.catalog.movePath(path, again); thumbs.invalidate(path); await afterUndo(parentOf(again), [again]); },
    });
    await reload();
    setSelection([target], target);
    app.emit('folders-changed', parentOf(path));
  } catch (error) {
    toast(errorText(error), 'error', 5000);
  }
}

export async function deleteItems(paths = targetPaths()) {
  if (!paths.length) return;
  const trash = fs.caps.trash && app.settings.useTrash;
  if (app.settings.confirmDelete || !trash) {
    const ok = await confirmDialog(trash ? plural('file.deleteToTrash', paths.length) : plural('file.deleteForever', paths.length), {
      title: t('file.delete'), ok: t('file.delete'), danger: true, detail: paths.length === 1 ? paths[0] : null,
    });
    if (!ok) return;
  }
  const results = await fs.remove(paths, trash);
  const failed = results.filter((r) => r.error);
  app.catalog.removePaths(results.filter((r) => !r.error).map((r) => r.source));
  for (const path of paths) thumbs.invalidate(path);
  if (failed.length) toast(t('file.deleteFailed', { n: failed.length, error: failed[0].error }), 'error', 6000);
  await removeFromList(results.filter((r) => !r.error).map((r) => r.source));
  app.emit('folders-changed', null);
}

/** Drops items from the list without reloading the folder (keeps the scroll place). */
async function removeFromList(paths) {
  const drop = new Set(paths);
  const { state } = app;
  const index = state.list.findIndex((item) => drop.has(item.path));
  state.items = state.items.filter((item) => !drop.has(item.path));
  rebuildList();
  const next = state.list[Math.min(index, state.list.length - 1)];
  state.selection = new Set(next ? [next.path] : []);
  state.focus = next?.path ?? null;
  state.anchor = state.focus;
  app.emit('items', {});
  app.emit('selection');
  app.emit('removed', paths);
}

/** Copies or moves items into `dir`; the catalog records follow. */
export async function transfer(paths, dir, { move = false, conflict = 'rename', record = true } = {}) {
  if (!paths.length || !dir) return [];
  const progress = paths.length > 20 ? progressDialog(move ? t('file.moving') : t('file.copying'), { cancellable: false }) : null;
  progress?.update(0, paths.length);
  let results;
  try {
    results = move ? await fs.move(paths, dir, conflict) : await fs.copy(paths, dir, conflict);
  } catch (error) {
    progress?.close();
    toast(errorText(error), 'error', 6000);
    return [];
  }
  progress?.close();
  for (const result of results) {
    if (!result.target || result.error || result.skipped) continue;
    if (move) { app.catalog.movePath(result.source, result.target); thumbs.invalidate(result.source); } else app.catalog.copyPath(result.source, result.target);
  }
  const done = results.filter((r) => r.target && !r.error && !r.skipped).length;
  const failed = results.filter((r) => r.error);
  if (failed.length) toast(t('file.transferFailed', { n: failed.length, error: failed[0].error }), 'error', 6000);
  else toast(plural(move ? 'file.moved' : 'file.copied', done), 'success', 2200);
  const pairs = results.filter((r) => r.target && !r.error && !r.skipped).map((r) => ({ source: r.source, target: r.target }));
  if (record && pairs.length) history.push(move ? moveStep(pairs, dir) : copyStep(pairs, dir));
  if (move && app.state.source.type === 'folder') await removeFromList(results.filter((r) => r.target && !r.error && !r.skipped && parentOf(r.source) === app.state.source.path).map((r) => r.source));
  if (app.state.source.type === 'folder' && app.state.source.path === dir) await reload();
  app.emit('folders-changed', dir);
  return results;
}

/** After an undo/redo: show the folder again (selecting `select`) and refresh the trees. */
async function afterUndo(dir, select = []) {
  if (app.state.source.type === 'folder') await reload();
  if (select.length && app.state.source.type === 'folder') setSelection(select.filter((p) => parentOf(p) === app.state.source.path), select[0]);
  app.emit('folders-changed', dir);
}

/** Moves items back where they came from, under their old names. */
function moveStep(pairs, dir) {
  return {
    label: plural('undo.move', pairs.length),
    async undo() {
      for (const pair of pairs) {
        const [result] = await fs.move([pair.target], parentOf(pair.source), 'rename');
        if (!result?.target || result.error) throw new Error(result?.error ?? 'move failed');
        let back = result.target;
        if (baseName(back) !== baseName(pair.source)) back = await fs.rename(back, baseName(pair.source));
        app.catalog.movePath(pair.target, back);
        thumbs.invalidate(pair.target);
      }
      await afterUndo(parentOf(pairs[0].source), pairs.map((p) => p.source));
    },
    async redo() {
      const results = await fs.move(pairs.map((p) => p.source), dir, 'rename');
      results.forEach((result, i) => { if (result.target && !result.error) { app.catalog.movePath(pairs[i].source, result.target); thumbs.invalidate(pairs[i].source); pairs[i].target = result.target; } });
      await afterUndo(dir);
    },
  };
}

/** Removes the copies (to the trash when there is one); redo copies again. */
function copyStep(pairs, dir) {
  return {
    label: plural('undo.copy', pairs.length),
    async undo() {
      const results = await fs.remove(pairs.map((p) => p.target), fs.caps.trash);
      app.catalog.removePaths(results.filter((r) => !r.error).map((r) => r.source));
      for (const pair of pairs) thumbs.invalidate(pair.target);
      await afterUndo(dir);
    },
    async redo() {
      const results = await fs.copy(pairs.map((p) => p.source), dir, 'rename');
      results.forEach((result, i) => { if (result.target && !result.error) { app.catalog.copyPath(pairs[i].source, result.target); pairs[i].target = result.target; } });
      await afterUndo(dir, pairs.map((p) => p.target));
    },
  };
}

export function copyToClipboard(cut = false, paths = targetPaths()) {
  if (!paths.length) return;
  app.state.clipboard = { paths, cut };
  toast(plural(cut ? 'file.cutToClipboard' : 'file.copiedToClipboard', paths.length), 'info', 1600);
  app.emit('clipboard');
}

export async function pasteClipboard() {
  const clip = app.state.clipboard;
  if (!clip || app.state.source.type !== 'folder') return;
  await transfer(clip.paths, app.state.source.path, { move: clip.cut });
  if (clip.cut) app.state.clipboard = null;
}

// ───────────────────────── cataloguing (indexing whole folder trees)

/** First bytes of a file (metadata lives at the start of nearly every format). */
async function readHead(path, bytes = 512 * 1024) {
  try {
    if (isDesktop() && !path.startsWith('@')) return fs.read(path, { max: bytes });
  } catch { /* fall through */ }
  return fs.read(path);
}

/** Reads metadata of every photo under `dir` into the catalog. */
export async function catalogFolder(dir) {
  const progress = progressDialog(t('catalog.indexing'));
  progress.update(0, 0, t('catalog.scanning'));
  try {
    const files = await fs.walk(dir, MEDIA_EXTENSIONS, 200000, app.settings.showHidden);
    let done = 0;
    let added = 0;
    for (const file of files) {
      if (progress.cancelled) break;
      if (!app.catalog.isCurrent(file.path, file.size, file.modified)) {
        let meta = {};
        let size = null;
        if (IMAGE_EXTENSIONS.includes(file.name.split('.').pop().toLowerCase())) {
          try {
            const head = await readHead(file.path);
            meta = (await readMetadata(head)).summary;
            size = quickSize(head, file.name);
          } catch { /* unreadable: keep the file info */ }
        }
        app.catalog.setInfo(file.path, { size: file.size, modified: file.modified, meta, width: size?.width ?? meta.exifWidth, height: size?.height ?? meta.exifHeight });
        added += 1;
      }
      done += 1;
      if (done % 25 === 0 || done === files.length) {
        progress.update(done, files.length, file.path);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    saveCatalogNow();
    app.emit('catalog', { paths: [], what: 'indexed' });
    progress.close();
    toast(t('catalog.indexed', { n: done, added }), 'success', 4000);
  } catch (error) {
    progress.close();
    toast(errorText(error), 'error', 6000);
  }
}
