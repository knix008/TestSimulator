// Issue types, statuses, priorities, resolutions (global), components, versions/releases and the labels (rename / merge / delete).
import {
  tr, esc, icon, btn, ibtn, select, input, colorInput, iconButton, card, note, empty, renderIconRef, items,
  userOptions, CATEGORY_ICON, LEVEL_ICON,
} from '../util.js';
import { table, addLine, bindTables, nameCell } from './collection.js';
import { refPick, userItems, bindRefPicks } from './refpick.js';

const levelOptions = () => [
  { value: '-1', label: tr('level.epic'), icon: LEVEL_ICON['-1'] },
  { value: '0', label: tr('level.standard'), icon: LEVEL_ICON[0] },
  { value: '1', label: tr('level.subtask'), icon: LEVEL_ICON[1] },
];
export const categoryOptions = () => ['todo', 'inprogress', 'done'].map((c) => ({ value: c, label: tr(`category.${c}`), icon: CATEGORY_ICON[c] }));
const colorCell = (item, editable) => colorInput('color', item.color, { disabled: !editable });
const iconCell = (item, editable) => iconButton('icon', item.icon, { disabled: !editable });
const find = (list) => (id) => list().find((x) => x.id === id);
const optionsOf = (list, glyph) => list.map((x) => ({ value: x.id, label: x.name, icon: glyph }));

// ───────────────────────── issue types

export const typesSection = {
  id: 'types', glyph: 'layers',
  render(S) {
    const c = S.config;
    const workflows = c.workflows.map((w) => ({ value: w.id, label: w.name, icon: 'routeOrtho' }));
    const tiers = [[-1, 'epic'], [0, 'standard'], [1, 'subtask']].map(([level, key], i) => `<div class="ps-tier" style="--tier:${i}">${icon(LEVEL_ICON[level])}<b>${esc(tr(`level.${key}`))}</b>
      <span class="ps-chips">${c.types.filter((t) => Number(t.level) === level).map((t) => `<span class="ps-chip">${renderIconRef(t.icon, { size: 14 })}<span>${esc(t.name)}</span></span>`).join('') || `<span class="muted">${esc(tr('common.none'))}</span>`}</span></div>`).join('');
    return `${table(S, {
      kind: 'types', rows: c.types, order: true,
      cols: [
        { head: tr('col.icon'), width: '44px', cell: iconCell },
        { head: tr('col.name'), width: 'minmax(120px, 1.4fr)', cell: nameCell(tr('col.name')) },
        { head: tr('col.color'), width: '52px', cell: colorCell },
        { head: tr('col.level'), width: 'minmax(120px, 1fr)', cell: (t, e) => select('level', String(t.level ?? 0), levelOptions(), { disabled: !e, attrs: 'data-num', title: tr('col.level'), glyph: 'layers' }) },
        { head: tr('col.workflow'), width: 'minmax(120px, 1fr)', cell: (t, e) => select('workflowId', t.workflowId ?? '', workflows, { disabled: !e || workflows.length < 2, title: tr('col.workflow'), glyph: 'routeOrtho' }) },
      ],
    })}
    ${addLine('types', tr('types.newName'), { disabled: !S.canEdit, extra: select('new-level', '0', levelOptions(), { disabled: !S.canEdit, title: tr('col.level'), glyph: 'layers' }) })}
    ${card(tr('types.hierarchy'), 'layers', `<div class="ps-hierarchy">${tiers}</div>${note(tr('types.hierarchyHint'))}`)}`;
  },
  bind(S, el) {
    bindTables(S, el, {
      types: {
        find: find(() => S.config.types), orderable: true,
        create: (name, form) => ({ name, level: Number(form.querySelector('[data-field="new-level"]').value), icon: 'b:task', color: '#2f8fdd' }),
        replaceOptions: (item) => optionsOf(S.config.types.filter((t) => t.id !== item.id), 'layers'),
      },
    });
  },
};

// ───────────────────────── statuses

