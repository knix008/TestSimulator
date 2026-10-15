// Gather analysed pictures by what the catalog already knows about them
// (people, scene, object). The files stay where they are: classification lives
// in the catalog, so nothing is copied into new folders.
import { analysable } from '../analysis/analyzer.js';
import { categoryKey, primaryCategory } from '../analysis/taxonomy.js';
import { t } from '../i18n.js';
import { app, openSource } from '../store.js';
import { field, openDialog, selectEl, toast } from './dialog.js';
import { h } from './dom.js';

/** Category id ('' = none of this kind) → paths, for the analysed pictures among `items`. */
export function planGroups(items, kind) {
  const plan = new Map();
  for (const item of items) {
    if (!analysable(item)) continue;
    const analysis = app.catalog.get(item.path)?.analysis;
    if (!analysis) continue;
    const id = primaryCategory(analysis, kind) ?? '';
    if (!plan.has(id)) plan.set(id, []);
    plan.get(id).push(item.path);
  }
  return plan;
}

export async function organizeDialog(items) {
  let kind = 'scene';
  const preview = h('div.organize-preview');
  const show = () => {
    const plan = planGroups(items, kind);
    const rows = [...plan].sort((a, b) => b[1].length - a[1].length);
    preview.replaceChildren(plan.size
      ? h('table.prop-table.small', h('tbody', rows.map(([id, paths]) => h('tr', h('td', id ? t(categoryKey(id)) : t('analysis.other')), h('td.num', String(paths.length))))))
      : h('p.muted', t('analysis.nothingAnalysed')));
  };
  const kindSelect = selectEl([['people', t('analysis.people')], ['scene', t('analysis.scene')], ['object', t('analysis.object')]], kind, (v) => { kind = v; show(); });
  kindSelect.dataset.key = 'organize-kind';
  show();
  const ok = await openDialog({
    title: t('analysis.toFolders'), id: 'organize', width: 460,
    body: h('div.form', field(t('analysis.by'), kindSelect), h('p.field-hint', t('analysis.toFoldersHint')), preview),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('analysis.show'), value: true, primary: true }],
  });
  if (!ok) return null;
  return showClassified(items, kind);
}

/** Lists every indexed photo of `kind` from the catalog. Files are not copied. */
export async function showClassified(items, kind) {
  const result = await organize(items, { kind });
  if (!result.files) { toast(t('analysis.nothingAnalysed'), 'info'); return result; }
  app.emit('show-pane', { side: 'left', id: 'catalog' });
  const titleKey = kind === 'people' ? 'analysis.people' : kind === 'object' ? 'analysis.object' : 'analysis.scene';
  await openSource({ type: 'filter', filters: [{ type: 'analysis', value: kind }], title: t(titleKey) });
  return result;
}

/** Counts the catalog groups for `kind`. Does not create folders or copy files. */
export async function organize(items, { kind }) {
  const plan = planGroups(items, kind);
  let files = 0;
  for (const paths of plan.values()) files += paths.length;
  return { groups: plan.size, files, folders: 0 };
}
