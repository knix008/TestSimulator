// Issue types, statuses, priorities, resolutions (global), components, versions/releases and the labels overview.
import {
  tr, esc, icon, btn, ibtn, select, input, colorInput, iconButton, card, note, empty, renderIconRef, items,
  userOptions, CATEGORY_ICON, LEVEL_ICON,
} from '../util.js';
import { table, addLine, bindTables, nameCell } from './collection.js';

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
        { head: tr('col.name'), width: 'minmax(130px, 1fr)', cell: nameCell(tr('col.name')) },
        { head: tr('col.description'), width: 'minmax(160px, 2fr)', cell: (r, e) => input('description', r.description, { disabled: !e, placeholder: tr('col.description') }) },
      ],
    })}
    ${addLine('resolutions', tr('resolutions.newName'), { disabled: !editable })}`;
  },
  bind(S, el) {
    bindTables(S, el, {
      resolutions: {
        find: find(() => S.config.resolutions), orderable: true, canEdit: S.isGlobalAdmin,
        create: (name) => ({ name }),
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
      ],
      emptyText: tr('components.none'),
    })}
    ${addLine('components', tr('components.newName'), { disabled: !S.canEdit })}`;
  },
  bind(S, el) {
    bindTables(S, el, { components: { find: find(() => S.config.components), create: (name) => ({ name, icon: 'b:folder' }) } });
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

// ───────────────────────── labels (overview)

export const labelsSection = {
  id: 'labels', glyph: 'tag', open: true,
  render(S) {
    const labels = S.pending.labels;
    if (!labels || labels.pid !== S.pid) {
      S.pending.labels = { pid: S.pid, items: null };
      S.api.get('/reports/breakdown', { projectId: S.pid, field: 'labels' })
        .then((out) => { S.pending.labels = { pid: S.pid, items: items(out) }; S.render(); })
        .catch((error) => { S.pending.labels = { pid: S.pid, items: [], error }; S.render(); });
      return `<div class="ps-loading">${icon('hourglass')}<span>${esc(tr('loading'))}</span></div>`;
    }
    if (!labels.items) return `<div class="ps-loading">${icon('hourglass')}<span>${esc(tr('loading'))}</span></div>`;
    const list = labels.items.filter((x) => x.key && x.key !== 'none');
    const max = Math.max(1, ...list.map((x) => Number(x.count) || 0));
    return `${labels.error ? note(tr('labels.failed'), 'warning') : ''}
      <div class="ps-label-cloud">${list.map((x) => `<span class="ps-label" style="--w:${Math.round((Number(x.count) / max) * 100)}%">${icon('tag')}<span>${esc(x.key)}</span><b>${Number(x.count)}</b></span>`).join('') || empty(tr('labels.none'), 'tag')}</div>
      ${note(tr('labels.hint'))}${btn('labels-refresh', tr('common.refresh'), 'refresh')}`;
  },
  bind(S, el) {
    el.addEventListener('click', (event) => { if (event.target.closest('[data-act="labels-refresh"]')) { S.pending.labels = null; S.render(); } });
  },
};
