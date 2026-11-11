// Board columns on the board itself: the icon, rename/edit, and reordering (drag a header, the header menu,
// Ctrl+Shift+←/→ on a focused header). Only users who may configure the board (canAddColumn) change columns.
// Every change is optimistic (the board redraws at once, a failure puts it back), undoable (ctx.history) and
// announced to the other views of this window (window 'myboard:event' board.updated).
import { errorMessage } from '../shared/index.js';
import { canAddColumn, openAddColumn } from './addcolumn.js';

const anchorOf = (view, x, y) => view.ctx.app?.anchorAt?.(x, y) ?? { x: window.screenX + x, y: window.screenY + y, flipY: window.screenY + y };
const columnsUrl = (view) => `/boards/${encodeURIComponent(view.boardId)}/columns`;

function announce(view) {
  try { window.dispatchEvent(new CustomEvent('myboard:event', { detail: { type: 'board.updated', id: view.boardId, local: true } })); } catch { /* no window */ }
}

const column = (view, id) => (view.data?.columns ?? []).find((c) => c.id === id) ?? null;

/** Visible columns in board order (the hidden backlog column is not one). */
const visible = (view) => view.layout?.columns ?? view.data?.columns ?? [];

// ───────────────────────── order

/** Sends an order and redraws at once; a refused order puts the board back. → true when saved */
async function applyOrder(view, ids) {
  const before = [...(view.data.columns ?? [])];
  const byId = new Map(before.map((c) => [c.id, c]));
  view.data.columns = ids.map((id) => byId.get(id)).filter(Boolean).map((c, i) => ({ ...c, position: i }));
  view.render();
  try {
    await view.api.post(`${columnsUrl(view)}/order`, { ids });
    announce(view);
    return true;
  } catch (error) {
    view.data.columns = before;
    view.render();
    view.ctx.notify('error', `${view.t('board.columnMove.failed')}: ${errorMessage(error, view.t)}`);
    return false;
  }
}

/** The whole order (backlog column included) with `id` placed before `beforeId` (null = at the end). */
export function orderWith(ids, id, beforeId) {
  const rest = ids.filter((x) => x !== id);
  const at = beforeId == null ? rest.length : rest.indexOf(beforeId);
  rest.splice(at < 0 ? rest.length : at, 0, id);
  return rest;
}

/** Moves a column: where = 'left' | 'right' | 'first' | 'last' | { before: id | null }. */
export async function moveColumn(view, id, where) {
  const t = view.t;
  if (!canAddColumn(view)) { view.ctx.notify('info', t(view.demo ? 'board.demo' : 'board.addColumn.denied')); return false; }
  const all = (view.data?.columns ?? []).map((c) => c.id);
  const shown = visible(view).map((c) => c.id);
  const i = shown.indexOf(id);
  if (i < 0) return false;
  let before;
  if (where === 'left') { if (i === 0) return false; before = shown[i - 1]; }
  else if (where === 'right') { if (i === shown.length - 1) return false; before = shown[i + 2] ?? null; }
  else if (where === 'first') { if (i === 0) return false; before = shown[0]; }
  else if (where === 'last') { if (i === shown.length - 1) return false; before = null; }
  else before = where?.before ?? null;
  // "before null" with a hidden column after the last shown one keeps that one last
  const next = orderWith(all, id, before);
  if (next.join() === all.join()) return false;
  const c = column(view, id);
  if (!(await applyOrder(view, next))) return false;
  view.ctx.history?.record({
    label: t('board.columnMove.op', { name: c?.name ?? '' }),
    undo: async () => { await view.api.post(`${columnsUrl(view)}/order`, { ids: all }); announce(view); await view.load({ quiet: true }); },
    redo: async () => { await view.api.post(`${columnsUrl(view)}/order`, { ids: next }); announce(view); await view.load({ quiet: true }); },
  });
  focusHead(view, id);
  return true;
}

function focusHead(view, id) {
  requestAnimationFrame(() => view.boardEl?.querySelector(`.bv-col-head[data-col="${CSS.escape(id)}"]`)?.focus({ preventScroll: false }));
}

// ───────────────────────── icon and name

async function patchColumn(view, id, patch, label) {
  const c = column(view, id);
  if (!c) return false;
  const old = { name: c.name, icon: c.icon ?? null };
  const keys = Object.keys(patch);
  const back = Object.fromEntries(keys.map((k) => [k, old[k]]));
  if (keys.every((k) => (patch[k] ?? null) === (old[k] ?? null))) return false;
  const send = async (body) => { await view.api.patch(`${columnsUrl(view)}/${encodeURIComponent(id)}`, body); announce(view); };
  Object.assign(c, patch);
  view.render();
  try {
    const saved = await view.api.patch(`${columnsUrl(view)}/${encodeURIComponent(id)}`, patch);
    const row = saved?.column ?? saved;
    if (row?.icon) c.icon = row.icon;
    if (row?.rev != null) c.rev = row.rev;
    view.render();
    announce(view);
  } catch (error) {
    Object.assign(c, back);
    view.render();
    view.ctx.notify('error', `${view.t('board.updateFailed')}: ${errorMessage(error, view.t)}`);
    return false;
  }
  view.ctx.history?.record({
    label,
    undo: async () => { await send(back); await view.load({ quiet: true }); },
    redo: async () => { await send(patch); await view.load({ quiet: true }); },
  });
  return true;
}