export const statusesSection = {
  id: 'statuses', glyph: 'flag',
  render(S) {
    const c = S.config;
    const columnOf = (statusId) => S.board?.columns?.find((col) => (col.statusIds ?? []).includes(statusId));
    return `${table(S, {
      kind: 'statuses', rows: c.statuses, order: true,
      cols: [
        { head: tr('col.color'), width: '52px', cell: colorCell },
        { head: tr('col.name'), width: 'minmax(130px, 1.4fr)', cell: nameCell(tr('col.name')) },
        { head: tr('col.category'), width: 'minmax(130px, 1fr)', cell: (s, e) => select('category', s.category, categoryOptions(), { disabled: !e, title: tr('col.category'), glyph: 'flag' }) },
        { head: tr('col.boardColumn'), width: 'minmax(110px, 1fr)', cell: (s) => { const col = columnOf(s.id); return col ? `<span class="ps-chip">${icon('columns')}<span>${esc(col.name)}</span></span>` : `<span class="ps-chip warn" title="${esc(tr('statuses.unmappedHint'))}">${icon('warning')}<span>${esc(tr('statuses.unmapped'))}</span></span>`; } },
      ],
    })}
    ${addLine('statuses', tr('statuses.newName'), { disabled: !S.canEdit, extra: select('new-category', 'todo', categoryOptions(), { disabled: !S.canEdit, title: tr('col.category'), glyph: 'flag' }) })}
    ${note(tr('statuses.hint'))}`;
  },
  bind(S, el) {
    bindTables(S, el, {
      statuses: {
        find: find(() => S.config.statuses), orderable: true,
        create: (name, form) => { const category = form.querySelector('[data-field="new-category"]').value; return { name, category, color: { todo: '#6b7685', inprogress: '#1c7ed6', done: '#2b8a3e' }[category] }; },
        replaceOptions: (item) => optionsOf(S.config.statuses.filter((s) => s.id !== item.id), 'flag'),
      },
    });
  },
};

// ───────────────────────── priorities, resolutions (global)

export const prioritiesSection = {
  id: 'priorities', glyph: 'sort',
  render(S) {
    const editable = S.isGlobalAdmin;
    return `${note(tr(editable ? 'global.hint' : 'global.adminOnly'), editable ? 'info' : 'warning')}
    ${table(S, {
      kind: 'priorities', rows: S.config.priorities, order: true, editable,
      cols: [
        { head: tr('col.icon'), width: '44px', cell: iconCell },
        { head: tr('col.name'), width: 'minmax(130px, 1.4fr)', cell: nameCell(tr('col.name')) },
        { head: tr('col.color'), width: '52px', cell: colorCell },
      ],
    })}
    ${addLine('priorities', tr('priorities.newName'), { disabled: !editable })}`;
  },
  bind(S, el) {
    bindTables(S, el, {
      priorities: {
        find: find(() => S.config.priorities), orderable: true, canEdit: S.isGlobalAdmin, optionalReplace: true,
        create: (name) => ({ name, icon: 'b:priority-medium', color: '#e8a33d' }),
        replaceOptions: (item) => optionsOf(S.config.priorities.filter((p) => p.id !== item.id), 'sort'),
      },
    });
  },
};

export const resolutionsSection = {
  id: 'resolutions', glyph: 'check',
  render(S) {
    const editable = S.isGlobalAdmin;
    return `${note(tr(editable ? 'global.hint' : 'global.adminOnly'), editable ? 'info' : 'warning')}
    ${table(S, {
      kind: 'resolutions', rows: S.config.resolutions, order: true, editable,
      cols: [
        { head: tr('col.icon'), width: '44px', cell: iconCell },
        { head: tr('col.name'), width: 'minmax(130px, 1fr)', cell: nameCell(tr('col.name')) },
        { head: tr('col.color'), width: '52px', cell: colorCell },
        { head: tr('col.description'), width: 'minmax(160px, 2fr)', cell: (r, e) => input('description', r.description, { disabled: !e, placeholder: tr('col.description') }) },
      ],
    })}
    ${addLine('resolutions', tr('resolutions.newName'), { disabled: !editable })}`;
  },
  bind(S, el) {
    bindTables(S, el, {
      resolutions: {
        find: find(() => S.config.resolutions), orderable: true, canEdit: S.isGlobalAdmin,
        create: (name) => ({ name, icon: 'b:checkCircle', color: '#2b8a3e' }),
        replaceOptions: (item) => optionsOf(S.config.resolutions.filter((r) => r.id !== item.id), 'check'),
      },
    });
  },
};

