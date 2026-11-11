// A generic editable table of config rows (types, statuses, priorities, …): cells with fields that save on
// change (undo-able), the icon picker, drag-to-reorder, add, and delete with an inline confirmation that asks
// for a replacement when the core answers 409 IN_USE.
import { tr, esc, icon, btn, ibtn, select, input, sortable } from '../util.js';

/**
 * cols: [{ head, width, cell(item, editable) → html }]. `extra(item)` → html of a full-width row under it.
 * The rows carry data-id / data-kind; fields inside them use data-field.
 */
export function table(S, { kind, rows, cols, order = false, deletable = true, editable = S.canEdit, extra = null, emptyText = '' }) {
  const all = [...(order ? [{ head: '', width: '28px', cell: () => `<span class="ps-grip" draggable="${editable}" title="${esc(tr('common.dragToReorder'))}" aria-label="${esc(tr('common.dragToReorder'))}" tabindex="${editable ? 0 : -1}">${icon('grip')}</span>` }] : []), ...cols,
    ...(deletable ? [{ head: '', width: '34px', cell: (item) => ibtn('delete', tr('common.delete'), 'trash', { cls: 'danger', disabled: !editable, attrs: `data-name="${esc(item.name ?? '')}"` }) }] : [])];
  const template = all.map((c) => c.width ?? 'minmax(90px, 1fr)').join(' ');
  const head = `<div class="ps-tr ps-thead" role="row">${all.map((c) => `<div class="ps-th" role="columnheader">${esc(c.head ?? '')}</div>`).join('')}</div>`;
  const body = rows.map((item) => `<div class="ps-tr ${S.pending.del?.id === item.id ? 'pending' : ''}" role="row" data-id="${esc(item.id)}" data-kind="${esc(kind)}">${all.map((c) => `<div class="ps-td" role="cell">${c.cell(item, editable)}</div>`).join('')}</div>
      ${S.pending.del?.id === item.id ? confirmRow(S, kind, item) : ''}${extra ? extra(item) ?? '' : ''}`).join('');
  return `<div class="ps-table" role="table" data-kind="${esc(kind)}" style="--ps-cols: ${template}">${head}<div class="ps-tbody" data-kind="${esc(kind)}">${body || `<div class="ps-tr ps-none"><div class="ps-td">${esc(emptyText || tr('common.none'))}</div></div>`}</div></div>`;
}

/** The inline delete confirmation (with a replacement dropdown when the item is in use). */
function confirmRow(S, kind, item) {
  const pending = S.pending.del;
  const options = (pending.replaceOptions ?? []).filter((o) => o.value !== item.id);
  const replace = pending.inUse || pending.optionalReplace;
  return `<div class="ps-confirm" data-confirm="${esc(item.id)}" data-kind="${esc(kind)}">
    ${icon('warning')}<span class="ps-confirm-text">${esc(pending.inUse ? tr('del.inUse', { name: item.name ?? '', count: pending.count ?? '?' }) : tr('del.ask', { name: item.name ?? '' }))}</span>
    ${replace && options.length ? select('replaceWith', pending.inUse ? options[0]?.value : '', [...(pending.inUse ? [] : [{ value: '', label: tr('del.noReplace'), icon: 'close' }]), ...options], { title: tr('del.replaceWith'), glyph: 'replace' }) : ''}
    <span class="grow"></span>
    ${btn('del-confirm', tr('common.delete'), 'trash', { cls: 'danger primary' })}${btn('del-cancel', tr('common.cancel'), 'close')}
  </div>`;
}

/** An "add" line: name box + button (+ extra controls). */
export function addLine(kind, placeholder, { extra = '', disabled = false, label = '' } = {}) {
  return `<div class="ps-add" data-add="${esc(kind)}">${input('new-name', '', { placeholder, attrs: 'data-new="name"', disabled })}${extra}${btn('add', label || tr('common.add'), 'plus', { cls: 'primary', disabled, attrs: `data-kind="${esc(kind)}"` })}</div>`;
}

/** The value of a field element (checkbox → bool, number → number, '' → null for dates/ids). */
export function fieldValue(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'number') return el.value === '' ? null : Number(el.value);
  if (el.dataset.num != null) return el.value === '' ? null : Number(el.value);
  if (el.type === 'date') return el.value || null;
  if (el.tagName === 'SELECT' && el.value === '' && el.dataset.emptyNull != null) return null;
  return el.value;
}

