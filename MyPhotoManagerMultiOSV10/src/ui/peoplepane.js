// People pane: find faces in photos, name them, browse
// photos by person. Unnamed faces get a suggestion when they look like a face
// the user already named.
import { decodeImage } from '../formats/decode.js';
import { isImage } from '../formats/types.js';
import { plural, t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { detectFaces, knownFaces, suggestPerson } from '../people/faces.js';
import { app, itemFromRecord, openSource, saveCatalogSoon } from '../store.js';
import { thumbs } from '../thumbs/thumbs.js';
import { confirmDialog, openDialog, progressDialog, promptDialog, toast } from './dialog.js';
import { clear, debounce, h } from './dom.js';
import { icon } from './icons.js';
import { contextMenu } from './menu.js';

/** Finds faces in `items` (skips photos already scanned unless `force`). */
export async function scanFaces(items, { force = false } = {}) {
  const list = items.filter((item) => !item.isDir && isImage(item.name) && (force || !app.catalog.get(item.path)?.facesScanned));
  if (!list.length) { toast(t('people.nothingToScan'), 'info'); return 0; }
  const progress = progressDialog(t('people.scanning'));
  progress.update(0, list.length, t('people.loadingModels'));
  let found = 0;
  try {
    const known = knownFaces(app.catalog);
    for (const [i, item] of list.entries()) {
      if (progress.cancelled) break;
      progress.update(i, list.length, item.name);
      try {
        const decoded = await decodeImage(await fs.read(item.path), item.name, { maxSize: 1280 });
        const faces = await detectFaces(decoded.source);
        for (const face of faces) {
          const suggestion = suggestPerson(face.descriptor, known);
          if (suggestion) face.suggested = suggestion.person;
        }
        app.catalog.setFaces(item.path, faces);
        found += faces.length;
      } catch (error) {
        console.warn('faces', item.path, error);
      }
    }
  } catch (error) {
    progress.close();
    toast(t('people.failed', { error: error?.message ?? String(error) }), 'error', 8000);
    return 0;
  }
  progress.close();
  saveCatalogSoon();
  toast(plural('people.found', found), 'success');
  return found;
}

/** Crop of a face as a small canvas (from the cached thumbnail). */
export async function faceCrop(path, box, size = 96) {
  const record = app.catalog.get(path) ?? {};
  const entry = await thumbs.get(itemFromRecord(path, record), 5);
  const canvas = h('canvas.face-crop', { width: size, height: size });
  if (!entry?.url) return canvas;
  const img = new Image();
  img.src = entry.url;
  await img.decode().catch(() => {});
  const pad = 0.25;
  const x = (box.x - box.w * pad) * img.naturalWidth;
  const y = (box.y - box.h * pad) * img.naturalHeight;
  const w = box.w * (1 + pad * 2) * img.naturalWidth;
  const hh = box.h * (1 + pad * 2) * img.naturalHeight;
  const side = Math.max(w, hh);
  canvas.getContext('2d').drawImage(img, x + (w - side) / 2, y + (hh - side) / 2, side, side, 0, 0, size, size);
  return canvas;
}

/** Dialog listing unnamed faces with a name box each (suggestions pre-filled). */
export async function nameFacesDialog(paths = null) {
  const entries = [];
  for (const [path, record] of app.catalog.files) {
    if (paths && !paths.includes(path)) continue;
    (record.faces ?? []).forEach((face, index) => { if (!face.person) entries.push({ path, index, face }); });
    if (entries.length >= 240) break;
  }
  if (!entries.length) { toast(t('people.noUnnamed'), 'info'); return; }
  const known = knownFaces(app.catalog);
  const datalist = h('datalist#people-list', app.catalog.people.map((name) => h('option', { value: name })));
  const grid = h('div.face-grid');
  const inputs = [];
  for (const entry of entries) {
    const suggestion = entry.face.suggested ?? suggestPerson(entry.face.descriptor, known)?.person ?? '';
    const input = h('input.input', { type: 'text', list: 'people-list', placeholder: suggestion || t('people.whoIsThis'), value: '', dataset: { suggested: suggestion } });
    const accept = h('button.btn.small', { type: 'button', title: t('people.accept'), hidden: !suggestion, onclick: () => { input.value = suggestion; } }, '✓ ', suggestion);
    const remove = h('button.tool.small', { type: 'button', title: t('people.notAFace'), html: icon('close'), onclick: () => { cell.classList.toggle('removed'); } });
    const cell = h('div.face-cell', h('div.face-image'), input, h('div.face-actions', accept, remove));
    faceCrop(entry.path, entry.face.box).then((canvas) => cell.querySelector('.face-image').append(canvas));
    grid.append(cell);
    inputs.push({ entry, input, cell });
  }
  const ok = await openDialog({
    title: plural('people.nameTitle', entries.length), width: 860,
    body: h('div', h('p.hint', t('people.nameHint')), datalist, grid),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('common.save'), value: true, primary: true }],
  });
  if (!ok) return;
  // Remove from the end so indexes stay valid.
  const removals = inputs.filter(({ cell }) => cell.classList.contains('removed')).sort((a, b) => b.entry.index - a.entry.index);
  for (const { entry, input } of inputs) {
    if (inputs.find((x) => x.entry === entry).cell.classList.contains('removed')) continue;
    if (input.value.trim()) app.catalog.nameFace(entry.path, entry.index, input.value.trim());
  }
  for (const { entry } of removals) app.catalog.removeFace(entry.path, entry.index);
  saveCatalogSoon();
}