// ───────────────────────── components

export const componentsSection = {
  id: 'components', glyph: 'container',
  render(S) {
    const people = userOptions(S.people, { none: tr('common.nobody') });
    return `${table(S, {
      kind: 'components', rows: S.config.components,
      cols: [
        { head: tr('col.icon'), width: '44px', cell: iconCell },
        { head: tr('col.name'), width: 'minmax(120px, 1fr)', cell: nameCell(tr('col.name')) },
        { head: tr('col.description'), width: 'minmax(140px, 1.6fr)', cell: (x, e) => input('description', x.description, { disabled: !e, placeholder: tr('col.description') }) },
        { head: tr('col.lead'), width: 'minmax(130px, 1fr)', cell: (x, e) => select('leadId', x.leadId ?? '', people, { disabled: !e, attrs: 'data-empty-null', title: tr('col.lead'), glyph: 'user' }) },
        { head: tr('col.defaultAssignee'), width: 'minmax(140px, 1fr)', cell: (x, e) => refPick('defaultAssigneeId', userItems(S.people, { none: tr('components.noDefault') }), x.defaultAssigneeId ?? '', { disabled: !e, title: tr('col.defaultAssignee') }) },
      ],
      emptyText: tr('components.none'),
    })}
    ${addLine('components', tr('components.newName'), { disabled: !S.canEdit })}
    ${note(tr('components.assigneeHint'))}`;
  },
  bind(S, el) {
    const findC = find(() => S.config.components);
    bindTables(S, el, { components: { find: findC, create: (name) => ({ name, icon: 'b:folder' }) } });
    bindRefPicks(el, {
      defaultAssigneeId: (holder) => {
        const c = findC(holder.closest('[data-id]')?.dataset.id);
        if (!c) return null;
        return {
          items: userItems(S.people, { none: tr('components.noDefault') }), value: c.defaultAssigneeId ?? '',
          onPick: (v) => { if ((v || null) !== (c.defaultAssigneeId ?? null)) S.patch(tr('op.edit', { name: c.name }), S.url('components', c.id), c, { defaultAssigneeId: v || null }); },
        };
      },
    });
  },
};

// ───────────────────────── versions / releases

