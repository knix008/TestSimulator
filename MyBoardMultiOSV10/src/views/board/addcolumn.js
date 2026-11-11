// "Add column" (the main toolbar and the board's tool row; project admins and the board's owner): the shell's `form`
// popup asks for the name, the icon (the picker opens on the column icon category; until one is chosen it follows
// the typed name, core/columnicons.js), where the column goes (default: first) and its status — a new one the user
// names (default: the column name) with a category, a status no column shows yet, or none. The workflow follows
// the place: in every workflow of the project the statuses of the column before ⇄ the new status ⇄ the statuses of
// the column after get transitions, and the status order puts it after the column before. Undo removes what it made.
import { errorMessage } from '../shared/index.js';

// The "first" choice of the position field (an empty value would read as nothing chosen).
const FIRST = '__first';
// The status choices besides an existing status: a new one, or none (map one later in Project settings › Board).
const NEW = '__new';
const NONE = '__none';
const CATEGORY_GLYPH = { todo: 'list', inprogress: 'refresh', done: 'check' };

/** Whether this user may change the board's columns (the core still checks; this only hides the button). */
export function canAddColumn(view) {
  if (view.demo || !view.data) return false;
  const user = view.ctx.app?.state?.core?.info?.user ?? null;
  const project = view.ctx.workspace?.project ?? null;
  const board = view.data.board ?? view.ctx.workspace?.board ?? null;
  if (user?.role === 'admin') return true;
  if (project?.myRole === 'admin') return true;
  // No accounts (single-user desktop): the local user configures everything.
  if (!user && !view.ctx.app?.state?.core?.info?.needsLogin) return true;
  return Boolean(board && !board.projectId && user && board.createdBy === user.id);
}

