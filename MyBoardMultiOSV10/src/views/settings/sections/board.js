// Board configuration (the open board, or another board of the project): columns (add, rename, reorder by
// drag, statuses mapped by dragging chips between columns, unmapped statuses, WIP min/max, backlog / done
// column), swimlanes (mode + query lanes), quick filters, card colours, card layout, estimation, the board
// filter, hiding done issues, working days, name and icon. The board view reads all of it from
// GET /boards/:id/data the next time it draws.
import { tr, esc, icon, btn, ibtn, select, input, checkbox, colorInput, iconButton, card, note, stepper, renderIconRef, CATEGORY_ICON } from '../util.js';
import { bindSteppers } from '../../../stepper.js';
import { table, bindTables, nameCell } from './collection.js';
import { jqlInput, bindJql } from './jql.js';
import { categoryOptions } from './lists.js';
import { sortable } from '../util.js';

const TABS = [['columns', 'columns'], ['swimlanes', 'menu'], ['quickfilters', 'filter'], ['cardcolors', 'palette'], ['layout', 'layout'], ['general', 'gear']];
const SWIMLANES = { none: 'clear', assignee: 'user', epic: 'layers', project: 'folder', queries: 'search', priority: 'sort', type: 'file' };
const CARD_COLORS = { none: 'clear', type: 'file', priority: 'sort', assignee: 'user', queries: 'search' };
export const CARD_FIELDS = ['priority', 'assignee', 'storyPoints', 'dueDate', 'startDate', 'labels', 'components', 'fixVersions', 'epic', 'originalEstimate', 'remainingEstimate'];
const CARD_FIELD_ICON = { priority: 'sort', assignee: 'user', storyPoints: 'percent', dueDate: 'calendar', startDate: 'calendar', labels: 'tag', components: 'container', fixVersions: 'calendar', epic: 'layers', originalEstimate: 'clock', remainingEstimate: 'hourglass' };
const DAYS = [1, 2, 3, 4, 5, 6, 0];

