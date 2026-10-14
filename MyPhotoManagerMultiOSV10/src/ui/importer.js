// Import (ACDSee "Import from device / disk"): copies photos from a camera's
// memory card or any folder into the library — sorted into dated sub-folders,
// optionally renamed, duplicates skipped, metadata added, originals deleted.
import { baseName, joinPath, parentOf } from '../catalog/catalog.js';
import { formatDate as formatPattern, renameOne } from '../catalog/rename.js';
import { readMetadata } from '../formats/exif.js';
import { MEDIA_EXTENSIONS } from '../formats/types.js';
import { plural, t } from '../i18n.js';
import { fs, hasFolderAccess, webFs } from '../platform/fs.js';
import { chooseFolder, errorText, invoke, isDesktop } from '../platform/native.js';
import { app, openFolder, saveCatalogNow } from '../store.js';
import { thumbs } from '../thumbs/thumbs.js';
import { formatBytes } from '../util/format.js';
import { field, openDialog, progressDialog, selectEl, toast } from './dialog.js';
import { icon } from './icons.js';
import { h } from './dom.js';

const PATTERNS = ['', 'YYYY', 'YYYY/MM', 'YYYY/YYYY-MM-DD', 'YYYY/MM/DD', 'YYYY-MM-DD'];

/** Folders that look like camera cards (a DCIM folder at the top of a drive). */
async function cameraFolders() {
  const out = [];
  for (const place of await fs.places().catch(() => [])) {
    if (!['drive', 'volume'].includes(place.kind)) continue;
    const dcim = joinPath(place.path, 'DCIM');
    try {
      await fs.list(dcim, { probe: false });
      out.push({ name: `${place.name} — DCIM`, path: dcim });
    } catch { /* not a camera card */ }
  }
  return out;
}

/** Date a photo was taken (metadata), else its file time. */
async function takenOf(file) {
  try {
    const head = await fs.read(file.path);
    return (await readMetadata(head.subarray(0, 512 * 1024))).summary.taken ?? file.modified;
  } catch {
    return file.modified;
  }
}

/** Target sub-folder of a date for a pattern like "YYYY/YYYY-MM-DD". */
export function subfolderFor(time, pattern) {
  if (!pattern) return '';
  return pattern.split('/').map((part) => formatPattern(time, part)).join('/');
}

async function ensureDir(root, relative) {
  let dir = root;
  for (const part of relative.split('/').filter(Boolean)) {
    const next = joinPath(dir, part);
    try { await fs.mkdir(dir, part); } catch { /* exists */ }
    dir = next;
  }
  return dir;
}

