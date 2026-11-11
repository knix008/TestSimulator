// The backlog / search view: registers itself as 'backlog' (views/registry.js). The view lives in view.js.
import { registerView } from '../registry.js';
import { BacklogView } from './view.js';
import { createBacklogSidebar } from './sidebar.js';
import './texts.js';
import './backlog.css';

let current = null;
// The epics, versions and saved filters: the lower part of the left panel (sidebar.js), same instance.
const side = createBacklogSidebar(() => current);

registerView('backlog', {
  mount(host, ctx) { current?.destroy(); current = new BacklogView(host, ctx, { onSideChange: side.refresh }); side.refresh(); },
  update(ctx) { current?.update(ctx); },
  unmount() { current?.destroy(); current = null; side.refresh(); },
  sidebar: side.sidebar,
  commands: {
    // Edit › Find (Ctrl+F): the search box of the current mode.
    find: { icon: 'search', label: 'action.find', run: () => current?.focusSearch() },
    // Edit › Create issue (C): the full form popup (the "+ Create issue" row under the list is the quick way).
    createIssue: { icon: 'plus', label: 'action.createIssue', run: () => current?.createWithForm() },
  },
});

export const backlogView = () => current;
