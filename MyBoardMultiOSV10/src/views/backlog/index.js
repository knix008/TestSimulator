// The backlog / search view: registers itself as 'backlog' (views/registry.js). The view lives in view.js.
import { registerView } from '../registry.js';
import { BacklogView } from './view.js';
import './texts.js';
import './backlog.css';

let current = null;

registerView('backlog', {
  mount(host, ctx) { current?.destroy(); current = new BacklogView(host, ctx); },
  update(ctx) { current?.update(ctx); },
  unmount() { current?.destroy(); current = null; },
  commands: {
    // Edit › Find (Ctrl+F): the search box of the current mode.
    find: { icon: 'search', label: 'action.find', run: () => current?.focusSearch() },
    // Edit › Create issue (C): the inline row under the list.
    createIssue: { icon: 'plus', label: 'action.createIssue', run: () => current?.openCreate() },
  },
});

export const backlogView = () => current;