export async function importDialog() {
  const settings = app.settings.importer;
  let source = null;
  let destination = settings.destination ?? (app.state.source.type === 'folder' && !fs.isReadOnly?.(app.state.source.path) ? app.state.source.path : null);
  let files = [];
  const chosen = new Set();

  const sourceLabel = h('div.folder-label', '');
  const destLabel = h('div.folder-label', destination?.replace(/^@\d+:/, '') ?? '');
  const grid = h('div.import-grid');
  const summary = h('div.hint');
  const cards = h('div.row-buttons');
  const pattern = selectEl(PATTERNS.map((p) => [p, p || t('import.noSubfolder')]), settings.pattern);
  const rename = h('input.input', { type: 'text', value: settings.rename, placeholder: t('import.renamePlaceholder') });
  const skipDuplicates = h('input', { type: 'checkbox', checked: settings.skipDuplicates });
  const deleteAfter = h('input', { type: 'checkbox', checked: settings.deleteAfter });
  const keywords = h('input.input', { type: 'text', placeholder: t('import.keywordsPlaceholder') });
  const rating = selectEl([['0', '—'], ...[1, 2, 3, 4, 5].map((n) => [String(n), '★'.repeat(n)])], '0');

  async function setSource(path) {
    source = path;
    sourceLabel.textContent = path.replace(/^@\d+:/, '');
    grid.replaceChildren(h('div.hint', t('list.loading')));
    files = (await fs.walk(path, MEDIA_EXTENSIONS, 20000)).sort((a, b) => a.modified - b.modified);
    chosen.clear();
    for (const file of files) chosen.add(file.path);
    grid.replaceChildren(...files.slice(0, 600).map((file) => {
      const box = h('input', { type: 'checkbox', checked: true, onchange: (e) => { if (e.target.checked) chosen.add(file.path); else chosen.delete(file.path); updateSummary(); } });
      const img = h('img', { alt: '' });
      thumbs.get(file, 3).then((r) => { if (r?.url) img.src = r.url; });
      return h('label.import-cell', box, img, h('span', file.name));
    }));
    updateSummary();
  }

  function updateSummary() {
    const size = files.filter((f) => chosen.has(f.path)).reduce((s, f) => s + f.size, 0);
    summary.textContent = files.length ? t('import.summary', { n: chosen.size, total: files.length, size: formatBytes(size) }) : '';
  }

  const pickSource = async () => {
    if (isDesktop()) { const dir = await chooseFolder(); if (dir) setSource(dir); return; }
    if (hasFolderAccess()) { const dir = await webFs.openFolder(); if (dir) setSource(dir); }
  };
  const pickDestination = async () => {
    const dir = isDesktop() ? await chooseFolder(destination) : hasFolderAccess() ? await webFs.openFolder() : null;
    if (dir) { destination = dir; destLabel.textContent = dir.replace(/^@\d+:/, ''); }
  };
  cameraFolders().then((list) => {
    for (const card of list) cards.append(h('button.btn.small', { type: 'button', onclick: () => setSource(card.path) }, card.name));
    if (list.length && !source) setSource(list[0].path);
  });
  // Phones and cameras over USB (MTP): their new photos are copied out first, then imported as usual.
  const devices = h('div.row-buttons.mtp-devices');
  const findDevices = async () => {
    if (!isDesktop()) return;
    devices.replaceChildren(h('span.hint', t('import.lookingForDevices')));
    const list = await invoke('mtp_devices').catch(() => []);
    devices.replaceChildren(...list.map((device) => h('button.btn.small', { type: 'button', dataset: { mtpDevice: device.id }, title: t('import.fromDeviceHint'), onclick: () => fromDevice(device) }, h('span', { html: icon('phone') }), device.name)),
      list.length ? '' : h('span.hint', t('import.noDevices')),
      h('button.tool.small', { type: 'button', title: t('import.findDevices'), html: icon('refresh'), dataset: { key: 'mtp-refresh' }, onclick: findDevices }));
  };
  const fromDevice = async (device) => {
    const progress = progressDialog(t('import.copyingFromDevice', { name: device.name }), { cancellable: false });
    progress.update(0, 0, device.name);
    try {
      const staged = await invoke('mtp_stage', { id: device.id, name: device.name });
      toast(t('import.deviceCopied', { n: staged.copied, skipped: staged.skipped, name: device.name }), 'success');
      await setSource(staged.folder);
    } catch (error) {
      toast(`${device.name}: ${errorText(error)}`, 'error', 8000);
    } finally {
      progress.close();
    }
  };
  findDevices();

  const ok = await openDialog({
    title: t('import.title'), width: 820, id: 'import-dialog',
    body: h('div.import',
      h('div.field', h('span.field-label', t('import.from')), cards, isDesktop() ? h('div.mtp-row', h('span.field-label', t('import.devices')), devices) : '', h('div.row-buttons', h('button.btn.small', { type: 'button', onclick: pickSource, id: 'import-pick-source' }, t('import.chooseSource')), sourceLabel)),
      grid, summary,
      h('div.row-buttons', h('button.btn.small', { type: 'button', onclick: () => { for (const f of files) chosen.add(f.path); grid.querySelectorAll('input').forEach((i) => { i.checked = true; }); updateSummary(); } }, t('edit.selectAll')),
        h('button.btn.small', { type: 'button', onclick: () => { chosen.clear(); grid.querySelectorAll('input').forEach((i) => { i.checked = false; }); updateSummary(); } }, t('edit.selectNone'))),
      h('div.field', h('span.field-label', t('import.to')), h('div.row-buttons', h('button.btn.small', { type: 'button', onclick: pickDestination }, t('import.chooseDestination')), destLabel)),
      h('div.field-row', field(t('import.subfolders'), pattern), field(t('import.rename'), rename)),
      h('div.field-row', field(t('import.keywords'), keywords), field(t('organize.ratingLabel'), rating)),
      h('label.check', skipDuplicates, t('import.skipDuplicates')),
      h('label.check', deleteAfter, t('import.deleteAfter'))),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('import.run'), value: true, primary: true }],
    onSubmit: (value) => {
      if (!value) return true;
      if (!source || !chosen.size) { toast(t('import.nothing'), 'error'); return false; }
      if (!destination) { toast(t('import.noDestination'), 'error'); return false; }
      return true;
    },
  });
  if (!ok) return;
  Object.assign(settings, { pattern: pattern.value, rename: rename.value.trim(), skipDuplicates: skipDuplicates.checked, deleteAfter: deleteAfter.checked, destination });
  app.saveSettings();
  await runImport(files.filter((f) => chosen.has(f.path)), destination, {
    pattern: pattern.value, rename: rename.value.trim(), skipDuplicates: skipDuplicates.checked, deleteAfter: deleteAfter.checked,
    keywords: keywords.value.split(',').map((k) => k.trim()).filter(Boolean), rating: Number(rating.value),
  });
}

