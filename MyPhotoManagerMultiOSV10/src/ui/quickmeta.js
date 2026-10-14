// Quick keywords and metadata templates (ACDSee "Quick Keywords" and
// "Metadata Presets"): a few named keyword sets whose keywords are one click
// (or Alt+Shift+1…9) away, and saved IPTC field sets applied in one step.
import { t } from '../i18n.js';
import { app } from '../store.js';
import { confirmDialog, field, openDialog, promptDialog, selectEl, toast } from './dialog.js';
import { h } from './dom.js';
import { icon } from './icons.js';

/** The IPTC/text fields a template can hold. */
export const TEMPLATE_FIELDS = ['author', 'headline', 'copyright', 'credit', 'source', 'event', 'sublocation', 'city', 'state', 'country', 'countryCode', 'usageTerms', 'instructions'];

/** Keyword sets in settings, cleaned up (always at least one set). */
export function keywordSets() {
  const sets = (app.settings.keywordSets ?? []).filter((s) => s && typeof s === 'object' && Array.isArray(s.keywords));
  if (!sets.length) sets.push({ name: '', keywords: [] });
  app.settings.keywordSets = sets;
  if (!(app.settings.keywordSet >= 0 && app.settings.keywordSet < sets.length)) app.settings.keywordSet = 0;
  return sets;
}

export const setName = (set, i) => set.name || t('quick.setN', { n: i + 1 });
export const activeKeywords = () => keywordSets()[app.settings.keywordSet].keywords;

/** Adds the keyword to every file, or removes it when every file already has it. */
export function toggleKeyword(paths, keyword) {
  if (!paths.length || !keyword) return;
  const all = paths.every((p) => app.catalog.get(p)?.keywords?.includes(keyword));
  if (all) app.catalog.removeKeywords(paths, [keyword]);
  else app.catalog.addKeywords(paths, [keyword]);
}

/** Alt+Shift+n: the n-th quick keyword of the active set. */
export function quickKeyword(n, paths) {
  const keyword = activeKeywords()[n - 1];
  if (!keyword) { toast(t('quick.none', { n }), 'info'); return; }
  toggleKeyword(paths, keyword);
}

/** The quick keyword field of the Organize panel: set chooser, edit button and a button per keyword. */
export function quickKeywordsField(paths, onChange) {
  const sets = keywordSets();
  const chooser = selectEl(sets.map((s, i) => [String(i), setName(s, i)]), String(app.settings.keywordSet), (v) => {
    app.settings.keywordSet = Number(v);
    app.saveSettings();
    onChange?.();
  });
  chooser.dataset.key = 'keyword-set';
  const words = activeKeywords();
  const has = (k) => (paths.length && paths.every((p) => app.catalog.get(p)?.keywords?.includes(k)) ? 'on' : paths.some((p) => app.catalog.get(p)?.keywords?.includes(k)) ? 'partial' : '');
  const buttons = h('div.quick-keywords', words.length
    ? words.map((k, i) => h(`button.quick-keyword${has(k) ? `.${has(k)}` : ''}`, { type: 'button', dataset: { keyword: k }, title: i < 9 ? `${k} (Alt+Shift+${i + 1})` : k, disabled: !paths.length, onclick: () => toggleKeyword(paths, k) }, i < 9 ? h('span.quick-n', String(i + 1)) : '', k))
    : h('span.hint', t('quick.empty')));
  return h('div.field.quick-field',
    h('div.quick-head', h('span.field-label', t('quick.title')), chooser,
      h('button.tool.small', { type: 'button', id: 'edit-keyword-sets', title: t('quick.edit'), html: icon('pencil'), onclick: async () => { if (await keywordSetsDialog()) onChange?.(); } })),
    buttons);
}

/** Edits the keyword sets: a name and the keywords (comma separated) for each. */
export async function keywordSetsDialog() {
  const sets = keywordSets().map((s) => ({ name: s.name, keywords: [...s.keywords] }));
  const list = h('div.keyword-sets');
  const draw = () => {
    list.replaceChildren(...sets.map((set, i) => {
      const name = h('input.input', { type: 'text', value: set.name, placeholder: t('quick.setN', { n: i + 1 }), dataset: { set: String(i), part: 'name' } });
      name.addEventListener('input', () => { set.name = name.value.trim(); });
      const words = h('input.input', { type: 'text', value: set.keywords.join(', '), placeholder: t('quick.keywordsHint'), dataset: { set: String(i), part: 'keywords' } });
      words.addEventListener('input', () => { set.keywords = [...new Set(words.value.split(/[,;]/).map((w) => w.trim()).filter(Boolean))]; });
      return h('div.keyword-set-row', name, words,
        h('button.tool.small', { type: 'button', title: t('common.remove'), html: icon('trash'), disabled: sets.length === 1, onclick: () => { sets.splice(i, 1); draw(); } }));
    }));
  };
  draw();
  const add = h('button.btn.small', { type: 'button', id: 'add-keyword-set', onclick: () => { sets.push({ name: '', keywords: [] }); draw(); list.lastElementChild?.querySelector('input')?.focus(); } }, h('span', { html: icon('plus') }), t('quick.addSet'));
  const ok = await openDialog({ title: t('quick.editTitle'), width: 560, id: 'keyword-sets-dialog', body: h('div', h('p.hint', t('quick.editHint')), list, h('div.row-buttons', add)), buttons: [{ label: t('common.cancel'), value: false }, { label: t('common.save'), value: true, primary: true }] });
  if (!ok) return false;
  app.settings.keywordSets = sets.length ? sets : [{ name: '', keywords: [] }];
  app.settings.keywordSet = Math.min(app.settings.keywordSet, app.settings.keywordSets.length - 1);
  app.saveSettings();
  return true;
}

