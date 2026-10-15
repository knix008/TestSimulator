// Collections and smart collections: named lists of
// photos from any folder, and saved rule sets whose photos are found anew
// each time (rating ≥ 4 and keyword "family", taken after 2023-01-01 …).
import { LABELS } from '../catalog/catalog.js';
import { RULE_FIELDS, smartMatches } from '../catalog/query.js';
import { t } from '../i18n.js';
import { app, itemFromRecord, openSource } from '../store.js';
import { confirmDialog, field, openDialog, promptDialog, selectEl, toast } from './dialog.js';
import { h } from './dom.js';
import { icon } from './icons.js';

/** How many photos a collection holds now. */
export function collectionCount(collection) {
  if (!collection.smart) return collection.paths.length;
  let n = 0;
  for (const [path, record] of app.catalog.files) if (record.indexed && smartMatches(collection.rules, collection.match, itemFromRecord(path, record), record)) n += 1;
  return n;
}

export function showCollection(collection) {
  openSource({ type: 'collection', id: collection.id, title: collection.name });
}

/** New manual collection; `paths` (optional) go in at once. Returns its id. */
export async function newCollection(paths = []) {
  const name = await promptDialog(t('collection.name'), '', { title: t('collection.new'), validate: (v) => (!v.trim() ? t('file.nameEmpty') : null) });
  if (!name?.trim()) return null;
  const id = app.catalog.addCollection(name.trim());
  if (paths.length) addTo(id, paths);
  return id;
}

export function addTo(id, paths) {
  const added = app.catalog.addToCollection(id, paths);
  const c = app.catalog.collection(id);
  toast(t('collection.added', { n: added, name: c?.name ?? '' }), 'success');
}

export async function renameCollection(collection) {
  const name = await promptDialog(t('collection.name'), collection.name, { title: t('collection.rename'), validate: (v) => (!v.trim() ? t('file.nameEmpty') : null) });
  if (name?.trim()) app.catalog.renameCollection(collection.id, name.trim());
}

export async function deleteCollection(collection) {
  if (!(await confirmDialog(t('collection.deleteAsk', { name: collection.name }), { danger: true, ok: t('common.delete'), detail: collection.smart ? '' : t('collection.deleteDetail') }))) return;
  app.catalog.deleteCollection(collection.id);
  if (app.state.source.type === 'collection' && app.state.source.id === collection.id) openSource({ type: 'filter', filters: [{ type: 'all' }], title: t('catalog.allMedia') });
}

/** File menu entries: add to each manual collection, or to a new one. */
export function addToCollectionMenu(paths) {
  const manual = app.catalog.collections.filter((c) => !c.smart);
  return [
    ...manual.map((c) => ({ label: c.name, icon: 'folderOpen', action: () => addTo(c.id, paths) })),
    manual.length ? 'separator' : null,
    { label: t('collection.newWith'), icon: 'plus', action: () => newCollection(paths) },
  ].filter(Boolean);
}

// ───────────────────────── smart collection editor

const VALUE_CHOICES = {
  label: () => [['none', t('organize.noLabel')], ...LABELS.map((l) => [l, t(`label.${l}`)])],
  kind: () => [['image', t('kind.image')], ['raw', 'RAW'], ['video', t('kind.video')]],
  tagged: () => [['yes', t('collection.yes')], ['no', t('collection.no')]],
  gps: () => [['yes', t('collection.yes')], ['no', t('collection.no')]],
  rating: () => [0, 1, 2, 3, 4, 5].map((n) => [String(n), n ? '★'.repeat(n) : t('catalog.unrated')]),
};
const DEFAULT_VALUE = { rating: '4', label: 'red', kind: 'image', tagged: 'yes', gps: 'yes', taken: `${new Date().getFullYear()}-01-01`, width: '3000' };