export const versionsSection = {
  id: 'versions', glyph: 'calendar',
  render(S) {
    const versions = S.config.versions;
    const state = (v, e) => {
      const badge = v.archived ? `<span class="ps-chip">${icon('folder')}<span>${esc(tr('versions.archived'))}</span></span>`
        : v.released ? `<span class="ps-chip ok">${icon('check')}<span>${esc(tr('versions.released'))}</span></span>`
          : `<span class="ps-chip">${icon('clock')}<span>${esc(tr('versions.unreleased'))}</span></span>`;
      const action = v.released ? ibtn('unrelease', tr('versions.unrelease'), 'undo', { disabled: !e }) : ibtn('release', tr('versions.release'), 'play', { disabled: !e });
      const archive = ibtn('archive', tr(v.archived ? 'versions.unarchive' : 'versions.archive'), v.archived ? 'folderOpen' : 'folder', { disabled: !e });
      return `<span class="ps-cell-row">${badge}<span class="grow"></span>${action}${archive}</span>`;
    };
    const releasePanel = (v) => {
      if (S.pending.release !== v.id) return '';
      const others = versions.filter((x) => x.id !== v.id && !x.released && !x.archived).map((x) => ({ value: x.id, label: x.name, icon: 'calendar' }));
      const today = new Date();
      const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      return `<div class="ps-inline-form" data-release="${esc(v.id)}">${icon('play')}<b>${esc(tr('versions.releaseTitle', { name: v.name }))}</b>
        <label class="ps-mini">${esc(tr('versions.releaseDate'))} ${input('releaseDate', v.releaseDate || iso, { type: 'date', attrs: 'data-rel="date"' })}</label>
        <label class="ps-mini">${esc(tr('versions.moveTo'))} ${select('moveUnresolvedTo', '', [{ value: '', label: tr('versions.keep'), icon: 'close' }, ...others], { attrs: 'data-rel="move"', title: tr('versions.moveTo'), glyph: 'calendar' })}</label>
        <span class="grow"></span>${btn('release-do', tr('versions.release'), 'play', { cls: 'primary' })}${btn('release-cancel', tr('common.cancel'), 'close')}</div>`;
    };
    return `${table(S, {
      kind: 'versions', rows: versions, order: true, extra: releasePanel,
      cols: [
        { head: tr('col.name'), width: 'minmax(110px, 1fr)', cell: nameCell(tr('col.name')) },
        { head: tr('col.start'), width: '138px', cell: (v, e) => input('startDate', v.startDate, { type: 'date', disabled: !e, title: tr('col.start') }) },
        { head: tr('col.release'), width: '138px', cell: (v, e) => input('releaseDate', v.releaseDate, { type: 'date', disabled: !e, title: tr('col.release') }) },
        { head: tr('col.state'), width: 'minmax(170px, 1.2fr)', cell: state },
      ],
      emptyText: tr('versions.none'),
    })}
    ${addLine('versions', tr('versions.newName'), { disabled: !S.canEdit })}`;
  },
  bind(S, el) {
    const findV = find(() => S.config.versions);
    bindTables(S, el, {
      versions: {
        find: findV, orderable: true, optionalReplace: true,
        create: (name) => ({ name }),
        replaceOptions: (item) => optionsOf(S.config.versions.filter((v) => v.id !== item.id), 'calendar'),
      },
    });
    el.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-act]');
      if (!button || button.disabled) return;
      const id = button.closest('[data-id]')?.dataset.id ?? button.closest('[data-release]')?.dataset.release;
      const v = findV(id);
      if (!v) return;
      switch (button.dataset.act) {
        case 'release': S.pending.release = v.id; S.render(); break;
        case 'release-cancel': S.pending.release = null; S.render(); break;
        case 'release-do': {
          const form = button.closest('[data-release]');
          const body = { releaseDate: form.querySelector('[data-rel="date"]').value || undefined, moveUnresolvedTo: form.querySelector('[data-rel="move"]').value || undefined };
          S.pending.release = null;
          await S.run(() => S.api.post(`${S.url('versions', v.id)}/release`, body), { ok: tr('versions.releasedNotice', { name: v.name }) });
          break;
        }
        case 'unrelease': S.patch(tr('op.edit', { name: v.name }), S.url('versions', v.id), v, { released: false }); break;
        case 'archive': S.patch(tr('op.edit', { name: v.name }), S.url('versions', v.id), v, { archived: !v.archived }); break;
        default:
      }
    });
  },
};

// ───────────────────────── labels (usage, rename / merge / delete)
// GET /projects/:id/labels (or /labels for every project, global admins). Rename to a name in use = merge.
// Every change asks first (inline) and is undoable: rename back, or POST …/labels/apply with the issue ids.

const labelScope = (S) => (S.isGlobalAdmin && S.pending.labelScope === 'all' ? null : S.pid);
const labelsEditable = (S) => (labelScope(S) == null ? S.isGlobalAdmin : S.canEdit);
const normLabel = (s) => String(s ?? '').trim().replace(/\s+/g, '-');

