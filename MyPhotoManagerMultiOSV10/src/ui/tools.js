// Tools: synchronise folders, scan, share / copy image, look up place names,
// EXIF editor, write metadata to files, private folder, "open with".
import { baseName, joinPath, parentOf } from '../catalog/catalog.js';
import { editJpegExif } from '../formats/exif-edit.js';
import { readMetadata } from '../formats/exif.js';
import { decodeImage } from '../formats/decode.js';
import { canvasToBlob } from '../formats/canvas.js';
import { IMAGE_EXTENSIONS, mimeOf } from '../formats/types.js';
import { plural, t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { chooseFolder, errorText, isDesktop } from '../platform/native.js';
import * as vault from '../platform/privatefolder.js';
import { app, openFolder, reload, saveCatalogSoon, targetPaths, writeMetadataToFiles } from '../store.js';
import { thumbs } from '../thumbs/thumbs.js';
import { formatDateTime } from '../util/format.js';
import { confirmDialog, field, openDialog, progressDialog, promptDialog, selectEl, toast } from './dialog.js';
import { h } from './dom.js';

// ───────────────────────── synchronise folders (desktop)

export async function syncDialog() {
  let source = app.state.source.type === 'folder' ? app.state.source.path : null;
  let target = null;
  const sourceLabel = h('span.folder-label', source ?? '');
  const targetLabel = h('span.folder-label', '');
  const mirror = h('input', { type: 'checkbox' });
  const onlyMedia = h('input', { type: 'checkbox', checked: true });
  const ok = await openDialog({
    title: t('sync.title'), width: 560,
    body: h('div',
      h('p.hint', t('sync.hint')),
      field(t('sync.source'), h('div.row-buttons', h('button.btn.small', { type: 'button', onclick: async () => { const d = await chooseFolder(source); if (d) { source = d; sourceLabel.textContent = d; } } }, t('batch.chooseFolder')), sourceLabel)),
      field(t('sync.target'), h('div.row-buttons', h('button.btn.small', { type: 'button', onclick: async () => { const d = await chooseFolder(); if (d) { target = d; targetLabel.textContent = d; } } }, t('batch.chooseFolder')), targetLabel)),
      h('label.check', onlyMedia, t('sync.onlyMedia')),
      h('label.check', mirror, t('sync.mirror'))),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('sync.run'), value: true, primary: true }],
    onSubmit: (v) => !v || (source && target) || (toast(t('sync.choose'), 'error'), false),
  });
  if (!ok) return;
  if (mirror.checked && !(await confirmDialog(t('sync.mirrorConfirm', { target }), { danger: true }))) return;
  const progress = progressDialog(t('sync.running'), { cancellable: false });
  try {
    const report = await fs.sync(source, target, mirror.checked, onlyMedia.checked ? IMAGE_EXTENSIONS.concat(['mp4', 'mov', 'webm', 'm4v', 'xmp']) : []);
    progress.close();
    toast(t('sync.done', report), report.errors.length ? 'error' : 'success', 7000);
  } catch (error) {
    progress.close();
    toast(errorText(error), 'error', 7000);
  }
}

// ───────────────────────── scanner

export async function scanDialog() {
  const folder = app.state.source.type === 'folder' && !fs.isReadOnly?.(app.state.source.path) ? app.state.source.path : await chooseFolder();
  if (!folder) return;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  const target = joinPath(folder, `scan-${stamp}.jpg`);
  try {
    const saved = await fs.scan(target); // the saved file (its extension can differ), or null when cancelled
    if (!saved) return;
    await openFolder(folder, { select: [saved] });
    toast(t('scan.saved', { name: baseName(saved) }), 'success');
  } catch (error) {
    toast(errorText(error), 'error', 8000);
  }
}

// ───────────────────────── share / clipboard

