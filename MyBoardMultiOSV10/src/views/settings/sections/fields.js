// Custom fields: every type the core supports, required, description, order, and for (multi)select fields the
// options with icon, colour and order.
import { tr, esc, icon, btn, ibtn, select, input, textarea, checkbox, colorInput, iconButton, card, note, sortable, stepper, renderIconRef } from '../util.js';
import { table, bindTables } from './collection.js';
import { refPick, userItems, bindRefPicks } from './refpick.js';
import { bindSteppers } from '../../../stepper.js';

export const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'multiselect', 'user', 'checkbox', 'url', 'labels'];
export const FIELD_ICON = { text: 'textTool', textarea: 'notes', number: 'percent', date: 'calendar', select: 'list', multiselect: 'selectAll', user: 'user', checkbox: 'check', url: 'hyperlink', labels: 'tag' };
export const typeOptions = () => FIELD_TYPES.map((type) => ({ value: type, label: tr(`ftype.${type}`), icon: FIELD_ICON[type] }));
const hasOptions = (f) => f.type === 'select' || f.type === 'multiselect';
const canEditField = (S, f) => S.canEdit && (f.projectId || S.isGlobalAdmin);

export const fieldsSection = {
  id: 'fields', glyph: 'field',
  render(S) {
    const fields = S.config.fields;
    const open = fields.find((f) => f.id === S.pending.field);
    return `${table(S, {
      kind: 'fields', rows: fields, order: true,
      cols: [
        { head: tr('col.type'), width: 'minmax(120px, 0.9fr)', cell: (f) => `<span class="ps-chip">${icon(FIELD_ICON[f.type] ?? 'field')}<span>${esc(tr(`ftype.${f.type}`))}</span></span>` },
        { head: tr('col.name'), width: 'minmax(130px, 1.4fr)', cell: (f) => input('name', f.name, { disabled: !canEditField(S, f), placeholder: tr('col.name') }) },
        { head: tr('fields.required'), width: '84px', cell: (f) => checkbox('required', f.required, tr('fields.required'), { disabled: !canEditField(S, f) }) },
        { head: tr('fields.scope'), width: '96px', cell: (f) => `<span class="ps-chip ${f.projectId ? '' : 'warn'}">${icon(f.projectId ? 'folder' : 'globe')}<span>${esc(tr(f.projectId ? 'fields.project' : 'fields.global'))}</span></span>` },
        { head: '', width: '34px', cell: (f) => ibtn('field-edit', tr('fields.edit'), open?.id === f.id ? 'chevronUp' : 'edit', { cls: open?.id === f.id ? 'active' : '' }) },
      ],
      emptyText: tr('fields.none'),
    })}
    <div class="ps-add" data-add="fields">${input('new-name', '', { placeholder: tr('fields.newName'), attrs: 'data-new="name"', disabled: !S.canEdit })}${select('new-type', 'select', typeOptions(), { disabled: !S.canEdit, title: tr('col.type'), glyph: 'field' })}${btn('add', tr('common.add'), 'plus', { cls: 'primary', disabled: !S.canEdit, attrs: 'data-kind="fields"' })}</div>
    ${open ? editor(S, open) : note(tr('fields.hint'))}`;
  },
  bind(S, el) {
    const findF = (id) => S.config.fields.find((f) => f.id === id);
    bindTables(S, el, {
      fields: {
        find: findF, orderable: true,
        create: (name, form) => { const type = form.querySelector('[data-field="new-type"]').value; return { name, type, options: hasOptions({ type }) ? [] : null }; },
        created: (row) => { if (row?.id) S.pending.field = row.id; },
      },
    });
    const field = () => findF(S.pending.field);
    const saveOptions = (options, label) => { const f = field(); return S.patch(label ?? tr('op.edit', { name: f.name }), S.url('fields', f.id), f, { options }); };
    el.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-act]');
      if (!button || button.disabled) return;
      const act = button.dataset.act;
      const optId = button.closest('[data-opt]')?.dataset.opt;
      const f = field();
      if (act === 'field-edit') { const id = button.closest('[data-id]').dataset.id; S.pending.field = S.pending.field === id ? null : id; S.render(); return; }
      if (!f) return;
      if (act === 'default-clear') { S.patch(tr('op.edit', { name: f.name }), S.url('fields', f.id), f, { defaultValue: null }); return; }
      if (act === 'ftype-all' || act === 'ftype-toggle') {
        const ids = Array.isArray(f.issueTypeIds) ? f.issueTypeIds : [];
        const id = button.dataset.type;
        const next = act === 'ftype-all' ? [] : ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
        S.patch(tr('op.edit', { name: f.name }), S.url('fields', f.id), f, { issueTypeIds: next.length ? next : null });
        return;
      }
      if (act === 'field-close') { S.pending.field = null; S.render(); } else if (act === 'opt-add') {
        const box = el.querySelector('[data-new="option"]');
        const value = box.value.trim();
        if (!value) { S.say('danger', tr('err.REQUIRED')); S.render(); return; }
        if ((f.options ?? []).some((o) => String(o.value).toLowerCase() === value.toLowerCase())) { S.say('danger', tr('err.DUPLICATE')); S.render(); return; }
        saveOptions([...(f.options ?? []), { value }]);
      } else if (act === 'opt-delete') saveOptions((f.options ?? []).filter((o) => o.id !== optId));
      else if (act === 'opt-icon') {
        const opt = f.options.find((o) => o.id === optId);
        const ref = await S.ctx.pickIcon?.(opt?.icon ?? '');
        if (ref != null) saveOptions(f.options.map((o) => (o.id === optId ? { ...o, icon: ref } : o)));
      }
    });
    el.addEventListener('change', (event) => {
      const target = event.target.closest('[data-ofield], [data-ffield]');
      const f = field();
      if (!target || !f) return;
      if (target.dataset.ffield) {
        const value = target.type === 'checkbox' ? target.checked : target.value;
        if (target.dataset.ffield === 'name' && !String(value).trim()) { S.say('danger', tr('err.REQUIRED')); S.render(); return; }
        S.patch(tr('op.edit', { name: f.name }), S.url('fields', f.id), f, { [target.dataset.ffield]: value });
        return;
      }
      const optId = target.closest('[data-opt]').dataset.opt;
      const key = target.dataset.ofield;
      const value = target.value;
      if (key === 'value' && !value.trim()) { S.say('danger', tr('err.REQUIRED')); S.render(); return; }
      saveOptions(f.options.map((o) => (o.id === optId ? { ...o, [key]: value } : o)));
    });
    const saveDefault = (value) => { const f = field(); if (f) S.patch(tr('op.edit', { name: f.name }), S.url('fields', f.id), f, { defaultValue: value }); };
    let stepTimer = null;
    bindSteppers(el, (key, value) => {
      if (key !== 'field-default') return;
      clearTimeout(stepTimer);
      stepTimer = setTimeout(() => saveDefault(value), 450);
    });
    bindRefPicks(el, {
      'field-default': () => {
        const f = field();
        if (!f) return null;
        if (f.type === 'user') return { items: userItems(S.people, { none: tr('fields.noDefault') }), value: f.defaultValue ?? '', onPick: (v) => saveDefault(v || null) };
        if (f.type === 'select') return { items: [{ value: '', label: tr('fields.noDefault'), glyph: 'close' }, ...optionItems(f)], value: f.defaultValue ?? '', onPick: (v) => saveDefault(v || null) };
        if (f.type === 'multiselect') {
          // saved when the list closes (one undo step for all the ticks)
          let values = Array.isArray(f.defaultValue) ? [...f.defaultValue] : [];
          const before = JSON.stringify(values);
          return { items: optionItems(f), multi: true, values, onPick: (v, all) => { values = all; }, onClose: () => { if (JSON.stringify(values) !== before) saveDefault(values.length ? values : null); } };
        }
        return null;
      },
    });
    const list = el.querySelector('.ps-options');
    if (list && canEditField(S, field() ?? {})) sortable(list, (ids) => { const f = field(); saveOptions(ids.map((id) => f.options.find((o) => o.id === id)).filter(Boolean)); }, { rowSelector: '[data-opt]' });
  },
};

