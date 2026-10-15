// Search pane: a form that builds a quick-search query (the same syntax the
// search box understands) over everything in the catalog.
import { LABELS } from '../catalog/catalog.js';
import { t } from '../i18n.js';
import { app, openSource } from '../store.js';
import { field, promptDialog, selectEl } from './dialog.js';
import { h } from './dom.js';
import { icon } from './icons.js';

export function createSearchPane() {
  const el = h('div.pane-body.search-pane');
  const text = h('input.input', { type: 'search', placeholder: t('search.textPlaceholder') });
  const keyword = h('input.input', { type: 'text', placeholder: t('search.keywordPlaceholder') });
  const camera = h('input.input', { type: 'text', placeholder: 'Canon, iPhone…' });
  const rating = selectEl([['0', t('search.any')], ...[1, 2, 3, 4, 5].map((n) => [String(n), `≥ ${'★'.repeat(n)}`])], '0');
  const label = selectEl([['', t('search.any')], ...LABELS.map((l) => [l, t(`label.${l}`)])], '');
  const from = h('input.input', { type: 'date' });
  const to = h('input.input', { type: 'date' });
  const kind = selectEl([['', t('search.any')], ['image', t('kind.image')], ['raw', 'RAW'], ['video', t('kind.video')]], '');
  const gps = h('input', { type: 'checkbox' });
  const tagged = h('input', { type: 'checkbox' });
  const scope = h('input', { type: 'checkbox' });

  const quote = (v) => (/\s/.test(v) ? `"${v}"` : v);

  function query() {
    const parts = [];
    if (text.value.trim()) parts.push(text.value.trim());
    for (const word of keyword.value.split(',').map((w) => w.trim()).filter(Boolean)) parts.push(`kw:${quote(word)}`);
    if (camera.value.trim()) parts.push(`camera:${quote(camera.value.trim())}`);
    if (rating.value !== '0') parts.push(`rating:>=${rating.value}`);
    if (label.value) parts.push(`label:${label.value}`);
    if (from.value || to.value) parts.push(`date:${from.value || '1900-01-01'}..${to.value || '2999-12-31'}`);
    if (kind.value) parts.push(`is:${kind.value}`);
    if (gps.checked) parts.push('has:gps');
    if (tagged.checked) parts.push('tagged');
    return parts.join(' ');
  }

  function run() {
    const q = query();
    if (!q) return;
    const folder = app.state.source.type === 'folder' ? app.state.source.path : null;
    openSource({ type: 'search', text: q, title: q, scope: scope.checked && folder ? folder : undefined });
  }

  async function save() {
    const q = query();
    if (!q) return;
    const name = await promptDialog(t('search.saveName'), q, { title: t('search.save') });
    if (name) app.catalog.saveSearch(name.trim(), q);
  }

  el.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target.tagName === 'INPUT') run(); });
  el.append(
    field(t('search.text'), text),
    field(t('search.keywords'), keyword),
    field(t('search.camera'), camera),
    h('div.field-row', field(t('search.rating'), rating), field(t('search.label'), label)),
    h('div.field-row', field(t('search.from'), from), field(t('search.to'), to)),
    field(t('search.kind'), kind),
    h('label.check', gps, t('search.hasGps')),
    h('label.check', tagged, t('search.taggedOnly')),
    h('label.check', scope, t('search.inFolder')),
    h('div.search-actions',
      h('button.btn.primary', { type: 'button', onclick: run }, h('span', { html: icon('search') }), t('search.run')),
      h('button.btn', { type: 'button', onclick: save }, h('span', { html: icon('bookmark') }), t('search.save'))),
    h('details.search-help', h('summary', t('search.syntax')), h('pre', t('search.syntaxHelp'))));
  return { el, render: () => {} };
}