/** Creates (no `collection`) or edits a smart collection. Returns the id, or null. */
export async function smartCollectionDialog(collection = null) {
  const rules = (collection?.rules ?? [{ field: 'rating', op: '>=', value: '4' }]).map((r) => ({ ...r }));
  let match = collection?.match ?? 'all';
  const name = h('input.input', { type: 'text', value: collection?.name ?? '', placeholder: t('collection.smartPlaceholder'), dataset: { key: 'collection-name' } });
  const list = h('div.rule-list');
  const count = h('div.rule-count');
  const preview = () => {
    let n = 0;
    for (const [path, record] of app.catalog.files) if (record.indexed && smartMatches(rules, match, itemFromRecord(path, record), record)) n += 1;
    count.textContent = t('collection.matching', { n });
  };
  const draw = () => {
    list.replaceChildren(...rules.map((rule, i) => {
      const fieldSelect = selectEl(Object.keys(RULE_FIELDS).map((f) => [f, t(`rule.${f}`)]), rule.field, (v) => { rule.field = v; rule.op = RULE_FIELDS[v][0]; rule.value = DEFAULT_VALUE[v] ?? ''; draw(); });
      fieldSelect.dataset.rule = `${i}-field`;
      const opSelect = selectEl(RULE_FIELDS[rule.field].map((op) => [op, t(`rule.op.${op}`)]), rule.op, (v) => { rule.op = v; preview(); });
      opSelect.dataset.rule = `${i}-op`;
      let value;
      if (VALUE_CHOICES[rule.field]) {
        value = selectEl(VALUE_CHOICES[rule.field](), String(rule.value), (v) => { rule.value = v; preview(); });
      } else {
        value = h('input.input', { type: rule.field === 'taken' ? 'date' : rule.field === 'width' ? 'number' : 'text', value: rule.value ?? '', placeholder: t(`rule.hint.${rule.field}`) === `rule.hint.${rule.field}` ? '' : t(`rule.hint.${rule.field}`) });
        value.addEventListener('input', () => { rule.value = value.value; preview(); });
      }
      value.dataset.rule = `${i}-value`;
      if (!VALUE_CHOICES[rule.field] && rule.value == null) rule.value = '';
      return h('div.rule-row', fieldSelect, opSelect, value,
        h('button.tool.small', { type: 'button', title: t('common.remove'), html: icon('close'), disabled: rules.length === 1, onclick: () => { rules.splice(i, 1); draw(); } }));
    }));
    preview();
  };
  draw();
  const matchSelect = selectEl([['all', t('collection.matchAll')], ['any', t('collection.matchAny')]], match, (v) => { match = v; preview(); });
  matchSelect.dataset.key = 'collection-match';
  const add = h('button.btn.small', { type: 'button', id: 'add-rule', onclick: () => { rules.push({ field: 'keyword', op: 'has', value: '' }); draw(); } }, h('span', { html: icon('plus') }), t('collection.addRule'));
  const ok = await openDialog({
    title: collection ? t('collection.editSmart') : t('collection.newSmart'), width: 620, id: 'smart-collection-dialog',
    body: h('div.smart-collection', field(t('collection.name'), name), field(t('collection.match'), matchSelect), list, h('div.row-buttons', add, count)),
    buttons: [{ label: t('common.cancel'), value: false }, { label: t('common.save'), value: true, primary: true }],
    onSubmit: (value) => (value && !name.value.trim() ? (toast(t('file.nameEmpty'), 'error'), false) : true),
  });
  if (!ok) return null;
  const clean = rules.filter((r) => String(r.value ?? '').trim() !== '' || ['tagged', 'gps'].includes(r.field));
  if (collection) {
    app.catalog.renameCollection(collection.id, name.value.trim());
    app.catalog.setCollectionRules(collection.id, clean, match);
    return collection.id;
  }
  const id = app.catalog.addCollection(name.value.trim(), { smart: true, rules: clean, match });
  showCollection(app.catalog.collection(id));
  return id;
}