function labelEditRow(S, x, list) {
  const ed = S.pending.labelEdit;
  if (!ed || ed.label !== x.label) return '';
  if (ed.mode === 'delete') {
    return `<div class="ps-confirm" data-label-confirm>${icon('warning')}<span class="ps-confirm-text">${esc(tr('labels.deleteAsk', { name: x.label, n: x.count }))}</span>
      ${btn('label-delete-do', tr('common.delete'), 'trash', { cls: 'danger primary' })}${btn('label-cancel', tr('common.cancel'), 'close')}</div>`;
  }
  const to = normLabel(ed.value);
  const target = list.find((y) => y.label === to && y.label !== x.label);
  const ask = ed.ask && to && to !== x.label;
  const text = !to ? tr('labels.renameHint') : to === x.label ? tr('labels.renameSame') : target ? tr('labels.mergeInfo', { name: x.label, to, n: x.count, m: target.count }) : tr('labels.renameInfo', { name: x.label, to, n: x.count });
  return `<div class="ps-inline-form ps-label-form" data-label-form>${icon(target ? 'link' : 'edit')}
    ${input('label-to', ed.value, { attrs: 'data-label-to maxlength="100" autocomplete="off"', placeholder: tr('labels.newName'), title: tr('labels.newName') })}
    <span class="ps-confirm-text ps-label-info" data-label-info>${esc(text)}</span>
    ${ask ? btn('label-rename-do', target ? tr('labels.mergeDo') : tr('labels.renameDo'), 'check', { cls: 'danger primary' })
    : btn('label-rename-ask', target ? tr('labels.merge') : tr('labels.rename'), target ? 'link' : 'edit', { cls: 'primary', disabled: !to || to === x.label })}
    ${btn('label-cancel', tr('common.cancel'), 'close')}</div>`;
}