/** A file of the target folder with the same size and the same bytes (whatever its name). */
async function isDuplicate(file, dir, existing) {
  const candidates = [...existing.values()].filter((f) => f.size === file.size);
  if (!candidates.length) return false;
  const bytes = await fs.read(file.path);
  for (const candidate of candidates) {
    const other = await fs.read(joinPath(dir, candidate.name)).catch(() => null);
    if (other && other.length === bytes.length && other.every((b, k) => b === bytes[k])) return true;
  }
  return false;
}

/** Copies `files` into `destination` with the given options. Returns the imported paths. */
export async function runImport(files, destination, { pattern = '', rename = '', skipDuplicates = true, deleteAfter = false, keywords = [], rating = 0 } = {}) {
  const progress = progressDialog(t('import.running'));
  const imported = [];
  const copiedSources = [];
  let skipped = 0;
  const failures = [];
  const listings = new Map();
  try {
    for (const [i, file] of files.entries()) {
      if (progress.cancelled) break;
      progress.update(i, files.length, file.name);
      try {
        const taken = await takenOf(file);
        const dir = await ensureDir(destination, subfolderFor(taken, pattern));
        // Numbered by position in the batch, so importing the same photos again gives the same names.
        let name = rename ? renameOne({ name: file.name, path: file.path, modified: file.modified, record: { meta: { taken } } }, i, { template: rename, extCase: 'lower' }) : file.name;
        if (!listings.has(dir)) listings.set(dir, new Map(((await fs.list(dir, { probe: false }).catch(() => ({ files: [] }))).files).map((f) => [f.name.toLowerCase(), f])));
        const existing = listings.get(dir);
        if (skipDuplicates && (await isDuplicate(file, dir, existing))) { skipped += 1; continue; }
        if (existing.has(name.toLowerCase())) {
          const dot = name.lastIndexOf('.');
          const stem = dot > 0 ? name.slice(0, dot) : name;
          const ext = dot > 0 ? name.slice(dot) : '';
          for (let n = 2; existing.has(name.toLowerCase()); n++) name = `${stem} (${n})${ext}`;
        }
        const target = joinPath(dir, name);
        await fs.write(target, await fs.read(file.path));
        existing.set(name.toLowerCase(), { name, size: file.size });
        if (!fs.isReadOnly?.(target)) await fs.setModified?.(target, file.modified).catch(() => {});
        app.catalog.copyPath(file.path, target);
        if (keywords.length) app.catalog.addKeywords([target], keywords);
        if (rating) app.catalog.setRating([target], rating);
        imported.push(target);
        copiedSources.push(file.path);
      } catch (error) {
        failures.push(`${file.name}: ${errorText(error)}`);
      }
    }
    if (deleteAfter && copiedSources.length) await fs.remove(copiedSources, false);
  } finally {
    progress.close();
  }
  saveCatalogNow();
  toast(t('import.done', { n: imported.length, skipped, failed: failures.length }), failures.length ? 'error' : 'success', 6000);
  if (imported.length) await openFolder(parentOf(imported[0]), { select: imported.filter((p) => parentOf(p) === parentOf(imported[0])) });
  return imported;
}

export { plural, baseName };