/** The same colour the core gives an assignee in 'assignee' card colour mode. */
export const userColor = (uid) => { if (!uid) return null; let h = 0; for (const ch of uid) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 55% 50%)`; };

const settingsOf = (S) => S.board?.settings ?? {};
const tabOf = (S) => (TABS.some(([id]) => id === S.pending.boardTab) ? S.pending.boardTab : 'columns');

export const boardSection = {
  id: 'board', glyph: 'columns',
  render(S) {
    const boards = S.config.boards ?? [];
    if (!S.board) return note(boards.length ? tr('board.loadFailed') : tr('board.none'), 'warning');
    const tab = tabOf(S);
    const picker = boards.length > 1 ? select('board-pick', S.board.id, boards.map((b) => ({ value: b.id, label: b.name, icon: 'columns' })), { title: tr('board.pick'), glyph: 'columns' }) : `<span class="ps-chip">${renderIconRef(S.board.icon, { size: 16 })}<span>${esc(S.board.name)}</span></span>`;
    const body = { columns: columnsTab, swimlanes: swimlanesTab, quickfilters: quickTab, cardcolors: colorsTab, layout: layoutTab, general: generalTab }[tab](S);
    return `<div class="ps-toolbar">${picker}<span class="grow"></span>${btn('open-board', tr('board.open'), 'columns')}</div>
      <div class="seg-toggle ps-tabs" role="tablist">${TABS.map(([id, glyph]) => `<button type="button" role="tab" data-board-tab="${id}" class="${id === tab ? 'active' : ''}" aria-selected="${id === tab}" title="${esc(tr(`board.tab.${id}`))}">${icon(glyph)}<span>${esc(tr(`board.tab.${id}`))}</span></button>`).join('')}</div>
      <div class="ps-tabbody" data-board-body="${tab}">${body}</div>`;
  },
  bind(S, el) {
    el.addEventListener('click', (event) => {
      const tabButton = event.target.closest('[data-board-tab]');
      if (tabButton) { S.pending.boardTab = tabButton.dataset.boardTab; S.render(); return; }
      const button = event.target.closest('[data-act="open-board"]');
      if (button) S.ctx.app?.setView?.('board');
    });
    el.addEventListener('change', (event) => {
      if (event.target.dataset.field === 'board-pick') { S.pending.boardId = event.target.value; S.data = { ...S.data, board: null }; S.refresh(); }
    });
    const tab = tabOf(S);
    bindJql(S, el);
    if (tab === 'columns') bindColumns(S, el);
    else if (tab === 'swimlanes') bindSwimlanes(S, el);
    else if (tab === 'quickfilters') bindQuick(S, el);
    else if (tab === 'cardcolors') bindColors(S, el);
    else bindSettings(S, el);
  },
};

/** PATCH /boards/:id { settings: { key: value } } — undo-able. */
function saveSettings(S, patch, label = tr('op.board', { name: S.board.name })) {
  const before = settingsOf(S);
  const values = {};
  for (const key of Object.keys(patch)) values[key] = before[key] ?? null;
  const url = S.url('board');
  return S.run(async () => {
    const row = await S.api.patch(url, { settings: patch, rev: S.board.rev });
    S.sawRev(url, row);
    const apply = async (settings) => { const rev = S.revs.get(url); const r = await S.api.patch(url, { settings, ...(rev != null ? { rev } : {}) }); S.sawRev(url, r); };
    S.ctx.history?.record({ label, undo: () => apply(values), redo: () => apply(patch) });
    return row;
  });
}

// ───────────────────────── columns

function columnsTab(S) {
  const columns = S.board.columns ?? [];
  const statuses = S.config.statuses;
  const byId = Object.fromEntries(statuses.map((s) => [s.id, s]));
  const mapped = new Set(columns.flatMap((c) => c.statusIds ?? []));
  const unmapped = statuses.filter((s) => !mapped.has(s.id));
  const backlog = settingsOf(S).backlog ?? {};
  const e = S.canEditBoard;
  const chip = (s) => `<span class="ps-status-chip cat-${esc(s.category)}" data-status-chip="${esc(s.id)}" draggable="${e}" tabindex="0" title="${esc(`${s.name} · ${tr(`category.${s.category}`)} — ${tr('board.chipHint')}`)}" style="--sc:${esc(s.color || '#888')}">${icon(CATEGORY_ICON[s.category] ?? 'flag')}<span>${esc(s.name)}</span></span>`;
  const col = (c) => {
    const ids = (c.statusIds ?? []).filter((id) => byId[id]);
    const isDone = ids.length > 0 && ids.every((id) => byId[id].category === 'done');
    const isBacklog = Boolean(backlog.enabled && ids.length && ids.every((id) => (backlog.statusIds ?? []).includes(id)));
    return `<div class="ps-col ${isBacklog ? 'backlog' : ''} ${isDone ? 'done' : ''}" data-id="${esc(c.id)}" data-col="${esc(c.id)}">
      <div class="ps-col-head"><span class="ps-grip" draggable="${e}" title="${esc(tr('board.dragColumn'))}" aria-label="${esc(tr('board.dragColumn'))}" tabindex="0">${icon('grip')}</span><button type="button" class="ps-iconpick ps-col-icon" data-act="col-icon" ${e ? '' : 'disabled'} title="${esc(tr('board.columnIcon'))}" aria-label="${esc(tr('board.columnIcon'))}">${renderIconRef(c.icon || 'b:circle', { size: 18 })}</button>${input('col-name', c.name, { disabled: !e, attrs: 'data-colfield="name"', placeholder: tr('col.name') })}${c.builtIn ? `<span class="icon-button ps-ibtn ps-col-lock" title="${esc(tr('board.builtInColumn'))}" aria-label="${esc(tr('board.builtInColumn'))}">${icon('lock')}</span>` : ibtn('col-delete', tr('board.deleteColumn'), 'trash', { cls: 'danger', disabled: !e })}</div>
      <div class="ps-col-badges">${isBacklog ? `<span class="ps-chip">${icon('list')}<span>${esc(tr('board.backlogColumn'))}</span></span>` : ''}${isDone ? `<span class="ps-chip ok">${icon('check')}<span>${esc(tr('board.doneColumn'))}</span></span>` : ''}${!ids.length ? `<span class="ps-chip warn">${icon('warning')}<span>${esc(tr('board.noStatuses'))}</span></span>` : ''}</div>
      <div class="ps-col-drop" data-drop="${esc(c.id)}" aria-label="${esc(tr('board.dropHere'))}">${ids.map((id) => chip(byId[id])).join('') || `<span class="ps-drop-hint">${esc(tr('board.dropHere'))}</span>`}</div>
      <div class="ps-col-wip">
        <div class="ps-wip-row"><span>${icon('chevronDown')}${esc(tr('board.wipMin'))}</span>${stepper(`wipMin:${c.id}`, c.wipMin ?? 0, { min: 0, max: 999, label: tr('board.wipMin'), disabled: !e })}</div>
        <div class="ps-wip-row"><span>${icon('chevronUp')}${esc(tr('board.wipMax'))}</span>${stepper(`wipMax:${c.id}`, c.wipMax ?? 0, { min: 0, max: 999, label: tr('board.wipMax'), disabled: !e })}</div>
      </div>
      <div class="ps-col-flags">${checkbox('col-backlog', isBacklog, tr('board.markBacklog'), { disabled: !e || !ids.length, attrs: 'data-colfield="backlog"' })}
        ${isDone ? `<span class="ps-hint">${esc(tr('board.doneHint'))}</span>` : btn('col-mark-done', tr('board.markDone'), 'check', { disabled: !e || !ids.length, cls: 'small' })}</div>
    </div>`;
  };
  return `${note(tr('board.columnsHint'))}
    <div class="ps-unmapped" data-drop="unmapped">
      <div class="ps-unmapped-head">${icon('warning')}<b>${esc(tr('board.unmapped'))}</b><small class="muted">${esc(tr('board.unmappedHint'))}</small></div>
      <div class="ps-unmapped-chips">${unmapped.map(chip).join('') || `<span class="ps-drop-hint">${esc(tr('board.allMapped'))}</span>`}</div>
      <div class="ps-add" data-add="statuses">${input('new-status', '', { placeholder: tr('statuses.newName'), attrs: 'data-new="status"', disabled: !S.canEdit })}${select('new-status-cat', 'todo', categoryOptions(), { disabled: !S.canEdit, title: tr('col.category'), glyph: 'flag' })}${btn('status-create', tr('board.addStatus'), 'plus', { disabled: !S.canEdit })}</div>
    </div>
    <div class="ps-columns" data-columns>${columns.map(col).join('')}</div>
    <div class="ps-add" data-add="columns">${input('new-column', '', { placeholder: tr('board.newColumn'), attrs: 'data-new="column"', disabled: !e })}${btn('col-add', tr('board.addColumn'), 'plus', { cls: 'primary', disabled: !e })}</div>
    ${note(tr('board.wipHint'))}`;
}

function bindColumns(S, el) {
  const columns = () => S.board.columns ?? [];
  const findC = (id) => columns().find((c) => c.id === id);
  const label = (c) => tr('op.column', { name: c?.name ?? '' });
  const wipTimers = {};
  bindSteppers(el, (key, value) => {
    const [field, id] = key.split(':');
    clearTimeout(wipTimers[key]);
    wipTimers[key] = setTimeout(() => { const c = findC(id); if (c) S.patch(label(c), S.url('columns', id), c, { [field]: value > 0 ? value : null }); }, 450);
  });
  el.addEventListener('change', (event) => {
    const target = event.target;
    const colEl = target.closest('[data-col]');
    if (!colEl || !target.dataset.colfield) return;
    const c = findC(colEl.dataset.col);
    if (target.dataset.colfield === 'name') {
      if (!target.value.trim()) { S.say('danger', tr('err.REQUIRED')); S.render(); return; }
      S.patch(label(c), S.url('columns', c.id), c, { name: target.value.trim() });
    } else if (target.dataset.colfield === 'backlog') {
      const backlog = settingsOf(S).backlog ?? { enabled: false, statusIds: [] };
      const ids = c.statusIds ?? [];
      const statusIds = target.checked ? [...new Set(ids)] : (backlog.statusIds ?? []).filter((id) => !ids.includes(id));
      saveSettings(S, { backlog: { enabled: statusIds.length > 0, statusIds } });
    }
  });
  el.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-act]');
    if (!button || button.disabled) return;
    const c = findC(button.closest('[data-col]')?.dataset.col);
    switch (button.dataset.act) {
      case 'col-add': {
        const name = el.querySelector('[data-new="column"]').value.trim();
        if (!name) { S.say('danger', tr('err.REQUIRED')); S.render(); return; }
        // a new column goes first (as on the board); the core gives it the default icon of its name
        await S.run(async () => {
          let made = await S.api.post(S.url('columns'), { name, statusIds: [] });
          made = made?.column ?? made;
          if (made?.id) await S.api.post(`${S.url('columns')}/order`, { ids: [made.id, ...columns().map((x) => x.id).filter((id) => id !== made.id)] });
          return made;
        }, { ok: tr('created', { name }) });
        break;
      }
      case 'col-icon': {
        const ref = await S.ctx.pickIcon?.(c.icon ?? '', { title: tr('board.columnIcon'), category: 'columns' });
        // '' = back to the default icon of the name (the core fills it; every column keeps an icon)
        if (ref != null) S.patch(tr('op.icon', { name: c.name }), S.url('columns', c.id), c, { icon: ref || null });
        break;
      }
      case 'col-delete':
        if (c.builtIn) break;
        {
          const choice = await S.ctx.app?.ask?.({ kind: 'delete', icon: 'trash', title: tr('board.deleteColumnTitle'), message: tr('board.deleteColumnMessage'), items: [c.name], buttons: [{ id: 'cancel', label: tr('board.cancel') }, { id: 'delete', label: tr('board.deleteColumn'), icon: 'trash', danger: true, primary: true }] });
          if (choice === 'delete') await S.run(() => S.api.del(S.url('columns', c.id)), { ok: tr('del.done') });
        }
        break;
      case 'col-mark-done':
        await S.run(async () => { for (const id of c.statusIds ?? []) { const s = S.config.statuses.find((x) => x.id === id); if (s && s.category !== 'done') await S.api.patch(S.url('statuses', id), { category: 'done', rev: s.rev }); } }, { ok: tr('board.markedDone', { name: c.name }) });
        break;
      case 'status-create': {
        const name = el.querySelector('[data-new="status"]').value.trim();
        const category = el.querySelector('[data-field="new-status-cat"]').value;
        if (!name) { S.say('danger', tr('err.REQUIRED')); S.render(); return; }
        await S.run(() => S.api.post(S.url('statuses'), { name, category, color: { todo: '#6b7685', inprogress: '#1c7ed6', done: '#2b8a3e' }[category] }), { ok: tr('created', { name }) });
        break;
      }
      default:
    }
  });
  // status chips: drag between columns and the unmapped area; ← / → on a focused chip moves it one column
  let dragging = null;
  const moveStatus = (statusId, target) => {
    const from = columns().find((col) => (col.statusIds ?? []).includes(statusId));
    if (target === 'unmapped') {
      if (!from) return null;
      return S.patch(tr('op.mapStatus'), S.url('columns', from.id), from, { statusIds: from.statusIds.filter((id) => id !== statusId) });
    }
    const to = findC(target);
    if (!to || to.id === from?.id) return null;
    const run = async () => {
      const row = await S.api.patch(S.url('columns', to.id), { statusIds: [...(to.statusIds ?? []), statusId], rev: to.rev });
      const undoCol = from;
      S.ctx.history?.record({
        label: tr('op.mapStatus'),
        undo: async () => {
          if (undoCol) await S.api.patch(S.url('columns', undoCol.id), { statusIds: undoCol.statusIds });
          else await S.api.patch(S.url('columns', to.id), { statusIds: to.statusIds ?? [] });
        },
        redo: () => S.api.patch(S.url('columns', to.id), { statusIds: [...(to.statusIds ?? []), statusId] }),
      });
      return row;
    };
    return S.run(run);
  };
  S.moveStatus = moveStatus;
  el.addEventListener('dragstart', (event) => {
    const chipEl = event.target.closest?.('[data-status-chip]');
    if (!chipEl || !S.canEditBoard) return;
    dragging = chipEl.dataset.statusChip;
    chipEl.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    try { event.dataTransfer.setData('text/x-ps-status', dragging); } catch { /* synthetic */ }
  });
  el.addEventListener('dragover', (event) => {
    if (!dragging) return;
    const zone = event.target.closest?.('[data-drop]');
    if (!zone) return;
    event.preventDefault();
    for (const z of el.querySelectorAll('[data-drop].over')) if (z !== zone) z.classList.remove('over');
    zone.classList.add('over');
  });
  el.addEventListener('dragleave', (event) => { const zone = event.target.closest?.('[data-drop]'); if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('over'); });
  el.addEventListener('drop', (event) => {
    if (!dragging) return;
    const zone = event.target.closest?.('[data-drop]');
    if (!zone) return;
    event.preventDefault();
    const id = dragging;
    dragging = null;
    moveStatus(id, zone.dataset.drop);
  });
  el.addEventListener('dragend', () => { dragging = null; for (const z of el.querySelectorAll('.over, .dragging')) z.classList.remove('over', 'dragging'); });
  el.addEventListener('keydown', (event) => {
    const chipEl = event.target.closest?.('[data-status-chip]');
    if (!chipEl || !S.canEditBoard || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    const order = ['unmapped', ...columns().map((c) => c.id)];
    const here = chipEl.closest('[data-drop]')?.dataset.drop ?? 'unmapped';
    const next = order[order.indexOf(here) + (event.key === 'ArrowRight' ? 1 : -1)];
    if (next) moveStatus(chipEl.dataset.statusChip, next);
  });
  sortable(el.querySelector('[data-columns]'), (ids) => S.run(() => S.api.post(`${S.url('columns')}/order`, { ids })), { rowSelector: '.ps-col', disabled: !S.canEditBoard });
}

// ───────────────────────── swimlanes, quick filters

const modeSelect = (name, value, modes, prefix, disabled) => select(name, value, Object.entries(modes).map(([id, glyph]) => ({ value: id, label: tr(`${prefix}.${id}`), icon: glyph })), { disabled, title: tr(`${prefix}.title`), glyph: 'menu' });

function swimlanesTab(S) {
  const mode = settingsOf(S).swimlanes ?? 'none';
  const e = S.canEditBoard;
  return `<div class="ps-form">${`<div class="ps-row"><div class="ps-row-label">${icon('menu')}<span>${esc(tr('lane.title'))}</span></div><div class="ps-row-control">${modeSelect('lane-mode', mode, SWIMLANES, 'lane', !e)}<div class="ps-hint">${esc(tr(`lane.${mode}Hint`))}</div></div></div>`}</div>
    ${mode === 'queries' ? `${table(S, {
      kind: 'swimlanes', rows: S.board.swimlanes ?? [], order: true, editable: e,
      cols: [
        { head: tr('col.name'), width: 'minmax(110px, 0.8fr)', cell: nameCell(tr('col.name')) },
        { head: 'JQL', width: 'minmax(200px, 2fr)', cell: (x, ed) => jqlInput('jql', x.jql, { disabled: !ed }) },
      ],
      emptyText: tr('lane.empty'),
    })}
    <div class="ps-add" data-add="swimlanes">${input('new-name', '', { placeholder: tr('lane.newName'), attrs: 'data-new="name"', disabled: !e })}${jqlInput('new-jql', '', { attrs: 'data-new="jql"', disabled: !e })}${btn('add', tr('common.add'), 'plus', { cls: 'primary', disabled: !e, attrs: 'data-kind="swimlanes"' })}</div>
    ${note(tr('lane.queriesHint'))}` : ''}`;
}

function bindSwimlanes(S, el) {
  el.addEventListener('change', (event) => { if (event.target.dataset.field === 'lane-mode') saveSettings(S, { swimlanes: event.target.value }); });
  bindTables(S, el, {
    swimlanes: {
      find: (id) => S.board.swimlanes.find((x) => x.id === id), orderable: true, canEdit: S.canEditBoard,
      create: (name, form) => ({ name, jql: form.querySelector('[data-new="jql"]').value.trim() }),
    },
  });
}

function quickTab(S) {
  const e = S.canEditBoard;
  return `${table(S, {
    kind: 'quickfilters', rows: S.board.quickFilters ?? [], order: true, editable: e,
    cols: [
      { head: tr('col.icon'), width: '44px', cell: (x, ed) => iconButton('icon', x.icon, { disabled: !ed }) },
      { head: tr('col.name'), width: 'minmax(110px, 0.8fr)', cell: nameCell(tr('col.name')) },
      { head: 'JQL', width: 'minmax(200px, 2fr)', cell: (x, ed) => jqlInput('jql', x.jql, { disabled: !ed }) },
    ],
    emptyText: tr('quick.none'),
  })}
  <div class="ps-add" data-add="quickfilters">${input('new-name', '', { placeholder: tr('quick.newName'), attrs: 'data-new="name"', disabled: !e })}${jqlInput('new-jql', '', { attrs: 'data-new="jql"', disabled: !e, placeholder: tr('quick.jqlPlaceholder') })}${btn('add', tr('common.add'), 'plus', { cls: 'primary', disabled: !e, attrs: 'data-kind="quickfilters"' })}</div>
  ${note(tr('quick.hint'))}`;
}

function bindQuick(S, el) {
  bindTables(S, el, {
    quickfilters: {
      find: (id) => S.board.quickFilters.find((x) => x.id === id), orderable: true, canEdit: S.canEditBoard,
      create: (name, form) => ({ name, jql: form.querySelector('[data-new="jql"]').value.trim(), icon: 'b:filter' }),
    },
  });
}

// ───────────────────────── card colours

function colorsTab(S) {
  const mode = settingsOf(S).cardColors ?? 'none';
  const e = S.canEditBoard;
  let body = '';
  if (mode === 'type') {
    body = table(S, { kind: 'types', rows: S.config.types, deletable: false, editable: S.canEdit, cols: [
      { head: tr('col.icon'), width: '44px', cell: (t) => renderIconRef(t.icon, { size: 18 }) },
      { head: tr('col.name'), width: 'minmax(120px, 1fr)', cell: (t) => `<span>${esc(t.name)}</span>` },
      { head: tr('col.color'), width: '52px', cell: (t, ed) => colorInput('color', t.color, { disabled: !ed }) },
      { head: '', width: 'minmax(80px, 1fr)', cell: (t) => `<span class="ps-card-sample" style="--cc:${esc(t.color || '#888')}">${esc(tr('colors.sample'))}</span>` },
    ] });
  } else if (mode === 'priority') {
    body = `${S.isGlobalAdmin ? '' : note(tr('global.adminOnly'), 'warning')}${table(S, { kind: 'priorities', rows: S.config.priorities, deletable: false, editable: S.isGlobalAdmin, cols: [
      { head: tr('col.icon'), width: '44px', cell: (p) => renderIconRef(p.icon, { size: 18 }) },
      { head: tr('col.name'), width: 'minmax(120px, 1fr)', cell: (p) => `<span>${esc(p.name)}</span>` },
      { head: tr('col.color'), width: '52px', cell: (p, ed) => colorInput('color', p.color, { disabled: !ed }) },
      { head: '', width: 'minmax(80px, 1fr)', cell: (p) => `<span class="ps-card-sample" style="--cc:${esc(p.color || '#888')}">${esc(tr('colors.sample'))}</span>` },
    ] })}`;
  } else if (mode === 'assignee') {
    body = `${note(tr('colors.assigneeHint'))}<div class="ps-people">${S.people.map((u) => `<span class="ps-chip"><i class="ps-dot" style="background:${userColor(u.id)}"></i>${renderIconRef(u.avatar, { size: 16, fallback: `l:${(u.displayName ?? '?').slice(0, 2)}#5b6ee1` })}<span>${esc(u.displayName)}</span></span>`).join('')}</div>`;
  } else if (mode === 'queries') {
    body = `${table(S, { kind: 'cardcolors', rows: S.board.cardColors ?? [], order: true, editable: e, cols: [
      { head: tr('col.color'), width: '52px', cell: (x, ed) => colorInput('color', x.color, { disabled: !ed }) },
      { head: 'JQL', width: 'minmax(200px, 2fr)', cell: (x, ed) => jqlInput('jql', x.jql, { disabled: !ed }) },
      { head: '', width: 'minmax(80px, 0.6fr)', cell: (x) => `<span class="ps-card-sample" style="--cc:${esc(x.color || '#888')}">${esc(tr('colors.sample'))}</span>` },
    ], emptyText: tr('colors.none') })}
    <div class="ps-add" data-add="cardcolors">${colorInput('new-color', '#e8590c', { disabled: !e })}${jqlInput('new-jql', '', { attrs: 'data-new="jql"', disabled: !e, placeholder: tr('colors.jqlPlaceholder') })}${btn('add', tr('common.add'), 'plus', { cls: 'primary', disabled: !e, attrs: 'data-kind="cardcolors"' })}</div>`;
  } else body = note(tr('colors.noneHint'));
  return `<div class="ps-form"><div class="ps-row"><div class="ps-row-label">${icon('palette')}<span>${esc(tr('cc.title'))}</span></div><div class="ps-row-control">${modeSelect('cc-mode', mode, CARD_COLORS, 'cc', !e)}</div></div></div>${body}`;
}