/** Copies the picture (as PNG) to the clipboard. */
export async function copyImageToClipboard(path) {
  try {
    const decoded = await decodeImage(await fs.read(path), baseName(path), { maxSize: 8000 });
    const canvas = decoded.source.getContext ? decoded.source : (() => { const c = document.createElement('canvas'); c.width = decoded.source.width; c.height = decoded.source.height; c.getContext('2d').drawImage(decoded.source, 0, 0); return c; })();
    const blob = await canvasToBlob(canvas, 'image/png');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast(t('share.copied'), 'success');
  } catch (error) {
    toast(t('share.copyFailed', { error: errorText(error) }), 'error', 6000);
  }
}

/** System share sheet (mail, messengers …) where available, else show the files. */
export async function shareFiles(paths) {
  if (!paths.length) return;
  try {
    const files = await Promise.all(paths.slice(0, 20).map(async (path) => new File([await fs.read(path)], baseName(path), { type: mimeOf(path) })));
    if (navigator.canShare?.({ files })) {
      await navigator.share({ files, title: files.length === 1 ? files[0].name : plural('share.photos', files.length) });
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
  }
  // Fallback: open an e-mail with the file names and show the files to attach.
  if (isDesktop()) await fs.reveal(paths[0]).catch(() => {});
  const body = encodeURIComponent(`${t('share.attach')}\n\n${paths.map((p) => baseName(p)).join('\n')}`);
  await fs.openUrl(`mailto:?subject=${encodeURIComponent(plural('share.photos', paths.length))}&body=${body}`).catch(() => { location.href = `mailto:?body=${body}`; });
}

// ───────────────────────── place names (reverse geocoding, OpenStreetMap Nominatim)

export async function lookUpPlaces(paths = targetPaths({ filesOnly: true })) {
  if (!app.settings.mapTiles) { toast(t('places.offline'), 'error', 6000); return; }
  const list = paths.filter((p) => app.catalog.get(p)?.meta?.lat != null);
  if (!list.length) { toast(t('places.noGps'), 'info'); return; }
  const progress = progressDialog(t('places.looking'));
  const cache = new Map();
  let filled = 0;
  try {
    for (const [i, path] of list.entries()) {
      if (progress.cancelled) break;
      progress.update(i, list.length, baseName(path));
      const { lat, lon } = app.catalog.get(path).meta;
      const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
      if (!cache.has(key)) {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=${lat}&lon=${lon}&accept-language=${app.settings.language === 'en' ? 'en' : 'ko,en'}`;
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        cache.set(key, response.ok ? (await response.json()).address ?? {} : {});
        await new Promise((r) => setTimeout(r, 1100)); // Nominatim usage policy: one request per second
      }
      const a = cache.get(key);
      const fields = {
        city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? '',
        state: a.state ?? a.province ?? a.region ?? '',
        country: a.country ?? '',
        countryCode: (a.country_code ?? '').toUpperCase(),
        sublocation: a.suburb ?? a.neighbourhood ?? a.quarter ?? a.road ?? '',
      };
      const record = app.catalog.get(path);
      const changes = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v && !record[k]));
      if (Object.keys(changes).length) { app.catalog.setFields([path], changes); filled += 1; }
    }
  } catch (error) {
    toast(errorText(error), 'error', 6000);
  } finally {
    progress.close();
  }
  saveCatalogSoon();
  toast(t('places.done', { n: filled }), 'success');
}

// ───────────────────────── EXIF editor

export async function exifEditor(paths = targetPaths({ filesOnly: true })) {
  const jpegs = paths.filter((p) => /\.(jpe?g|jpe|jfif)$/i.test(p) && !fs.isReadOnly?.(p));
  if (!jpegs.length) { toast(t('exifEdit.onlyJpeg'), 'info'); return; }
  const first = (await readMetadata(await fs.read(jpegs[0]))).summary;
  const pad = (n) => String(n).padStart(2, '0');
  const local = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const input = (value, type = 'text') => h('input.input', { type, value: value ?? '', step: type === 'datetime-local' ? 1 : undefined });
  const fields = {
    dateTaken: input(local(first.taken), 'datetime-local'),
    make: input(first.make), model: input(first.model), artist: input(first.artist), copyright: input(first.copyright),
    description: input(first.caption), software: input(first.software),
    lat: input(first.lat, 'number'), lon: input(first.lon, 'number'), alt: input(first.alt, 'number'),
  };
  const touched = new Set();
  for (const [key, el] of Object.entries(fields)) el.addEventListener('input', () => touched.add(key));
  const removeGps = h('input', { type: 'checkbox' });
  const ok = await openDialog({
    title: plural('exifEdit.title', jpegs.length), width: 560, id: 'exif-editor',
    body: h('div',
      jpegs.length > 1 ? h('p.hint', t('exifEdit.multiHint')) : null,
      field(t('exif.taken'), fields.dateTaken),
      h('div.field-row', field(t('exifEdit.make'), fields.make), field(t('exifEdit.model'), fields.model)),
      h('div.field-row', field(t('exif.artist'), fields.artist), field(t('exif.copyright'), fields.copyright)),
      field(t('exif.description'), fields.description), field(t('exif.software'), fields.software),
      h('div.field-row', field(t('exifEdit.lat'), fields.lat), field(t('exifEdit.lon'), fields.lon), field(t('exifEdit.alt'), fields.alt)),
      h('label.check', removeGps, t('exifEdit.removeGps'))),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('common.save'), value: true, primary: true }],
  });
  if (!ok) return;
  const changes = {};
  for (const key of ['make', 'model', 'artist', 'copyright', 'description', 'software']) if (touched.has(key)) changes[key] = fields[key].value.trim();
  if (touched.has('dateTaken') && fields.dateTaken.value) changes.dateTaken = new Date(fields.dateTaken.value);
  if (removeGps.checked) changes.gps = null;
  else if (['lat', 'lon', 'alt'].some((k) => touched.has(k)) && fields.lat.value && fields.lon.value) {
    changes.gps = { lat: Number(fields.lat.value), lon: Number(fields.lon.value), alt: fields.alt.value === '' ? null : Number(fields.alt.value) };
  }
  if (!Object.keys(changes).length) return;
  const progress = progressDialog(t('exifEdit.saving'));
  let done = 0;
  for (const [i, path] of jpegs.entries()) {
    progress.update(i, jpegs.length, baseName(path));
    try {
      const bytes = editJpegExif(await fs.read(path), changes);
      await fs.write(path, bytes);
      thumbs.invalidate(path);
      const meta = (await readMetadata(bytes)).summary;
      const [stat] = await fs.stat([path]);
      app.catalog.setInfo(path, { size: stat?.size, modified: stat?.modified, meta });
      done += 1;
    } catch (error) {
      toast(`${baseName(path)}: ${errorText(error)}`, 'error', 6000);
    }
  }
  progress.close();
  app.catalog.changed(jpegs, 'exif');
  saveCatalogSoon();
  toast(t('batch.done', { n: done }), 'success');
  await reload();
}

export async function writeMetadataCommand(paths = targetPaths({ filesOnly: true })) {
  if (!paths.length) return;
  const embed = h('input', { type: 'checkbox', checked: true });
  const ok = await openDialog({
    title: plural('metadata.writeTitle', paths.length),
    body: h('div', h('p.hint', t('metadata.writeHint')), h('label.check', embed, t('metadata.embedJpeg'))),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('metadata.write'), value: true, primary: true }],
  });
  if (!ok) return;
  const progress = progressDialog(t('metadata.writing'), { cancellable: false });
  const n = await writeMetadataToFiles(paths, { embed: embed.checked });
  progress.close();
  toast(t('batch.done', { n }), 'success');
  await reload();
}

// ───────────────────────── private folder

async function askPassword(title, { confirm = false } = {}) {
  const pass = h('input.input', { type: 'password', autocomplete: 'new-password' });
  const again = h('input.input', { type: 'password', autocomplete: 'new-password' });
  const error = h('div.field-error');
  const ok = await openDialog({
    title, width: 420,
    body: h('div', confirm ? h('p.hint', t('private.setupHint')) : null, field(t('private.password'), pass), confirm ? field(t('private.passwordAgain'), again) : null, error),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('common.ok'), value: true, primary: true }],
    onSubmit: (v) => {
      if (!v) return true;
      if (pass.value.length < 4) { error.textContent = t('private.tooShort'); return false; }
      if (confirm && pass.value !== again.value) { error.textContent = t('private.mismatch'); return false; }
      return true;
    },
  });
  return ok ? pass.value : null;
}

/** Unlocks (or sets up) the private folder and shows it. */
export async function openPrivateFolder() {
  try {
    if (!vault.isUnlocked()) {
      if (!(await vault.isSetUp())) {
        const password = await askPassword(t('private.setupTitle'), { confirm: true });
        if (!password) return null;
        await vault.setUp(password);
      } else {
        const password = await askPassword(t('private.unlockTitle'));
        if (!password) return null;
        await vault.unlock(password);
      }
    }
    const root = await vault.mount(t('private.folderName'));
    app.emit('roots-changed');
    await openFolder(root);
    return root;
  } catch (error) {
    toast(/wrong password/.test(error.message) ? t('private.wrong') : errorText(error), 'error', 6000);
    return null;
  }
}

export async function moveToPrivate(paths = targetPaths({ filesOnly: true })) {
  const list = paths.filter((p) => !fs.isReadOnly?.(p));
  if (!list.length) return;
  if (!vault.isUnlocked() && !(await openPrivateFolderSilently())) return;
  if (!(await confirmDialog(plural('private.moveConfirm', list.length), { ok: t('private.move') }))) return;
  const progress = progressDialog(t('private.moving'), { cancellable: false });
  try {
    const moved = await vault.addFiles(list, { onProgress: (i, n, p) => progress.update(i, n, baseName(p)) });
    app.catalog.removePaths(moved);
    progress.close();
    toast(plural('private.moved', moved.length), 'success');
    await vault.mount(t('private.folderName'));
    await reload();
  } catch (error) {
    progress.close();
    toast(errorText(error), 'error', 7000);
  }
}

async function openPrivateFolderSilently() {
  if (!(await vault.isSetUp())) {
    const password = await askPassword(t('private.setupTitle'), { confirm: true });
    if (!password) return false;
    await vault.setUp(password);
    return true;
  }
  const password = await askPassword(t('private.unlockTitle'));
  if (!password) return false;
  try { await vault.unlock(password); return true; } catch { toast(t('private.wrong'), 'error'); return false; }
}

export async function restoreFromPrivate(paths = targetPaths({ filesOnly: true })) {
  const ids = paths.map((p) => vault.idOf(p)).filter(Boolean);
  if (!ids.length) return;
  const dir = isDesktop() ? await chooseFolder() : (app.settings.recentFolders.find((f) => !fs.isReadOnly?.(f)) ?? null);
  if (!dir) { toast(t('web.needWritableFolder'), 'error'); return; }
  const restored = await vault.restoreFiles(ids, dir);
  toast(plural('private.restored', restored.length), 'success');
  const root = await vault.mount(t('private.folderName'));
  await openFolder(root);
}

export function lockPrivateFolder() {
  const root = vault.rootPath();
  vault.lock();
  app.emit('roots-changed');
  if (root && app.state.source.path?.startsWith(root)) openFolder(app.settings.lastFolder && !app.settings.lastFolder.startsWith('@') ? app.settings.lastFolder : parentOf(app.settings.recentFolders[0] ?? '') || '/').catch(() => {});
  toast(t('private.locked'), 'info');
}

export const isPrivatePath = (path) => Boolean(vault.rootPath() && path?.startsWith(vault.rootPath()));
export const privateUnlocked = () => vault.isUnlocked();

// ───────────────────────── open with

export async function openWith(path) {
  const shown = await fs.openWith(path).catch(() => false);
  if (!shown) await fs.openExternal(path).catch((e) => toast(errorText(e), 'error'));
}

export { promptDialog, selectEl, formatDateTime };