export function createPeoplePane() {
  const el = h('div.pane-body.people-pane');

  function render() {
    clear(el);
    const { counts, unnamed } = app.catalog.peopleCounts();
    el.append(h('div.row-buttons',
      h('button.btn.small', { type: 'button', id: 'people-scan', onclick: () => scanFaces(app.state.list) }, h('span', { html: icon('user') }), t('people.scanList')),
      h('button.btn.small', { type: 'button', onclick: () => scanFaces(app.state.list, { force: true }) }, h('span', { html: icon('refresh') }), t('people.rescan'))));
    const unnamedRow = h('div.cat-row', { role: 'button', tabIndex: 0 }, h('span.cat-icon', { html: icon('help') }), h('span.cat-label', t('people.unnamed')), h('span.cat-count', String(unnamed)));
    unnamedRow.addEventListener('click', () => nameFacesDialog());
    el.append(unnamedRow);
    const allRow = h('div.cat-row', { role: 'button', tabIndex: 0 }, h('span.cat-icon', { html: icon('images') }), h('span.cat-label', t('people.withFaces')));
    allRow.addEventListener('click', () => openSource({ type: 'filter', filters: [{ type: 'person', value: null }], title: t('people.withFaces') }));
    el.append(allRow);
    el.append(h('div.cat-section-head', t('people.people')));
    if (!app.catalog.people.length) el.append(h('div.cat-empty', t('people.empty')));
    for (const name of app.catalog.people) {
      const row = h('div.cat-row', { role: 'button', tabIndex: 0, dataset: { person: name } }, h('span.cat-icon', { html: icon('user') }), h('span.cat-label', name), h('span.cat-count', String(counts[name] ?? 0)));
      row.addEventListener('click', () => openSource({ type: 'filter', filters: [{ type: 'person', value: name }], title: name }));
      row.addEventListener('contextmenu', (event) => contextMenu(event, [
        { label: t('people.rename'), icon: 'rename', action: async () => { const next = await promptDialog(t('people.name'), name, { title: t('people.rename') }); if (next) app.catalog.renamePerson(name, next); } },
        { label: t('people.remove'), icon: 'trash', danger: true, action: async () => { if (await confirmDialog(t('people.removeConfirm', { name }), { danger: true })) app.catalog.removePerson(name); } },
      ]));
      el.append(row);
    }
  }

  const later = debounce(() => { if (el.isConnected) render(); }, 300);
  app.on('catalog', later);
  return { el, render };
}