function bindColors(S, el) {
  el.addEventListener('change', (event) => { if (event.target.dataset.field === 'cc-mode') saveSettings(S, { cardColors: event.target.value }); });
  bindTables(S, el, {
    types: { find: (id) => S.config.types.find((x) => x.id === id) },
    priorities: { find: (id) => S.config.priorities.find((x) => x.id === id) },
    cardcolors: {
      find: (id) => S.board.cardColors.find((x) => x.id === id), orderable: true, canEdit: S.canEditBoard, noName: true,
      create: (name, form) => {
        const jql = form.querySelector('[data-new="jql"]').value.trim();
        if (!jql) { S.say('danger', tr('err.REQUIRED')); S.render(); return null; }
        return { jql, color: form.querySelector('[data-field="new-color"]').value };
      },
    },
  });
}

// ───────────────────────── card layout and general settings

function layoutTab(S) {
  const s = settingsOf(S);
  const e = S.canEditBoard;
  const chosen = s.cardFields ?? [];
  const all = [...CARD_FIELDS.map((f) => ({ id: f, name: tr(`cardField.${f}`), glyph: CARD_FIELD_ICON[f] })), ...S.config.fields.map((f) => ({ id: `custom:${f.id}`, name: f.name, glyph: 'field' }))];
  const full = chosen.length >= 3;
  return `<div class="ps-form">
    <div class="ps-row"><div class="ps-row-label">${icon('layout')}<span>${esc(tr('layout.fields'))}</span></div><div class="ps-row-control">
      <div class="ps-chosen">${chosen.map((id, i) => `<span class="ps-chip ok">${icon(all.find((f) => f.id === id)?.glyph ?? 'field')}<span>${i + 1}. ${esc(all.find((f) => f.id === id)?.name ?? id)}</span></span>`).join('') || `<span class="muted">${esc(tr('common.none'))}</span>`}</div>
      <div class="ps-checkgrid">${all.map((f) => `<label class="ps-check ${!chosen.includes(f.id) && full ? 'off' : ''}" title="${esc(f.name)}"><input type="checkbox" data-cardfield="${esc(f.id)}" ${chosen.includes(f.id) ? 'checked' : ''} ${!e || (!chosen.includes(f.id) && full) ? 'disabled' : ''} />${icon(f.glyph)}<span>${esc(f.name)}</span></label>`).join('')}</div>
      <div class="ps-hint">${esc(tr('layout.fieldsHint'))}</div></div></div>
    <div class="ps-row"><div class="ps-row-label">${icon('percent')}<span>${esc(tr('layout.estimation'))}</span></div><div class="ps-row-control">${select('set-estimation', s.estimation ?? 'storyPoints', ['storyPoints', 'originalEstimate', 'count'].map((v) => ({ value: v, label: tr(`est.${v}`), icon: { storyPoints: 'percent', originalEstimate: 'clock', count: 'list' }[v] })), { disabled: !e, attrs: 'data-setting="estimation"', title: tr('layout.estimation'), glyph: 'percent' })}</div></div>
    <div class="ps-row"><div class="ps-row-label">${icon('clock')}<span>${esc(tr('layout.daysInColumn'))}</span></div><div class="ps-row-control">${checkbox('set-days', s.daysInColumn === true || (s.cardFields ?? []).includes('daysInColumn'), tr('layout.daysInColumnText'), { disabled: !e, attrs: 'data-setting="daysInColumn"' })}</div></div>
    <div class="ps-row"><div class="ps-row-label">${icon('list')}<span>${esc(tr('layout.subtasks'))}</span></div><div class="ps-row-control">${select('set-subtasks', s.subtasks ?? 'cards', [{ value: 'cards', label: tr('layout.subtasksCards'), icon: 'list' }, { value: 'parent', label: tr('layout.subtasksParent'), icon: 'file' }], { disabled: !e, attrs: 'data-setting="subtasks"', title: tr('layout.subtasks'), glyph: 'list' })}</div></div>
    <div class="ps-row"><div class="ps-row-label">${icon('warning')}<span>${esc(tr('layout.constraint'))}</span></div><div class="ps-row-control">${select('set-constraint', s.columnConstraint ?? 'issueCount', [{ value: 'issueCount', label: tr('layout.constraintCount'), icon: 'list' }, { value: 'none', label: tr('layout.constraintNone'), icon: 'clear' }], { disabled: !e, attrs: 'data-setting="columnConstraint"', title: tr('layout.constraint'), glyph: 'warning' })}</div></div>
  </div>`;
}