/** The icon picker on the column icon category → the column's icon (undoable). */
export async function changeColumnIcon(view, id) {
  const t = view.t;
  if (!canAddColumn(view)) { view.ctx.notify('info', t(view.demo ? 'board.demo' : 'board.addColumn.denied')); return false; }
  const c = column(view, id);
  if (!c) return false;
  const ref = await view.ctx.pickIcon?.(c.icon ?? '', { title: t('board.column.icon'), category: 'columns' });
  if (ref == null) return false;
  // '' (no icon) = the default of the name again: every column keeps an icon
  return patchColumn(view, id, { icon: ref || null }, t('board.column.iconOp', { name: c.name }));
}

/** The form popup with name + icon. */
export async function editColumn(view, id) {
  const t = view.t;
  if (!canAddColumn(view)) { view.ctx.notify('info', t(view.demo ? 'board.demo' : 'board.addColumn.denied')); return false; }
  const c = column(view, id);
  if (!c) return false;
  const result = await view.ctx.popups.open('form', {
    title: t('board.column.editTitle'), icon: 'columns', submitLabel: t('common.ok'),
    fields: [
      { name: 'name', type: 'text', label: t('board.addColumn.name'), value: c.name, required: true, maxLength: 100 },
      { name: 'icon', type: 'icon', label: t('board.column.icon'), value: c.icon ?? '', category: 'columns', suggest: 'columnIcon', suggestFrom: 'name', hint: t('board.column.iconHint') },
    ],
  });
  const v = result?.values;
  if (!v?.name?.trim()) return false;
  const patch = {};
  if (v.name.trim() !== c.name) patch.name = v.name.trim();
  if ((v.icon || null) !== (c.icon || null)) patch.icon = v.icon || null;
  if (!Object.keys(patch).length) return false;
  return patchColumn(view, id, patch, t('board.column.editOp', { name: patch.name ?? c.name }));
}

// ───────────────────────── header menu and keys

export function openColumnMenu(view, id, x, y) {
  const t = view.t;
  const app = view.ctx.app;
  const c = (view.layout?.columns ?? []).find((col) => col.id === id) ?? column(view, id);
  if (!app?.showMenu || !c) return undefined;
  const handlers = {};
  const item = (key, label, glyph, run, extra = {}) => { handlers[`custom:${key}`] = run; return { id: `custom:${key}`, label, icon: glyph, ...extra }; };
  const can = canAddColumn(view);
  const shown = visible(view).map((col) => col.id);
  const i = shown.indexOf(id);
  const items = [];
  if (!view.demo) items.push(item('colCreate', t('board.column.create'), 'plus', () => view.createIssue({ columnId: id })), { separator: true });
  items.push(
    item('colIcon', t('board.column.changeIcon'), 'iconInsert', () => changeColumnIcon(view, id), { disabled: !can }),
    item('colEdit', t('board.column.edit'), 'edit', () => editColumn(view, id), { disabled: !can }),
    { separator: true },
    item('colLeft', t('board.columnMove.left'), 'chevronLeft', () => moveColumn(view, id, 'left'), { disabled: !can || i <= 0, shortcut: 'Ctrl+Shift+←' }),
    item('colRight', t('board.columnMove.right'), 'chevronRight', () => moveColumn(view, id, 'right'), { disabled: !can || i < 0 || i >= shown.length - 1, shortcut: 'Ctrl+Shift+→' }),
    item('colFirst', t('board.columnMove.first'), 'arrowStart', () => moveColumn(view, id, 'first'), { disabled: !can || i <= 0 }),
    item('colLast', t('board.columnMove.last'), 'arrowEnd', () => moveColumn(view, id, 'last'), { disabled: !can || i < 0 || i >= shown.length - 1 }),
    { separator: true },
    item('colToggle', t(c.collapsed ? 'board.column.expand' : 'board.column.collapse'), c.collapsed ? 'chevronRight' : 'chevronDown', () => view.toggleColumn(id)),
    item('colAdd', t('board.addColumn.title'), 'columns', () => openAddColumn(view), { disabled: !can }),
  );
  return app.showMenu(items, anchorOf(view, x, y), 'context', { handlers, header: { icon: 'columns', title: c.name } });
}

