// Where the workspace's views plug in. The shell (app.js) owns the window: toolbar, sidebar, the
// centre host (#workspace), the issue detail panel (#detail), the bottom panel and the status bar.
// What is shown inside #workspace and #detail comes from views registered here; until a view is
// registered the shell shows a placeholder.
//
// A view: {
//   mount(host, ctx)       draws into `host` (an element the view owns until unmount)
//   update?(ctx)           the context changed (another board, a live event, settings)
//   unmount?()             the shell is about to show something else
//   commands?: { id: { icon, label, run(ctx), enabled?(ctx), checked?(ctx), key? } }   extra commands for menus
// }
// ctx = { api, live, workspace, settings, t, icon, renderIconRef, notify, showError, history, openIssue(id), popups, app }
//
// View ids the shell knows: 'board', 'backlog', 'reports', 'projectSettings' (the centre) and 'detail' (right panel).

const views = new Map();
const listeners = new Set();

export const VIEW_IDS = ['board', 'backlog', 'reports', 'projectSettings', 'detail'];

export function registerView(id, view) {
  if (!view || typeof view.mount !== 'function') throw new TypeError(`view ${id}: mount(host, ctx) is required`);
  views.set(id, view);
  for (const listener of listeners) listener(id);
}

export const getView = (id) => views.get(id) ?? null;
export const hasView = (id) => views.has(id);
export const viewIds = () => [...views.keys()];

/** The shell listens so a view registered late (lazy import) shows at once. */
export function onViewRegistered(listener) { listeners.add(listener); return () => listeners.delete(listener); }
