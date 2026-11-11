// Context menus of the board (the shell's menu popup: ctx.app.showMenu). A card's menu acts on that card,
// or on every selected card when it is part of a selection of several.
import * as native from '../../platform/native.js';
import { errorMessage } from '../shared/index.js';
import { laneOf } from './model.js';

const anchorOf = (view, x, y) => view.ctx.app?.anchorAt?.(x, y) ?? { x: window.screenX + x, y: window.screenY + y, flipY: window.screenY + y };

function show(view, items, x, y, header, handlers) {
  const app = view.ctx.app;
  if (!app?.showMenu) return undefined;
  return app.showMenu(items, anchorOf(view, x, y), 'context', { handlers, header });
}

export function openCardMenu(view, ids, x, y) {
  const t = view.t;
  const cards = ids.map((id) => view.card(id)).filter(Boolean);
  if (!cards.length) return undefined;
  const one = cards.length === 1 ? cards[0] : null;
  const L = view.L;
  const demo = view.demo;
  const handlers = {};
  const item = (id, label, glyph, run, extra = {}) => { handlers[`custom:${id}`] = run; return { id: `custom:${id}`, label, icon: glyph, ...extra }; };
  const sub = (id, label, glyph, children, extra = {}) => ({ id: `submenu:board-${id}`, label, icon: glyph, submenu: true, children, disabled: !children.length, ...extra });
  const columns = view.layout?.columns ?? [];
  const moveItems = columns.map((c) => item(`move:${c.id}`, c.name, c.done ? 'check' : c.backlog ? 'list' : 'columns', () => view.moveToColumn(ids, c.id), { checked: cards.every((card) => card.columnId === c.id), disabled: cards.every((card) => card.columnId === c.id) }));
  if (one) {
    const key = view.cellKeyOf(one.id);
    const list = view.layout?.cells.get(key) ?? [];
    const lane = laneOf(one, view.mode);
    moveItems.push({ separator: true });
    moveItems.push(item('top', t('board.menu.moveTop'), 'arrowStart', () => view.moveCards([one.id], { laneId: lane, columnId: one.columnId, index: 0 }), { disabled: list[0]?.id === one.id }));
    moveItems.push(item('bottom', t('board.menu.moveBottom'), 'arrowEnd', () => view.moveCards([one.id], { laneId: lane, columnId: one.columnId, index: list.length }), { disabled: list.at(-1)?.id === one.id }));
  }
  const users = [...(L?.users.values() ?? [])].filter((u) => u.active !== false);
  const assignItems = users.slice(0, 30).map((u) => item(`assign:${u.id}`, u.displayName ?? u.username, 'user', () => view.patchCards(ids, { assigneeId: u.id }, 'assign'), { checked: cards.every((c) => c.assigneeId === u.id) }));
  const priorityItems = [...(L?.priorities.values() ?? [])].map((p) => item(`priority:${p.id}`, p.name, 'flag', () => view.patchCards(ids, { priorityId: p.id }, 'priority'), { checked: cards.every((c) => c.priorityId === p.id) }));
  const flagged = cards.every((c) => c.flagged);
  const items = [];
  if (one) items.push(item('open', t('board.menu.open'), 'notes', () => view.ctx.openIssue(one.id), { shortcut: 'Enter' }), { separator: true });
  items.push(sub('move', t('board.menu.moveTo'), 'columns', moveItems));
  if (!demo) {
    items.push(item('assignMe', t('board.menu.assignMe'), 'user', () => view.patchCards(ids, { assigneeId: view.me }, 'assign'), { disabled: !view.me || cards.every((c) => c.assigneeId === view.me) }));
    items.push(sub('assign', t('board.menu.assignTo'), 'user', [item('unassign', t('board.menu.unassign'), 'close', () => view.patchCards(ids, { assigneeId: null }, 'assign'), { disabled: cards.every((c) => !c.assigneeId) }), ...(assignItems.length ? [{ separator: true }, ...assignItems] : [])]));
  }
  items.push(item('flag', t(flagged ? 'board.menu.unflag' : 'board.menu.flag'), 'flag', () => view.patchCards(ids, { flagged: !flagged }, 'flag')));
  items.push(sub('priority', t('board.menu.priority'), 'flag', priorityItems));
  if (one) {
    const types = [...(L?.types.values() ?? [])].filter((x) => x.projectId == null || x.projectId === one.projectId).filter((x) => (x.level ?? 0) === (L.type(one.typeId)?.level ?? 0));
    items.push(sub('type', t('board.menu.type'), 'layers', types.map((x) => item(`type:${x.id}`, x.name, 'layers', () => view.patchCards([one.id], { typeId: x.id }, 'type'), { checked: one.typeId === x.id }))));
    items.push({ separator: true });
    items.push(item('icon', t('board.menu.icon'), 'iconInsert', async () => { const ref = await view.ctx.pickIcon(one.icon ?? ''); if (ref != null) view.patchCards([one.id], { icon: ref || null }, 'icon'); }));
    items.push(sub('cover', t('board.menu.cover'), 'picture', [
      item('coverColor', t('board.menu.coverColor'), 'palette', async () => {
        const result = await view.ctx.popups.open('color', { current: one.cover?.color ?? '', allowNone: true, key: 'cover' }, { anchor: anchorOf(view, x, y) });
        if (!result || result.color == null) return;
        view.patchCards([one.id], { cover: result.color && result.color !== 'none' ? { color: result.color } : null }, 'cover');
      }),
      item('coverNone', t('board.menu.coverNone'), 'close', () => view.patchCards([one.id], { cover: null }, 'cover'), { disabled: !one.cover }),
    ]));
    items.push(item('cardColor', t('board.menu.cardColor'), 'fillColor', async () => {
      const result = await view.ctx.popups.open('color', { current: one.color ?? '', allowNone: true, key: 'card' }, { anchor: anchorOf(view, x, y) });
      if (!result || result.color == null) return;
      view.patchCards([one.id], { color: result.color && result.color !== 'none' ? result.color : null }, 'color');
    }));
    items.push({ separator: true });
    items.push(item('copyKey', t('board.menu.copyKey'), 'copy', () => copy(view, one.key)));
    items.push(item('copyLink', t('board.menu.copyLink'), 'hyperlink', () => copy(view, issueLink(one.key))));
    if (!demo) items.push(item('clone', t('board.menu.clone'), 'duplicate', () => cloneCard(view, one)));
  }
  if (!demo) items.push({ separator: true }, item('delete', t('board.menu.delete'), 'trash', () => view.deleteCards(ids), { danger: true, shortcut: 'Del' }));
  const header = { icon: 'columns', title: one ? t('board.menu.title', { key: one.key }) : t('board.menu.titleMany', { n: cards.length }) };
  return show(view, items, x, y, header, handlers);
}