export async function openAddColumn(view) {
  const t = view.t;
  if (!canAddColumn(view)) { view.ctx.notify('info', t(view.demo ? 'board.demo' : 'board.addColumn.denied')); return null; }
  const board = view.data.board ?? view.ctx.workspace?.board;
  const projectId = board?.projectId ?? view.ctx.workspace?.project?.id ?? null;
  const columns = view.data.columns ?? [];
  // Statuses not shown in any column of this board yet: they can become the new column's status.
  const mapped = new Set(columns.flatMap((c) => c.statusIds ?? []));
  const free = (view.data.statuses ?? []).filter((s) => !mapped.has(s.id) && (!projectId || !s.projectId || s.projectId === projectId));
  const fields = [
    { name: 'name', type: 'text', label: t('board.addColumn.name'), value: '', required: true, placeholder: t('board.addColumn.namePlaceholder'), maxLength: 100 },
    { name: 'icon', type: 'icon', label: t('board.addColumn.icon'), value: '', category: 'columns', suggest: 'columnIcon', suggestFrom: 'name', suggestCategory: projectId ? 'category' : undefined, hint: t('board.addColumn.iconHint') },
    // Default place: first (leftmost) — the rightmost column stays the reports' reference column.
    { name: 'after', type: 'select', label: t('board.addColumn.position'), value: FIRST, glyph: 'columns', hint: projectId ? t('board.addColumn.flowHint') : '',
      options: [{ value: FIRST, label: t('board.addColumn.first'), glyph: 'chevronLeft' }, ...columns.map((c) => ({ value: c.id, label: t('board.addColumn.after', { name: c.name }), iconRef: c.icon || undefined, glyph: 'columns' }))] },
  ];
  if (projectId) {
    fields.push(
      { name: 'status', type: 'select', label: t('board.addColumn.status'), value: NEW, glyph: 'flag',
        options: [
          { value: NEW, label: t('board.addColumn.statusNew'), glyph: 'plus' },
          ...free.map((s) => ({ value: s.id, label: t('board.addColumn.statusExisting', { name: s.name }), glyph: CATEGORY_GLYPH[s.category] ?? 'flag' })),
          { value: NONE, label: t('board.addColumn.statusNone'), glyph: 'close' },
        ] },
      { name: 'statusName', type: 'text', label: t('board.addColumn.statusName'), value: '', placeholder: t('board.addColumn.statusNamePlaceholder'), maxLength: 100, when: { status: NEW } },
      { name: 'category', type: 'select', label: t('board.addColumn.category'), value: 'inprogress', glyph: 'flag', when: { status: NEW },
        options: ['todo', 'inprogress', 'done'].map((c) => ({ value: c, label: t(`board.addColumn.cat.${c}`), glyph: CATEGORY_GLYPH[c] })) },
    );
  }
  const result = await view.ctx.popups.open('form', { title: t('board.addColumn.title'), icon: 'columns', intro: t('board.addColumn.intro'), submitLabel: t('board.addColumn.submit'), fields });
  const v = result?.values;
  if (!v?.name?.trim()) return null;
  const name = v.name.trim();
  const api = view.api;
  const pid = encodeURIComponent(projectId ?? '');
  const bid = encodeURIComponent(board.id);
  const list = (x) => [].concat(x?.items ?? x ?? []);
  // What was made, so that undo (and a half-done failure) takes exactly that back.
  const made = { columnId: null, statusId: null, newStatus: false, transitionIds: [], statusOrder: null };

  const create = async () => {
    const ids = columns.map((c) => c.id);
    const at = v.after && v.after !== FIRST ? ids.indexOf(v.after) + 1 : 0;
    const prev = at > 0 ? columns[at - 1] : null;      // the column the new one follows
    const next = columns[at] ?? null;                   // and the one it comes before
    if (projectId && v.status && v.status !== NONE) {
      if (v.status === NEW) {
        let status = await api.post(`/projects/${pid}/statuses`, { name: (v.statusName || '').trim() || name, category: v.category || 'inprogress' });
        status = status?.status ?? status;
        made.statusId = status.id;
        made.newStatus = true;
      } else {
        made.statusId = v.status;
      }
      // The workflow follows the place: (statuses of the column before) → new status → (statuses of the column after),
      // and back again, in every workflow of the project — "after Backlog" means Backlog ⇄ new ⇄ the next column.
      const before = prev?.statusIds ?? [];
      const after = next?.statusIds ?? [];
      const statusName = (id) => (view.data.statuses ?? []).find((s) => s.id === id)?.name ?? '';
      const ownName = made.newStatus ? ((v.statusName || '').trim() || name) : statusName(made.statusId);
      for (const wf of list(await api.get(`/projects/${pid}/workflows`))) {
        const existing = list(await api.get(`/projects/${pid}/transitions`, { workflowId: wf.id }));
        const has = (from, to) => existing.some((tr) => (tr.fromStatusId ?? tr.from_status_id ?? null) === from && (tr.toStatusId ?? tr.to_status_id) === to);
        const pairs = [...before.flatMap((p) => [[p, made.statusId], [made.statusId, p]]), ...after.flatMap((n) => [[made.statusId, n], [n, made.statusId]])];
        for (const [from, to] of pairs) {
          if (from === to || has(from, to)) continue;
          let tr = await api.post(`/projects/${pid}/transitions`, { workflowId: wf.id, name: to === made.statusId ? ownName : statusName(to), fromStatusId: from, toStatusId: to });
          tr = tr?.transition ?? tr;
          made.transitionIds.push(tr.id);
          existing.push({ fromStatusId: from, toStatusId: to });
        }
      }
      // The status order follows the board too: right after the column before (or first).
      const statuses = list(await api.get(`/projects/${pid}/statuses`));
      made.statusOrder = statuses.map((s) => s.id);
      const order = made.statusOrder.filter((id) => id !== made.statusId);
      const anchor = before.length ? Math.max(...before.map((id) => order.indexOf(id))) + 1 : after.length ? Math.max(0, Math.min(...after.map((id) => order.indexOf(id)).filter((i) => i >= 0))) : order.length;
      order.splice(Math.max(0, anchor), 0, made.statusId);
      await api.post(`/projects/${pid}/statuses/order`, { ids: order });
    }
    let column = await api.post(`/boards/${bid}/columns`, { name, icon: v.icon || null, statusIds: made.statusId ? [made.statusId] : [] });
    column = column?.column ?? column;
    made.columnId = column.id;
    ids.splice(at, 0, column.id);
    await api.post(`/boards/${bid}/columns/order`, { ids });
  };
  const remove = async () => {
    if (made.columnId) await api.del(`/boards/${bid}/columns/${encodeURIComponent(made.columnId)}`);
    for (const id of made.transitionIds.splice(0)) await api.del(`/projects/${pid}/transitions/${encodeURIComponent(id)}`).catch(() => {});
    if (made.newStatus && made.statusId) await api.del(`/projects/${pid}/statuses/${encodeURIComponent(made.statusId)}`);
    else if (made.statusOrder) await api.post(`/projects/${pid}/statuses/order`, { ids: made.statusOrder }).catch(() => {});
    Object.assign(made, { columnId: null, statusId: null, newStatus: false, statusOrder: null });
  };

  try {
    await create();
  } catch (error) {
    // Half done (status made, column refused …): take back what was made.
    await remove().catch(() => {});
    view.ctx.notify('error', `${t('board.addColumn.failed')}: ${errorMessage(error, t)}`);
    return null;
  }
  view.ctx.notify('success', t('board.addColumn.done', { name }));
  view.ctx.history.record({
    label: t('board.addColumn.op', { name }),
    undo: async () => { await remove(); await view.load({ quiet: true }); },
    redo: async () => { await create(); await view.load({ quiet: true }); },
  });
  announce('board.updated', board.id);
  await view.load({ quiet: true });
  return made.columnId;
}

/** Other views of this window (project settings) hear about the change; the live channel drops own events. */
function announce(type, id) {
  try { window.dispatchEvent(new CustomEvent('myboard:event', { detail: { type, id, local: true } })); } catch { /* no window */ }
}