/** Items of a (multi)select field's options for the ref dropdown (their own icons). */
const optionItems = (f) => (f.options ?? []).map((o) => ({ value: o.value, label: o.value, iconRef: o.icon || null, glyph: 'list' }));

/** The default value's editor, matching the field's type. */
function defaultControl(S, f, e) {
  const v = f.defaultValue;
  const clear = v != null && v !== '' && !(Array.isArray(v) && !v.length) ? ibtn('default-clear', tr('fields.defaultClear'), 'close', { disabled: !e }) : '';
  switch (f.type) {
    case 'number':
      return `${stepper('field-default', v ?? '', { min: Math.min(0, Number(v) || 0), max: Math.max(999999, Number(v) || 0), step: 1, label: tr('fields.default'), disabled: !e })}${clear}`;
    case 'date': return input('f-default', v ?? '', { type: 'date', disabled: !e, attrs: 'data-ffield="defaultValue"', title: tr('fields.default') });
    case 'textarea': return textarea('f-default', v ?? '', { disabled: !e, rows: 2, attrs: 'data-ffield="defaultValue"', placeholder: tr('fields.noDefault') });
    case 'checkbox': return checkbox('f-default', Boolean(v), tr('fields.defaultChecked'), { disabled: !e, attrs: 'data-ffield="defaultValue"' });
    case 'labels': return `${input('f-default', Array.isArray(v) ? v.join(' ') : v ?? '', { disabled: !e, attrs: 'data-ffield="defaultValue"', placeholder: tr('fields.labelsDefault') })}`;
    case 'select': return refPick('field-default', [{ value: '', label: tr('fields.noDefault'), glyph: 'close' }, ...optionItems(f)], v ?? '', { disabled: !e, title: tr('fields.default') });
    case 'multiselect': return `${refPick('field-default', optionItems(f), Array.isArray(v) ? v : [], { disabled: !e, title: tr('fields.default'), placeholder: tr('fields.noDefault') })}${clear}`;
    case 'user': {
      const people = S.people.some((p) => p.id === v) || !v ? S.people : [...S.people, ...S.users.filter((u) => u.id === v).map((u) => ({ id: u.id, displayName: u.displayName, username: u.username, avatar: u.avatar }))];
      return refPick('field-default', userItems(people, { none: tr('fields.noDefault') }), v ?? '', { disabled: !e, title: tr('fields.default') });
    }
    default: return input('f-default', v ?? '', { disabled: !e, attrs: 'data-ffield="defaultValue"', placeholder: tr('fields.noDefault'), type: f.type === 'url' ? 'url' : 'text' });
  }
}

