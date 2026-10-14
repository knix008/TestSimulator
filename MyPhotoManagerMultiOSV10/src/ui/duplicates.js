// Find duplicates: identical files (same bytes) or similar-looking photos
// (difference hash of the thumbnail) in the current list or a folder tree.
import { bestOf, groupBy, groupSimilar } from '../catalog/dupes.js';
import { baseName } from '../catalog/catalog.js';
import { IMAGE_EXTENSIONS, isImage } from '../formats/types.js';
import { plural, t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { app, deleteItems, openSource } from '../store.js';
import { thumbs } from '../thumbs/thumbs.js';
import { formatBytes, formatDims } from '../util/format.js';
import { field, openDialog, progressDialog, selectEl, toast } from './dialog.js';
import { h } from './dom.js';

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function findDuplicates() {
  const scope = selectEl([['list', t('dupes.scopeList')], ...(app.state.source.type === 'folder' ? [['tree', t('dupes.scopeTree')]] : [])], 'list');
  const mode = selectEl([['exact', t('dupes.exact')], ['similar', t('dupes.similar')]], 'exact');
  const strictness = selectEl([['3', t('dupes.strict')], ['6', t('dupes.normal')], ['10', t('dupes.loose')]], '6');
  const ok = await openDialog({
    title: t('dupes.title'),
    body: h('div', field(t('dupes.scope'), scope), field(t('dupes.mode'), mode), field(t('dupes.strictness'), strictness)),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('dupes.run'), value: true, primary: true }],
  });
  if (!ok) return;

  let files;
  if (scope.value === 'tree') files = await fs.walk(app.state.source.path, IMAGE_EXTENSIONS, 50000, app.settings.showHidden);
  else files = app.state.list.filter((item) => !item.isDir && isImage(item.name));
  const progress = progressDialog(t('dupes.searching'));
  const entries = [];
  try {
    if (mode.value === 'exact') {
      const bySize = groupBy(files, (file) => file.size);
      const candidates = bySize.flat();
      for (const [i, file] of candidates.entries()) {
        if (progress.cancelled) break;
        progress.update(i, candidates.length, file.name);
        entries.push({ ...file, key: `${file.size}:${await sha256(await fs.read(file.path))}` });
      }
    } else {
      for (const [i, file] of files.entries()) {
        if (progress.cancelled) break;
        progress.update(i, files.length, file.name);
        const record = app.catalog.get(file.path);
        let hash = record?.hash;
        if (!hash) hash = (await thumbs.get(file, 5))?.hash;
        const r = app.catalog.get(file.path);
        entries.push({ ...file, hash, pixels: (r?.width ?? 0) * (r?.height ?? 0) });
      }
    }
  } finally {
    progress.close();
  }
  const groups = mode.value === 'exact' ? groupBy(entries, (e) => e.key) : groupSimilar(entries, Number(strictness.value));
  if (!groups.length) { toast(t('dupes.none'), 'success'); return; }
  showResults(groups);
}

function showResults(groups) {
  const marked = new Set();
  for (const group of groups) {
    const keep = bestOf(group);
    for (const item of group) if (item !== keep) marked.add(item.path);
  }
  const summary = h('div.dupes-summary');
  const updateSummary = () => { summary.textContent = t('dupes.summary', { groups: groups.length, marked: marked.size }); };
  const body = h('div.dupes',
    summary,
    groups.map((group) => h('div.dupe-group', group.map((item) => {
      const box = h('input', { type: 'checkbox', checked: marked.has(item.path) });
      box.addEventListener('change', () => { if (box.checked) marked.add(item.path); else marked.delete(item.path); updateSummary(); });
      const img = h('img', { alt: '' });
      thumbs.get(item, 5).then((r) => { if (r?.url) img.src = r.url; });
      const record = app.catalog.get(item.path);
      return h('label.dupe-item', box, img, h('div.dupe-name', { title: item.path }, baseName(item.path)), h('div.dupe-sub', [formatBytes(item.size), formatDims(record?.width, record?.height)].filter(Boolean).join(' · ')));
    }))));
  updateSummary();
  openDialog({
    title: plural('dupes.found', groups.length), width: 860, body,
    buttons: [{ label: t('dupes.show'), value: 'show' }, { label: t('common.close'), value: false }, { label: t('dupes.deleteMarked'), value: 'delete', danger: true, primary: true }],
  }).then(async (value) => {
    if (value === 'delete' && marked.size) await deleteItems([...marked]);
    if (value === 'show') openSource({ type: 'paths', paths: groups.flat().map((item) => item.path), title: t('dupes.title') });
  });
}