function generalTab(S) {
  const s = settingsOf(S);
  const b = S.board;
  const e = S.canEditBoard;
  const hide = s.doneHideDays;
  const days = s.workingDays ?? [1, 2, 3, 4, 5];
  return `<div class="ps-form">
    <div class="ps-row"><div class="ps-row-label">${icon('edit')}<span>${esc(tr('board.name'))}</span></div><div class="ps-row-control">${input('board-name', b.name, { disabled: !e, attrs: 'data-bfield="name"' })}</div></div>
    <div class="ps-row"><div class="ps-row-label">${icon('iconInsert')}<span>${esc(tr('board.icon'))}</span></div><div class="ps-row-control"><div class="ps-iconrow"><button type="button" class="ps-iconpick big" data-act="board-icon" ${e ? '' : 'disabled'} title="${esc(tr('common.changeIcon'))}" aria-label="${esc(tr('common.changeIcon'))}">${renderIconRef(b.icon, { size: 28, fallback: 'b:layers' })}</button>${btn('board-icon', tr('common.changeIcon'), 'iconInsert', { disabled: !e })}</div></div></div>
    <div class="ps-row"><div class="ps-row-label">${icon('filter')}<span>${esc(tr('board.filter'))}</span></div><div class="ps-row-control">${jqlInput('board-filter', b.filterJql ?? '', { disabled: !e, attrs: 'data-bfield="filterJql"', placeholder: tr('board.filterPlaceholder') })}<div class="ps-hint">${esc(tr(b.projectId ? 'board.filterHint' : 'board.filterHintCross'))}</div></div></div>
    <div class="ps-row"><div class="ps-row-label">${icon('eyeOff')}<span>${esc(tr('board.hideDone'))}</span></div><div class="ps-row-control"><div class="ps-inline">${stepper('doneHideDays', hide ?? 14, { min: 0, max: 365, unit: tr('unit.days'), label: tr('board.hideDone'), disabled: !e || hide == null })}${checkbox('set-showall', hide == null, tr('board.showAllDone'), { disabled: !e, attrs: 'data-showall' })}</div><div class="ps-hint">${esc(tr('board.hideDoneHint'))}</div></div></div>
    <div class="ps-row"><div class="ps-row-label">${icon('calendar')}<span>${esc(tr('board.workingDays'))}</span></div><div class="ps-row-control"><div class="ps-days">${DAYS.map((d) => `<label class="ps-day ${days.includes(d) ? 'on' : ''}" title="${esc(tr(`day.${d}`))}"><input type="checkbox" data-day="${d}" ${days.includes(d) ? 'checked' : ''} ${e ? '' : 'disabled'} /><span>${esc(tr(`day.${d}`))}</span></label>`).join('')}</div><div class="ps-hint">${esc(tr('board.workingDaysHint'))}</div></div></div>
  </div>`;
}