export const labelsSection = {
  id: 'labels', glyph: 'tag', open: true,
  render(S) {
    const scope = labelScope(S);
    const labels = S.pending.labels;
    if (!labels || labels.pid !== S.pid || labels.scope !== scope) {
      S.pending.labels = { pid: S.pid, scope, items: null };
      S.track(() => S.api.labels(scope)
        .then((out) => { if (S.pending.labels?.scope === scope) { S.pending.labels = { pid: S.pid, scope, items: items(out) }; S.render(); } })
        .catch((error) => { S.pending.labels = { pid: S.pid, scope, items: [], error }; S.render(); }));
      return `<div class="ps-loading">${icon('hourglass')}<span>${esc(tr('loading'))}</span></div>`;
    }
    if (!labels.items) return `<div class="ps-loading">${icon('hourglass')}<span>${esc(tr('loading'))}</span></div>`;
    const list = labels.items;
    const e = labelsEditable(S);
    const max = Math.max(1, ...list.map((x) => Number(x.count) || 0));
    const scopeBar = S.isGlobalAdmin ? `<div class="ps-seg" role="group" aria-label="${esc(tr('labels.scope'))}">
      ${btn('label-scope-project', tr('labels.scopeProject'), 'folder', { cls: scope ? 'active' : '', attrs: `aria-pressed="${Boolean(scope)}"` })}
      ${btn('label-scope-all', tr('labels.scopeAll'), 'layers', { cls: scope ? '' : 'active', attrs: `aria-pressed="${!scope}"` })}</div>` : '';
    const rows = list.map((x) => `<div class="ps-label-row" data-label="${esc(x.label)}">
        <span class="ps-label" style="--w:${Math.round((Number(x.count) / max) * 100)}%">${icon('tag')}<span>${esc(x.label)}</span><b>${Number(x.count)}</b></span>
        <span class="grow"></span>
        ${ibtn('label-rename', tr('labels.renameTip', { name: x.label }), 'edit', { disabled: !e })}${ibtn('label-delete', tr('labels.deleteTip', { name: x.label }), 'trash', { disabled: !e, cls: 'danger' })}
      </div>${labelEditRow(S, x, list)}`).join('');
    return `${labels.error ? note(tr('labels.failed'), 'warning') : ''}
      <div class="ps-label-head">${scopeBar}<span class="grow"></span>${btn('labels-refresh', tr('common.refresh'), 'refresh')}</div>
      <div class="ps-label-list">${rows || empty(tr('labels.none'), 'tag')}</div>
      ${note(tr(e ? 'labels.hintEdit' : 'labels.hint'))}`;
  },
  bind(S, el) {
    const scope = () => labelScope(S);
    const reload = () => { S.pending.labels = null; S.render(); };
    const after = () => { S.pending.labels = null; S.announce('label.renamed'); S.render(); };
    el.addEventListener('input', (event) => {
      const box = event.target.closest('[data-label-to]');
      if (!box || !S.pending.labelEdit) return;
      S.pending.labelEdit = { ...S.pending.labelEdit, value: box.value, ask: false };
      // redraw the row only (the text box keeps the caret)
      const rowEl = box.closest('[data-label-form]');
      const label = S.pending.labelEdit.label;
      const tmp = document.createElement('div');
      tmp.innerHTML = labelEditRow(S, { label, count: S.pending.labels?.items?.find((x) => x.label === label)?.count ?? 0 }, S.pending.labels?.items ?? []);
      const fresh = tmp.firstElementChild;
      rowEl.querySelector('[data-label-info]').replaceWith(fresh.querySelector('[data-label-info]'));
      const oldBtn = rowEl.querySelector('[data-act="label-rename-ask"], [data-act="label-rename-do"]');
      oldBtn.replaceWith(fresh.querySelector('[data-act="label-rename-ask"], [data-act="label-rename-do"]'));
      rowEl.firstElementChild.replaceWith(fresh.firstElementChild);
    });
    el.addEventListener('keydown', (event) => {
      if (!event.target.closest?.('[data-label-to]') || event.isComposing) return;
      if (event.key === 'Enter') { event.preventDefault(); el.querySelector('[data-label-form] [data-act="label-rename-ask"], [data-label-form] [data-act="label-rename-do"]')?.click(); }
      if (event.key === 'Escape') { S.pending.labelEdit = null; S.render(); }
    });
    el.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-act]');
      if (!button || button.disabled) return;
      const label = button.closest('[data-label]')?.dataset.label ?? S.pending.labelEdit?.label;
      switch (button.dataset.act) {
        case 'labels-refresh': reload(); break;
        case 'label-scope-project': S.pending.labelScope = 'project'; S.pending.labelEdit = null; reload(); break;
        case 'label-scope-all': S.pending.labelScope = 'all'; S.pending.labelEdit = null; reload(); break;
        case 'label-rename':
          S.pending.labelEdit = { label, mode: 'rename', value: label, ask: false };
          S.render();
          S.content?.querySelector('[data-label-to]')?.select();
          break;
        case 'label-delete': S.pending.labelEdit = { label, mode: 'delete' }; S.render(); break;
        case 'label-cancel': S.pending.labelEdit = null; S.render(); break;
        case 'label-rename-ask': S.pending.labelEdit = { ...S.pending.labelEdit, ask: true }; S.render(); S.content?.querySelector('[data-act="label-rename-do"]')?.focus(); break;
        case 'label-rename-do': {
          const ed = S.pending.labelEdit;
          const sc = scope();
          const from = ed.label;
          const to = normLabel(ed.value);
          S.pending.labelEdit = null;
          const out = await S.run(() => S.api.renameLabel(sc, from, to), { reload: false, ok: '' });
          if (!out || out === true) { reload(); return; }
          let last = out;
          S.ctx.history?.record({
            label: tr(out.merged ? 'op.labelMerge' : 'op.labelRename', { name: from, to: out.to }),
            undo: async () => {
              if (last.merged) await S.api.applyLabels(sc, [{ label: from, add: last.issueIds }, { label: last.to, remove: last.addedIds }]);
              else await S.api.renameLabel(sc, last.to, from);
              after();
            },
            redo: async () => { last = await S.api.renameLabel(sc, from, to); after(); },
          });
          S.say('success', tr(out.merged ? 'labels.merged' : 'labels.renamed', { name: from, to: out.to, n: out.count }));
          after();
          break;
        }
        case 'label-delete-do': {
          const sc = scope();
          S.pending.labelEdit = null;
          const out = await S.run(() => S.api.deleteLabel(sc, label), { reload: false, ok: '' });
          if (!out || out === true) { reload(); return; }
          let ids = out.issueIds;
          S.ctx.history?.record({
            label: tr('op.labelDelete', { name: label }),
            undo: async () => { await S.api.applyLabels(sc, [{ label, add: ids }]); after(); },
            redo: async () => { ids = (await S.api.deleteLabel(sc, label)).issueIds; after(); },
          });
          S.say('success', tr('labels.deleted', { name: label, n: out.count }));
          after();
          break;
        }
        default:
      }
    });
  },
};
