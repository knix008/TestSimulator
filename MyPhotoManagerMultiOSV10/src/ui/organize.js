// "Sort into folders by category": the analysed pictures of a list are copied
// (or moved) into one sub-folder per category of the chosen kind — people
// (portrait, group, …), scene (beach, city, …) or object (animal, vehicle, …).
// Pictures without a category of that kind go to "Other". Moving is undoable
// like any move (store.transfer).
import { analysable } from '../analysis/analyzer.js';
import { categoryKey, primaryCategory } from '../analysis/taxonomy.js';
import { joinPath } from '../catalog/catalog.js';
import { t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { app, transfer } from '../store.js';
import { field, openDialog, selectEl, toast } from './dialog.js';
import { h } from './dom.js';

/** Folder name → paths, for the analysed pictures among `items`. */
export function planFolders(items, kind) {
  const plan = new Map();
  for (const item of items) {
    if (!analysable(item)) continue;
    const analysis = app.catalog.get(item.path)?.analysis;
    if (!analysis) continue;
    const id = primaryCategory(analysis, kind);
    const name = (id ? t(categoryKey(id)) : t('analysis.other')).replace(/[\\/:*?"<>|]/g, '_');
    if (!plan.has(name)) plan.set(name, []);
    plan.get(name).push(item.path);
  }
  return plan;
}

export async function organizeDialog(items) {
  const folder = app.state.source?.type === 'folder' ? app.state.source.path : null;
  if (!folder) { toast(t('analysis.needFolder'), 'info'); return; }
  let kind = 'scene';
  let move = false;
  const preview = h('div.organize-preview');
  const show = () => {
    const plan = planFolders(items, kind);
    preview.replaceChildren(plan.size
      ? h('table.prop-table.small', h('tbody', [...plan].sort((a, b) => b[1].length - a[1].length).map(([name, paths]) => h('tr', h('td', `📁 ${name}`), h('td.num', String(paths.length))))))
      : h('p.muted', t('analysis.nothingAnalysed')));
  };
  const kindSelect = selectEl([['people', t('analysis.people')], ['scene', t('analysis.scene')], ['object', t('analysis.object')]], kind, (v) => { kind = v; show(); });
  kindSelect.dataset.key = 'organize-kind';
  const modeSelect = selectEl([['copy', t('analysis.copy')], ['move', t('analysis.move')]], 'copy', (v) => { move = v === 'move'; });
  modeSelect.dataset.key = 'organize-mode';
  show();
  const ok = await openDialog({
    title: t('analysis.toFolders'), id: 'organize', width: 460,
    body: h('div.form', field(t('analysis.by'), kindSelect), field(t('analysis.how'), modeSelect), h('p.field-hint', t('analysis.toFoldersHint', { folder: joinPath(folder, t('analysis.sortedFolder')) })), preview),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('analysis.sort'), value: true, primary: true }],
  });
  if (!ok) return null;
  return organize(items, { kind, move, folder });
}

/** Copies / moves into <folder>/<Sorted>/<category>/. Returns { folders, files }. */
export async function organize(items, { kind, move = false, folder }) {
  const plan = planFolders(items, kind);
  if (!plan.size) return { folders: 0, files: 0 };
  const rootName = t('analysis.sortedFolder');
  const root = joinPath(folder, rootName);
  await fs.mkdir(folder, rootName).catch(() => {}); // already there is fine
  let files = 0;
  for (const [name, paths] of plan) {
    await fs.mkdir(root, name).catch(() => {});
    const results = await transfer(paths, joinPath(root, name), { move });
    files += results.filter((r) => r.target && !r.error && !r.skipped).length;
  }
  app.emit('folders-changed', folder);
  return { folders: plan.size, files, root };
}