// ───────────────────────── metadata templates

export const metadataTemplates = () => (app.settings.metadataTemplates ?? []).filter((x) => x && typeof x.name === 'string' && x.fields && typeof x.fields === 'object');

/** Writes the template's fields (and keywords) to the files. Empty fields are left as they are. */
export function applyTemplate(paths, template) {
  if (!paths.length || !template) return;
  const fields = Object.fromEntries(Object.entries(template.fields).filter(([k, v]) => TEMPLATE_FIELDS.includes(k) && String(v ?? '').trim()));
  if (Object.keys(fields).length) app.catalog.setFields(paths, fields);
  if (template.keywords?.length) app.catalog.addKeywords(paths, template.keywords);
  toast(t('template.applied', { name: template.name, n: paths.length }), 'success');
}

/** Saves the selection's common field values as a new (or replaced) template. */
export async function saveTemplate(paths) {
  const records = paths.map((p) => app.catalog.get(p) ?? {});
  const common = (key) => { const values = new Set(records.map((r) => r[key] ?? '')); return values.size === 1 ? [...values][0] : ''; };
  const fields = Object.fromEntries(TEMPLATE_FIELDS.map((k) => [k, common(k)]).filter(([, v]) => v));
  const keywords = records.length ? (records[0].keywords ?? []).filter((k) => records.every((r) => r.keywords?.includes(k))) : [];
  if (!Object.keys(fields).length && !keywords.length) { toast(t('template.nothing'), 'info'); return null; }
  const name = await promptDialog(t('template.name'), '', { title: t('template.save') });
  if (!name?.trim()) return null;
  const list = metadataTemplates().filter((x) => x.name !== name.trim());
  const template = { name: name.trim(), fields, keywords };
  app.settings.metadataTemplates = [...list, template].sort((a, b) => a.name.localeCompare(b.name));
  app.saveSettings();
  toast(t('template.saved', { name: template.name }), 'success');
  return template;
}

export async function deleteTemplate(name) {
  if (!(await confirmDialog(t('template.deleteAsk', { name }), { danger: true, ok: t('common.delete') }))) return false;
  app.settings.metadataTemplates = metadataTemplates().filter((x) => x.name !== name);
  app.saveSettings();
  return true;
}

/** The template row at the top of the IPTC section: choose (applies at once), save, delete. */
export function templateRow(paths, onChange) {
  const templates = metadataTemplates();
  const chooser = selectEl([['', templates.length ? t('template.choose') : t('template.none')], ...templates.map((x) => [x.name, x.name])], '', (v) => {
    const template = templates.find((x) => x.name === v);
    if (template) applyTemplate(paths, template);
    chooser.value = '';
  });
  chooser.dataset.key = 'metadata-template';
  chooser.disabled = !templates.length || !paths.length;
  const remove = h('button.tool.small', { type: 'button', title: t('template.delete'), html: icon('trash'), disabled: !templates.length, onclick: async () => {
    const name = templates.length === 1 ? templates[0].name : await pickTemplate(templates);
    if (name && (await deleteTemplate(name))) onChange?.();
  } });
  const save = h('button.tool.small', { type: 'button', id: 'save-metadata-template', title: t('template.save'), html: icon('save'), disabled: !paths.length, onclick: async () => { if (await saveTemplate(paths)) onChange?.(); } });
  return field(t('template.title'), h('div.template-row', chooser, save, remove));
}

async function pickTemplate(templates) {
  const select = selectEl(templates.map((x) => [x.name, x.name]), templates[0].name);
  const ok = await openDialog({ title: t('template.delete'), body: field(t('template.title'), select), buttons: [{ label: t('common.cancel'), value: false }, { label: t('common.delete'), value: true, primary: true, danger: true }] });
  return ok ? select.value : null;
}
