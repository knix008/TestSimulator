// Project details: name, key (fixed, with what a rename would mean), description, icon, colour, lead,
// default assignee, archive / unarchive, delete (typed confirmation), and a link to the database settings.
import { tr, esc, icon, btn, row, input, textarea, select, colorInput, renderIconRef, note, card, userOptions } from '../util.js';

const SWATCHES = ['#1c7ed6', '#2b8a3e', '#e03e2d', '#7e4fd8', '#e8590c', '#0ca678', '#f59f00', '#d6336c', '#495057', '#1098ad'];

export const detailsSection = {
  id: 'details', glyph: 'notes',
  render(S) {
    const p = S.project;
    const e = S.canEdit;
    const people = userOptions(S.people, { none: tr('common.nobody') });
    const assignee = userOptions(S.people, { none: tr('details.unassigned') });
    return `<div class="ps-form">
      ${row('edit', tr('details.name'), input('name', p.name, { disabled: !e, placeholder: tr('details.name') }))}
      ${row('key', tr('details.key'), `<div class="ps-keybox">${input('key', p.key, { disabled: true, cls: 'ps-key' })}<span class="ps-chip">${icon('lock')}<span>${esc(tr('details.keyFixed'))}</span></span></div>`, { hint: tr('details.keyHint', { key: p.key }) })}
      ${row('notes', tr('details.description'), textarea('description', p.description, { disabled: !e, rows: 3, placeholder: tr('details.descriptionPlaceholder') }))}
      ${row('iconInsert', tr('details.icon'), `<div class="ps-iconrow"><button type="button" class="ps-iconpick big" data-act="project-icon" ${e ? '' : 'disabled'} title="${esc(tr('common.changeIcon'))}" aria-label="${esc(tr('common.changeIcon'))}">${renderIconRef(p.icon, { size: 30, fallback: `l:${(p.key ?? '?').slice(0, 2)}#${(p.color ?? '#5b6ee1').slice(1)}` })}</button>
        ${btn('project-icon', tr('common.changeIcon'), 'iconInsert', { disabled: !e })}${btn('project-icon-clear', tr('details.iconClear'), 'clear', { disabled: !e || !p.icon })}</div>`, { hint: tr('details.iconHint') })}
      ${row('palette', tr('details.color'), `<div class="ps-swatches">${colorInput('color', p.color, { disabled: !e })}${SWATCHES.map((c) => `<button type="button" class="ps-swatch ${String(p.color).toLowerCase() === c ? 'active' : ''}" data-act="swatch" data-color="${c}" style="--sw:${c}" ${e ? '' : 'disabled'} title="${c}" aria-label="${c}"></button>`).join('')}</div>`)}
      ${row('user', tr('details.lead'), select('leadId', p.leadId ?? '', people, { disabled: !e, attrs: 'data-empty-null', title: tr('details.lead'), glyph: 'user' }))}
      ${row('user', tr('details.defaultAssignee'), select('defaultAssigneeId', p.defaultAssigneeId ?? '', assignee, { disabled: !e, attrs: 'data-empty-null', title: tr('details.defaultAssignee'), glyph: 'user' }), { hint: tr('details.defaultAssigneeHint') })}
    </div>
    ${card(tr('details.db'), 'database', `<p class="ps-p">${esc(tr('details.dbText', { db: S.info?.db?.label ?? S.info?.db?.type ?? '' }))}</p>${btn('open-db', tr('details.dbOpen'), 'database')}`)}
    ${card(tr('details.danger'), 'warning', `
      <div class="ps-danger-row"><div><b>${esc(tr(p.archived ? 'details.unarchive' : 'details.archive'))}</b><p class="ps-p">${esc(tr(p.archived ? 'details.unarchiveText' : 'details.archiveText'))}</p></div>
        ${btn('archive', tr(p.archived ? 'details.unarchive' : 'details.archive'), p.archived ? 'folderOpen' : 'folder', { disabled: !e })}</div>
      <div class="ps-danger-row"><div><b>${esc(tr('details.delete'))}</b><p class="ps-p">${esc(tr('details.deleteText', { key: p.key }))}</p>
        <div class="ps-keybox">${input('confirm-key', '', { placeholder: tr('details.typeKey', { key: p.key }), disabled: !e, attrs: 'data-confirm-key autocomplete="off"' })}</div></div>
        ${btn('delete-project', tr('details.delete'), 'trash', { cls: 'danger primary', disabled: true })}</div>`, { cls: 'ps-danger' })}`;
  },
  bind(S, el) {
    const p = S.project;
    const save = (patch, opName = 'op.project') => S.patch(tr(opName, { name: p.name }), S.url('project'), p, patch, { after: (row) => { if (row) S.syncShell({ project: row }); } });
    el.addEventListener('change', (event) => {
      const field = event.target.closest('[data-field]');
      if (!field || field.dataset.confirmKey != null) return;
      const name = field.dataset.field;
      if (!['name', 'description', 'color', 'leadId', 'defaultAssigneeId'].includes(name)) return;
      let value = field.value;
      if (name === 'name' && !value.trim()) { S.say('danger', tr('err.REQUIRED')); S.render(); return; }
      if ((name === 'leadId' || name === 'defaultAssigneeId') && !value) value = null;
      save({ [name]: value });
    });
    el.addEventListener('input', (event) => {
      if (event.target.dataset.confirmKey == null) return;
      el.querySelector('[data-act="delete-project"]').disabled = event.target.value.trim().toUpperCase() !== String(p.key).toUpperCase();
    });
    el.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-act]');
      if (!button || button.disabled) return;
      switch (button.dataset.act) {
        case 'project-icon': {
          const ref = await S.ctx.pickIcon?.(p.icon ?? '');
          if (ref != null) save({ icon: ref }, 'op.icon');
          break;
        }
        case 'project-icon-clear': save({ icon: '' }, 'op.icon'); break;
        case 'swatch': save({ color: button.dataset.color }); break;
        case 'archive': save({ archived: !p.archived }); break;
        case 'open-db': S.ctx.app?.run?.('database'); break;
        case 'delete-project': {
          const typed = el.querySelector('[data-confirm-key]').value.trim().toUpperCase();
          if (typed !== String(p.key).toUpperCase()) return;
          try {
            await S.api.deleteProject(p.id);
            S.ctx.notify?.('success', tr('details.deleted', { name: p.name }));
            await S.ctx.app?.closeProject?.();
            globalThis.__myboard?.actions?.refreshProjects?.();
          } catch (error) { S.fail(error); }
          break;
        }
        default:
      }
    });
  },
};

export { note };
