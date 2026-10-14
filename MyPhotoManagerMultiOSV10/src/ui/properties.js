// Properties pane: organize the selected photos (rating, color label, tag,
// title, caption, author, notes, keywords, categories), and see the file and
// its metadata (EXIF, GPS, IPTC, XMP).
import { LABEL_COLORS, LABELS } from '../catalog/catalog.js';
import { formatExposure, readMetadata } from '../formats/exif.js';
import { badgeOf, kindOf } from '../formats/types.js';
import { plural, t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { app, selectedFiles, focusedItem } from '../store.js';
import { formatBytes, formatDateTime, formatDims, formatDuration } from '../util/format.js';
import { clear, debounce, h } from './dom.js';
import { icon } from './icons.js';

export function createPropertiesPane({ onShowOnMap }) {
  const el = h('div.pane-body.properties');
  const open = { organize: true, file: true, exif: true, all: false, iptc: false };
  let metaCache = { path: null, groups: null };

  function targets() {
    const files = selectedFiles();
    if (files.length) return files;
    const focus = focusedItem();
    return focus && !focus.isDir ? [focus] : [];
  }

  function section(id, title, body) {
    const head = h('div.prop-section-head', h('span', { html: icon(open[id] ? 'chevronDown' : 'chevronRight') }), title);
    head.addEventListener('click', () => { open[id] = !open[id]; render(); });
    return h('div.prop-section', head, open[id] ? body() : null);
  }

  function common(items, read) {
    const values = items.map((item) => read(app.catalog.get(item.path) ?? {}));
    return values.every((v) => JSON.stringify(v) === JSON.stringify(values[0])) ? values[0] : undefined;
  }

  function organize(items) {
    const paths = items.map((i) => i.path);
    const rating = common(items, (r) => r.rating ?? 0);
    const label = common(items, (r) => r.label ?? null);
    const tagged = common(items, (r) => Boolean(r.tagged));
    const stars = h('div.prop-stars', [1, 2, 3, 4, 5].map((n) => h(`button.star${rating >= n ? '.on' : ''}`, {
      type: 'button', title: t('organize.rating', { n }), html: icon(rating >= n ? 'starFill' : 'star'),
      onclick: () => app.catalog.setRating(paths, rating === n ? 0 : n),
    })), h('button.tool.small', { type: 'button', title: t('organize.clearRating'), html: icon('close'), onclick: () => app.catalog.setRating(paths, 0) }));
    const labels = h('div.prop-labels', LABELS.map((l) => h(`button.label-chip${label === l ? '.on' : ''}`, {
      type: 'button', title: t(`label.${l}`), style: { '--chip': LABEL_COLORS[l] }, onclick: () => app.catalog.setLabel(paths, label === l ? null : l),
    })), h('button.tool.small', { type: 'button', title: t('organize.clearLabel'), html: icon('close'), onclick: () => app.catalog.setLabel(paths, null) }));
    const tag = h('label.check', h('input', { type: 'checkbox', checked: tagged === true, indeterminate: tagged === undefined, onchange: (e) => app.catalog.setTagged(paths, e.target.checked) }), t('organize.tagged'));

    const textField = (key, multiline = false) => {
      const value = common(items, (r) => r[key] ?? '');
      const input = h(multiline ? 'textarea.input' : 'input.input', { rows: multiline ? 3 : undefined, placeholder: value === undefined ? t('organize.multiple') : '', dataset: { field: key } });
      input.value = value ?? '';
      input.addEventListener('change', () => app.catalog.setFields(paths, { [key]: input.value }));
      return h('label.field', h('span.field-label', t(`organize.${key}`)), input);
    };

    // Keywords as chips + input.
    const allKeywords = new Map();
    for (const item of items) for (const k of app.catalog.get(item.path)?.keywords ?? []) allKeywords.set(k, (allKeywords.get(k) ?? 0) + 1);
    const chips = h('div.chips', [...allKeywords].map(([k, n]) => h(`span.chip${n < items.length ? '.partial' : ''}`, k,
      h('button', { type: 'button', title: t('common.remove'), html: icon('close'), onclick: () => app.catalog.removeKeywords(paths, [k]) }))));
    const keywordInput = h('input.input', { type: 'text', placeholder: t('organize.addKeyword'), list: 'keyword-list', dataset: { field: 'keywords' } });
    const datalist = h('datalist#keyword-list', app.catalog.keywordList.map((k) => h('option', { value: k })));
    keywordInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ',') return;
      event.preventDefault();
      const words = keywordInput.value.split(/[,;]/).map((w) => w.trim()).filter(Boolean);
      if (words.length) app.catalog.addKeywords(paths, words);
      keywordInput.value = '';
    });

    const categories = h('div.prop-categories', app.catalog.categories.map((path) => {
      const state = common(items, (r) => Boolean(r.categories?.includes(path)));
      const box = h('input', { type: 'checkbox', checked: state === true, indeterminate: state === undefined, onchange: (e) => app.catalog.assignCategory(paths, path, e.target.checked) });
      return h('label.check', { style: { paddingLeft: `${(path.split('/').length - 1) * 14}px` } }, box, path.split('/').pop());
    }));

    return h('div.prop-organize',
      h('div.prop-row', h('span.prop-key', t('organize.ratingLabel')), stars),
      h('div.prop-row', h('span.prop-key', t('organize.labelLabel')), labels),
      tag,
      textField('title'), textField('caption', true), textField('author'), textField('notes', true),
      h('details.prop-iptc', { open: open.iptc, ontoggle: (e) => { open.iptc = e.currentTarget.open; } }, h('summary', t('prop.iptc')),
        ...['headline', 'copyright', 'credit', 'source', 'event', 'sublocation', 'city', 'state', 'country', 'countryCode', 'usageTerms', 'instructions'].map((key) => textField(key, key === 'instructions' || key === 'usageTerms'))),
      h('div.field', h('span.field-label', t('organize.keywords')), chips, keywordInput, datalist),
      h('div.field', h('span.field-label', t('organize.categories')), categories));
  }

  function fileInfo(item) {
    const record = app.catalog.get(item.path) ?? {};
    const rows = [
      [t('prop.name'), item.name],
      [t('prop.folder'), item.path.slice(0, item.path.length - item.name.length - 1)],
      [t('prop.type'), badgeOf(item.name)],
      [t('prop.size'), formatBytes(item.size)],
      [t('prop.modified'), formatDateTime(item.modified)],
      [t('prop.created'), item.created && item.created !== item.modified ? formatDateTime(item.created) : ''],
      [t('prop.dimensions'), formatDims(record.width, record.height)],
      [t('prop.duration'), formatDuration(record.meta?.duration)],
    ];
    return h('table.prop-table', rows.filter(([, v]) => v).map(([k, v]) => h('tr', h('th', k), h('td', { title: v }, v))));
  }

  function exifSummary(item) {
    const m = app.catalog.get(item.path)?.meta ?? {};
    const rows = [
      [t('exif.taken'), formatDateTime(m.taken)],
      [t('exif.camera'), m.camera],
      [t('exif.lens'), m.lens],
      [t('exif.exposure'), [m.exposure ? formatExposure(m.exposure) : '', m.fNumber ? `f/${m.fNumber}` : '', m.iso ? `ISO ${m.iso}` : '', m.bias ? `${m.bias > 0 ? '+' : ''}${m.bias} EV` : ''].filter(Boolean).join('   ')],
      [t('exif.focal'), m.focal ? `${m.focal} mm${m.focal35 ? ` (35mm: ${m.focal35} mm)` : ''}` : ''],
      [t('exif.flash'), m.flash == null ? '' : m.flash ? t('exif.flashOn') : t('exif.flashOff')],
      [t('exif.gps'), m.lat != null ? `${m.lat.toFixed(5)}, ${m.lon.toFixed(5)}${m.alt != null ? ` · ${m.alt} m` : ''}` : ''],
      [t('exif.location'), [m.city, m.country].filter(Boolean).join(', ')],
      [t('exif.software'), m.software],
      [t('exif.artist'), m.artist],
      [t('exif.copyright'), m.copyright],
      [t('exif.description'), m.caption],
    ].filter(([, v]) => v);
    const table = h('table.prop-table', rows.map(([k, v]) => h('tr', h('th', k), h('td', { title: v }, v))));
    if (!rows.length) return h('div.prop-empty', t('exif.none'));
    const out = h('div', table);
    if (m.lat != null) out.append(h('button.btn.small', { type: 'button', onclick: () => onShowOnMap?.() }, h('span', { html: icon('mapPin') }), t('exif.showOnMap')));
    return out;
  }

  function allMetadata(item) {
    const box = h('div.prop-all', t('list.loading'));
    if (metaCache.path === item.path && metaCache.groups) fill(box, metaCache.groups);
    else {
      fs.read(item.path).then((bytes) => readMetadata(bytes, { groups: true })).then(({ groups }) => {
        metaCache = { path: item.path, groups };
        if (box.isConnected) fill(box, groups);
      }).catch(() => { box.textContent = t('exif.none'); });
    }
    return box;
  }

  function fill(box, groups) {
    clear(box);
    if (!groups?.length) { box.textContent = t('exif.none'); return; }
    for (const group of groups) {
      box.append(h('div.prop-group', t(`metaGroup.${group.id}`) === `metaGroup.${group.id}` ? group.id.toUpperCase() : t(`metaGroup.${group.id}`)),
        h('table.prop-table.small', group.tags.map(([k, v]) => h('tr', h('th', k), h('td', { title: v }, v)))));
    }
  }

  function render() {
    const items = targets();
    const active = document.activeElement;
    const editingField = el.contains(active) && active?.dataset?.field;
    if (editingField) return; // do not rebuild under the user's typing
    clear(el);
    if (!items.length) {
      const source = app.state.source;
      el.append(h('div.prop-empty', source.type === 'folder' ? t('prop.nothingSelected') : t('prop.nothingSelected')));
      const list = app.state.list.filter((i) => !i.isDir);
      if (list.length) el.append(h('div.prop-summary', plural('status.files', list.length), ' · ', formatBytes(list.reduce((s, i) => s + (i.size ?? 0), 0))));
      return;
    }
    if (items.length > 1) el.append(h('div.prop-summary', plural('status.selectedFiles', items.length), ' · ', formatBytes(items.reduce((s, i) => s + (i.size ?? 0), 0))));
    el.append(section('organize', t('prop.organize'), () => organize(items)));
    if (items.length === 1) {
      const item = items[0];
      el.append(section('file', t('prop.file'), () => fileInfo(item)));
      if (kindOf(item.name) !== 'video') {
        el.append(section('exif', t('prop.exif'), () => exifSummary(item)));
        el.append(section('all', t('prop.allMetadata'), () => allMetadata(item)));
      }
    }
  }

  const later = debounce(() => { if (el.isConnected) render(); }, 80);
  app.on('selection', later);
  app.on('catalog', later);
  app.on('info', (path) => { if (app.state.selection.has(path) || app.state.focus === path) later(); });
  return { el, render };
}