/** "Applies to" chips: every type (no list) or the chosen issue types of the project. */
function typeChips(S, f, e) {
  const ids = Array.isArray(f.issueTypeIds) ? f.issueTypeIds : [];
  const chip = (on, act, attrs, face, title) => `<button type="button" class="ps-chip ps-typechip ${on ? 'on' : ''}" data-act="${act}" ${attrs} aria-pressed="${on}" title="${esc(title)}" ${e ? '' : 'disabled'}>${face}</button>`;
  return `<div class="ps-typechips" role="group" aria-label="${esc(tr('fields.appliesTo'))}">
    ${chip(!ids.length, 'ftype-all', '', `${icon('selectAll')}<span>${esc(tr('fields.allTypes'))}</span>`, tr('fields.allTypes'))}
    ${S.config.types.map((t) => chip(ids.includes(t.id), 'ftype-toggle', `data-type="${esc(t.id)}"`, `${renderIconRef(t.icon, { size: 14, fallback: 'b:task' })}<span>${esc(t.name)}</span>`, t.name)).join('')}
  </div>`;
}

function editor(S, f) {
  const e = canEditField(S, f);
  const options = f.options ?? [];
  const optionsHtml = hasOptions(f) ? `<h4 class="ps-sub">${icon('list')}<span>${esc(tr('fields.options'))}</span></h4>
    <div class="ps-options">${options.map((o) => `<div class="ps-option" data-opt="${esc(o.id)}" data-id="${esc(o.id)}">
      <span class="ps-grip" draggable="${e}" title="${esc(tr('common.dragToReorder'))}" tabindex="0">${icon('grip')}</span>
      ${iconButton('opt-icon', o.icon, { disabled: !e, attrs: 'data-act="opt-icon"' }).replace('data-act="pick-icon"', '')}
      ${input('opt-value', o.value, { disabled: !e, attrs: 'data-ofield="value"', placeholder: tr('fields.optionValue') })}
      ${colorInput('opt-color', o.color ?? '#888888', { disabled: !e, attrs: '' }).replace('data-field="opt-color"', 'data-field="opt-color" data-ofield="color"')}
      ${ibtn('opt-delete', tr('common.delete'), 'trash', { cls: 'danger', disabled: !e })}
    </div>`).join('') || `<div class="ps-empty">${icon('info')}<span>${esc(tr('fields.noOptions'))}</span></div>`}</div>
    <div class="ps-add">${input('new-option', '', { placeholder: tr('fields.newOption'), attrs: 'data-new="option"', disabled: !e })}${btn('opt-add', tr('fields.addOption'), 'plus', { cls: 'primary', disabled: !e })}</div>` : '';
  return card(tr('fields.editTitle', { name: f.name }), FIELD_ICON[f.type] ?? 'field', `<div class="ps-form">
      <div class="ps-row"><div class="ps-row-label">${icon('edit')}<span>${esc(tr('col.name'))}</span></div><div class="ps-row-control">${input('f-name', f.name, { disabled: !e, attrs: 'data-ffield="name"' })}</div></div>
      <div class="ps-row"><div class="ps-row-label">${icon('field')}<span>${esc(tr('col.type'))}</span></div><div class="ps-row-control"><span class="ps-chip">${icon(FIELD_ICON[f.type])}<span>${esc(tr(`ftype.${f.type}`))}</span></span><div class="ps-hint">${esc(tr('fields.typeFixed'))}</div></div></div>
      <div class="ps-row"><div class="ps-row-label">${icon('notes')}<span>${esc(tr('col.description'))}</span></div><div class="ps-row-control">${textarea('f-description', f.description, { disabled: !e, rows: 2, attrs: 'data-ffield="description"' })}</div></div>
      <div class="ps-row"><div class="ps-row-label">${icon('warning')}<span>${esc(tr('fields.required'))}</span></div><div class="ps-row-control"><label class="ps-check"><input type="checkbox" data-ffield="required" ${f.required ? 'checked' : ''} ${e ? '' : 'disabled'} /><span>${esc(tr('fields.requiredText'))}</span></label></div></div>
      <div class="ps-row" data-default-row><div class="ps-row-label">${icon('star')}<span>${esc(tr('fields.default'))}</span></div><div class="ps-row-control"><div class="ps-inline ps-default">${defaultControl(S, f, e)}</div><div class="ps-hint">${esc(tr('fields.defaultHint'))}</div></div></div>
      <div class="ps-row" data-types-row><div class="ps-row-label">${icon('layers')}<span>${esc(tr('fields.appliesTo'))}</span></div><div class="ps-row-control">${typeChips(S, f, e)}<div class="ps-hint">${esc(tr('fields.appliesHint'))}</div></div></div>
    </div>${optionsHtml}`,{ actions: ibtn('field-close', tr('common.close'), 'close'), cls: 'ps-field-editor', attrs: `data-field-editor="${esc(f.id)}"` });
}