function bindSettings(S, el) {
  const b = S.board;
  bindSteppers(el, (key, value) => {
    if (key !== 'doneHideDays') return;
    clearTimeout(S.hideTimer);
    S.hideTimer = setTimeout(() => saveSettings(S, { doneHideDays: value }), 450);
  });
  el.addEventListener('change', (event) => {
    const target = event.target;
    if (target.dataset.cardfield) {
      const chosen = [...(settingsOf(S).cardFields ?? [])];
      const id = target.dataset.cardfield;
      const next = target.checked ? [...chosen.filter((x) => x !== id), id].slice(0, 3) : chosen.filter((x) => x !== id);
      saveSettings(S, { cardFields: next });
    } else if (target.dataset.setting === 'daysInColumn') {
      saveSettings(S, { daysInColumn: target.checked, cardFields: (settingsOf(S).cardFields ?? []).filter((x) => x !== 'daysInColumn') });
    } else if (target.dataset.setting) {
      saveSettings(S, { [target.dataset.setting]: target.type === 'checkbox' ? target.checked : target.value });
    } else if (target.dataset.showall != null) {
      saveSettings(S, { doneHideDays: target.checked ? null : 14 });
    } else if (target.dataset.day != null) {
      const days = [...el.querySelectorAll('[data-day]')].filter((x) => x.checked).map((x) => Number(x.dataset.day)).sort((x, y) => x - y);
      saveSettings(S, { workingDays: days });
    } else if (target.dataset.bfield) {
      const field = target.dataset.bfield;
      const value = target.value.trim();
      if (field === 'name' && !value) { S.say('danger', tr('err.REQUIRED')); S.render(); return; }
      if (field === 'filterJql' && !b.projectId && !value) { S.say('danger', tr('err.REQUIRED')); S.render(); return; }
      S.patch(tr('op.board', { name: b.name }), S.url('board'), b, { [field]: value || (field === 'filterJql' ? null : value) }, { after: (row) => { if (row) S.syncShell({ board: row }); } });
    }
  });
  el.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-act="board-icon"]');
    if (!button || button.disabled) return;
    const ref = await S.ctx.pickIcon?.(b.icon ?? '');
    if (ref != null) S.patch(tr('op.icon', { name: b.name }), S.url('board'), b, { icon: ref }, { after: (row) => { if (row) S.syncShell({ board: row }); } });
  });
}