/**
 * Wires a section's tables: field changes, icon picking, delete (+ replacement), reorder, add.
 * kinds: { [kind]: { find(id), create?(name, form) → body, label?(item), replaceOptions?(item), optionalReplace? } }
 */
export function bindTables(S, el, kinds) {
  el.addEventListener('change', (event) => {
    const field = event.target.closest('[data-field]');
    const rowEl = event.target.closest('.ps-tr[data-id]');
    if (!field || !rowEl || field.dataset.field === 'new-name' || event.target.closest('.ps-confirm')) return;
    const kind = rowEl.dataset.kind;
    const spec = kinds[kind];
    if (!spec || field.dataset.field === 'pick-icon') return;
    const item = spec.find(rowEl.dataset.id);
    if (!item) return;
    const name = field.dataset.field;
    let value = fieldValue(field);
    if (name === 'name' && !String(value).trim()) { S.say('danger', tr('err.REQUIRED')); S.render(); return; }
    if (spec.coerce) value = spec.coerce(name, value);
    if (spec.onField) { spec.onField(item, name, value, field); return; }
    S.patch(tr('op.edit', { name: item.name ?? '' }), S.url(kind, item.id), item, { [name]: value });
  });
  el.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-act]');
    if (!button || button.disabled) return;
    const act = button.dataset.act;
    const rowEl = button.closest('.ps-tr[data-id]');
    const kind = rowEl?.dataset.kind ?? button.closest('[data-kind]')?.dataset.kind ?? button.dataset.kind;
    const spec = kinds[kind];
    if (act === 'pick-icon' && rowEl && spec) {
      const item = spec.find(rowEl.dataset.id);
      const ref = await S.ctx.pickIcon?.(item?.icon ?? '');
      if (ref == null || !item) return;
      S.patch(tr('op.icon', { name: item.name ?? '' }), S.url(kind, item.id), item, { icon: ref });
    } else if (act === 'delete' && rowEl && spec) {
      const item = spec.find(rowEl.dataset.id);
      S.pending.del = { kind, id: item.id, replaceOptions: spec.replaceOptions?.(item) ?? [], optionalReplace: Boolean(spec.optionalReplace) };
      S.render();
    } else if (act === 'del-cancel') {
      S.pending.del = null;
      S.render();
    } else if (act === 'del-confirm') {
      const box = button.closest('.ps-confirm');
      const id = box.dataset.confirm;
      const k = box.dataset.kind;
      const replaceWith = box.querySelector('[data-field="replaceWith"]')?.value || '';
      const pending = S.pending.del;
      await S.track(async () => {
        try {
          if (kinds[k]?.remove) await kinds[k].remove(id, replaceWith);
          else await S.api.del(S.url(k, id), replaceWith ? { replaceWith } : undefined);
          S.pending.del = null;
          S.say('success', tr('del.done'));
          await S.refresh();
        } catch (error) {
          if (error?.code === 'IN_USE') {
            S.pending.del = { ...pending, inUse: true, count: error.details?.count };
            S.render();
          } else { S.pending.del = null; S.fail(error); }
        }
      });
    } else if (act === 'add' && spec?.create) {
      const form = button.closest('.ps-add');
      const nameEl = form?.querySelector('[data-new="name"]');
      const name = nameEl?.value.trim() ?? '';
      if (!name && !spec.noName) { S.say('danger', tr('err.REQUIRED')); S.render(); return; }
      const body = spec.create(name, form);
      if (!body) return;
      await S.run(async () => { const row = await S.api.post(S.url(kind), body); spec.created?.(row); return row; }, { ok: tr('created', { name }) });
    }
  });
  for (const tbody of el.querySelectorAll('.ps-tbody[data-kind]')) {
    const kind = tbody.dataset.kind;
    if (!kinds[kind]?.orderable) continue;
    sortable(tbody, (ids) => S.run(() => (kinds[kind].reorder ? kinds[kind].reorder(ids) : S.api.post(`${S.url(kind)}/order`, { ids }))), { rowSelector: '.ps-tr[data-id]', disabled: !(kinds[kind].canEdit ?? S.canEdit) });
  }
}

export const nameCell = (placeholder) => (item, editable) => input('name', item.name, { disabled: !editable, placeholder });
