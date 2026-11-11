// "Add column" in the board's toolbar, right of "show older done" (project admins and the board's owner): the
// shell's `form` popup asks for the name, the icon (the picker opens on the column icon category; until one is
// chosen it follows the typed name, core/columnicons.js), where the column goes (default: first) and whether it
// gets a status of its own. With a new status
// (the default) the column is usable at once: every workflow of the project gets a "from any status"
// transition into it, so cards can be dragged there. Undo removes the column and the status it made.
import { errorMessage } from '../shared/index.js';

// The "first" choice of the position field (an empty value would read as nothing chosen).
const FIRST = '__first';
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
  // Default place: first (leftmost) — the rightmost column stays the reports' reference column.
  const defaultAfter = FIRST;
  const fields = [
    { name: 'name', type: 'text', label: t('board.addColumn.name'), value: '', required: true, placeholder: t('board.addColumn.namePlaceholder'), maxLength: 100 },
    { name: 'icon', type: 'icon', label: t('board.addColumn.icon'), value: '', category: 'columns', suggest: 'columnIcon', suggestFrom: 'name', suggestCategory: projectId ? 'category' : undefined, hint: t('board.addColumn.iconHint') },
    { name: 'after', type: 'select', label: t('board.addColumn.position'), value: defaultAfter, glyph: 'columns',
      options: [{ value: FIRST, label: t('board.addColumn.first'), glyph: 'chevronLeft' }, ...columns.map((c) => ({ value: c.id, label: t('board.addColumn.after', { name: c.name }), glyph: 'columns' }))] },
  ];
  if (projectId) {
    fields.push(
      { name: 'withStatus', type: 'checkbox', label: t('board.addColumn.withStatus'), value: true, hint: t('board.addColumn.withStatusHint') },
      { name: 'category', type: 'select', label: t('board.addColumn.category'), value: 'inprogress', glyph: 'flag', when: { withStatus: true },
        options: ['todo', 'inprogress', 'done'].map((c) => ({ value: c, label: t(`board.addColumn.cat.${c}`), glyph: CATEGORY_GLYPH[c] })) },
    );
  }
  const result = await view.ctx.popups.open('form', { title: t('board.addColumn.title'), icon: 'columns', intro: t('board.addColumn.intro'), submitLabel: t('board.addColumn.submit'), fields });
  const v = result?.values;
  if (!v?.name?.trim()) return null;
  const name = v.name.trim();
  const api = view.api;
  const made = { columnId: null, statusId: null };

  const create = async () => {
    if (projectId && v.withStatus) {
      let status = await api.post(`/projects/${encodeURIComponent(projectId)}/statuses`, { name, category: v.category || 'inprogress' });
      status = status?.status ?? status;
      made.statusId = status.id;
      // Open workflows got a transition from the core already; the others get one "from any status" here.
      const workflows = await api.get(`/projects/${encodeURIComponent(projectId)}/workflows`);
      for (const wf of [].concat(workflows?.items ?? workflows ?? [])) {
        const transitions = await api.get(`/projects/${encodeURIComponent(projectId)}/transitions`, { workflowId: wf.id });
        const list = [].concat(transitions?.items ?? transitions ?? []);
        if (!list.some((tr) => (tr.toStatusId ?? tr.to_status_id) === status.id && (tr.fromStatusId ?? tr.from_status_id) == null)) {
          await api.post(`/projects/${encodeURIComponent(projectId)}/transitions`, { workflowId: wf.id, name, fromStatusId: null, toStatusId: status.id });
        }
      }
    }
    let column = await api.post(`/boards/${encodeURIComponent(board.id)}/columns`, { name, icon: v.icon || null, statusIds: made.statusId ? [made.statusId] : [] });
    column = column?.column ?? column;
    made.columnId = column.id;
    const ids = columns.map((c) => c.id);
    const at = v.after && v.after !== FIRST ? ids.indexOf(v.after) + 1 : 0;
    ids.splice(at < 0 ? ids.length : at, 0, column.id);
    await api.post(`/boards/${encodeURIComponent(board.id)}/columns/order`, { ids });
  };
  const remove = async () => {
    if (made.columnId) await api.del(`/boards/${encodeURIComponent(board.id)}/columns/${encodeURIComponent(made.columnId)}`);
    if (made.statusId) await api.del(`/projects/${encodeURIComponent(projectId)}/statuses/${encodeURIComponent(made.statusId)}`);
    made.columnId = null;
    made.statusId = null;
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