/** Keys on a focused column header. → true when handled */
export function columnKey(view, event) {
  const head = event.target.closest?.('.bv-col-head[data-col]');
  if (!head || event.target.closest('button') && event.target !== head) return false;
  const id = head.dataset.col;
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault(); event.stopPropagation();
    moveColumn(view, id, event.key === 'ArrowLeft' ? 'left' : 'right');
    return true;
  }
  if (mod && event.shiftKey && (event.key === 'Home' || event.key === 'End')) {
    event.preventDefault(); event.stopPropagation();
    moveColumn(view, id, event.key === 'Home' ? 'first' : 'last');
    return true;
  }
  if (!mod && !event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    const heads = [...view.boardEl.querySelectorAll('.bv-heads .bv-col-head[data-col]')];
    const next = heads[heads.indexOf(head) + (event.key === 'ArrowLeft' ? -1 : 1)];
    if (next) { event.preventDefault(); next.focus(); }
    return true;
  }
  if (event.key === 'F2' || event.key === 'Enter') { event.preventDefault(); editColumn(view, id); return true; }
  if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
    event.preventDefault();
    const r = head.getBoundingClientRect();
    openColumnMenu(view, id, r.left + 16, r.top + 16);
    return true;
  }
  return false;
}

// ───────────────────────── header drag

/**
 * Pointer drag of column headers (left/right). Starts after 6 px on a header, not on its buttons; cards have
 * their own drag (dnd.js) and never start this one. A vertical bar shows where the column will go.
 */
export class ColumnDrag {
  constructor(view) {
    this.view = view;
    this.board = view.boardEl;
    this.state = null;
    this.onDown = (e) => this.down(e);
    this.onMove = (e) => this.move(e);
    this.onUp = (e) => this.up(e);
    this.onKey = (e) => { if (e.key === 'Escape' && this.state) { e.preventDefault(); this.cancel(); } };
    this.board.addEventListener('pointerdown', this.onDown);
  }

  get active() { return Boolean(this.state?.started); }

  down(e) {
    if (e.button !== 0 || this.state) return;
    const head = e.target.closest('.bv-heads .bv-col-head[data-col]');
    if (!head || e.target.closest('button, input, .mb-card')) return;
    if (!canAddColumn(this.view)) return;
    this.state = { id: head.dataset.col, head, x0: e.clientX, y0: e.clientY, pointerId: e.pointerId, started: false, before: undefined };
    window.addEventListener('pointermove', this.onMove, true);
    window.addEventListener('pointerup', this.onUp, true);
    window.addEventListener('pointercancel', this.onUp, true);
    window.addEventListener('keydown', this.onKey, true);
  }

  heads() { return [...this.board.querySelectorAll('.bv-heads .bv-col-head[data-col]')]; }

  move(e) {
    const s = this.state;
    if (!s) return;
    if (!s.started) {
      if (Math.abs(e.clientX - s.x0) < 6 && Math.abs(e.clientY - s.y0) < 6) return;
      s.started = true;
      s.head.classList.add('bv-col-dragging');
      this.board.classList.add('bv-col-drag');
      s.bar = this.board.ownerDocument.createElement('div');
      s.bar.className = 'bv-col-drop';
      s.bar.setAttribute('aria-hidden', 'true');
      this.board.appendChild(s.bar);
      try { s.head.setPointerCapture?.(s.pointerId); } catch { /* not captured */ }
    }
    e.preventDefault();
    // the gap nearest the pointer: before the first header whose middle is right of it
    const heads = this.heads();
    let before = null;
    for (const h of heads) { const r = h.getBoundingClientRect(); if (e.clientX < r.left + r.width / 2) { before = h.dataset.col; break; } }
    s.before = before;
    const boardRect = this.board.getBoundingClientRect();
    const ref = before ? heads.find((h) => h.dataset.col === before) : heads.at(-1);
    const r = ref.getBoundingClientRect();
    const x = before ? r.left - 5 : r.right + 5;
    s.bar.style.left = `${x - boardRect.left - 2}px`;
    s.bar.style.top = `${r.top - boardRect.top}px`;
    s.bar.style.height = `${Math.max(40, this.board.scrollHeight - (r.top - boardRect.top) - 8)}px`;
    // edge auto-scroll
    const sc = this.view.scroller.getBoundingClientRect();
    if (e.clientX > sc.right - 40) this.view.scroller.scrollLeft += 18;
    else if (e.clientX < sc.left + 40) this.view.scroller.scrollLeft -= 18;
  }

  up(e) {
    const s = this.state;
    this.cleanup();
    if (!s?.started) return;
    e.preventDefault();
    // a click right after a drag must not toggle anything
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    if (s.before === undefined || s.before === s.id) return;
    moveColumn(this.view, s.id, { before: s.before });
  }

  cancel() { this.cleanup(); }

  cleanup() {
    const s = this.state;
    this.state = null;
    window.removeEventListener('pointermove', this.onMove, true);
    window.removeEventListener('pointerup', this.onUp, true);
    window.removeEventListener('pointercancel', this.onUp, true);
    window.removeEventListener('keydown', this.onKey, true);
    if (!s) return;
    s.bar?.remove();
    s.head.classList.remove('bv-col-dragging');
    this.board.classList.remove('bv-col-drag');
    if (s.started && this.view.pendingRender) setTimeout(() => { if (this.view.pendingRender) this.view.render(); }, 0);
  }

  destroy() { this.cleanup(); this.board.removeEventListener('pointerdown', this.onDown); }
}