/** The board's own menu (empty space): create, filters, lanes, read again. */
export function openBoardMenu(view, x, y) {
  const t = view.t;
  const handlers = {};
  const item = (id, label, glyph, run, extra = {}) => { handlers[`custom:${id}`] = run; return { id: `custom:${id}`, label, icon: glyph, ...extra }; };
  const lanes = view.layout?.lanes.length ?? 0;
  const items = [
    item('create', t('action.createIssue'), 'plus', () => view.createIssue(), { shortcut: 'C', disabled: view.demo }),
    item('find', t('board.search'), 'search', () => view.focusSearch(), { shortcut: 'Ctrl+F' }),
    { separator: true },
    item('clear', t('board.clearFilters'), 'filterClear', () => view.clearFilters(), { disabled: !view.filtersActive() }),
    item('collapse', t('board.lanes.collapseAll'), 'chevronUp', () => view.setAllLanes(true), { disabled: lanes < 2 }),
    item('expand', t('board.lanes.expandAll'), 'chevronDown', () => view.setAllLanes(false), { disabled: lanes < 2 }),
    { separator: true },
    item('reload', t('board.retry'), 'refresh', () => view.load({ quiet: true }), { shortcut: 'F5', disabled: view.demo }),
  ];
  return show(view, items, x, y, { icon: 'columns', title: view.ctx.workspace?.board?.name ?? 'MyBoard' }, handlers);
}

/** A link to an issue: the web address with #issue=<key> (the desktop app: the same text). */
export function issueLink(key) {
  const loc = globalThis.location;
  const base = loc && /^https?:/.test(loc.protocol) ? `${loc.origin}${loc.pathname}` : 'myboard://';
  return `${base}#issue=${encodeURIComponent(key)}`;
}

async function copy(view, text) {
  try {
    await native.clipboardWrite(text);
    view.ctx.notify('success', view.t('board.copied', { text }));
  } catch (error) {
    view.ctx.notify('error', errorMessage(error, view.t));
  }
}

async function cloneCard(view, card) {
  const t = view.t;
  try {
    let clone = await view.api.post(`/issues/${encodeURIComponent(card.id)}/clone`, {});
    clone = clone?.issue ?? clone;
    let current = clone;
    view.ctx.notify('success', t('board.cloned', { key: card.key, newKey: clone?.key ?? '' }));
    view.ctx.history.record({
      label: t('board.op.clone', { key: card.key }),
      undo: async () => { if (current?.id) await view.api.deleteIssue(current.id); },
      redo: async () => { const again = await view.api.post(`/issues/${encodeURIComponent(card.id)}/clone`, {}); current = again?.issue ?? again; },
    });
    view.scheduleRefetch(0);
  } catch (error) {
    view.ctx.notify('error', `${t('board.updateFailed')}: ${errorMessage(error, t)}`);
  }
}
